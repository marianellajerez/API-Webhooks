# =============================================
# Node.js + Express + TypeScript + Drizzle ORM + PostgreSQL
# =============================================

# 1. Build Stage
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# =============================================
# 2. Production Stage
# =============================================
FROM node:20-alpine AS production

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle.config.js ./drizzle.config.js
COPY --from=build /app/drizzle.config.d.ts ./drizzle.config.d.ts
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

CMD ["sh", "-c", "npx drizzle-kit push && node dist/server.js"]