FROM node:22.22.1-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:22.22.1-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173 APP_DATABASE=/data/app.sqlite APP_STATIC_DIR=/app/dist/web
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 4173
CMD ["node", "dist/server/main.js"]
