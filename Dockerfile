# syntax=docker/dockerfile:1
#
# One container, three stages, no host lock-in.
#
# The host chosen in docs/deploy.md is Fly.io, but nothing about this file
# is Fly-specific: it is a plain Node server on a plain port, so Render,
# Railway, a DigitalOcean droplet or an ECS task all run the same artifact.
# That is deliberate — the platform constraint that ruled out the obvious
# choice (Vercel caps a serverless function's request body at 4.5 MB, and
# this app accepts 25 MB) is the sort of thing worth being able to walk away
# from cheaply.
#
# Three things this image has to get right, all of them from lib/:
#   * a NODE runTIME, not edge — lib/storage/s3.ts signs with node:crypto,
#     lib/auth/password.ts is scrypt from the same, and lib/image loads a
#     wasm decoder;
#   * the HEIC decoder's wasm actually present at runtime, which is the one
#     thing a bundler can get wrong quietly (the smoke test at the bottom of
#     docs/deploy.md is how you find out before a customer does);
#   * memory for a 12 MP decode — see fly.toml.

ARG NODE_VERSION=22.22.2

# --- dependencies ----------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` and not `npm install`: the lockfile is the build input.
RUN npm ci --no-audit --no-fund

# --- build -----------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle at BUILD time, so
# they are build arguments and not runtime secrets — and changing one means
# rebuilding the image, not restarting it. The aerial leg's two licence
# declarations are here for exactly that reason (lib/locate/gate.ts): the
# server reads them at runtime and the price rail reads them from the
# bundle, so a deployment that sets them in only one place would show a
# customer a button that 404s. Set them in both, or in neither.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_SATELLITE_TILE_URL
ARG NEXT_PUBLIC_SATELLITE_ATTRIBUTION
ARG NEXT_PUBLIC_SATELLITE_MAX_ZOOM
ARG NEXT_PUBLIC_SATELLITE_LICENCE
ARG NEXT_PUBLIC_GEOCODER_LICENCE
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_SATELLITE_TILE_URL=${NEXT_PUBLIC_SATELLITE_TILE_URL} \
    NEXT_PUBLIC_SATELLITE_ATTRIBUTION=${NEXT_PUBLIC_SATELLITE_ATTRIBUTION} \
    NEXT_PUBLIC_SATELLITE_MAX_ZOOM=${NEXT_PUBLIC_SATELLITE_MAX_ZOOM} \
    NEXT_PUBLIC_SATELLITE_LICENCE=${NEXT_PUBLIC_SATELLITE_LICENCE} \
    NEXT_PUBLIC_GEOCODER_LICENCE=${NEXT_PUBLIC_GEOCODER_LICENCE}

RUN npm run build

# --- runtime ---------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# `output: "standalone"` (next.config.ts) traces the server and only the
# modules it reaches, so no node_modules and no npm in the runtime image.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

# The `node` user ships with this image. Nothing here writes to disk in a
# real deployment — photos are in the bucket or the database, projects are
# in Postgres — so the filesystem stays owned by root and read-only to the
# process. A deployment with neither DATABASE_URL nor S3_* configured would
# try to write ./.data and fail here, loudly, which is the correct answer:
# the local file store is the demo, not a production backend.
USER node

EXPOSE 3000

# Same shallow liveness check the platform uses. See app/api/health/route.ts
# for why it does not touch Postgres or the bucket.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
