#!/usr/bin/env node
/**
 * Writes minified production assets under dist/: bundled IIFE main, minified audio,
 * copied CSS, sounds, and index.html (non-module script tags for IIFE output).
 */
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');

if (existsSync(dist)) rmSync(dist, { recursive: true });
mkdirSync(join(dist, 'js'), { recursive: true });
mkdirSync(join(dist, 'css'), { recursive: true });
mkdirSync(join(dist, 'assets', 'sounds'), { recursive: true });

await esbuild.build({
  entryPoints: [join(root, 'js', 'main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  outfile: join(dist, 'js', 'main.js'),
  platform: 'browser'
});

await esbuild.build({
  entryPoints: [join(root, 'js', 'audio.js')],
  bundle: false,
  minify: true,
  format: 'iife',
  outfile: join(dist, 'js', 'audio.js'),
  platform: 'browser'
});

cpSync(join(root, 'css', 'main.css'), join(dist, 'css', 'main.css'));
cpSync(join(root, 'assets', 'sounds'), join(dist, 'assets', 'sounds'), { recursive: true });

let html = readFileSync(join(root, 'index.html'), 'utf8');
html = html.replace(
  '<script type="module" src="js/main.js"></script>',
  '<script src="js/main.js"></script>'
);
writeFileSync(join(dist, 'index.html'), html);

console.log('dist/ ready:', join(dist, 'index.html'));
