# syntax=docker/dockerfile:1
# API Express + Prisma. Node 22 LTS (Node 20 sudah end-of-life sejak April 2026).

# ---------- Stage 1: builder ----------
FROM node:22-alpine AS builder
WORKDIR /app
# Prisma di Alpine (musl) butuh OpenSSL.
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage ini juga dipakai service `migrate` di docker-compose.prod.yml untuk `prisma db push` dan `npm run seed`,
# karena Prisma CLI dan tsx hanya ada di devDependencies.

# ---------- Stage 2: runner ----------
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Prisma Client yang sudah di-generate untuk musl.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist

# Gambar publik (/uploads) dan file produk digital (privat). Keduanya dipasang sebagai volume.
RUN mkdir -p /app/uploads /app/private-uploads && chown -R node:node /app/uploads /app/private-uploads
USER node

EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5000/api/health > /dev/null || exit 1

CMD ["node", "dist/app.js"]
