import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { resolve } from 'node:path';
import fs from 'node:fs';

/** Serve `/assets/*` from repo-root `assets/` for static dev assets. */
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
        const ctype = raw.endsWith('.wav')
          ? 'audio/wav'
          : raw.endsWith('.glb')
            ? 'model/gltf-binary'
          : raw.endsWith('.jpg') || raw.endsWith('.jpeg')
            ? 'image/jpeg'
          : raw.endsWith('.png')
            ? 'image/png'
          : raw.endsWith('.env')
            ? 'application/octet-stream'
            : 'application/octet-stream';
        res.setHeader('Content-Type', ctype);
        fs.createReadStream(fp).pipe(res);
      });
    },
  };
}

/** Production: copy repo static assets needed by the Babylon runtime. */
function copySoundsToDistPlugin(): Plugin {
  return {
    name: 'copy-repo-sounds-to-dist',
    apply: 'build',
    closeBundle() {
      const texSrc = resolve(__dirname, 'assets/textures');
      const texDest = resolve(__dirname, 'dist-babylon/assets/textures');
      if (fs.existsSync(texSrc)) {
        fs.mkdirSync(texDest, { recursive: true });
        fs.cpSync(texSrc, texDest, { recursive: true });
      }

      const modelsSrc = resolve(__dirname, 'assets/models');
      const modelsDest = resolve(__dirname, 'dist-babylon/assets/models');
      if (fs.existsSync(modelsSrc)) {
        fs.mkdirSync(modelsDest, { recursive: true });
        fs.cpSync(modelsSrc, modelsDest, { recursive: true });
      }

      const duomoSrc = resolve(__dirname, 'assets/duomo');
      const duomoDest = resolve(__dirname, 'dist-babylon/assets/duomo');
      if (fs.existsSync(duomoSrc)) {
        fs.mkdirSync(duomoDest, { recursive: true });
        fs.cpSync(duomoSrc, duomoDest, { recursive: true });
      }

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
