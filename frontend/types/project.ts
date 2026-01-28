// 我的项目功能 - TypeScript 类型定义

export interface Project {
  id: string;
  title: string;
  script?: string;
  project_type?: string;  // 项目类型: video | comic
  cover_image_url?: string;
  global_image_prompt?: string;
  global_video_prompt?: string;
  combined_characters_image?: string;
  created_at: string;
  updated_at: string;
}

export interface StoryboardScene {
  id: number;
  project_id: string;
  scene_index: number;
  start_time: string | null;
  end_time: string | null;
  duration: number | null;
  first_frame_prompt: string | null;
  video_prompt: string | null;
  latest_image_url: string | null;
  latest_video_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface GenerationHistory {
  id: number;
  scene_id: number;
  generation_type: string;
  prompt: string | null;
  result_url: string;
  created_at: string;
}

export interface CompositeVideo {
  id: number;
  project_id: string;
  video_url: string;
  scene_count: number;
  created_at: string;
}

export interface ProjectCharacter {
  id: string;
  project_id: string;
  name: string;
  image_url: string;
  prompt: string | null;
  category: string | null;
  tags: string[];
  status: number;
  derived_from: string | null;
  display_order: number;
}

// API请求和响应类型
export interface ProjectWithScenes {
  project: Project;
  scenes: StoryboardScene[];
}

// 项目导入格式（JSON）
export interface ProjectImport {
  标题: string;
  剧本: string;
  首帧图全局提示词?: string;
  视频全局提示词?: string;
  角色?: CharacterImport[];
  分镜: SceneImport[];
}

export interface CharacterImport {
  角色名称: string;
  分类?: string;
  标签?: string;
  提示词: string;
}

export interface SceneImport {
  id: number;
  首帧图提示词: string;
  视频提示词: string;
}
