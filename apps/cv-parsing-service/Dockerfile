FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache poppler-utils
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY scripts ./scripts
COPY apps ./apps
COPY packages ./packages
RUN npm ci
RUN npm run build -- cv-parsing-service
CMD ["node", "scripts/render-start-service.js", "cv-parsing-service", "dist/apps/cv-parsing-service/main.js"]
