FROM node:20-slim

# 装 ca-certificates(优先,否则 curl HTTPS 证书校验失败)+ ffmpeg + curl + python3(yt-dlp 依赖)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    ffmpeg \
    curl \
    python3 \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 装依赖(利用 Docker 层缓存)
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY server.js ./

EXPOSE 3001
CMD ["node", "server.js"]
