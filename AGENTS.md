# Agent / contributor workflow

**Do not run `npm`, `node`, or `vite` on the host** for this repo. Use Podman Compose so dependencies stay in the named `node_modules` volume and the environment matches CI.

## Commands

First time (or after `compose.yaml` / `Containerfile` changes):

```bash
./scripts/podman compose-build
./scripts/podman install
```

Then:

| Goal | Command |
|------|---------|
| Unit tests | `./scripts/podman test` |
| Coverage | `./scripts/podman test-cov` |
| Production build (`dist-babylon/`) | `./scripts/podman build` (alias: `build-babylon`) |
| Vite dev server | `./scripts/podman dev` → http://127.0.0.1:5173/ |
| Interactive shell in container | `./scripts/podman shell` |
| Refresh `package-lock.json` on host | `./scripts/podman lock-update` |

**Static hosting:** point your server’s document root at `dist-babylon/` and load **`/index.html`**. WAVs under `assets/sounds/` are copied into `dist-babylon/assets/sounds/` on each Vite build.

Arena shortcut: open `/?env=lab` (or `dungeon`, `forest`, `ruins`).

## Note on `Makefile`

`Makefile` targets wrap the same compose services. Prefer `./scripts/podman` if you need the full command list.
