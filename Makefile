# NexHire Backend - common commands
# (Prefer the `npm run db:*` scripts directly.)

.PHONY: install dev dev-build stop clean migrate-db migrate logs ps lint test start

install:
	npm install

dev:
	docker compose up -d

dev-build:
	docker compose up -d --build

stop:
	docker compose down

clean:
	docker compose down -v

migrate-db:
	docker compose exec -T postgres psql -U $${POSTGRES_USER:-postgres} -d postgres < scripts/init-databases.sql

migrate:
	npm run db:all:run

logs:
	docker compose logs -f

ps:
	docker compose ps

lint:
	npm run lint

test:
	npm test

start:
	npm run start:all
