# NexHire Backend — common commands
# (Windows: run via Git Bash, or use the npm scripts directly.)

.PHONY: install dev dev-build stop clean migrate-schema migrate logs ps lint test start

install:        ## Install dependencies
	npm install

dev:            ## Start infra (postgres + redis + minio)
	docker compose up -d

dev-build:      ## Rebuild & start infra
	docker compose up -d --build

stop:           ## Stop infra
	docker compose down

clean:          ## Stop infra + remove volumes (DESTROYS DATA)
	docker compose down -v

migrate-schema: ## Create DB schemas (auth/job/cvapp/ai)
	docker compose exec -T postgres psql -U $${DB_USER:-postgres} -d $${DB_NAME:-nexhire} < scripts/create-schemas.sql

migrate:        ## Run TypeORM migrations in order (auth -> job -> cv-app -> ai)
	bash scripts/migrate.sh

logs:           ## Tail infra logs
	docker compose logs -f

ps:             ## Show infra containers
	docker compose ps

lint:           ## Lint + autofix
	npm run lint

test:           ## Run tests
	npm test

start:          ## Start all services (watch mode)
	npm run start:all
