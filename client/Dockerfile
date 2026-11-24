# syntax=docker/dockerfile:1
# Astro SSR (adapter @astrojs/node, mode standalone).

# ---------- Stage 1: builder ----------
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Variabel PUBLIC_* dan SITE_URL dibaca saat build (di-bake ke bundle browser dan meta canonical).
# INTERNAL_API_KEY dan INTERNAL_API_URL sengaja TIDAK di sini: dibaca saat runtime dari environment container.
ARG PUBLIC_API_URL
ARG SITE_URL
ENV PUBLIC_API_URL=${PUBLIC_API_URL} \
    SITE_URL=${SITE_URL}
RUN npm run build

# ---------- Stage 2: runner ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist

USER node
EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4321/ > /dev/null || exit 1

CMD ["node", "./dist/server/entry.mjs"]
