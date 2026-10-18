# Build-Kontext ist das Repo-Root (wegen shared/), siehe docker-compose.yml
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace backend --include-workspace-root
COPY shared shared
COPY backend backend
RUN npm run build -w backend

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/backend/dist ./dist
# Statistik für die Admin-Seite (Volume, siehe docker-compose.yml)
RUN mkdir -p /app/data && chown node:node /app/data
ENV DATA_DIR=/app/data
USER node
EXPOSE 3002
CMD ["node", "dist/server.js"]
