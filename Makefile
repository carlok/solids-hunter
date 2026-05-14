# Solids Hunter — Node/npm only inside Podman (no host npm).
# Uses bind mounts for the repo; named volumes for node_modules and npm cache.
# Requires: podman with compose (`podman compose`).

COMPOSE ?= podman compose

.PHONY: dev down test coverage dist clean lock install

# Vite — open http://127.0.0.1:5173/
dev:
	$(COMPOSE) up dev

down:
	$(COMPOSE) down

install:
	$(COMPOSE) run --rm install

test:
	$(COMPOSE) run --rm test sh -c "npm ci && npm run test"

coverage:
	$(COMPOSE) run --rm test-cov sh -c "npm ci && npm run test:cov"

dist:
	$(COMPOSE) run --rm build sh -c "npm ci && npm run build"

clean:
	rm -rf dist-babylon coverage
	$(COMPOSE) down -v

lock:
	$(COMPOSE) run --rm test sh -c "npm install"
