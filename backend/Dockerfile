# 后端 Dockerfile
FROM rust:nightly-alpine AS builder

WORKDIR /app

# 安装依赖
RUN apk add --no-cache musl-dev postgresql-dev

# 复制整个项目目录
COPY . .

# 构建应用
RUN cargo build --release

# 运行应用
FROM alpine:3.18

WORKDIR /app

# 安装运行时依赖
RUN apk add --no-cache libpq

# 复制编译后的二进制文件
COPY --from=builder /app/target/release/video_analysis_api ./

# 复制环境变量示例文件
COPY .env.example .env

# 设置环境变量
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

EXPOSE 8000

CMD ["./video_analysis_api"]