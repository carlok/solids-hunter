# Solids Hunter — Node/npm only inside Podman (no host npm).
# Uses bind mounts for the repo; named volumes for node_modules and npm cache.
# Requires: podman with compose (`podman compose`).

COMPOSE ?= podman compose

.PHONY: dev down test coverage dist clean lock

dev:
	$(COMPOSE) up web

down:
	$(COMPOSE) down

test:
	$(COMPOSE) run --rm test sh -c "npm ci && npm run test"

coverage:
	$(COMPOSE) run --rm test sh -c "npm ci && npm run test:cov"

dist:
	$(COMPOSE) run --rm build sh -c "npm ci && npm run build"

clean:
	rm -rf dist coverage
	$(COMPOSE) down -v

lock:
	$(COMPOSE) run --rm test sh -c "npm install"
