# DreamForge accounts API — container image for AWS App Runner.
#
# Pulled from public.ecr.aws rather than Docker Hub to avoid anonymous pull rate
# limits, which are a common and confusing CI failure.
FROM public.ecr.aws/docker/library/node:20-alpine

# dumb-init gives the process real signal handling, so App Runner's SIGTERM
# during a deployment shuts the server down instead of killing it.
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production
# App Runner routes to 8080 by default.
ENV PORT=8080

WORKDIR /app

# Copy manifests first so the dependency layer is cached across code changes.
COPY package.json package-lock.json ./

# `npm ci --omit=dev` for a reproducible install from the lockfile. Every
# dependency is pure JavaScript — bcryptjs rather than native bcrypt — so no
# build toolchain is needed in the image.
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# Run unprivileged. The node image ships a `node` user; use it rather than root.
USER node

EXPOSE 8080

# App Runner health-checks /api/health over HTTP, so no HEALTHCHECK here.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
