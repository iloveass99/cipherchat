# CipherChat — deterministic production build for Railway / any container host.
# Uses a Dockerfile so the platform doesn't rely on buildpack auto-detection.

FROM node:20-slim AS base
WORKDIR /app

# better-sqlite3 is a native module — needs a toolchain to compile during npm ci.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies first (better layer caching).
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build the Next.js app.
COPY . .
RUN npm run build

ENV NODE_ENV=production
# Railway injects PORT; server.js reads process.env.PORT and binds 0.0.0.0 in prod.
EXPOSE 3000

CMD ["node", "server.js"]
