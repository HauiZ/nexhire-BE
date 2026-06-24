# NexHire Backend — common commands
# (Windows: run via Git Bash, or use the npm scripts directly.)

.PHONY: install dev dev-build stop clean migrate-db migrate migrate-generate logs ps lint test start

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

migrate-db:     ## Create per-service databases + users (auto-runs on fresh volume; this is for re-apply)
	docker compose exec -T postgres psql -U $${POSTGRES_USER:-postgres} -d postgres < scripts/init-databases.sql

migrate:        ## Run TypeORM migrations in order (auth -> job -> cv-app -> ai)
	bash scripts/migrate.sh

migrate-generate: ## Generate migrations from entity changes (all DB services). Usage: make migrate-generate NAME=AddPhone
	bash scripts/generate.sh $(NAME)

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
