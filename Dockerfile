# syntax=docker/dockerfile:1

# --- Build stage: install everything and produce the Vite bundle ---
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Runtime stage: production deps + built assets only ---
FROM node:24-slim AS runtime
ENV NODE_ENV=production

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY server ./server
COPY scripts ./scripts

# SQLite + WAL must live on persistent storage for data to survive restarts.
ENV SUBMATE_DATA_DIR=/app/data
ENV HOST=0.0.0.0
ENV PORT=3001
VOLUME ["/app/data"]

EXPOSE 3001

# Simple liveness check against the built-in health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
