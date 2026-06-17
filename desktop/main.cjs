const { app, BrowserWindow, shell, dialog } = require('electron');
const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = `http://127.0.0.1:${PORT}`;

let mainWindow = null;

function waitForServer(timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`${BASE_URL}/api/sites`, res => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`本地服务启动超时：${BASE_URL}`));
        } else {
          setTimeout(tick, 500);
        }
      });
      req.setTimeout(1200, () => {
        req.destroy();
      });
    };
    tick();
  });
}

async function startLocalServer() {
  process.env.PORT = String(PORT);
  process.env.CONTENT_ENGINE_DESKTOP = '1';
  const serverPath = path.join(__dirname, '..', 'main.js');
  await import(pathToFileURL(serverPath).href);
  await waitForServer();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 720,
    title: 'Content Engine Lite',
    backgroundColor: '#eeede9',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(BASE_URL);
}

app.whenReady().then(async () => {
  try {
    await startLocalServer();
    createWindow();
  } catch (err) {
    dialog.showErrorBox('Content Engine Lite 启动失败', err.message || String(err));
    app.quit();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
