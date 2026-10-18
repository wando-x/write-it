// Núcleo del editor: selección, historial, formato y paginación
'use strict';

const docEl = () => document.getElementById('doc');
let lastRange = null;

// ---------- selección ----------
function inDoc(node) {
  const d = docEl();
  return !!node && (node === d || d.contains(node));
}

function currentRange() {
  const sel = window.getSelection();
  if (sel.rangeCount && inDoc(sel.getRangeAt(0).commonAncestorContainer)) return sel.getRangeAt(0);
  return null;
}

document.addEventListener('selectionchange', () => {
  const r = currentRange();
  if (r) lastRange = r.cloneRange();
});

function focusDoc() {
  const d = docEl();
  const sel = window.getSelection();
  if (currentRange() && document.activeElement === d) return currentRange();
  d.focus({ preventScroll: true });
  if (lastRange && inDoc(lastRange.startContainer) && document.contains(lastRange.startContainer)) {
    sel.removeAllRanges();
    sel.addRange(lastRange);
  } else if (!currentRange()) {
    const r = document.createRange();
    r.selectNodeContents(d.firstElementChild || d);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }
  return currentRange();
}

function selectRange(r) {
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
  lastRange = r.cloneRange();
}

// desplazamientos de texto (para restaurar la selección tras deshacer)
function textOffset(node, offset) {
  const r = document.createRange();
  r.setStart(docEl(), 0);
  try { r.setEnd(node, offset); } catch { return 0; }
  return r.toString().length;
}
function getSelOffsets() {
  const r = currentRange() || lastRange;
  if (!r || !inDoc(r.startContainer)) return null;
  return { start: textOffset(r.startContainer, r.startOffset), end: textOffset(r.endContainer, r.endOffset) };
}
function pointAt(offset) {
  const walker = document.createTreeWalker(docEl(), NodeFilter.SHOW_TEXT);
  let n, acc = 0, last = null;
  while ((n = walker.nextNode())) {
    const len = n.data.length;
    if (acc + len >= offset) return { node: n, offset: offset - acc };
    acc += len; last = n;
  }
  if (last) return { node: last, offset: last.data.length };
  return { node: docEl(), offset: 0 };
}
function setSelOffsets(o) {
  if (!o) return;
  const a = pointAt(o.start), b = pointAt(o.end);
  const r = document.createRange();
  try { r.setStart(a.node, a.offset); r.setEnd(b.node, b.offset); selectRange(r); } catch { /* ignorar */ }
}

// bloques (párrafos) tocados por la selección
const BLOCK_SEL = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,td,th';
function selectedBlocks() {
  const r = currentRange() || lastRange;
  if (!r) return [];
  const d = docEl();
  const out = [];
  const startBlock = closestBlock(r.startContainer);
  for (const b of d.querySelectorAll(BLOCK_SEL)) {
    if (b.querySelector('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,table')) continue; // solo hojas
    if (r.intersectsNode(b)) out.push(b);
  }
  if (!out.length && startBlock) out.push(startBlock);
  return out;
}
function closestBlock(node) {
  let n = node && node.nodeType === 3 ? node.parentNode : node;
  while (n && n !== docEl()) {
    if (n.matches && n.matches(BLOCK_SEL)) return n;
    n = n.parentNode;
  }
  return null;
}
function closestIn(node, sel) {
  let n = node && node.nodeType === 3 ? node.parentNode : node;
  if (!n || !n.closest) return null;
  const f = n.closest(sel);
  return f && inDoc(f) && f !== docEl() ? f : null;
}

// Garantiza que el texto suelto quede envuelto en párrafos
function normalizeDoc() {
  const d = docEl();
  if (!d.firstChild || (d.childNodes.length === 1 && d.firstChild.nodeName === 'BR')) {
    d.innerHTML = '<p><br></p>';
    return;
  }
  let p = null;
  for (const n of Array.from(d.childNodes)) {
    const inline = n.nodeType === 3 ? n.data.trim() !== '' || p : (n.nodeType === 1 && /^(SPAN|B|I|U|S|A|STRONG|EM|FONT|SUB|SUP|MARK|CODE|IMG|BR)$/.test(n.nodeName));
    if (inline) {
      if (!p) { p = document.createElement('p'); d.insertBefore(p, n); }
      p.appendChild(n);
    } else {
      if (n.nodeType === 3 && !n.data.trim()) n.remove();
      p = null;
    }
  }
}

// ---------- historial propio (deshacer / rehacer) ----------
const History = {
  stack: [], idx: -1, pending: false, max: 80,
  reset() {
    this.stack = [{ html: docEl().innerHTML, sel: null }];
    this.idx = 0; this.pending = false;
  },
  record() {
    this.pending = false;
    typingSnap.cancel();
    const html = docEl().innerHTML;
    if (this.stack[this.idx] && this.stack[this.idx].html === html) { this.stack[this.idx].sel = getSelOffsets(); return; }
    this.stack = this.stack.slice(0, this.idx + 1);
    this.stack.push({ html, sel: getSelOffsets() });
    // límite de pasos y de memoria (los documentos con imágenes pesan mucho)
    let bytes = this.stack.reduce((a, e) => a + e.html.length, 0);
    while (this.stack.length > 2 && (this.stack.length > this.max || bytes > 80e6)) bytes -= this.stack.shift().html.length;
    this.idx = this.stack.length - 1;
    UI.updateUndo();
  },
  flush() { if (this.pending) this.record(); },
  apply(entry) {
    docEl().innerHTML = entry.html;
    setSelOffsets(entry.sel);
    afterContentChange(true);
  },
  undo() {
    this.flush();
    if (this.idx <= 0) return;
    this.idx--;
    this.apply(this.stack[this.idx]);
    UI.updateUndo();
  },
  redo() {
    if (this.idx >= this.stack.length - 1) return;
    this.idx++;
    this.apply(this.stack[this.idx]);
    UI.updateUndo();
  },
  canUndo() { return this.idx > 0 || this.pending; },
  canRedo() { return this.idx < this.stack.length - 1; },
};
const typingSnap = debounce(() => History.record(), 650);

// Ejecuta una modificación del documento con historial y estado sucio
function edit(fn) {
  focusDoc();
  History.flush();
  const res = fn();
  normalizeDoc();
  History.record();
  afterContentChange(true);
  return res;
}

function exec(cmd, value = null, css = false) {
  document.execCommand('styleWithCSS', false, css);
  return document.execCommand(cmd, false, value);
}

// ---------- formato de caracteres ----------
const MARK_FONT = '__fw_mark__';

// Aplica estilos CSS en línea a la selección (o al punto de escritura)
function applyInlineStyle(styles, { clearInner = [] } = {}) {
  const r = currentRange();
  if (!r) return [];
  if (r.collapsed) {
    const span = document.createElement('span');
    Object.assign(span.style, styles);
    span.textContent = '​';
    r.insertNode(span);
    const nr = document.createRange();
    nr.setStart(span.firstChild, 1);
    nr.collapse(true);
    selectRange(nr);
    return [span];
  }
  exec('fontName', MARK_FONT, false);
  const spans = [];
  for (const f of docEl().querySelectorAll(`font[face="${MARK_FONT}"]`)) {
    const span = document.createElement('span');
    Object.assign(span.style, styles);
    while (f.firstChild) span.appendChild(f.firstChild);
    f.replaceWith(span);
    for (const prop of clearInner) {
      for (const inner of span.querySelectorAll('[style]')) {
        inner.style[prop] = '';
        if (!inner.getAttribute('style')) inner.removeAttribute('style');
      }
      if (prop === 'fontFamily') span.querySelectorAll('font[face]').forEach(x => x.removeAttribute('face'));
      if (prop === 'fontSize') span.querySelectorAll('font[size]').forEach(x => x.removeAttribute('size'));
    }
    spans.push(span);
  }
  // spans con estilo font-family del marcador (si Chromium usó CSS)
  for (const s of docEl().querySelectorAll('span[style*="__fw_mark__"]')) {
    s.style.fontFamily = styles.fontFamily || '';
    Object.assign(s.style, styles);
    spans.push(s);
  }
  if (spans.length) {
    const nr = document.createRange();
    nr.setStartBefore(spans[0]);
    nr.setEndAfter(spans[spans.length - 1]);
    selectRange(nr);
  }
  return spans;
}

function setFontSize(pt) {
  pt = clamp(parseFloat(pt) || 11, 1, 1638);
  edit(() => applyInlineStyle({ fontSize: pt + 'pt' }, { clearInner: ['fontSize'] }));
}
function setFontFamily(name) {
  edit(() => applyInlineStyle({ fontFamily: /\s/.test(name) ? `"${name}"` : name }, { clearInner: ['fontFamily'] }));
}

const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
function growFont(dir) {
  const cur = currentFormat().size || 11;
  let next;
  if (dir > 0) next = SIZES.find(s => s > cur) || cur + 10;
  else next = [...SIZES].reverse().find(s => s < cur) || Math.max(1, cur - 1);
  setFontSize(next);
}

// Estado del formato en el cursor
function currentFormat() {
  const r = currentRange() || lastRange;
  let node = r ? r.startContainer : null;
  if (r && !r.collapsed && node.nodeType === 1 && node.childNodes[r.startOffset]) node = node.childNodes[r.startOffset];
  if (node && node.nodeType === 3) node = node.parentNode;
  if (!node || !inDoc(node)) node = docEl();
  const cs = getComputedStyle(node);
  const family = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
  const block = closestBlock(node);
  return {
    family,
    size: pxToPt(cs.fontSize),
    color: rgbToHex(cs.color),
    block: block ? block.nodeName.toLowerCase() : 'p',
    blockClass: block ? block.className : '',
    align: block ? getComputedStyle(block).textAlign : 'left',
    node,
    block,
  };
}

function queryState(cmd) {
  try { return document.queryCommandState(cmd); } catch { return false; }
}

// Cambiar mayúsculas / minúsculas recorriendo los nodos de texto seleccionados
function transformSelectedText(fn) {
  const r = currentRange();
  if (!r || r.collapsed) { toast('Selecciona el texto primero'); return; }
  edit(() => {
    const nodes = [];
    const walker = document.createTreeWalker(r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) if (r.intersectsNode(n)) nodes.push(n);
    const full = r.toString();
    const out = fn(full);
    let pos = 0;
    const sc = r.startContainer, so = r.startOffset, ec = r.endContainer, eo = r.endOffset;
    for (const t of nodes) {
      const s = t === sc ? so : 0;
      const e = t === ec ? eo : t.data.length;
      const len = e - s;
      t.data = t.data.slice(0, s) + out.slice(pos, pos + len) + t.data.slice(e);
      pos += len;
    }
    const nr = document.createRange();
    nr.setStart(sc, so); nr.setEnd(ec, eo);
    selectRange(nr);
  });
}

const CASES = {
  upper: s => s.toLocaleUpperCase('es'),
  lower: s => s.toLocaleLowerCase('es'),
  title: s => s.toLocaleLowerCase('es').replace(/(^|[\s(¿¡"'-])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('es')),
  sentence: s => s.toLocaleLowerCase('es').replace(/(^\s*|[.!?]\s+|[¿¡]\s*)(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('es')),
  toggle: s => [...s].map(c => c === c.toLocaleUpperCase('es') ? c.toLocaleLowerCase('es') : c.toLocaleUpperCase('es')).join(''),
};

// ---------- formato de párrafo ----------
function setBlockStyle(styles) {
  edit(() => {
    for (const b of selectedBlocks()) Object.assign(b.style, styles);
  });
}

function setAlign(a) {
  edit(() => {
    for (const b of selectedBlocks()) {
      b.style.textAlign = a === 'left' ? '' : a;
      b.removeAttribute('align');
    }
  });
}

const STYLES = {
  normal: { tag: 'p', cls: '', name: 'Normal' },
  nospacing: { tag: 'p', cls: 'no-spacing', name: 'Sin espaciado' },
  h1: { tag: 'h1', cls: '', name: 'Título 1' },
  h2: { tag: 'h2', cls: '', name: 'Título 2' },
  h3: { tag: 'h3', cls: '', name: 'Título 3' },
  title: { tag: 'h1', cls: 'doc-title', name: 'Título' },
  subtitle: { tag: 'p', cls: 'doc-subtitle', name: 'Subtítulo' },
  quote: { tag: 'blockquote', cls: '', name: 'Cita' },
  intense: { tag: 'blockquote', cls: 'intense', name: 'Cita destacada' },
  code: { tag: 'pre', cls: '', name: 'Código' },
};

function currentStyleId() {
  const f = currentFormat();
  for (const [id, s] of Object.entries(STYLES)) {
    if (s.tag === f.block && (f.blockClass || '') === s.cls) return id;
  }
  return f.block === 'p' ? 'normal' : null;
}

function applyStyle(id) {
  const s = STYLES[id];
  if (!s) return;
  edit(() => {
    const before = selectedBlocks();
    const inList = before.some(b => b.nodeName === 'LI');
    if (inList && s.tag !== 'p') {
      // sacar de la lista primero
      const li = before.find(b => b.nodeName === 'LI');
      exec(li.parentNode.nodeName === 'OL' ? 'insertOrderedList' : 'insertUnorderedList');
    }
    exec('formatBlock', s.tag);
    for (const b of selectedBlocks()) {
      if (b.nodeName.toLowerCase() !== s.tag) continue;
      b.className = s.cls;
      if (!b.className) b.removeAttribute('class');
      if (s.tag !== 'p') b.removeAttribute('style');
    }
  });
}

function toggleList(type, styleType) {
  edit(() => {
    const r = currentRange();
    const curList = r && closestIn(r.startContainer, 'ul,ol');
    const want = type === 'ol' ? 'OL' : 'UL';
    if (curList && curList.nodeName === want && styleType !== undefined) {
      curList.style.listStyleType = styleType || '';
      return;
    }
    exec(type === 'ol' ? 'insertOrderedList' : 'insertUnorderedList');
    const nr = currentRange();
    const list = nr && closestIn(nr.startContainer, 'ul,ol');
    if (list && styleType) list.style.listStyleType = styleType;
  });
}

// ---------- inserciones ----------
function insertHTML(html) {
  edit(() => exec('insertHTML', html));
}

function insertBlockAfterCaret(node) {
  const r = currentRange() || focusDoc();
  let block = r ? closestBlock(r.startContainer) : null;
  while (block && block.parentNode !== docEl()) block = block.parentNode;
  if (block && block.parentNode === docEl()) block.after(node);
  else docEl().appendChild(node);
  let next = node.nextElementSibling;
  if (!next) { next = el('p', { html: '<br>' }); node.after(next); }
  const nr = document.createRange();
  nr.selectNodeContents(next);
  nr.collapse(true);
  selectRange(nr);
  return node;
}

function insertPageBreak() {
  edit(() => {
    const r = currentRange();
    if (r && !r.collapsed) r.deleteContents();
    splitBlockAtCaret();
    const br = el('div', { class: 'page-break', contenteditable: 'false' });
    insertBlockAfterCaretBefore(br);
  });
}

function insertColumnBreak() {
  edit(() => {
    splitBlockAtCaret();
    insertBlockAfterCaretBefore(el('div', { class: 'column-break', contenteditable: 'false' }));
  });
}

// Divide el bloque superior en el cursor; deja el cursor al inicio de la segunda mitad
function splitBlockAtCaret() {
  const r = currentRange();
  if (!r) return;
  let top = closestBlock(r.startContainer);
  while (top && top.parentNode !== docEl()) top = top.parentNode;
  if (!top || /^(UL|OL|TABLE|DIV)$/.test(top.nodeName)) return;
  const after = document.createRange();
  after.setStart(r.startContainer, r.startOffset);
  after.setEndAfter(top.lastChild || top);
  const frag = after.extractContents();
  const second = top.cloneNode(false);
  second.append(frag);
  // limpiar el elemento clonado vacío que deja extractContents
  const firstChild = second.firstElementChild;
  if (firstChild && firstChild.nodeName === top.nodeName && second.childNodes.length === 1) {
    second.innerHTML = firstChild.innerHTML;
  }
  if (!second.textContent.trim() && !second.querySelector('img')) second.innerHTML = '<br>';
  if (!top.textContent.trim() && !top.querySelector('img')) top.innerHTML = '<br>';
  top.after(second);
  const nr = document.createRange();
  nr.selectNodeContents(second);
  nr.collapse(true);
  selectRange(nr);
}

function insertBlockAfterCaretBefore(node) {
  const r = currentRange();
  let block = r ? closestBlock(r.startContainer) : null;
  while (block && block.parentNode !== docEl()) block = block.parentNode;
  if (block) block.before(node);
  else docEl().appendChild(node);
}

// ---------- paginación visual ----------
const Layout = {
  boundaries: [], pages: 1, contentH: 0,
};

function pageDims() {
  const p = Doc.page;
  const w = p.orientation === 'landscape' ? p.height : p.width;
  const h = p.orientation === 'landscape' ? p.width : p.height;
  return { w, h, m: p.margins };
}

function computePages() {
  const d = docEl();
  const { h, m } = pageDims();
  const contentH = (h - m.top - m.bottom) * MM;
  Layout.contentH = contentH;
  const dRect = d.getBoundingClientRect();
  const scale = d.offsetHeight ? dRect.height / d.offsetHeight : 1;
  const boundaries = [];
  let pageStart = 0;
  let afterBreak = false;
  const lineH = parseFloat(getComputedStyle(d).fontSize) * (Doc.lineHeight || 1.15);

  const visit = (node) => {
    if (node.nodeType !== 1) return;
    const cs = getComputedStyle(node);
    if (cs.float !== 'none' || cs.position === 'absolute') return;
    const rect = node.getBoundingClientRect();
    const top = (rect.top - dRect.top) / scale;
    const height = rect.height / scale;
    const bottom = top + height;
    if (node.classList.contains('page-break')) {
      boundaries.push({ y: top, forced: true });
      afterBreak = true;
      return;
    }
    if (afterBreak) { pageStart = top; afterBreak = false; }
    if (bottom <= pageStart + contentH + 0.5) return;
    if (/^(UL|OL|TABLE|TBODY|THEAD|BLOCKQUOTE|DIV)$/.test(node.nodeName) && node.children.length && !node.classList.contains('toc')) {
      for (const c of node.children) visit(c);
      return;
    }
    if (node.nodeName === 'TR' || node.querySelector('img') || /^H[1-6]$/.test(node.nodeName) || height < lineH * 1.6) {
      // indivisible: pasa entero a la página siguiente
      while (bottom > pageStart + contentH + 0.5) {
        const y = top > pageStart + 1 ? top : pageStart + contentH;
        boundaries.push({ y });
        pageStart = y;
      }
      return;
    }
    const lh = parseFloat(cs.lineHeight) || lineH;
    while (bottom > pageStart + contentH + 0.5) {
      let y = top + Math.floor((pageStart + contentH - top) / lh) * lh;
      if (y <= pageStart + 1) y = pageStart + contentH;
      boundaries.push({ y });
      pageStart = y;
    }
  };
  for (const c of d.children) visit(c);
  Layout.boundaries = boundaries;
  Layout.pages = boundaries.length + 1;
  Layout.scale = scale;
}

function renderPages() {
  computePages();
  const d = docEl();
  const layer = $('#page-layer');
  const off = d.offsetTop;
  const { w, h } = pageDims();
  const contentH = Layout.contentH;
  const minH = Math.max(Layout.pages * contentH, (Layout.boundaries.at(-1)?.y || 0) + contentH);
  d.style.minHeight = minH + 'px';
  layer.innerHTML = '';
  Layout.boundaries.forEach((b, i) => {
    layer.append(el('div', { class: 'page-gap', style: { top: (off + b.y) + 'px' } }, [
      el('span', { class: 'pg-label', text: `${i + 2}` }),
    ]));
  });
  if (Doc.watermark) {
    const starts = [0, ...Layout.boundaries.map(b => b.y)];
    const size = Math.round(Math.min(w, h) * 0.55 / Math.max(4, Doc.watermark.length) * 2.2);
    starts.forEach(y => {
      layer.append(el('div', { class: 'wm', text: Doc.watermark, style: { top: (off + y) + 'px', height: contentH + 'px', fontSize: size + 'mm' } }));
    });
  }
  UI.updateStatus();
}

function caretPage() {
  const r = currentRange() || lastRange;
  if (!r || !Layout.boundaries.length) return 1;
  const d = docEl();
  const rects = r.getClientRects();
  const rr = rects.length ? rects[0] : (r.startContainer.nodeType === 1 ? r.startContainer.getBoundingClientRect() : r.startContainer.parentNode.getBoundingClientRect());
  const y = (rr.top - d.getBoundingClientRect().top) / (Layout.scale || 1);
  let p = 1;
  for (const b of Layout.boundaries) if (y >= b.y - 1) p++;
  return Math.min(p, Layout.pages);
}

function pageOfNode(node) {
  const d = docEl();
  const y = (node.getBoundingClientRect().top - d.getBoundingClientRect().top) / (Layout.scale || 1);
  let p = 1;
  for (const b of Layout.boundaries) if (y >= b.y - 1) p++;
  return p;
}

const scheduleLayout = debounce(() => { renderPages(); Features.refreshPanes(); }, 120);

function afterContentChange(dirty) {
  if (dirty) Files.markDirty();
  scheduleLayout();
  UI.updateState();
}
