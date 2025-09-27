# Dockerfile for Letter Maker

# ---- Base Stage ----
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# ---- Builder Stage ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Production Stage ----
FROM node:20-alpine AS runner
WORKDIR /app

# Install Chromium and dependencies for Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Tell Puppeteer to skip installing Chrome. We'll use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 appuser

# Set environment variables
ENV NODE_ENV=production
EXPOSE 3000
ENV PORT=3000

# Copy necessary files from builder
COPY --from=base /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# Copy entrypoint script
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Create temp directory for PDF generation
RUN mkdir -p /app/tmp
RUN chown -R appuser:nodejs /app
RUN chmod -R 755 /app
RUN chmod -R 777 /app/tmp

# Switch to non-root user
USER appuser

# Set entrypoint and command
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]