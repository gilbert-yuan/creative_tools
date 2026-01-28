-- ========================================
-- 视频工具数据库完整Schema
-- ========================================

-- ========================================
-- 1. 视频分析模块
-- ========================================

-- 视频处理任务表
-- 存储用户上传的视频或 YouTube 链接的处理任务
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY,                           -- 任务唯一标识
    original_filename VARCHAR(255) NOT NULL,        -- 原始文件名
    file_size_bytes BIGINT NOT NULL,               -- 文件大小（字节）
    duration_seconds DOUBLE PRECISION,             -- 视频时长（秒）
    youtube_url TEXT,                              -- YouTube 视频链接（可选）
    status VARCHAR(50) NOT NULL DEFAULT 'processing', -- 任务状态: processing/completed/failed
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- 创建时间
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()  -- 更新时间
);

-- 场景表
-- 存储视频分析后识别的所有场景切换点
CREATE TABLE IF NOT EXISTS scenes (
    id SERIAL PRIMARY KEY,                         -- 场景唯一标识
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE, -- 关联的任务ID
    scene_index INTEGER NOT NULL,                  -- 场景序号
    start_time DOUBLE PRECISION NOT NULL,          -- 开始时间（秒）
    end_time DOUBLE PRECISION NOT NULL,            -- 结束时间（秒）
    duration DOUBLE PRECISION NOT NULL,            -- 持续时间（秒）
    start_timestamp VARCHAR(20) NOT NULL,          -- 开始时间戳（格式化）
    end_timestamp VARCHAR(20) NOT NULL,            -- 结束时间戳（格式化）
    frame_count INTEGER NOT NULL,                  -- 帧数
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- 创建时间
    UNIQUE(job_id, scene_index)                    -- 确保每个任务的场景序号唯一
);

-- ========================================
-- 2. 我的项目模块
-- ========================================

-- 项目表
-- 存储用户创建的视频项目和漫画项目
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- 项目唯一标识
    title VARCHAR(255) NOT NULL,                    -- 项目标题
    script TEXT,                                     -- 剧本内容 (Markdown 格式)
    cover_image_url TEXT,                            -- 封面图 URL
    global_image_prompt TEXT,                        -- 生成首帧图的全局提示词
    global_video_prompt TEXT,                        -- 生成视频的全局提示词
    project_type VARCHAR(20) DEFAULT 'video',        -- 项目类型: 'video' 或 'comic'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- 创建时间
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()   -- 更新时间
);

-- 分镜表
-- 存储项目中的每个分镜场景
CREATE TABLE IF NOT EXISTS storyboard_scenes (
    id SERIAL PRIMARY KEY,                          -- 分镜唯一标识
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE, -- 关联的项目ID
    scene_index INTEGER NOT NULL,                   -- 分镜序号 (对应 JSON 中的 id)
    start_time VARCHAR(20),                         -- 时间轴开始 (可选)
    end_time VARCHAR(20),                           -- 时间轴结束 (可选)
    duration DOUBLE PRECISION,                      -- 分镜时长 (秒，可选)
    first_frame_prompt TEXT,                        -- 首帧图提示词
    video_prompt TEXT,                              -- 视频提示词
    latest_image_url TEXT,                          -- 最新生成的图片 URL
    latest_video_url TEXT,                          -- 最新生成的视频 URL
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- 创建时间
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- 更新时间
    UNIQUE(project_id, scene_index)                 -- 确保每个项目的分镜序号唯一
);

-- 生成历史记录表
-- 存储首帧图和视频的生成历史
CREATE TABLE IF NOT EXISTS generation_history (
    id SERIAL PRIMARY KEY,                          -- 历史记录唯一标识
    scene_id INTEGER NOT NULL REFERENCES storyboard_scenes(id) ON DELETE CASCADE, -- 关联的分镜ID
    generation_type VARCHAR(20) NOT NULL,           -- 生成类型: 'image' 或 'video'
    prompt TEXT NOT NULL,                           -- 使用的提示词
    result_url TEXT NOT NULL,                       -- 生成结果 URL
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()   -- 创建时间
);

-- 合成视频记录表
-- 存储项目的合成视频历史
CREATE TABLE IF NOT EXISTS composite_videos (
    id SERIAL PRIMARY KEY,                          -- 合成视频唯一标识
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE, -- 关联的项目ID
    video_url TEXT NOT NULL,                        -- 合成视频 URL
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()   -- 创建时间
);

-- ========================================
-- 3. 角色管理模块
-- ========================================

-- 统一角色库表
-- 存储所有系统级的可复用角色
CREATE TABLE IF NOT EXISTS characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- 角色唯一标识
    name VARCHAR(255) NOT NULL,                     -- 角色名称
    image_url VARCHAR(255) NOT NULL,                -- 角色图片 URL
    prompt TEXT,                                    -- 角色提示词
    category VARCHAR(100),                          -- 角色分类
    tags TEXT[] DEFAULT '{}',                       -- 角色标签数组
    status INTEGER DEFAULT 0,                       -- 角色状态：0=待生成，1=已生成
    derived_from UUID REFERENCES characters(id),    -- 衍生来源角色ID
    source_project_id UUID REFERENCES projects(id), -- 来源项目ID（如果从项目创建）
    created_at TIMESTAMPTZ DEFAULT NOW(),           -- 创建时间
    updated_at TIMESTAMPTZ DEFAULT NOW(),           -- 更新时间（用于缓存破坏）
    CONSTRAINT system_characters_pkey PRIMARY KEY (id),
    CONSTRAINT system_characters_source_project_id_fkey FOREIGN KEY (source_project_id) REFERENCES projects(id)
);

-- 项目角色关联表
-- 多对多关系：一个项目可以有多个角色，一个角色可以被多个项目使用
CREATE TABLE IF NOT EXISTS project_characters (
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,   -- 项目ID
    character_id UUID REFERENCES characters(id) ON DELETE CASCADE, -- 角色ID
    display_order INTEGER DEFAULT 0,                -- 显示顺序
    created_at TIMESTAMPTZ DEFAULT NOW(),          -- 创建时间
    CONSTRAINT project_characters_link_pkey PRIMARY KEY (project_id, character_id),
    CONSTRAINT project_characters_link_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT project_characters_link_character_id_fkey FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

-- ========================================
-- 索引优化
-- ========================================

-- 视频分析模块索引
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scenes_job_id ON scenes(job_id);
CREATE INDEX IF NOT EXISTS idx_scenes_scene_index ON scenes(job_id, scene_index);

-- 项目模块索引
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_storyboard_project_id ON storyboard_scenes(project_id);
CREATE INDEX IF NOT EXISTS idx_history_scene_id ON generation_history(scene_id);
CREATE INDEX IF NOT EXISTS idx_history_scene_type ON generation_history(scene_id, generation_type);
CREATE INDEX IF NOT EXISTS idx_composite_project_id ON composite_videos(project_id);

-- 角色管理模块索引
CREATE INDEX IF NOT EXISTS idx_characters_created_at ON characters(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_characters_updated_at ON characters(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_characters_name ON characters(name);
CREATE INDEX IF NOT EXISTS idx_project_characters_project_id ON project_characters(project_id);
CREATE INDEX IF NOT EXISTS idx_project_characters_order ON project_characters(project_id, display_order);

-- ========================================
-- 注释说明
-- ========================================

COMMENT ON TABLE jobs IS '视频处理任务表';
COMMENT ON TABLE scenes IS '视频场景表';
COMMENT ON TABLE projects IS '用户项目表';
COMMENT ON TABLE storyboard_scenes IS '项目分镜表';
COMMENT ON TABLE generation_history IS '图片/视频生成历史记录表';
COMMENT ON TABLE composite_videos IS '合成视频记录表';
COMMENT ON TABLE characters IS '统一角色库表';
COMMENT ON TABLE project_characters IS '项目角色关联表';
