import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app as electronApp, BrowserWindow, dialog, shell } from 'electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appUrl = process.env.FLUXMEI_APP_URL || 'http://127.0.0.1:3002';
let server;
let mainWindow;

function configureEnvironment() {
  process.env.PORT ||= '3002';
  process.env.FRONTEND_URL ||= appUrl;
  process.env.NODE_ENV ||= electronApp.isPackaged ? 'production' : 'development';
  process.env.FLUXMEI_ENV_FILE ||= electronApp.isPackaged
    ? path.join(electronApp.getPath('userData'), 'fluxmei.env')
    : path.resolve(__dirname, '..', 'backend', '.env');
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    title: 'FluxMEI',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await mainWindow.loadURL(appUrl);
}

async function boot() {
  try {
    configureEnvironment();
    const { startServer } = await import('../backend/src/server.js');
    server = startServer(process.env.PORT);
    await createWindow();
  } catch (error) {
    dialog.showErrorBox(
      'FluxMEI',
      `Nao foi possivel iniciar o aplicativo.\n\n${error.message}\n\nArquivo de configuracao esperado:\n${process.env.FLUXMEI_ENV_FILE || 'backend/.env'}`
    );
    electronApp.quit();
  }
}

electronApp.whenReady().then(boot);

electronApp.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

electronApp.on('window-all-closed', () => {
  if (process.platform !== 'darwin') electronApp.quit();
});

electronApp.on('before-quit', () => {
  if (server) server.close();
});
