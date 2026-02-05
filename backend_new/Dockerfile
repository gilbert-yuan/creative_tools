# ---------- Builder Stage ----------
FROM python:3.11-alpine AS builder

# 设置工作目录
WORKDIR /app

# 安装系统依赖
RUN apk add --no-cache \
    build-base \
    postgresql-dev \
    ffmpeg \
    yt-dlp \
    curl \
    && rm -rf /var/cache/apk/*

# 复制依赖文件
COPY requirements.txt .

# 安装 Python 依赖
RUN pip install --no-cache-dir -r requirements.txt

# ---------- Runtime Stage ----------
FROM python:3.11-alpine

# 设置工作目录
WORKDIR /app

# 安装运行时依赖
RUN apk add --no-cache \
    postgresql-libs \
    ffmpeg \
    yt-dlp \
    ca-certificates \
    && rm -rf /var/cache/apk/*

# 复制 Python 依赖
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# 复制应用代码
COPY src/ .

# 复制环境变量文件
COPY .env.example .env

# 创建必要的目录
RUN mkdir -p data/analysis data/projects logs

# 设置环境变量
ENV PYTHONUNBUFFERED=1
ENV DATABASE_URL=postgres://postgres:postgres@db:5432/video_analysis
ENV GEMINI_BASE_URL=your_api_base_url
ENV GEMINI_API_KEY=your_gemini_api_key_here
ENV GEMINI_MODEL=gemini-3-pro-image-preview
ENV GEMINI_ENDPOINT=/v1beta/models/{model}:generateContent
ENV VEO_BASE_URL=YOUR_API_BASE_URL
ENV VEO_API_KEY=your_veo_api_key_here
ENV VEO_MODEL=veo_3_1-fast
ENV VEO_CREATE_ENDPOINT=/v1/video/create
ENV VEO_QUERY_ENDPOINT=/v1/video/query
ENV GPT_NANO_BASE_URL=YOUR_API_BASE_URL
ENV GPT_NANO_API_KEY=your_gpt_nano_api_key_here
ENV GPT_NANO_ENDPOINT=/v1/responses
ENV R2_ACCOUNT_ID=your_account_id
ENV R2_ACCESS_KEY_ID=your_access_key
ENV R2_SECRET_ACCESS_KEY=your_secret_key
ENV R2_BUCKET_NAME=your_bucket_name
ENV R2_PUBLIC_URL=https://your-cdn-url.com

# 阿里云模型配置
ENV ALIYUN_ACCESS_KEY=your_aliyun_access_key
ENV ALIYUN_ACCESS_KEY_SECRET=your_aliyun_access_key_secret
ENV ALIYUN_REGION_ID=cn-beijing
ENV ALIYUN_MODEL_NAME=qwen-max
ENV ALIYUN_API_VERSION=2024-07-01

# 暴露端口
EXPOSE 8000

# 默认启动命令
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
