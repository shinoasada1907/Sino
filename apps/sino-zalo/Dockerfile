# syntax=docker/dockerfile:1

FROM node:26-slim
RUN npm install -g pnpm@11.21.0
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY src/ src/
ENV NODE_ENV=production SINO_ZALO_HOST=0.0.0.0
USER node
EXPOSE 8090
CMD ["node", "src/server.ts"]
