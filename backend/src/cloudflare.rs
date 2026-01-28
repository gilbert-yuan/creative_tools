use sha2::{Digest, Sha256};
use std::env;
use std::fs::File; // Keep for calculate_file_hash used in other function
use std::io::Read; // Keep for calculate_file_hash

use crate::models::UploadedFile;

pub struct CloudflareStorage {
    bucket_name: String,
    public_url: String,
    s3_client: aws_sdk_s3::Client,
}

impl CloudflareStorage {
    /// 从环境变量创建 Cloudflare R2 存储客户端
    pub async fn new() -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let account_id = env::var("R2_ACCOUNT_ID")
            .map_err(|_| "R2_ACCOUNT_ID 环境变量未设置")?;
        let access_key_id = env::var("R2_ACCESS_KEY_ID")
            .map_err(|_| "R2_ACCESS_KEY_ID 环境变量未设置")?;
        let secret_access_key = env::var("R2_SECRET_ACCESS_KEY")
            .map_err(|_| "R2_SECRET_ACCESS_KEY 环境变量未设置")?;
        let bucket_name = env::var("R2_BUCKET_NAME")
            .map_err(|_| "R2_BUCKET_NAME 环境变量未设置")?;
        let public_url = env::var("R2_PUBLIC_URL")
            .unwrap_or_else(|_| format!("https://pub-{}.r2.dev", account_id));

        // 创建 S3 客户端 (R2 兼容 S3 API)
        let endpoint_url = format!("https://{}.r2.cloudflarestorage.com", account_id);
        
        let credentials = aws_sdk_s3::config::Credentials::new(
            access_key_id,
            secret_access_key,
            None,
            None,
            "r2",
        );

        let config = aws_sdk_s3::Config::builder()
            .endpoint_url(endpoint_url)
            .credentials_provider(credentials)
            .region(aws_sdk_s3::config::Region::new("auto"))
            .force_path_style(true)
            .behavior_version_latest()
            .build();

        let s3_client = aws_sdk_s3::Client::from_conf(config);

        Ok(Self {
            bucket_name,
            public_url,
            s3_client,
        })
    }

    /// 上传文件到 Cloudflare R2 并返回公开访问 URL
    pub async fn upload_file(
        &self,
        local_path: &str,
        remote_folder: Option<&str>,
        custom_name: Option<&str>,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        // 读取文件 (Async)
        println!("📂 读取本地文件: {}", local_path);
        let mut file = tokio::fs::File::open(local_path).await?;
        let mut buffer = Vec::new();
        tokio::io::AsyncReadExt::read_to_end(&mut file, &mut buffer).await?;
        println!("   > 文件大小: {} bytes", buffer.len());

        // 获取文件名
        let filename = custom_name.unwrap_or_else(|| {
            std::path::Path::new(local_path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("file")
        });

        // 自动判断目录
        let folder = remote_folder.unwrap_or_else(|| {
            let ext = std::path::Path::new(filename)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("");
            match ext {
                "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" => "images/",
                "mp4" | "mov" | "avi" | "mkv" | "webm" | "flv" => "videos/",
                _ => "",
            }
        });

        // 拼接远程路径
        let remote_path = format!("{}{}", folder, filename);

        println!("📤 正在上传文件到 Cloudflare R2: {}", remote_path);

        let content_type = Self::get_content_type(filename);

        // 使用 AWS SDK 上传
        let body = aws_sdk_s3::primitives::ByteStream::from(buffer);
        
        self.s3_client
            .put_object()
            .bucket(&self.bucket_name)
            .key(&remote_path)
            .content_type(content_type)
            .body(body)
            .send()
            .await
            .map_err(|e| format!("Upload failed: {:?}", e))?;

        // 生成公开访问链接
        let public_url = format!("{}/{}", self.public_url.trim_end_matches('/'), remote_path);

        println!("✅ 上传成功: {}", public_url);

        Ok(public_url)
    }

    /// 检查文件是否已上传，如果已存在返回缓存 URL，否则上传并记录
    pub async fn get_or_upload(
        &self,
        pool: &sqlx::PgPool,
        local_path: &str,
        file_type: &str,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        // 计算文件哈希
        let file_hash = calculate_file_hash(local_path)?;
        let file_size = std::fs::metadata(local_path)?.len() as i64;

        // 检查数据库中是否已存在
        if let Some(record) = UploadedFile::find_by_hash(pool, &file_hash).await? {
            println!("♻️  文件已存在，使用缓存 URL: {}", record.cloudflare_url);
            return Ok(record.cloudflare_url);
        }

        // 上传文件
        let cloudflare_url = self.upload_file(local_path, None, None).await?;

        // 记录到数据库
        UploadedFile::create(
            pool,
            file_hash,
            cloudflare_url.clone(),
            file_type.to_string(),
            file_size,
        )
        .await?;

        println!("📝 已记录到数据库");

        Ok(cloudflare_url)
    }

    /// 根据文件扩展名获取 Content-Type
    fn get_content_type(filename: &str) -> &'static str {
        let ext = std::path::Path::new(filename)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");

        match ext {
            "jpg" | "jpeg" => "image/jpeg",
            "png" => "image/png",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "bmp" => "image/bmp",
            "mp4" => "video/mp4",
            "mov" => "video/quicktime",
            "avi" => "video/x-msvideo",
            "mkv" => "video/x-matroska",
            "webm" => "video/webm",
            "flv" => "video/x-flv",
            _ => "application/octet-stream",
        }
    }
}

/// 计算文件的 SHA256 哈希值
fn calculate_file_hash(path: &str) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let mut file = File::open(path)?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)?;

    let mut hasher = Sha256::new();
    hasher.update(&buffer);
    let result = hasher.finalize();

    Ok(format!("{:x}", result))
}
