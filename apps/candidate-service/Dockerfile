FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm ci
RUN npm run build -- candidate-service
CMD [\"node\", \"dist/apps/candidate-service/main.js\"]
