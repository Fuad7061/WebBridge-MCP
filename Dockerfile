# ---- Build Stage ----
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Production Stage ----
FROM node:20-slim

# Install Playwright system deps (uses Playwright's own dep list — always correct per Debian version)

# Environment defaults
ENV WEBBRIDGE_MODE=http
ENV WEBBRIDGE_PORT=3456
ENV WEBBRIDGE_HOST=0.0.0.0
ENV WEBBRIDGE_STEALTH_LEVEL=stealth
ENV WEBBRIDGE_DATA_DIR=/data
ENV WEBBRIDGE_HEADLESS=new
ENV WEBBRIDGE_MAX_CONCURRENCY=5
ENV WEBBRIDGE_RATE_LIMIT_MAX=60

WORKDIR /app

# Copy built dist and install production deps + Playwright browser
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev && \
    npx playwright install --with-deps chromium && \
    rm -rf /root/.cache /tmp/*

EXPOSE 3456
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node --input-type=module -e "import http from 'node:http'; http.get('http://127.0.0.1:3456/health', r => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

CMD ["node", "dist/index.js", "--mode=http"]
