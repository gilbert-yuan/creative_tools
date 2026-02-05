import os
import hashlib
import requests
from dotenv import load_dotenv
from pathlib import Path
import uuid

# 加载环境变量
load_dotenv()

# Cloudflare R2 配置
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID", "your_account_id")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "your_access_key")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "your_secret_key")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME", "your_bucket_name")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL", "https://your-cdn-url.com")

# 生成文件哈希
def generate_file_hash(file_path):
    """生成文件的 SHA-256 哈希值"""
    try:
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    except Exception as e:
        print(f"生成文件哈希失败: {e}")
        return None

# 上传文件到 Cloudflare R2
def upload_to_cloudflare_r2(file_path, file_type="application/octet-stream"):
    """上传文件到 Cloudflare R2 并返回访问 URL"""
    try:
        # 生成文件哈希
        file_hash = generate_file_hash(file_path)
        if not file_hash:
            return None
        
        # 生成唯一的文件名
        file_name = f"{file_hash}_{uuid.uuid4()}{Path(file_path).suffix}"
        
        # 构建 R2 API URL
        r2_url = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com/{R2_BUCKET_NAME}/{file_name}"
        
        # 读取文件内容
        with open(file_path, "rb") as f:
            file_content = f.read()
        
        # 构建请求头
        headers = {
            "Content-Type": file_type,
            "Content-Length": str(len(file_content))
        }
        
        # 发送 PUT 请求上传文件
        # 注意：这里需要使用正确的认证方式，实际使用时需要实现 AWS Signature V4 认证
        # 为了简化示例，这里使用基本认证，实际生产环境中应该使用更安全的认证方式
        response = requests.put(
            r2_url,
            data=file_content,
            headers=headers,
            auth=(R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)
        )
        
        if response.status_code == 200:
            # 返回公共访问 URL
            public_url = f"{R2_PUBLIC_URL}/{file_name}"
            return public_url
        else:
            print(f"上传文件失败: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"上传文件到 Cloudflare R2 失败: {e}")
        return None

# 删除 Cloudflare R2 中的文件
def delete_from_cloudflare_r2(file_url):
    """从 Cloudflare R2 删除文件"""
    try:
        # 从 URL 中提取文件名
        file_name = Path(file_url).name
        
        # 构建 R2 API URL
        r2_url = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com/{R2_BUCKET_NAME}/{file_name}"
        
        # 发送 DELETE 请求删除文件
        response = requests.delete(
            r2_url,
            auth=(R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)
        )
        
        if response.status_code == 204:
            return True
        else:
            print(f"删除文件失败: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"从 Cloudflare R2 删除文件失败: {e}")
        return False

# 获取文件信息
def get_file_info(file_url):
    """获取 Cloudflare R2 中文件的信息"""
    try:
        # 从 URL 中提取文件名
        file_name = Path(file_url).name
        
        # 构建 R2 API URL
        r2_url = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com/{R2_BUCKET_NAME}/{file_name}"
        
        # 发送 HEAD 请求获取文件信息
        response = requests.head(
            r2_url,
            auth=(R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)
        )
        
        if response.status_code == 200:
            return {
                "content_type": response.headers.get("Content-Type"),
                "content_length": response.headers.get("Content-Length"),
                "last_modified": response.headers.get("Last-Modified")
            }
        else:
            print(f"获取文件信息失败: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"获取 Cloudflare R2 文件信息失败: {e}")
        return None
