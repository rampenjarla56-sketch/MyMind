// Integration checks (Agent 05): the shipped file set is coherent.
//  - sw.js precaches exactly the files on disk, and the cache name has moved on.
//  - every element id the JS looks up exists in index.html.
//  - no absolute http(s) URLs anywhere in the shipped code (offline, no CDNs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(ROOT, p), 'utf8');
const PREVIOUS_CACHE = 'mymind-v10';

const sw = read('sw.js');
const html = read('index.html');
const srcFiles = readdirSync(join(ROOT, 'src')).filter(f => f.endsWith('.js')).sort();

function swAssets() {
  const m = sw.match(/const ASSETS\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(m, 'sw.js must define const ASSETS = [...]');
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}

test('sw.js precache list matches the files on disk', () => {
  const assets = swAssets();
  assert.ok(assets.includes('./'), 'precache must include the scope root ./');
  for (const a of assets) {
    assert.ok(a.startsWith('./'), `asset must be relative: ${a}`);
    if (a === './') continue;
    assert.ok(existsSync(join(ROOT, a)), `precached file missing on disk: ${a}`);
  }
  const expected = ['./index.html', './app.css', './manifest.webmanifest',
    ...srcFiles.map(f => `./src/${f}`),
    ...readdirSync(join(ROOT, 'icons')).filter(f => f.endsWith('.png')).sort().map(f => `./icons/${f}`)];
  for (const e of expected) assert.ok(assets.includes(e), `shipped file not precached: ${e}`);
  assert.equal(new Set(assets).size, assets.length, 'no duplicate assets');
});

test('sw.js cache name has moved on from the previous tag', () => {
  const m = sw.match(/const CACHE\s*=\s*'([^']+)'/);
  assert.ok(m, 'sw.js must define const CACHE');
  assert.match(m[1], /^mymind-v\d+$/);
  assert.notEqual(m[1], PREVIOUS_CACHE);
  assert.ok(Number(m[1].slice(8)) > Number(PREVIOUS_CACHE.slice(8)), 'cache version must increase');
});

test('sw.js only caches ok responses and cleans old caches', () => {
  assert.ok(/if \(r\.ok\)/.test(sw), 'cache only r.ok');
  assert.ok(/caches\.delete/.test(sw), 'old caches deleted on activate');
  assert.ok(/skipWaiting/.test(sw) && /clients\.claim/.test(sw));
});

test('every element id referenced from src/*.js exists in index.html', () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  // ids created at runtime inside JS template strings (wind-down steps, can't-sleep branches)
  const dynamic = new Set();
  for (const f of srcFiles) {
    for (const m of read(`src/${f}`).matchAll(/\bid="([^"]+)"/g)) dynamic.add(m[1]);
  }
  const missing = [];
  for (const f of srcFiles) {
    const js = read(`src/${f}`);
    for (const m of js.matchAll(/(?:getElementById|\$)\(\s*'([^']+)'\s*\)/g)) {
      const id = m[1];
      if (!ids.has(id) && !dynamic.has(id)) missing.push(`${f}: ${id}`);
    }
  }
  assert.deepEqual(missing, [], 'ids referenced in JS but absent from index.html');
});

test('no absolute http(s) URLs in shipped files', () => {
  const files = ['index.html', 'app.css', 'sw.js', 'manifest.webmanifest', ...srcFiles.map(f => `src/${f}`)];
  for (const f of files) {
    const hits = [...read(f).matchAll(/https?:\/\/[^\s"'<>)]+/g)].map(m => m[0]);
    assert.deepEqual(hits, [], `${f} contains absolute URLs`);
  }
  assert.ok(!/<link[^>]+href="https?:/.test(html) && !/<script[^>]+src="https?:/.test(html));
});

test('manifest is valid, relative, and matches the page theme colour', () => {
  const man = JSON.parse(read('manifest.webmanifest'));
  assert.equal(man.start_url, './');
  assert.equal(man.scope, './');
  assert.equal(man.display, 'standalone');
  for (const i of man.icons) {
    assert.ok(!i.src.startsWith('/'), `icon src must be relative: ${i.src}`);
    assert.ok(existsSync(join(ROOT, i.src)), `icon missing: ${i.src}`);
  }
  assert.ok(man.icons.some(i => i.purpose === 'maskable'), 'a maskable icon is required');
  const theme = html.match(/<meta name="theme-color" content="([^"]+)"/)[1];
  assert.equal(man.theme_color, theme);
});
