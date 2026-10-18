// Documento: estado, configuración de página, abrir, guardar, autoguardado y recuperación
'use strict';

const PAGE_SIZES = {
  A4: { name: 'A4', width: 210, height: 297, desc: '21 cm × 29,7 cm' },
  Carta: { name: 'Carta', width: 215.9, height: 279.4, desc: '21,59 cm × 27,94 cm' },
  Oficio: { name: 'Oficio', width: 215.9, height: 330.2, desc: '21,59 cm × 33,02 cm' },
  Legal: { name: 'Legal', width: 215.9, height: 355.6, desc: '21,59 cm × 35,56 cm' },
  A5: { name: 'A5', width: 148, height: 210, desc: '14,8 cm × 21 cm' },
  A3: { name: 'A3', width: 297, height: 420, desc: '29,7 cm × 42 cm' },
};

const MARGINS = {
  normal: { name: 'Normal', top: 25, bottom: 25, left: 30, right: 30 },
  narrow: { name: 'Estrecho', top: 12.7, bottom: 12.7, left: 12.7, right: 12.7 },
  moderate: { name: 'Moderado', top: 25.4, bottom: 25.4, left: 19.1, right: 19.1 },
  wide: { name: 'Ancho', top: 25.4, bottom: 25.4, left: 50.8, right: 50.8 },
  apa: { name: 'APA / 2,54 cm', top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
  office: { name: 'Office 2003', top: 25.4, bottom: 25.4, left: 31.8, right: 31.8 },
};

const Doc = {
  docId: uid('doc'),
  path: null,
  name: 'Documento1',
  format: 'wit',
  dirty: false,
  page: { size: 'A4', width: 210, height: 297, orientation: 'portrait', margins: { ...MARGINS.normal }, marginsPreset: 'normal' },
  fontFamily: 'Calibri',
  fontSize: 11,
  lineHeight: 1.15,
  headingFont: 'Calibri Light',
  watermark: '',
  pageColor: '',
  columns: 1,
  pageNumbers: null, // { where: 'header'|'footer', align: 'left'|'center'|'right', format: 'n'|'page'|'pageOf' }
  meta: { title: '', author: '', subject: '', keywords: '', created: null },
};

const fontCss = (name) => `"${String(name).replace(/"/g, '')}"`;
const fmtCm = (mm) => (Math.round(mm / 10 * 100) / 100).toString().replace('.', ',') + ' cm';

function setPageSize(key) {
  const s = PAGE_SIZES[key];
  if (!s) return;
  Object.assign(Doc.page, { size: key, width: s.width, height: s.height });
  docChanged();
}
function setOrientation(o) { Doc.page.orientation = o; docChanged(); }
function setMargins(key, custom) {
  const m = custom || MARGINS[key];
  if (!m) return;
  Doc.page.margins = { top: m.top, right: m.right, bottom: m.bottom, left: m.left };
  Doc.page.marginsPreset = custom ? 'custom' : key;
  docChanged();
}
function setColumns(n) { Doc.columns = n; docChanged(); }

// Algo de la configuración del documento cambió: aplicar y marcar como modificado
function docChanged() {
  applyDoc();
  Files.markDirty();
  UI.updateState();
}

// Aplica la configuración del documento a la hoja y a la impresión
function applyDoc() {
  const sheet = $('#sheet');
  const { w, h, m } = pageDims();
  const s = sheet.style;
  s.setProperty('--page-w', w + 'mm');
  s.setProperty('--page-h', h + 'mm');
  s.setProperty('--m-top', m.top + 'mm');
  s.setProperty('--m-right', m.right + 'mm');
  s.setProperty('--m-bottom', m.bottom + 'mm');
  s.setProperty('--m-left', m.left + 'mm');
  s.setProperty('--doc-font', fontCss(Doc.fontFamily));
  s.setProperty('--doc-size', Doc.fontSize + 'pt');
  s.setProperty('--doc-lh', Doc.lineHeight);
  s.setProperty('--heading-font', fontCss(Doc.headingFont || Doc.fontFamily));
  document.documentElement.style.setProperty('--page-color', Doc.pageColor || '#fff');
  s.setProperty('--page-color', Doc.pageColor || '#fff');
  const d = docEl();
  d.classList.toggle('cols-2', Doc.columns === 2);
  d.classList.toggle('cols-3', Doc.columns === 3);

  for (const id of ['doc-header', 'doc-footer']) {
    const node = document.getElementById(id);
    node.removeAttribute('data-pn');
    node.removeAttribute('data-pn-align');
  }
  const pn = Doc.pageNumbers;
  if (pn) {
    const node = document.getElementById(pn.where === 'header' ? 'doc-header' : 'doc-footer');
    node.dataset.pn = pn.format === 'pageOf' ? `Página 1 de ${Layout.pages || 1}` : pn.format === 'page' ? 'Página 1' : '1';
    node.dataset.pnAlign = pn.align;
  }
  $('#page-style').textContent = pageCss();
  $('#print-watermark').textContent = Doc.watermark || '';
  $('#print-watermark').style.fontSize = Math.round(Math.min(w, h) * 0.55 / Math.max(4, (Doc.watermark || '').length) * 2.2) + 'mm';
  UI.renderRuler();
  scheduleLayout();
}

// Reglas @page: tamaño, márgenes, encabezado, pie y números de página en el PDF / impresión
function pageCss() {
  const { w, h, m } = pageDims();
  const rows = { top: { left: [], center: [], right: [] }, bottom: { left: [], center: [], right: [] } };
  const header = $('#doc-header').innerText.replace(/\n+$/, '');
  const footer = $('#doc-footer').innerText.replace(/\n+$/, '');
  if (header.trim()) rows.top.left.push(cssString(header));
  if (footer.trim()) rows.bottom.left.push(cssString(footer));
  const pn = Doc.pageNumbers;
  if (pn) {
    const c = pn.format === 'pageOf' ? '"Página " counter(page) " de " counter(pages)'
      : pn.format === 'page' ? '"Página " counter(page)' : 'counter(page)';
    rows[pn.where === 'header' ? 'top' : 'bottom'][pn.align].push(c);
  }
  const font = `${fontCss(Doc.fontFamily)}, Calibri, sans-serif`;
  let boxes = '';
  for (const [row, cols] of Object.entries(rows)) {
    for (const [col, parts] of Object.entries(cols)) {
      if (!parts.length) continue;
      boxes += `@${row}-${col} { content: ${parts.join(' "     " ')}; font-family: ${font}; font-size: 9pt; color: #555; white-space: pre; text-align: ${col}; vertical-align: middle; }\n`;
    }
  }
  return `@page { size: ${w}mm ${h}mm; margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; background: ${Doc.pageColor || '#ffffff'};\n${boxes}}`;
}

// ---------- plantillas ----------
const TEMPLATES = {
  blank: { name: 'Documento en blanco', html: () => '<p><br></p>' },
  letter: {
    name: 'Carta formal',
    html: () => `<p style="text-align: right">${escapeHtml(formatDate(new Date(), 'long'))}</p><p><br></p>
<p class="no-spacing"><b>Nombre del destinatario</b></p><p class="no-spacing">Cargo</p><p class="no-spacing">Empresa</p><p>Dirección</p><p><br></p>
<p>Estimado/a señor/a:</p>
<p style="text-align: justify">Escribe aquí el primer párrafo de tu carta. Explica de forma breve el motivo por el que escribes.</p>
<p style="text-align: justify">En el segundo párrafo puedes dar más detalles, argumentos o información que respalde tu solicitud.</p>
<p style="text-align: justify">Agradezco de antemano su atención y quedo a la espera de su respuesta.</p><p><br></p>
<p>Atentamente,</p><p><br></p><p><br></p><p class="no-spacing"><b>${escapeHtml(Settings.author)}</b></p><p class="no-spacing">Teléfono · Correo electrónico</p>`,
  },
  cv: {
    name: 'Currículum',
    setup: () => { Doc.page.margins = { ...MARGINS.moderate }; Doc.page.marginsPreset = 'moderate'; },
    html: () => `<h1 class="doc-title">${escapeHtml(Settings.author)}</h1>
<p class="doc-subtitle">Profesión o puesto al que aspiras</p>
<p class="no-spacing">Ciudad, País · +00 000 000 000 · correo@ejemplo.com</p><hr>
<h2>Perfil profesional</h2><p style="text-align: justify">Describe en dos o tres líneas quién eres, qué sabes hacer y qué te diferencia.</p>
<h2>Experiencia</h2><p class="no-spacing"><b>Puesto</b> — Empresa</p><p class="no-spacing"><i>Mes 2023 – Actualidad</i></p>
<ul><li>Logro o responsabilidad principal.</li><li>Otro logro medible.</li></ul>
<p class="no-spacing"><b>Puesto anterior</b> — Empresa</p><p class="no-spacing"><i>Mes 2020 – Mes 2023</i></p>
<ul><li>Logro o responsabilidad principal.</li></ul>
<h2>Formación</h2><p class="no-spacing"><b>Título obtenido</b> — Institución</p><p><i>2016 – 2020</i></p>
<h2>Habilidades</h2><ul><li>Microsoft Office (Word, Excel, PowerPoint)</li><li>Idiomas: español (nativo), inglés</li><li>Trabajo en equipo y comunicación</li></ul>`,
  },
  report: {
    name: 'Informe',
    html: () => `<div class="cover"><div class="cover-band"></div><h1 class="doc-title">Título del informe</h1>
<p class="doc-subtitle">Subtítulo o descripción breve</p><p><br></p><p class="no-spacing"><b>${escapeHtml(Settings.author)}</b></p>
<p class="no-spacing">${escapeHtml(formatDate(new Date(), 'long'))}</p></div><div class="page-break" contenteditable="false"></div>
<h1>Introducción</h1><p style="text-align: justify">Presenta el tema del informe, su propósito y el alcance.</p>
<h1>Desarrollo</h1><h2>Primer apartado</h2><p style="text-align: justify">Escribe aquí el contenido. Usa los estilos Título 1, Título 2 y Título 3 de la pestaña Inicio para que aparezcan en el panel de navegación y en la tabla de contenido.</p>
<h2>Segundo apartado</h2><p style="text-align: justify">Continúa el desarrollo del informe.</p>
<h1>Conclusiones</h1><p style="text-align: justify">Resume los hallazgos más importantes.</p>`,
  },
  essay: {
    name: 'Trabajo académico (APA)',
    setup: () => {
      Doc.page.margins = { ...MARGINS.apa }; Doc.page.marginsPreset = 'apa';
      Doc.fontFamily = 'Times New Roman'; Doc.headingFont = 'Times New Roman'; Doc.fontSize = 12; Doc.lineHeight = 2;
      Doc.pageNumbers = { where: 'header', align: 'right', format: 'n' };
    },
    html: () => `<p style="text-align: center"><br></p><p style="text-align: center"><br></p>
<p style="text-align: center"><b>Título del trabajo</b></p><p style="text-align: center"><br></p>
<p style="text-align: center">${escapeHtml(Settings.author)}</p><p style="text-align: center">Nombre de la institución</p>
<p style="text-align: center">Nombre del curso</p><p style="text-align: center">Nombre del profesor</p>
<p style="text-align: center">${escapeHtml(formatDate(new Date(), 'long'))}</p><div class="page-break" contenteditable="false"></div>
<p style="text-align: center"><b>Título del trabajo</b></p>
<p style="text-indent: 1.27cm">Comienza aquí la introducción. En formato APA el texto va a doble espacio, con sangría de primera línea de 1,27 cm y letra Times New Roman de 12 puntos.</p>
<p style="text-align: center"><b>Método</b></p><p style="text-indent: 1.27cm">Desarrolla el contenido del trabajo.</p>
<div class="page-break" contenteditable="false"></div><p style="text-align: center"><b>Referencias</b></p>
<p style="margin-left: 1.27cm; text-indent: -1.27cm">Apellido, A. A. (Año). <i>Título del libro</i>. Editorial.</p>`,
  },
  notes: {
    name: 'Apuntes de clase',
    html: () => `<h1 class="doc-title">Apuntes: tema</h1><p class="doc-subtitle">${escapeHtml(formatDate(new Date(), 'full').replace(/^./, c => c.toUpperCase()))}</p>
<h2>Ideas principales</h2><ul><li>Idea 1</li><li>Idea 2</li><li>Idea 3</li></ul>
<h2>Definiciones</h2><table class="t-blue"><tbody><tr><td>Concepto</td><td>Definición</td></tr><tr><td>Término</td><td>Explicación</td></tr><tr><td><br></td><td><br></td></tr></tbody></table>
<h2>Dudas para preguntar</h2><ol><li><br></li></ol><h2>Resumen</h2><p><br></p>`,
  },
};

// ---------- archivos ----------
const Files = {
  autosaveOn: true,

  markDirty() {
    if (!Doc.dirty) { Doc.dirty = true; this.pushState(); }
    recoverySoon();
    autosaveSoon();
  },
  markClean() {
    Doc.dirty = false;
    this.pushState();
    autosaveSoon.cancel();
  },
  pushState() {
    api.docState({ dirty: Doc.dirty, name: Doc.name, docId: Doc.docId });
    UI.updateTitle();
  },

  // Restablece el documento vacío con la configuración predeterminada
  resetDoc() {
    const size = PAGE_SIZES[Settings.pageSize] ? Settings.pageSize : 'A4';
    const mk = MARGINS[Settings.margins] ? Settings.margins : 'normal';
    Object.assign(Doc, {
      docId: uid('doc'), path: null, name: 'Documento1', format: 'wit', dirty: false,
      page: { size, width: PAGE_SIZES[size].width, height: PAGE_SIZES[size].height, orientation: 'portrait', margins: { ...MARGINS[mk] }, marginsPreset: mk },
      fontFamily: Settings.fontFamily || 'Calibri',
      fontSize: Settings.fontSize || 11,
      lineHeight: Settings.lineHeight || 1.15,
      headingFont: Settings.fontFamily === 'Calibri' || !Settings.fontFamily ? 'Calibri Light' : Settings.fontFamily,
      watermark: '', pageColor: '', columns: 1, pageNumbers: null,
      meta: { title: '', author: Settings.author, subject: '', keywords: '', created: new Date().toISOString() },
    });
    $('#doc-header').textContent = '';
    $('#doc-footer').textContent = '';
  },

  applyTemplate(key) {
    const t = TEMPLATES[key] || TEMPLATES.blank;
    this.resetDoc();
    if (t.setup) t.setup();
    docEl().innerHTML = t.html();
    normalizeDoc();
    applyDoc();
    History.reset();
    this.markClean();
    Features.afterLoad();
  },

  isPristine() {
    return !Doc.path && !Doc.dirty && !docEl().innerText.trim() && !docEl().querySelector('img,table');
  },

  newDoc(template) {
    if (this.isPristine()) { this.applyTemplate(template || 'blank'); focusDoc(); return; }
    api.newWindow({ template: template || 'blank' });
  },

  async openDialog() {
    const p = await api.openDialog();
    if (p) await this.openPath(p);
  },

  async openPath(p, { replace = false } = {}) {
    if (!replace && !this.isPristine()) { api.newWindow({ file: p }); return; }
    UI.setMsg('Abriendo…');
    const res = await api.readFile(p);
    UI.setMsg('');
    if (res.error) { await UI.alert(res.error, 'No se pudo abrir'); return; }
    this.load(res);
    if (res.warnings) toast(`Documento de Word abierto. Algunos elementos avanzados pueden verse distintos (${res.warnings} avisos).`, 4500);
  },

  load(res) {
    this.resetDoc();
    const d = res.doc || {};
    if (res.format === 'wit') {
      if (d.page) Doc.page = { ...Doc.page, ...d.page, margins: { ...Doc.page.margins, ...(d.page.margins || {}) } };
      for (const k of ['fontFamily', 'fontSize', 'lineHeight', 'headingFont', 'watermark', 'pageColor', 'columns', 'pageNumbers']) {
        if (d[k] !== undefined) Doc[k] = d[k];
      }
      if (d.meta) Doc.meta = { ...Doc.meta, ...d.meta };
      $('#doc-header').textContent = d.header || '';
      $('#doc-footer').textContent = d.footer || '';
    }
    docEl().innerHTML = sanitizeHtml(d.html || '<p><br></p>');
    normalizeDoc();
    Doc.path = res.path;
    Doc.name = res.name;
    Doc.format = res.format;
    applyDoc();
    History.reset();
    this.markClean();
    Features.afterLoad();
    focusDoc();
    const r = document.createRange();
    r.selectNodeContents(docEl().firstElementChild || docEl());
    r.collapse(true);
    selectRange(r);
    $('#scroller').scrollTop = 0;
  },

  // Datos para guardar / exportar
  payload() {
    const html = cleanDocHtml();
    const meta = { ...Doc.meta, author: Doc.meta.author || Settings.author };
    if (!meta.title) meta.title = Doc.path ? Doc.name.replace(/\.[^.]+$/, '') : suggestTitle();
    const header = $('#doc-header').innerText.replace(/\n+$/, '');
    const footer = $('#doc-footer').innerText.replace(/\n+$/, '');
    return {
      html, header, footer,
      page: Doc.page, pageNumbers: Doc.pageNumbers, watermark: Doc.watermark, pageColor: Doc.pageColor,
      columns: Doc.columns, fontFamily: Doc.fontFamily, fontSize: Doc.fontSize, lineHeight: Doc.lineHeight,
      headingFont: Doc.headingFont, meta,
      exportHtml: exportHtmlForWord(),
      headerHtml: header ? header.split('\n').map(l => `<p>${escapeHtml(l) || '&nbsp;'}</p>`).join('') : '',
      footerHtml: footer ? footer.split('\n').map(l => `<p>${escapeHtml(l) || '&nbsp;'}</p>`).join('') : '',
      standaloneHtml: standaloneHtml(html, meta.title),
      text: docEl().innerText,
    };
  },

  // Guardar. Devuelve true si se guardó.
  async save({ saveAs = false, preferExt } = {}) {
    let ext = preferExt;
    let filePath = Doc.path;
    if (!saveAs && filePath && !['wit', 'docx', 'html', 'htm', 'txt'].includes(Doc.format)) {
      saveAs = true; ext = 'wit'; // .md u otros: guardar como documento propio
    }
    if (!ext && saveAs) ext = ['docx', 'html', 'txt'].includes(Doc.format) ? Doc.format : 'wit';
    Features.clearFind();
    UI.setMsg('Guardando…');
    const res = await api.saveFile({ filePath, payload: this.payload(), saveAs: saveAs || !filePath, preferExt: ext });
    UI.setMsg('');
    if (res.canceled) return false;
    if (res.error) { await UI.alert(res.error, 'No se pudo guardar'); return false; }
    if (res.format === 'pdf') { toast('PDF guardado: ' + res.name); return false; }
    Doc.path = res.path;
    Doc.name = res.name;
    Doc.format = res.format;
    if (!Doc.meta.title) Doc.meta.title = res.name.replace(/\.[^.]+$/, '');
    this.markClean();
    api.recoveryRemove(Doc.docId);
    UI.flashSaved();
    if (res.format === 'docx' && !this.warnedDocx) {
      this.warnedDocx = true;
      toast('Guardado en formato Word (.docx). Los comentarios y algunos estilos especiales solo se conservan en el formato .wit.', 5000);
    }
    return true;
  },

  async exportPdf() {
    Features.clearFind();
    Images.deselect();
    UI.setMsg('Creando PDF…');
    const res = await api.exportPdf({ suggestedName: Doc.path ? Doc.name : suggestTitle(), open: true });
    UI.setMsg('');
    if (res.error) UI.alert(res.error);
    else if (!res.canceled) toast('PDF exportado correctamente');
  },

  async print() {
    Features.clearFind();
    Images.deselect();
    await api.print();
  },

  close() { api.closeNow ? window.close() : null; },

  async saveAndClose() {
    if (await this.save()) api.closeNow();
  },
};

function suggestTitle() {
  const first = (docEl().innerText || '').split('\n').map(s => s.trim()).find(Boolean) || '';
  return first.replace(/[\\/:*?"<>|]/g, '').slice(0, 48).trim() || Doc.name.replace(/\.[^.]+$/, '');
}

// HTML del documento limpio (sin marcas de selección de la interfaz)
function cleanDocHtml() {
  const clone = docEl().cloneNode(true);
  clone.querySelectorAll('.selected, .cell-selected, .comment.active').forEach(n => n.classList.remove('selected', 'cell-selected', 'active'));
  clone.querySelectorAll('[class=""]').forEach(n => n.removeAttribute('class'));
  return clone.innerHTML.replace(/​/g, '');
}

// HTML adaptado para Word: estilos en línea y elementos que html-to-docx entiende
function exportHtmlForWord() {
  const live = docEl();
  const clone = live.cloneNode(true);
  // estilos de tabla calculados -> en línea
  const liveCells = live.querySelectorAll('td, th');
  clone.querySelectorAll('td, th').forEach((c, i) => {
    const cs = getComputedStyle(liveCells[i]);
    const bg = rgbToHex(cs.backgroundColor);
    if (bg && bg !== '#ffffff') c.style.backgroundColor = bg;
    const col = rgbToHex(cs.color);
    if (col && col !== '#000000') c.style.color = col;
    if (parseInt(cs.fontWeight, 10) >= 600 && !c.querySelector('b,strong')) c.innerHTML = `<b>${c.innerHTML}</b>`;
    const bc = rgbToHex(cs.borderTopColor) || '#000000';
    c.style.border = cs.borderTopStyle === 'none' || cs.borderTopStyle === 'dashed' ? 'none' : `1px solid ${bc}`;
  });
  clone.querySelectorAll('table').forEach(t => { t.style.width = '100%'; t.setAttribute('border', '1'); t.style.borderCollapse = 'collapse'; });
  // imágenes con su tamaño real en pantalla
  const liveImgs = live.querySelectorAll('img');
  clone.querySelectorAll('img').forEach((img, i) => {
    const li = liveImgs[i];
    const w = Math.round(li.offsetWidth || li.naturalWidth || 300);
    const h = Math.round(li.offsetHeight || li.naturalHeight || 200);
    img.setAttribute('width', w); img.setAttribute('height', h);
    img.style.width = w + 'px'; img.style.height = h + 'px';
    img.removeAttribute('class');
  });
  clone.querySelectorAll('.comment').forEach(s => s.replaceWith(...s.childNodes));
  clone.querySelectorAll('.page-break').forEach(b => {
    const n = document.createElement('div');
    n.className = 'page-break';
    n.setAttribute('style', 'page-break-after: always;');
    b.replaceWith(n);
  });
  clone.querySelectorAll('.column-break').forEach(b => b.remove());
  clone.querySelectorAll('.toc').forEach(toc => {
    const frag = document.createDocumentFragment();
    const t = toc.querySelector('.toc-title');
    if (t) frag.append(el('p', { html: `<span style="font-size: 16pt; color: #0f4761">${escapeHtml(t.textContent)}</span>` }));
    toc.querySelectorAll('.toc-row').forEach(r => {
      const lvl = r.classList.contains('toc-l3') ? 2 : r.classList.contains('toc-l2') ? 1 : 0;
      frag.append(el('p', { style: lvl ? { marginLeft: (lvl * 0.5) + 'cm' } : {}, text: `${r.querySelector('.toc-text').textContent} ........ ${r.querySelector('.toc-page').textContent}` }));
    });
    toc.replaceWith(frag);
  });
  clone.querySelectorAll('.cover').forEach(c => { c.querySelector('.cover-band')?.remove(); c.replaceWith(...c.childNodes); });
  clone.querySelectorAll('h1.doc-title').forEach(h => {
    const p = el('p', { html: `<span style="font-size: 28pt">${h.innerHTML}</span>` });
    h.replaceWith(p);
  });
  clone.querySelectorAll('p.doc-subtitle').forEach(p => { p.innerHTML = `<span style="font-size: 14pt; color: #595959">${p.innerHTML}</span>`; p.removeAttribute('class'); });
  clone.querySelectorAll('blockquote').forEach(b => {
    const p = el('p', { style: { textAlign: 'center' }, html: `<i>${b.innerHTML}</i>` });
    b.replaceWith(p);
  });
  clone.querySelectorAll('pre').forEach(pre => {
    const frag = document.createDocumentFragment();
    pre.textContent.split('\n').forEach(line => frag.append(el('p', { html: `<span style="font-family: Consolas; font-size: 10pt">${escapeHtml(line) || '&nbsp;'}</span>` })));
    pre.replaceWith(frag);
  });
  clone.querySelectorAll('.footnote-ref').forEach(s => { const n = document.createElement('sup'); n.textContent = s.textContent; s.replaceWith(n); });
  clone.querySelectorAll('.footnotes').forEach(f => {
    const frag = document.createDocumentFragment();
    frag.append(el('p', { text: '______________________' }));
    f.querySelectorAll('li').forEach((li, i) => frag.append(el('p', { html: `<span style="font-size: 9pt"><sup>${i + 1}</sup> ${li.innerHTML}</span>` })));
    f.replaceWith(frag);
  });
  clone.querySelectorAll('.tab').forEach(t => t.replaceWith(document.createTextNode('        ')));
  clone.querySelectorAll('p:empty, p > br:only-child').forEach(n => {
    const p = n.nodeName === 'P' ? n : n.parentNode;
    p.innerHTML = '&nbsp;';
  });
  clone.querySelectorAll('[contenteditable]').forEach(n => n.removeAttribute('contenteditable'));
  // estilos del documento en el contenedor
  return `<div style="font-family: ${Doc.fontFamily}; font-size: ${Doc.fontSize}pt; line-height: ${Doc.lineHeight}">${clone.innerHTML.replace(/​/g, '')}</div>`;
}

// Página web independiente con los estilos del documento
function standaloneHtml(html, title) {
  const rules = [];
  for (const sheet of document.styleSheets) {
    let list;
    try { list = sheet.cssRules; } catch { continue; }
    for (const r of list) {
      if (r.selectorText && /#doc\b/.test(r.selectorText) && !/show-marks|::highlight|\.selected|cell-selected|\.toc:hover/.test(r.selectorText)) rules.push(r.cssText);
    }
  }
  const { w, m } = pageDims();
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Write It">
<title>${escapeHtml(title || 'Documento')}</title>
<style>
body { margin: 0; background: #f3f3f3; }
#doc { box-sizing: border-box; max-width: ${w}mm; margin: 24px auto; background: ${Doc.pageColor || '#fff'}; padding: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;
  box-shadow: 0 2px 8px rgba(0,0,0,.15); font-family: ${fontCss(Doc.fontFamily)}, Calibri, sans-serif; font-size: ${Doc.fontSize}pt; line-height: ${Doc.lineHeight}; color: #000; }
#doc h1, #doc h2, #doc h3 { font-family: ${fontCss(Doc.headingFont || Doc.fontFamily)}, sans-serif; }
@media print { body { background: none; } #doc { box-shadow: none; margin: 0; padding: 0; max-width: none; } }
${rules.join('\n')}
</style>
</head>
<body>
<main id="doc">
${html}
</main>
</body>
</html>`;
}

// Limpia HTML externo (pegado o abierto) dejando solo formato seguro
const ALLOWED_TAGS = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'SUB', 'SUP', 'SPAN', 'A', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'IMG', 'HR', 'DIV', 'MARK', 'FONT', 'SMALL', 'CAPTION', 'COLGROUP', 'COL']);
const ALLOWED_STYLE = ['font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'color', 'background-color', 'text-align', 'font-size', 'font-family',
  'margin-left', 'text-indent', 'line-height', 'list-style-type', 'width', 'vertical-align'];
const ALLOWED_CLASS = /^(doc-title|doc-subtitle|no-spacing|intense|page-break|column-break|comment|footnote-ref|footnotes|footnotes-list|toc|toc-title|toc-row|toc-l[123]|toc-text|toc-dots|toc-page|cover|cover-band|tab|wrap-left|wrap-right|wrap-center|border|shadow|rounded|t-[a-z]+)$/;

function sanitizeHtml(html, { fromPaste = false } = {}) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const walk = (node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 8) { child.remove(); continue; }
      if (child.nodeType !== 1) continue;
      const tag = child.nodeName;
      if (['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'IFRAME', 'OBJECT', 'EMBED', 'svg', 'SVG', 'NOSCRIPT', 'XML', 'O:P'].includes(tag) || tag.includes(':')) {
        if (tag === 'O:P') child.replaceWith(...child.childNodes); else child.remove();
        continue;
      }
      walk(child);
      if (!ALLOWED_TAGS.has(tag)) { child.replaceWith(...child.childNodes); continue; }
      for (const a of Array.from(child.attributes)) {
        const n = a.name.toLowerCase();
        if (n === 'style') {
          const keep = [];
          for (const prop of ALLOWED_STYLE) {
            const v = child.style.getPropertyValue(prop);
            if (!v || /expression|url\(/i.test(v)) continue;
            if (fromPaste && (prop === 'font-family' || prop === 'line-height' || prop === 'width')) continue;
            if (fromPaste && prop === 'color' && /^(rgb\(0, 0, 0\)|black|windowtext)$/i.test(v)) continue;
            if (fromPaste && prop === 'background-color' && /transparent|rgba\(0, 0, 0, 0\)|white|rgb\(255, 255, 255\)/i.test(v)) continue;
            keep.push(`${prop}: ${v}`);
          }
          if (keep.length) child.setAttribute('style', keep.join('; ')); else child.removeAttribute('style');
        } else if (n === 'class') {
          const cls = a.value.split(/\s+/).filter(c => ALLOWED_CLASS.test(c));
          if (cls.length) child.setAttribute('class', cls.join(' ')); else child.removeAttribute('class');
        } else if (n === 'href' && tag === 'A') {
          if (!/^(https?:|mailto:|#)/i.test(a.value.trim())) child.removeAttribute('href');
        } else if (n === 'src' && tag === 'IMG') {
          if (!/^(data:image\/|https?:|file:)/i.test(a.value.trim())) child.remove();
        } else if (['colspan', 'rowspan', 'alt', 'width', 'height', 'contenteditable', 'id', 'title', 'face', 'size', 'start', 'type'].includes(n) || n.startsWith('data-')) {
          if (n === 'contenteditable' && a.value !== 'false') child.removeAttribute(a.name);
          if (fromPaste && (n === 'id' || n.startsWith('data-'))) child.removeAttribute(a.name);
        } else {
          child.removeAttribute(a.name);
        }
      }
      if (fromPaste && tag === 'SPAN' && !child.attributes.length) child.replaceWith(...child.childNodes);
    }
  };
  walk(tpl.content);
  return tpl.innerHTML;
}

// ---------- autoguardado y recuperación ----------
const autosaveSoon = debounce(async () => {
  if (!Files.autosaveOn || !Settings.autosave || !Doc.dirty || !Doc.path || !['wit', 'docx', 'html', 'htm', 'txt'].includes(Doc.format)) return;
  if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.modal')) return;
  const res = await api.saveFile({ filePath: Doc.path, payload: Files.payload(), saveAs: false });
  if (res && !res.error && !res.canceled) { Files.markClean(); api.recoveryRemove(Doc.docId); UI.flashSaved(true); }
}, 4000);

const recoverySoon = debounce(() => {
  if (!Doc.dirty) return;
  api.recoveryWrite(Doc.docId, {
    name: Doc.name, path: Doc.path, format: Doc.format,
    html: cleanDocHtml(), header: $('#doc-header').innerText, footer: $('#doc-footer').innerText,
    page: Doc.page, fontFamily: Doc.fontFamily, fontSize: Doc.fontSize, lineHeight: Doc.lineHeight, headingFont: Doc.headingFont,
    watermark: Doc.watermark, pageColor: Doc.pageColor, columns: Doc.columns, pageNumbers: Doc.pageNumbers, meta: Doc.meta,
  });
}, 8000);

async function offerRecovery() {
  const list = await api.recoveryList();
  if (!list.length) return;
  const body = el('div', {}, [
    el('p', { text: 'Write It se cerró antes de que guardaras estos documentos. Puedes recuperarlos ahora:' }),
    el('div', { class: 'recover-list' }, list.slice(0, 8).map(r => el('div', { class: 'recover-item' }, [
      el('div', {}, [el('b', { text: r.name || 'Documento' }), el('div', { class: 'muted', text: relativeTime(r.savedAt) + (r.path ? ' · ' + r.path : '') })]),
      el('button', {
        class: 'pbtn primary', text: 'Recuperar', onclick: (e) => {
          const item = e.target.closest('.recover-item');
          const data = { ...r };
          if (Files.isPristine()) {
            Files.load({ path: null, name: r.name || 'Documento recuperado', format: 'wit', doc: { ...data, html: data.html } });
            Doc.path = r.path && r.format === 'wit' ? r.path : null;
            Doc.format = Doc.path ? 'wit' : 'wit';
            Doc.name = r.name || 'Documento recuperado';
            Files.markDirty();
            Files.pushState();
          }
          api.recoveryRemove(r.id);
          item.remove();
          if (!body.querySelector('.recover-item')) UI.closeModal();
        },
      }),
    ]))),
  ]);
  UI.modal({
    title: 'Recuperación de documentos', body, width: 520,
    buttons: [{ label: 'Descartar todos', action: () => { list.forEach(r => api.recoveryRemove(r.id)); } }, { label: 'Cerrar', primary: true }],
  });
}
