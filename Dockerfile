# ═══════════════════════════════════════════════════════
# URA Property Analytics — Multi-Stage Dockerfile
# ═══════════════════════════════════════════════════════
# Build: docker build -t ura-api .
# Run:   docker run -p 3001:3001 --env-file .env ura-api
# Size:  ~180MB (Alpine + pruned node_modules)

# ── Stage 1: Dependencies ──
FROM node:20-alpine AS deps
WORKDIR /app

# Backend deps
COPY backend/package*.json backend/
RUN cd backend && npm ci --omit=dev

# Frontend deps
COPY frontend/package*.json frontend/
RUN cd frontend && npm ci

# ── Stage 2: Build ──
FROM node:20-alpine AS builder
WORKDIR /app

# Copy all deps (including devDependencies for build)
COPY backend/package*.json backend/
RUN cd backend && npm ci

COPY frontend/package*.json frontend/
RUN cd frontend && npm ci

# Copy source
COPY backend/ backend/
COPY frontend/ frontend/

# Build frontend (Vite → dist/)
RUN cd frontend && npm run build

# TypeScript check (but we run tsx in production for now)
# RUN cd backend && npx tsc --noEmit

# ── Stage 3: Production ──
FROM node:20-alpine AS production
WORKDIR /app

# Security: non-root user
RUN addgroup -S app && adduser -S app -G app

# Copy production deps only
COPY --from=deps /app/backend/node_modules ./node_modules
COPY --from=deps /app/backend/package.json ./

# Copy backend source (tsx runs TypeScript directly)
COPY --from=builder /app/backend/src ./src

# Copy frontend build output
COPY --from=builder /app/frontend/dist ./public

# Install tsx globally for TypeScript execution
RUN npm install -g tsx

# Set ownership
RUN chown -R app:app /app

USER app

# Environment
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/health/live || exit 1

# Start
CMD ["tsx", "src/server.ts"]
