// Programa do PC da loja: o sistema vem do site (atualiza sozinho) e o WhatsApp Web
// fica em uma área separada, abaixo das abas. Um site comum não pode fazer isso.
const { app, BaseWindow, WebContentsView, ipcMain, session, shell } = require('electron');
const path = require('path');

const APP_URL = 'https://sabordacarne.pontopdv.tech';
const WHATSAPP_URL = 'https://web.whatsapp.com/';
const TOPBAR_HEIGHT = 44; // igual a --app-topbar-height em src/index.css
const WHATSAPP_PERMISSIONS = new Set(['notifications', 'media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen']);

let win;
let systemView;
let whatsappView;

const isHost = (url, host) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && (parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
};

const openExternal = (url) => {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
};

/** Links para fora abrem no navegador; cada área fica presa ao próprio site. */
function lockNavigation(contents, host) {
  contents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (isHost(url, host)) return;
    event.preventDefault();
    openExternal(url);
  });
}

function layout() {
  const { width, height } = win.getContentBounds();
  systemView.setBounds({ x: 0, y: 0, width, height });
  whatsappView.setBounds({ x: 0, y: TOPBAR_HEIGHT, width, height: Math.max(0, height - TOPBAR_HEIGHT) });
}

function createWindow() {
  win = new BaseWindow({ width: 1366, height: 800, minWidth: 900, minHeight: 600, title: 'Ponto', icon: path.join(__dirname, 'icon.png'), autoHideMenuBar: true });

  systemView = new WebContentsView({
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  lockNavigation(systemView.webContents, 'sabordacarne.pontopdv.tech');
  // Recarregou (ou saiu do sistema): volta para a tela do sistema
  systemView.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) whatsappView.setVisible(false);
  });

  const whatsappSession = session.fromPartition('persist:whatsapp');
  // O WhatsApp só aceita navegadores conhecidos
  whatsappSession.setUserAgent(`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`);
  whatsappSession.setPermissionRequestHandler((_contents, permission, done) => done(WHATSAPP_PERMISSIONS.has(permission)));
  whatsappView = new WebContentsView({
    webPreferences: { session: whatsappSession, contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  lockNavigation(whatsappView.webContents, 'whatsapp.com');
  whatsappView.setVisible(false);

  win.contentView.addChildView(systemView);
  win.contentView.addChildView(whatsappView);
  layout();
  win.on('resize', layout);
  win.on('closed', () => app.quit());
  win.maximize();

  ipcMain.on('ponto:show-whatsapp', (event, visible) => {
    if (event.sender !== systemView.webContents || !isHost(event.senderFrame?.url ?? '', 'sabordacarne.pontopdv.tech')) return;
    if (visible && !whatsappView.webContents.getURL()) void whatsappView.webContents.loadURL(WHATSAPP_URL);
    whatsappView.setVisible(visible === true);
    if (visible) whatsappView.webContents.focus();
  });

  void systemView.webContents.loadURL(APP_URL);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(createWindow);
}
