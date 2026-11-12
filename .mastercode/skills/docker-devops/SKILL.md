---
name: docker-devops
description: Production-grade containerization and DevOps workflows. Enforces multi-stage Docker builds, layer caching optimization, non-root security, healthchecks, and robust docker-compose service orchestration.
triggers: ["docker", "dockerfile", "container", "compose", "devops", "k8s", "kubernetes", "ci-cd", "deployment"]
---

# Production Docker & Containerization Guidelines

This skill guides the creation of lean, fast, and secure container images and multi-container environments.

## 1. Multi-Stage Dockerfile Pattern (Node / TypeScript Example)

Always use multi-stage builds to keep build tooling, devDependencies, and source code out of the final production image:

```dockerfile
# -----------------------------------------------------------------------------
# Stage 1: Dependency resolution and layer caching
# -----------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* pnpm-lock.yaml* bun.lockb* ./
RUN npm ci --frozen-lockfile

# -----------------------------------------------------------------------------
# Stage 2: Source build
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 3: Minimal production runner
# -----------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Security: Never run containers as root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
```

---

## 2. Docker Cache Layer Optimization Rules

Docker caches layers sequentially. Changes in an upper layer invalidate all subsequent layers:

1. **Copy package manifests first**: Copy only `package.json` and lockfiles before running dependency install. Source code edits should *never* invalidate dependency caches.
2. **Combine related commands**: Combine `apt-get update && apt-get install -y ... && rm -rf /var/lib/apt/lists/*` in a single `RUN` instruction to prevent bloated layers.
3. **Use `.dockerignore`**: Always include a comprehensive `.dockerignore`:
   ```text
   node_modules
   .git
   dist
   .env*
   npm-debug.log*
   coverage
   ```

---

## 3. Container Security Checklist

- **Run as Non-Root**: Always specify a non-root user (`USER node` or `USER 1001`).
- **Read-Only Root Filesystem**: Mount temporary writable storage to `/tmp` when feasible:
  `security_opt: ["no-new-privileges:true"]`
- **Secrets Management**: Never embed API keys, secrets, or passwords in `ENV` or build args. Inject secrets via environment variables or Docker secrets at runtime.
- **Minimal Base Images**: Prefer `alpine`, `distroless`, or `-slim` Debian variants over full OS distributions.

---

## 4. Docker Compose Best Practices

When authoring `docker-compose.yml`:
- Always specify CPU and memory limits (`deploy.resources.limits`).
- Use named volumes for persistent database storage.
- Define service dependencies with conditions (e.g. `depends_on: db: condition: service_healthy`).
- Ensure signal forwarding (`init: true` or `tini`) so containers handle `SIGTERM` and exit cleanly within timeout windows.

