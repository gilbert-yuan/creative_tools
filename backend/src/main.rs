use actix_cors::Cors;
use actix_multipart::Multipart;
use actix_web::{web, App, HttpResponse, HttpServer, Result};

use futures_util::stream::StreamExt as _;
use futures_util::TryStreamExt;
use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command; // Keep synchronous Command for existing functions
use tokio::process::Command as AsyncCommand; // Use async Command for new functions
use uuid::Uuid;
use base64::Engine as _; // Import Engine trait
use reqwest::Client;

mod db;
mod models;
mod cloudflare;
mod logger;

use models::{Job, Scene as DbScene, Project, StoryboardScene, GenerationHistory, CompositeVideo, ProjectCharacter, Character};



#[derive(Debug, Serialize, Deserialize, Clone)]
struct Scene {
    index: usize,
    #[serde(rename = "startTime")]
    start_time: f64,
    #[serde(rename = "endTime")]
    end_time: f64,
    duration: f64,
    #[serde(rename = "startTimestamp")]
    start_timestamp: String,
    #[serde(rename = "endTimestamp")]
    end_timestamp: String,
    #[serde(rename = "videoUrl")]
    video_url: String,
    #[serde(rename = "frameCount")]
    frame_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
struct VideoInfo {
    duration: f64,
    width: u32,
    height: u32,
    fps: f64,
}

#[derive(Debug, Serialize, Deserialize)]
struct VirtualCutResponse {
    job_id: String,
    video_info: VideoInfo,
    total_scenes: usize,
    scenes: Vec<Scene>,
    video_url: String,
    youtube_url: Option<String>,
    original_filename: String,
}

#[derive(Debug, Deserialize)]
struct UpdateScenesRequest {
    scenes: Vec<SceneUpdate>,
}

#[derive(Debug, Deserialize)]
struct SceneUpdate {
    index: usize,
    #[serde(rename = "startTime")]
    start_time: f64,
    #[serde(rename = "endTime")]
    end_time: f64,
    duration: f64,
    #[serde(rename = "startTimestamp")]
    start_timestamp: String,
    #[serde(rename = "endTimestamp")]
    end_timestamp: String,
}



// YouTube 下载请求结构体
#[derive(Debug, Deserialize)]
struct YouTubeDownloadRequest {
    url: String,
}




// ========================================
// 我的项目功能 - 请求/响应结构体
// ========================================

// 项目导入请求（JSON格式）
#[derive(Debug, Deserialize)]
struct ProjectImport {
    #[serde(rename = "标题")]
    title: String,
    #[serde(rename = "剧本")]
    script: String,
    #[serde(rename = "首帧图全局提示词", skip_serializing_if = "Option::is_none")]
    global_image_prompt: Option<String>,
    #[serde(rename = "图全局提示词", skip_serializing_if = "Option::is_none")]
    comic_global_image_prompt: Option<String>,
    #[serde(rename = "视频全局提示词", skip_serializing_if = "Option::is_none")]
    global_video_prompt: Option<String>,
    #[serde(rename = "项目类型", default = "default_project_type", skip_serializing_if = "Option::is_none")]
    project_type: Option<String>,
    #[serde(rename = "角色", skip_serializing_if = "Option::is_none")]
    characters: Option<Vec<CharacterImport>>,
    #[serde(rename = "分镜")]
    scenes: Vec<SceneImport>,
}

#[derive(Debug, Deserialize)]
struct SceneImport {
    id: i32,
    #[serde(rename = "时长")]
    duration: Option<serde_json::Value>,  // 支持数字或字符串，漫画可选
    #[serde(rename = "首帧图提示词", alias = "图提示词")]
    first_frame_prompt: String,  // 支持"首帧图提示词"或"图提示词"
    #[serde(rename = "视频提示词", default)]
    video_prompt: Option<String>,  // 视频项目必需，漫画可选
}

// 解析时长，支持多种格式：3, "3", "3秒", "3s", "3.5秒" 等
fn parse_duration(value: &serde_json::Value) -> Option<f64> {
    match value {
        // 直接是数字
        serde_json::Value::Number(n) => n.as_f64(),
        // 字符串格式
        serde_json::Value::String(s) => {
            // 移除中文"秒"字和英文"s/S"
            let cleaned = s
                .replace("秒", "")
                .replace("s", "")
                .replace("S", "")
                .trim()
                .to_string();
            
            // 尝试解析为浮点数
            cleaned.parse::<f64>().ok()
        },
        _ => None
    }
}


#[derive(Debug, Deserialize)]
struct CharacterImport {
    #[serde(rename = "角色名称")]
    name: String,
    #[serde(rename = "分类")]
    category: Option<String>,
    #[serde(rename = "标签")]
    tags: Option<String>,  // 逗号分隔
    #[serde(rename = "提示词")]
    prompt: String,
}

// 更新提示词请求
#[derive(Debug, Deserialize)]
struct UpdatePromptsRequest {
    first_frame_prompt: Option<String>,
    video_prompt: Option<String>,
    duration: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct UpdateScriptRequest {
    script: String,
}

// 角色分析请求/响应结构体
#[derive(Debug, Deserialize)]
struct AnalyzeCharacterRequest {
    prompt: String,
}

#[derive(Debug, Serialize)]
struct AnalyzeCharacterResponse {
    name: String,
    category: String,
    tags: Vec<String>,
}

// GPT-nano API 请求/响应结构体
#[derive(Debug, Serialize)]
struct GptNanoRequest {
    model: String,
    input: String,
    temperature: f32,
    max_tokens: i32,
}

#[derive(Debug, Deserialize)]
struct GptNanoResponse {
    output: Vec<GptNanoOutput>,
}

#[derive(Debug, Deserialize)]
struct GptNanoOutput {
    #[serde(rename = "type")]
    output_type: String,
    #[serde(default)]
    content: Vec<GptNanoContent>,
}

#[derive(Debug, Deserialize)]
struct GptNanoContent {
    #[serde(rename = "type")]
    content_type: String,
    text: String,
}

// 查看原文件请求
#[derive(Debug, Deserialize)]
struct RevealFileRequest {
    file_path: String,
}

// 虚拟剪辑接口 - 不保存视频片段
async fn virtual_cut(
    mut payload: Multipart,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let job_id = Uuid::new_v4();
    let job_id_str = job_id.to_string();
    let analysis_dir = PathBuf::from(format!("data/analysis/{}", job_id_str));
    let upload_dir = analysis_dir.join("videos");
    fs::create_dir_all(&upload_dir)?;

    let mut video_path = PathBuf::new();
    let mut original_filename = String::new();
    let mut file_size: i64 = 0;

    // 接收上传的视频文件
    while let Some(item) = payload.next().await {
        let mut field = item?;
        let content_disposition = field.content_disposition();
        
        if let Some(filename) = content_disposition.get_filename() {
            original_filename = filename.to_string();
            let filepath = upload_dir.join(filename);
            video_path = filepath.clone();
            
            let mut f = web::block(move || std::fs::File::create(filepath))
                .await??;
            let mut total_bytes = 0i64;

            while let Some(chunk) = field.next().await {
                let data = chunk?;
                total_bytes += data.len() as i64;
                f = web::block(move || f.write_all(&data).map(|_| f)).await??;
            }
            file_size = total_bytes;
        }
    }

    // 创建 Job 记录（上传文件，无YouTube URL）
    let _job = Job::create(pool.as_ref(), job_id, original_filename.clone(), file_size, None)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    
    println!("✅ Job {} 创建成功", job_id_str);

    // 获取视频信息
    let video_info = get_video_info(&video_path)?;
    
    // 检测场景
    let scene_times = detect_scenes(&video_path)?;
    
    // 构建虚拟剪辑场景列表并保存到数据库
    let mut scenes = Vec::new();
    for i in 0..scene_times.len() - 1 {
        let start = scene_times[i];
        let end = scene_times[i + 1];
        let duration = end - start;
        
        if duration > 0.1 {
            let scene_index = scenes.len() + 1;
            let frame_count = (duration * video_info.fps).round() as usize;
            
            // 保存场景到数据库
            let _db_scene = DbScene::create(
                pool.as_ref(),
                job_id,
                scene_index as i32,
                start,
                end,
                duration,
                format_timestamp(start),
                format_timestamp(end),
                frame_count as i32,
            )
            .await
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
            
            scenes.push(Scene {
                index: scene_index,
                start_time: start,
                end_time: end,
                duration,
                start_timestamp: format_timestamp(start),
                end_timestamp: format_timestamp(end),
                video_url: format!("/data/analysis/{}/videos/{}", job_id_str, original_filename),
                frame_count,
            });
        }
    }

    // 更新 Job 状态
    Job::update_status(pool.as_ref(), job_id, "completed", Some(video_info.duration))
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    let response = VirtualCutResponse {
        job_id: job_id_str.clone(),
        video_info,
        total_scenes: scenes.len(),
        scenes: scenes.clone(),
        video_url: format!("/data/analysis/{}/videos/{}", job_id_str, original_filename),
        youtube_url: None,
        original_filename: original_filename.clone(),
    };

    // 保存结果到文件（保持兼容性）
    let result_file = analysis_dir.join("result.json");
    let result_json = serde_json::to_string_pretty(&response)?;
    fs::write(result_file, result_json)?;



    Ok(HttpResponse::Ok().json(response))
}

// YouTube 视频下载并分析接口
async fn youtube_virtual_cut(
    req_body: web::Json<YouTubeDownloadRequest>,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let youtube_url = &req_body.url;
    
    // 验证 YouTube URL
    if !youtube_url.contains("youtube.com") && !youtube_url.contains("youtu.be") {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "无效的 YouTube 链接"
        })));
    }
    
    let job_id = Uuid::new_v4();
    let job_id_str = job_id.to_string();
    let analysis_dir = PathBuf::from(format!("data/analysis/{}", job_id_str));
    let upload_dir = analysis_dir.join("videos");
    fs::create_dir_all(&upload_dir)?;
    
    println!("📥 开始下载 YouTube 视频: {}", youtube_url);
    
    // 使用 yt-dlp 下载视频
    let output_template = upload_dir.join("video.%(ext)s").to_str().unwrap().to_string();
    
    let download_result = AsyncCommand::new("yt-dlp")
        .args(&[
            "-f", "best[ext=mp4]/best",
            "--no-playlist",
            "--no-check-certificate",
            "-o", &output_template,
            youtube_url,
        ])
        .output()
        .await;
    
    let output = match download_result {
        Ok(out) => out,
        Err(e) => {
            eprintln!("✗ 执行 yt-dlp 失败: {}", e);
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("执行 yt-dlp 失败: {}. 请确保已安装 yt-dlp (brew install yt-dlp)", e)
            })));
        }
    };
    
    if !output.status.success() {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        eprintln!("✗ YouTube 下载失败: {}", error_msg);
        return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("YouTube 视频下载失败: {}", error_msg)
        })));
    }
    
    // 查找下载的视频文件
    let video_files: Vec<_> = fs::read_dir(&upload_dir)?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry.path().is_file() && 
            entry.path().extension().and_then(|s| s.to_str()).map_or(false, |ext| {
                matches!(ext.to_lowercase().as_str(), "mp4" | "webm" | "mkv" | "mov")
            })
        })
        .collect();
    
    if video_files.is_empty() {
        return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "视频下载成功但未找到视频文件"
        })));
    }
    
    let video_path = video_files[0].path();
    let original_filename = video_files[0].file_name().to_string_lossy().to_string();
    let file_size = video_path.metadata()?.len() as i64;
    
    println!("✅ YouTube 视频下载成功: {} ({} bytes)", original_filename, file_size);
    
    // 创建 Job 记录（YouTube下载，保存URL）
    let _job = Job::create(pool.as_ref(), job_id, original_filename.clone(), file_size, Some(youtube_url.clone()))
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    
    println!("✅ Job {} 创建成功", job_id_str);
    
    // 获取视频信息
    let video_info = get_video_info(&video_path)?;
    
    // 检测场景
    let scene_times = detect_scenes(&video_path)?;
    
    // 构建虚拟剪辑场景列表并保存到数据库
    let mut scenes = Vec::new();
    for i in 0..scene_times.len() - 1 {
        let start = scene_times[i];
        let end = scene_times[i + 1];
        let duration = end - start;
        
        if duration > 0.1 {
            let scene_index = scenes.len() + 1;
            let frame_count = (duration * video_info.fps).round() as usize;
            
            // 保存场景到数据库
            let _db_scene = DbScene::create(
                pool.as_ref(),
                job_id,
                scene_index as i32,
                start,
                end,
                duration,
                format_timestamp(start),
                format_timestamp(end),
                frame_count as i32,
            )
            .await
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
            
            scenes.push(Scene {
                index: scene_index,
                start_time: start,
                end_time: end,
                duration,
                start_timestamp: format_timestamp(start),
                end_timestamp: format_timestamp(end),
                video_url: format!("/data/analysis/{}/videos/{}", job_id_str, original_filename),
                frame_count,
            });
        }
    }
    
    // 更新 Job 状态
    Job::update_status(pool.as_ref(), job_id, "completed", Some(video_info.duration))
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    
    let response = VirtualCutResponse {
        job_id: job_id_str.clone(),
        video_info,
        total_scenes: scenes.len(),
        scenes: scenes.clone(),
        video_url: format!("/data/analysis/{}/videos/{}", job_id_str, original_filename),
        youtube_url: Some(youtube_url.clone()),
        original_filename: original_filename.clone(),
    };
    
    // 保存结果到文件（保持兼容性）
    let result_file = analysis_dir.join("result.json");
    let result_json = serde_json::to_string_pretty(&response)?;
    fs::write(result_file, result_json)?;
    

    
    Ok(HttpResponse::Ok().json(response))
}

// 获取历史记录列表
async fn get_jobs(
    pool: web::Data<sqlx::PgPool>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> Result<HttpResponse> {
    let limit = query.get("limit")
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(20);
    let offset = query.get("offset")
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);

    let jobs = Job::list_all(pool.as_ref(), limit, offset)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    Ok(HttpResponse::Ok().json(jobs))
}

// 删除历史记录
async fn delete_job(
    path: web::Path<String>,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let job_id_str = path.into_inner();
    let job_id = Uuid::parse_str(&job_id_str)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidInput, e))?;
    
    // 检查任务是否存在
    let job = Job::find_by_id(pool.as_ref(), job_id)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    
    if job.is_none() {
        return Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Job not found"
        })));
    }
    
    // 删除 job（会级联删除 scenes 和本地文件）
    Job::delete(pool.as_ref(), job_id)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    
    // 同时删除 data/analysis 下的目录
    let analysis_dir = format!("./data/analysis/{}", job_id);
    if std::path::Path::new(&analysis_dir).exists() {
        match std::fs::remove_dir_all(&analysis_dir) {
            Ok(_) => println!("🗑️  已删除分析目录: {}", analysis_dir),
            Err(e) => eprintln!("⚠️  删除分析目录失败: {} - {}", analysis_dir, e),
        }
    }
    
    println!("🗑️  已删除 Job: {}", job_id);
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "删除成功",
        "job_id": job_id_str
    })))
}

// 获取任务结果（用于前端编辑器页面）
async fn get_result(
    path: web::Path<String>,
    pool: web::Data<sqlx::PgPool>
) -> Result<HttpResponse> {
    let job_id_str = path.into_inner();
    let job_id = match Uuid::parse_str(&job_id_str) {
        Ok(id) => id,
        Err(_) => {
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Invalid job ID format"
            })));
        }
    };
    
    // 从数据库查询 job
    let job = match Job::find_by_id(pool.as_ref(), job_id).await {
        Ok(Some(job)) => job,
        Ok(None) => {
            return Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": "Job not found"
            })));
        }
        Err(e) => {
            eprintln!("Database error: {:?}", e);
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Database error"
            })));
        }
    };
    
    // 从数据库查询所有场景
    let db_scenes = match DbScene::find_by_job_id(pool.as_ref(), job_id).await {
        Ok(scenes) => scenes,
        Err(e) => {
            eprintln!("Database error fetching scenes: {:?}", e);
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Database error"
            })));
        }
    };
    
    // 转换数据库场景为 API 响应格式
    let scenes: Vec<Scene> = db_scenes.into_iter().map(|s| Scene {
        index: s.scene_index as usize,
        start_time: s.start_time,
        end_time: s.end_time,
        duration: s.duration,
        start_timestamp: s.start_timestamp,
        end_timestamp: s.end_timestamp,
        video_url: format!("/data/analysis/{}/videos/{}", job_id, job.original_filename),
        frame_count: s.frame_count as usize,
    }).collect();
    
    // 构造响应
    let total_scenes = scenes.len();
    let video_url = format!("/data/analysis/{}/videos/{}", job_id, job.original_filename);
    
    let response = VirtualCutResponse {
        job_id: job_id.to_string(),
        video_info: VideoInfo {
            duration: job.duration_seconds.unwrap_or(0.0),
            width: 1920, // TODO: 从视频元数据获取
            height: 1080,
            fps: 30.0,
        },
        total_scenes,
        scenes,
        video_url,
        youtube_url: job.youtube_url.clone(),
        original_filename: job.original_filename.clone(),
    };
    
    Ok(HttpResponse::Ok().json(response))
}

// 重新处理帧提取接口（移除AI分析）
async fn reprocess_job(
    path: web::Path<String>,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let job_id_str = path.into_inner();
    let job_id_str_clone = job_id_str.clone();
    let job_id = Uuid::parse_str(&job_id_str)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidInput, e))?;
    
    // 检查任务是否存在
    let job = Job::find_by_id(pool.as_ref(), job_id)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "Job not found"))?;
    
    // 获取场景列表
    let db_scenes = DbScene::find_by_job_id(pool.as_ref(), job_id)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    
    if db_scenes.is_empty() {
        return Err(std::io::Error::new(std::io::ErrorKind::NotFound, "No scenes found").into());
    }
    
    // 构建场景数据
    let _scenes: Vec<Scene> = db_scenes.iter().map(|s| Scene {
        index: s.scene_index as usize,
        start_time: s.start_time,
        end_time: s.end_time,
        duration: s.duration,
        start_timestamp: s.start_timestamp.clone(),
        end_timestamp: s.end_timestamp.clone(),
        video_url: format!("/data/analysis/{}/videos/{}", job_id_str, job.original_filename),
        frame_count: s.frame_count as usize,
    }).collect();
    
    // 获取视频路径和输出目录
    let analysis_dir = PathBuf::from(format!("data/analysis/{}", job_id_str));
    let upload_dir = analysis_dir.join("videos");
    
    // 查找视频文件
    let video_files: Vec<_> = fs::read_dir(&upload_dir)?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry.path().is_file() && 
            entry.path().extension().and_then(|s| s.to_str()).map_or(false, |ext| {
                matches!(ext.to_lowercase().as_str(), "mp4" | "mov" | "avi" | "mkv" | "flv")
            })
        })
        .collect();
    
    if video_files.is_empty() {
        return Err(std::io::Error::new(std::io::ErrorKind::NotFound, "Video file not found").into());
    }
    
    let _video_path = video_files[0].path();
    

    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "帧提取任务已启动",
        "job_id": job_id_str_clone
    })))
}

// 更新场景切点
async fn update_scenes(
    path: web::Path<String>,
    req_body: web::Json<UpdateScenesRequest>,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let job_id_str = path.into_inner();
    let job_id = Uuid::parse_str(&job_id_str)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidInput, e))?;
    
    // 检查任务是否存在
    let _job = Job::find_by_id(pool.as_ref(), job_id)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "Job not found"))?;
    
    // 删除旧的场景数据
    DbScene::delete_by_job_id(pool.as_ref(), job_id)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    
    // 准备批量插入的数据
    let scenes_data: Vec<(i32, f64, f64, f64, String, String, i32)> = req_body.scenes
        .iter()
        .map(|s| (
            s.index as i32,
            s.start_time,
            s.end_time,
            s.duration,
            s.start_timestamp.clone(),
            s.end_timestamp.clone(),
            1, // frame_count - 使用默认值
        ))
        .collect();
    
    // 批量创建新场景
    let count = DbScene::batch_create(pool.as_ref(), job_id, scenes_data)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    
    // 更新任务的 updated_at 时间戳
    Job::update_status(pool.as_ref(), job_id, "completed", None)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "场景已保存",
        "updated_count": count
    })))
}

// 物理切分视频
async fn physical_split(
    path: web::Path<String>,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let job_id_str = path.into_inner();
    let job_id = Uuid::parse_str(&job_id_str)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidInput, e))?;
    
    // 检查任务是否存在
    let _job = Job::find_by_id(pool.as_ref(), job_id)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "Job not found"))?;
    
    // 获取场景列表
    let db_scenes = DbScene::find_by_job_id(pool.as_ref(), job_id)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    
    if db_scenes.is_empty() {
        return Err(std::io::Error::new(std::io::ErrorKind::NotFound, "No scenes found").into());
    }
    
    // 获取原始视频路径
    let analysis_dir = PathBuf::from(format!("data/analysis/{}", job_id_str));
    let upload_dir = analysis_dir.join("videos");
    let video_files: Vec<_> = fs::read_dir(&upload_dir)?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry.path().is_file() && 
            entry.path().extension().and_then(|s| s.to_str()).map_or(false, |ext| {
                matches!(ext.to_lowercase().as_str(), "mp4" | "mov" | "avi" | "mkv" | "flv" | "webm")
            })
        })
        .collect();
    
    if video_files.is_empty() {
        return Err(std::io::Error::new(std::io::ErrorKind::NotFound, "Video file not found").into());
    }
    
    let video_path = video_files[0].path();
    
    // 创建输出目录
    let split_output_dir = analysis_dir.join("split");
    fs::create_dir_all(&split_output_dir)?;
    
    println!("🎬 开始物理切分视频，共 {} 个片段", db_scenes.len());
    
    // 获取视频扩展名
    let video_ext = video_path.extension()
        .and_then(|s| s.to_str())
        .unwrap_or("mp4");
    
    // 使用 ffmpeg 切分每个场景
    let mut split_count = 0;
    for (idx, scene) in db_scenes.iter().enumerate() {
        let output_filename = format!("{:03}.{}", idx + 1, video_ext);
        let output_path = split_output_dir.join(&output_filename);
        
        // 使用 ffmpeg 切分视频，保持原始编码以提高速度
        let output = AsyncCommand::new("ffmpeg")
            .args(&[
                "-i", video_path.to_str().unwrap(),
                "-ss", &scene.start_time.to_string(),
                "-to", &scene.end_time.to_string(),
                "-c", "copy", // 使用 copy 模式，不重新编码
                "-y", // 覆盖已存在的文件
                output_path.to_str().unwrap(),
            ])
            .output()
            .await?;
        
        if !output.status.success() {
            let error_msg = String::from_utf8_lossy(&output.stderr);
            eprintln!("✗ 切分片段 {} 失败: {}", idx + 1, error_msg);
            continue;
        }
        
        split_count += 1;
        println!("✅ 片段 {} 切分完成: {}", idx + 1, output_filename);
    }
    
    // 获取输出目录的绝对路径
    let abs_output_dir = fs::canonicalize(&split_output_dir)?;
    let output_dir_str = abs_output_dir.to_str().unwrap().to_string();
    
    println!("✅ 物理切分完成！共生成 {} 个文件", split_count);
    println!("📁 输出目录: {}", output_dir_str);
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "视频切分成功",
        "split_count": split_count,
        "output_directory": output_dir_str
    })))
}



fn format_timestamp(seconds: f64) -> String {
    let hours = (seconds / 3600.0).floor() as u32;
    let minutes = ((seconds % 3600.0) / 60.0).floor() as u32;
    let secs = (seconds % 60.0).floor() as u32;
    let millis = ((seconds % 1.0) * 1000.0).floor() as u32;
    format!("{:02}:{:02}:{:02}.{:03}", hours, minutes, secs, millis)
}

fn get_video_info(video_path: &PathBuf) -> Result<VideoInfo> {
    let output = Command::new("ffprobe")
        .args(&[
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "format=duration:stream=width,height,r_frame_rate",
            "-of", "json",
            video_path.to_str().unwrap(),
        ])
        .output()?;

    let json_str = String::from_utf8_lossy(&output.stdout);
    let data: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    
    let duration = data["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);
    
    let stream = &data["streams"][0];
    let width = stream["width"].as_u64().unwrap_or(0) as u32;
    let height = stream["height"].as_u64().unwrap_or(0) as u32;
    
    let fps_str = stream["r_frame_rate"].as_str().unwrap_or("30/1");
    let fps_parts: Vec<&str> = fps_str.split('/').collect();
    let fps = if fps_parts.len() == 2 {
        let num: f64 = fps_parts[0].parse().unwrap_or(30.0);
        let den: f64 = fps_parts[1].parse().unwrap_or(1.0);
        num / den
    } else {
        fps_parts[0].parse().unwrap_or(30.0)
    };

    Ok(VideoInfo {
        duration,
        width,
        height,
        fps,
    })
}

fn get_video_duration(video_path: &PathBuf) -> Result<f64> {
    let output = Command::new("ffprobe")
        .args(&[
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path.to_str().unwrap(),
        ])
        .output()?;

    let duration_str = String::from_utf8_lossy(&output.stdout);
    let duration: f64 = duration_str.trim().parse().unwrap_or(0.0);
    
    Ok(duration)
}

fn detect_scenes(video_path: &PathBuf) -> Result<Vec<f64>> {
    let threshold = 0.3;
    
    let output = Command::new("ffmpeg")
        .args(&[
            "-i", video_path.to_str().unwrap(),
            "-filter:v", &format!("select='gt(scene,{})',showinfo", threshold),
            "-f", "null",
            "-",
        ])
        .output()?;

    let mut scene_times = vec![0.0];
    
    let output_str = String::from_utf8_lossy(&output.stderr);
    for line in output_str.lines() {
        if line.contains("pts_time:") {
            for part in line.split_whitespace() {
                if part.starts_with("pts_time:") {
                    if let Some(time_str) = part.split(':').nth(1) {
                        if let Ok(time) = time_str.parse::<f64>() {
                            scene_times.push(time);
                        }
                    }
                }
            }
        }
    }

    // 添加视频结束时间
    let duration = get_video_duration(video_path)?;
    scene_times.push(duration);

    // 去重排序
    scene_times.sort_by(|a, b| a.partial_cmp(b).unwrap());
    scene_times.dedup();
    
    // 限制最多50个场景
    if scene_times.len() > 51 {
        scene_times.truncate(51);
    }

    Ok(scene_times)
}

async fn serve_data(req: actix_web::HttpRequest) -> Result<actix_files::NamedFile> {
    let path: PathBuf = req.match_info().query("filename").parse().unwrap();
    let full_path = PathBuf::from("data").join(&path);
    Ok(actix_files::NamedFile::open(full_path)?)
}

// ========================================
// 我的项目功能 - API 处理函数
// ========================================

// 获取项目列表
async fn get_projects(
    pool: web::Data<sqlx::PgPool>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> Result<HttpResponse> {
    let limit = query.get("limit")
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(20);
    let offset = query.get("offset")
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);

    // 根据type参数过滤项目类型
    let mut projects = if let Some(project_type) = query.get("type") {
        Project::list_by_type(pool.as_ref(), project_type, limit, offset)
            .await
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?
    } else {
        Project::list_all(pool.as_ref(), limit, offset)
            .await
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?
    };

    // 为每个项目自动填充封面图（使用第一个分镜的首帧图）
    for project in &mut projects {
        // 查询第一个分镜场景
        if let Ok(scenes) = StoryboardScene::find_by_project_id(pool.as_ref(), project.id).await {
            if let Some(first_scene) = scenes.first() {
                if let Some(image_url) = &first_scene.latest_image_url {
                    project.cover_image_url = Some(image_url.clone());
                }
            }
        }
    }

    Ok(HttpResponse::Ok().json(projects))
}

// 创建项目（导入JSON）
async fn create_project(
    req_body: web::Json<ProjectImport>,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    // 判断项目类型并获取相应的全局图提示词
    let project_type = req_body.project_type.clone().unwrap_or_else(|| "video".to_string());
    let final_global_image_prompt = if project_type == "comic" {
        req_body.comic_global_image_prompt.clone()
    } else {
        req_body.global_image_prompt.clone()
    };

    // 创建项目记录
    let project = Project::create(
        pool.as_ref(),
        req_body.title.clone(),
        Some(req_body.script.clone()),
        Some(project_type.clone()),
    )
    .await
    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    // 更新全局提示词（如果提供）
    if final_global_image_prompt.is_some() || req_body.global_video_prompt.is_some() {
        sqlx::query(
            "UPDATE projects SET global_image_prompt = $1, global_video_prompt = $2, updated_at = NOW() WHERE id = $3"
        )
        .bind(&final_global_image_prompt)
        .bind(&req_body.global_video_prompt)
        .bind(project.id)
        .execute(pool.get_ref())
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    }

    // 导入角色到系统角色库（如果提供）
    if let Some(characters) = &req_body.characters {
        for char_import in characters {
            // 解析标签（逗号分隔）
            let tags: Vec<String> = char_import.tags
                .as_ref()
                .map(|t| t.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect())
                .unwrap_or_default();

            // 创建待生成角色
            Character::create_pending(
                pool.as_ref(),
                char_import.name.clone(),
                Some(char_import.prompt.clone()),
                char_import.category.clone(),
                tags,
                Some(project.id),
            )
            .await
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        }
        println!("✅ 导入 {} 个角色到系统角色库", characters.len());
    }

    // 批量创建分镜记录
    let scenes_data: Vec<(i32, Option<f64>, Option<String>, Option<String>)> = req_body
        .scenes
        .iter()
        .map(|s| {
            // 解析时长，支持多种格式
            let duration = s.duration.as_ref()
                .and_then(|v| parse_duration(v))
                .map(|d| {
                    // 验证范围：1-30秒（VEO API 限制，实际使用时取 1-8）
                    if d < 1.0 {
                        println!("⚠️ 分镜 {} 时长 {} 小于1秒，使用默认值8秒", s.id, d);
                        8.0
                    } else if d > 30.0 {
                        println!("⚠️ 分镜 {} 时长 {} 超过30秒，使用30秒", s.id, d);
                        30.0
                    } else {
                        d
                    }
                });
            
            (
                s.id,
                duration,
                Some(s.first_frame_prompt.clone()),
                s.video_prompt.clone(),  // 现在是 Option<String>
            )
        })
        .collect();

    StoryboardScene::batch_create(pool.as_ref(), project.id, scenes_data)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;


    println!("✅ 项目创建成功: {} ({} 个分镜)", project.id, req_body.scenes.len());

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "project_id": project.id,
        "project_type": project_type,
        "message": "项目创建成功"
    })))
}

// 获取项目详情（包含分镜列表）
async fn get_project_detail(
    path: web::Path<String>,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let project_id_str = path.into_inner();
    let project_id = Uuid::parse_str(&project_id_str)
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid project ID"))?;

    // 查询项目
    let project = Project::find_by_id(pool.as_ref(), project_id)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "Project not found"))?;

    // 查询分镜
    let scenes = StoryboardScene::find_by_project_id(pool.as_ref(), project_id)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "project": project,
        "scenes": scenes,
    })))
}

// 删除项目
async fn delete_project(
    path: web::Path<String>,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let project_id_str = path.into_inner();
    let project_id = Uuid::parse_str(&project_id_str)
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid project ID"))?;

    match Project::delete(pool.as_ref(), project_id).await {
        Ok(_) => {
            println!("🗑️ 项目已删除: {}", project_id);
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "message": "项目删除成功"
            })))
        }
        Err(e) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        }))),
    }
}


// 下载JSON模板（视频）
async fn download_video_template() -> Result<HttpResponse> {
    let template = serde_json::json!({
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
    });

    let template_json = serde_json::to_string_pretty(&template)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    Ok(HttpResponse::Ok()
        .content_type("application/json")
        .insert_header(("Content-Disposition", "attachment; filename=\"项目模板（视频）.json\""))
        .body(template_json))
}

// 下载JSON模板（漫画）
async fn download_comic_template() -> Result<HttpResponse> {
    let template = serde_json::json!({
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
    });

    let template_json = serde_json::to_string_pretty(&template)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    Ok(HttpResponse::Ok()
        .content_type("application/json")
        .insert_header(("Content-Disposition", "attachment; filename=\"项目模板（漫画）.json\""))
        .body(template_json))
}

// 更新分镜提示词
async fn update_scene_prompts(
    path: web::Path<(String, i32)>,
    req_body: web::Json<UpdatePromptsRequest>,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let (_project_id_str, scene_id) = path.into_inner();

    StoryboardScene::update_prompts(
        pool.as_ref(),
        scene_id,
        req_body.first_frame_prompt.clone(),
        req_body.video_prompt.clone(),
        req_body.duration,
    )
    .await
    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "提示词已更新"
    })))
}

// 生成首帧图（使用Gemini API + 角色图片参考）
async fn generate_first_frame(
    path: web::Path<(String, i32)>,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let (project_id_str, scene_id) = path.into_inner();
    let project_id = Uuid::parse_str(&project_id_str)
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid project ID"))?;

    // Fetch Project (Global Prompt)
    let project = Project::find_by_id(pool.as_ref(), project_id)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "Project not found"))?;

    // Fetch All Characters
    let characters = ProjectCharacter::get_all_for_project(pool.as_ref(), project_id)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    // 查询分镜信息
    let scene = StoryboardScene::find_by_id(pool.as_ref(), scene_id)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "Scene not found"))?;

    println!("🎨 开始生成首帧图: Scene ID {}", scene_id);
    println!("   > 项目角色数量: {}", characters.len());

    // 构建完整提示词：全局提示词 + 分镜提示词
    let mut full_prompt = String::new();
    if let Some(global_prompt) = &project.global_image_prompt {
        if !global_prompt.is_empty() {
            full_prompt.push_str(global_prompt);
            full_prompt.push_str(". ");
        }
    }
    if let Some(scene_prompt) = &scene.first_frame_prompt {
        full_prompt.push_str(scene_prompt);
    }

    if full_prompt.is_empty() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "首帧图提示词不能为空"
        ).into());
    }

    println!("   > 完整提示词: {}", full_prompt);

    // 获取 API Key 和 URL 配置
    let api_key = std::env::var("GEMINI_API_KEY")
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::Other, "GEMINI_API_KEY not set"))?;
    
    let client = Client::new();
    
    // 从环境变量读取 Gemini API 配置（必须设置）
    let gemini_base_url = std::env::var("GEMINI_BASE_URL")
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::Other, "GEMINI_BASE_URL not set"))?;
    let gemini_model = std::env::var("GEMINI_MODEL")
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::Other, "GEMINI_MODEL not set"))?;
    let gemini_endpoint = std::env::var("GEMINI_ENDPOINT")
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::Other, "GEMINI_ENDPOINT not set"))?;
    let url = format!("{}{}", gemini_base_url, gemini_endpoint.replace("{model}", &gemini_model));

    // 构建请求 parts
    let mut parts: Vec<serde_json::Value> = Vec::new();

    // 根据角色数量决定使用拼接图还是单独传递
    let character_count = characters.len();
    
    if character_count > 3 {
        // 超过 3 张角色图，使用拼接图
        println!("   > 角色数量 {} > 3，使用拼接角色图", character_count);
        
        let final_image_url = if let Some(url) = project.combined_characters_image {
            // 检查文件是否存在
            let local_path = format!("./data/{}", url.trim_start_matches("/data/"));
            if std::path::Path::new(&local_path).exists() {
                println!("   > 使用现有拼接角色图: {}", url);
                url
            } else {
                println!("   ⚠️  拼接图文件不存在: {}", url);
                "".to_string() 
            }
        } else {
            println!("   ⚠️  未找到拼接图，将使用单张角色图");
            "".to_string()
        };

        if !final_image_url.is_empty() {
            // 下载并编码拼接图
            match download_and_encode_image(&final_image_url).await {
                Ok((base64_data, mime_type)) => {
                    parts.push(serde_json::json!({
                        "inlineData": {
                            "mimeType": mime_type,
                            "data": base64_data
                        }
                    }));
                    println!("   ✅ 添加参考图(拼接图): {}", final_image_url);
                }
                Err(e) => {
                    println!("   ⚠️  无法加载拼接图 {}: {}", final_image_url, e);
                }
            }
        } else {
            // 拼接图不存在，降级使用单张角色图
            println!("   ⚠️  拼接图不可用，回退到使用单张角色图片");
            for character in &characters {
                match download_and_encode_image(&character.image_url).await {
                    Ok((base64_data, mime_type)) => {
                        parts.push(serde_json::json!({
                            "inlineData": {
                                "mimeType": mime_type,
                                "data": base64_data
                            }
                        }));
                        println!("   ✅ 添加角色图: {}", character.name);
                    }
                    Err(e) => {
                        println!("   ⚠️  无法加载角色图片 {}: {}", character.name, e);
                    }
                }
            }
        }
    } else if character_count > 0 {
        // 3 张及以下角色图，直接传递每张图
        println!("   > 角色数量 {} <= 3，直接传递每张角色图", character_count);
        
        for character in &characters {
            match download_and_encode_image(&character.image_url).await {
                Ok((base64_data, mime_type)) => {
                    parts.push(serde_json::json!({
                        "inlineData": {
                            "mimeType": mime_type,
                            "data": base64_data
                        }
                    }));
                    println!("   ✅ 添加角色图: {}", character.name);
                }
                Err(e) => {
                    println!("   ⚠️  无法加载角色图片 {}: {}", character.name, e);
                }
            }
        }
    } else {
        println!("   ℹ️  项目无角色图，将仅使用文本提示词生成");
    }

    // 添加文本提示词
    let text_instruction = if parts.is_empty() {
        // 没有参考图片，使用纯文本生成
        full_prompt.clone()
    } else {
        // 有参考图片，添加指令
        format!("Based on this character reference image, generate an image for: {}", full_prompt)
    };
    parts.push(serde_json::json!({"text": text_instruction}));

    // 调用 Gemini API
    let payload = serde_json::json!({
        "contents": [{
            "parts": parts
        }],
        "generationConfig": {
            "temperature": 0.4,
            "topK": 32,
            "topP": 1,
            "maxOutputTokens": 8192,
        }
    });

    println!("   ⏳ 正在调用 Gemini API...");
    
    // Log Request
    let request_log = serde_json::to_string_pretty(&payload).unwrap_or_default();
    
    let res = client.post(url)
        .header("Content-Type", "application/json")
        .header("x-goog-api-key", api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to call Gemini API: {}", e)))?;

    if !res.status().is_success() {
        let error_text = res.text().await.unwrap_or_default();
        // Log Error Response
        let _ = logger::log_model_interaction("gemini-3-pro-image-preview", &request_log, &format!("Error: {}", error_text));
        
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("Gemini API error: {}", error_text)
        ).into());
    }

    let result: serde_json::Value = res.json().await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to parse response: {}", e)))?;

    // Log Success Response
    let response_log = serde_json::to_string_pretty(&result).unwrap_or_default();
    let _ = logger::log_model_interaction("gemini-3-pro-image-preview", &request_log, &response_log);

    // 提取图片数据
    let candidates = result["candidates"].as_array()
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::Other, "No candidates in response"))?;
    let content = candidates.get(0).and_then(|c| c["content"].as_object())
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::Other, "No content in candidate"))?;
    let result_parts = content["parts"].as_array()
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::Other, "No parts in content"))?;

    let mut image_data_base64 = None;
    for part in result_parts {
        if let Some(inline_data) = part["inlineData"].as_object() {
            if let Some(data) = inline_data["data"].as_str() {
                image_data_base64 = Some(data);
                break;
            }
        }
    }

    let image_data_base64 = image_data_base64
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::Other, "No image data in response"))?;

    // 解码并保存图片
    let image_bytes = base64::engine::general_purpose::STANDARD.decode(image_data_base64)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to decode base64: {}", e)))?;

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("first_frame_{}_{}.png", scene_id, timestamp);
    let project_dir = format!("data/projects/{}/first_frames", project_id);
    fs::create_dir_all(&project_dir)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to create directory: {}", e)))?;
    let filepath = format!("{}/{}", project_dir, filename);
    let image_url = format!("/data/projects/{}/first_frames/{}", project_id, filename);

    let mut file = File::create(&filepath)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to create file: {}", e)))?;
    file.write_all(&image_bytes)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to write file: {}", e)))?;

    println!("   ✅ 首帧图已保存到本地: {}", filepath);

    // 更新场景：使用本地 URL
    StoryboardScene::update_latest_image(pool.as_ref(), scene_id, image_url.clone())
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    // 历史记录：使用本地 URL（视频生成时会自动上传到 Cloudflare）
    GenerationHistory::create(
        pool.as_ref(),
        scene_id,
        "image".to_string(),
        full_prompt.clone(),
        image_url.clone(),
    )
    .await
    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    println!("🎉 首帧图生成成功!");

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "首帧图生成成功",
        "image_url": image_url,
        "prompt": full_prompt,
    })))

}

// 辅助函数：下载并编码图片为 base64
async fn download_and_encode_image(image_url: &str) -> Result<(String, String)> {
    // 判断是本地路径还是外部URL
    let image_bytes = if image_url.starts_with("http://") || image_url.starts_with("https://") {
        // 外部URL，下载
        let client = Client::new();
        let response = client.get(image_url)
            .send()
            .await
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to download image: {}", e)))?;
        
        response.bytes()
            .await
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to read image bytes: {}", e)))?
            .to_vec()
    } else {
        // 本地路径（例如 /uploads/xxx.png）
        let local_path = if image_url.starts_with("/data/") {
            format!(".{}", image_url)  // ./uploads/xxx.png
        } else {
            image_url.to_string()
        };
        
        fs::read(&local_path)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to read local file: {}", e)))?
    };

    // 编码为 base64
    let base64_data = base64::engine::general_purpose::STANDARD.encode(&image_bytes);

    // 判断 MIME 类型（简单根据URL后缀判断）
    let mime_type = if image_url.ends_with(".png") {
        "image/png"
    } else if image_url.ends_with(".jpg") || image_url.ends_with(".jpeg") {
        "image/jpeg"
    } else if image_url.ends_with(".webp") {
        "image/webp"
    } else {
        "image/png"  // 默认
    };

    Ok((base64_data, mime_type.to_string()))
}

// 生成分镜视频（使用VEO API）
async fn generate_storyboard_video(
    path: web::Path<(String, i32)>,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let (project_id_str, scene_id) = path.into_inner();
    let project_id = Uuid::parse_str(&project_id_str)
        .map_err(|e| {
            eprintln!("❌ 无效的项目ID: {} - {}", project_id_str, e);
            std::io::Error::new(std::io::ErrorKind::InvalidInput, format!("Invalid project ID: {}", e))
        })?;

    println!("🎥 开始生成分镜视频: Project ID {}, Scene ID {}", project_id, scene_id);

    // Fetch Project (Global Prompt)
    let project = Project::find_by_id(pool.as_ref(), project_id)
        .await
        .map_err(|e| {
            eprintln!("❌ 查询项目失败: {}", e);
            std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to find project: {}", e))
        })?
        .ok_or_else(|| {
            eprintln!("❌ 项目不存在: {}", project_id);
            std::io::Error::new(std::io::ErrorKind::NotFound, "Project not found")
        })?;

    // Fetch All Characters
    let characters = ProjectCharacter::get_all_for_project(pool.as_ref(), project_id)
        .await
        .map_err(|e| {
            eprintln!("❌ 查询角色失败: {}", e);
            std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to get characters: {}", e))
        })?;

    // 查询分镜信息
    let scene = StoryboardScene::find_by_id(pool.as_ref(), scene_id)
        .await
        .map_err(|e| {
            eprintln!("❌ 查询分镜失败: {}", e);
            std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to find scene: {}", e))
        })?
        .ok_or_else(|| {
            eprintln!("❌ 分镜不存在: {}", scene_id);
            std::io::Error::new(std::io::ErrorKind::NotFound, "Scene not found")
        })?;

    println!("   > 项目角色数量: {}", characters.len());
    println!("   > 首帧图: {:?}", scene.latest_image_url);
    println!("   > 视频提示词: {:?}", scene.video_prompt);
    println!("   > 分镜时长: {:?}秒", scene.duration);

    // 构建完整提示词：全局提示词 + 分镜提示词 + 图片使用指示
    let mut full_prompt = String::new();
    if let Some(global_prompt) = &project.global_video_prompt {
        if !global_prompt.is_empty() {
            full_prompt.push_str(global_prompt);
            full_prompt.push_str(". ");
        }
    }
    if let Some(scene_prompt) = &scene.video_prompt {
        full_prompt.push_str(scene_prompt);
    }

    if full_prompt.is_empty() {
        eprintln!("❌ 视频提示词为空");
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "视频提示词不能为空"
        })));
    }
    
    // 不再添加图片使用指示，只传首帧图
    // let has_characters = !characters.is_empty();
    // if has_characters {
    //     full_prompt.push_str(". ");
    //     full_prompt.push_str("重要提示：第1张参考图片是场景的首帧构图，请严格按照该图的场景、构图和氛围生成视频。");
    //     full_prompt.push_str("第2张参考图片是角色外观参考，仅用于了解角色的服装、发型和特征，不要在视频中直接显示该图片内容。");
    // }

    println!("   > 完整提示词: {}", full_prompt);

    // 获取 VEO API Key
    let veo_api_key = std::env::var("VEO_API_KEY")
        .map_err(|e| {
            eprintln!("❌ VEO_API_KEY 环境变量未设置: {}", e);
            std::io::Error::new(std::io::ErrorKind::Other, "VEO_API_KEY not set")
        })?;
    
    let client = Client::new();

    // 创建 Cloudflare 存储客户端
    let cloudflare_storage = cloudflare::CloudflareStorage::new()
        .await
        .map_err(|e| {
            eprintln!("❌ Cloudflare 存储初始化失败: {}", e);
            std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to create Cloudflare storage: {}", e))
        })?;

    // 验证必须有首帧图
    if scene.latest_image_url.is_none() || scene.latest_image_url.as_ref().unwrap().is_empty() {
        eprintln!("❌ 没有首帧图，无法生成视频");
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "请先生成首帧图，再生成分镜视频"
        })));
    }

    // 收集需要上传的图片URL
    let mut image_urls: Vec<String> = Vec::new();
    
    // 添加首帧图
    if let Some(ref first_frame_url) = scene.latest_image_url {
        if first_frame_url.starts_with("http") {
            // 已经是公网URL（R2链接），直接使用
            image_urls.push(first_frame_url.clone());
            println!("   ✅ 使用已缓存的 R2 链接: {}", first_frame_url);
        } else if first_frame_url.starts_with("/data/") {
            // 本地图片，需要上传到 Cloudflare
            let local_path = format!(".{}", first_frame_url);
            println!("   > 首帧图为本地路径，正在上传到 Cloudflare: {}", first_frame_url);
            
            match cloudflare_storage.get_or_upload(pool.as_ref(), &local_path, "image").await {
                Ok(cdn_url) => {
                    image_urls.push(cdn_url.clone());
                    println!("   ✅ 首帧图上传成功: {}", cdn_url);
                    
                    // 重要：将 R2 链接更新到数据库，下次可以直接使用
                    match StoryboardScene::update_latest_image(pool.as_ref(), scene_id, cdn_url.clone()).await {
                        Ok(_) => {
                            println!("   📝 已更新数据库为 R2 链接，下次将直接使用缓存");
                        }
                        Err(e) => {
                            eprintln!("   ⚠️  更新数据库失败: {}，但不影响视频生成", e);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("   ❌ 首帧图上传失败: {}", e);
                    // 继续执行，使用空图片列表
                }
            }
        }
    }


    // 注释：VEO API 只使用首帧图，角色图已经在首帧图生成时使用过了
    // 不再需要拼接角色图传递给 VEO

    if image_urls.is_empty() {
        eprintln!("   ⚠️  警告：没有可用的公网图片，将使用纯文本生成视频");
    }


    // 调用 VEO API 创建视频
    // 获取视频时长并转换为整数（1-8范围）
    let video_duration_float = scene.duration.unwrap_or(8.0);
    let video_duration = video_duration_float.round().max(1.0).min(8.0) as i32;
    println!("   > 使用视频时长: {}秒", video_duration);
    
    // 从环境变量读取 VEO 配置
    let veo_model = std::env::var("VEO_MODEL")
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::Other, "VEO_MODEL not set"))?;
    let veo_base_url = std::env::var("VEO_BASE_URL")
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::Other, "VEO_BASE_URL not set"))?;
    let veo_create_endpoint = std::env::var("VEO_CREATE_ENDPOINT")
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::Other, "VEO_CREATE_ENDPOINT not set"))?;
    
    let create_payload = serde_json::json!({
        "prompt": full_prompt,
        "model": veo_model,
        "images": image_urls,
        "duration": video_duration,
        "enhance_prompt": true,
        "enable_upsample": true,
        "aspect_ratio": "9:16"
    });

    println!("   ⏳ 正在调用 VEO API 创建视频...");
    
    let create_url = format!("{}{}", veo_base_url, veo_create_endpoint);
    let create_res = client.post(&create_url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .header("Authorization", format!("Bearer {}", veo_api_key))
        .json(&create_payload)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to call VEO API: {}", e)))?;

    if !create_res.status().is_success() {
        let error_text = create_res.text().await.unwrap_or_default();
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("VEO API error: {}", error_text)
        ).into());
    }

    let create_result: serde_json::Value = create_res.json().await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to parse response: {}", e)))?;

    // 提取 video_id 和状态
    let video_id = create_result["id"].as_str()
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::Other, "No video ID in response"))?
        .to_string();
    
    let status = create_result["status"].as_str().unwrap_or("unknown").to_string();
    let progress = create_result["progress"].as_i64().unwrap_or(0);
    
    println!("   ✅ 视频创建请求已提交");
    println!("   📹 Video ID: {}", video_id);
    println!("   📊 初始状态: {} ({}%)", status, progress);

    // 返回video_id和状态，让前端轮询
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "video_id": video_id,
        "status": status,
        "progress": progress,
        "message": "视频生成已启动，请通过轮询接口查询进度"
    })))
}

// 已移除 upload_image_to_github 函数，改用 Cloudflare R2 存储

// 轮询查询视频生成状态
async fn poll_video_status(
    path: web::Path<(String, i32, String)>,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let (project_id_str, scene_id, video_id) = path.into_inner();
    let project_id = Uuid::parse_str(&project_id_str)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidInput, format!("Invalid project ID: {}", e)))?;

    println!("📡 轮询视频状态: Video ID {}, Scene ID {}", video_id, scene_id);

    // 获取 VEO API Key
    let veo_api_key = std::env::var("VEO_API_KEY")
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::Other, "VEO_API_KEY not set"))?;
    
    let client = Client::new();
    
    // 从环境变量读取 VEO 配置
    let veo_base_url = std::env::var("VEO_BASE_URL")
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::Other, "VEO_BASE_URL not set"))?;
    let veo_query_endpoint = std::env::var("VEO_QUERY_ENDPOINT")
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::Other, "VEO_QUERY_ENDPOINT not set"))?;
    
    // 查询 VEO API 获取视频状态
    let query_url = format!("{}{}?id={}", veo_base_url, veo_query_endpoint, video_id);
    let query_res = client.get(&query_url)
        .header("Accept", "application/json")
        .header("Authorization", format!("Bearer {}", veo_api_key))
        .send()
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to query video status: {}", e)))?;

    if !query_res.status().is_success() {
        let error_text = query_res.text().await.unwrap_or_default();
        return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("VEO API error: {}", error_text)
        })));
    }

    let query_result: serde_json::Value = query_res.json().await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to parse query response: {}", e)))?;

    let status = query_result["status"].as_str().unwrap_or("unknown");
    let progress = query_result["progress"].as_i64().unwrap_or(0);
    
    println!("   > 当前状态: {} ({}%)", status, progress);

    // 如果状态是 completed，下载视频并保存
    if status == "completed" {
        let video_url = query_result["video_url"].as_str()
            .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::Other, "Video completed but no URL in response"))?;

        println!("   📥 开始下载视频: {}", video_url);

        // 下载视频
        let video_response = client.get(video_url)
            .send()
            .await
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to download video: {}", e)))?;

        let video_bytes = video_response.bytes()
            .await
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to read video bytes: {}", e)))?;

        // 保存视频
        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
        let filename = format!("video_{}_{}.mp4", scene_id, timestamp);
        let project_dir = format!("data/projects/{}/videos", project_id);
        fs::create_dir_all(&project_dir)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to create directory: {}", e)))?;
        let filepath = format!("{}/{}", project_dir, filename);
        let local_video_url = format!("/data/projects/{}/videos/{}", project_id, filename);

        let mut file = File::create(&filepath)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to create file: {}", e)))?;
        file.write_all(&video_bytes)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to write file: {}", e)))?;

        println!("   ✅ 视频已保存: {}", local_video_url);

        // 更新数据库
        StoryboardScene::update_latest_video(pool.as_ref(), scene_id, local_video_url.clone())
            .await
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

        // 查询分镜信息以获取提示词
        let scene = StoryboardScene::find_by_id(pool.as_ref(), scene_id)
            .await
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?
            .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "Scene not found"))?;

        // 查询项目信息以获取全局提示词
        let project = Project::find_by_id(pool.as_ref(), project_id)
            .await
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?
            .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "Project not found"))?;

        // 构建完整提示词
        let mut full_prompt = String::new();
        if let Some(global_prompt) = &project.global_video_prompt {
            if !global_prompt.is_empty() {
                full_prompt.push_str(global_prompt);
                full_prompt.push_str(". ");
            }
        }
        if let Some(scene_prompt) = &scene.video_prompt {
            full_prompt.push_str(scene_prompt);
        }

        // 记录历史
        GenerationHistory::create(
            pool.as_ref(),
            scene_id,
            "video".to_string(),
            full_prompt,
            local_video_url.clone(),
        )
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

        println!("🎬 分镜视频生成完成: Scene ID {}", scene_id);

        // 返回完成状态和视频URL
        return Ok(HttpResponse::Ok().json(serde_json::json!({
            "status": status,
            "progress": progress,
            "video_url": local_video_url,
            "message": "视频生成完成"
        })));
    }

    // 返回当前状态（queued, processing, failed等）
    let response = serde_json::json!({
        "status": status,
        "progress": progress,
    });

    // 如果失败，包含错误信息
    if status == "failed" || status == "error" {
        let error_msg = query_result["error"].as_str().unwrap_or("Unknown error");
        return Ok(HttpResponse::Ok().json(serde_json::json!({
            "status": status,
            "progress": progress,
            "error": error_msg
        })));
    }

    Ok(HttpResponse::Ok().json(response))
}

// 拼接角色图片
async fn stitch_character_images(
    path: web::Path<String>,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    use image::{ImageBuffer, Rgba, DynamicImage, imageops};
    
    let project_id_str = path.into_inner();
    let project_id = match Uuid::parse_str(&project_id_str) {
        Ok(id) => id,
        Err(e) => {
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": format!("无效的项目ID: {}", e)
            })));
        }
    };
    
    println!("🎨 开始拼接角色图片: Project ID {}", project_id);
    
    // 获取项目的所有角色
    let characters = match ProjectCharacter::get_all_for_project(pool.as_ref(), project_id).await {
        Ok(chars) => chars,
        Err(e) => {
            eprintln!("❌ 获取角色失败: {}", e);
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("获取角色失败: {}", e)
            })));
        }
    };
    
    if characters.is_empty() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "项目没有角色，无法拼接图片"
        })));
    }
    
    println!("   > 角色数量: {}", characters.len());
    
    // 加载所有角色图片
    let mut images: Vec<DynamicImage> = Vec::new();
    let client = Client::new();
    
    for character in &characters {
        let local_path = if character.image_url.starts_with("/data/") {
            format!(".{}", character.image_url)
        } else if character.image_url.starts_with("http") {
            // 如果是远程URL，需要下载
            let response = match client.get(&character.image_url).send().await {
                Ok(r) => r,
                Err(e) => {
                    eprintln!("❌ 下载图片失败: {}", e);
                    return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                        "error": format!("下载图片失败: {}", e)
                    })));
                }
            };
            
            let bytes = match response.bytes().await {
                Ok(b) => b,
                Err(e) => {
                    eprintln!("❌ 读取图片失败: {}", e);
                    return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                        "error": format!("读取图片失败: {}", e)
                    })));
                }
            };
            
            // 创建临时文件
            let temp_path = format!("data/projects/{}/temp_{}.jpg", project_id, character.id);
            if let Err(e) = fs::create_dir_all(format!("data/projects/{}", project_id)) {
                eprintln!("❌ 创建目录失败: {}", e);
                return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": format!("创建目录失败: {}", e)
                })));
            }
            if let Err(e) = fs::write(&temp_path, bytes) {
                eprintln!("❌ 保存临时文件失败: {}", e);
                return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": format!("保存临时文件失败: {}", e)
                })));
            }
            temp_path
        } else {
            character.image_url.clone()
        };
        
        println!("   > 加载图片: {} - {}", character.name, local_path);
        
        // 使用自动格式检测来加载图片，不依赖扩展名
        let img = match image::io::Reader::open(&local_path) {
            Ok(reader) => {
                match reader.with_guessed_format() {
                    Ok(reader_with_format) => {
                        match reader_with_format.decode() {
                            Ok(i) => i,
                            Err(e) => {
                                eprintln!("❌ 解码图片失败");
                                eprintln!("   角色: {}", character.name);
                                eprintln!("   路径: {}", local_path);
                                eprintln!("   原始URL: {}", character.image_url);
                                eprintln!("   错误: {}", e);
                                return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                                    "error": format!("解码图片失败 (角色: {}): {}", character.name, e)
                                })));
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("❌ 识别图片格式失败");
                        eprintln!("   角色: {}", character.name);
                        eprintln!("   路径: {}", local_path);
                        eprintln!("   原始URL: {}", character.image_url);
                        eprintln!("   错误: {}", e);
                        return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                            "error": format!("识别图片格式失败 (角色: {}): {}", character.name, e)
                        })));
                    }
                }
            }
            Err(e) => {
                eprintln!("❌ 打开图片文件失败");
                eprintln!("   角色: {}", character.name);
                eprintln!("   路径: {}", local_path);
                eprintln!("   原始URL: {}", character.image_url);
                eprintln!("   错误: {}", e);
                return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": format!("打开图片文件失败 (角色: {}): {}", character.name, e)
                })));
            }
        };
        images.push(img);
    }
    
    // 等比例缩放布局算法
    let count = images.len();
    let max_width = 768u32; // 最大宽度
    
    // 等比例缩放所有图片，宽度统一为768px，高度按比例调整
    let mut resized_images: Vec<(DynamicImage, u32, u32)> = Vec::new(); // (图片, 宽度, 高度)
    
    for img in &images {
        let (orig_width, orig_height) = (img.width(), img.height());
        
        // 计算缩放后的高度（保持比例）
        let scale = max_width as f64 / orig_width as f64;
        let new_height = (orig_height as f64 * scale) as u32;
        
        // 使用resize_exact确保缩放到精确尺寸
        let resized = img.resize_exact(max_width, new_height, imageops::FilterType::Lanczos3);
        resized_images.push((resized, max_width, new_height));
    }
    
    // 计算布局 - 自适应网格算法
    // 目标：使最终画板的长宽比尽可能接近 1:1 (正方形)
    
    let avg_height: f64 = resized_images.iter().map(|(_, _, h)| *h as f64).sum::<f64>() / count as f64;
    let mut best_cols = 1;
    let mut best_score = f64::MAX; // Score越接近1越好 (max(ratio, 1/ratio))
    
    // 遍历所有可能的列数配置 (1 到 count)
    for cols in 1..=count {
        let rows = (count as f64 / cols as f64).ceil();
        
        let est_width = cols as f64 * max_width as f64;
        let est_height = rows * avg_height;
        
        let aspect_ratio = est_width / est_height;
        
        // 计算偏离度 score >= 1.0
        let score = if aspect_ratio >= 1.0 {
            aspect_ratio
        } else {
            1.0 / aspect_ratio
        };
        
        // 倾向于更少的行数（如果接近），或者严格按照score
        // 这里简单比较score
        if score < best_score {
            best_score = score;
            best_cols = cols;
        }
    }

    let max_images_per_row = best_cols;
    
    // 计算需要多少行以及每行的高度
    let rows_needed = ((count as f64) / (max_images_per_row as f64)).ceil() as usize;
    
    let mut row_heights: Vec<u32> = Vec::new();
    for row_idx in 0..rows_needed {
        let start_idx = row_idx * max_images_per_row;
        let end_idx = ((row_idx + 1) * max_images_per_row).min(count);
        
        // 这一行的最大高度
        let max_height = resized_images[start_idx..end_idx]
            .iter()
            .map(|(_, _, h)| *h)
            .max()
            .unwrap_or(max_width); // fallback, shouldn't happen
        
        row_heights.push(max_height);
    }
    
    let canvas_width = (max_images_per_row as u32) * max_width;
    let canvas_height: u32 = row_heights.iter().sum();
    
    println!("   > 布局优化: 选中 {} 列 (Score: {:.2})", max_images_per_row, best_score);
    println!("   > 最终布局: {} 行 × {} 列", rows_needed, max_images_per_row);
    println!("   > 画布尺寸: {}x{}", canvas_width, canvas_height);
    
    // 创建白色背景的画布
    let mut canvas: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::new(canvas_width, canvas_height);
    
    // 填充白色背景
    for pixel in canvas.pixels_mut() {
        *pixel = Rgba([255, 255, 255, 255]); // 白色，完全不透明
    }
    
    // 拼接图片
    let mut img_idx = 0;
    let mut y_offset = 0u32;
    
    for row_idx in 0..rows_needed {
        let row_height = row_heights[row_idx];
        let images_in_row = if row_idx == rows_needed - 1 {
            count - (row_idx * max_images_per_row)
        } else {
            max_images_per_row
        };
        
        for col in 0..images_in_row {
            let (ref img, width, height) = resized_images[img_idx];
            let rgba_img = img.to_rgba8();
            
            let x_offset = (col as u32) * max_width;
            
            // 垂直居中对齐
            let vertical_padding = (row_height - height) / 2;
            let final_y_offset = y_offset + vertical_padding;
            
            // 将图片复制到画布
            for y in 0..height {
                for x in 0..width {
                    if x_offset + x < canvas_width && final_y_offset + y < canvas_height {
                        canvas.put_pixel(x_offset + x, final_y_offset + y, *rgba_img.get_pixel(x, y));
                    }
                }
            }
            
            println!("   > 拼接图片 {}: 位置 ({}, {}), 尺寸 {}x{}", img_idx + 1, x_offset, final_y_offset, width, height);
            img_idx += 1;
        }
        
        y_offset += row_height;
    }
    
    let final_image = DynamicImage::ImageRgba8(canvas);
    
    // 保存拼接后的图片
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("combined_characters_{}.jpg", timestamp);
    let project_dir = format!("data/projects/{}", project_id);
    if let Err(e) = fs::create_dir_all(&project_dir) {
        eprintln!("❌ 创建目录失败: {}", e);
        return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("创建目录失败: {}", e)
        })));
    }
    let filepath = format!("{}/{}", project_dir, filename);
    let image_url = format!("/data/projects/{}/{}", project_id, filename);
    
    if let Err(e) = final_image.save(&filepath) {
        eprintln!("❌ 保存图片失败: {}", e);
        return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("保存图片失败: {}", e)
        })));
    }
    
    println!("   ✅ 拼接图片已保存: {}", image_url);
    
    // 更新项目的 combined_characters_image 字段
    if let Err(e) = sqlx::query(
        "UPDATE projects SET combined_characters_image = $1, updated_at = NOW() WHERE id = $2"
    )
    .bind(&image_url)
    .bind(project_id)
    .execute(pool.as_ref())
    .await {
        eprintln!("❌ 更新数据库失败: {}", e);
        return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("更新数据库失败: {}", e)
        })));
    }
    
    println!("🎉 角色图片拼接成功!");
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "角色图片拼接成功",
        "image_url": image_url,
    })))
}

// 删除拼接的角色图片
async fn delete_combined_characters_image(
    path: web::Path<String>,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let project_id_str = path.into_inner();
    let project_id = match Uuid::parse_str(&project_id_str) {
        Ok(id) => id,
        Err(e) => {
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": format!("无效的项目ID: {}", e)
            })));
        }
    };
    
    // 获取项目信息
    let project = match Project::find_by_id(pool.as_ref(), project_id).await {
        Ok(Some(p)) => p,
        Ok(None) => {
            return Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": "项目不存在"
            })));
        }
        Err(e) => {
            eprintln!("❌ 查询项目失败: {}", e);
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("查询项目失败: {}", e)
            })));
        }
    };
    
    // 删除文件（如果存在）
    if let Some(ref image_url) = project.combined_characters_image {
        if image_url.starts_with("/data/") {
            let local_path = format!(".{}", image_url);
            if Path::new(&local_path).exists() {
                fs::remove_file(&local_path)
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to delete file: {}", e)))?;
                println!("   🗑️  已删除文件: {}", local_path);
            }
        }
    }
    
    // 更新数据库，将字段设为 NULL
    sqlx::query(
        "UPDATE projects SET combined_characters_image = NULL, updated_at = NOW() WHERE id = $1"
    )
    .bind(project_id)
    .execute(pool.as_ref())
    .await
    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to update project: {}", e)))?;
    
    println!("✅ 拼接图片已删除");
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "拼接图片已删除"
    })))
}





// 获取项目所有历史记录（画布模式）
async fn get_project_history(
    path: web::Path<String>,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let project_id_str = path.into_inner();
    let project_id = Uuid::parse_str(&project_id_str)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidInput, e))?;

    let history = GenerationHistory::find_by_project_id(pool.as_ref(), project_id)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    Ok(HttpResponse::Ok().json(history))
}

// 获取历史记录
async fn get_generation_history(
    path: web::Path<(String, i32)>,
    query: web::Query<std::collections::HashMap<String, String>>,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let (_project_id_str, scene_id) = path.into_inner();
    let generation_type = query.get("type");

    let history = if let Some(gen_type) = generation_type {
        GenerationHistory::find_by_scene_and_type(pool.as_ref(), scene_id, gen_type)
            .await
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?
    } else {
        GenerationHistory::find_by_scene_id(pool.as_ref(), scene_id)
            .await
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?
    };

    Ok(HttpResponse::Ok().json(history))
}

// 删除历史记录
async fn delete_generation_history(
    path: web::Path<(String, i32, i32)>,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let (_project_id, _scene_id, history_id) = path.into_inner();

    GenerationHistory::delete(pool.as_ref(), history_id)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "History deleted"
    })))
}

// 更新历史记录的创建时间（设置为最新）
async fn update_generation_history_time(
    path: web::Path<(String, i32, i32)>,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let (_project_id, _scene_id, history_id) = path.into_inner();

    let updated_history = GenerationHistory::update_created_at(pool.as_ref(), history_id)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "History time updated",
        "history": updated_history
    })))
}

// 上传文件到历史记录
async fn upload_scene_media(
    path: web::Path<(String, i32)>,
    mut payload: Multipart,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let (project_id_str, scene_id) = path.into_inner();
    let project_id = Uuid::parse_str(&project_id_str)
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid project ID"))?;
    
    println!("📤 开始上传文件: 项目ID={}, 分镜ID={}", project_id, scene_id);
    
    // 验证场景是否存在
    let scene = StoryboardScene::find_by_id(pool.as_ref(), scene_id)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "Scene not found"))?;
    
    if scene.project_id != project_id {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Scene does not belong to this project"
        })));
    }
    
    // 创建上传目录
    let upload_dir = PathBuf::from(format!("./data/projects/{}/scenes/{}/uploads", project_id, scene_id));
    fs::create_dir_all(&upload_dir)?;
    
    let mut file_path = PathBuf::new();
    let mut prompt = String::new();
    let mut generation_type = String::new();
    let mut file_extension = String::new();
    
    // 处理 multipart 表单
    while let Some(item) = payload.next().await {
        let mut field = item?;
        let content_disposition = field.content_disposition();
        let field_name = content_disposition.get_name().unwrap_or("");
        
        match field_name {
            "file" => {
                if let Some(filename) = content_disposition.get_filename() {
                    // 提取文件扩展名
                    file_extension = Path::new(filename)
                        .extension()
                        .and_then(|s| s.to_str())
                        .unwrap_or("bin")
                        .to_string();
                    
                    // 生成唯一文件名
                    let timestamp = chrono::Utc::now().timestamp();
                    let new_filename = format!("{}_{}.{}", timestamp, scene_id, file_extension);
                    let file_path_clone = upload_dir.join(&new_filename);
                    file_path = file_path_clone.clone();
                    
                    // 保存文件
                    let mut f = web::block(move || File::create(file_path_clone))
                        .await??;
                    
                    while let Some(chunk) = field.next().await {
                        let data = chunk?;
                        f = web::block(move || f.write_all(&data).map(|_| f)).await??;
                    }
                    
                    println!("✅ 文件已保存: {:?}", file_path);
                }
            },
            "prompt" => {
                // 读取提示词
                while let Some(chunk) = field.next().await {
                    let data = chunk?;
                    prompt.push_str(&String::from_utf8_lossy(&data));
                }
            },
            "generation_type" => {
                // 读取生成类型
                while let Some(chunk) = field.next().await {
                    let data = chunk?;
                    generation_type.push_str(&String::from_utf8_lossy(&data));
                }
            },
            _ => {
                // 忽略其他字段
                while let Some(_chunk) = field.next().await {}
            }
        }
    }
    
    // 验证文件是否上传
    if file_path.as_os_str().is_empty() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "No file uploaded"
        })));
    }
    
    // 验证生成类型
    if generation_type != "image" && generation_type != "video" {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid generation_type, must be 'image' or 'video'"
        })));
    }
    
    // 验证文件类型
    let valid_image_exts = vec!["jpg", "jpeg", "png", "webp"];
    let valid_video_exts = vec!["mp4", "mov", "webm"];
    
    let is_valid_image = valid_image_exts.contains(&file_extension.to_lowercase().as_str());
    let is_valid_video = valid_video_exts.contains(&file_extension.to_lowercase().as_str());
    
    if generation_type == "image" && !is_valid_image {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid image file format"
        })));
    }
    
    if generation_type == "video" && !is_valid_image && !is_valid_video {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid file format for video generation"
        })));
    }
    
    // 生成相对路径URL
    let relative_path = file_path.strip_prefix("./")
        .unwrap_or(&file_path)
        .to_string_lossy()
        .to_string();
    let result_url = format!("/{}", relative_path.replace("\\", "/"));
    
    // 创建历史记录
    let history = GenerationHistory::create(
        pool.as_ref(),
        scene_id,
        generation_type.clone(),
        prompt.clone(),
        result_url.clone(),
    )
    .await
    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    
    // 更新场景的最新URL
    if generation_type == "image" {
        StoryboardScene::update_latest_image(pool.as_ref(), scene_id, result_url.clone())
            .await
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
            
        // 如果有提示词，同步更新场景的首帧图提示词
        if !prompt.is_empty() {
            StoryboardScene::update_prompts(pool.as_ref(), scene_id, Some(prompt.clone()), None, None)
                .await
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        }
    } else {
        StoryboardScene::update_latest_video(pool.as_ref(), scene_id, result_url.clone())
            .await
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
            
        // 如果有提示词，同步更新场景的视频提示词
        if !prompt.is_empty() {
            StoryboardScene::update_prompts(pool.as_ref(), scene_id, None, Some(prompt.clone()), None)
                .await
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        }
    }
    
    println!("✅ 上传成功: ID={}, URL={}", history.id, result_url);
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "Upload successful",
        "history": history,
        "result_url": result_url
    })))
}

// 在Finder中显示文件
async fn reveal_file_in_finder(
    req_body: web::Json<RevealFileRequest>,
) -> Result<HttpResponse> {
    let file_path = &req_body.file_path;
    
    println!("📁 尝试在Finder中显示文件: {}", file_path);
    
    // 转换为绝对路径
    let absolute_path = if file_path.starts_with("/") {
        // 已经是绝对路径，去掉开头的 /
        PathBuf::from(format!(".{}", file_path))
    } else if file_path.starts_with("./") {
        PathBuf::from(file_path)
    } else {
        PathBuf::from(format!("./{}", file_path))
    };
    
    // 验证文件存在
    if !absolute_path.exists() {
        println!("❌ 文件不存在: {:?}", absolute_path);
        return Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "文件不存在"
        })));
    }
    
    // 验证路径在data目录内（安全检查）
    let canonical_path = match fs::canonicalize(&absolute_path) {
        Ok(path) => path,
        Err(e) => {
            println!("❌ 无法解析路径: {:?} - {}", absolute_path, e);
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": "无效的文件路径"
            })));
        }
    };
    
    let data_dir = match fs::canonicalize("./data") {
        Ok(path) => path,
        Err(_) => {
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "数据目录不存在"
            })));
        }
    };
    
    if !canonical_path.starts_with(&data_dir) {
        println!("❌ 路径不在数据目录内: {:?}", canonical_path);
        return Ok(HttpResponse::Forbidden().json(serde_json::json!({
            "error": "只能访问数据目录内的文件"
        })));
    }
    
    // 使用 open -R 命令在Finder中显示文件（macOS）
    let output = AsyncCommand::new("open")
        .args(&["-R", canonical_path.to_str().unwrap()])
        .output()
        .await;
    
    match output {
        Ok(result) => {
            if result.status.success() {
                println!("✅ 已在Finder中打开: {:?}", canonical_path);
                Ok(HttpResponse::Ok().json(serde_json::json!({
                    "success": true,
                    "message": "文件已在Finder中显示"
                })))
            } else {
                let error_msg = String::from_utf8_lossy(&result.stderr);
                println!("❌ 打开Finder失败: {}", error_msg);
                Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": format!("打开Finder失败: {}", error_msg)
                })))
            }
        },
        Err(e) => {
            println!("❌ 执行open命令失败: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("执行open命令失败: {}", e)
            })))
        }
    }
}

// 合成视频（模拟）
async fn composite_video(
    path: web::Path<String>,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let project_id_str = path.into_inner();
    let project_id = Uuid::parse_str(&project_id_str)
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid project ID"))?;

    println!("🎬 开始合成项目视频: {}", project_id);

    // 1. 获取所有分镜场景，按顺序排列
    let scenes = StoryboardScene::find_by_project_id(pool.as_ref(), project_id)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    // 2. 过滤出有视频的分镜
    let video_scenes: Vec<_> = scenes.iter()
        .filter(|s| s.latest_video_url.is_some())
        .collect();

    if video_scenes.is_empty() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "没有可用的分镜视频，请先生成分镜视频"
        })));
    }

    println!("📊 找到 {} 个分镜视频", video_scenes.len());

    // 3. 创建输出目录
    let project_dir = format!("data/projects/{}/composite", project_id);
    fs::create_dir_all(&project_dir)?;

    // 4. 创建临时文件列表
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let concat_list_path = format!("{}/concat_list_{}.txt", project_dir, timestamp);
    let output_filename = format!("composite_{}.mp4", timestamp);
    let output_path = format!("{}/{}", project_dir, output_filename);
    let video_url = format!("/data/projects/{}/composite/{}", project_id, output_filename);

    // 5. 写入视频文件列表
    let mut concat_content = String::new();
    for scene in &video_scenes {
        if let Some(ref url) = scene.latest_video_url {
            // 转换 URL 为本地路径
            let local_path = if url.starts_with("/data/") {
                format!(".{}", url)
            } else if url.starts_with("http") {
                // 如果是外部URL，跳过（在真实场景中可能需要下载）
                println!("⚠️  跳过外部URL: {}", url);
                continue;
            } else {
                url.clone()
            };

            // 检查文件是否存在
            if !Path::new(&local_path).exists() {
                println!("⚠️  视频文件不存在: {}", local_path);
                continue;
            }

            concat_content.push_str(&format!("file '{}'\n", 
                Path::new(&local_path).canonicalize()
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?
                    .to_str()
                    .unwrap()
            ));
        }
    }

    if concat_content.is_empty() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "没有找到有效的本地视频文件"
        })));
    }

    fs::write(&concat_list_path, concat_content)?;
    println!("📝 创建文件列表: {}", concat_list_path);

    // 6. 执行 ffmpeg 合成
    println!("🎬 开始使用 ffmpeg 合成视频...");
    let output = std::process::Command::new("ffmpeg")
        .args(&[
            "-f", "concat",
            "-safe", "0",
            "-i", &concat_list_path,
            "-c", "copy",
            "-y", // 覆盖已存在的文件
            &output_path,
        ])
        .output()
        .map_err(|e| {
            println!("❌ ffmpeg 执行失败: {}", e);
            std::io::Error::new(std::io::ErrorKind::Other, format!("ffmpeg execution failed: {}", e))
        })?;

    if !output.status.success() {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        println!("❌ ffmpeg 合成失败: {}", error_msg);
        
        // 清理临时文件
        let _ = fs::remove_file(&concat_list_path);
        
        return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("视频合成失败: {}", error_msg)
        })));
    }

    println!("✅ 视频合成成功: {}", output_path);

    // 7. 清理临时文件
    let _ = fs::remove_file(&concat_list_path);

    // 8. 记录合成历史到数据库
    let composite = CompositeVideo::create(
        pool.as_ref(), 
        project_id, 
        video_url.clone(),
        video_scenes.len() as i32
    )
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    println!("🎞️ 视频合成记录已保存: ID {}", composite.id);

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "视频合成成功",
        "composite_id": composite.id,
        "video_url": video_url,
        "scene_count": composite.scene_count,
        "created_at": composite.created_at,
    })))
}

// 获取合成历史
async fn get_composite_history(
    path: web::Path<String>,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let project_id_str = path.into_inner();
    let project_id = Uuid::parse_str(&project_id_str)
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid project ID"))?;

    let composites = CompositeVideo::find_by_project_id(pool.as_ref(), project_id)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    Ok(HttpResponse::Ok().json(composites))
}

// 导出项目首帧图
async fn export_project_images(
    path: web::Path<String>,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let project_id_str = path.into_inner();
    let project_id = Uuid::parse_str(&project_id_str)
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid project ID"))?;

    println!("📦 开始导出项目首帧图到临时目录: {}", project_id);

    // 1. 获取所有分镜场景，按顺序排列
    let scenes = StoryboardScene::find_by_project_id(pool.as_ref(), project_id)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    // 2. 过滤出有首帧图的分镜
    let image_scenes: Vec<_> = scenes.iter()
        .filter(|s| s.latest_image_url.is_some())
        .collect();

    if image_scenes.is_empty() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "没有可导出的首帧图，请先生成首帧图"
        })));
    }

    println!("📊 找到 {} 个首帧图", image_scenes.len());

    // 3. 创建临时导出目录（固定路径）
    let export_path = format!("data/projects/{}/temp_export_images", project_id);
    
    // 4. 如果目录已存在，先清空
    if Path::new(&export_path).exists() {
        println!("🗑️  清空现有临时目录: {}", export_path);
        fs::remove_dir_all(&export_path)?;
    }
    
    // 5. 创建空的导出目录
    println!("📁 创建临时导出目录: {}", export_path);
    fs::create_dir_all(&export_path)?;

    // 6. 复制所有首帧图文件
    for scene in &image_scenes {
        if let Some(ref url) = scene.latest_image_url {
            // 转换 URL 为本地路径
            let local_path = if url.starts_with("/data/") {
                format!(".{}", url)
            } else if url.starts_with("http") {
                println!("⚠️  跳过外部URL: {}", url);
                continue;
            } else {
                url.clone()
            };

            // 检查文件是否存在
            if !Path::new(&local_path).exists() {
                println!("⚠️  首帧图文件不存在: {}", local_path);
                continue;
            }

            // 获取文件扩展名
            let ext = Path::new(&local_path)
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("png");

            // 确定输出文件名
            let output_filename = format!("scene_{}.{}", scene.scene_index, ext);
            let output_path = format!("{}/{}", export_path, output_filename);

            // 复制文件
            fs::copy(&local_path, &output_path)
                .map_err(|e| {
                    println!("❌ 复制文件失败: {} -> {}: {}", local_path, output_path, e);
                    std::io::Error::new(std::io::ErrorKind::Other, format!("复制文件失败: {}", e))
                })?;

            println!("✅ 已复制: {} -> {}", local_path, output_filename);
        }
    }

    println!("✅ 所有首帧图已复制到临时目录: {}", export_path);

    // 7. 打开导出目录
    let canonical_path = fs::canonicalize(&export_path)
        .map_err(|e| {
            println!("❌ 无法解析路径: {:?} - {}", export_path, e);
            std::io::Error::new(std::io::ErrorKind::Other, "无法解析路径")
        })?;

    println!("📂 打开目录: {:?}", canonical_path);

    #[cfg(target_os = "macos")]
    {
        let output = Command::new("open")
            .arg(&canonical_path)
            .output()
            .map_err(|e| {
                println!("❌ 执行open命令失败: {}", e);
                std::io::Error::new(std::io::ErrorKind::Other, format!("执行open命令失败: {}", e))
            })?;

        if !output.status.success() {
            let error_msg = String::from_utf8_lossy(&output.stderr);
            println!("❌ open命令执行失败: {}", error_msg);
        } else {
            println!("✅ 已在Finder中打开目录");
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        println!("⚠️  当前系统不支持自动打开文件管理器");
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "首帧图已导出到临时目录",
        "export_path": export_path,
        "image_count": image_scenes.len(),
    })))
}

// 导出项目视频
async fn export_project_videos(
    path: web::Path<String>,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let project_id_str = path.into_inner();
    let project_id = Uuid::parse_str(&project_id_str)
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid project ID"))?;

    println!("📦 开始导出项目视频到临时目录: {}", project_id);

    // 1. 获取所有分镜场景，按顺序排列
    let scenes = StoryboardScene::find_by_project_id(pool.as_ref(), project_id)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    // 2. 过滤出有视频的分镜
    let video_scenes: Vec<_> = scenes.iter()
        .filter(|s| s.latest_video_url.is_some())
        .collect();

    if video_scenes.is_empty() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "没有可导出的视频，请先生成分镜视频"
        })));
    }

    println!("📊 找到 {} 个分镜视频", video_scenes.len());

    // 3. 创建临时导出目录（固定路径）
    let export_path = format!("data/projects/{}/temp_export", project_id);
    
    // 4. 如果目录已存在，先清空
    if Path::new(&export_path).exists() {
        println!("🗑️  清空现有临时目录: {}", export_path);
        fs::remove_dir_all(&export_path)?;
    }
    
    // 5. 创建空的导出目录
    println!("📁 创建临时导出目录: {}", export_path);
    fs::create_dir_all(&export_path)?;

    // 6. 复制所有视频文件
    for scene in &video_scenes {
        if let Some(ref url) = scene.latest_video_url {
            // 转换 URL 为本地路径
            let local_path = if url.starts_with("/data/") {
                format!(".{}", url)
            } else if url.starts_with("http") {
                println!("⚠️  跳过外部URL: {}", url);
                continue;
            } else {
                url.clone()
            };

            // 检查文件是否存在
            if !Path::new(&local_path).exists() {
                println!("⚠️  视频文件不存在: {}", local_path);
                continue;
            }

            // 确定输出文件名
            let output_filename = format!("scene_{}.mp4", scene.scene_index);
            let output_path = format!("{}/{}", export_path, output_filename);

            // 复制文件
            fs::copy(&local_path, &output_path)
                .map_err(|e| {
                    println!("❌ 复制文件失败: {} -> {}: {}", local_path, output_path, e);
                    std::io::Error::new(std::io::ErrorKind::Other, format!("复制文件失败: {}", e))
                })?;

            println!("✅ 已复制: {} -> {}", local_path, output_filename);
        }
    }

    println!("✅ 所有视频已复制到临时目录: {}", export_path);

    // 7. 打开导出目录
    let canonical_path = fs::canonicalize(&export_path)
        .map_err(|e| {
            println!("❌ 无法解析路径: {:?} - {}", export_path, e);
            std::io::Error::new(std::io::ErrorKind::Other, "无法解析路径")
        })?;

    println!("📂 打开目录: {:?}", canonical_path);

    #[cfg(target_os = "macos")]
    {
        let output = Command::new("open")
            .arg(&canonical_path)
            .output()
            .map_err(|e| {
                println!("❌ 执行open命令失败: {}", e);
                std::io::Error::new(std::io::ErrorKind::Other, format!("执行open命令失败: {}", e))
            })?;

        if !output.status.success() {
            let error_msg = String::from_utf8_lossy(&output.stderr);
            println!("❌ open命令执行失败: {}", error_msg);
        } else {
            println!("✅ 已在Finder中打开目录");
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        println!("⚠️  当前系统不支持自动打开文件管理器");
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "视频已导出到临时目录",
        "export_path": export_path,
        "video_count": video_scenes.len(),
        "is_new_export": true,
    })))
}

// 上传合成视频
async fn upload_composite_video(
    path: web::Path<String>,
    mut payload: Multipart,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let project_id_str = path.into_inner();
    let project_id = Uuid::parse_str(&project_id_str)
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid project ID"))?;

    println!("📤 开始上传合成视频: {}", project_id);

    // 创建合成目录
    let composite_dir = format!("data/projects/{}/composite", project_id);
    fs::create_dir_all(&composite_dir)?;

    let mut video_path = PathBuf::new();

    // 接收上传的视频文件
    while let Some(item) = payload.next().await {
        let mut field = item?;
        let content_disposition = field.content_disposition();
        
        if let Some(filename) = content_disposition.get_filename() {
            
            // 生成时间戳文件名
            let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
            let ext = Path::new(filename)
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("mp4");
            let new_filename = format!("upload_{}.{}", timestamp, ext);
            
            let filepath = PathBuf::from(&composite_dir).join(&new_filename);
            video_path = filepath.clone();
            
            println!("📝 保存文件: {:?}", filepath);
            
            let mut f = web::block(move || std::fs::File::create(filepath))
                .await??;

            while let Some(chunk) = field.next().await {
                let data = chunk?;
                f = web::block(move || f.write_all(&data).map(|_| f)).await??;
            }
            
            println!("✅ 文件上传完成: {}", new_filename);
        }
    }

    if video_path.as_os_str().is_empty() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "未收到视频文件"
        })));
    }

    // 构建视频 URL
    let video_url = format!(
        "/data/projects/{}/composite/{}", 
        project_id, 
        video_path.file_name().unwrap().to_str().unwrap()
    );

    println!("🔗 视频URL: {}", video_url);

    // 保存到数据库（scene_count=0 表示手动上传）
    let composite = CompositeVideo::create(
        pool.as_ref(), 
        project_id, 
        video_url.clone(),
        0  // 0 表示手动上传
    )
    .await
    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    println!("💾 合成视频记录已保存: ID {}", composite.id);

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "视频上传成功",
        "composite": composite,
    })))
}











// ========================================
// 角色管理 API handlers
// ========================================

#[derive(Deserialize)]
struct CreateCharacterRequest {
    name: String,
    prompt: Option<String>,
    display_order: Option<i32>,
}

#[derive(Deserialize)]
struct UpdateCharacterRequest {
    name: String,
    prompt: Option<String>,
    category: Option<String>,
    tags: Option<Vec<String>>,
}

#[derive(Deserialize)]
struct UpdateGlobalPromptRequest {
    global_image_prompt: Option<String>,
    global_video_prompt: Option<String>,
}

#[derive(Deserialize)]
struct SearchSystemCharactersRequest {
    query: Option<String>,
    limit: Option<i64>,
}

async fn get_system_characters(
    pool: web::Data<sqlx::PgPool>,
    query: web::Query<SearchSystemCharactersRequest>,
) -> Result<HttpResponse> {
    let characters = Character::search(pool.as_ref(), query.query.clone(), query.limit)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    Ok(HttpResponse::Ok().json(characters))
}

// 获取待生成角色列表
async fn get_pending_characters(
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let characters = Character::list_pending(pool.as_ref())
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    
    Ok(HttpResponse::Ok().json(characters))
}

// AI生成角色图片
#[derive(Debug, Deserialize)]
struct GenerateCharacterRequest {
    prompt: Option<String>,
}

async fn generate_character_image(
    path: web::Path<String>,
    pool: web::Data<sqlx::PgPool>,
    req_body: Option<web::Json<GenerateCharacterRequest>>,
) -> Result<HttpResponse> {
    let char_id_str = path.into_inner();
    log_api_request(
        &format!("/api/characters/{}/generate", char_id_str),
        "POST",
        &format!("prompt: {:?}", req_body.as_ref().and_then(|r| r.prompt.as_ref()))
    );
    
    let char_id = match Uuid::parse_str(&char_id_str) {
        Ok(id) => id,
        Err(e) => {
            log_api_error("generate_character_image", &e.to_string(), &format!("Invalid UUID: {}", char_id_str));
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Invalid character ID"
            })));
        }
    };
    
    // 查询角色信息
    let character = match sqlx::query_as::<_, Character>("SELECT * FROM characters WHERE id = $1")
        .bind(char_id)
        .fetch_optional(pool.as_ref())
        .await {
        Ok(Some(c)) => c,
        Ok(None) => {
            log_api_error("generate_character_image", "Character not found", &format!("ID: {}", char_id));
            return Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": "Character not found"
            })));
        },
        Err(e) => {
            log_api_error("generate_character_image", &e.to_string(), &format!("Database query failed for ID: {}", char_id));
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Database error: {}", e)
            })));
        }
    };
    
    // 优先使用请求体中的prompt，否则使用数据库中的prompt
    let prompt = if let Some(req) = req_body {
        if let Some(p) = req.prompt.clone() {
            if !p.trim().is_empty() {
                p
            } else {
                match character.prompt {
                    Some(p) => p,
                    None => return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                        "error": "Character has no prompt"
                    })))
                }
            }
        } else {
            match character.prompt {
                Some(p) => p,
                None => return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                    "error": "Character has no prompt"
                })))
            }
        }
    } else {
        match character.prompt {
            Some(p) => p,
            None => return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Character has no prompt"
            })))
        }
    };
    
    // Call Gemini API
    let api_key = std::env::var("GEMINI_API_KEY").expect("GEMINI_API_KEY must be set");
    let client = Client::new();
    
    // 从环境变量读取 Gemini API 配置（必须设置）
    let gemini_base_url = std::env::var("GEMINI_BASE_URL").expect("GEMINI_BASE_URL must be set");
    let gemini_model = std::env::var("GEMINI_MODEL").expect("GEMINI_MODEL must be set");
    let gemini_endpoint = std::env::var("GEMINI_ENDPOINT").expect("GEMINI_ENDPOINT must be set");
    let url = format!("{}{}", gemini_base_url, gemini_endpoint.replace("{model}", &gemini_model));
    
    let payload = serde_json::json!({
        "contents": [{
            "parts": [{"text": prompt}]
        }],
        "generationConfig": {
            "temperature": 0.4,
            "topK": 32,
            "topP": 1,
            "maxOutputTokens": 8192,
        }
    });
    
    log_gemini_request("generate_character_image", &payload);

    // 尝试最多3次请求
    let mut result: Option<serde_json::Value> = None;
    
    for attempt in 1..=3 {
        let res = match client.post(&url)
            .header("Content-Type", "application/json")
            .header("x-goog-api-key", &api_key)
            .json(&payload)
            .send()
            .await {
            Ok(r) => r,
            Err(e) => {
                let err_msg = format!("Network error: {}", e);
                if attempt < 3 {
                    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                    continue;
                }
                log_api_error("generate_character_image", &err_msg, &format!("Gemini API call failed after {} attempts, char_id: {}", attempt, char_id));
                return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": format!("Failed to call Gemini API after {} attempts: {}", attempt, err_msg)
                })));
            }
        };

        let status = res.status();
        if !status.is_success() {
            let error_text = res.text().await.unwrap_or_default();
            log_gemini_response("generate_character_image", status.as_u16(), &error_text);
            
            // 检查是否是空响应错误
            let err_msg = if error_text.contains("empty response") || error_text.contains("channel:empty_response") {
                "Gemini 返回了空响应，可能是提示词触发了安全过滤或内容审核。请尝试修改角色描述，避免使用可能引起歧义的词汇。".to_string()
            } else {
                format!("API error (status {}): {}", status.as_u16(), error_text)
            };
            
            if attempt < 3 {
                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                continue;
            }
            
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": err_msg
            })));
        }

        match res.json::<serde_json::Value>().await {
            Ok(r) => {
                result = Some(r);
                break;
            },
            Err(e) => {
                let err_msg = format!("Failed to parse response: {}", e);
                if attempt < 3 {
                    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                    continue;
                }
                return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": err_msg
                })));
            }
        }
    }

    let result = result.unwrap();

    // Extract image data with better error messages
    let candidates = match result["candidates"].as_array() {
        Some(c) if !c.is_empty() => c,
        _ => {
            log_api_error("generate_character_image", "Empty candidates array", &format!("Response: {}", serde_json::to_string(&result).unwrap_or_default()));
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "AI 模型返回了空结果，这可能是因为：\n1. 提示词包含敏感内容被过滤\n2. 提示词描述不够清晰\n3. API 服务临时故障\n\n建议：请尝试修改角色描述，使用更具体、更中性的语言描述角色外观。"
            })));
        }
    };
    
    let content = match candidates.get(0).and_then(|c| c["content"].as_object()) {
        Some(c) => c,
        None => return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "AI 响应格式错误：缺少内容字段"
        })))
    };
    
    let parts = match content["parts"].as_array() {
        Some(p) => p,
        None => return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "AI 响应格式错误：缺少部件字段"
        })))
    };
    
    let mut image_data_base64 = None;
    for part in parts {
        if let Some(inline_data) = part["inlineData"].as_object() {
            if let Some(data) = inline_data["data"].as_str() {
                image_data_base64 = Some(data);
                break;
            }
        }
    }
    
    let image_data_base64 = match image_data_base64 {
        Some(d) => d,
        None => return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "AI 返回的响应中没有找到图片数据"
        })))
    };
    
    // Decode and save image
    let image_bytes = match base64::engine::general_purpose::STANDARD.decode(image_data_base64) {
        Ok(b) => b,
        Err(e) => return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("Failed to decode base64: {}", e)
        })))
    };
    
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("gemini_{}_{}.png", timestamp, char_id);
    let filepath = format!("data/characters/{}", filename);
    let image_url = format!("/data/characters/{}", filename);
    
    let mut file = match File::create(&filepath) {
        Ok(f) => f,
        Err(e) => return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("Failed to create file: {}", e)
        })))
    };
    if let Err(e) = file.write_all(&image_bytes) {
        return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("Failed to write file: {}", e)
        })));
    }
        
    // Update image_url and updated_at to change timestamp for cache busting
    let updated_character = match sqlx::query_as::<_, Character>(
        "UPDATE characters SET image_url = $1, updated_at = NOW() WHERE id = $2 RETURNING *"
    )
    .bind(image_url.clone())
    .bind(char_id)
    .fetch_one(pool.as_ref())
    .await {
        Ok(c) => c,
        Err(e) => return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("Failed to update character: {}", e)
        })))
    };
    
    println!("🎨 角色图片生成成功: {} (ID: {})", character.name, char_id);
    
    
    // Log Success Response
    log_gemini_response("generate_character_image", 200, &serde_json::to_string_pretty(&result).unwrap_or_default());

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "image_url": image_url,
        "character": updated_character,
    })))
}

fn default_project_type() -> Option<String> {
    Some("video".to_string())
}

#[derive(Debug, Deserialize)]
struct Img2ImgRequest {
    image_base64: String,
    mime_type: String,
    prompt: String,
}

// Image-to-image generation using Gemini
async fn img2img_generate(
    req: web::Json<Img2ImgRequest>,
    _pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    log_api_request("/api/characters/img2img", "POST", &format!("prompt: {}, mime_type: {}", req.prompt, req.mime_type));
    
    let api_key = std::env::var("GEMINI_API_KEY").expect("GEMINI_API_KEY must be set");
    let client = Client::new();
    
    // 从环境变量读取 Gemini API 配置（必须设置）
    let gemini_base_url = std::env::var("GEMINI_BASE_URL").expect("GEMINI_BASE_URL must be set");
    let gemini_model = std::env::var("GEMINI_MODEL").expect("GEMINI_MODEL must be set");
    let gemini_endpoint = std::env::var("GEMINI_ENDPOINT").expect("GEMINI_ENDPOINT must be set");
    let url = format!("{}{}", gemini_base_url, gemini_endpoint.replace("{model}", &gemini_model));
    
    // Build request with image and text
    let payload = serde_json::json!({
        "contents": [{
            "parts": [
                {
                    "inlineData": {
                        "mimeType": req.mime_type,
                        "data": req.image_base64
                    }
                },
                {
                    "text": format!("Based on this reference image, {}", req.prompt)
                }
            ]
        }],
        "generationConfig": {
            "temperature": 0.4,
            "topK": 32,
            "topP": 1,
            "maxOutputTokens": 8192,
        }
    });

    // Log Request
    log_gemini_request("img2img_generate", &payload);

    let res = client.post(url)
        .header("Content-Type", "application/json")
        .header("x-goog-api-key", api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to call Gemini API: {}", e)))?;

    if !res.status().is_success() {
        let status = res.status().as_u16();
        let error_text = res.text().await.unwrap_or_default();
        log_gemini_response("img2img_generate", status, &error_text);
        return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("Gemini API error: {}", error_text)
        })));
    }

    let result: serde_json::Value = res.json().await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to parse Gemini response: {}", e)))?;

    // Extract image data
    let candidates = result["candidates"].as_array().ok_or_else(|| std::io::Error::new(std::io::ErrorKind::Other, "No candidates in response"))?;
    let content = candidates.get(0).and_then(|c| c["content"].as_object()).ok_or_else(|| std::io::Error::new(std::io::ErrorKind::Other, "No content in candidate"))?;
    let parts = content["parts"].as_array().ok_or_else(|| std::io::Error::new(std::io::ErrorKind::Other, "No parts in content"))?;
    
    let mut image_data_base64 = None;
    for part in parts {
        if let Some(inline_data) = part["inlineData"].as_object() {
            if let Some(data) = inline_data["data"].as_str() {
                image_data_base64 = Some(data);
                break;
            }
        }
    }
    
    let image_data_base64 = image_data_base64.ok_or_else(|| std::io::Error::new(std::io::ErrorKind::Other, "No image data found in response"))?;
    
    // Decode and save image
    let image_bytes = base64::engine::general_purpose::STANDARD.decode(image_data_base64)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to decode base64: {}", e)))?;
    
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("gemini_img2img_{}.png", timestamp);
    let filepath = format!("data/characters/{}", filename);
    let image_url = format!("/data/characters/{}", filename);
    
    let mut file = File::create(&filepath)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to create file: {}", e)))?;
    file.write_all(&image_bytes)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to write file: {}", e)))?;
    
    println!("🎨 Image-to-image generation completed: {}", image_url);
    
    // Log Success Response
    log_gemini_response("img2img_generate", 200, &serde_json::to_string_pretty(&result).unwrap_or_default());

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "image_url": image_url,
    })))
}

// 录用角色 (Pending -> Generated)
async fn adopt_character(
    path: web::Path<String>,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let char_id_str = path.into_inner();
    let char_id = Uuid::parse_str(&char_id_str)
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid character ID"))?;
        
    let updated_character = sqlx::query_as::<_, Character>(
        "UPDATE characters SET status = 1 WHERE id = $1 RETURNING *"
    )
    .bind(char_id)
    .fetch_one(pool.as_ref())
    .await
    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "character": updated_character,
    })))
}

async fn get_project_characters(
    path: web::Path<String>,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let project_id_str = path.into_inner();
    let project_id = Uuid::parse_str(&project_id_str)
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid project ID"))?;
    
    match ProjectCharacter::get_all_for_project(pool.as_ref(), project_id).await {
        Ok(characters) => Ok(HttpResponse::Ok().json(characters)),
        Err(e) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        }))),
    }
}


async fn create_project_character(
    path: web::Path<String>,
    pool: web::Data<sqlx::PgPool>,
    req: web::Json<CreateCharacterRequest>,
) -> Result<HttpResponse> {
    let project_id_str = path.into_inner();
    let project_id = Uuid::parse_str(&project_id_str)
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid project ID"))?;
    
    // Create new character in global library
    match Character::create(
        pool.as_ref(), 
        req.name.clone(), 
        "".to_string(), 
        req.prompt.clone(), 
        Some(project_id)
    ).await {
        Ok(character) => {
            // Link to project
            match ProjectCharacter::link(pool.as_ref(), project_id, character.id, req.display_order.unwrap_or(0)).await {
                Ok(_) => {
                    // Return the view struct
                     Ok(HttpResponse::Ok().json(ProjectCharacter { 
                        id: character.id,
                        name: character.name,
                        image_url: character.image_url,
                        prompt: character.prompt,
                        category: character.category,
                        tags: character.tags,
                        display_order: req.display_order.unwrap_or(0)
                    }))
                },
                Err(e) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": format!("Failed to link character: {}", e)
                })))
            }
        },
        Err(e) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        }))),
    }
}


async fn update_project_character(
    pool: web::Data<sqlx::PgPool>,
    path: web::Path<(String, String)>,
    req: web::Json<UpdateCharacterRequest>,
) -> Result<HttpResponse> {
    let (_, char_id_str) = path.into_inner();
    let char_id = Uuid::parse_str(&char_id_str)
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid character ID"))?;
    
    match Character::update(
        pool.as_ref(), 
        char_id, 
        req.name.clone(), 
        req.prompt.clone(),
        req.category.clone(),
        req.tags.clone()
    ).await {
        Ok(character) => Ok(HttpResponse::Ok().json(character)),
        Err(e) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        }))),
    }
}

async fn get_character_detail(
    path: web::Path<String>,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let char_id_str = path.into_inner();
    let char_id = Uuid::parse_str(&char_id_str)
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid character ID"))?;

    let char = sqlx::query_as::<_, Character>("SELECT * FROM characters WHERE id = $1")
        .bind(char_id)
        .fetch_optional(pool.as_ref())
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    match char {
        Some(c) => Ok(HttpResponse::Ok().json(c)),
        None => Ok(HttpResponse::NotFound().json(serde_json::json!({"error": "Character not found"}))),
    }
}

async fn update_character_global(
    pool: web::Data<sqlx::PgPool>,
    path: web::Path<String>,
    req: web::Json<UpdateCharacterRequest>,
) -> Result<HttpResponse> {
    let char_id_str = path.into_inner();
    let char_id = Uuid::parse_str(&char_id_str)
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid character ID"))?;
    
    match Character::update(
        pool.as_ref(), 
        char_id, 
        req.name.clone(), 
        req.prompt.clone(),
        req.category.clone(),
        req.tags.clone()
    ).await {
        Ok(character) => Ok(HttpResponse::Ok().json(character)),
        Err(e) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        }))),
    }
    }

async fn create_character_global(
    pool: web::Data<sqlx::PgPool>,
    req: web::Json<CreateCharacterRequest>,
) -> Result<HttpResponse> {
    log_api_request("/api/characters", "POST", &format!("name: {}, prompt: {:?}", req.name, req.prompt));
    
    match Character::create(
        pool.as_ref(), 
        req.name.clone(), 
        "".to_string(), 
        req.prompt.clone(), 
        None
    ).await {
        Ok(character) => Ok(HttpResponse::Ok().json(character)),
        Err(e) => {
            log_api_error("create_character_global", &e.to_string(), &format!("name: {}", req.name));
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": e.to_string()
            })))
        },
    }
}

async fn upload_character_image_global(
    path: web::Path<String>,
    pool: web::Data<sqlx::PgPool>,
    mut payload: Multipart,
) -> Result<HttpResponse> {
    let char_id_str = path.into_inner();
    let char_id = Uuid::parse_str(&char_id_str)
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid character ID"))?;

    let mut filename = String::new();
    
    while let Ok(Some(mut field)) = payload.try_next().await {
        let content_type = field.content_disposition();
        
        if let Some(name) = content_type.get_name() {
            if name == "file" {
                let ext = Path::new(content_type.get_filename().unwrap_or("image.png"))
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("png");
                
                filename = format!("{}.{}", char_id, ext);
                let filepath = format!("data/characters/{}", filename);
                
                // Ensure directory exists
                fs::create_dir_all("data/characters")?;
                
                let mut f = File::create(filepath)?;
                
                while let Ok(Some(chunk)) = field.try_next().await {
                    f.write_all(&chunk)?;
                }
            }
        }
    }

    if filename.is_empty() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "No file uploaded"
        })));
    }

    let filepath = format!("data/characters/{}", filename);
    
    // 上传到 Cloudflare R2
    let cloudflare_storage = cloudflare::CloudflareStorage::new()
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to create Cloudflare storage: {}", e)))?;
    
    let cloudflare_url = cloudflare_storage.get_or_upload(pool.as_ref(), &filepath, "image")
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to upload to Cloudflare: {}", e)))?;

    println!("   ✅ 角色图片已上传到 Cloudflare: {}", cloudflare_url);
    
    // Update character image_url with Cloudflare URL
    match sqlx::query("UPDATE characters SET image_url = $1 WHERE id = $2")
        .bind(&cloudflare_url)
        .bind(char_id)
        .execute(pool.as_ref())
        .await
    {
        Ok(_) => Ok(HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "image_url": cloudflare_url
        }))),
        Err(e) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        }))),
    }
}


#[derive(Deserialize)]
struct LinkCharacterRequest {
    char_id: Uuid,
    display_order: Option<i32>,
}

async fn link_project_character(
    path: web::Path<String>,
    pool: web::Data<sqlx::PgPool>,
    req: web::Json<LinkCharacterRequest>,
) -> Result<HttpResponse> {
    let project_id_str = path.into_inner();
    let project_id = Uuid::parse_str(&project_id_str)
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid project ID"))?;
    
    // Check if character exists first? Or just try link (FK constraint handles it, but better explicit error)
    // ProjectCharacter::link handles insert.
    
    match ProjectCharacter::link(
        pool.as_ref(), 
        project_id, 
        req.char_id, 
        req.display_order.unwrap_or(0)
    ).await {
        Ok(_) => {
            // Return the full ProjectCharacter view
            let char_data = sqlx::query_as::<_, Character>("SELECT * FROM characters WHERE id = $1")
                .bind(req.char_id)
                .fetch_one(pool.as_ref())
                .await
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
                
            Ok(HttpResponse::Ok().json(ProjectCharacter {
                id: char_data.id,
                name: char_data.name,
                image_url: char_data.image_url,
                prompt: char_data.prompt,
                category: char_data.category,
                tags: char_data.tags,
                display_order: req.display_order.unwrap_or(0)
            }))
        },
        Err(e) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("Failed to link: {}", e)
        })))
    }
}


async fn delete_project_character(
    path: web::Path<(String, String)>,
    pool: web::Data<sqlx::PgPool>,
) -> Result<HttpResponse> {
    let (project_id_str, char_id_str) = path.into_inner();
    let project_id = Uuid::parse_str(&project_id_str).unwrap();
    let char_id = Uuid::parse_str(&char_id_str)
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid character ID"))?;
    
    match ProjectCharacter::unlink(pool.as_ref(), project_id, char_id).await {
        Ok(_) => {
            // 删除角色后，清除拼接的角色图
            if let Ok(Some(project)) = Project::find_by_id(pool.as_ref(), project_id).await {
                if let Some(ref image_url) = project.combined_characters_image {
                    // 删除文件
                    if image_url.starts_with("/data/") {
                        let local_path = format!(".{}", image_url);
                        if Path::new(&local_path).exists() {
                            let _ = fs::remove_file(&local_path);
                            println!("   🗑️  已删除拼接图片: {}", local_path);
                        }
                    }
                    
                    // 更新数据库
                    let _ = sqlx::query(
                        "UPDATE projects SET combined_characters_image = NULL, updated_at = NOW() WHERE id = $1"
                    )
                    .bind(project_id)
                    .execute(pool.as_ref())
                    .await;
                    
                    println!("   ✅ 已清除项目的拼接角色图");
                }
            }
            
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "success": true
            })))
        },
        Err(e) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        }))),
    }
}


async fn update_global_prompt(
    path: web::Path<String>,
    pool: web::Data<sqlx::PgPool>,
    req: web::Json<UpdateGlobalPromptRequest>,
) -> Result<HttpResponse> {
    let project_id_str = path.into_inner();
    let project_id = Uuid::parse_str(&project_id_str)
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid project ID"))?;
    
    match sqlx::query(
        "UPDATE projects SET global_image_prompt = $1, global_video_prompt = $2, updated_at = NOW() WHERE id = $3"
    )
    .bind(&req.global_image_prompt)
    .bind(&req.global_video_prompt)
    .bind(project_id)
    .execute(pool.get_ref())
    .await
    {
        Ok(_) => Ok(HttpResponse::Ok().json(serde_json::json!({
            "success": true
        }))),
        Err(e) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        }))),
    }
}

async fn update_project_script(
    path: web::Path<String>,
    pool: web::Data<sqlx::PgPool>,
    req: web::Json<UpdateScriptRequest>,
) -> Result<HttpResponse> {
    let project_id_str = path.into_inner();
    let project_id = Uuid::parse_str(&project_id_str)
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid project ID"))?;
    
    match sqlx::query(
        "UPDATE projects SET script = $1, updated_at = NOW() WHERE id = $2"
    )
    .bind(&req.script)
    .bind(project_id)
    .execute(pool.get_ref())
    .await
    {
        Ok(_) => Ok(HttpResponse::Ok().json(serde_json::json!({
            "success": true
        }))),
        Err(e) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        }))),
    }
}

async fn delete_character_global(
    pool: web::Data<sqlx::PgPool>,
    path: web::Path<String>,
) -> Result<HttpResponse> {
    let char_id_str = path.into_inner();
    let char_id = Uuid::parse_str(&char_id_str)
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid character ID"))?;
    
    match Character::delete(pool.as_ref(), char_id).await {
        Ok(_) => Ok(HttpResponse::Ok().json(serde_json::json!({
            "success": true
        }))),
        Err(e) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        }))),
    }
}

// 分析角色提示词
async fn analyze_character_prompt(
    req: web::Json<AnalyzeCharacterRequest>,
) -> Result<HttpResponse> {
    log_api_request("/api/characters/analyze", "POST", &format!("prompt length: {}", req.prompt.len()));
    println!("🔍 开始分析角色提示词: {}", req.prompt);
    
    let api_key = std::env::var("GPT_NANO_API_KEY")
        .map_err(|_| {
            println!("❌ 错误: GPT_NANO_API_KEY 环境变量未设置");
            std::io::Error::new(std::io::ErrorKind::Other, "GPT_NANO_API_KEY not found in environment")
        })?;
    
    let client = Client::new();
    
    // 构建系统提示词，让模型返回JSON格式的角色信息
    let system_prompt = format!(
        r#"你是一个角色分析助手。请分析以下角色描述，提取出角色名称、分类和标签。

**重要：请务必使用中文回复，所有字段内容都应该是中文。**

角色描述：
{}

请以JSON格式返回结果，包含以下字段：
- name: 角色名称（如果描述中没有明确名称，请根据描述生成一个合适的中文名字）
- category: 角色分类（例如：主要角色、配角、反派等，必须用中文）
- tags: 标签列表（数组格式，包含角色的特征、性格、能力等，3-5个中文标签）

示例输出格式：
{{
  "name": "艾莉亚",
  "category": "主要角色",
  "tags": ["勇敢", "善良", "魔法师", "年轻", "冒险者"]
}}

请只返回JSON，不要添加其他说明文字。所有内容必须是中文。"#,
        req.prompt
    );
    
    // 调用 GPT-nano API
    let gpt_request = GptNanoRequest {
        model: "gpt-5-nano-2025-08-07".to_string(),
        input: system_prompt,
        temperature: 0.7,
        max_tokens: 500,
    };
    
    println!("📡 正在调用 GPT-nano API...");
    
    // 从环境变量读取 GPT-nano API 配置（必须设置）
    let gpt_nano_base_url = std::env::var("GPT_NANO_BASE_URL")
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::Other, "GPT_NANO_BASE_URL not set"))?;
    let gpt_nano_endpoint = std::env::var("GPT_NANO_ENDPOINT")
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::Other, "GPT_NANO_ENDPOINT not set"))?;
    let gpt_nano_url = format!("{}{}", gpt_nano_base_url, gpt_nano_endpoint);
    
    let response = client
        .post(&gpt_nano_url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&gpt_request)
        .send()
        .await
        .map_err(|e| {
            println!("❌ GPT-nano API 请求失败: {}", e);
            std::io::Error::new(std::io::ErrorKind::Other, format!("GPT-nano API request failed: {}", e))
        })?;
    
    let status = response.status();
    println!("📥 API 响应状态码: {}", status);
    
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        println!("❌ API 返回错误: {}", error_text);
        return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("GPT-nano API 调用失败: {}", error_text)
        })));
    }
    
    // 先获取原始响应文本用于调试
    let response_text = response.text().await
        .map_err(|e| {
            println!("❌ 无法读取响应文本: {}", e);
            std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to read response: {}", e))
        })?;
    
    println!("📄 API 原始响应: {}", &response_text[..response_text.len().min(500)]);
    
    // 解析JSON响应
    let gpt_response: GptNanoResponse = serde_json::from_str(&response_text)
        .map_err(|e| {
            println!("❌ 解析 GPT 响应失败: {}", e);
            std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to parse GPT-nano response: {}", e))
        })?;
    
    println!("✅ 成功解析 GPT 响应，output 数量: {}", gpt_response.output.len());
    
    // 提取响应文本
    let text = gpt_response.output
        .iter()
        .find(|o| o.output_type == "message")
        .and_then(|o| {
            println!("📝 找到 message 类型的输出，content 数量: {}", o.content.len());
            o.content.first()
        })
        .map(|c| {
            println!("📝 提取的文本类型: {}, 文本内容: {}", c.content_type, &c.text[..c.text.len().min(200)]);
            c.text.as_str()
        })
        .ok_or_else(|| {
            println!("❌ 未找到文本内容");
            std::io::Error::new(std::io::ErrorKind::Other, "GPT响应中没有找到文本内容，请检查API返回格式")
        })?;
    
    // 解析JSON响应
    // 先尝试提取JSON（可能被markdown代码块包裹）
    let json_text = if text.contains("```json") {
        println!("🔧 检测到 JSON 代码块，正在提取...");
        text.split("```json")
            .nth(1)
            .and_then(|s| s.split("```").next())
            .unwrap_or(text)
            .trim()
    } else if text.contains("```") {
        println!("🔧 检测到代码块，正在提取...");
        text.split("```")
            .nth(1)
            .and_then(|s| s.split("```").next())
            .unwrap_or(text)
            .trim()
    } else {
        text.trim()
    };
    
    println!("🔍 待解析的 JSON (truncated): {:.100}...", json_text);
    
    #[derive(Deserialize)]
    struct ParsedCharacter {
        name: String,
        category: String,
        tags: Vec<String>,
    }
    
    let parsed: ParsedCharacter = serde_json::from_str(json_text)
        .map_err(|e| {
            println!("❌ 解析角色 JSON 失败: {}", e);
            println!("❌ JSON 文本 (truncated): {:.200}...", json_text);
            std::io::Error::new(
                std::io::ErrorKind::Other, 
                format!("无法解析角色信息JSON。错误: {}", e)
            )
        })?;
    
    println!("✅ 成功解析角色信息: 名称={}, 分类={}, 标签数={}", parsed.name, parsed.category, parsed.tags.len());
    
    Ok(HttpResponse::Ok().json(AnalyzeCharacterResponse {
        name: parsed.name,
        category: parsed.category,
        tags: parsed.tags,
    }))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenv::dotenv().ok();
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("info"));

    println!("🚀 视频虚拟剪辑服务启动中...");
    println!("📡 监听地址: http://localhost:3001");
    println!("🎬 虚拟剪辑接口: POST /api/video/virtual-cut");

    // 创建数据库连接池
    let pool = db::create_pool().await.expect("Failed to create database pool");
    println!("✅ 数据库连接成功");

    // 创建必要的目录
    fs::create_dir_all("data/characters")?;
    fs::create_dir_all("data/projects")?;
    fs::create_dir_all("data/analysis")?;

    HttpServer::new(move || {
        let cors = Cors::permissive();
        
        App::new()
            .app_data(web::Data::new(pool.clone()))
            .wrap(cors)
            // .wrap(middleware::Logger::default())  // 禁用访问日志
            .route("/api/video/virtual-cut", web::post().to(virtual_cut))
            .route("/api/video/youtube-cut", web::post().to(youtube_virtual_cut))
            .route("/api/jobs", web::get().to(get_jobs))
            .route("/api/result/{job_id}", web::get().to(get_result))
            .route("/api/jobs/{job_id}/scenes", web::put().to(update_scenes))
            .route("/api/jobs/{job_id}/split", web::post().to(physical_split))
            .route("/api/jobs/{job_id}/reprocess", web::post().to(reprocess_job))
            .route("/api/jobs/{job_id}", web::delete().to(delete_job))
            // 我的项目 API 路由
            .route("/api/projects", web::get().to(get_projects))
            .route("/api/projects", web::post().to(create_project))
            .route("/api/projects/template/video", web::get().to(download_video_template))
            .route("/api/projects/template/comic", web::get().to(download_comic_template))
            .route("/api/projects/{id}", web::get().to(get_project_detail))
            .route("/api/projects/{id}", web::delete().to(delete_project))
            .route("/api/projects/{id}/history", web::get().to(get_project_history))
            .route("/api/projects/{id}/script", web::put().to(update_project_script))
            .route("/api/projects/{id}/scenes/{scene_id}", web::put().to(update_scene_prompts))
            .route("/api/projects/{id}/scenes/{scene_id}/generate-image", web::post().to(generate_first_frame))
            .route("/api/projects/{id}/scenes/{scene_id}/generate-video", web::post().to(generate_storyboard_video))
            .route("/api/projects/{id}/scenes/{scene_id}/video-status/{video_id}", web::get().to(poll_video_status))
            // Global Character Routes
            .route("/api/characters", web::post().to(create_character_global))
            .route("/api/characters/{id}/image", web::post().to(upload_character_image_global))
            .route("/api/projects/{id}/scenes/{scene_id}/generate-video", web::post().to(generate_storyboard_video))
            .route("/api/projects/{id}/scenes/{scene_id}/history", web::get().to(get_generation_history))
            .route("/api/projects/{id}/scenes/{scene_id}/history/{history_id}", web::delete().to(delete_generation_history))
            .route("/api/projects/{id}/scenes/{scene_id}/history/{history_id}/set-latest", web::put().to(update_generation_history_time))
            .route("/api/projects/{id}/scenes/{scene_id}/upload", web::post().to(upload_scene_media))
            .route("/api/files/reveal", web::post().to(reveal_file_in_finder))
            .route("/api/projects/{id}/composite", web::post().to(composite_video))
            .route("/api/projects/{id}/composites", web::get().to(get_composite_history))
            .route("/api/projects/{id}/composite/upload", web::post().to(upload_composite_video))
            .route("/api/projects/{id}/export-videos", web::post().to(export_project_videos))
            .route("/api/projects/{id}/export-images", web::post().to(export_project_images))
            .route("/api/projects/{id}/characters", web::get().to(get_project_characters))
            .route("/api/projects/{id}/characters", web::post().to(create_project_character))
            .route("/api/projects/{id}/characters/link", web::post().to(link_project_character))
            .route("/api/projects/{id}/characters/{char_id}", web::put().to(update_project_character))
            .route("/api/projects/{id}/characters/{char_id}", web::delete().to(delete_project_character))
            .route("/api/projects/{id}/global-prompt", web::put().to(update_global_prompt))
            .route("/api/projects/{id}/stitch-characters", web::post().to(stitch_character_images))
            .route("/api/projects/{id}/combined-characters", web::delete().to(delete_combined_characters_image))



            .route("/api/system-characters", web::get().to(get_system_characters))
            .route("/api/characters/pending", web::get().to(get_pending_characters))
            .route("/api/characters/{id}", web::get().to(get_character_detail))
            .route("/api/characters/{id}", web::put().to(update_character_global))
            .route("/api/characters/{id}", web::delete().to(delete_character_global))
            .route("/api/characters/{id}/generate", web::post().to(generate_character_image))
            .route("/api/characters/{id}/adopt", web::post().to(adopt_character))
            .route("/api/characters/img2img", web::post().to(img2img_generate))
            .route("/api/characters/analyze", web::post().to(analyze_character_prompt))
            .route("/data/{filename:.*}", web::get().to(serve_data))
    })
    .bind(("127.0.0.1", 3001))?
    .run()
    .await
}

// ----------------------
// Logging Helpers
// ----------------------

/// 统一的日志记录函数，所有日志写入同一个按日期命名的文件
fn write_log(log_type: &str, content: &str) {
    let _ = std::fs::create_dir_all("logs");
    
    let date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let log_file = format!("logs/{}.log", date);
    
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
    {
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let _ = writeln!(file, "[{}] [{}] {}", timestamp, log_type, content);
        let _ = writeln!(file, "{}", "=".repeat(80));
    }
}

// 通用API请求日志
fn log_api_request(endpoint: &str, method: &str, params: &str) {
    let content = format!(
        "{} {}\nParams: {}",
        method, endpoint, params
    );
    write_log("API_REQUEST", &content);
    println!("[API] {} {}", method, endpoint);
}

// API错误日志
fn log_api_error(endpoint: &str, error: &str, context: &str) {
    let content = format!(
        "Endpoint: {}\nContext: {}\nError: {}",
        endpoint, context, error
    );
    write_log("API_ERROR", &content);
    eprintln!("[ERROR] {} - {}", endpoint, error);
}

// Gemini API 请求日志
fn log_gemini_request(endpoint: &str, payload: &serde_json::Value) {
    let content = format!(
        "REQUEST to {}\nPayload: {}",
        endpoint,
        serde_json::to_string_pretty(payload).unwrap_or_default()
    );
    write_log("GEMINI_REQUEST", &content);
}

// Gemini API 响应日志
fn log_gemini_response(endpoint: &str, status: u16, response: &str) {
    let content = format!(
        "RESPONSE from {} (Status: {})\nBody: {}",
        endpoint,
        status,
        response
    );
    write_log("GEMINI_RESPONSE", &content);
}
