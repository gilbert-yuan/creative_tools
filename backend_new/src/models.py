from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, JSON, Boolean, ARRAY
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
from datetime import datetime
import uuid

Base = declarative_base()

class Job(Base):
    __tablename__ = "jobs"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    original_filename = Column(String, nullable=False)
    file_size_bytes = Column(Integer, nullable=False)
    duration_seconds = Column(Float, nullable=True)
    youtube_url = Column(String, nullable=True)
    status = Column(String, nullable=False, default="processing")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __init__(self, id=None, original_filename=None, file_size_bytes=None, duration_seconds=None, 
                 youtube_url=None, status="processing"):
        self.id = id or str(uuid.uuid4())
        self.original_filename = original_filename
        self.file_size_bytes = file_size_bytes
        self.duration_seconds = duration_seconds
        self.youtube_url = youtube_url
        self.status = status

class Scene(Base):
    __tablename__ = "scenes"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String, ForeignKey("jobs.id"), nullable=False)
    scene_index = Column(Integer, nullable=False)
    start_time = Column(Float, nullable=False)
    end_time = Column(Float, nullable=False)
    duration = Column(Float, nullable=False)
    start_timestamp = Column(String, nullable=False)
    end_timestamp = Column(String, nullable=False)
    frame_count = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    def __init__(self, job_id=None, scene_index=None, start_time=None, end_time=None, 
                 duration=None, start_timestamp=None, end_timestamp=None, frame_count=None):
        self.job_id = job_id
        self.scene_index = scene_index
        self.start_time = start_time
        self.end_time = end_time
        self.duration = duration
        self.start_timestamp = start_timestamp
        self.end_timestamp = end_timestamp
        self.frame_count = frame_count

class Project(Base):
    __tablename__ = "projects"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=False)
    script = Column(Text, nullable=True)
    cover_image_url = Column(String, nullable=True)
    global_image_prompt = Column(Text, nullable=True)
    global_video_prompt = Column(Text, nullable=True)
    combined_characters_image = Column(String, nullable=True)
    project_type = Column(String, nullable=True, default="video")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __init__(self, title=None, script=None, cover_image_url=None, global_image_prompt=None, 
                 global_video_prompt=None, combined_characters_image=None, project_type="video"):
        self.id = str(uuid.uuid4())
        self.title = title
        self.script = script
        self.cover_image_url = cover_image_url
        self.global_image_prompt = global_image_prompt
        self.global_video_prompt = global_video_prompt
        self.combined_characters_image = combined_characters_image
        self.project_type = project_type

class StoryboardScene(Base):
    __tablename__ = "storyboard_scenes"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    scene_index = Column(Integer, nullable=False)
    start_time = Column(String, nullable=True)
    end_time = Column(String, nullable=True)
    duration = Column(Float, nullable=True)
    first_frame_prompt = Column(Text, nullable=True)
    video_prompt = Column(Text, nullable=True)
    latest_image_url = Column(String, nullable=True)
    latest_video_url = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __init__(self, project_id=None, scene_index=None, start_time=None, end_time=None, 
                 duration=None, first_frame_prompt=None, video_prompt=None, 
                 latest_image_url=None, latest_video_url=None):
        self.project_id = project_id
        self.scene_index = scene_index
        self.start_time = start_time
        self.end_time = end_time
        self.duration = duration
        self.first_frame_prompt = first_frame_prompt
        self.video_prompt = video_prompt
        self.latest_image_url = latest_image_url
        self.latest_video_url = latest_video_url

class GenerationHistory(Base):
    __tablename__ = "generation_history"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    scene_id = Column(Integer, ForeignKey("storyboard_scenes.id"), nullable=False)
    generation_type = Column(String, nullable=False)
    prompt = Column(Text, nullable=False)
    result_url = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    def __init__(self, scene_id=None, generation_type=None, prompt=None, result_url=None):
        self.scene_id = scene_id
        self.generation_type = generation_type
        self.prompt = prompt
        self.result_url = result_url

class CompositeVideo(Base):
    __tablename__ = "composite_videos"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    video_url = Column(String, nullable=False)
    scene_count = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    def __init__(self, project_id=None, video_url=None, scene_count=None):
        self.project_id = project_id
        self.video_url = video_url
        self.scene_count = scene_count

class Character(Base):
    __tablename__ = "characters"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    image_url = Column(String, nullable=False, default="")
    prompt = Column(Text, nullable=True)
    category = Column(String, nullable=True)
    tags = Column(ARRAY(String), nullable=False, default=list)
    status = Column(Integer, nullable=False, default=1)
    derived_from = Column(String, nullable=True)
    source_project_id = Column(String, ForeignKey("projects.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    def __init__(self, name=None, image_url="", prompt=None, category=None, tags=None, 
                 status=1, derived_from=None, source_project_id=None):
        self.id = str(uuid.uuid4())
        self.name = name
        self.image_url = image_url
        self.prompt = prompt
        self.category = category
        self.tags = tags or []
        self.status = status
        self.derived_from = derived_from
        self.source_project_id = source_project_id

class ProjectCharacter(Base):
    __tablename__ = "project_characters"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    character_id = Column(String, ForeignKey("characters.id"), nullable=False)
    display_order = Column(Integer, nullable=False, default=0)
    
    def __init__(self, project_id=None, character_id=None, display_order=0):
        self.project_id = project_id
        self.character_id = character_id
        self.display_order = display_order

class UploadedFile(Base):
    __tablename__ = "uploaded_files"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    file_hash = Column(String, nullable=False, unique=True)
    cloudflare_url = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    file_size_bytes = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    def __init__(self, file_hash=None, cloudflare_url=None, file_type=None, file_size_bytes=None):
        self.file_hash = file_hash
        self.cloudflare_url = cloudflare_url
        self.file_type = file_type
        self.file_size_bytes = file_size_bytes
