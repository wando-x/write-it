// Funciones del documento: tablas, imágenes, vínculos, comentarios, notas, índice, buscar, navegación…
'use strict';

const Features = {
  refreshPanes() {
    if (!$('#navpane').hidden) Nav.render();
    if (!$('#commentpane').hidden) Comments.render();
    if (!$('#find-panel').hidden) Find.search(false);
    Images.reposition();
    applyPageNumberPreview();
  },
  afterLoad() {
    Images.deselect();
    Notes.renumber(true);
    this.refreshPanes();
    UI.updateState();
  },
  clearFind() { Find.clear(); },
};

function applyPageNumberPreview() {
  const pn = Doc.pageNumbers;
  if (!pn || pn.format !== 'pageOf') return;
  const node = document.getElementById(pn.where === 'header' ? 'doc-header' : 'doc-footer');
  node.dataset.pn = `Página 1 de ${Layout.pages || 1}`;
}

// Envuelve cada trozo de texto de la selección con el elemento que devuelve make()
function wrapTextNodes(r, make) {
  const root = r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer;
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) if (n.data.length && r.intersectsNode(n)) nodes.push(n);
  const out = [];
  const sc = r.startContainer, so = r.startOffset, ec = r.endContainer, eo = r.endOffset;
  for (let t of nodes) {
    const s = t === sc ? so : 0;
    const e = t === ec ? eo : t.data.length;
    if (s >= e) continue;
    if (/^(TR|TBODY|THEAD|TABLE|UL|OL)$/.test(t.parentNode.nodeName)) continue;
    if (e < t.data.length) t.splitText(e);
    if (s > 0) t = t.splitText(s);
    const w = make();
    t.replaceWith(w);
    w.appendChild(t);
    out.push(w);
  }
  return out;
}

function unwrap(node) { node.replaceWith(...node.childNodes); }

function scrollToRect(rect, offset = 140) {
  const sc = $('#scroller');
  const sr = sc.getBoundingClientRect();
  if (rect.top < sr.top + 40 || rect.bottom > sr.bottom - 20) sc.scrollTop += rect.top - sr.top - offset;
}

function selectWordAtCaret() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  sel.modify('move', 'backward', 'word');
  sel.modify('extend', 'forward', 'word');
  const r = currentRange();
  if (r && r.toString().trim()) {
    // no incluir el espacio final
    const txt = r.toString();
    const trail = txt.length - txt.trimEnd().length;
    if (trail && r.endContainer.nodeType === 3 && r.endOffset >= trail) r.setEnd(r.endContainer, r.endOffset - trail);
    selectRange(r);
    return r;
  }
  return null;
}

// ---------- tablas ----------
const Tables = {
  insert(rows, cols) {
    rows = clamp(rows | 0, 1, 100); cols = clamp(cols | 0, 1, 30);
    edit(() => {
      const r = currentRange();
      if (r && !r.collapsed) r.deleteContents();
      const t = el('table', {}, [el('tbody', {}, Array.from({ length: rows }, () =>
        el('tr', {}, Array.from({ length: cols }, () => el('td', { html: '<br>' })))))]);
      let top = r ? closestBlock(r.startContainer) : null;
      while (top && top.parentNode !== docEl()) top = top.parentNode;
      const emptyTop = top && top.nodeName === 'P' && !top.textContent.trim() && !top.querySelector('img');
      insertBlockAfterCaret(t);
      if (emptyTop && t.previousElementSibling === top) top.remove();
      const nr = document.createRange();
      nr.setStart(t.querySelector('td'), 0);
      nr.collapse(true);
      selectRange(nr);
    });
  },
  cell() {
    const r = currentRange() || lastRange;
    return r ? closestIn(r.startContainer, 'td,th') : null;
  },
  table() { const c = this.cell(); return c ? c.closest('table') : null; },
  selectedCells() {
    const r = currentRange() || lastRange;
    const t = this.table();
    if (!r || !t) return [];
    const cells = Array.from(t.querySelectorAll('td,th')).filter(c => r.intersectsNode(c));
    return cells.length ? cells : [this.cell()];
  },
  caretIn(cell) {
    const nr = document.createRange();
    nr.selectNodeContents(cell);
    nr.collapse(true);
    selectRange(nr);
  },
  rowInsert(after) {
    const c = this.cell(); if (!c) return;
    edit(() => {
      const tr = c.parentNode;
      const n = tr.cloneNode(true);
      n.querySelectorAll('td,th').forEach(x => { x.innerHTML = '<br>'; x.classList.remove('cell-selected'); x.removeAttribute('rowspan'); });
      if (after) tr.after(n); else tr.before(n);
      this.caretIn(n.cells[Math.min(c.cellIndex, n.cells.length - 1)]);
    });
  },
  colInsert(after) {
    const c = this.cell(); if (!c) return;
    edit(() => {
      const idx = c.cellIndex;
      const t = c.closest('table');
      for (const tr of t.rows) {
        const ref = tr.cells[Math.min(idx, tr.cells.length - 1)];
        if (!ref) continue;
        const nc = document.createElement(ref.nodeName);
        nc.innerHTML = '<br>';
        if (ref.style.backgroundColor) nc.style.backgroundColor = ref.style.backgroundColor;
        if (after) ref.after(nc); else ref.before(nc);
      }
      this.caretIn(c.parentNode.cells[after ? idx + 1 : idx]);
    });
  },
  rowDelete() {
    const c = this.cell(); if (!c) return;
    const t = c.closest('table');
    const rows = new Set(this.selectedCells().map(x => x.parentNode));
    if (rows.size >= t.rows.length) return this.tableDelete();
    edit(() => {
      const next = [...rows].at(-1).nextElementSibling || [...rows][0].previousElementSibling;
      rows.forEach(r => r.remove());
      if (next) this.caretIn(next.cells[0]);
    });
  },
  colDelete() {
    const c = this.cell(); if (!c) return;
    const t = c.closest('table');
    const idx = c.cellIndex;
    if (t.rows[0].cells.length <= 1) return this.tableDelete();
    edit(() => {
      for (const tr of Array.from(t.rows)) if (tr.cells[idx]) tr.cells[idx].remove();
      const tr = t.rows[0];
      this.caretIn(tr.cells[Math.max(0, idx - 1)]);
    });
  },
  tableDelete() {
    const t = this.table(); if (!t) return;
    edit(() => {
      const p = el('p', { html: '<br>' });
      t.replaceWith(p);
      this.caretIn(p);
    });
  },
  merge() {
    const cells = this.selectedCells();
    if (cells.length < 2) { toast('Selecciona dos o más celdas de la misma fila para combinarlas'); return; }
    const row = cells[0].parentNode;
    if (!cells.every(c => c.parentNode === row)) { toast('Por ahora solo se pueden combinar celdas de la misma fila'); return; }
    edit(() => {
      const first = cells[0];
      let span = first.colSpan || 1;
      for (const c of cells.slice(1)) {
        span += c.colSpan || 1;
        const txt = c.innerHTML.replace(/<br>/g, '').trim();
        if (txt) first.innerHTML = first.innerHTML.replace(/<br>$/, '') + ' ' + c.innerHTML;
        c.remove();
      }
      first.colSpan = span;
      this.caretIn(first);
    });
  },
  setStyle(cls) {
    const t = this.table(); if (!t) return;
    edit(() => { t.className = cls || ''; if (!cls) t.removeAttribute('class'); });
  },
  shade(color) {
    const cells = this.selectedCells(); if (!cells.length) return;
    edit(() => cells.forEach(c => { c.style.backgroundColor = color || ''; if (!c.getAttribute('style')) c.removeAttribute('style'); }));
  },
  headerRow() {
    const t = this.table(); if (!t) return;
    edit(() => {
      const tr = t.rows[0];
      const toTh = tr.cells[0].nodeName === 'TD';
      for (const c of Array.from(tr.cells)) {
        const n = document.createElement(toTh ? 'th' : 'td');
        for (const a of c.attributes) n.setAttribute(a.name, a.value);
        n.innerHTML = c.innerHTML;
        c.replaceWith(n);
      }
    });
  },
  distribute() {
    const t = this.table(); if (!t) return;
    edit(() => { t.querySelectorAll('col').forEach(c => c.remove()); for (const tr of t.rows) for (const c of tr.cells) c.style.width = ''; });
  },
  // Tab / Mayús+Tab dentro de una tabla
  tab(back) {
    const c = this.cell(); if (!c) return false;
    const t = c.closest('table');
    const cells = Array.from(t.querySelectorAll('td,th'));
    const i = cells.indexOf(c);
    if (back) { if (i > 0) this.selectCell(cells[i - 1]); return true; }
    if (i < cells.length - 1) { this.selectCell(cells[i + 1]); return true; }
    this.rowInsert(true);
    return true;
  },
  selectCell(cell) {
    const nr = document.createRange();
    nr.selectNodeContents(cell);
    if (!cell.textContent.trim()) nr.collapse(true);
    selectRange(nr);
  },
  dialog() {
    const rows = el('input', { type: 'number', min: 1, max: 100, value: 3 });
    const cols = el('input', { type: 'number', min: 1, max: 30, value: 3 });
    UI.modal({
      title: 'Insertar tabla', width: 340,
      body: el('div', {}, [
        el('div', { class: 'field-row' }, [
          el('div', { class: 'field' }, [el('label', { text: 'Número de columnas' }), cols]),
          el('div', { class: 'field' }, [el('label', { text: 'Número de filas' }), rows]),
        ]),
      ]),
      buttons: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, action: () => this.insert(+rows.value, +cols.value) }],
      onOpen: () => cols.select(),
    });
  },
};

// ---------- imágenes ----------
const Images = {
  selected: null,
  insert(srcs) {
    if (!srcs || !srcs.length) return;
    edit(() => exec('insertHTML', srcs.map(s => `<img src="${s}" alt="">`).join('')));
    // limitar al ancho de la página
    setTimeout(() => docEl().querySelectorAll('img').forEach(img => {
      if (!img.style.width && img.naturalWidth > docEl().clientWidth) img.style.width = docEl().clientWidth + 'px';
    }), 50);
  },
  async pick() {
    const srcs = await api.pickImages();
    if (srcs.length) { focusDoc(); this.insert(srcs); }
  },
  select(img) {
    if (this.selected === img) return;
    this.deselect();
    this.selected = img;
    img.classList.add('selected');
    const r = document.createRange();
    r.selectNode(img);
    selectRange(r);
    this.reposition();
    $('#img-handle').hidden = false;
    UI.updateState();
  },
  deselect() {
    if (!this.selected) return;
    this.selected.classList.remove('selected');
    if (!this.selected.getAttribute('class')) this.selected.removeAttribute('class');
    this.selected = null;
    $('#img-handle').hidden = true;
    UI.updateState();
  },
  reposition() {
    const img = this.selected;
    const h = $('#img-handle');
    if (!img || !document.contains(img)) { if (img) this.deselect(); return; }
    const r = img.getBoundingClientRect();
    Object.assign(h.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  },
  startResize(e) {
    const img = this.selected; if (!img) return;
    e.preventDefault();
    const startX = e.clientX;
    const z = UI.zoom / 100;
    const startW = img.getBoundingClientRect().width / z;
    History.flush();
    const move = (ev) => {
      const w = clamp(startW + (ev.clientX - startX) / z, 16, docEl().clientWidth);
      img.style.width = Math.round(w) + 'px';
      img.style.height = 'auto';
      img.removeAttribute('width'); img.removeAttribute('height');
      this.reposition();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      History.record();
      afterContentChange(true);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  },
  wrap(mode) {
    const img = this.selected; if (!img) return;
    edit(() => {
      img.classList.remove('wrap-left', 'wrap-right', 'wrap-center');
      if (mode && mode !== 'inline') img.classList.add('wrap-' + mode);
    });
    this.reposition();
  },
  toggleClass(cls) {
    const img = this.selected; if (!img) return;
    edit(() => img.classList.toggle(cls));
  },
  resetSize() {
    const img = this.selected; if (!img) return;
    edit(() => { img.style.width = ''; img.style.height = ''; img.removeAttribute('width'); img.removeAttribute('height'); });
    this.reposition();
  },
  setWidthPercent(p) {
    const img = this.selected; if (!img) return;
    edit(() => { img.style.width = Math.round(docEl().clientWidth * p / 100) + 'px'; img.style.height = 'auto'; });
    this.reposition();
  },
  remove() {
    const img = this.selected; if (!img) return;
    this.deselect();
    edit(() => img.remove());
  },
  async altText() {
    const img = this.selected; if (!img) return;
    const v = await UI.prompt('Texto alternativo', 'Describe la imagen para personas con lectores de pantalla:', img.alt || '');
    if (v !== null) edit(() => { img.alt = v; });
  },
  readFiles(files) {
    const imgs = Array.from(files).filter(f => /^image\//.test(f.type));
    if (!imgs.length) return false;
    Promise.all(imgs.map(f => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(f); })))
      .then(srcs => this.insert(srcs));
    return true;
  },
};

// ---------- vínculos ----------
const Links = {
  current() { const r = currentRange() || lastRange; return r ? closestIn(r.startContainer, 'a') : null; },
  dialog() {
    focusDoc();
    const a = this.current();
    const r = currentRange();
    const selText = a ? a.textContent : (r ? r.toString() : '');
    const text = el('input', { type: 'text', value: selText });
    const url = el('input', { type: 'url', value: a ? a.getAttribute('href') : '', placeholder: 'https://' });
    const saved = r ? r.cloneRange() : null;
    UI.modal({
      title: a ? 'Editar vínculo' : 'Insertar vínculo', width: 440,
      body: el('div', {}, [
        el('div', { class: 'field' }, [el('label', { text: 'Texto que se mostrará' }), text]),
        el('div', { class: 'field' }, [el('label', { text: 'Dirección (página web o correo)' }), url]),
      ]),
      buttons: [
        a ? { label: 'Quitar vínculo', action: () => this.unlink() } : null,
        { label: 'Cancelar' },
        {
          label: 'Aceptar', primary: true, action: () => {
            let href = url.value.trim();
            if (!href) return;
            if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(href)) href = 'mailto:' + href;
            else if (!/^(https?:|mailto:)/i.test(href)) href = 'https://' + href;
            const label = text.value.trim() || href.replace(/^mailto:/, '');
            if (saved) selectRange(saved);
            edit(() => {
              if (a && document.contains(a)) { a.href = href; a.textContent = label; return; }
              exec('insertHTML', `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>&#8203;`);
            });
          },
        },
      ],
      onOpen: () => (selText ? url : text).focus(),
    });
  },
  unlink() {
    const a = this.current();
    if (a) edit(() => unwrap(a));
    else edit(() => exec('unlink'));
  },
};

// ---------- comentarios ----------
const Comments = {
  active: null,
  add() {
    focusDoc();
    let r = currentRange();
    if (r && r.collapsed) r = selectWordAtCaret();
    if (!r || r.collapsed) { toast('Selecciona el texto que quieres comentar'); return; }
    const id = uid('c');
    edit(() => wrapTextNodes(r, () => el('span', { class: 'comment', 'data-cid': id, 'data-author': Settings.author, 'data-date': Date.now(), 'data-text': '' })));
    UI.showPane('commentpane', true);
    this.render();
    this.activate(id, true);
  },
  groups() {
    const map = new Map();
    for (const s of docEl().querySelectorAll('span.comment[data-cid]')) {
      const id = s.dataset.cid;
      if (!map.has(id)) map.set(id, { id, spans: [], author: s.dataset.author, date: +s.dataset.date, text: s.dataset.text || '' });
      map.get(id).spans.push(s);
    }
    return [...map.values()];
  },
  render() {
    const list = $('#comment-list');
    const groups = this.groups();
    const focused = document.activeElement && document.activeElement.closest('.comment-card');
    if (focused && list.contains(focused)) return; // no interrumpir mientras se escribe
    list.innerHTML = '';
    if (!groups.length) {
      list.append(el('div', { class: 'nav-empty', html: 'No hay comentarios.<br>Selecciona texto y pulsa <b>Nuevo comentario</b> en la pestaña Revisar.' }));
      return;
    }
    for (const g of groups) {
      const ta = el('textarea', { placeholder: 'Escribe tu comentario…', spellcheck: 'true' });
      ta.value = g.text;
      ta.addEventListener('input', () => { g.spans.forEach(s => { s.dataset.text = ta.value; }); Files.markDirty(); });
      ta.addEventListener('blur', () => History.record());
      const card = el('div', { class: 'comment-card' + (this.active === g.id ? ' active' : ''), 'data-cid': g.id, onclick: () => this.activate(g.id) }, [
        el('div', { class: 'c-head' }, [
          el('div', { class: 'avatar', text: initials(g.author) }),
          el('div', {}, [el('div', { class: 'c-name', text: g.author || 'Autor' }), el('div', { class: 'c-date', text: g.date ? relativeTime(g.date) : '' })]),
        ]),
        el('div', { class: 'c-quote', text: g.spans.map(s => s.textContent).join('') }),
        ta,
        el('div', { class: 'c-actions' }, [
          el('button', { class: 'icon-btn', title: 'Eliminar comentario', html: icon('delete'), onclick: (e) => { e.stopPropagation(); this.remove(g.id); } }),
        ]),
      ]);
      list.append(card);
    }
  },
  activate(id, focus) {
    this.active = id;
    docEl().querySelectorAll('span.comment').forEach(s => s.classList.toggle('active', s.dataset.cid === id));
    $$('#comment-list .comment-card').forEach(c => c.classList.toggle('active', c.dataset.cid === id));
    const card = $(`#comment-list .comment-card[data-cid="${id}"]`);
    if (card) { card.scrollIntoView({ block: 'nearest' }); if (focus) card.querySelector('textarea').focus(); }
    const first = docEl().querySelector(`span.comment[data-cid="${id}"]`);
    if (first) scrollToRect(first.getBoundingClientRect());
  },
  remove(id) {
    id = id || this.currentId();
    if (!id) { toast('Coloca el cursor sobre un comentario'); return; }
    edit(() => docEl().querySelectorAll(`span.comment[data-cid="${id}"]`).forEach(unwrap));
    this.active = null;
    this.render();
  },
  removeAll() {
    if (!docEl().querySelector('span.comment')) return;
    edit(() => docEl().querySelectorAll('span.comment').forEach(unwrap));
    this.render();
  },
  currentId() {
    const r = currentRange() || lastRange;
    const s = r && closestIn(r.startContainer, 'span.comment');
    return (s && s.dataset.cid) || this.active;
  },
  step(dir) {
    const g = this.groups();
    if (!g.length) { toast('No hay comentarios'); return; }
    let i = g.findIndex(x => x.id === this.active);
    i = i < 0 ? (dir > 0 ? 0 : g.length - 1) : (i + dir + g.length) % g.length;
    UI.showPane('commentpane', true);
    this.render();
    this.activate(g[i].id);
  },
};

// ---------- notas al final ----------
const Notes = {
  insert() {
    focusDoc();
    edit(() => {
      const r = currentRange();
      if (!r) return;
      r.collapse(false);
      const id = uid('fn');
      const ref = el('sup', { class: 'footnote-ref', 'data-fn': id, contenteditable: 'false' }, ['0']);
      r.insertNode(ref);
      let box = docEl().querySelector('.footnotes');
      if (!box) {
        box = el('div', { class: 'footnotes' }, [el('ol', { class: 'footnotes-list' })]);
        docEl().appendChild(box);
      }
      const li = el('li', { 'data-fn': id }, [el('br')]);
      box.querySelector('ol').append(li);
      this.renumber();
      const nr = document.createRange();
      nr.selectNodeContents(li);
      nr.collapse(true);
      selectRange(nr);
      setTimeout(() => scrollToRect(li.getBoundingClientRect()), 30);
    });
  },
  renumber(silent) {
    const d = docEl();
    const refs = Array.from(d.querySelectorAll('.footnote-ref[data-fn]'));
    const box = d.querySelector('.footnotes');
    refs.forEach((r, i) => { if (r.textContent !== String(i + 1)) r.textContent = String(i + 1); });
    if (!box) return;
    const stray = Array.from(box.children).filter(c => !c.matches('ol'));
    if (stray.length || box.nextSibling) {
      const off = getSelOffsets();
      box.before(...stray);
      d.appendChild(box);
      setSelOffsets(off);
    }
    const ol = box.querySelector('ol') || box.appendChild(el('ol', { class: 'footnotes-list' }));
    const ids = refs.map(r => r.dataset.fn);
    for (const li of Array.from(ol.children)) if (!ids.includes(li.dataset.fn)) li.remove();
    ids.forEach(id => { const li = ol.querySelector(`li[data-fn="${id}"]`); if (li) ol.append(li); });
    if (!ol.children.length && !silent) box.remove();
  },
  goto(id) {
    const li = docEl().querySelector(`.footnotes li[data-fn="${id}"]`);
    if (!li) return;
    scrollToRect(li.getBoundingClientRect());
    const nr = document.createRange(); nr.selectNodeContents(li); nr.collapse(false); selectRange(nr);
  },
};

// ---------- tabla de contenido ----------
const Toc = {
  headings() {
    return Array.from(docEl().querySelectorAll('h1:not(.doc-title), h2, h3')).filter(h => !h.closest('.toc') && h.textContent.trim());
  },
  build() {
    const toc = el('div', { class: 'toc', contenteditable: 'false' }, [el('div', { class: 'toc-title', text: 'Contenido' })]);
    const hs = this.headings();
    if (!hs.length) toc.append(el('div', { class: 'toc-row', html: '<span class="toc-text"><i>No hay títulos. Aplica los estilos Título 1, 2 o 3 y actualiza la tabla.</i></span>' }));
    for (const h of hs) {
      if (!h.id) h.id = uid('h');
      const lvl = +h.nodeName[1];
      toc.append(el('div', { class: `toc-row toc-l${lvl}`, 'data-target': h.id }, [
        el('span', { class: 'toc-text', text: h.textContent.trim() }),
        el('span', { class: 'toc-dots' }),
        el('span', { class: 'toc-page', text: String(pageOfNode(h)) }),
      ]));
    }
    return toc;
  },
  insert() {
    if (docEl().querySelector('.toc')) { this.update(); return; }
    edit(() => {
      const r = currentRange();
      let top = r ? closestBlock(r.startContainer) : null;
      while (top && top.parentNode !== docEl()) top = top.parentNode;
      const toc = this.build();
      if (top) top.before(toc); else docEl().prepend(toc);
    });
    setTimeout(() => this.update(true), 250);
  },
  update(silent) {
    const tocs = docEl().querySelectorAll('.toc');
    if (!tocs.length) { if (!silent) toast('No hay ninguna tabla de contenido en el documento'); return; }
    renderPages();
    edit(() => tocs.forEach(t => t.replaceWith(this.build())));
    if (!silent) toast('Tabla de contenido actualizada');
  },
  remove() {
    const tocs = docEl().querySelectorAll('.toc');
    if (tocs.length) edit(() => tocs.forEach(t => t.remove()));
  },
  goto(id) {
    const h = document.getElementById(id);
    if (!h || !inDoc(h)) return;
    scrollToRect(h.getBoundingClientRect(), 80);
    const nr = document.createRange(); nr.selectNodeContents(h); nr.collapse(true); selectRange(nr); focusDoc();
  },
};

// ---------- portada, saltos y otros elementos ----------
function insertCover() {
  edit(() => {
    const d = docEl();
    d.querySelector('.cover')?.nextElementSibling?.classList.contains('page-break') && d.querySelector('.cover').nextElementSibling.remove();
    d.querySelector('.cover')?.remove();
    const cover = el('div', { class: 'cover' }, [
      el('div', { class: 'cover-band', contenteditable: 'false' }),
      el('h1', { class: 'doc-title', text: Doc.meta.title || 'Título del documento' }),
      el('p', { class: 'doc-subtitle', text: 'Subtítulo del documento' }),
      el('p', { html: '<br>' }),
      el('p', { class: 'no-spacing' }, [el('b', { text: Doc.meta.author || Settings.author })]),
      el('p', { class: 'no-spacing', text: formatDate(new Date(), 'long') }),
    ]);
    d.prepend(cover, el('div', { class: 'page-break', contenteditable: 'false' }));
    const nr = document.createRange(); nr.selectNodeContents(cover.querySelector('h1')); selectRange(nr);
  });
  $('#scroller').scrollTop = 0;
}

function insertBlankPage() {
  edit(() => {
    splitBlockAtCaret();
    insertBlockAfterCaretBefore(el('div', { class: 'page-break', contenteditable: 'false' }));
    const p = el('p', { html: '<br>' });
    insertBlockAfterCaretBefore(p);
    insertBlockAfterCaretBefore(el('div', { class: 'page-break', contenteditable: 'false' }));
    const nr = document.createRange(); nr.selectNodeContents(p); nr.collapse(true); selectRange(nr);
  });
}

function insertHr() {
  edit(() => {
    const hr = document.createElement('hr');
    insertBlockAfterCaret(hr);
  });
}

function insertText(text) {
  edit(() => exec('insertText', text));
}

const SYMBOLS = ('© ® ™ € £ ¥ $ ¢ ° ± × ÷ ≠ ≈ ≤ ≥ ∞ √ ∑ π µ Ω α β γ δ θ λ σ φ ½ ¼ ¾ ² ³ ¹ ‰ § ¶ † • · … – — « » “ ” ‘ ’ ¿ ¡ ñ Ñ ç ü ← → ↑ ↓ ↔ ⇒ ⇔ ✓ ✔ ✗ ✘ ★ ☆ ♥ ♦ ♣ ♠ ☺ ☎ ✉ ✂ ☐ ☑ ■ □ ▲ △ ● ○ ◆ ◇ ⚠ ♪ ☀ ☁ ☂ ❄ ⌘ ⌛ ⏰ 😀 😊 😂 😍 🤔 👍 👏 🙏 💡 📌 📎 📅 ✅ ❌ ⭐ 🔥 🎉').split(' ');

function dateDialog() {
  const now = new Date();
  const fmts = ['short', 'long', 'full', 'monthYear', 'iso', 'time', 'datetime'];
  let chosen = 'long';
  const list = el('div', { class: 'date-list' }, fmts.map(f => el('button', {
    class: 'menu-item' + (f === chosen ? ' hl' : ''), text: formatDate(now, f), 'data-f': f,
    onclick: (e) => { chosen = f; list.querySelectorAll('.menu-item').forEach(b => b.classList.toggle('hl', b === e.currentTarget)); },
    ondblclick: () => { UI.closeModal(); insertText(formatDate(now, f)); },
  })));
  UI.modal({
    title: 'Fecha y hora', width: 360, body: el('div', {}, [el('div', { class: 'field' }, [el('span', { class: 'label', text: 'Formatos disponibles' }), list])]),
    buttons: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, action: () => insertText(formatDate(now, chosen)) }],
  });
}

// ---------- formato de párrafo (diálogo) ----------
function paragraphDialog() {
  focusDoc();
  const b = selectedBlocks()[0] || docEl().firstElementChild;
  const cs = b ? getComputedStyle(b) : null;
  const toCm = (px) => (Math.round(parseFloat(px || 0) / MM / 10 * 100) / 100);
  const toPt = (px) => Math.round(parseFloat(px || 0) * 0.75);
  const f = currentFormat();
  const num = (v, step = 0.1, min = -20) => el('input', { type: 'number', step, min, value: v });
  const align = el('select', {}, [['left', 'Izquierda'], ['center', 'Centrado'], ['right', 'Derecha'], ['justify', 'Justificado']].map(([v, t]) => el('option', { value: v, text: t })));
  align.value = ['center', 'right', 'justify'].includes(cs?.textAlign) ? cs.textAlign : 'left';
  const left = num(toCm(cs?.marginLeft)), right = num(toCm(cs?.marginRight));
  const ti = parseFloat(cs?.textIndent || 0);
  const special = el('select', {}, [['none', '(ninguna)'], ['first', 'Primera línea'], ['hanging', 'Francesa']].map(([v, t]) => el('option', { value: v, text: t })));
  special.value = ti > 0 ? 'first' : ti < 0 ? 'hanging' : 'none';
  const by = num(Math.abs(toCm(ti)) || 1.27, 0.1, 0);
  const before = num(toPt(cs?.marginTop), 1, 0), after = num(toPt(cs?.marginBottom), 1, 0);
  const lhVal = cs ? (cs.lineHeight === 'normal' ? Doc.lineHeight : Math.round(parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) * 100) / 100) : Doc.lineHeight;
  const lh = el('select', {}, [['1', 'Sencillo'], ['1.15', '1,15'], ['1.5', '1,5 líneas'], ['2', 'Doble'], ['2.5', '2,5'], ['3', 'Triple']].map(([v, t]) => el('option', { value: v, text: t })));
  lh.value = String([1, 1.15, 1.5, 2, 2.5, 3].reduce((a, c) => Math.abs(c - lhVal) < Math.abs(a - lhVal) ? c : a, 1.15));
  const fam = el('input', { type: 'text', value: f.family });
  const size = num(f.size, 0.5, 1);
  UI.modal({
    title: 'Fuente y párrafo', width: 520,
    body: el('div', {}, [
      el('div', { class: 'opt-section', text: 'Fuente' }),
      el('div', { class: 'field-row' }, [
        el('div', { class: 'field' }, [el('label', { text: 'Fuente' }), fam]),
        el('div', { class: 'field', style: { maxWidth: '110px' } }, [el('label', { text: 'Tamaño (pt)' }), size]),
      ]),
      el('div', { class: 'opt-section', text: 'Párrafo' }),
      el('div', { class: 'field-row' }, [
        el('div', { class: 'field' }, [el('label', { text: 'Alineación' }), align]),
        el('div', { class: 'field' }, [el('label', { text: 'Interlineado' }), lh]),
      ]),
      el('div', { class: 'field-row' }, [
        el('div', { class: 'field' }, [el('label', { text: 'Sangría izquierda (cm)' }), left]),
        el('div', { class: 'field' }, [el('label', { text: 'Sangría derecha (cm)' }), right]),
      ]),
      el('div', { class: 'field-row' }, [
        el('div', { class: 'field' }, [el('label', { text: 'Sangría especial' }), special]),
        el('div', { class: 'field' }, [el('label', { text: 'En (cm)' }), by]),
      ]),
      el('div', { class: 'field-row' }, [
        el('div', { class: 'field' }, [el('label', { text: 'Espaciado anterior (pt)' }), before]),
        el('div', { class: 'field' }, [el('label', { text: 'Espaciado posterior (pt)' }), after]),
      ]),
    ]),
    buttons: [{ label: 'Cancelar' }, {
      label: 'Aceptar', primary: true, action: () => {
        const ind = special.value === 'none' ? '' : (special.value === 'first' ? 1 : -1) * Math.abs(+by.value) + 'cm';
        edit(() => {
          for (const blk of selectedBlocks()) {
            Object.assign(blk.style, {
              textAlign: align.value === 'left' ? '' : align.value,
              marginLeft: +left.value ? left.value + 'cm' : '',
              marginRight: +right.value ? right.value + 'cm' : '',
              textIndent: ind,
              marginTop: before.value + 'pt',
              marginBottom: after.value + 'pt',
              lineHeight: lh.value,
            });
          }
        });
        if (fam.value.trim() && fam.value.trim() !== f.family) setFontFamily(fam.value.trim());
        if (+size.value && +size.value !== f.size) setFontSize(+size.value);
      },
    }],
  });
}

function changeIndent(dir) {
  const blocks = selectedBlocks();
  if (blocks.some(b => b.nodeName === 'LI')) { edit(() => exec(dir > 0 ? 'indent' : 'outdent')); return; }
  edit(() => {
    for (const b of blocks) {
      const cur = parseFloat(getComputedStyle(b).marginLeft) / MM / 10 || 0;
      const next = Math.max(0, Math.round((cur + dir * 1.25) / 1.25) * 1.25);
      b.style.marginLeft = next ? next + 'cm' : '';
    }
  });
}

function setSpacing(which, pt) {
  setBlockStyle({ [which === 'before' ? 'marginTop' : 'marginBottom']: pt + 'pt' });
}

// ---------- copiar formato ----------
const Painter = {
  fmt: null,
  sticky: false,
  start(sticky) {
    focusDoc();
    const f = currentFormat();
    const cs = getComputedStyle(f.node);
    this.fmt = {
      fontFamily: cs.fontFamily, fontSize: cs.fontSize, color: cs.color,
      fontWeight: cs.fontWeight, fontStyle: cs.fontStyle,
      textDecoration: cs.textDecorationLine === 'none' ? 'none' : cs.textDecorationLine,
      backgroundColor: findBackground(f.node),
    };
    this.sticky = !!sticky;
    docEl().classList.add('painting');
    toast(sticky ? 'Copiar formato activo: selecciona texto (Esc para terminar)' : 'Selecciona el texto al que quieres aplicar el formato');
    UI.updateState();
  },
  apply() {
    if (!this.fmt) return;
    const r = currentRange();
    if (!r || r.collapsed) return;
    const fmt = this.fmt;
    edit(() => {
      const spans = applyInlineStyle({}, { clearInner: ['fontFamily', 'fontSize', 'color', 'fontWeight', 'fontStyle', 'textDecoration', 'backgroundColor'] });
      for (const s of spans) {
        s.querySelectorAll('b,strong,i,em,u,s,strike').forEach(unwrap);
        Object.assign(s.style, fmt);
      }
    });
    if (!this.sticky) this.stop();
  },
  stop() { this.fmt = null; docEl().classList.remove('painting'); UI.updateState(); },
};

function findBackground(node) {
  let n = node;
  while (n && n !== docEl()) {
    const bg = getComputedStyle(n).backgroundColor;
    if (bg && bg !== 'transparent' && !/rgba\(0, 0, 0, 0\)/.test(bg)) return bg;
    n = n.parentNode;
  }
  return 'transparent';
}

function clearFormatting() {
  edit(() => {
    const r = currentRange();
    exec('removeFormat');
    if (r) {
      const root = r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer;
      const scope = root === docEl() || inDoc(root) ? root : docEl();
      scope.querySelectorAll('span[style], font').forEach(s => { if (r.intersectsNode(s)) unwrap(s); });
      for (const b of selectedBlocks()) {
        if (/^(H[1-6]|BLOCKQUOTE|PRE)$/.test(b.nodeName)) {
          const p = el('p'); p.innerHTML = b.innerHTML; b.replaceWith(p);
        } else { b.removeAttribute('style'); b.removeAttribute('class'); }
      }
    }
  });
}

// ---------- buscar y reemplazar ----------
const Find = {
  matches: [], idx: -1, built: false,
  build() {
    if (this.built) return;
    this.built = true;
    const p = $('#find-panel');
    p.append(
      el('div', { class: 'find-row' }, [
        el('input', { type: 'text', id: 'find-input', placeholder: 'Buscar en el documento', spellcheck: 'false' }),
        el('span', { class: 'find-count', id: 'find-count' }),
        el('button', { class: 'icon-btn', title: 'Anterior (Mayús+Intro)', html: icon('chevronUp'), onclick: () => this.step(-1) }),
        el('button', { class: 'icon-btn', title: 'Siguiente (Intro)', html: icon('chevronDown'), onclick: () => this.step(1) }),
        el('button', { class: 'icon-btn', title: 'Cerrar (Esc)', html: icon('close'), onclick: () => this.close() }),
      ]),
      el('div', { class: 'find-row', id: 'replace-row' }, [
        el('input', { type: 'text', id: 'replace-input', placeholder: 'Reemplazar con', spellcheck: 'false' }),
        el('button', { class: 'pbtn', text: 'Reemplazar', onclick: () => this.replace() }),
        el('button', { class: 'pbtn', text: 'Todos', title: 'Reemplazar todos', onclick: () => this.replaceAll() }),
      ]),
      el('div', { class: 'find-opts' }, [
        el('label', {}, [el('input', { type: 'checkbox', id: 'find-case' }), 'Mayúsculas y minúsculas']),
        el('label', {}, [el('input', { type: 'checkbox', id: 'find-word' }), 'Palabras completas']),
      ]),
    );
    $('#find-input').addEventListener('input', () => this.search(true));
    $('#find-case').addEventListener('change', () => this.search(true));
    $('#find-word').addEventListener('change', () => this.search(true));
    p.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      if (e.key === 'Enter' && e.target.id === 'find-input') { e.preventDefault(); this.step(e.shiftKey ? -1 : 1); }
      if (e.key === 'Enter' && e.target.id === 'replace-input') { e.preventDefault(); this.replace(); }
    });
  },
  open(replace) {
    this.build();
    const p = $('#find-panel');
    p.hidden = false;
    $('#replace-row').hidden = !replace;
    const r = currentRange() || lastRange;
    const sel = r ? r.toString() : '';
    const input = $('#find-input');
    if (sel && sel.length < 80 && !sel.includes('\n')) input.value = sel;
    input.focus(); input.select();
    this.search(true);
  },
  close() {
    $('#find-panel').hidden = true;
    const m = this.matches[this.idx];
    this.clear();
    if (m) { lastRange = m.cloneRange(); }
    focusDoc();
  },
  clear() {
    if (window.CSS && CSS.highlights) { CSS.highlights.delete('find-all'); CSS.highlights.delete('find-current'); }
  },
  // Devuelve rangos que coinciden con el término
  rangesFor(term, { matchCase = false, whole = false } = {}) {
    if (!term) return [];
    const nodes = [];
    let text = '';
    const walker = document.createTreeWalker(docEl(), NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) { nodes.push({ node: n, start: text.length }); text += n.data; }
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(whole ? `(?<![\\p{L}\\p{N}_])${esc}(?![\\p{L}\\p{N}_])` : esc, 'gu' + (matchCase ? '' : 'i'));
    const out = [];
    let m;
    let ni = 0;
    while ((m = re.exec(text))) {
      if (!m[0].length) { re.lastIndex++; continue; }
      const s = m.index, e = s + m[0].length;
      while (ni < nodes.length - 1 && nodes[ni + 1].start <= s) ni++;
      let ei = ni;
      while (ei < nodes.length - 1 && nodes[ei + 1].start < e) ei++;
      const r = document.createRange();
      r.setStart(nodes[ni].node, s - nodes[ni].start);
      r.setEnd(nodes[ei].node, e - nodes[ei].start);
      out.push(r);
      if (out.length > 5000) break;
    }
    return out;
  },
  opts() { return { matchCase: $('#find-case')?.checked, whole: $('#find-word')?.checked }; },
  search(reset) {
    if (!this.built) return;
    const term = $('#find-input').value;
    this.matches = this.rangesFor(term, this.opts());
    if (reset || this.idx >= this.matches.length) {
      // primera coincidencia después del cursor
      const r = lastRange;
      this.idx = this.matches.length ? 0 : -1;
      if (r && this.matches.length) {
        const i = this.matches.findIndex(m => m.compareBoundaryPoints(Range.START_TO_START, r) >= 0);
        this.idx = i >= 0 ? i : 0;
      }
    }
    this.paint(reset);
  },
  paint(scroll) {
    const count = $('#find-count');
    const term = $('#find-input').value;
    count.textContent = !term ? '' : this.matches.length ? `${this.idx + 1} de ${this.matches.length}` : 'Sin resultados';
    if (!window.CSS || !CSS.highlights) return;
    this.clear();
    if (!this.matches.length) return;
    CSS.highlights.set('find-all', new Highlight(...this.matches));
    const cur = this.matches[this.idx];
    if (cur) {
      CSS.highlights.set('find-current', new Highlight(cur));
      if (scroll) scrollToRect(cur.getBoundingClientRect());
    }
  },
  step(dir) {
    if (!this.matches.length) { this.search(true); if (!this.matches.length) return; }
    this.idx = (this.idx + dir + this.matches.length) % this.matches.length;
    lastRange = this.matches[this.idx].cloneRange();
    this.paint(true);
  },
  replace() {
    const m = this.matches[this.idx];
    if (!m) { this.search(true); return; }
    const rep = $('#replace-input').value;
    lastRange = m.cloneRange();
    edit(() => { selectRange(m); exec('insertText', rep); });
    const keep = this.idx;
    this.search(false);
    this.idx = Math.min(keep, this.matches.length - 1);
    this.paint(true);
    $('#replace-input').focus();
  },
  replaceAll(term, rep, opts) {
    term = term ?? $('#find-input').value;
    rep = rep ?? $('#replace-input').value;
    const ms = this.rangesFor(term, opts || this.opts());
    if (!ms.length) { toast('No se encontró el texto'); return 0; }
    edit(() => {
      for (let i = ms.length - 1; i >= 0; i--) {
        const r = ms[i];
        r.deleteContents();
        if (rep) r.insertNode(document.createTextNode(rep));
      }
      docEl().normalize();
    });
    if (this.built) this.search(true);
    toast(`Se realizaron ${ms.length} reemplazos`);
    if (this.built && !$('#find-panel').hidden) $('#replace-input').focus();
    return ms.length;
  },
};

// ---------- panel de navegación ----------
const Nav = {
  tab: 'headings',
  render() {
    const list = $('#nav-list');
    list.innerHTML = '';
    const term = $('#nav-search').value.trim();
    if (term && this.tab !== 'results') this.setTab('results', true);
    if (this.tab === 'results') {
      if (!term) { list.append(el('div', { class: 'nav-empty', text: 'Escribe arriba para buscar texto en el documento.' })); return; }
      const ms = Find.rangesFor(term);
      if (!ms.length) { list.append(el('div', { class: 'nav-empty', text: 'No se encontraron resultados.' })); return; }
      list.append(el('div', { class: 'menu-head', text: `${ms.length} resultado${ms.length === 1 ? '' : 's'}` }));
      ms.slice(0, 200).forEach(m => {
        const block = closestBlock(m.startContainer) || docEl();
        const full = block.textContent;
        const pre = document.createRange();
        pre.setStart(block, 0);
        try { pre.setEnd(m.startContainer, m.startOffset); } catch { /* */ }
        const at = pre.toString().length;
        const s = Math.max(0, at - 40);
        const snippet = (s ? '…' : '') + escapeHtml(full.slice(s, at)) + '<b>' + escapeHtml(m.toString()) + '</b>' + escapeHtml(full.slice(at + m.toString().length, at + m.toString().length + 60)) + '…';
        list.append(el('div', {
          class: 'nav-result', html: snippet, onclick: () => {
            scrollToRect(m.getBoundingClientRect());
            if (CSS.highlights) { CSS.highlights.set('find-current', new Highlight(m)); }
            lastRange = m.cloneRange(); focusDoc();
          },
        }));
      });
      return;
    }
    const hs = Array.from(docEl().querySelectorAll('h1, h2, h3')).filter(h => h.textContent.trim() && !h.closest('.toc'));
    if (!hs.length) {
      list.append(el('div', { class: 'nav-empty', html: 'Crea una estructura navegable aplicando los estilos <b>Título 1</b>, <b>Título 2</b> o <b>Título 3</b> desde la pestaña Inicio.' }));
      return;
    }
    const cur = closestBlock((currentRange() || lastRange)?.startContainer);
    let current = null;
    for (const h of hs) if (cur && (h === cur || (h.compareDocumentPosition(cur) & Node.DOCUMENT_POSITION_FOLLOWING))) current = h;
    for (const h of hs) {
      const cls = h.classList.contains('doc-title') ? 'title' : 'l' + h.nodeName[1];
      list.append(el('div', {
        class: `nav-item ${cls}${h === current ? ' current' : ''}`, text: h.textContent.trim(), title: h.textContent.trim(),
        onclick: () => {
          scrollToRect(h.getBoundingClientRect(), 60);
          const nr = document.createRange(); nr.selectNodeContents(h); nr.collapse(true); selectRange(nr); focusDoc();
          this.render();
        },
      }));
    }
  },
  setTab(t, noRender) {
    this.tab = t;
    $$('#navpane [data-navtab]').forEach(b => b.classList.toggle('active', b.dataset.navtab === t));
    if (!noRender) this.render();
  },
};

// ---------- estadísticas ----------
function countWords(text) {
  const m = text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
}

function docStats() {
  const text = docEl().innerText || '';
  const paras = Array.from(docEl().querySelectorAll(BLOCK_SEL)).filter(b => !b.querySelector(BLOCK_SEL) && b.textContent.trim()).length;
  const lineH = parseFloat(getComputedStyle(docEl()).fontSize) * Doc.lineHeight;
  return {
    pages: Layout.pages || 1,
    words: countWords(text),
    chars: text.replace(/\n/g, '').length,
    charsNoSpace: text.replace(/\s/g, '').length,
    paragraphs: paras,
    lines: Math.max(1, Math.round(docEl().scrollHeight / lineH)),
  };
}

function wordCountDialog() {
  const s = docStats();
  const r = currentRange() || lastRange;
  const selWords = r && !r.collapsed ? countWords(r.toString()) : null;
  const fmt = (n) => n.toLocaleString('es');
  const rows = [['Páginas', s.pages], ['Palabras', s.words], ['Caracteres (sin espacios)', s.charsNoSpace], ['Caracteres (con espacios)', s.chars], ['Párrafos', s.paragraphs], ['Líneas (aprox.)', s.lines]];
  if (selWords !== null) rows.splice(2, 0, ['Palabras seleccionadas', selWords]);
  const minutes = Math.max(1, Math.round(s.words / 200));
  UI.modal({
    title: 'Contar palabras', width: 360,
    body: el('div', {}, [
      el('table', { class: 'stats-table' }, rows.map(([k, v]) => el('tr', {}, [el('td', { text: k }), el('td', { text: fmt(v) })]))),
      el('p', { class: 'muted', style: { marginTop: '12px' }, text: `Tiempo de lectura estimado: ${minutes} min · Tiempo para leerlo en voz alta: ${Math.max(1, Math.round(s.words / 130))} min` }),
    ]),
    buttons: [{ label: 'Cerrar', primary: true }],
  });
}

// ---------- leer en voz alta ----------
const Speech = {
  speaking: false,
  toggle() {
    const synth = window.speechSynthesis;
    if (!synth) { toast('La lectura en voz alta no está disponible'); return; }
    if (this.speaking || synth.speaking) { synth.cancel(); this.speaking = false; UI.updateState(); return; }
    const r = currentRange() || lastRange;
    let text = r && !r.collapsed ? r.toString() : '';
    if (!text) {
      if (r) { const rest = document.createRange(); rest.setStart(r.startContainer, r.startOffset); rest.setEndAfter(docEl().lastChild || docEl()); text = rest.toString(); }
      if (!text.trim()) text = docEl().innerText;
    }
    if (!text.trim()) { toast('No hay texto para leer'); return; }
    const u = new SpeechSynthesisUtterance(text.slice(0, 30000));
    const voices = synth.getVoices();
    const lang = (Settings.spellLanguages && Settings.spellLanguages[0]) || 'es-ES';
    u.voice = voices.find(v => v.lang === lang) || voices.find(v => v.lang.startsWith(lang.slice(0, 2))) || null;
    u.lang = u.voice ? u.voice.lang : lang;
    u.rate = 1;
    u.onend = u.onerror = () => { this.speaking = false; UI.updateState(); };
    this.speaking = true;
    synth.speak(u);
    UI.updateState();
    toast('Leyendo en voz alta… (pulsa de nuevo para detener)');
  },
};

// ---------- autoformato al escribir ----------
function autoFormatOnSpace() {
  const r = currentRange();
  if (!r || !r.collapsed) return false;
  const b = closestBlock(r.startContainer);
  if (!b || b.nodeName !== 'P') return false;
  const before = document.createRange();
  before.setStart(b, 0);
  before.setEnd(r.startContainer, r.startOffset);
  const t = before.toString().replace(/ /g, ' ');
  let type = null;
  if (/^[-*•] $/.test(t)) type = 'ul';
  else if (/^1[.)] $/.test(t)) type = 'ol';
  else if (/^a[.)] $/.test(t)) type = 'ola';
  if (!type) return false;
  History.flush();
  before.deleteContents();
  if (!b.textContent) b.innerHTML = '<br>';
  const nr = document.createRange(); nr.selectNodeContents(b); nr.collapse(true); selectRange(nr);
  toggleList(type === 'ul' ? 'ul' : 'ol', type === 'ola' ? 'lower-alpha' : undefined);
  return true;
}

// Correcciones automáticas sencillas al escribir (como Autocorrección de Word)
const AUTOCORRECT = { '(c)': '©', '(r)': '®', '(tm)': '™', '-->': '→', '<--': '←', '=>': '⇒', '...': '…' };
function autoCorrect() {
  const r = currentRange();
  if (!r || !r.collapsed || r.startContainer.nodeType !== 3) return;
  const t = r.startContainer;
  const s = t.data.slice(0, r.startOffset);
  for (const [k, v] of Object.entries(AUTOCORRECT)) {
    if (s.endsWith(k)) {
      const rr = document.createRange();
      rr.setStart(t, r.startOffset - k.length);
      rr.setEnd(t, r.startOffset);
      selectRange(rr);
      exec('insertText', v);
      return;
    }
  }
  // " -- " -> raya
  if (/\s--\s$/.test(s)) {
    const rr = document.createRange();
    rr.setStart(t, r.startOffset - 3); rr.setEnd(t, r.startOffset - 1);
    selectRange(rr); exec('insertText', '—');
    const nr = document.createRange(); nr.setStart(t, Math.min(t.data.length, r.startOffset - 1)); nr.collapse(true); selectRange(nr);
  }
}

// ---------- regla ----------
const Ruler = {
  render() {
    const ruler = $('#ruler');
    if (!ruler) return;
    const z = UI.zoom / 100;
    const { w, m } = pageDims();
    const px = (mm) => mm * MM * z;
    ruler.innerHTML = '';
    ruler.style.width = px(w) + 'px';
    ruler.append(el('div', { class: 'margin-l', style: { left: 0, width: px(m.left) + 'px' } }));
    ruler.append(el('div', { class: 'margin-r', style: { right: 0, width: px(m.right) + 'px' } }));
    const textW = w - m.left - m.right;
    for (let mm = -Math.floor(m.left / 2.5) * 2.5; mm <= textW + m.right; mm += 2.5) {
      const x = px(m.left + mm);
      if (x < 0 || x > px(w)) continue;
      const isCm = Math.abs(mm % 10) < 0.01;
      const isHalf = Math.abs(mm % 5) < 0.01;
      if (isCm && mm !== 0) ruler.append(el('span', { class: 'num', style: { left: x + 'px' }, text: String(Math.abs(Math.round(mm / 10))) }));
      else ruler.append(el('span', { class: 'tick', style: { left: x + 'px', height: (isHalf ? 6 : 3) + 'px', bottom: '6px' } }));
    }
    this.first = el('span', { class: 'indent first', title: 'Sangría de primera línea' });
    this.left = el('span', { class: 'indent', title: 'Sangría izquierda' });
    ruler.append(this.first, this.left);
    this.first.addEventListener('mousedown', (e) => this.drag(e, 'first'));
    this.left.addEventListener('mousedown', (e) => this.drag(e, 'left'));
    this.update();
  },
  update() {
    if (!this.first) return;
    const z = UI.zoom / 100;
    const { m } = pageDims();
    const b = closestBlock((currentRange() || lastRange)?.startContainer);
    const cs = b ? getComputedStyle(b) : null;
    const ml = cs ? parseFloat(cs.marginLeft) || 0 : 0;
    const ti = cs ? parseFloat(cs.textIndent) || 0 : 0;
    const base = m.left * MM * z;
    this.left.style.left = (base + ml * z) + 'px';
    this.first.style.left = (base + (ml + ti) * z) + 'px';
  },
  drag(e, which) {
    e.preventDefault();
    const blocks = selectedBlocks();
    if (!blocks.length) return;
    const z = UI.zoom / 100;
    const startX = e.clientX;
    const cs = getComputedStyle(blocks[0]);
    const ml0 = parseFloat(cs.marginLeft) || 0, ti0 = parseFloat(cs.textIndent) || 0;
    History.flush();
    const snap = (px) => Math.round(px / (MM * 2.5)) * MM * 2.5; // pasos de 0,25 cm
    const move = (ev) => {
      const dx = (ev.clientX - startX) / z;
      for (const b of blocks) {
        if (which === 'first') b.style.textIndent = snap(ti0 + dx) ? (snap(ti0 + dx) / MM / 10).toFixed(2) + 'cm' : '';
        else {
          const ml = Math.max(0, snap(ml0 + dx));
          b.style.marginLeft = ml ? (ml / MM / 10).toFixed(2) + 'cm' : '';
          b.style.textIndent = ti0 ? (ti0 / MM / 10).toFixed(2) + 'cm' : '';
        }
      }
      this.update();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      History.record(); afterContentChange(true);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  },
};
