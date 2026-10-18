// Write It — proceso principal (Electron)
// Licencia MIT
'use strict';

const { app, BrowserWindow, ipcMain, dialog, Menu, shell, session, nativeTheme, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { AIEngine } = require('./ai-engine');

const SELFTEST = process.argv.includes('--selftest');
const OPENABLE = ['.wit', '.fwd', '.docx', '.html', '.htm', '.txt', '.md'];
const USER_DATA = app.getPath('userData');
const SETTINGS_FILE = path.join(USER_DATA, 'settings.json');
const RECENT_FILE = path.join(USER_DATA, 'recent.json');
const RECOVERY_DIR = path.join(USER_DATA, 'recovery');

const DEFAULT_SETTINGS = {
  theme: 'light',            // light | dark | system
  accent: '#2b5797',
  author: (os.userInfo().username || 'Autor').replace(/^./, c => c.toUpperCase()),
  fontFamily: 'Calibri',
  fontSize: 11,
  lineHeight: 1.15,
  pageSize: 'A4',
  margins: 'normal',
  spellcheck: true,
  spellLanguages: ['es-ES', 'en-US'],
  autosave: true,
  shortcuts: 'es',           // es = atajos de Word en español, en = en inglés
  dictationLang: 'spanish',
  dictAutoPolish: false,
  aiWhisper: 'whisper-small',
  aiLlm: 'qwen2.5-1.5b',
  recentFonts: [],
  showRuler: true,
  showNav: false,
  favorites: ['dictate', 'aiPolish', 'insertTable', 'insertImage', 'pageBreak', 'toc',
    'findReplace', 'wordCount', 'exportPdf', 'saveDocx'],
  windowBounds: null,
  windowMaximized: true,
};

// ---------- utilidades de almacenamiento ----------
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

let settings = { ...DEFAULT_SETTINGS, ...readJSON(SETTINGS_FILE, {}) };
function saveSettings() { if (!SELFTEST) writeJSON(SETTINGS_FILE, settings); }

function getRecent() {
  return readJSON(RECENT_FILE, []).filter(r => r && r.path && fs.existsSync(r.path));
}
function addRecent(filePath) {
  if (SELFTEST) return;
  const list = getRecent().filter(r => r.path.toLowerCase() !== filePath.toLowerCase());
  list.unshift({ path: filePath, name: path.basename(filePath), date: Date.now() });
  writeJSON(RECENT_FILE, list.slice(0, 20));
}

// ---------- ventanas ----------
const windows = new Map(); // id -> { win, dirty, name, docId, ctx }

function titleBarColors() {
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && nativeTheme.shouldUseDarkColors);
  return dark ? { color: '#262624', symbolColor: '#f5f4ef', height: 40 }
    : { color: '#f4f3f0', symbolColor: '#1d1d1f', height: 40 };
}

function createWindow(filePath, opts = {}) {
  const b = settings.windowBounds || {};
  const win = new BrowserWindow({
    width: b.width || 1360,
    height: b.height || 860,
    x: windows.size === 0 ? b.x : undefined,
    y: windows.size === 0 ? b.y : undefined,
    minWidth: 760,
    minHeight: 500,
    show: false,
    title: 'Write It',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: titleBarColors().color,
    titleBarStyle: 'hidden',
    titleBarOverlay: titleBarColors(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      plugins: true, // visor de PDF para la vista previa de impresión
    },
  });
  windows.set(win.id, { win, dirty: false, name: 'Documento1', docId: null, ctx: {} });

  const query = {};
  if (filePath) query.file = filePath;
  if (opts.template) query.template = opts.template;
  if (SELFTEST) query.selftest = '1';
  win.loadFile(path.join(__dirname, 'src', 'index.html'), { query });

  win.once('ready-to-show', () => {
    if (SELFTEST) { win.show(); win.focus(); return; }
    if (settings.windowMaximized && windows.size === 1) win.maximize();
    win.show();
  });

  const remember = () => {
    if (win.isDestroyed() || win.isMinimized()) return;
    settings.windowMaximized = win.isMaximized();
    if (!win.isMaximized() && !win.isFullScreen()) settings.windowBounds = win.getBounds();
    saveSettings();
  };
  win.on('resize', debounce(remember, 600));
  win.on('move', debounce(remember, 600));

  win.on('close', (e) => {
    const st = windows.get(win.id);
    if (!st || win.forceClose || !st.dirty || SELFTEST) return;
    e.preventDefault();
    const r = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Guardar', 'No guardar', 'Cancelar'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      title: 'Write It',
      message: `¿Quieres guardar los cambios en "${st.name}"?`,
      detail: 'Si no los guardas, se perderán tus cambios.',
    });
    if (r === 0) win.webContents.send('app:save-and-close');
    else if (r === 1) { removeRecovery(st.docId); win.forceClose = true; win.close(); }
  });
  win.on('closed', () => {
    const st = windows.get(win.id);
    if (st && !st.dirty) removeRecovery(st.docId);
    windows.delete(win.id);
  });

  const wc = win.webContents;
  // Nunca navegar dentro de la app: los vínculos se abren en el navegador.
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (url !== wc.getURL()) {
      e.preventDefault();
      if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url);
    }
  });
  wc.on('context-menu', (e, params) => buildContextMenu(win, params));
  wc.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    }
    if (input.type === 'keyDown' && input.key === 'F12' && input.control && input.shift) {
      wc.toggleDevTools();
      e.preventDefault();
    }
  });
  return win;
}

function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ---------- menú contextual (incluye corrector ortográfico) ----------
function buildContextMenu(win, params) {
  const st = windows.get(win.id) || { ctx: {} };
  const ctx = st.ctx || {};
  const wc = win.webContents;
  const send = (cmd) => wc.send('app:command', cmd);
  const items = [];

  if (params.misspelledWord) {
    const sugg = params.dictionarySuggestions.slice(0, 6);
    if (sugg.length) {
      sugg.forEach(s => items.push({ label: s, click: () => wc.replaceMisspelling(s) }));
    } else {
      items.push({ label: 'Sin sugerencias', enabled: false });
    }
    items.push({ label: 'Agregar al diccionario', click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord) });
    items.push({ type: 'separator' });
  }
  if (params.isEditable || params.selectionText) {
    items.push(
      { label: 'Cortar', accelerator: 'CmdOrCtrl+X', enabled: params.editFlags.canCut, click: () => wc.cut() },
      { label: 'Copiar', accelerator: 'CmdOrCtrl+C', enabled: params.editFlags.canCopy, click: () => wc.copy() },
      { label: 'Pegar', accelerator: 'CmdOrCtrl+V', enabled: params.editFlags.canPaste, click: () => wc.paste() },
      { label: 'Pegar solo texto', accelerator: 'CmdOrCtrl+Shift+V', enabled: params.editFlags.canPaste, click: () => wc.pasteAndMatchStyle() },
    );
  }
  if (params.isEditable && ctx.inDocument) {
    items.push({ type: 'separator' });
    items.push({ label: 'Fuente y párrafo…', click: () => send('paragraphDialog') });
    items.push({ label: 'Vínculo…', click: () => send('link') });
    items.push({ label: 'Nuevo comentario', click: () => send('commentAdd') });
    if (ctx.inTable) {
      items.push({ type: 'separator' });
      items.push({
        label: 'Insertar', submenu: [
          { label: 'Fila arriba', click: () => send('rowAbove') },
          { label: 'Fila debajo', click: () => send('rowBelow') },
          { label: 'Columna a la izquierda', click: () => send('colLeft') },
          { label: 'Columna a la derecha', click: () => send('colRight') },
        ],
      });
      items.push({
        label: 'Eliminar', submenu: [
          { label: 'Fila', click: () => send('rowDelete') },
          { label: 'Columna', click: () => send('colDelete') },
          { label: 'Tabla completa', click: () => send('tableDelete') },
        ],
      });
    }
  }
  if (params.linkURL && /^https?:|^mailto:/i.test(params.linkURL)) {
    items.push({ type: 'separator' });
    items.push({ label: 'Abrir vínculo', click: () => shell.openExternal(params.linkURL) });
    items.push({ label: 'Copiar vínculo', click: () => clipboard.writeText(params.linkURL) });
    if (params.isEditable) items.push({ label: 'Quitar vínculo', click: () => send('unlink') });
  }
  if (!items.length) return;
  Menu.buildFromTemplate(items).popup({ window: win });
}

// ---------- recuperación automática ----------
function recoveryPath(docId) { return path.join(RECOVERY_DIR, `${String(docId).replace(/[^\w-]/g, '')}.json`); }
function removeRecovery(docId) {
  if (!docId) return;
  try { fs.unlinkSync(recoveryPath(docId)); } catch { /* no existe */ }
}

// ---------- lectura / escritura de documentos ----------
function escapeHtml(s) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function textToHtml(text) {
  const paras = text.replace(/\r\n?/g, '\n').split('\n');
  return paras.map(p => p ? `<p>${escapeHtml(p).replace(/\t/g, '<span class="tab">\t</span>')}</p>` : '<p><br></p>').join('');
}

function markdownToHtml(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let list = null;
  const inline = (s) => escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>');
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of lines) {
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { closeList(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); }
    else if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) { if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = line.match(/^>\s?(.*)$/))) { closeList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); }
    else if (!line.trim()) { closeList(); }
    else { closeList(); out.push(`<p>${inline(line)}</p>`); }
  }
  closeList();
  return out.join('') || '<p><br></p>';
}

async function readDocument(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath);
  if (ext === '.wit' || ext === '.fwd') {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (data.app !== 'write-it' && data.app !== 'fabrizzio-writer') throw new Error('El archivo no es un documento válido de Write It.');
    return { path: filePath, name, format: 'wit', doc: data };
  }
  if (ext === '.docx') {
    const mammoth = require('mammoth');
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.convertToHtml({ buffer }, {
      styleMap: [
        "p[style-name='Title'] => h1.doc-title:fresh",
        "p[style-name='Título'] => h1.doc-title:fresh",
        "p[style-name='Subtitle'] => p.doc-subtitle:fresh",
        "p[style-name='Subtítulo'] => p.doc-subtitle:fresh",
        "p[style-name='Quote'] => blockquote:fresh",
        "p[style-name='Cita'] => blockquote:fresh",
        'u => u',
        'strike => s',
        'highlight => mark',
      ],
    });
    let html = result.value.replace(/<p><\/p>/g, '<p><br></p>');
    return { path: filePath, name, format: 'docx', doc: { html: html || '<p><br></p>' }, warnings: result.messages.length };
  }
  if (ext === '.html' || ext === '.htm') {
    const raw = fs.readFileSync(filePath, 'utf8');
    const m = raw.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    let html = m ? m[1] : raw;
    html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    return { path: filePath, name, format: 'html', doc: { html } };
  }
  if (ext === '.md') {
    return { path: filePath, name, format: 'md', doc: { html: markdownToHtml(fs.readFileSync(filePath, 'utf8')) } };
  }
  return { path: filePath, name, format: 'txt', doc: { html: textToHtml(fs.readFileSync(filePath, 'utf8')) } };
}

const mmToTwip = (mm) => Math.round(mm / 25.4 * 1440);

async function buildDocx(doc) {
  const HTMLtoDOCX = require('html-to-docx');
  const p = doc.page;
  const w = p.orientation === 'landscape' ? p.height : p.width;
  const h = p.orientation === 'landscape' ? p.width : p.height;
  const headerHtml = doc.headerHtml || '<p></p>';
  const footerHtml = doc.footerHtml || '<p></p>';
  const buf = await HTMLtoDOCX(doc.exportHtml, headerHtml, {
    orientation: p.orientation,
    pageSize: { width: mmToTwip(w), height: mmToTwip(h) },
    margins: {
      top: mmToTwip(p.margins.top), right: mmToTwip(p.margins.right),
      bottom: mmToTwip(p.margins.bottom), left: mmToTwip(p.margins.left),
      header: mmToTwip(12.5), footer: mmToTwip(12.5), gutter: 0,
    },
    title: doc.meta?.title || '',
    creator: doc.meta?.author || settings.author,
    lastModifiedBy: settings.author,
    font: doc.fontFamily || settings.fontFamily,
    fontSize: Math.round((doc.fontSize || settings.fontSize) * 2),
    header: !!doc.headerHtml,
    footer: !!doc.footerHtml || !!doc.pageNumbers,
    pageNumber: !!doc.pageNumbers,
    lang: 'es-ES',
    table: { row: { cantSplit: true } },
  }, footerHtml);
  return Buffer.isBuffer(buf) ? buf : Buffer.from(await buf.arrayBuffer());
}

async function writeDocument(win, filePath, payload) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.docx') {
    fs.writeFileSync(filePath, await buildDocx(payload));
  } else if (ext === '.html' || ext === '.htm') {
    fs.writeFileSync(filePath, payload.standaloneHtml, 'utf8');
  } else if (ext === '.txt') {
    fs.writeFileSync(filePath, payload.text.replace(/\n/g, os.EOL), 'utf8');
  } else if (ext === '.pdf') {
    fs.writeFileSync(filePath, await makePdf(win));
  } else {
    const data = {
      app: 'write-it', version: 1,
      html: payload.html, header: payload.header, footer: payload.footer,
      page: payload.page, pageNumbers: payload.pageNumbers, watermark: payload.watermark,
      pageColor: payload.pageColor, columns: payload.columns,
      fontFamily: payload.fontFamily, fontSize: payload.fontSize, lineHeight: payload.lineHeight, headingFont: payload.headingFont,
      meta: { ...(payload.meta || {}), modified: new Date().toISOString() },
    };
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
    fs.renameSync(tmp, filePath);
  }
}

function makePdf(win) {
  return win.webContents.printToPDF({
    preferCSSPageSize: true,
    printBackground: true,
    generateDocumentOutline: true,
    generateTaggedPDF: true,
  });
}

const SAVE_FILTERS = [
  { name: 'Documento de Write It', extensions: ['wit'] },
  { name: 'Documento de Word', extensions: ['docx'] },
  { name: 'PDF', extensions: ['pdf'] },
  { name: 'Página web', extensions: ['html'] },
  { name: 'Texto sin formato', extensions: ['txt'] },
];

function filtersFor(preferExt) {
  if (!preferExt) return SAVE_FILTERS;
  const first = SAVE_FILTERS.find(f => f.extensions.includes(preferExt));
  return [first, ...SAVE_FILTERS.filter(f => f !== first)];
}

// ---------- IPC ----------
function winOf(e) { return BrowserWindow.fromWebContents(e.sender); }

ipcMain.handle('settings:get', () => settings);
ipcMain.handle('settings:set', (e, patch) => {
  settings = { ...settings, ...patch };
  saveSettings();
  for (const { win } of windows.values()) {
    if (win.isDestroyed()) continue;
    try { win.setTitleBarOverlay(titleBarColors()); } catch { /* sin overlay */ }
    if (win.webContents !== e.sender) win.webContents.send('settings:changed', settings);
  }
  if (patch.spellLanguages) applySpellLanguages();
  return settings;
});
ipcMain.handle('app:info', () => ({
  version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome,
  platform: process.platform, userData: USER_DATA, selftest: SELFTEST,
}));

ipcMain.handle('recent:list', () => getRecent());
ipcMain.handle('recent:clear', () => { writeJSON(RECENT_FILE, []); return []; });

ipcMain.handle('file:openDialog', async (e) => {
  const win = winOf(e);
  const r = await dialog.showOpenDialog(win, {
    title: 'Abrir',
    properties: ['openFile'],
    filters: [
      { name: 'Todos los documentos', extensions: OPENABLE.map(x => x.slice(1)) },
      { name: 'Write It', extensions: ['wit', 'fwd'] },
      { name: 'Word', extensions: ['docx'] },
      { name: 'Página web', extensions: ['html', 'htm'] },
      { name: 'Texto', extensions: ['txt', 'md'] },
    ],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return r.filePaths[0];
});

ipcMain.handle('file:read', async (e, filePath) => {
  try {
    const res = await readDocument(filePath);
    addRecent(filePath);
    return res;
  } catch (err) {
    return { error: `No se pudo abrir "${path.basename(filePath)}".\n${err.message}` };
  }
});

ipcMain.handle('file:save', async (e, { filePath, payload, saveAs, preferExt }) => {
  const win = winOf(e);
  let target = filePath;
  if (!target || saveAs) {
    const base = (payload.meta && payload.meta.title) || 'Documento1';
    const ext = preferExt || 'wit';
    const r = await dialog.showSaveDialog(win, {
      title: 'Guardar como',
      defaultPath: path.join(filePath ? path.dirname(filePath) : app.getPath('documents'),
        base.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '') + '.' + ext),
      filters: filtersFor(ext),
    });
    if (r.canceled || !r.filePath) return { canceled: true };
    target = r.filePath;
  }
  try {
    await writeDocument(win, target, payload);
    const ext = path.extname(target).toLowerCase().slice(1);
    if (ext !== 'pdf') addRecent(target);
    return { path: target, name: path.basename(target), format: ext };
  } catch (err) {
    return { error: `No se pudo guardar el archivo.\n${err.message}` };
  }
});

ipcMain.handle('file:exportPdf', async (e, { suggestedName, open }) => {
  const win = winOf(e);
  const r = await dialog.showSaveDialog(win, {
    title: 'Exportar a PDF',
    defaultPath: path.join(app.getPath('documents'), (suggestedName || 'Documento1').replace(/\.[^.]+$/, '') + '.pdf'),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (r.canceled || !r.filePath) return { canceled: true };
  try {
    fs.writeFileSync(r.filePath, await makePdf(win));
    if (open) shell.openPath(r.filePath);
    return { path: r.filePath };
  } catch (err) {
    return { error: `No se pudo exportar el PDF.\n${err.message}` };
  }
});

ipcMain.handle('print:preview', async (e) => {
  const win = winOf(e);
  const data = await makePdf(win);
  const file = path.join(os.tmpdir(), `writeit-preview-${win.id}.pdf`);
  fs.writeFileSync(file, data);
  return 'file:///' + file.replace(/\\/g, '/') + '?t=' + Date.now();
});

ipcMain.handle('print:print', (e) => new Promise((resolve) => {
  winOf(e).webContents.print({ printBackground: true }, (ok, reason) => resolve({ ok, reason }));
}));

ipcMain.handle('image:pick', async (e) => {
  const r = await dialog.showOpenDialog(winOf(e), {
    title: 'Insertar imagen',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] }],
  });
  if (r.canceled) return [];
  const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml' };
  return r.filePaths.map(f => `data:${mime[path.extname(f).toLowerCase()] || 'image/png'};base64,${fs.readFileSync(f).toString('base64')}`);
});

ipcMain.on('doc:state', (e, { dirty, name, docId }) => {
  const st = windows.get(winOf(e)?.id);
  if (!st) return;
  st.dirty = !!dirty; st.name = name || st.name; st.docId = docId || st.docId;
  const win = st.win;
  win.setTitle(`${dirty ? '• ' : ''}${st.name} — Write It`);
  win.setDocumentEdited?.(!!dirty);
});
ipcMain.on('doc:ctx', (e, ctx) => {
  const st = windows.get(winOf(e)?.id);
  if (st) st.ctx = ctx || {};
});

ipcMain.handle('recovery:write', (e, { docId, data }) => {
  if (SELFTEST) return true;
  writeJSON(recoveryPath(docId), { ...data, savedAt: Date.now() });
  return true;
});
ipcMain.handle('recovery:remove', (e, docId) => { removeRecovery(docId); return true; });
ipcMain.handle('recovery:list', () => {
  if (SELFTEST) return [];
  const openIds = new Set([...windows.values()].map(s => s.docId).filter(Boolean));
  try {
    return fs.readdirSync(RECOVERY_DIR).filter(f => f.endsWith('.json'))
      .map(f => ({ id: f.slice(0, -5), ...readJSON(path.join(RECOVERY_DIR, f), {}) }))
      .filter(r => r.html && !openIds.has(r.id))
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch { return []; }
});

ipcMain.on('window:new', (e, opts) => createWindow(opts && opts.file, opts || {}));
ipcMain.on('window:close-now', (e) => {
  const win = winOf(e);
  if (!win) return;
  win.forceClose = true;
  win.close();
});
ipcMain.on('window:fullscreen', (e) => { const w = winOf(e); w.setFullScreen(!w.isFullScreen()); });
ipcMain.on('edit:clipboard', (e, action) => {
  const wc = e.sender;
  if (action === 'cut') wc.cut();
  else if (action === 'copy') wc.copy();
  else if (action === 'paste') wc.paste();
  else if (action === 'pasteText') wc.pasteAndMatchStyle();
});
ipcMain.on('shell:open', (e, url) => { if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url); });
ipcMain.handle('spell:languages', () => session.defaultSession.availableSpellCheckerLanguages);
ipcMain.on('spell:enable', (e, on) => { session.defaultSession.setSpellCheckerEnabled(!!on); });

// ---------- IA local ----------
const ai = new AIEngine({
  userData: process.env.WRITEIT_MODELS || USER_DATA,
  getSettings: () => settings,
  setSettings: (patch) => { settings = { ...settings, ...patch }; saveSettings(); },
  broadcast: (ch, data) => { for (const { win } of windows.values()) if (!win.isDestroyed()) win.webContents.send(ch, data); },
});
ipcMain.handle('ai:status', () => ai.status());
ipcMain.handle('ai:download', (e, { kind, id }) => ai.download(kind, id));
ipcMain.handle('ai:cancelDownload', () => ai.cancelDownload());
ipcMain.handle('ai:remove', (e, { kind, id }) => ai.remove(kind, id));
ipcMain.handle('ai:select', (e, { kind, id }) => ai.select(kind, id));
ipcMain.handle('ai:transcribe', (e, payload) => ai.transcribe(payload));
ipcMain.handle('ai:generate', (e, payload) => ai.generate(payload));
ipcMain.handle('ai:cancel', () => ai.cancel());

// ---------- autoprueba ----------
ipcMain.handle('selftest:docx', async (e, payload) => {
  const dir = process.env.SELFTEST_OUT || path.join(os.tmpdir(), 'writeit-selftest');
  fs.mkdirSync(dir, { recursive: true });
  const out = {};
  const docx = path.join(dir, 'prueba.docx');
  await writeDocument(winOf(e), docx, payload);
  out.docxBytes = fs.statSync(docx).size;
  const back = await readDocument(docx);
  out.docxRoundTrip = back.doc.html;
  const fwd = path.join(dir, 'prueba.wit');
  await writeDocument(winOf(e), fwd, payload);
  out.fwdRoundTrip = (await readDocument(fwd)).doc.html === payload.html;
  const pdf = path.join(dir, 'prueba.pdf');
  await writeDocument(winOf(e), pdf, payload);
  out.pdfBytes = fs.statSync(pdf).size;
  await writeDocument(winOf(e), path.join(dir, 'prueba.html'), payload);
  await writeDocument(winOf(e), path.join(dir, 'prueba.txt'), payload);
  out.txt = fs.readFileSync(path.join(dir, 'prueba.txt'), 'utf8').slice(0, 80);
  out.dir = dir;
  return out;
});
ipcMain.handle('selftest:shot', async (e, name) => {
  const dir = process.env.SELFTEST_OUT || path.join(os.tmpdir(), 'writeit-selftest');
  fs.mkdirSync(dir, { recursive: true });
  const img = await winOf(e).webContents.capturePage();
  const f = path.join(dir, name + '.png');
  fs.writeFileSync(f, img.toPNG());
  return f;
});
ipcMain.handle('selftest:keys', async (e, seq) => {
  const wc = e.sender;
  const pause = () => new Promise(r => setTimeout(r, 12));
  for (const item of seq) {
    if (typeof item === 'string') {
      for (const ch of item) { wc.sendInputEvent({ type: 'char', keyCode: ch }); await pause(); }
    } else {
      const modifiers = item.mods || [];
      wc.sendInputEvent({ type: 'keyDown', keyCode: item.key, modifiers });
      if (item.key === 'Enter') wc.sendInputEvent({ type: 'char', keyCode: String.fromCharCode(13), modifiers });
      else if (item.key.length === 1 && !modifiers.includes('control')) wc.sendInputEvent({ type: 'char', keyCode: item.key, modifiers });
      wc.sendInputEvent({ type: 'keyUp', keyCode: item.key, modifiers });
      await pause();
    }
  }
  await new Promise(r => setTimeout(r, 120));
  return true;
});
ipcMain.on('selftest:done', (e, result) => {
  console.log('SELFTEST_RESULT ' + JSON.stringify(result, null, 2));
  app.exit(result.failed ? 1 : 0);
});

// ---------- arranque ----------
function applySpellLanguages() {
  const avail = session.defaultSession.availableSpellCheckerLanguages;
  const langs = (settings.spellLanguages || []).filter(l => avail.includes(l));
  if (langs.length) session.defaultSession.setSpellCheckerLanguages(langs);
}

function fileFromArgv(argv) {
  return argv.slice(1).find(a => !a.startsWith('-') && OPENABLE.includes(path.extname(a).toLowerCase()) && fs.existsSync(a));
}

if (!SELFTEST && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (e, argv) => {
    const f = fileFromArgv(argv);
    if (f) createWindow(path.resolve(f));
    else {
      const first = [...windows.values()][0];
      if (first) { if (first.win.isMinimized()) first.win.restore(); first.win.focus(); }
      else createWindow();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    app.setAppUserModelId('com.fabrizzio.writeit');
    const ses = session.defaultSession;
    ses.setPermissionRequestHandler((wc, perm, cb) => cb(['local-fonts', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'media', 'speaker-selection'].includes(perm)));
    ses.setPermissionCheckHandler((wc, perm) => ['local-fonts', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'media', 'speaker-selection'].includes(perm));
    applySpellLanguages();
    ses.setSpellCheckerEnabled(settings.spellcheck !== false);
    nativeTheme.themeSource = settings.theme === 'system' ? 'system' : settings.theme;

    const f = fileFromArgv(process.argv);
    createWindow(f ? path.resolve(f) : undefined);
  });

  app.on('window-all-closed', () => app.quit());
}
