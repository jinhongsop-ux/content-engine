import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { router as apiRouter } from './engine/api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '10mb' }));
app.use(express.text({ type: 'text/plain', limit: '10mb' }));
app.use(express.static(join(__dirname, 'ui')));
app.use('/api', apiRouter);

app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, 'ui', 'index.html'));
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`\nContent Engine running at http://127.0.0.1:${PORT}`);

  const sitesDir = join(__dirname, 'sites');
  if (fs.existsSync(sitesDir)) {
    const sites = fs.readdirSync(sitesDir).filter(name => {
      const full = join(sitesDir, name);
      return fs.statSync(full).isDirectory() && !name.startsWith('.');
    });
    console.log(sites.length ? `Sites: ${sites.join(', ')}` : 'No sites yet. Add a folder under /sites/.');
  }

  console.log('API key: set ANTHROPIC_API_KEY or enter a key in the UI.\n');
});
