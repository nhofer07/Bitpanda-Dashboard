FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0 \
    DASHBOARD_DATA_DIR=/data
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY backend/ ./
RUN node --check server.js && node --test test/*.test.js
RUN rm -rf /app/backend/.cache /app/backend/manual-positions.json
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist
RUN mkdir -p /data
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:3001/health >/dev/null || exit 1
CMD ["node", "server.js"]
