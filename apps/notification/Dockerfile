# ── build stage ──
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build notification

# ── runtime stage ──
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
# email templates are not bundled — copy them to the path resolved at runtime
COPY --from=builder /app/apps/notification/src/templates ./apps/notification/src/templates
USER node
EXPOSE 3005
CMD ["node", "dist/apps/notification/main.js"]
