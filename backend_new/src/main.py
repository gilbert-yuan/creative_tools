from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query, Path
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
import uvicorn
import os
import json
import uuid
import subprocess
import shutil
import asyncio
from pathlib import Path
from datetime import datetime
from typing import List, Optional, Dict, Any
import re

from .models import Job, Scene, Project, StoryboardScene, GenerationHistory, CompositeVideo, Character, ProjectCharacter
from .db import get_db, engine, Base
from .cloudflare import upload_to_cloudflare_r2
from .logger import setup_logger
from .aliyun import call_aliyun_model, call_aliyun_image_model

# 初始化数据库
Base.metadata.create_all(bind=engine)

# 设置日志
logger = setup_logger()

app = FastAPI(title="Video Analysis API", version="1.0.0")

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 在生产环境中应该设置具体的域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 响应模型
class VideoInfo:
    def __init__(self, duration: float, width: int, height: int, fps: float):
        self.duration = duration
        self.width = width
        self.height = height
        self.fps = fps

class SceneResponse:
    def __init__(self, index: int, start_time: float, end_time: float, duration: float, 
                 start_timestamp: str, end_timestamp: str, video_url: str, frame_count: int):
        self.index = index
        self.start_time = start_time
        self.end_time = end_time
        self.duration = duration
        self.start_timestamp = start_timestamp
        self.end_timestamp = end_timestamp
        self.video_url = video_url
        self.frame_count = frame_count

class VirtualCutResponse:
    def __init__(self, job_id: str, video_info: VideoInfo, total_scenes: int, 
                 scenes: List[SceneResponse], video_url: str, youtube_url: Optional[str], 
                 original_filename: str):
        self.job_id = job_id
        self.video_info = video_info
        self.total_scenes = total_scenes
        self.scenes = scenes
        self.video_url = video_url
        self.youtube_url = youtube_url
        self.original_filename = original_filename

class YouTubeDownloadRequest:
    def __init__(self, url: str):
        self.url = url

class ProjectImport:
    def __init__(self, title: str, script: str, global_image_prompt: Optional[str] = None, 
                 comic_global_image_prompt: Optional[str] = None, global_video_prompt: Optional[str] = None, 
                 project_type: Optional[str] = "video", characters: Optional[List[Dict[str, Any]]] = None, 
                 scenes: List[Dict[str, Any]] = None):
        self.title = title
        self.script = script
        self.global_image_prompt = global_image_prompt
        self.comic_global_image_prompt = comic_global_image_prompt
        self.global_video_prompt = global_video_prompt
        self.project_type = project_type
        self.characters = characters
        self.scenes = scenes

class CharacterImport:
    def __init__(self, name: str, category: Optional[str] = None, tags: Optional[str] = None, prompt: str = ""):
        self.name = name
        self.category = category
        self.tags = tags
        self.prompt = prompt

class SceneImport:
    def __init__(self, id: int, duration: Optional[Any] = None, first_frame_prompt: str = "", 
                 video_prompt: Optional[str] = None):
        self.id = id
        self.duration = duration
        self.first_frame_prompt = first_frame_prompt
        self.video_prompt = video_prompt

class UpdatePromptsRequest:
    def __init__(self, first_frame_prompt: Optional[str] = None, video_prompt: Optional[str] = None, 
                 duration: Optional[float] = None):
        self.first_frame_prompt = first_frame_prompt
        self.video_prompt = video_prompt
        self.duration = duration

class UpdateScriptRequest:
    def __init__(self, script: str):
        self.script = script

class AnalyzeCharacterRequest:
    def __init__(self, prompt: str):
        self.prompt = prompt

class AnalyzeCharacterResponse:
    def __init__(self, name: str, category: str, tags: List[str]):
        self.name = name
        self.category = category
        self.tags = tags

class GptNanoRequest:
    def __init__(self, model: str, input: str, temperature: float = 0.7, max_tokens: int = 1000):
        self.model = model
        self.input = input
        self.temperature = temperature
        self.max_tokens = max_tokens

class AliyunModelRequest:
    def __init__(self, model: str, input: str, temperature: float = 0.7, max_tokens: int = 1000):
        self.model = model
        self.input = input
        self.temperature = temperature
        self.max_tokens = max_tokens

class AliyunImageRequest:
    def __init__(self, model: str, prompt: str, size: str = "1024x1024"):
        self.model = model
        self.prompt = prompt
        self.size = size

class RevealFileRequest:
    def __init__(self, file_path: str):
        self.file_path = file_path

# 工具函数
def format_timestamp(seconds: float) -> str:
    hours = int(seconds / 3600)
    minutes = int((seconds % 3600) / 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"

def get_video_info(video_path: str) -> VideoInfo:
    try:
        cmd = [
            "ffprobe",
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "format=duration:stream=width,height,r_frame_rate",
            "-of", "json",
            video_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        data = json.loads(result.stdout)
        
        duration = float(data.get("format", {}).get("duration", "0"))
        stream = data.get("streams", [{}])[0]
        width = int(stream.get("width", 0))
        height = int(stream.get("height", 0))
        
        fps_str = stream.get("r_frame_rate", "30/1")
        fps_parts = fps_str.split("/")
        if len(fps_parts) == 2:
            fps = float(fps_parts[0]) / float(fps_parts[1])
        else:
            fps = float(fps_parts[0])
        
        return VideoInfo(duration=duration, width=width, height=height, fps=fps)
    except Exception as e:
        logger.error(f"Error getting video info: {e}")
        return VideoInfo(duration=0.0, width=0, height=0, fps=30.0)

def get_video_duration(video_path: str) -> float:
    try:
        cmd = [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        return float(result.stdout.strip())
    except Exception as e:
        logger.error(f"Error getting video duration: {e}")
        return 0.0

def detect_scenes(video_path: str) -> List[float]:
    try:
        threshold = 0.3
        cmd = [
            "ffmpeg",
            "-i", video_path,
            "-filter:v", f"select='gt(scene,{threshold})',showinfo",
            "-f", "null",
            "-"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        scene_times = [0.0]
        for line in result.stderr.split('\n'):
            if "pts_time:" in line:
                match = re.search(r"pts_time:(\d+\.\d+)", line)
                if match:
                    time = float(match.group(1))
                    scene_times.append(time)
        
        # 添加视频结束时间
        duration = get_video_duration(video_path)
        scene_times.append(duration)
        
        # 去重排序
        scene_times = sorted(list(set(scene_times)))
        
        # 限制最多50个场景
        if len(scene_times) > 51:
            scene_times = scene_times[:51]
        
        return scene_times
    except Exception as e:
        logger.error(f"Error detecting scenes: {e}")
        return [0.0, get_video_duration(video_path)]

def parse_duration(value: Any) -> Optional[float]:
    try:
        if isinstance(value, (int, float)):
            return float(value)
        elif isinstance(value, str):
            # 移除中文"秒"字和英文"s/S"
            cleaned = value.replace("秒", "").replace("s", "").replace("S", "").strip()
            return float(cleaned)
        return None
    except:
        return None

# API 端点
@app.post("/api/virtual-cut")
async def virtual_cut(file: UploadFile = File(...)):
    try:
        job_id = str(uuid.uuid4())
        analysis_dir = Path(f"data/analysis/{job_id}")
        upload_dir = analysis_dir / "videos"
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        # 保存上传的视频文件
        video_path = upload_dir / file.filename
        with open(video_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        original_filename = file.filename
        file_size = video_path.stat().st_size
        
        # 创建 Job 记录
        db = next(get_db())
        job = Job(
            id=job_id,
            original_filename=original_filename,
            file_size_bytes=file_size,
            youtube_url=None,
            status="processing"
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        
        logger.info(f"Job {job_id} created successfully")
        
        # 获取视频信息
        video_info = get_video_info(str(video_path))
        
        # 检测场景
        scene_times = detect_scenes(str(video_path))
        
        # 构建场景列表并保存到数据库
        scenes = []
        for i in range(len(scene_times) - 1):
            start = scene_times[i]
            end = scene_times[i + 1]
            duration = end - start
            
            if duration > 0.1:
                scene_index = len(scenes) + 1
                frame_count = int(duration * video_info.fps)
                
                # 保存场景到数据库
                scene = Scene(
                    job_id=job_id,
                    scene_index=scene_index,
                    start_time=start,
                    end_time=end,
                    duration=duration,
                    start_timestamp=format_timestamp(start),
                    end_timestamp=format_timestamp(end),
                    frame_count=frame_count
                )
                db.add(scene)
                
                scenes.append(SceneResponse(
                    index=scene_index,
                    start_time=start,
                    end_time=end,
                    duration=duration,
                    start_timestamp=format_timestamp(start),
                    end_timestamp=format_timestamp(end),
                    video_url=f"/data/analysis/{job_id}/videos/{original_filename}",
                    frame_count=frame_count
                ))
        
        db.commit()
        
        # 更新 Job 状态
        job.status = "completed"
        job.duration_seconds = video_info.duration
        db.commit()
        
        # 构建响应
        video_url = f"/data/analysis/{job_id}/videos/{original_filename}"
        response = VirtualCutResponse(
            job_id=job_id,
            video_info=video_info,
            total_scenes=len(scenes),
            scenes=scenes,
            video_url=video_url,
            youtube_url=None,
            original_filename=original_filename
        )
        
        # 保存结果到文件
        result_file = analysis_dir / "result.json"
        with open(result_file, "w", encoding="utf-8") as f:
            json.dump(response.__dict__, f, indent=2, default=lambda o: o.__dict__)
        
        return response
    except Exception as e:
        logger.error(f"Error in virtual_cut: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/youtube-virtual-cut")
async def youtube_virtual_cut(request: Dict[str, str]):
    try:
        youtube_url = request.get("url")
        if not youtube_url:
            raise HTTPException(status_code=400, detail="Missing YouTube URL")
        
        # 验证 YouTube URL
        if "youtube.com" not in youtube_url and "youtu.be" not in youtube_url:
            raise HTTPException(status_code=400, detail="Invalid YouTube link")
        
        job_id = str(uuid.uuid4())
        analysis_dir = Path(f"data/analysis/{job_id}")
        upload_dir = analysis_dir / "videos"
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"Starting to download YouTube video: {youtube_url}")
        
        # 使用 yt-dlp 下载视频
        output_template = str(upload_dir / "video.%(ext)s")
        cmd = [
            "yt-dlp",
            "-f", "best[ext=mp4]/best",
            "--no-playlist",
            "--no-check-certificate",
            "-o", output_template,
            youtube_url
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            logger.error(f"YouTube download failed: {result.stderr}")
            raise HTTPException(status_code=500, detail=f"YouTube video download failed: {result.stderr}")
        
        # 查找下载的视频文件
        video_files = list(upload_dir.glob("*.*"))
        video_files = [f for f in video_files if f.suffix.lower() in [".mp4", ".webm", ".mkv", ".mov"]]
        
        if not video_files:
            raise HTTPException(status_code=500, detail="Video download successful but no video file found")
        
        video_path = video_files[0]
        original_filename = video_path.name
        file_size = video_path.stat().st_size
        
        logger.info(f"YouTube video downloaded successfully: {original_filename} ({file_size} bytes)")
        
        # 创建 Job 记录
        db = next(get_db())
        job = Job(
            id=job_id,
            original_filename=original_filename,
            file_size_bytes=file_size,
            youtube_url=youtube_url,
            status="processing"
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        
        logger.info(f"Job {job_id} created successfully")
        
        # 获取视频信息
        video_info = get_video_info(str(video_path))
        
        # 检测场景
        scene_times = detect_scenes(str(video_path))
        
        # 构建场景列表并保存到数据库
        scenes = []
        for i in range(len(scene_times) - 1):
            start = scene_times[i]
            end = scene_times[i + 1]
            duration = end - start
            
            if duration > 0.1:
                scene_index = len(scenes) + 1
                frame_count = int(duration * video_info.fps)
                
                # 保存场景到数据库
                scene = Scene(
                    job_id=job_id,
                    scene_index=scene_index,
                    start_time=start,
                    end_time=end,
                    duration=duration,
                    start_timestamp=format_timestamp(start),
                    end_timestamp=format_timestamp(end),
                    frame_count=frame_count
                )
                db.add(scene)
                
                scenes.append(SceneResponse(
                    index=scene_index,
                    start_time=start,
                    end_time=end,
                    duration=duration,
                    start_timestamp=format_timestamp(start),
                    end_timestamp=format_timestamp(end),
                    video_url=f"/data/analysis/{job_id}/videos/{original_filename}",
                    frame_count=frame_count
                ))
        
        db.commit()
        
        # 更新 Job 状态
        job.status = "completed"
        job.duration_seconds = video_info.duration
        db.commit()
        
        # 构建响应
        video_url = f"/data/analysis/{job_id}/videos/{original_filename}"
        response = VirtualCutResponse(
            job_id=job_id,
            video_info=video_info,
            total_scenes=len(scenes),
            scenes=scenes,
            video_url=video_url,
            youtube_url=youtube_url,
            original_filename=original_filename
        )
        
        # 保存结果到文件
        result_file = analysis_dir / "result.json"
        with open(result_file, "w", encoding="utf-8") as f:
            json.dump(response.__dict__, f, indent=2, default=lambda o: o.__dict__)
        
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in youtube_virtual_cut: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/jobs")
async def get_jobs(limit: int = Query(20), offset: int = Query(0)):
    try:
        db = next(get_db())
        jobs = db.query(Job).order_by(Job.created_at.desc()).offset(offset).limit(limit).all()
        return [job.__dict__ for job in jobs]
    except Exception as e:
        logger.error(f"Error in get_jobs: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/jobs/{job_id}")
async def delete_job(job_id: str):
    try:
        db = next(get_db())
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        # 删除关联的 scenes
        db.query(Scene).filter(Scene.job_id == job_id).delete()
        
        # 删除 job 记录
        db.delete(job)
        db.commit()
        
        # 删除本地文件
        analysis_dir = Path(f"./data/analysis/{job_id}")
        if analysis_dir.exists():
            shutil.rmtree(analysis_dir, ignore_errors=True)
            logger.info(f"Deleted analysis directory: {analysis_dir}")
        
        logger.info(f"Deleted Job: {job_id}")
        return {"message": "删除成功", "job_id": job_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in delete_job: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/jobs/{job_id}/result")
async def get_result(job_id: str):
    try:
        db = next(get_db())
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        # 查询所有场景
        db_scenes = db.query(Scene).filter(Scene.job_id == job_id).order_by(Scene.scene_index).all()
        
        # 转换场景格式
        scenes = []
        for s in db_scenes:
            scene = SceneResponse(
                index=s.scene_index,
                start_time=s.start_time,
                end_time=s.end_time,
                duration=s.duration,
                start_timestamp=s.start_timestamp,
                end_timestamp=s.end_timestamp,
                video_url=f"/data/analysis/{job_id}/videos/{job.original_filename}",
                frame_count=s.frame_count
            )
            scenes.append(scene)
        
        # 构建响应
        video_info = VideoInfo(
            duration=job.duration_seconds or 0.0,
            width=1920,  # 从视频元数据获取
            height=1080,
            fps=30.0
        )
        
        response = VirtualCutResponse(
            job_id=job_id,
            video_info=video_info,
            total_scenes=len(scenes),
            scenes=scenes,
            video_url=f"/data/analysis/{job_id}/videos/{job.original_filename}",
            youtube_url=job.youtube_url,
            original_filename=job.original_filename
        )
        
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_result: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/jobs/{job_id}/reprocess")
async def reprocess_job(job_id: str):
    try:
        db = next(get_db())
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        # 检查视频文件是否存在
        analysis_dir = Path(f"data/analysis/{job_id}")
        upload_dir = analysis_dir / "videos"
        video_files = list(upload_dir.glob("*.*"))
        video_files = [f for f in video_files if f.suffix.lower() in [".mp4", ".mov", ".avi", ".mkv", ".flv"]]
        
        if not video_files:
            raise HTTPException(status_code=404, detail="Video file not found")
        
        return {"message": "帧提取任务已启动", "job_id": job_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in reprocess_job: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/jobs/{job_id}/update-scenes")
async def update_scenes(job_id: str, request: Dict[str, List[Dict[str, Any]]]):
    try:
        db = next(get_db())
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        # 删除旧的场景数据
        db.query(Scene).filter(Scene.job_id == job_id).delete()
        
        # 批量创建新场景
        scenes_data = request.get("scenes", [])
        for s in scenes_data:
            scene = Scene(
                job_id=job_id,
                scene_index=s.get("index", 0),
                start_time=s.get("start_time", 0),
                end_time=s.get("end_time", 0),
                duration=s.get("duration", 0),
                start_timestamp=s.get("start_timestamp", ""),
                end_timestamp=s.get("end_timestamp", ""),
                frame_count=1  # 使用默认值
            )
            db.add(scene)
        
        # 更新任务的状态
        job.status = "completed"
        db.commit()
        
        return {"message": "场景已保存", "updated_count": len(scenes_data)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in update_scenes: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/jobs/{job_id}/physical-split")
async def physical_split(job_id: str):
    try:
        db = next(get_db())
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        # 获取场景列表
        db_scenes = db.query(Scene).filter(Scene.job_id == job_id).order_by(Scene.scene_index).all()
        if not db_scenes:
            raise HTTPException(status_code=404, detail="No scenes found")
        
        # 获取原始视频路径
        analysis_dir = Path(f"data/analysis/{job_id}")
        upload_dir = analysis_dir / "videos"
        video_files = list(upload_dir.glob("*.*"))
        video_files = [f for f in video_files if f.suffix.lower() in [".mp4", ".mov", ".avi", ".mkv", ".flv", ".webm"]]
        
        if not video_files:
            raise HTTPException(status_code=404, detail="Video file not found")
        
        video_path = video_files[0]
        
        # 创建输出目录
        split_output_dir = analysis_dir / "split"
        split_output_dir.mkdir(exist_ok=True)
        
        logger.info(f"Starting physical split, {len(db_scenes)} segments total")
        
        # 获取视频扩展名
        video_ext = video_path.suffix[1:] or "mp4"
        
        # 使用 ffmpeg 切分每个场景
        split_count = 0
        for idx, scene in enumerate(db_scenes):
            output_filename = f"{idx + 1:03}.{video_ext}"
            output_path = split_output_dir / output_filename
            
            # 使用 ffmpeg 切分视频，保持原始编码以提高速度
            cmd = [
                "ffmpeg",
                "-i", str(video_path),
                "-ss", str(scene.start_time),
                "-to", str(scene.end_time),
                "-c", "copy",  # 使用 copy 模式，不重新编码
                "-y",  # 覆盖已存在的文件
                str(output_path)
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode == 0:
                split_count += 1
                logger.info(f"Segment {idx + 1} split successfully: {output_filename}")
            else:
                logger.error(f"Failed to split segment {idx + 1}: {result.stderr}")
        
        output_dir_str = str(split_output_dir.resolve())
        logger.info(f"Physical split completed! Generated {split_count} files")
        
        return {
            "message": "视频切分成功",
            "split_count": split_count,
            "output_directory": output_dir_str
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in physical_split: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/projects")
async def get_projects(limit: int = Query(20), offset: int = Query(0), type: Optional[str] = Query(None)):
    try:
        db = next(get_db())
        if type:
            projects = db.query(Project).filter(Project.project_type == type).order_by(Project.created_at.desc()).offset(offset).limit(limit).all()
        else:
            projects = db.query(Project).order_by(Project.created_at.desc()).offset(offset).limit(limit).all()
        
        # 为每个项目自动填充封面图
        for project in projects:
            scenes = db.query(StoryboardScene).filter(StoryboardScene.project_id == project.id).order_by(StoryboardScene.scene_index).all()
            if scenes:
                first_scene = scenes[0]
                if first_scene.latest_image_url:
                    project.cover_image_url = first_scene.latest_image_url
        
        return [project.__dict__ for project in projects]
    except Exception as e:
        logger.error(f"Error in get_projects: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/projects")
async def create_project(request: Dict[str, Any]):
    try:
        db = next(get_db())
        
        # 解析请求数据
        project_type = request.get("项目类型", "video")
        if project_type == "comic":
            global_image_prompt = request.get("图全局提示词")
        else:
            global_image_prompt = request.get("首帧图全局提示词")
        
        # 创建项目记录
        project = Project(
            title=request.get("标题", ""),
            script=request.get("剧本"),
            global_image_prompt=global_image_prompt,
            global_video_prompt=request.get("视频全局提示词"),
            project_type=project_type
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        
        # 导入角色到系统角色库
        characters = request.get("角色", [])
        for char_import in characters:
            # 解析标签（逗号分隔）
            tags = []
            if char_import.get("标签"):
                tags = [tag.strip() for tag in char_import["标签"].split(",") if tag.strip()]
            
            # 创建待生成角色
            character = Character(
                name=char_import.get("角色名称", ""),
                image_url="",
                prompt=char_import.get("提示词"),
                category=char_import.get("分类"),
                tags=tags,
                status=0,
                source_project_id=project.id
            )
            db.add(character)
        
        # 批量创建分镜记录
        scenes = request.get("分镜", [])
        for s in scenes:
            # 解析时长
            duration = parse_duration(s.get("时长"))
            if duration:
                # 验证范围：1-30秒
                if duration < 1.0:
                    duration = 8.0
                elif duration > 30.0:
                    duration = 30.0
            
            # 获取提示词
            first_frame_prompt = s.get("首帧图提示词") or s.get("图提示词")
            video_prompt = s.get("视频提示词")
            
            scene = StoryboardScene(
                project_id=project.id,
                scene_index=s.get("id", 0),
                duration=duration,
                first_frame_prompt=first_frame_prompt,
                video_prompt=video_prompt
            )
            db.add(scene)
        
        db.commit()
        logger.info(f"Project created successfully: {project.id} ({len(scenes)} scenes)")
        
        return {
            "project_id": project.id,
            "project_type": project_type,
            "message": "项目创建成功"
        }
    except Exception as e:
        logger.error(f"Error in create_project: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/projects/{project_id}")
async def get_project_detail(project_id: str):
    try:
        db = next(get_db())
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # 查询分镜
        scenes = db.query(StoryboardScene).filter(StoryboardScene.project_id == project_id).order_by(StoryboardScene.scene_index).all()
        
        return {
            "project": project.__dict__,
            "scenes": [scene.__dict__ for scene in scenes]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_project_detail: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    try:
        db = next(get_db())
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # 获取所有分镜场景ID
        scene_ids = db.query(StoryboardScene.id).filter(StoryboardScene.project_id == project_id).all()
        scene_ids = [id[0] for id in scene_ids]
        
        # 删除所有分镜的生成历史记录
        if scene_ids:
            db.query(GenerationHistory).filter(GenerationHistory.scene_id.in_(scene_ids)).delete()
        
        # 解除角色与项目的关联
        db.query(Character).filter(Character.source_project_id == project_id).update({"source_project_id": None})
        
        # 删除项目关联的角色链接
        db.query(ProjectCharacter).filter(ProjectCharacter.project_id == project_id).delete()
        
        # 删除项目的分镜
        db.query(StoryboardScene).filter(StoryboardScene.project_id == project_id).delete()
        
        # 删除项目的合成视频记录
        db.query(CompositeVideo).filter(CompositeVideo.project_id == project_id).delete()
        
        # 删除项目本身
        db.delete(project)
        db.commit()
        
        # 删除项目的本地文件
        project_dir = Path(f"./data/projects/{project_id}")
        if project_dir.exists():
            shutil.rmtree(project_dir, ignore_errors=True)
            logger.info(f"Deleted project directory: {project_dir}")
        
        logger.info(f"Project deleted: {project_id}")
        return {"success": True, "message": "项目删除成功"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in delete_project: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/templates/video")
async def download_video_template():
    try:
        template = {
            "标题": "",
            "剧本": "",
            "项目类型": "video",
            "首帧图全局提示词": "",
            "视频全局提示词": "",
            "角色": [
                {
                    "角色名称": "",
                    "分类": "",
                    "标签": "",
                    "提示词": ""
                }
            ],
            "分镜": [
                {
                    "id": 1,
                    "时长": "5秒",
                    "首帧图提示词": "",
                    "视频提示词": ""
                },
                {
                    "id": 2,
                    "时长": "3s",
                    "首帧图提示词": "",
                    "视频提示词": ""
                }
            ]
        }
        return JSONResponse(
            content=template,
            headers={
                "Content-Disposition": "attachment; filename=项目模板（视频）.json"
            }
        )
    except Exception as e:
        logger.error(f"Error in download_video_template: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/templates/comic")
async def download_comic_template():
    try:
        template = {
            "标题": "",
            "剧本": "",
            "项目类型": "comic",
            "图全局提示词": "",
            "角色": [
                {
                    "角色名称": "",
                    "分类": "",
                    "标签": "",
                    "提示词": ""
                }
            ],
            "分镜": [
                {
                    "id": 1,
                    "图提示词": ""
                },
                {
                    "id": 2,
                    "图提示词": ""
                }
            ]
        }
        return JSONResponse(
            content=template,
            headers={
                "Content-Disposition": "attachment; filename=项目模板（漫画）.json"
            }
        )
    except Exception as e:
        logger.error(f"Error in download_comic_template: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# 静态文件服务
@app.get("/data/{path:path}")
async def serve_data(path: str):
    try:
        file_path = Path(f"./data/{path}")
        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(status_code=404, detail="File not found")
        return FileResponse(file_path)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in serve_data: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# 阿里云模型 API 端点
@app.post("/api/aliyun/model")
async def call_aliyun_model_api(request: Dict[str, Any]):
    """调用阿里云模型"""
    try:
        model = request.get("model", "qwen-max")
        input_text = request.get("input", "")
        temperature = request.get("temperature", 0.7)
        max_tokens = request.get("max_tokens", 1000)
        
        if not input_text:
            return {"error": "Input text is required"}
        
        response = call_aliyun_model(
            prompt=input_text,
            model_name=model,
            temperature=temperature,
            max_tokens=max_tokens
        )
        
        if response:
            return response
        else:
            return {"error": "Failed to call Aliyun model"}
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/aliyun/image")
async def call_aliyun_image_api(request: Dict[str, Any]):
    """调用阿里云图像生成模型"""
    try:
        model = request.get("model", "stable-diffusion-xl")
        prompt = request.get("prompt", "")
        size = request.get("size", "1024x1024")
        
        if not prompt:
            return {"error": "Prompt is required"}
        
        response = call_aliyun_image_model(
            prompt=prompt,
            model_name=model,
            size=size
        )
        
        if response:
            return response
        else:
            return {"error": "Failed to call Aliyun image model"}
    except Exception as e:
        return {"error": str(e)}

# 启动服务器
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
