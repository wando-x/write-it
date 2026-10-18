// Arranque de la aplicación y eventos del editor
'use strict';

async function init() {
  Settings = await api.getSettings();
  AppInfo = await api.appInfo();
  UI.applyTheme();
  document.execCommand('defaultParagraphSeparator', false, 'p');
  UI.build();
  Files.resetDoc();
  docEl().innerHTML = '<p><br></p>';
  applySpellcheck();

  const q = new URLSearchParams(location.search);
  if (q.get('file')) await Files.openPath(q.get('file'), { replace: true });
  else Files.applyTemplate(q.get('template') || 'blank');

  bindEditorEvents();
  bindGlobalEvents();
  applyDoc();
  UI.setZoom(Settings.zoom || UI.comfortZoom(), { save: false });
  UI.updateTitle();
  Files.pushState();
  focusDoc();
  document.fonts.ready.then(() => scheduleLayout());

  if (q.get('selftest')) { window.runSelftest && window.runSelftest(); return; }
  if (!q.get('file') && !q.get('template')) setTimeout(offerRecovery, 600);
}

function bindEditorEvents() {
  const d = docEl();

  d.addEventListener('beforeinput', (e) => {
    if (e.inputType === 'historyUndo') { e.preventDefault(); History.undo(); }
    else if (e.inputType === 'historyRedo') { e.preventDefault(); History.redo(); }
    else if (Images.selected && /^(insert|delete)/.test(e.inputType)) {
      if (/^delete/.test(e.inputType)) { e.preventDefault(); Images.remove(); return; }
      Images.deselect();
    }
    if (/^(insertParagraph|insertFromPaste|insertFromDrop|deleteByCut|insertReplacementText)$/.test(e.inputType)) History.flush();
  });

  d.addEventListener('input', (e) => {
    if (e.inputType === 'insertParagraph') fixNewParagraph();
    if (e.inputType === 'insertText' && e.data === ' ') autoFormatOnSpace();
    if (e.inputType === 'insertText' && e.data && /[\s)>.]/.test(e.data)) autoCorrect();
    if (e.inputType === 'insertText' && e.data && /[\s.,;:!?]/.test(e.data)) History.record(); // un paso de deshacer por palabra
    else { History.pending = true; typingSnap(); }
    normalizeIfNeeded();
    Notes.renumber();
    afterContentChange(true);
  });

  d.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      if (Tables.tab(e.shiftKey)) return;
      const r = currentRange();
      if (r && closestIn(r.startContainer, 'li')) { edit(() => exec(e.shiftKey ? 'outdent' : 'indent')); return; }
      if (!e.shiftKey) edit(() => exec('insertHTML', '<span class="tab">\t</span>&#8203;'));
      return;
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && Images.selected) { e.preventDefault(); Images.remove(); return; }
    if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey) { History.flush(); }
    if (Images.selected && !e.ctrlKey && !e.metaKey && e.key.length === 1) Images.deselect();
  });

  d.addEventListener('paste', (e) => {
    const cd = e.clipboardData;
    if (!cd) return;
    if (cd.files && cd.files.length && Images.readFiles(cd.files)) { e.preventDefault(); return; }
    const html = cd.getData('text/html');
    if (html) {
      e.preventDefault();
      const clean = sanitizeHtml(html.replace(/^[\s\S]*<!--StartFragment-->|<!--EndFragment-->[\s\S]*$/g, ''), { fromPaste: true });
      edit(() => exec('insertHTML', clean));
      return;
    }
    const text = cd.getData('text/plain');
    if (text && text.includes('\n')) {
      e.preventDefault();
      const paras = text.replace(/\r\n?/g, '\n').split(/\n/);
      const htmlText = paras.map(p => `<p>${escapeHtml(p).replace(/\t/g, '<span class="tab">\t</span>') || '<br>'}</p>`).join('');
      edit(() => exec('insertHTML', htmlText));
    }
  });

  d.addEventListener('mousedown', (e) => {
    if (e.button === 2) api.docCtx({ inDocument: true, inTable: !!closestIn(e.target, 'td,th') });
    if (e.target.nodeName === 'IMG' && inDoc(e.target)) { e.preventDefault(); Images.select(e.target); return; }
    if (Images.selected) Images.deselect();
  });

  d.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (a && inDoc(a)) {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); api.openExternal(a.href); }
      else UI.setMsg('Ctrl + clic para abrir el vínculo');
    }
    const row = e.target.closest && e.target.closest('.toc-row[data-target]');
    if (row) { e.preventDefault(); Toc.goto(row.dataset.target); return; }
    const ref = e.target.closest && e.target.closest('.footnote-ref');
    if (ref) { Notes.goto(ref.dataset.fn); return; }
    const c = e.target.closest && e.target.closest('span.comment');
    if (c && inDoc(c)) { UI.showPane('commentpane', true); Comments.activate(c.dataset.cid); }
  });

  d.addEventListener('mouseup', () => { if (Painter.fmt) setTimeout(() => Painter.apply(), 0); });

  d.addEventListener('dblclick', (e) => {
    const b = e.target.closest && e.target.closest('.page-break');
    if (b) toast('Salto de página: colócate justo después y pulsa Retroceso para quitarlo');
  });

  // encabezado y pie
  for (const id of ['doc-header', 'doc-footer']) {
    const n = document.getElementById(id);
    n.addEventListener('input', () => { $('#page-style').textContent = pageCss(); Files.markDirty(); });
    n.addEventListener('keydown', (e) => { if (e.key === 'Escape' || (e.key === 'Tab')) { e.preventDefault(); focusDoc(); } });
  }

  document.addEventListener('selectionchange', () => {
    UI.updateState();
    if (!$('#navpane').hidden && Nav.tab === 'headings') navSoon();
  });

  $('#img-handle .h-se').addEventListener('mousedown', (e) => Images.startResize(e));
  $('#scroller').addEventListener('scroll', () => Images.reposition(), { passive: true });
  window.addEventListener('resize', debounce(() => {
    // mientras no elijas un zoom, se adapta al tamaño de la ventana (p. ej. al maximizarla)
    if (!Settings.zoom) UI.setZoom(UI.comfortZoom(), { save: false });
    Images.reposition(); scheduleLayout();
  }, 100));
}

const navSoon = debounce(() => Nav.render(), 250);

// Al pulsar Intro después de un título, el párrafo nuevo vuelve a "Normal" (como en Word)
function fixNewParagraph() {
  const r = currentRange();
  const b = r && closestBlock(r.startContainer);
  if (!b) return;
  if (/^(H[1-6])$/.test(b.nodeName) || b.classList.contains('doc-subtitle') || (b.nodeName === 'BLOCKQUOTE')) {
    if (!b.textContent.replace(/​/g, '').trim()) {
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      b.replaceWith(p);
      const nr = document.createRange(); nr.setStart(p, 0); nr.collapse(true); selectRange(nr);
    }
  }
  // no arrastrar comentarios ni vínculos al párrafo nuevo
  const p = closestBlock(currentRange()?.startContainer);
  if (p && !p.textContent.replace(/​/g, '')) {
    p.querySelectorAll('span.comment, a').forEach(x => x.replaceWith(...x.childNodes));
    p.removeAttribute('id');
  }
}

function normalizeIfNeeded() {
  const d = docEl();
  if (!d.firstElementChild || Array.from(d.childNodes).some(n => n.nodeType === 3 && n.data.trim())) {
    const off = getSelOffsets();
    normalizeDoc();
    setSelOffsets(off);
  }
}

function bindGlobalEvents() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (UI.popupEl) { UI.closePopup(); return; }
      if ($('#modal-root').children.length) return;
      if (Backstage.isOpen()) { Backstage.close(); return; }
      if (Painter.fmt) { Painter.stop(); return; }
      if (Dictation.active) { Dictation.stop(); return; }
      if (UI.view !== 'print') { UI.setView('print'); return; }
      if (!$('#find-panel').hidden) { Find.close(); return; }
    }
    if ($('#modal-root').children.length) return;
    const inField = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.nodeName || '') && document.activeElement.id !== 'doc';
    if (inField) {
      if (!(e.ctrlKey || e.metaKey) && !/^F\d+$/.test(e.key)) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && /^[ACVXZY]$/i.test(e.key)) return; // portapapeles y deshacer del propio campo
    }
    if (Backstage.isOpen() && !/^(Ctrl\+(G|S|P|O|A|U|N|W))$/.test(comboFromEvent(e))) return;
    handleShortcut(e);
  }, true);

  // Ctrl + rueda = zoom
  $('#scroller').addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    UI.setZoom(UI.zoom + (e.deltaY < 0 ? 10 : -10));
  }, { passive: false });

  // arrastrar archivos para abrir
  document.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
  document.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;
    e.preventDefault();
    if (Images.readFiles(files)) { focusDoc(); return; }
    const doc = files.find(f => /\.(wit|docx|html?|txt|md)$/i.test(f.name));
    const p = doc && api.pathForFile(doc);
    if (p) Files.openPath(p);
  });

  // clic en el lienzo fuera del documento -> enfocar documento
  $('#canvas').addEventListener('mousedown', (e) => {
    if (e.target.id === 'canvas' || e.target.id === 'scroller') {
      e.preventDefault();
      focusDoc();
      // al final del texto, sin entrar en las notas al final
      const blocks = Array.from(docEl().children).filter(n => !n.matches('.footnotes, .page-break, .column-break'));
      const last = blocks[blocks.length - 1] || docEl();
      const r = document.createRange();
      r.selectNodeContents(last.matches('table, ul, ol, .toc') ? docEl() : last);
      r.collapse(false);
      selectRange(r);
    }
  });

  api.on('app:save-and-close', () => Files.saveAndClose());
  api.on('app:command', (id) => run(id));
  api.on('settings:changed', (s) => { Settings = s; UI.applyTheme(); UI.updateTitle(); applySpellcheck(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => UI.applyTheme());
}

init().catch(err => {
  console.error(err);
  document.body.append(el('div', { class: 'fatal', text: 'Error al iniciar Write It: ' + err.message }));
  if (new URLSearchParams(location.search).get('selftest')) api.selftest.done({ failed: 1, error: String(err.stack || err) });
});
