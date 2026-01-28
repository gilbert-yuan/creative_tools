use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Job {
    pub id: Uuid,
    pub original_filename: String,
    pub file_size_bytes: i64,
    pub duration_seconds: Option<f64>,
    pub youtube_url: Option<String>,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Scene {
    pub id: i32,
    pub job_id: Uuid,
    pub scene_index: i32,
    pub start_time: f64,
    pub end_time: f64,
    pub duration: f64,
    pub start_timestamp: String,
    pub end_timestamp: String,
    pub frame_count: i32,
    pub created_at: DateTime<Utc>,
}



// 数据库操作
impl Job {
    pub async fn create(
        pool: &sqlx::PgPool,
        id: Uuid,
        filename: String,
        file_size: i64,
        youtube_url: Option<String>,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as::<_, Job>(
            r#"
            INSERT INTO jobs (id, original_filename, file_size_bytes, youtube_url, status)
            VALUES ($1, $2, $3, $4, 'processing')
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(filename)
        .bind(file_size)
        .bind(youtube_url)
        .fetch_one(pool)
        .await
    }

    pub async fn update_status(
        pool: &sqlx::PgPool,
        id: Uuid,
        status: &str,
        duration: Option<f64>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE jobs
            SET status = $1, duration_seconds = $2, updated_at = NOW()
            WHERE id = $3
            "#,
        )
        .bind(status)
        .bind(duration)
        .bind(id)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn find_by_id(pool: &sqlx::PgPool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as::<_, Job>("SELECT * FROM jobs WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    pub async fn list_all(pool: &sqlx::PgPool, limit: i64, offset: i64) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as::<_, Job>(
            "SELECT * FROM jobs ORDER BY created_at DESC LIMIT $1 OFFSET $2"
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
    }

    pub async fn delete(pool: &sqlx::PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        // 先删除关联的 scenes
        Scene::delete_by_job_id(pool, id).await?;
        
        // 删除 job 记录
        sqlx::query("DELETE FROM jobs WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;

        // 删除本地文件（视频和分镜结果）
        let job_dir = format!("./uploads/{}", id);
        if std::path::Path::new(&job_dir).exists() {
            match std::fs::remove_dir_all(&job_dir) {
                Ok(_) => println!("🗑️  已删除 job 文件夹: {}", job_dir),
                Err(e) => eprintln!("⚠️  删除 job 文件夹失败: {} - {}", job_dir, e),
            }
        }

        Ok(())
    }
}

impl Scene {
    pub async fn create(
        pool: &sqlx::PgPool,
        job_id: Uuid,
        scene_index: i32,
        start_time: f64,
        end_time: f64,
        duration: f64,
        start_timestamp: String,
        end_timestamp: String,
        frame_count: i32,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as::<_, Scene>(
            r#"
            INSERT INTO scenes (
                job_id, scene_index, start_time, end_time, duration,
                start_timestamp, end_timestamp, frame_count
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
            "#,
        )
        .bind(job_id)
        .bind(scene_index)
        .bind(start_time)
        .bind(end_time)
        .bind(duration)
        .bind(start_timestamp)
        .bind(end_timestamp)
        .bind(frame_count)
        .fetch_one(pool)
        .await
    }

    pub async fn find_by_job_id(pool: &sqlx::PgPool, job_id: Uuid) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as::<_, Scene>(
            "SELECT * FROM scenes WHERE job_id = $1 ORDER BY scene_index"
        )
        .bind(job_id)
        .fetch_all(pool)
        .await
    }

    pub async fn delete_by_job_id(pool: &sqlx::PgPool, job_id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM scenes WHERE job_id = $1")
            .bind(job_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    pub async fn batch_create(
        pool: &sqlx::PgPool,
        job_id: Uuid,
        scenes: Vec<(i32, f64, f64, f64, String, String, i32)>,
    ) -> Result<u64, sqlx::Error> {
        let mut count = 0u64;
        
        for (scene_index, start_time, end_time, duration, start_timestamp, end_timestamp, frame_count) in scenes {
            sqlx::query(
                r#"
                INSERT INTO scenes (
                    job_id, scene_index, start_time, end_time, duration,
                    start_timestamp, end_timestamp, frame_count
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                "#,
            )
            .bind(job_id)
            .bind(scene_index)
            .bind(start_time)
            .bind(end_time)
            .bind(duration)
            .bind(start_timestamp)
            .bind(end_timestamp)
            .bind(frame_count)
            .execute(pool)
            .await?;
            
            count += 1;
        }
        
        Ok(count)
    }

}


// ========================================
// 我的项目功能 - 数据模型
// ========================================

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Project {
    pub id: Uuid,
    pub title: String,
    pub script: Option<String>,
    pub cover_image_url: Option<String>,
    pub global_image_prompt: Option<String>,
    pub global_video_prompt: Option<String>,
    pub combined_characters_image: Option<String>,
    pub project_type: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct StoryboardScene {
    pub id: i32,
    pub project_id: Uuid,
    pub scene_index: i32,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub duration: Option<f64>,
    pub first_frame_prompt: Option<String>,
    pub video_prompt: Option<String>,
    pub latest_image_url: Option<String>,
    pub latest_video_url: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct GenerationHistory {
    pub id: i32,
    pub scene_id: i32,
    pub generation_type: String,
    pub prompt: String,
    pub result_url: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct CompositeVideo {
    pub id: i32,
    pub project_id: Uuid,
    pub video_url: String,
    pub scene_count: i32,
    pub created_at: DateTime<Utc>,
}

// ========================================
// Project 数据库操作
// ========================================
impl Project {
    pub async fn create(
        pool: &sqlx::PgPool,
        title: String,
        script: Option<String>,
        project_type: Option<String>,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as::<_, Project>(
            r#"
            INSERT INTO projects (title, script, project_type)
            VALUES ($1, $2, $3)
            RETURNING *
            "#,
        )
        .bind(title)
        .bind(script)
        .bind(project_type.unwrap_or_else(|| "video".to_string()))
        .fetch_one(pool)
        .await
    }

    pub async fn find_by_id(pool: &sqlx::PgPool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as::<_, Project>("SELECT * FROM projects WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    pub async fn list_all(
        pool: &sqlx::PgPool,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as::<_, Project>(
            "SELECT * FROM projects ORDER BY created_at DESC LIMIT $1 OFFSET $2",
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
    }

    pub async fn list_by_type(
        pool: &sqlx::PgPool,
        project_type: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as::<_, Project>(
            "SELECT * FROM projects WHERE project_type = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
        )
        .bind(project_type)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
    }

    pub async fn delete(pool: &sqlx::PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        let mut tx = pool.begin().await?;

        // 获取所有分镜场景ID
        let scene_ids: Vec<i32> = sqlx::query_scalar(
            "SELECT id FROM storyboard_scenes WHERE project_id = $1"
        )
        .bind(id)
        .fetch_all(&mut *tx)
        .await?;

        // 删除所有分镜的生成历史记录
        if !scene_ids.is_empty() {
            sqlx::query("DELETE FROM generation_history WHERE scene_id = ANY($1)")
                .bind(&scene_ids)
                .execute(&mut *tx)
                .await?;
        }

        // 解除角色与项目的关联（将 source_project_id 设置为 NULL）
        sqlx::query("UPDATE characters SET source_project_id = NULL WHERE source_project_id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;

        // 删除项目关联的角色链接
        sqlx::query("DELETE FROM project_characters WHERE project_id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;

        // 删除项目的分镜
        sqlx::query("DELETE FROM storyboard_scenes WHERE project_id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;

        // 删除项目的合成视频记录
        sqlx::query("DELETE FROM composite_videos WHERE project_id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;

        // 删除项目本身
        sqlx::query("DELETE FROM projects WHERE id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;

        // 删除项目的本地文件
        let project_dir = format!("./data/projects/{}", id);
        if std::path::Path::new(&project_dir).exists() {
            match std::fs::remove_dir_all(&project_dir) {
                Ok(_) => println!("🗑️  已删除项目文件夹: {}", project_dir),
                Err(e) => eprintln!("⚠️  删除项目文件夹失败: {} - {}", project_dir, e),
            }
        }

        Ok(())
    }
}

// ========================================
// StoryboardScene 数据库操作
// ========================================
impl StoryboardScene {


    pub async fn batch_create(
        pool: &sqlx::PgPool,
        project_id: Uuid,
        scenes: Vec<(i32, Option<f64>, Option<String>, Option<String>)>,
    ) -> Result<u64, sqlx::Error> {
        let mut count = 0u64;

        for (scene_index, duration, first_frame_prompt, video_prompt) in scenes {
            sqlx::query(
                r#"
                INSERT INTO storyboard_scenes (
                    project_id, scene_index, duration, first_frame_prompt, video_prompt
                )
                VALUES ($1, $2, $3, $4, $5)
                "#,
            )
            .bind(project_id)
            .bind(scene_index)
            .bind(duration)
            .bind(&first_frame_prompt)
            .bind(&video_prompt)
            .execute(pool)
            .await?;

            count += 1;
        }

        Ok(count)
    }

    pub async fn find_by_project_id(
        pool: &sqlx::PgPool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as::<_, StoryboardScene>(
            "SELECT * FROM storyboard_scenes WHERE project_id = $1 ORDER BY scene_index",
        )
        .bind(project_id)
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &sqlx::PgPool, id: i32) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as::<_, StoryboardScene>("SELECT * FROM storyboard_scenes WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    pub async fn update_prompts(
        pool: &sqlx::PgPool,
        id: i32,
        first_frame_prompt: Option<String>,
        video_prompt: Option<String>,
        duration: Option<f64>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE storyboard_scenes
            SET first_frame_prompt = $1, video_prompt = $2, duration = $3, updated_at = NOW()
            WHERE id = $4
            "#,
        )
        .bind(first_frame_prompt)
        .bind(video_prompt)
        .bind(duration)
        .bind(id)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn update_latest_image(
        pool: &sqlx::PgPool,
        id: i32,
        image_url: String,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE storyboard_scenes
            SET latest_image_url = $1, updated_at = NOW()
            WHERE id = $2
            "#,
        )
        .bind(image_url)
        .bind(id)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn update_latest_video(
        pool: &sqlx::PgPool,
        id: i32,
        video_url: String,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE storyboard_scenes
            SET latest_video_url = $1, updated_at = NOW()
            WHERE id = $2
            "#,
        )
        .bind(video_url)
        .bind(id)
        .execute(pool)
        .await?;
        Ok(())
    }
}

// ========================================
// GenerationHistory 数据库操作
// ========================================
impl GenerationHistory {
    pub async fn create(
        pool: &sqlx::PgPool,
        scene_id: i32,
        generation_type: String,
        prompt: String,
        result_url: String,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as::<_, GenerationHistory>(
            r#"
            INSERT INTO generation_history (scene_id, generation_type, prompt, result_url)
            VALUES ($1, $2, $3, $4)
            RETURNING *
            "#,
        )
        .bind(scene_id)
        .bind(generation_type)
        .bind(prompt)
        .bind(result_url)
        .fetch_one(pool)
        .await
    }

    pub async fn find_by_scene_id(
        pool: &sqlx::PgPool,
        scene_id: i32,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as::<_, GenerationHistory>(
            "SELECT * FROM generation_history WHERE scene_id = $1 ORDER BY created_at DESC",
        )
        .bind(scene_id)
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_scene_and_type(
        pool: &sqlx::PgPool,
        scene_id: i32,
        generation_type: &str,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as::<_, GenerationHistory>(
            "SELECT * FROM generation_history WHERE scene_id = $1 AND generation_type = $2 ORDER BY created_at DESC",
        )
        .bind(scene_id)
        .bind(generation_type)
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_project_id(
        pool: &sqlx::PgPool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as::<_, GenerationHistory>(
            r#"
            SELECT gh.*
            FROM generation_history gh
            JOIN storyboard_scenes ss ON gh.scene_id = ss.id
            WHERE ss.project_id = $1
            ORDER BY gh.created_at DESC
            "#
        )
        .bind(project_id)
        .fetch_all(pool)
        .await
    }

    pub async fn delete(pool: &sqlx::PgPool, id: i32) -> Result<(), sqlx::Error> {
        // 1. 获取记录以找到文件路径
        let history = sqlx::query_as::<_, GenerationHistory>("SELECT * FROM generation_history WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await?;

        if let Some(h) = history {
            // 2. 尝试删除文件
            // result_url 可能是 "/data/projects/..." 或者是完整的 URL
            // 我们假设它是相对路径或以 /data 开头
            let file_path = if h.result_url.starts_with("/data/") {
                format!(".{}", h.result_url) // ./data/...
            } else {
                // 如果是完整的URL或其他格式，可能需要额外处理，这里先假设是本地路径
                // 如果存储的是完整URL且指向外部服务，则无法删除文件
                String::new()
            };

            if !file_path.is_empty() {
                if let Err(e) = std::fs::remove_file(&file_path) {
                    eprintln!("⚠️ 删除历史文件失败: {} - {}", file_path, e);
                    // 继续删除数据库记录
                } else {
                    println!("🗑️ 已删除历史文件: {}", file_path);
                }
            }

            // 3. 删除数据库记录
            sqlx::query("DELETE FROM generation_history WHERE id = $1")
                .bind(id)
                .execute(pool)
                .await?;
        }

        Ok(())
    }

    pub async fn update_created_at(pool: &sqlx::PgPool, id: i32) -> Result<Self, sqlx::Error> {
        sqlx::query_as::<_, GenerationHistory>(
            "UPDATE generation_history SET created_at = NOW() WHERE id = $1 RETURNING *"
        )
        .bind(id)
        .fetch_one(pool)
        .await
    }
}

// ========================================
// CompositeVideo 数据库操作
// ========================================
impl CompositeVideo {
    pub async fn create(
        pool: &sqlx::PgPool,
        project_id: Uuid,
        video_url: String,
        scene_count: i32,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as::<_, CompositeVideo>(
            r#"
            INSERT INTO composite_videos (project_id, video_url, scene_count)
            VALUES ($1, $2, $3)
            RETURNING *
            "#,
        )
        .bind(project_id)
        .bind(video_url)
        .bind(scene_count)
        .fetch_one(pool)
        .await
    }

    pub async fn find_by_project_id(
        pool: &sqlx::PgPool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as::<_, CompositeVideo>(
            "SELECT * FROM composite_videos WHERE project_id = $1 ORDER BY created_at DESC",
        )
        .bind(project_id)
        .fetch_all(pool)
        .await
    }
}
// 添加到 models.rs 文件末尾

// ========================================
// 全局控制功能 - 角色管理
// ========================================

// ========================================
// 统一角色库模型
// ========================================

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Character {
    pub id: Uuid,
    pub name: String,
    pub image_url: String,
    pub prompt: Option<String>,
    pub category: Option<String>,
    pub tags: Vec<String>,
    pub status: i32,
    pub derived_from: Option<Uuid>,
    pub source_project_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ProjectCharacter {
    pub id: Uuid, // maps to character_id
    pub name: String,
    pub image_url: String,
    pub prompt: Option<String>,
    pub category: Option<String>,
    pub tags: Vec<String>,
    pub display_order: i32,
}

impl Character {
    pub async fn create(
        pool: &sqlx::PgPool,
        name: String,
        image_url: String,
        prompt: Option<String>,
        source_project_id: Option<Uuid>,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as::<_, Self>(
            "INSERT INTO characters (name, image_url, prompt, source_project_id, tags, status) VALUES ($1, $2, $3, $4, '{}', 1) RETURNING *"
        )
        .bind(name)
        .bind(image_url)
        .bind(prompt)
        .bind(source_project_id)
        .fetch_one(pool)
        .await
    }

    // 创建待生成角色
    pub async fn create_pending(
        pool: &sqlx::PgPool,
        name: String,
        prompt: Option<String>,
        category: Option<String>,
        tags: Vec<String>,
        source_project_id: Option<Uuid>,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as::<_, Self>(
            "INSERT INTO characters (name, image_url, prompt, category, tags, status, source_project_id) VALUES ($1, '', $2, $3, $4, 0, $5) RETURNING *"
        )
        .bind(name)
        .bind(prompt)
        .bind(category)
        .bind(tags)
        .bind(source_project_id)
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &sqlx::PgPool, 
        id: Uuid, 
        name: String, 
        prompt: Option<String>,
        category: Option<String>,
        tags: Option<Vec<String>>
    ) -> Result<Self, sqlx::Error> {
        // If query parameters like tags are missing, keep existing.
        // But here we usually do full update or partial.
        // Let's assume full update for simplicity or use COALESCE if parameter is Option<Option<>>.
        // Here I'll change signature to strict optional update?
        // Or just UPDATE ... SET ...
        // If tags passed as None, do we clear or ignore?
        // Let's assume we pass the new state.
        
        let mut query_builder = sqlx::QueryBuilder::new("UPDATE characters SET name = ");
        query_builder.push_bind(name);
        query_builder.push(", prompt = ");
        query_builder.push_bind(prompt);

        if let Some(cat) = category {
             query_builder.push(", category = ");
             query_builder.push_bind(cat);
        }
        
        if let Some(t) = tags {
             query_builder.push(", tags = ");
             query_builder.push_bind(t);
        }

        query_builder.push(" WHERE id = ");
        query_builder.push_bind(id);
        query_builder.push(" RETURNING *");

        query_builder.build_query_as::<Self>()
            .fetch_one(pool)
            .await
    }
    




    pub async fn delete(pool: &sqlx::PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        let mut tx = pool.begin().await?;

        // First unlink from all projects
        sqlx::query("DELETE FROM project_characters WHERE character_id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
            
        // Then delete the character
        sqlx::query("DELETE FROM characters WHERE id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(())
    }

    pub async fn search(pool: &sqlx::PgPool, query: Option<String>, limit: Option<i64>) -> Result<Vec<Self>, sqlx::Error> {
        match query {
            Some(q) if !q.is_empty() => {
                // 尝试解析为UUID进行精确ID匹配
                if let Ok(uuid) = Uuid::parse_str(&q) {
                    let result = sqlx::query_as::<_, Self>(
                        "SELECT * FROM characters WHERE id = $1 AND status = 1"
                    )
                    .bind(uuid)
                    .fetch_all(pool)
                    .await?;
                    return Ok(result);
                }
                
                // 否则按名称模糊搜索（只搜索已生成的角色）
                let pattern = format!("%{}%", q);
                let mut query_str = "SELECT * FROM characters WHERE name ILIKE $1 AND status = 1 ORDER BY created_at DESC".to_string();
                
                if let Some(lim) = limit {
                    query_str.push_str(&format!(" LIMIT {}", lim));
                }
                
                sqlx::query_as::<_, Self>(&query_str)
                    .bind(pattern)
                    .fetch_all(pool)
                    .await
            },
            _ => {
                // 默认只返回已生成的角色
                let mut query_str = "SELECT * FROM characters WHERE status = 1 ORDER BY created_at DESC".to_string();
                
                if let Some(lim) = limit {
                    query_str.push_str(&format!(" LIMIT {}", lim));
                }
                
                sqlx::query_as::<_, Self>(&query_str)
                    .fetch_all(pool)
                    .await
            }
        }
    }

    // 获取待生成角色列表
    pub async fn list_pending(pool: &sqlx::PgPool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as::<_, Self>(
            "SELECT * FROM characters WHERE status = 0 ORDER BY created_at DESC"
        )
        .fetch_all(pool)
        .await
    }

    // 更新角色状态并设置图片URL
    #[allow(dead_code)]
    pub async fn update_status(
        pool: &sqlx::PgPool,
        id: Uuid,
        image_url: String,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as::<_, Self>(
            "UPDATE characters SET image_url = $1, status = 1 WHERE id = $2 RETURNING *"
        )
        .bind(image_url)
        .bind(id)
        .fetch_one(pool)
        .await
    }
}

impl ProjectCharacter {
    pub async fn get_all_for_project(pool: &sqlx::PgPool, project_id: Uuid) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as::<_, Self>(
            r#"
            SELECT c.id, c.name, c.image_url, c.prompt, c.category, c.tags, pc.display_order
            FROM characters c
            JOIN project_characters pc ON c.id = pc.character_id
            WHERE pc.project_id = $1
            ORDER BY pc.display_order ASC
            "#
        )
        .bind(project_id)
        .fetch_all(pool)
        .await
    }

    pub async fn link(pool: &sqlx::PgPool, project_id: Uuid, character_id: Uuid, display_order: i32) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO project_characters (project_id, character_id, display_order) VALUES ($1, $2, $3)"
        )
        .bind(project_id)
        .bind(character_id)
        .bind(display_order)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn unlink(pool: &sqlx::PgPool, project_id: Uuid, character_id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM project_characters WHERE project_id = $1 AND character_id = $2")
            .bind(project_id)
            .bind(character_id)
            .execute(pool)
            .await?;
        Ok(())
    }
}

// ========================================
// UploadedFile - Cloudflare R2 文件上传记录
// ========================================

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UploadedFile {
    pub id: i32,
    pub file_hash: String,
    pub cloudflare_url: String,
    pub file_type: String,
    pub file_size_bytes: i64,
    pub created_at: DateTime<Utc>,
}

impl UploadedFile {
    /// 根据文件哈希查找记录
    pub async fn find_by_hash(pool: &sqlx::PgPool, hash: &str) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as::<_, Self>("SELECT * FROM uploaded_files WHERE file_hash = $1")
            .bind(hash)
            .fetch_optional(pool)
            .await
    }

    /// 创建新的文件上传记录
    pub async fn create(
        pool: &sqlx::PgPool,
        hash: String,
        url: String,
        file_type: String,
        size: i64,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as::<_, Self>(
            r#"
            INSERT INTO uploaded_files (file_hash, cloudflare_url, file_type, file_size_bytes)
            VALUES ($1, $2, $3, $4)
            RETURNING *
            "#,
        )
        .bind(hash)
        .bind(url)
        .bind(file_type)
        .bind(size)
        .fetch_one(pool)
        .await
    }
}
