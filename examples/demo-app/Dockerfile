# DeployX Demo App — Production Dockerfile
#
# Requirements for DeployX compatibility:
#   1. EXPOSE the port your app listens on (default: 3000)
#   2. HEALTHCHECK matching the /health endpoint
#   3. Run as non-root user
#   4. App must read PORT from environment variable

FROM node:20-alpine

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package*.json ./
RUN npm ci --production

# Copy application source
COPY . .

# DeployX default deploy port
EXPOSE 3000

# Health check — must match DeployX health_check.path config
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Security: run as non-root
USER node

CMD ["node", "server.js"]
