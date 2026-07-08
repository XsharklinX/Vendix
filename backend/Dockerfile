FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
# --include=dev fuerza a instalar devDependencies (typescript, @types/*) aunque
# NODE_ENV=production esté presente en el entorno de build (Railway propaga las
# variables del servicio al build, y npm ci las omite por defecto en ese caso).
RUN npm ci --include=dev

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run db:generate:postgres
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
EXPOSE 3100
CMD ["node", "dist/index.js"]
