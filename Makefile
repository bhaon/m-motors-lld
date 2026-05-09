# ──────────────────────────────────────────────────────────────────────────────
#  M-Motors LLD — Makefile
#  Raccourcis pour le workflow de développement avec Docker Compose.
#  Usage : make help
# ──────────────────────────────────────────────────────────────────────────────

.PHONY: up down restart logs ps rebuild \
        shell-backend shell-frontend shell-db \
        migrate migration seed admin \
        test-backend test-frontend \
        clean help

# ── Cycle de vie ───────────────────────────────────────────────────────────────

up:          ## Démarre tous les services en arrière-plan
	docker compose up -d

down:        ## Arrête tous les services (conserve les volumes)
	docker compose down

restart:     ## Redémarre tous les services
	docker compose restart

logs:        ## Suit les logs de tous les services (Ctrl+C pour quitter)
	docker compose logs -f

logs-%:      ## Suit les logs d'un service  →  make logs-backend
	docker compose logs -f $*

ps:          ## Affiche l'état des services
	docker compose ps

rebuild:     ## Reconstruit les images depuis zéro et redémarre
	docker compose build --no-cache
	docker compose up -d

# ── Shells ─────────────────────────────────────────────────────────────────────

shell-backend:   ## Shell dans le conteneur backend
	docker compose exec backend /bin/sh

shell-frontend:  ## Shell dans le conteneur frontend
	docker compose exec frontend /bin/sh

shell-db:        ## Session psql dans la base de données
	docker compose exec db psql -U mmotors -d mmotors

# ── Base de données ────────────────────────────────────────────────────────────

migrate:     ## Applique toutes les migrations Alembic
	docker compose exec backend alembic upgrade head

migration:   ## Génère une migration auto  →  make migration name="ajout_colonne_x"
	docker compose exec backend alembic revision --autogenerate -m "$(name)"

seed:        ## Charge les données de démonstration (véhicules)
	docker compose exec backend python scripts/seed.py

admin:       ## Crée un compte administrateur (interactif)
	docker compose exec -it backend python scripts/create_admin.py

# ── Tests ──────────────────────────────────────────────────────────────────────

test-backend:    ## Lance les tests unitaires Python (pytest)
	docker compose exec backend python -m pytest tests/ -v

test-frontend:   ## Lance les tests Jest
	docker compose exec frontend npm test -- --no-coverage

# ── Nettoyage ──────────────────────────────────────────────────────────────────

clean:       ## Arrête les services ET supprime les volumes (données perdues)
	docker compose down -v

# ── Aide ───────────────────────────────────────────────────────────────────────

help:        ## Affiche cette aide
	@echo ""
	@echo "  M-Motors LLD — commandes disponibles"
	@echo ""
	@grep -E '^[a-zA-Z_%/-]+:.*##' Makefile | \
		awk 'BEGIN {FS = ":.*##"}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
