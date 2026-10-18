// Interfaz: pestañas, cinta de opciones, menús, diálogos, barra de estado y vistas
'use strict';

const FALLBACK_FONTS = ['Aptos', 'Arial', 'Book Antiqua', 'Calibri', 'Calibri Light', 'Cambria', 'Candara', 'Century Gothic', 'Comic Sans MS', 'Consolas',
  'Constantia', 'Corbel', 'Courier New', 'Franklin Gothic Medium', 'Garamond', 'Georgia', 'Impact', 'Lucida Sans Unicode', 'Palatino Linotype',
  'Segoe Print', 'Segoe Script', 'Segoe UI', 'Sitka Text', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'];

const THEME_COLORS = ['#ffffff', '#000000', '#e8e8e8', '#44546a', '#156082', '#e97132', '#196b24', '#0f9ed5', '#a02b93', '#4ea72e'];
const STD_COLORS = ['#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0'];
const HIGHLIGHTS = ['#ffff00', '#00ff00', '#00ffff', '#ff00ff', '#0000ff', '#ff0000', '#000080', '#008080', '#008000', '#800080', '#800000', '#808000', '#808080', '#c0c0c0', '#000000'];

const TAB_ORDER = [
  ['home', 'Inicio'], ['insert', 'Insertar'], ['design', 'Diseño'], ['layout', 'Disposición'],
  ['refs', 'Referencias'], ['review', 'Revisar'], ['view', 'Vista'], ['ai', 'AI'], ['fav', 'Favoritos'],
];

const UI = {
  tab: 'home',
  zoom: 100,
  view: 'print',
  lastColor: { font: '#c00000', highlight: '#ffff00', shade: '#dceaf7', cell: '#dceaf7' },
  fonts: FALLBACK_FONTS,

  build() {
    document.querySelectorAll('[data-icon]').forEach(n => { n.innerHTML = icon(n.dataset.icon); });
    this.buildQat();
    this.buildTabs();
    this.renderRibbon();
    this.buildStatus();
    this.buildTellMe();
    this.loadFonts();
    $('#tb-user').textContent = initials(Settings.author);
    $('#tb-user').addEventListener('click', (e) => this.menu(e.currentTarget, [
      { head: Settings.author },
      { label: 'Opciones', icon: 'settings', run: () => run('options') },
      { label: this.isDark() ? 'Tema claro' : 'Tema oscuro', icon: 'dark', run: () => run('darkMode') },
      { sep: true },
      { label: 'Acerca de Write It', icon: 'info', run: () => Backstage.open('about') },
    ], { align: 'right' }));
    $('#doc-title').addEventListener('click', () => Backstage.open('info'));
    $('#theme-switch').addEventListener('mousedown', (e) => e.preventDefault());
    $('#theme-switch').addEventListener('click', () => this.toggleTheme());
    $$('[data-close-pane]').forEach(b => b.addEventListener('click', () => this.showPane(b.dataset.closePane, false)));
    $$('#navpane [data-navtab]').forEach(b => b.addEventListener('click', () => Nav.setTab(b.dataset.navtab)));
    $('#nav-search').addEventListener('input', debounce(() => Nav.render(), 200));
    document.addEventListener('mousedown', (e) => {
      if (this.popupEl && !this.popupEl.contains(e.target) && !(this.popupAnchor && this.popupAnchor.contains(e.target))) this.closePopup();
    }, true);
    window.addEventListener('blur', () => this.closePopup());
    if (Settings.showRuler === false) document.body.classList.add('no-ruler');
    if (Settings.showNav) this.showPane('navpane', true);
  },

  // ---------- barra de título ----------
  buildQat() {
    const q = $('#qat');
    q.innerHTML = '';
    const autosave = el('button', { class: 'autosave', id: 'autosave', title: 'Autoguardado: guarda automáticamente mientras escribes (requiere que el documento esté guardado en tu equipo)' }, [
      el('span', { text: 'Autoguardado' }), el('span', { class: 'switch' }),
    ]);
    autosave.addEventListener('click', async () => {
      if (!Doc.path) { toast('Guarda el documento una vez para activar el autoguardado'); if (await Files.save()) { Settings = await api.setSettings({ autosave: true }); } this.updateTitle(); return; }
      Settings = await api.setSettings({ autosave: !Settings.autosave });
      this.updateTitle();
      if (Settings.autosave && Doc.dirty) autosaveSoon();
    });
    q.append(autosave);
    for (const id of ['save', 'undo', 'redo']) {
      q.append(el('button', { class: 'qat-btn', 'data-cmd': id, title: this.tip(id), html: icon(CMDS[id].icon), onmousedown: (e) => e.preventDefault(), onclick: () => run(id) }));
    }
  },

  updateTitle() {
    $('#doc-title').textContent = Doc.name.replace(/\.(wit|docx|html?|txt|md)$/i, '');
    const st = $('#save-state');
    st.textContent = Doc.dirty ? (Doc.path ? 'Editado' : 'Sin guardar') : (Doc.path ? 'Guardado' : '');
    document.title = `${Doc.dirty ? '• ' : ''}${Doc.name} — Write It`;
    const a = $('#autosave');
    if (a) a.classList.toggle('on', !!(Settings.autosave && Doc.path));
  },

  flashSaved(auto) {
    const st = $('#save-state');
    st.textContent = auto ? 'Guardado automáticamente' : 'Guardado';
    clearTimeout(this._savedT);
    this._savedT = setTimeout(() => this.updateTitle(), 2200);
  },

  setMsg(m) { $('#sb-msg').textContent = m || ''; },

  // ---------- pestañas ----------
  buildTabs() {
    const t = $('#tabs');
    t.innerHTML = '';
    t.append(el('button', { class: 'tab file', text: 'Archivo', onclick: () => Backstage.open('home') }));
    const mid = el('div', { class: 'tabs-mid' });
    for (const [id, label] of TAB_ORDER) {
      mid.append(el('button', { class: 'tab', 'data-tab': id, role: 'tab', text: label, onclick: () => this.setTab(id), ondblclick: () => this.toggleRibbon() }));
    }
    mid.append(el('button', { class: 'tab contextual', 'data-tab': 'table', text: 'Tabla', hidden: true, onclick: () => this.setTab('table') }));
    mid.append(el('button', { class: 'tab contextual', 'data-tab': 'picture', text: 'Imagen', hidden: true, onclick: () => this.setTab('picture') }));
    t.append(mid);
    t.append(el('button', { class: 'tab-tool', id: 'ribbon-toggle', title: 'Ocultar la cinta (Ctrl+F1)', html: icon('chevronUp'), onclick: () => this.toggleRibbon() }));
    this.markTab();
  },
  markTab() {
    $$('#tabs [data-tab]').forEach(b => { b.classList.toggle('active', b.dataset.tab === this.tab); b.setAttribute('aria-selected', b.dataset.tab === this.tab); });
  },
  setTab(id) {
    if (document.body.classList.contains('ribbon-collapsed') && this.tab === id) { this.toggleRibbon(); return; }
    this.tab = id;
    if (document.body.classList.contains('ribbon-collapsed')) this.toggleRibbon();
    this.markTab();
    this.renderRibbon();
  },
  toggleRibbon() {
    document.body.classList.toggle('ribbon-collapsed');
    const collapsed = document.body.classList.contains('ribbon-collapsed');
    $('#ribbon-toggle').innerHTML = icon(collapsed ? 'chevronDown' : 'chevronUp');
    $('#ribbon-toggle').title = collapsed ? 'Mostrar la cinta (Ctrl+F1)' : 'Ocultar la cinta (Ctrl+F1)';
    setTimeout(() => { Images.reposition(); }, 50);
  },

  // ---------- elementos de la cinta ----------
  tip(id) {
    const c = CMDS[id];
    if (!c) return '';
    const k = keyOf(id);
    return k ? `${c.label} (${k})` : c.label;
  },
  btn(id, size = 'small', opts = {}) {
    const c = CMDS[id];
    if (!c) return null;
    const label = opts.label === true ? c.label : opts.label;
    const children = [el('span', { class: 'ic', html: icon(opts.icon || c.icon) })];
    if (size === 'large') children.push(el('span', { class: 'lbl', text: opts.short || c.label }));
    else if (label) children.push(el('span', { class: 'lbl', text: label }));
    if (opts.menu && !opts.split) children.push(el('span', { class: 'caret', html: icon('chevronDown') }));
    const b = el('button', {
      class: `btn ${size}${!label && size !== 'large' ? ' icon-only' : ''}`, 'data-cmd': id, title: opts.title || this.tip(id),
      onmousedown: (e) => e.preventDefault(),
      onclick: (e) => { if (opts.menu && !opts.split) this.menu(e.currentTarget, opts.menu(), { wide: opts.wide }); else run(id, opts.arg); },
    }, children);
    if (opts.split && opts.menu) {
      const arrow = el('button', {
        class: `btn ${size} split-arrow`, title: 'Más opciones', html: icon('chevronDown'),
        onmousedown: (e) => e.preventDefault(),
        onclick: (e) => { const m = opts.menu(); if (m instanceof Node) this.popup(e.currentTarget.parentNode, m); else this.menu(e.currentTarget.parentNode, m); },
      });
      b.classList.add('split-main');
      return el('div', { class: `split ${size}` }, [b, arrow]);
    }
    return b;
  },
  colorBtn(id, kind) {
    const c = CMDS[id];
    const bar = el('span', { class: 'color-bar', style: { background: this.lastColor[kind] } });
    const main = el('button', {
      class: 'btn small icon-only with-bar split-main', 'data-cmd': id, title: this.tip(id),
      onmousedown: (e) => e.preventDefault(), onclick: () => run(id, this.lastColor[kind]),
    }, [el('span', { class: 'ic', html: icon(c.icon) }), bar]);
    const arrow = el('button', {
      class: 'btn small split-arrow', title: c.label, html: icon('chevronDown'), onmousedown: (e) => e.preventDefault(),
      onclick: (e) => this.colorPicker(e.currentTarget.parentNode, {
        kind,
        noneLabel: kind === 'font' ? 'Automático' : 'Sin color',
        palette: kind === 'highlight' ? 'highlight' : 'full',
        onPick: (col) => {
          if (col) { this.lastColor[kind] = col; bar.style.background = col; }
          run(id, col || (kind === 'font' ? '#000000' : ''));
        },
      }),
    });
    return el('div', { class: 'split small' }, [main, arrow]);
  },
  group(label, children, cls = '') {
    return el('div', { class: 'group ' + cls }, [el('div', { class: 'group-body' }, children.filter(Boolean)), el('div', { class: 'group-label', text: label })]);
  },
  row(...items) { return el('div', { class: 'row' }, items.filter(Boolean)); },
  col(...items) { return el('div', { class: 'col' }, items.filter(Boolean)); },

  fontCombo() {
    const input = el('input', { type: 'text', id: 'font-input', spellcheck: 'false', 'aria-label': 'Fuente' });
    const wrap = el('div', { class: 'combo font', title: 'Fuente' }, [input, el('button', { html: icon('chevronDown'), tabindex: -1, onmousedown: (e) => e.preventDefault(), onclick: () => this.fontMenu(wrap, input) })]);
    input.addEventListener('focus', () => input.select());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); const v = input.value.trim(); if (v) { focusDoc(); setFontFamily(this.matchFont(v)); } this.closePopup(); }
      if (e.key === 'Escape') { this.closePopup(); focusDoc(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); this.fontMenu(wrap, input); }
    });
    input.addEventListener('input', () => this.fontMenu(wrap, input, input.value));
    return wrap;
  },
  matchFont(v) { return this.fonts.find(f => f.toLowerCase() === v.toLowerCase()) || this.fonts.find(f => f.toLowerCase().startsWith(v.toLowerCase())) || v; },
  fontMenu(anchor, input, filter) {
    const list = el('div', { class: 'font-list' });
    const f = (filter || '').toLowerCase();
    const recent = (Settings.recentFonts || []).filter(x => this.fonts.includes(x));
    const make = (name) => el('button', {
      class: 'menu-item' + (name === currentFormat().family ? ' checked' : ''), style: { fontFamily: fontCss(name) }, text: name,
      onmousedown: (e) => e.preventDefault(),
      onclick: () => { this.closePopup(); focusDoc(); setFontFamily(name); this.rememberFont(name); },
    });
    if (!f) {
      list.append(el('div', { class: 'menu-head', text: 'Fuentes del documento' }));
      [Doc.headingFont, Doc.fontFamily].filter((x, i, a) => x && a.indexOf(x) === i).forEach(n => list.append(make(n)));
      if (recent.length) { list.append(el('div', { class: 'menu-head', text: 'Usadas recientemente' })); recent.forEach(n => list.append(make(n))); }
      list.append(el('div', { class: 'menu-head', text: 'Todas las fuentes' }));
    }
    const all = this.fonts.filter(n => !f || n.toLowerCase().includes(f));
    all.forEach(n => list.append(make(n)));
    if (!all.length) list.append(el('div', { class: 'nav-empty', text: 'No hay fuentes con ese nombre' }));
    this.popup(anchor, list, { keepFocus: true });
  },
  async rememberFont(name) {
    const list = [name, ...(Settings.recentFonts || []).filter(x => x !== name)].slice(0, 6);
    Settings = await api.setSettings({ recentFonts: list });
  },
  sizeCombo() {
    const input = el('input', { type: 'text', id: 'size-input', spellcheck: 'false', 'aria-label': 'Tamaño de fuente' });
    const wrap = el('div', { class: 'combo size', title: 'Tamaño de fuente' }, [input, el('button', {
      html: icon('chevronDown'), tabindex: -1, onmousedown: (e) => e.preventDefault(),
      onclick: () => this.popup(wrap, el('div', { class: 'size-list' }, SIZES.map(s => el('button', {
        class: 'menu-item' + (s === currentFormat().size ? ' checked' : ''), text: String(s).replace('.', ','),
        onmousedown: (e) => e.preventDefault(), onclick: () => { this.closePopup(); setFontSize(s); },
      })))),
    })]);
    input.addEventListener('focus', () => input.select());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); const v = parseFloat(input.value.replace(',', '.')); if (v) { focusDoc(); setFontSize(v); } }
      if (e.key === 'Escape') focusDoc();
    });
    return wrap;
  },
  stylesGallery() {
    const ids = ['normal', 'h1', 'h2', 'h3', 'title', 'quote'];
    const sample = {
      normal: 'font-size:13px', nospacing: 'font-size:13px', h1: 'font-size:15px;color:#0f4761', h2: 'font-size:13.5px;color:#0f4761',
      h3: 'font-size:13px;color:#1f3763', title: 'font-size:16px;letter-spacing:-.2px', subtitle: 'font-size:13px;color:#595959', quote: 'font-size:13px;font-style:italic;color:#404040',
      intense: 'font-size:13px;font-style:italic;color:#156082', code: 'font-size:12px;font-family:Consolas',
    };
    const tile = (id) => el('button', {
      class: 'style-tile', 'data-style': id, title: `${STYLES[id].name}${keyOf('style_' + id) ? ' (' + keyOf('style_' + id) + ')' : ''}`,
      onmousedown: (e) => e.preventDefault(), onclick: () => run('style_' + id),
    }, [el('span', { class: 'sample', style: `font-family:${/^(h|title)/.test(id) ? fontCss(Doc.headingFont) : fontCss(Doc.fontFamily)};${sample[id]}`, text: 'AaBbCc' }), el('span', { class: 'name', text: STYLES[id].name })]);
    const more = el('button', {
      class: 'gallery-more', title: 'Todos los estilos', html: icon('chevronDown'), onmousedown: (e) => e.preventDefault(),
      onclick: () => this.menu(more.parentNode, [
        ...Object.keys(STYLES).map(id => ({ label: STYLES[id].name, checked: currentStyleId() === id, run: () => run('style_' + id), style: sample[id] })),
        { sep: true }, { label: 'Borrar formato', icon: 'clear', run: () => run('clearFormat') },
      ]),
    });
    return el('div', { class: 'styles-gallery' }, [...ids.map(tile), more]);
  },

  // ---------- definición de la cinta ----------
  ribbonDef(tab) {
    const B = (id, o) => this.btn(id, 'small', o);
    const BL = (id, o) => this.btn(id, 'small', { label: true, ...o });
    const L = (id, o) => this.btn(id, 'large', o);
    const g = (l, c, cls) => this.group(l, c, cls);
    const R = (...a) => this.row(...a);
    const C = (...a) => this.col(...a);
    switch (tab) {
      case 'home': return [
        g('Portapapeles', [L('paste', { split: true, menu: () => [{ label: 'Pegar', icon: 'paste', key: 'Ctrl+V', run: () => run('paste') }, { label: 'Pegar solo texto', icon: 'paste', key: 'Ctrl+Mayús+V', run: () => run('pasteText') }] }),
          C(B('cut'), B('copy'), B('painter'))]),
        g('Fuente', [C(
          R(this.fontCombo(), this.sizeCombo(), B('grow'), B('shrink', { icon: 'grow', title: this.tip('shrink') }), B('caseCycle', { menu: () => this.caseMenu() }), B('clearFormat')),
          R(B('bold'), B('italic'), B('underline'), B('strike'), B('sub'), B('sup'), this.sep(), this.colorBtn('highlight', 'highlight'), this.colorBtn('fontColor', 'font')),
        )]),
        g('Párrafo', [C(
          R(B('bullets', { split: true, menu: () => this.bulletMenu() }), B('numbers', { split: true, menu: () => this.numberMenu() }), B('outdent'), B('indent'), B('showMarks')),
          R(B('alignLeft'), B('alignCenter'), B('alignRight'), B('alignJustify'), B('lineSpacing', { menu: () => this.lineSpacingMenu() }), this.shadeBtn()),
        )]),
        g('Estilos', [this.stylesGallery()]),
        g('Voz', [L('dictate')]),
        g('Edición', [C(B('find'), B('findReplace'), B('selectAll'))]),
      ];
      case 'insert': return [
        g('Páginas', [L('cover'), L('blankPage', { short: 'Página en blanco' }), L('pageBreak', { short: 'Salto de página' })]),
        g('Tablas', [L('insertTable', { menu: () => this.tableGrid(), wide: true })]),
        g('Ilustraciones', [L('insertImage')]),
        g('Vínculos', [L('link')]),
        g('Comentarios', [L('commentAdd', { short: 'Comentario' })]),
        g('Encabezado y pie', [L('header'), L('footer', { short: 'Pie de página' }), L('pageNumber', { short: 'Número de página', menu: () => this.pageNumberMenu() })]),
        g('Texto', [C(BL('dateTime'), BL('hr'), BL('footnote', { label: 'Nota al final' }))]),
        g('Símbolos', [L('symbol', { menu: () => this.symbolGrid() })]),
      ];
      case 'design': return [
        g('Formato del documento', [L('docFonts', { menu: () => this.docFontsMenu() }), L('docSpacing', { menu: () => this.docSpacingMenu() })]),
        g('Fondo de página', [L('watermark', { short: 'Marca de agua', menu: () => this.watermarkMenu() }), L('pageColor', { short: 'Color de página', menu: () => this.pageColorMenu() })]),
      ];
      case 'layout': return [
        g('Configurar página', [L('margins', { menu: () => this.marginsMenu() }), L('orientation', { menu: () => this.orientationMenu() }), L('pageSize', { menu: () => this.sizeMenu() }),
          L('columns', { menu: () => this.columnsMenu() }), L('breaks', { menu: () => this.breaksMenu() })]),
        g('Párrafo', [this.paraFields()]),
        g('Más', [L('pageSetup', { short: 'Configurar página' }), L('paragraphDialog', { short: 'Párrafo…' })]),
      ];
      case 'refs': return [
        g('Tabla de contenido', [L('toc', { menu: () => this.tocMenu() }), C(BL('tocUpdate'))]),
        g('Notas', [L('footnote', { short: 'Insertar nota' })]),
      ];
      case 'review': return [
        g('Revisión', [L('spelling', { short: 'Ortografía' }), L('wordCount')]),
        g('Voz', [L('speak')]),
        g('Comentarios', [L('commentAdd'), L('commentDelete', { short: 'Eliminar', menu: () => [{ label: 'Eliminar', icon: 'commentDel', run: () => run('commentDelete') }, { label: 'Eliminar todos los comentarios', icon: 'commentDel', run: () => run('commentDeleteAll') }] }),
          C(BL('commentPrev', { label: 'Anterior' }), BL('commentNext', { label: 'Siguiente' }), BL('commentsPane'))]),
        g('Idioma', [L('language', { menu: () => this.languageMenu() })]),
      ];
      case 'view': return [
        g('Vistas', [L('readMode'), L('printLayout'), L('focusMode')]),
        g('Mostrar', [C(this.check('ruler'), this.check('navPane'), this.check('showMarks', 'Marcas de párrafo'))]),
        g('Zoom', [L('zoomDialog', { short: 'Zoom' }), L('zoom100'), C(BL('zoomPage'), BL('zoomWidth'))]),
        g('Ventana', [L('newWindow'), L('fullscreen')]),
        g('Apariencia', [L('darkMode')]),
      ];
      case 'ai': return [
        g('Dictado', [L('dictate'), C(this.dictLangSelect(), this.check('dictAutoPolish', 'Ordenar al terminar'))]),
        g('Corregir', [L('aiPolish', { short: 'Ordenar texto' })]),
        g('Reescribir', [L('aiRewrite', { menu: () => ['rewrite', 'professional', 'casual', 'shorter', 'clearer'].map(m => ({ label: AI_MODES[m].name, run: () => run('aiRewrite', m) })) })]),
        g('Idioma', [L('aiTranslate', { menu: () => [{ head: 'Traducir a' }, ...TRANSLATE_LANGS.map(([v, t]) => ({ label: t, run: () => run('aiTranslate', v) }))] })]),
        g('Crear', [L('aiWrite')]),
        g('Configuración', [L('aiModels')]),
      ];
      case 'fav': return [
        g('Mis favoritos', [...(Settings.favorites || []).filter(id => CMDS[id]).map(id => L(id)), L('customizeFav', { short: 'Personalizar' })]),
      ];
      case 'table': return [
        g('Filas y columnas', [L('rowAbove', { short: 'Insertar arriba' }), L('rowBelow', { short: 'Insertar debajo' }), L('colLeft', { short: 'Insertar a la izquierda' }), L('colRight', { short: 'Insertar a la derecha' })]),
        g('Eliminar', [L('tableDeleteMenu', { menu: () => [{ label: 'Eliminar fila', icon: 'rowDel', run: () => run('rowDelete') }, { label: 'Eliminar columna', icon: 'colDel', run: () => run('colDelete') }, { label: 'Eliminar tabla', icon: 'tableDel', run: () => run('tableDelete') }] })]),
        g('Combinar', [L('mergeCells')]),
        g('Estilo', [L('tableStyle', { menu: () => this.tableStyles() }), C(this.cellShadeBtn(), BL('headerRow'))]),
      ];
      case 'picture': return [
        g('Ajuste del texto', [L('imgInline', { short: 'En línea' }), L('imgLeft', { short: 'Izquierda' }), L('imgCenter', { short: 'Centrada' }), L('imgRight', { short: 'Derecha' })]),
        g('Estilo', [L('imgBorder'), L('imgShadow'), L('imgRounded', { short: 'Redondeada' })]),
        g('Tamaño', [L('imgSize', { menu: () => [25, 50, 75, 100].map(p => ({ label: `${p} % del ancho`, run: () => Images.setWidthPercent(p) })).concat([{ sep: true }, { label: 'Tamaño original', icon: 'history', run: () => run('imgReset') }]) })]),
        g('Accesibilidad', [L('imgAlt')]),
        g('', [L('imgDelete', { short: 'Eliminar' })]),
      ];
    }
    return [];
  },

  renderRibbon() {
    const r = $('#ribbon');
    r.innerHTML = '';
    const inner = el('div', { class: 'ribbon-inner' }, this.ribbonDef(this.tab));
    r.append(inner);
    this.updateState(true);
  },

  sep() { return el('span', { class: 'rsep' }); },
  check(id, label) {
    const c = CMDS[id];
    const input = el('input', { type: 'checkbox', 'data-check': id });
    const lab = el('label', { class: 'rcheck', title: c ? this.tip(id) : '' }, [input, el('span', { text: label || (c ? c.label : id) })]);
    input.addEventListener('change', () => run(id));
    lab.addEventListener('mousedown', (e) => { if (e.target !== input) e.preventDefault(); });
    return lab;
  },
  shadeBtn() {
    const bar = el('span', { class: 'color-bar', style: { background: this.lastColor.shade } });
    const main = el('button', { class: 'btn small icon-only with-bar split-main', 'data-cmd': 'shading', title: 'Sombreado', onmousedown: (e) => e.preventDefault(), onclick: () => run('shading', this.lastColor.shade) }, [el('span', { class: 'ic', html: icon('shading') }), bar]);
    const arrow = el('button', {
      class: 'btn small split-arrow', html: icon('chevronDown'), onmousedown: (e) => e.preventDefault(),
      onclick: (e) => this.colorPicker(e.currentTarget.parentNode, { noneLabel: 'Sin color', onPick: (c) => { if (c) { this.lastColor.shade = c; bar.style.background = c; } run('shading', c); } }),
    });
    return el('div', { class: 'split small' }, [main, arrow]);
  },
  cellShadeBtn() {
    return el('button', {
      class: 'btn small', 'data-cmd': 'cellShade', onmousedown: (e) => e.preventDefault(),
      onclick: (e) => this.colorPicker(e.currentTarget, { noneLabel: 'Sin color', onPick: (c) => run('cellShade', c) }),
    }, [el('span', { class: 'ic', html: icon('shading') }), el('span', { class: 'lbl', text: 'Sombreado' }), el('span', { class: 'caret', html: icon('chevronDown') })]);
  },
  paraFields() {
    const f = (label, key, unit, step) => {
      const input = el('input', { type: 'number', step, 'data-para': key, min: key.startsWith('margin') && key !== 'marginLeft' && key !== 'marginRight' ? 0 : -10 });
      input.addEventListener('change', () => {
        const v = parseFloat(input.value) || 0;
        if (key === 'marginLeft' || key === 'marginRight') setBlockStyle({ [key]: v ? v + 'cm' : '' });
        else setBlockStyle({ [key]: v + 'pt' });
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { input.dispatchEvent(new Event('change')); focusDoc(); } });
      return el('label', { class: 'pfield' }, [el('span', { text: label }), el('span', { class: 'pinput' }, [input, el('span', { class: 'unit', text: unit })])]);
    };
    return el('div', { class: 'para-fields' }, [
      el('div', { class: 'pf-col' }, [el('div', { class: 'pf-head', text: 'Sangría' }), f('Izquierda', 'marginLeft', 'cm', 0.25), f('Derecha', 'marginRight', 'cm', 0.25)]),
      el('div', { class: 'pf-col' }, [el('div', { class: 'pf-head', text: 'Espaciado' }), f('Antes', 'marginTop', 'pt', 6), f('Después', 'marginBottom', 'pt', 6)]),
    ]);
  },
  dictLangSelect() {
    const s = el('select', { class: 'rselect', id: 'dict-lang', title: 'Idioma del dictado' }, Dictation.LANGS.map(([v, t]) => el('option', { value: v, text: t })));
    s.value = Settings.dictationLang || 'spanish';
    s.addEventListener('change', async () => { Settings = await api.setSettings({ dictationLang: s.value }); });
    return s;
  },

  // ---------- menús de la cinta ----------
  caseMenu() {
    return [['caseSentence', 'Tipo oración.'], ['caseLower', 'minúsculas'], ['caseUpper', 'MAYÚSCULAS'], ['caseTitle', 'Poner En Mayúsculas Cada Palabra'], ['caseToggle', 'tIPO iNVERSO']]
      .map(([id, l]) => ({ label: l, run: () => run(id) }));
  },
  bulletMenu() {
    return [['disc', '●  Círculo relleno'], ['circle', '○  Círculo'], ['square', '■  Cuadrado'], ['"– "', '–  Guion'], ['"✓  "', '✓  Marca de verificación'], ['"➢  "', '➢  Flecha']]
      .map(([v, l]) => ({ label: l, run: () => run('bullets', v) }));
  },
  numberMenu() {
    return [['decimal', '1.  2.  3.'], ['lower-alpha', 'a.  b.  c.'], ['upper-alpha', 'A.  B.  C.'], ['lower-roman', 'i.  ii.  iii.'], ['upper-roman', 'I.  II.  III.']]
      .map(([v, l]) => ({ label: l, run: () => run('numbers', v) }));
  },
  lineSpacingMenu() {
    const cur = closestBlock((currentRange() || lastRange)?.startContainer);
    const lh = cur ? cur.style.lineHeight : '';
    return [...['1.0', '1.15', '1.5', '2.0', '2.5', '3.0'].map(v => ({ label: v.replace('.', ','), checked: parseFloat(lh) === parseFloat(v), run: () => run('lineSpacing', parseFloat(v)) })),
      { sep: true },
      { label: 'Agregar espacio antes del párrafo', run: () => setSpacing('before', 12) },
      { label: 'Quitar espacio después del párrafo', run: () => setSpacing('after', 0) },
      { label: 'Opciones de interlineado…', icon: 'paragraph', run: () => run('paragraphDialog') }];
  },
  tableGrid() {
    const label = el('div', { class: 'table-grid-label', text: 'Insertar tabla' });
    const grid = el('div', { class: 'table-grid' });
    const cells = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 10; c++) {
      const s = el('span', { 'data-r': r, 'data-c': c });
      cells.push(s); grid.append(s);
    }
    grid.addEventListener('mouseover', (e) => {
      const t = e.target; if (t.dataset.r === undefined) return;
      const R = +t.dataset.r, C = +t.dataset.c;
      cells.forEach(s => s.classList.toggle('on', +s.dataset.r <= R && +s.dataset.c <= C));
      label.textContent = `Tabla de ${C + 1} × ${R + 1}`;
    });
    grid.addEventListener('mouseleave', () => { cells.forEach(s => s.classList.remove('on')); label.textContent = 'Insertar tabla'; });
    grid.addEventListener('mousedown', (e) => e.preventDefault());
    grid.addEventListener('click', (e) => { const t = e.target; if (t.dataset.r === undefined) return; this.closePopup(); Tables.insert(+t.dataset.r + 1, +t.dataset.c + 1); });
    return el('div', {}, [label, grid, el('div', { class: 'menu-sep' }),
      el('button', { class: 'menu-item', html: icon('tableAdd') + '<span>Insertar tabla…</span>', onmousedown: (e) => e.preventDefault(), onclick: () => { this.closePopup(); Tables.dialog(); } })]);
  },
  tableStyles() {
    const styles = [['', 'Cuadrícula'], ['t-plain', 'Suave'], ['t-minimal', 'Mínima'], ['t-blue', 'Azul'], ['t-green', 'Verde'], ['t-gray', 'Gris'], ['t-none', 'Sin bordes']];
    const preview = (cls) => {
      const head = { 't-blue': '#156082', 't-green': '#3a7d22', 't-gray': '#404040' }[cls];
      const band = { 't-blue': '#dceaf7', 't-green': '#e2efd9', 't-gray': '#ededed' }[cls];
      const line = cls === 't-none' ? 'transparent' : cls === 't-plain' || cls === 't-minimal' ? '#bfbfbf' : head ? 'transparent' : '#000';
      return [0, 1, 2, 3].map(i => el('i', { style: { background: i === 0 && head ? head : i % 2 === 0 && i && band ? band : 'transparent', borderBottom: `1px solid ${line}`, borderTop: i === 0 ? `1px solid ${cls === 't-minimal' ? '#000' : line}` : '' } }));
    };
    return el('div', { class: 'tstyle-grid' }, styles.map(([cls, name]) => el('button', {
      class: 'tstyle', title: name, onmousedown: (e) => e.preventDefault(), onclick: () => { this.closePopup(); run('tableStyle', cls); },
    }, preview(cls))));
  },
  pageNumberMenu() {
    const pn = Doc.pageNumbers;
    const is = (w, a) => pn && pn.where === w && pn.align === a;
    const fmt = pn ? pn.format : 'n';
    return [
      { head: 'Posición' },
      { label: 'Parte inferior, centrado', checked: is('footer', 'center'), run: () => run('pageNumber', { where: 'footer', align: 'center', format: fmt }) },
      { label: 'Parte inferior, derecha', checked: is('footer', 'right'), run: () => run('pageNumber', { where: 'footer', align: 'right', format: fmt }) },
      { label: 'Parte inferior, izquierda', checked: is('footer', 'left'), run: () => run('pageNumber', { where: 'footer', align: 'left', format: fmt }) },
      { label: 'Parte superior, derecha', checked: is('header', 'right'), run: () => run('pageNumber', { where: 'header', align: 'right', format: fmt }) },
      { label: 'Parte superior, centrado', checked: is('header', 'center'), run: () => run('pageNumber', { where: 'header', align: 'center', format: fmt }) },
      { head: 'Formato' },
      { label: '1, 2, 3…', checked: pn && fmt === 'n', run: () => run('pageNumber', { ...(pn || { where: 'footer', align: 'center' }), format: 'n' }) },
      { label: 'Página 1', checked: pn && fmt === 'page', run: () => run('pageNumber', { ...(pn || { where: 'footer', align: 'center' }), format: 'page' }) },
      { label: 'Página 1 de 10', checked: pn && fmt === 'pageOf', run: () => run('pageNumber', { ...(pn || { where: 'footer', align: 'center' }), format: 'pageOf' }) },
      { sep: true },
      { label: 'Quitar números de página', icon: 'delete', run: () => run('pageNumber', null) },
    ];
  },
  symbolGrid() {
    return el('div', { class: 'symbol-grid' }, SYMBOLS.map(s => el('button', {
      text: s, title: s, onmousedown: (e) => e.preventDefault(), onclick: () => { this.closePopup(); run('symbol', s); },
    })));
  },
  docFontsMenu() {
    const sets = [
      ['Office', 'Calibri Light', 'Calibri'], ['Aptos', 'Aptos Display', 'Aptos'], ['Clásica', 'Times New Roman', 'Times New Roman'],
      ['Editorial', 'Georgia', 'Georgia'], ['Elegante', 'Garamond', 'Garamond'], ['Moderna', 'Segoe UI Semibold', 'Segoe UI'],
      ['Limpia', 'Arial', 'Arial'], ['Cálida', 'Constantia', 'Candara'], ['Técnica', 'Cambria', 'Calibri'],
    ];
    return [
      ...sets.map(([name, h, b]) => ({
        label: name, sub: `${h} / ${b}`, style: `font-family:${fontCss(h)}`, checked: Doc.headingFont === h && Doc.fontFamily === b,
        run: () => { Doc.headingFont = h; Doc.fontFamily = b; docChanged(); this.renderRibbon(); },
      })),
      { sep: true },
      { label: 'Establecer como predeterminado', icon: 'pin', run: async () => { Settings = await api.setSettings({ fontFamily: Doc.fontFamily, fontSize: Doc.fontSize, lineHeight: Doc.lineHeight }); toast('Los documentos nuevos usarán ' + Doc.fontFamily); } },
    ];
  },
  docSpacingMenu() {
    return [['Compacto', 1], ['Normal (1,15)', 1.15], ['Abierto', 1.3], ['Relajado (1,5)', 1.5], ['Doble', 2]].map(([l, v]) => ({
      label: l, checked: Doc.lineHeight === v, run: () => { Doc.lineHeight = v; docChanged(); },
    }));
  },
  watermarkMenu() {
    return [...['CONFIDENCIAL', 'BORRADOR', 'URGENTE', 'NO COPIAR', 'MUESTRA'].map(t => ({ label: t, checked: Doc.watermark === t, run: () => run('watermark', t) })),
      { sep: true },
      { label: 'Marca de agua personalizada…', icon: 'watermark', run: async () => { const v = await this.prompt('Marca de agua', 'Texto de la marca de agua:', Doc.watermark || ''); if (v !== null) run('watermark', v.trim()); } },
      { label: 'Quitar marca de agua', icon: 'delete', run: () => run('watermark', '') }];
  },
  pageColorMenu() {
    const anchor = $('[data-cmd="pageColor"]');
    setTimeout(() => this.colorPicker(anchor, { noneLabel: 'Sin color', light: true, onPick: (c) => run('pageColor', c) }), 0);
    return null;
  },
  marginsMenu() {
    const cur = Doc.page.marginsPreset;
    const items = Object.entries(MARGINS).map(([k, m]) => el('button', {
      class: 'preset' + (cur === k ? ' checked' : ''), onmousedown: (e) => e.preventDefault(), onclick: () => { this.closePopup(); run('margins', k); },
    }, [
      el('span', { class: 'pv' }, [el('i', { style: { top: (m.top / 297 * 44) + 'px', bottom: (m.bottom / 297 * 44) + 'px', left: (m.left / 210 * 34) + 'px', right: (m.right / 210 * 34) + 'px' } })]),
      el('span', { class: 'pt' }, [el('b', { text: m.name }), el('span', { text: `Sup.: ${fmtCm(m.top)}  Inf.: ${fmtCm(m.bottom)}` }), el('span', { text: `Izq.: ${fmtCm(m.left)}  Der.: ${fmtCm(m.right)}` })]),
    ]));
    return el('div', { class: 'preset-grid' }, [...items, el('div', { class: 'menu-sep' }),
      el('button', { class: 'menu-item', html: icon('margins') + '<span>Márgenes personalizados…</span>', onmousedown: (e) => e.preventDefault(), onclick: () => { this.closePopup(); this.pageSetupDialog(); } })]);
  },
  orientationMenu() {
    return [{ label: 'Vertical', icon: 'doc', checked: Doc.page.orientation === 'portrait', run: () => run('orientation', 'portrait') },
      { label: 'Horizontal', icon: 'landscape', checked: Doc.page.orientation === 'landscape', run: () => run('orientation', 'landscape') }];
  },
  sizeMenu() {
    return Object.entries(PAGE_SIZES).map(([k, s]) => ({ label: s.name, sub: s.desc, checked: Doc.page.size === k, run: () => run('pageSize', k) }));
  },
  columnsMenu() {
    return [{ label: 'Una', icon: 'col1', checked: Doc.columns === 1, run: () => run('columns', 1) },
      { label: 'Dos', icon: 'col2', checked: Doc.columns === 2, run: () => run('columns', 2) },
      { label: 'Tres', icon: 'col3', checked: Doc.columns === 3, run: () => run('columns', 3) }];
  },
  breaksMenu() {
    return [{ label: 'Salto de página', sub: 'El texto siguiente empieza en una página nueva', icon: 'pageBreak', key: 'Ctrl+Intro', run: () => run('pageBreak') },
      { label: 'Salto de columna', sub: 'El texto siguiente empieza en la columna siguiente', icon: 'col2', run: () => run('columnBreak') }];
  },
  tocMenu() {
    return [{ label: 'Insertar tabla de contenido', sub: 'Usa los estilos Título 1, 2 y 3', icon: 'toc', run: () => run('toc') },
      { label: 'Actualizar tabla', icon: 'history', run: () => run('tocUpdate') },
      { label: 'Quitar tabla de contenido', icon: 'delete', run: () => run('tocRemove') }];
  },
  languageMenu() {
    const langs = [['es-ES', 'Español (España)'], ['es-MX', 'Español (México)'], ['es-419', 'Español (Latinoamérica)'], ['en-US', 'Inglés (EE. UU.)'], ['en-GB', 'Inglés (Reino Unido)'], ['pt-BR', 'Portugués (Brasil)'], ['fr-FR', 'Francés'], ['it-IT', 'Italiano'], ['de-DE', 'Alemán']];
    const cur = Settings.spellLanguages || [];
    return [{ head: 'Idiomas de corrección' }, ...langs.map(([code, name]) => ({
      label: name, checked: cur.includes(code), run: async () => {
        const next = cur.includes(code) ? cur.filter(c => c !== code) : [...cur, code];
        const avail = await api.spellLanguages();
        if (!avail.includes(code) && !cur.includes(code)) toast('Ese idioma se descargará la primera vez que se use (requiere internet).');
        Settings = await api.setSettings({ spellLanguages: next.length ? next : ['es-ES'] });
        this.updateLang();
      },
    }))];
  },

  // ---------- menús y ventanas emergentes ----------
  popup(anchor, content, opts = {}) {
    this.closePopup();
    if (!content) return null;
    const p = el('div', { class: 'popup' + (opts.cls ? ' ' + opts.cls : '') }, [content]);
    $('#popup-root').append(p);
    const a = anchor.getBoundingClientRect();
    const pw = p.offsetWidth, ph = p.offsetHeight;
    let x = opts.align === 'right' ? a.right - pw : a.left;
    let y = a.bottom + 4;
    if (x + pw > innerWidth - 8) x = innerWidth - pw - 8;
    if (y + ph > innerHeight - 8) y = Math.max(8, a.top - ph - 4);
    p.style.left = Math.max(8, x) + 'px';
    p.style.top = y + 'px';
    this.popupEl = p;
    this.popupAnchor = anchor;
    anchor.classList?.add('open');
    p.addEventListener('keydown', (e) => { if (e.key === 'Escape') { this.closePopup(); focusDoc(); } });
    if (!opts.keepFocus) p.addEventListener('mousedown', (e) => { if (!/INPUT|SELECT|TEXTAREA/.test(e.target.nodeName)) e.preventDefault(); });
    return p;
  },
  closePopup() {
    if (this.popupEl) { this.popupEl.remove(); this.popupEl = null; }
    if (this.popupAnchor) { this.popupAnchor.classList?.remove('open'); this.popupAnchor = null; }
  },
  menu(anchor, items, opts = {}) {
    if (!items) return;
    if (items instanceof Node) { this.popup(anchor, items, opts); return; }
    const box = el('div', { class: 'menu' + (opts.wide ? ' wide' : '') });
    for (const it of items) {
      if (!it) continue;
      if (it.sep) { box.append(el('div', { class: 'menu-sep' })); continue; }
      if (it.head) { box.append(el('div', { class: 'menu-head', text: it.head })); continue; }
      const b = el('button', {
        class: 'menu-item' + (it.checked ? ' checked' : ''), onmousedown: (e) => e.preventDefault(),
        onclick: () => { this.closePopup(); it.run && it.run(); },
      }, [
        it.icon ? el('span', { class: 'ic', html: icon(it.icon) }) : el('span', { class: 'ic-space' }),
        el('span', { class: 'mi-text' }, [el('span', { style: it.style || '', text: it.label }), it.sub ? el('span', { class: 'mi-sub', text: it.sub }) : null]),
        it.key ? el('span', { class: 'mi-key', text: it.key }) : null,
      ]);
      box.append(b);
    }
    this.popup(anchor, box, opts);
  },
  colorPicker(anchor, { onPick, noneLabel = 'Sin color', palette = 'full', light = false }) {
    const pick = (c) => { this.closePopup(); onPick(c); };
    const sw = (c) => el('button', { class: 'sw', style: { background: c }, title: c, onmousedown: (e) => e.preventDefault(), onclick: () => pick(c) });
    const parts = [el('button', { class: 'menu-item', onmousedown: (e) => e.preventDefault(), onclick: () => pick(null) }, [el('span', { class: 'sw-none' }), el('span', { text: noneLabel })])];
    if (palette === 'highlight') {
      parts.push(el('div', { class: 'palette', style: { gridTemplateColumns: 'repeat(5, 22px)' } }, HIGHLIGHTS.map(c => { const s = sw(c); s.style.width = s.style.height = '22px'; return s; })));
    } else {
      parts.push(el('div', { class: 'menu-head', text: 'Colores del tema' }));
      parts.push(el('div', { class: 'palette' }, THEME_COLORS.map(sw)));
      const tints = el('div', { class: 'palette-col' });
      for (const amt of light ? [0.8, 0.6, 0.4] : [0.8, 0.6, 0.4, -0.25, -0.5]) for (const c of THEME_COLORS) tints.append(sw(shade(c, amt)));
      parts.push(tints);
      parts.push(el('div', { class: 'menu-head', text: 'Colores estándar' }));
      parts.push(el('div', { class: 'palette' }, STD_COLORS.map(sw)));
      const custom = el('input', { type: 'color', value: '#2b579a' });
      custom.addEventListener('change', () => pick(custom.value));
      parts.push(el('div', { class: 'menu-sep' }));
      parts.push(el('label', { class: 'menu-item' }, [el('span', { class: 'ic', html: icon('pageColor') }), el('span', { text: 'Más colores…' }), custom]));
    }
    this.popup(anchor, el('div', { class: 'color-picker' }, parts));
  },

  // ---------- diálogos ----------
  modal({ title, body, buttons = [{ label: 'Aceptar', primary: true }], width = 420, onOpen, onClose }) {
    return new Promise((resolve) => {
      this.closePopup();
      const root = $('#modal-root');
      const prevFocus = document.activeElement;
      const close = (val) => {
        backdrop.remove();
        this.modalClose = null;
        if (onClose) onClose(val);
        resolve(val);
        if (prevFocus && prevFocus !== document.body && document.contains(prevFocus) && prevFocus.id !== 'doc') prevFocus.focus?.();
        else focusDoc();
      };
      const foot = el('div', { class: 'modal-foot' }, buttons.filter(Boolean).map((b, i) => el('button', {
        class: 'pbtn' + (b.primary ? ' primary' : ''), text: b.label,
        onclick: async () => {
          if (b.action) {
            const r = await b.action();
            if (r === false) return; // la acción pidió no cerrar
          }
          close(b.value !== undefined ? b.value : (b.primary ? true : (i === 0 && !b.action ? null : b.label)));
        },
      })));
      const modal = el('div', { class: 'modal', role: 'dialog', 'aria-label': title, style: { width: width + 'px' } }, [
        el('div', { class: 'modal-head' }, [el('span', { text: title }), el('button', { class: 'icon-btn', title: 'Cerrar', html: icon('close'), onclick: () => close(null) })]),
        el('div', { class: 'modal-body' }, [body]),
        foot,
      ]);
      const backdrop = el('div', { class: 'modal-backdrop' }, [modal]);
      backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) modal.classList.add('shake'); setTimeout(() => modal.classList.remove('shake'), 300); });
      modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); close(null); }
        if (e.key === 'Enter' && !e.shiftKey && e.target.nodeName !== 'TEXTAREA' && e.target.nodeName !== 'BUTTON') {
          const prim = foot.querySelector('.primary');
          if (prim) { e.preventDefault(); prim.click(); }
        }
      });
      root.append(backdrop);
      this.modalClose = close;
      setTimeout(() => {
        if (onOpen) onOpen(modal);
        else (modal.querySelector('input, select, textarea') || foot.querySelector('.primary'))?.focus();
      }, 20);
    });
  },
  closeModal() { if (this.modalClose) this.modalClose(null); },
  alert(msg, title = 'Write It') {
    return this.modal({ title, body: el('div', { class: 'pre-line', text: msg }), buttons: [{ label: 'Aceptar', primary: true }] });
  },
  confirm(msg, title = 'Write It', ok = 'Aceptar') {
    return this.modal({ title, body: el('div', { class: 'pre-line', text: msg }), buttons: [{ label: 'Cancelar', value: false }, { label: ok, primary: true, value: true }] }).then(v => v === true);
  },
  prompt(title, label, value = '') {
    const input = el('input', { type: 'text', value });
    let result = null;
    return this.modal({
      title, width: 400,
      body: el('div', { class: 'field' }, [el('label', { text: label }), input]),
      buttons: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, action: () => { result = input.value; } }],
      onOpen: () => { input.focus(); input.select(); },
    }).then(() => result);
  },

  pageSetupDialog() {
    const m = Doc.page.margins;
    const n = (v) => el('input', { type: 'number', step: 0.1, min: 0, value: Math.round(v / 10 * 100) / 100 });
    const top = n(m.top), bottom = n(m.bottom), left = n(m.left), right = n(m.right);
    const size = el('select', {}, Object.entries(PAGE_SIZES).map(([k, s]) => el('option', { value: k, text: `${s.name} (${s.desc})` })));
    size.value = Doc.page.size;
    const orient = el('select', {}, [el('option', { value: 'portrait', text: 'Vertical' }), el('option', { value: 'landscape', text: 'Horizontal' })]);
    orient.value = Doc.page.orientation;
    this.modal({
      title: 'Configurar página', width: 460,
      body: el('div', {}, [
        el('div', { class: 'opt-section', text: 'Márgenes (cm)' }),
        el('div', { class: 'field-row' }, [el('div', { class: 'field' }, [el('label', { text: 'Superior' }), top]), el('div', { class: 'field' }, [el('label', { text: 'Inferior' }), bottom])]),
        el('div', { class: 'field-row' }, [el('div', { class: 'field' }, [el('label', { text: 'Izquierdo' }), left]), el('div', { class: 'field' }, [el('label', { text: 'Derecho' }), right])]),
        el('div', { class: 'opt-section', text: 'Papel' }),
        el('div', { class: 'field-row' }, [el('div', { class: 'field' }, [el('label', { text: 'Tamaño' }), size]), el('div', { class: 'field' }, [el('label', { text: 'Orientación' }), orient])]),
      ]),
      buttons: [{ label: 'Cancelar' }, {
        label: 'Aceptar', primary: true, action: () => {
          const v = (i) => clamp((parseFloat(i.value) || 0) * 10, 0, 100);
          const s = PAGE_SIZES[size.value];
          Object.assign(Doc.page, { size: size.value, width: s.width, height: s.height, orientation: orient.value });
          setMargins(null, { top: v(top), bottom: v(bottom), left: v(left), right: v(right) });
        },
      }],
    });
  },
  gotoDialog() {
    const input = el('input', { type: 'number', min: 1, max: Layout.pages, value: caretPage() });
    this.modal({
      title: 'Ir a la página', width: 320,
      body: el('div', { class: 'field' }, [el('label', { text: `Número de página (1 – ${Layout.pages})` }), input]),
      buttons: [{ label: 'Cancelar' }, { label: 'Ir', primary: true, action: () => this.gotoPage(+input.value) }],
      onOpen: () => input.select(),
    });
  },
  gotoPage(n) {
    n = clamp(n | 0, 1, Layout.pages);
    const y = n === 1 ? 0 : Layout.boundaries[n - 2].y;
    const d = docEl();
    const z = this.zoom / 100;
    const sc = $('#scroller');
    sc.scrollTop = d.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop + y * z - 60;
    const p = pointAtY(y + 4);
    if (p) { const r = document.createRange(); r.setStart(p.node, p.offset); r.collapse(true); selectRange(r); focusDoc(); }
  },
  zoomDialog() {
    let val = this.zoom;
    const opts = [200, 150, 100, 75, 50];
    const pct = el('input', { type: 'number', min: 25, max: 300, step: 5, value: this.zoom });
    const radios = el('div', { class: 'zoom-opts' }, [
      ...opts.map(z => el('label', { class: 'check' }, [el('input', { type: 'radio', name: 'zoom', value: z, checked: z === this.zoom, onchange: () => { val = z; pct.value = z; } }), `${z} %`])),
      el('label', { class: 'check' }, [el('input', { type: 'radio', name: 'zoom', value: 'width', onchange: () => { val = 'width'; } }), 'Ancho de página']),
      el('label', { class: 'check' }, [el('input', { type: 'radio', name: 'zoom', value: 'page', onchange: () => { val = 'page'; } }), 'Página completa']),
    ]);
    pct.addEventListener('input', () => { val = +pct.value; });
    this.modal({
      title: 'Zoom', width: 340,
      body: el('div', {}, [radios, el('div', { class: 'field', style: { marginTop: '10px' } }, [el('label', { text: 'Porcentaje' }), pct])]),
      buttons: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, action: () => (typeof val === 'string' ? this.zoomFit(val) : this.setZoom(val)) }],
    });
  },
  editHeaderFooter(id) {
    const n = document.getElementById(id);
    const sc = $('#scroller');
    if (id === 'doc-header') sc.scrollTop = 0;
    else n.scrollIntoView({ block: 'center' });
    n.focus();
    const r = document.createRange(); r.selectNodeContents(n); r.collapse(false);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    toast(id === 'doc-header' ? 'Escribe el encabezado. Se repetirá en todas las páginas al imprimir o exportar.' : 'Escribe el pie de página. Se repetirá en todas las páginas al imprimir o exportar.');
  },

  optionsDialog(section) {
    const s = Settings;
    const author = el('input', { type: 'text', value: s.author || '' });
    const theme = el('select', {}, [['light', 'Claro'], ['dark', 'Oscuro'], ['system', 'Usar el del sistema']].map(([v, t]) => el('option', { value: v, text: t })));
    theme.value = s.theme || 'light';
    const shortcuts = el('select', {}, [['es', 'Word en español (Ctrl+N negrita, Ctrl+G guardar…)'], ['en', 'Word en inglés (Ctrl+B negrita, Ctrl+S guardar…)']].map(([v, t]) => el('option', { value: v, text: t })));
    shortcuts.value = s.shortcuts === 'en' ? 'en' : 'es';
    const font = el('input', { type: 'text', value: s.fontFamily || 'Calibri', list: 'opt-fonts' });
    const fontList = el('datalist', { id: 'opt-fonts' }, this.fonts.map(f => el('option', { value: f })));
    const size = el('input', { type: 'number', step: 0.5, min: 6, max: 72, value: s.fontSize || 11 });
    const lh = el('select', {}, [['1', 'Sencillo'], ['1.15', '1,15'], ['1.5', '1,5'], ['2', 'Doble']].map(([v, t]) => el('option', { value: v, text: t })));
    lh.value = String(s.lineHeight || 1.15);
    const psize = el('select', {}, Object.entries(PAGE_SIZES).map(([k, p]) => el('option', { value: k, text: p.name })));
    psize.value = s.pageSize || 'A4';
    const margins = el('select', {}, Object.entries(MARGINS).map(([k, m]) => el('option', { value: k, text: m.name })));
    margins.value = s.margins || 'normal';
    const autosave = el('input', { type: 'checkbox', checked: s.autosave !== false });
    const spell = el('input', { type: 'checkbox', checked: s.spellcheck !== false });
    const accents = [['#1f1f1f', 'Grafito'], ['#2b5797', 'Azul'], ['#2f6f4f', 'Verde'], ['#8a3b3b', 'Burdeos'], ['#5b4a9e', 'Índigo']];
    let accent = s.accent || '#2b5797';
    const accentRow = el('div', { class: 'accent-row' }, accents.map(([c, n]) => el('button', {
      class: 'accent-sw' + (c === accent ? ' checked' : ''), title: n, style: { background: c },
      onclick: (e) => { accent = c; accentRow.querySelectorAll('.accent-sw').forEach(b => b.classList.toggle('checked', b === e.currentTarget)); },
    })));
    const favIds = Object.keys(CMDS).filter(id => !/^(style_|case[A-Z]|img|row|col|table|cell|merge|header[A-Z]|comment(Prev|Next|DeleteAll)|toc(Remove)|tellMe|fileMenu|toggleRibbon|unlink|printNow|zoom(In|Out))/.test(id) || /^style_h/.test(id));
    const favSet = new Set(s.favorites || []);
    const favList = el('div', { class: 'fav-list' }, favIds.map(id => el('label', {}, [
      el('input', { type: 'checkbox', checked: favSet.has(id), onchange: (e) => { if (e.target.checked) favSet.add(id); else favSet.delete(id); } }),
      el('span', { html: icon(CMDS[id].icon) }), el('span', { text: CMDS[id].label }),
    ])));
    const sec = (t) => el('div', { class: 'opt-section', text: t });
    const field = (l, inp) => el('div', { class: 'field' }, [el('label', { text: l }), inp]);
    const body = el('div', { class: 'options' }, [
      sec('General'),
      field('Tu nombre (aparece en comentarios y propiedades)', author),
      el('div', { class: 'field-row' }, [field('Tema', theme), el('div', { class: 'field' }, [el('label', { text: 'Color de acento' }), accentRow])]),
      field('Atajos de teclado', shortcuts),
      sec('Documentos nuevos'),
      el('div', { class: 'field-row' }, [field('Fuente', font), field('Tamaño', size), field('Interlineado', lh)]),
      el('div', { class: 'field-row' }, [field('Tamaño de página', psize), field('Márgenes', margins)]),
      fontList,
      sec('Guardar y revisar'),
      el('label', { class: 'check' }, [autosave, 'Autoguardado en documentos que ya tienen nombre']),
      el('label', { class: 'check' }, [spell, 'Revisar la ortografía mientras escribo']),
      el('div', { class: 'opt-section', id: 'opt-fav', text: 'Favoritos' }),
      el('p', { class: 'muted', text: 'Elige los comandos que aparecen en la pestaña Favoritos.' }),
      favList,
    ]);
    this.modal({
      title: 'Opciones', width: 640, body,
      buttons: [{ label: 'Cancelar' }, {
        label: 'Guardar', primary: true, action: async () => {
          const ordered = [...(s.favorites || []).filter(id => favSet.has(id)), ...[...favSet].filter(id => !(s.favorites || []).includes(id))];
          Settings = await api.setSettings({
            author: author.value.trim() || s.author, theme: theme.value, shortcuts: shortcuts.value, accent,
            fontFamily: font.value.trim() || 'Calibri', fontSize: +size.value || 11, lineHeight: +lh.value, pageSize: psize.value, margins: margins.value,
            autosave: autosave.checked, spellcheck: spell.checked, favorites: ordered,
          });
          this.applyTheme();
          applySpellcheck();
          $('#tb-user').textContent = initials(Settings.author);
          this.buildQat(); this.updateTitle(); this.renderRibbon();
        },
      }],
      onOpen: () => { if (section === 'fav') $('#opt-fav').scrollIntoView(); else author.focus(); },
    });
  },

  // ---------- estado ----------
  updateUndo() {
    $$('[data-cmd="undo"]').forEach(b => { b.disabled = !History.canUndo(); });
    $$('[data-cmd="redo"]').forEach(b => { b.disabled = !History.canRedo(); });
  },
  updateState(immediate) {
    if (!immediate) {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => { this._raf = null; this.updateState(true); });
      return;
    }
    const f = currentFormat();
    for (const b of $$('#ribbon [data-cmd], #qat [data-cmd]')) {
      const c = CMDS[b.dataset.cmd];
      if (!c) continue;
      if (c.state) b.classList.toggle('checked', !!c.state());
      if (c.enabled) b.disabled = !c.enabled();
    }
    for (const i of $$('#ribbon [data-check]')) {
      const c = CMDS[i.dataset.check];
      i.checked = c ? !!c.state?.() : !!Settings[i.dataset.check];
    }
    const fi = $('#font-input');
    if (fi && document.activeElement !== fi) fi.value = f.family;
    const si = $('#size-input');
    if (si && document.activeElement !== si) si.value = String(f.size).replace('.', ',');
    const sid = currentStyleId();
    $$('.style-tile').forEach(t => t.classList.toggle('checked', t.dataset.style === sid));
    const paraInputs = $$('#ribbon [data-para]'); // solo existen en la pestaña Disposición
    if (paraInputs.length && f.block) {
      const cs = getComputedStyle(f.block);
      for (const inp of paraInputs) {
        if (document.activeElement === inp) continue;
        const k = inp.dataset.para;
        const px = parseFloat(cs[k]) || 0;
        inp.value = (k === 'marginLeft' || k === 'marginRight') ? Math.round(px / MM / 10 * 100) / 100 : Math.round(px * 0.75);
      }
    }
    const inT = inTable();
    const tabT = $('#tabs [data-tab="table"]'), tabP = $('#tabs [data-tab="picture"]');
    if (tabT && tabT.hidden === inT) tabT.hidden = !inT;
    if (tabP && tabP.hidden === hasImage()) tabP.hidden = !hasImage();
    if ((this.tab === 'table' && !inT) || (this.tab === 'picture' && !hasImage())) { this.tab = 'home'; this.markTab(); this.renderRibbon(); return; }
    this.updateUndo();
    this.updateStatus();
    Ruler.update();
    api.docCtx({ inDocument: !!currentRange(), inTable: inT });
  },
  updateStatus: debounce(function () {
    const pages = Layout.pages || 1;
    $('#sb-page').textContent = `Página ${caretPage()} de ${pages}`;
    const total = countWords(docEl().innerText || '');
    const r = currentRange();
    const sel = r && !r.collapsed ? countWords(r.toString()) : 0;
    $('#sb-words').textContent = sel ? `${sel.toLocaleString('es')} de ${total.toLocaleString('es')} palabras` : `${total.toLocaleString('es')} ${total === 1 ? 'palabra' : 'palabras'}`;
  }, 150),
  updateLang() {
    const names = { es: 'Español', en: 'Inglés', pt: 'Portugués', fr: 'Francés', it: 'Italiano', de: 'Alemán' };
    const l = (Settings.spellLanguages || ['es-ES'])[0] || 'es-ES';
    $('#sb-lang').innerHTML = icon('proofing') + `<span>${names[l.slice(0, 2)] || l}</span>`;
  },

  // ---------- barra de estado ----------
  buildStatus() {
    $('#sb-page').addEventListener('click', () => this.gotoDialog());
    $('#sb-words').addEventListener('click', () => wordCountDialog());
    $('#sb-lang').addEventListener('click', (e) => this.menu(e.currentTarget, this.languageMenu()));
    $('#sb-focus').addEventListener('click', () => this.setView('focus'));
    $('#sb-read').addEventListener('click', () => this.setView('reading'));
    $('#sb-print').addEventListener('click', () => this.setView('print'));
    $('#zoom-out').addEventListener('click', () => this.setZoom(this.zoom - 10));
    $('#zoom-in').addEventListener('click', () => this.setZoom(this.zoom + 10));
    $('#zoom-slider').addEventListener('input', (e) => this.setZoom(+e.target.value));
    $('#zoom-label').addEventListener('click', () => this.zoomDialog());
    this.updateLang();
  },

  // ---------- buscar comandos ----------
  buildTellMe() {
    const input = $('#tell-me');
    const list = $('#tell-me-results');
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    let items = [], hl = 0;
    const paint = () => {
      list.innerHTML = '';
      items.forEach((c, i) => list.append(el('button', {
        class: 'menu-item' + (i === hl ? ' hl' : ''), onmousedown: (e) => e.preventDefault(),
        onclick: () => { exec1(c.id); },
      }, [el('span', { class: 'ic', html: icon(c.icon) }), el('span', { class: 'mi-text', text: c.label }), keyOf(c.id) ? el('span', { class: 'mi-key', text: keyOf(c.id) }) : null])));
      list.hidden = !items.length;
    };
    const exec1 = (id) => { input.value = ''; list.hidden = true; input.blur(); focusDoc(); run(id); };
    input.addEventListener('input', () => {
      const q = norm(input.value.trim());
      if (!q) { items = []; paint(); return; }
      const words = q.split(/\s+/);
      items = Object.values(CMDS).filter(c => !c.enabled || c.enabled())
        .map(c => ({ c, hay: norm(c.label + ' ' + (c.kw || '') + ' ' + c.id) }))
        .filter(x => words.every(w => x.hay.includes(w)))
        .sort((a, b) => (norm(a.c.label).startsWith(q) ? 0 : 1) - (norm(b.c.label).startsWith(q) ? 0 : 1))
        .slice(0, 9).map(x => x.c);
      hl = 0; paint();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); hl = Math.min(items.length - 1, hl + 1); paint(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); hl = Math.max(0, hl - 1); paint(); }
      if (e.key === 'Enter' && items[hl]) { e.preventDefault(); exec1(items[hl].id); }
      if (e.key === 'Escape') { input.value = ''; list.hidden = true; focusDoc(); }
    });
    input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 150));
  },

  // ---------- fuentes del sistema ----------
  async loadFonts() {
    try {
      if (window.queryLocalFonts) {
        const fonts = await window.queryLocalFonts();
        const fams = [...new Set(fonts.map(f => f.family))].filter(f => !/^(@|Marlett|MT Extra|Symbol|Webdings|Wingdings|HoloLens|Segoe MDL2|Segoe Fluent|Segoe UI Emoji|Segoe UI Symbol)/.test(f));
        if (fams.length > 5) this.fonts = fams.sort((a, b) => a.localeCompare(b, 'es'));
      }
    } catch { /* se usa la lista básica */ }
  },

  // ---------- regla, zoom, vistas y paneles ----------
  renderRuler() { Ruler.render(); },
  // zoom cómodo para leer según el tamaño de la pantalla (la hoja ocupa ~3/4 del ancho)
  comfortZoom() {
    const sc = $('#scroller');
    const pagePx = pageDims().w * MM;
    const z = (sc.clientWidth - 120) * 0.75 / pagePx * 100;
    return clamp(Math.round(z / 10) * 10, 100, 160);
  },
  saveZoom: debounce((z) => api.setSettings({ zoom: z }).then(s => { Settings = s; }), 800),
  setZoom(z, { save = true } = {}) {
    this.zoom = clamp(Math.round(z), 25, 300);
    if (save) this.saveZoom(this.zoom);
    $('#sheet').style.setProperty('--zoom', this.zoom / 100);
    $('#zoom-slider').value = this.zoom;
    $('#zoom-label').textContent = this.zoom + ' %';
    Ruler.render();
    Images.reposition();
    scheduleLayout();
  },
  zoomFit(mode) {
    const sc = $('#scroller');
    const { w, h } = pageDims();
    const wpx = w * MM, hpx = h * MM;
    const zw = (sc.clientWidth - 64) / wpx * 100;
    const zh = (sc.clientHeight - 70) / hpx * 100;
    this.setZoom(mode === 'page' ? Math.min(zw, zh) : zw);
  },
  isDark() {
    return Settings.theme === 'dark' || (Settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  },
  // Cambia de tema con una onda que se expande desde el interruptor
  toggleTheme() {
    const sw = $('#theme-switch');
    const r = sw.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const next = this.isDark() ? 'light' : 'dark';
    const apply = () => { Settings.theme = next; this.applyTheme(); this.updateState(true); };
    const save = () => api.setSettings({ theme: next }).then(s => { Settings = s; });
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) { apply(); save(); return; }
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const t = document.startViewTransition(apply);
    t.ready.then(() => {
      // velocidad constante, como una ola en el agua: sin frenazo al final
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 600, easing: 'linear', pseudoElement: '::view-transition-new(root)' },
      );
      // los botones nativos de la ventana están junto al interruptor: cambian al empezar
      save();
    }, save);
  },
  applyTheme() {
    const sw = $('#theme-switch');
    if (sw) sw.setAttribute('aria-checked', String(this.isDark()));
    document.body.classList.toggle('dark', this.isDark());
    const a = Settings.accent || '#2b5797';
    const root = document.documentElement.style;
    root.setProperty('--accent', a);
    root.setProperty('--accent-dark', shade(a, -0.2));
    root.setProperty('--accent-soft', this.isDark() ? shade(a, -0.55) : shade(a, 0.88));
    root.setProperty('--checked', this.isDark() ? shade(a, -0.45) : shade(a, 0.82));
  },
  setView(v) {
    if (this.view === v && v !== 'print') v = 'print';
    this.view = v;
    document.body.classList.toggle('reading', v === 'reading');
    document.body.classList.toggle('focus-mode', v === 'focus');
    $('#sb-read').classList.toggle('active', v === 'reading');
    $('#sb-focus').classList.toggle('active', v === 'focus');
    $('#sb-print').classList.toggle('active', v === 'print');
    $('.focus-exit')?.remove();
    if (v !== 'print') {
      document.body.append(el('button', { class: 'pbtn focus-exit', text: v === 'reading' ? 'Salir del modo de lectura (Esc)' : 'Salir del modo enfoque (Esc)', onclick: () => this.setView('print') }));
    }
    setTimeout(() => { Ruler.render(); Images.reposition(); scheduleLayout(); }, 30);
    this.updateState();
  },
  async toggleRuler() {
    Settings = await api.setSettings({ showRuler: Settings.showRuler === false });
    document.body.classList.toggle('no-ruler', Settings.showRuler === false);
    this.updateState();
  },
  showPane(id, show) {
    const p = document.getElementById(id);
    const next = show === undefined ? p.hidden : show;
    p.hidden = !next;
    if (id === 'navpane') { api.setSettings({ showNav: next }).then(s => { Settings = s; }); if (next) Nav.render(); }
    if (id === 'commentpane' && next) Comments.render();
    setTimeout(() => Images.reposition(), 20);
    this.updateState();
  },
};

// Punto de texto más cercano a una posición vertical del documento (en px sin zoom)
function pointAtY(y) {
  const d = docEl();
  const dr = d.getBoundingClientRect();
  const z = UI.zoom / 100;
  for (const b of d.querySelectorAll(BLOCK_SEL)) {
    const r = b.getBoundingClientRect();
    if ((r.bottom - dr.top) / z >= y) {
      const walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
      const t = walker.nextNode();
      return t ? { node: t, offset: 0 } : { node: b, offset: 0 };
    }
  }
  return null;
}

// Comandos de la cinta que solo abren menús
cmd('docFonts', { label: 'Fuentes', icon: 'font', run: () => {} });
cmd('docSpacing', { label: 'Espaciado', icon: 'lineSpacing', run: () => {} });
cmd('breaks', { label: 'Saltos', icon: 'pageBreak', run: () => {} });
cmd('language', { label: 'Idioma', icon: 'globe', run: () => {} });
cmd('tableDeleteMenu', { label: 'Eliminar', icon: 'tableDel', run: () => {}, enabled: inTable });
cmd('imgSize', { label: 'Tamaño', icon: 'size', run: () => {}, enabled: hasImage });
cmd('customizeFav', { label: 'Personalizar favoritos', icon: 'star', run: () => UI.optionsDialog('fav') });
cmd('dictAutoPolish', {
  label: 'Ordenar automáticamente al terminar de dictar', icon: 'sparkle',
  run: async () => { Settings = await api.setSettings({ dictAutoPolish: !Settings.dictAutoPolish }); }, state: () => !!Settings.dictAutoPolish,
});

function applySpellcheck() {
  const on = Settings.spellcheck !== false;
  docEl().spellcheck = on;
  $('#doc-header').spellcheck = on;
  $('#doc-footer').spellcheck = on;
  api.spellEnable(on);
}
