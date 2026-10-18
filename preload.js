// Puente seguro entre la interfaz y el sistema.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  appInfo: () => ipcRenderer.invoke('app:info'),
  recentList: () => ipcRenderer.invoke('recent:list'),
  recentClear: () => ipcRenderer.invoke('recent:clear'),
  openDialog: () => ipcRenderer.invoke('file:openDialog'),
  readFile: (p) => ipcRenderer.invoke('file:read', p),
  saveFile: (opts) => ipcRenderer.invoke('file:save', opts),
  exportPdf: (opts) => ipcRenderer.invoke('file:exportPdf', opts),
  printPreview: () => ipcRenderer.invoke('print:preview'),
  print: () => ipcRenderer.invoke('print:print'),
  pickImages: () => ipcRenderer.invoke('image:pick'),
  pathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch { return null; } },
  docState: (s) => ipcRenderer.send('doc:state', s),
  docCtx: (c) => ipcRenderer.send('doc:ctx', c),
  recoveryWrite: (docId, data) => ipcRenderer.invoke('recovery:write', { docId, data }),
  recoveryRemove: (docId) => ipcRenderer.invoke('recovery:remove', docId),
  recoveryList: () => ipcRenderer.invoke('recovery:list'),
  newWindow: (opts) => ipcRenderer.send('window:new', opts || {}),
  closeNow: () => ipcRenderer.send('window:close-now'),
  toggleFullscreen: () => ipcRenderer.send('window:fullscreen'),
  clipboard: (action) => ipcRenderer.send('edit:clipboard', action),
  openExternal: (url) => ipcRenderer.send('shell:open', url),
  spellLanguages: () => ipcRenderer.invoke('spell:languages'),
  spellEnable: (on) => ipcRenderer.send('spell:enable', on),
  ai: {
    status: () => ipcRenderer.invoke('ai:status'),
    download: (kind, id) => ipcRenderer.invoke('ai:download', { kind, id }),
    cancelDownload: () => ipcRenderer.invoke('ai:cancelDownload'),
    remove: (kind, id) => ipcRenderer.invoke('ai:remove', { kind, id }),
    select: (kind, id) => ipcRenderer.invoke('ai:select', { kind, id }),
    transcribe: (payload) => ipcRenderer.invoke('ai:transcribe', payload),
    generate: (payload) => ipcRenderer.invoke('ai:generate', payload),
    cancel: () => ipcRenderer.invoke('ai:cancel'),
  },
  on: (channel, fn) => {
    const allowed = ['app:save-and-close', 'app:command', 'settings:changed', 'ai:progress'];
    if (!allowed.includes(channel)) return () => {};
    const handler = (e, ...args) => fn(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  selftest: {
    docx: (payload) => ipcRenderer.invoke('selftest:docx', payload),
    shot: (name) => ipcRenderer.invoke('selftest:shot', name),
    keys: (seq) => ipcRenderer.invoke('selftest:keys', seq),
    done: (result) => ipcRenderer.send('selftest:done', result),
  },
});
