/**
 * Post-build script: inlines all CSS and JS assets from dist/index.html
 * into a single self-contained HTML file (dist/standalone.html).
 *
 * Also copies the result to public/standalone.html so the dev server
 * can serve it for runtime interactive export.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_PATH = '/2d-star-system-map/';

const distDir = resolve(__dirname, '../dist');
const srcDir = resolve(__dirname, '../src');

const indexPath = resolve(distDir, 'index.html');
if (!existsSync(indexPath)) {
  console.error('dist/index.html not found. Run vite build first.');
  process.exit(1);
}

let html = readFileSync(indexPath, 'utf-8');

// Inline CSS links — collect matches first to avoid re-matching replaced text
const cssMatches = [];
const cssLinkRegex = /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/g;
let match;
while ((match = cssLinkRegex.exec(html)) !== null) {
  cssMatches.push({ full: match[0], href: match[1] });
}
for (const { full, href } of cssMatches) {
  const relativeHref = href.startsWith(BASE_PATH) ? href.slice(BASE_PATH.length) : href.startsWith('/') ? href.slice(1) : href;
  const cssPath = resolve(distDir, relativeHref);
  if (existsSync(cssPath)) {
    const css = readFileSync(cssPath, 'utf-8');
    html = html.replace(full, `<style>\n${css}\n</style>`);
    console.log(`  inlined CSS: ${href}`);
  } else {
    console.warn(`  CSS not found: ${cssPath}`);
  }
}

// Inline JS module scripts — collect matches first
const jsMatches = [];
const jsScriptRegex = /<script[^>]+type="module"[^>]+src="([^"]+)"[^>]*><\/script>/g;
while ((match = jsScriptRegex.exec(html)) !== null) {
  jsMatches.push({ full: match[0], src: match[1] });
}
for (const { full, src } of jsMatches) {
  const relativeSrc = src.startsWith(BASE_PATH) ? src.slice(BASE_PATH.length) : src.startsWith('/') ? src.slice(1) : src;
  const jsPath = resolve(distDir, relativeSrc);
  if (existsSync(jsPath)) {
    let js = readFileSync(jsPath, 'utf-8');
    // Strip modulepreload import since the polyfill is inlined separately
    js = js.replace(/import\s*"[^"]*modulepreload[^"]*";?/g, '');
    // Convert to regular script for file:// compatibility (Safari blocks module scripts on file://)
    html = html.replace(full, `<script>\n${js}\n</script>`);
    console.log(`  inlined JS: ${src}`);
  } else {
    console.warn(`  JS not found: ${jsPath}`);
  }
}

// Inline modulepreload polyfill if present — collect matches first
const preloadMatches = [];
const preloadRegex = /<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"[^>]*>/g;
while ((match = preloadRegex.exec(html)) !== null) {
  preloadMatches.push({ full: match[0], href: match[1] });
}
for (const { full, href } of preloadMatches) {
  const relativeHref2 = href.startsWith(BASE_PATH) ? href.slice(BASE_PATH.length) : href.startsWith('/') ? href.slice(1) : href;
  const jsPath = resolve(distDir, relativeHref2);
  if (existsSync(jsPath)) {
    const js = readFileSync(jsPath, 'utf-8');
    // Replace preload link with inline script (modulepreload is just a hint)
    html = html.replace(full, `<script>\n${js}\n</script>`);
    console.log(`  inlined preload JS: ${href}`);
  } else {
    html = html.replace(full, '');
    console.warn(`  Removed missing preload: ${href}`);
  }
}

// Remove any remaining preload links
html = html.replace(/<link[^>]+rel="modulepreload"[^>]*>/g, '');

// Write standalone HTML
const standalonePath = resolve(distDir, 'standalone.html');
writeFileSync(standalonePath, html);
console.log(`\n✅ Standalone HTML written to ${standalonePath}`);
console.log(`   Size: ${(html.length / 1024).toFixed(1)} KB`);

// Copy to public/ so dev server can serve it
const publicDir = resolve(__dirname, '../public');
try {
  writeFileSync(resolve(publicDir, 'standalone.html'), html);
  console.log(`✅ Copied to public/standalone.html for dev server`);
} catch (err) {
  console.warn(`⚠️ Could not copy to public/: ${err}`);
}
