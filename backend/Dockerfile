# ---------- Builder Stage ----------
FROM docker.1ms.run:rust/1.82-alpine AS builder

# 设置工作目录
WORKDIR /app

# 安装系统依赖
RUN apk add --no-cache \
    musl-dev \
    libpq-dev \
    pkgconf \
    openssl-dev \
    clang \
    llvm \
    lld \
    git \
    bash \
    curl

# 复制 Cargo 文件
COPY Cargo.toml Cargo.lock ./

# 创建 .cargo 配置文件启用 edition2024
RUN mkdir -p /app/.cargo && echo "[unstable]\nedition2024 = true" > /app/.cargo/config.toml

# 先缓存依赖
RUN cargo fetch

# 复制源码
COPY src ./src

# 构建 release 二进制
RUN cargo build --release

# ---------- Runtime Stage ----------
FROM debian:bullseye-slim

WORKDIR /app

# 安装运行时依赖
RUN apt-get update && apt-get install -y \
    libpq5 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 复制编译好的二进制
COPY --from=builder /app/target/release/video_analysis_api ./

# 复制环境变量文件
COPY .env.example .env

# 设置生产环境变量
ENV RUST_ENV=production
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

# 暴露端口
EXPOSE 8000

# 默认启动命令
CMD ["./video_analysis_api"]
