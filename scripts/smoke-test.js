import fs from 'fs';
import path from 'path';

const root = process.cwd();
const checks = [];

function ok(name, condition, detail = '') {
  if (!condition) {
    throw new Error(`${name} failed${detail ? `: ${detail}` : ''}`);
  }
  checks.push(name);
}

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

ok('main.js exists', exists('main.js'));
ok('start-windows.bat exists', exists('start-windows.bat'));
ok('stop-windows.bat exists', exists('stop-windows.bat'));
ok('engine/api.js exists', exists('engine/api.js'));
ok('ui/index.html exists', exists('ui/index.html'));
ok('scripts/start-windows.ps1 exists', exists('scripts/start-windows.ps1'));
ok('scripts/stop-windows.ps1 exists', exists('scripts/stop-windows.ps1'));
ok('templates/article-types.json exists', exists('templates/article-types.json'));
ok('templates/prompt-sections.json exists', exists('templates/prompt-sections.json'));
ok('templates/qa-rules.json exists', exists('templates/qa-rules.json'));

const html = read('ui/index.html');
const script = html.match(/<script>([\s\S]*)<\/script>/);
ok('ui script tag exists', Boolean(script));
new Function(script[1]);
ok('ui script parses', true);
for (const marker of [
  'data-panel="keywords"',
  'data-panel="config"',
  'data-panel="files"',
  'data-panel="settings"',
  'config-project-instructions',
  'workspace-body',
  'settings-wordpress',
  'renderImportOverview',
  'publishSelectedWordPress',
]) {
  ok(`ui marker ${marker}`, html.includes(marker));
}

JSON.parse(read('templates/article-types.json'));
JSON.parse(read('templates/prompt-sections.json'));
JSON.parse(read('templates/qa-rules.json'));
ok('template json parses', true);

const demoSite = JSON.parse(read('examples/demo-site/site.json'));
ok('demo site parses', demoSite.siteId === 'demo-site');

const demoKeywords = read('examples/demo-site/keywords.csv').trim().split(/\r?\n/);
ok('demo keywords has header and 3 rows', demoKeywords.length >= 4, `${demoKeywords.length} lines`);

fs.mkdirSync(path.join(root, 'release'), { recursive: true });
ok('release directory can be created', exists('release'));

const api = read('engine/api.js');
for (const marker of [
  "router.get('/sites'",
  "router.get('/templates/:file'",
  "publish-pack",
  "project-instructions",
  "setup-preview",
  "publish-wordpress",
]) {
  ok(`api marker ${marker}`, api.includes(marker));
}

console.log(`Smoke test passed (${checks.length} checks).`);
