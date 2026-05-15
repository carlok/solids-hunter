# Podman/OCI image for Solids Hunter — Node toolchain only inside the container.
FROM docker.io/library/node:22-bookworm-slim

WORKDIR /app

ENV npm_config_update_notifier=false \
    CI=true

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

# Default: run tests (override in compose or podman run).
CMD ["npm", "test"]
