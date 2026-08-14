FROM node:22-bookworm

WORKDIR /app

ENV NODE_ENV=production
ENV PYTHONUNBUFFERED=1
ENV PATH="/opt/matching-venv/bin:${PATH}"

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv poppler-utils \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --legacy-peer-deps --include=dev

COPY apps/matching-service/requirements.txt ./apps/matching-service/requirements.txt
RUN python3 -m venv /opt/matching-venv \
  && pip install --no-cache-dir -r apps/matching-service/requirements.txt

COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY scripts ./scripts
COPY apps ./apps
COPY packages ./packages

RUN npm run build -- gateway \
  && npm run build -- auth-service \
  && npm run build -- candidate-service \
  && npm run build -- company-service \
  && npm run build -- job-service \
  && npm run build -- application-service \
  && npm run build -- cv-parsing-service \
  && npm run build -- notification-service \
  && npm run build -- document-storage-service

EXPOSE 10000

CMD ["node", "scripts/render-start-all.js"]
