FROM node:22-bookworm-slim
RUN npm install -g firebase-tools@14.22.0 --no-fund --no-audit
WORKDIR /app
COPY demo/firebase.json ./firebase.json
USER node
CMD ["firebase", "emulators:start", "--only", "auth", "--project", "demo-raaga"]
