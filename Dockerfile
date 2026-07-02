# ---- Frontend build ----
FROM node:22-alpine AS client-build
WORKDIR /client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- Backend build (TypeScript -> dist) ----
FROM node:22-alpine AS server-build
# Prisma engines require OpenSSL on Alpine.
RUN apk add --no-cache openssl
WORKDIR /app
COPY server/package*.json ./
RUN npm ci
COPY server/prisma ./prisma
RUN npx prisma generate
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

# ---- Runtime ----
FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/prisma ./prisma
RUN npx prisma generate
COPY --from=server-build /app/dist ./dist
COPY --from=client-build /client/dist ./public
EXPOSE 3001
# `prisma db push` syncs the schema on boot (idempotent), then start the server.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
