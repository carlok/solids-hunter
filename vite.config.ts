import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { resolve } from 'node:path';
import fs from 'node:fs';

/** Serve `/assets/*` from repo-root `assets/` for WAV dev. */
function rootAssetsPlugin(): Plugin {
  const assetsRoot = resolve(__dirname, 'assets');
  return {
    name: 'serve-repo-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url?.split('?')[0] ?? '';
        if (!raw.startsWith('/assets/')) return next();
        const fp = resolve(__dirname, '.' + raw);
        if (!fp.startsWith(assetsRoot)) return next();
        if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) return next();
        res.setHeader('Content-Type', 'audio/wav');
        fs.createReadStream(fp).pipe(res);
      });
    },
  };
}

/** Production: copy repo `assets/sounds` → `dist-babylon/assets/sounds` (dev uses middleware only). */
function copySoundsToDistPlugin(): Plugin {
  return {
    name: 'copy-repo-sounds-to-dist',
    apply: 'build',
    closeBundle() {
      const src = resolve(__dirname, 'assets/sounds');
      const dest = resolve(__dirname, 'dist-babylon/assets/sounds');
      if (!fs.existsSync(src)) return;
      fs.mkdirSync(dest, { recursive: true });
      fs.cpSync(src, dest, { recursive: true });
    },
  };
}

export default defineConfig({
  root: '.',
  publicDir: false,
  plugins: [rootAssetsPlugin(), copySoundsToDistPlugin()],
  build: {
    outDir: 'dist-babylon',
    emptyOutDir: true,
    copyPublicDir: false,
  },
  resolve: {
    alias: {
      '@lib': resolve(__dirname, 'lib'),
    },
    /** One physical copy of Babylon so `import '@babylonjs/core/Culling/ray'` patches the same `Scene` as `new Scene()`. */
    dedupe: ['@babylonjs/core'],
  },
  optimizeDeps: {
    include: ['@babylonjs/core', '@babylonjs/core/Culling/ray'],
  },
  server: {
    fs: { allow: ['.'] },
  },
});
