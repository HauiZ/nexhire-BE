# NexHire Backend - common commands
# (Windows: run via Git Bash, or use the npm scripts directly.)

.PHONY: install dev dev-build stop clean migrate-db migrate migrate-generate logs ps lint test start

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
	bash scripts/migrate.sh

migrate-generate:
	bash scripts/generate.sh $(NAME)

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
