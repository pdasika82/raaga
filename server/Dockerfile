FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --no-fund --no-audit
COPY server ./
COPY shared /app/shared
COPY web/src/core /app/web/src/core
RUN npm run build && mkdir -p /app/uploads && chown node:node /app/uploads
USER node
CMD ["npm", "start"]
