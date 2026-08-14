FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY scripts ./scripts
COPY apps ./apps
COPY packages ./packages
RUN npm ci
RUN npm run build -- document-storage-service
CMD ["node", "scripts/render-start-service.js", "document-storage-service", "dist/apps/document-storage-service/main.js"]
