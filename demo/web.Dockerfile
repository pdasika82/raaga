FROM node:22-bookworm-slim
WORKDIR /app/web2
COPY web2/package*.json ./
RUN npm ci --no-fund --no-audit
COPY web2 ./
COPY web/src /app/web/src
COPY shared /app/shared
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5175", "--strictPort"]
