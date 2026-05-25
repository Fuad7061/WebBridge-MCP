# ---- Build Stage ----
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Production Stage ----
FROM node:20-slim

# Install Playwright system dependencies + Chromium
RUN apt-get update && apt-get install -y \
    libnss3 libnspr4 libatk1.0-0t64 libatk-bridge2.0-0t64 \
    libcups2t64 libdrm2 libdbus-1-3 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2t64 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Environment defaults
ENV WEBBRIDGE_MODE=http
ENV WEBBRIDGE_PORT=3456
ENV WEBBRIDGE_HOST=0.0.0.0
ENV WEBBRIDGE_STEALTH_LEVEL=stealth
ENV WEBBRIDGE_DATA_DIR=/data
ENV WEBBRIDGE_HEADLESS=true
ENV WEBBRIDGE_MAX_CONCURRENCY=5
ENV WEBBRIDGE_RATE_LIMIT_MAX=60

WORKDIR /app

# Copy built dist and install production deps + Playwright browser
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev && \
    npx playwright install chromium && \
    rm -rf /root/.cache /tmp/*

EXPOSE 3456
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node --input-type=module -e "import http from 'node:http'; http.get('http://127.0.0.1:3456/health', r => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

CMD ["node", "dist/index.js", "--mode=http"]
