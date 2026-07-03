FROM node:20-slim

# 装 yt-dlp(从 GitHub release,版本固定避免反反爬失效)
# + ffmpeg(mp4 merge 需要)+ curl(健康检查)
RUN apt-get update && apt-get install -y --no-install-recommends \
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
