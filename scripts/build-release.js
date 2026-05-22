import fs from 'fs';
import path from 'path';
import archiver from 'archiver';

const root = process.cwd();
const releaseDir = path.join(root, 'release');
const packageName = 'Content-Engine-Lite-v0.1.1.zip';
const outputPath = path.join(releaseDir, packageName);

const includePaths = [
  'main.js',
  'start-windows.bat',
  'stop-windows.bat',
  'package.json',
  'package-lock.json',
  'engine',
  'ui',
  'templates',
  'examples/demo-site',
  'docs',
  'scripts',
  '.env.example',
  'VERSION',
  'CHANGELOG.md',
  'RELEASE-CHECKLIST.md',
  'README.md',
  'SECURITY-CHECK.md',
];

const blockedFragments = [
  '/.git/',
  '/node_modules/',
  '/sites/',
  '/release/',
  '/logs/',
  '/runtime/',
  '/outputs/',
];

const blockedNames = new Set([
  '.env',
  'server.out.log',
  'server.err.log',
]);

function normalize(p) {
  return p.replace(/\\/g, '/');
}

function shouldExclude(absPath) {
  const rel = normalize('/' + path.relative(root, absPath));
  const base = path.basename(absPath);
  if (base === '.env.example') return false;
  if (blockedNames.has(base)) return true;
  if (base.startsWith('.env.')) return true;
  if (base.endsWith('.tmp') || base.endsWith('.bak')) return true;
  return blockedFragments.some(fragment => rel.includes(fragment));
}

function addPath(archive, relPath) {
  const abs = path.join(root, relPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Required release path missing: ${relPath}`);
  }
  const stat = fs.statSync(abs);
  if (shouldExclude(abs)) return;
  if (stat.isDirectory()) {
    archive.directory(abs, relPath, entry => {
      if (!entry || shouldExclude(path.join(root, entry.name))) return false;
      return entry;
    });
  } else {
    archive.file(abs, { name: relPath });
  }
}

fs.mkdirSync(releaseDir, { recursive: true });
if (fs.existsSync(outputPath)) fs.rmSync(outputPath, { force: true });

const output = fs.createWriteStream(outputPath);
const archive = archiver('zip', { zlib: { level: 9 } });

const done = new Promise((resolve, reject) => {
  output.on('close', resolve);
  archive.on('warning', reject);
  archive.on('error', reject);
});

archive.pipe(output);
for (const relPath of includePaths) addPath(archive, relPath);
await archive.finalize();
await done;

const sizeMb = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
console.log(`Release created: ${outputPath} (${sizeMb} MB)`);
