// Menú Archivo: inicio, abrir, información, guardar, imprimir, exportar y acerca de
'use strict';

const Backstage = {
  page: 'home',
  open(page = 'home') {
    UI.closePopup();
    Find.clear();
    const bs = $('#backstage');
    bs.hidden = false;
    this.page = page;
    this.render();
  },
  close() {
    $('#backstage').hidden = true;
    $('#backstage').innerHTML = '';
    focusDoc();
  },
  isOpen() { return !$('#backstage').hidden; },

  render() {
    const bs = $('#backstage');
    bs.innerHTML = '';
    const item = (id, label, ic, fn) => el('button', {
      class: 'bs-item' + (this.page === id ? ' active' : ''), html: icon(ic) + `<span>${label}</span>`,
      onclick: fn || (() => { this.page = id; this.render(); }),
    });
    const nav = el('nav', { class: 'bs-nav' }, [
      el('button', { class: 'bs-back', title: 'Volver al documento (Esc)', html: icon('arrowLeft') + '<span>Volver</span>', onclick: () => this.close() }),
      item('home', 'Inicio', 'home'),
      item('open', 'Abrir', 'open'),
      item('info', 'Información', 'info'),
      el('div', { class: 'bs-sep' }),
      item('save', 'Guardar', 'save', async () => { this.close(); await Files.save(); }),
      item('saveas', 'Guardar como', 'save'),
      item('print', 'Imprimir', 'print'),
      item('export', 'Exportar', 'export'),
      el('div', { class: 'bs-sep' }),
      item('close', 'Cerrar', 'close', () => { this.close(); window.close(); }),
      el('div', { class: 'bs-bottom' }, [item('about', 'Acerca de', 'info'), item('options', 'Opciones', 'settings', () => { this.close(); UI.optionsDialog(); })]),
    ]);
    const main = el('div', { class: 'bs-main' });
    bs.append(nav, main);
    const fn = this['page_' + this.page];
    if (fn) fn.call(this, main);
  },

  async page_home(main) {
    const hour = new Date().getHours();
    const hello = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
    main.append(el('h1', { text: `${hello}, ${Settings.author.split(' ')[0]}` }));
    main.append(el('h2', { text: 'Nuevo' }));
    main.append(this.templates());
    main.append(el('h2', { text: 'Recientes' }));
    main.append(await this.recentList(8));
  },
  templates() {
    const thumb = (k) => {
      const t = el('div', { class: 'tpl-thumb tpl-' + k });
      const L = (cls = '') => el('div', { class: 'l ' + cls });
      if (k === 'blank') { /* vacío */ } else if (k === 'letter') { t.append(L('s right'), el('div', { class: 'gap' }), L('s'), L('s'), el('div', { class: 'gap' }), L(), L(), L('m'), L(), L('m'), el('div', { class: 'gap' }), L('s')); }
      else if (k === 'cv') { t.append(el('div', { class: 't big' }), L('s'), el('div', { class: 'hr' }), el('div', { class: 't sm' }), L(), L('m'), el('div', { class: 't sm' }), L(), L('m'), L('s')); }
      else if (k === 'report') { t.append(el('div', { class: 'band' }), el('div', { class: 'spacer' }), el('div', { class: 't big' }), L('m'), L('s')); }
      else if (k === 'essay') { t.append(el('div', { class: 'spacer' }), L('s center'), L('s center'), L('s center'), L('s center')); }
      else if (k === 'notes') { t.append(el('div', { class: 't big' }), L('s'), el('div', { class: 't sm' }), L('m dot'), L('m dot'), el('div', { class: 'grid' })); }
      return t;
    };
    return el('div', { class: 'tpl-row' }, Object.entries(TEMPLATES).map(([k, t]) => el('button', {
      class: 'tpl', onclick: () => { this.close(); Files.newDoc(k); },
    }, [thumb(k), el('div', { class: 'tpl-name', text: t.name })])));
  },
  async recentList(limit) {
    const list = await api.recentList();
    if (!list.length) return el('div', { class: 'empty-note', text: 'Todavía no has abierto documentos. Los que abras o guardes aparecerán aquí.' });
    const ext = (n) => (n.split('.').pop() || '').toLowerCase();
    const ic = (n) => ({ docx: 'word', pdf: 'pdf' }[ext(n)] || 'doc');
    const table = el('div', { class: 'recent-list' }, list.slice(0, limit || 20).map(r => el('button', {
      class: 'recent-row', onclick: () => { this.close(); Files.openPath(r.path); },
    }, [
      el('span', { class: 'r-ic', html: icon(ic(r.name)) }),
      el('span', { class: 'r-name' }, [el('span', { class: 'fname', text: r.name }), el('span', { class: 'fpath', text: r.path.replace(/[\\/][^\\/]+$/, '') })]),
      el('span', { class: 'r-date', text: relativeTime(r.date) }),
    ])));
    return table;
  },
  async page_open(main) {
    main.append(el('h1', { text: 'Abrir' }));
    main.append(el('div', { class: 'bs-actions' }, [
      el('button', { class: 'bs-action', onclick: () => { this.close(); Files.openDialog(); } }, [el('span', { html: icon('open') }), el('div', {}, [el('b', { text: 'Examinar…' }), el('span', { text: 'Documentos de Write It (.wit), Word (.docx), páginas web, texto y Markdown' })])]),
    ]));
    main.append(el('h2', { text: 'Recientes' }));
    main.append(await this.recentList(20));
    main.append(el('button', { class: 'link-btn', text: 'Borrar la lista de recientes', onclick: async () => { await api.recentClear(); this.render(); } }));
  },
  page_info(main) {
    const s = docStats();
    main.append(el('h1', { text: 'Información' }));
    const title = el('input', { type: 'text', value: Doc.meta.title || '', placeholder: 'Agregar un título' });
    const author = el('input', { type: 'text', value: Doc.meta.author || Settings.author });
    const subject = el('input', { type: 'text', value: Doc.meta.subject || '', placeholder: 'Agregar un asunto' });
    const keywords = el('input', { type: 'text', value: Doc.meta.keywords || '', placeholder: 'Agregar palabras clave' });
    const bind = (inp, key) => inp.addEventListener('change', () => { Doc.meta[key] = inp.value.trim(); Files.markDirty(); });
    bind(title, 'title'); bind(author, 'author'); bind(subject, 'subject'); bind(keywords, 'keywords');
    const fmtName = { wit: 'Documento de Write It', docx: 'Documento de Word', html: 'Página web', htm: 'Página web', txt: 'Texto sin formato', md: 'Markdown' }[Doc.format] || Doc.format;
    main.append(el('div', { class: 'info-cols' }, [
      el('div', { class: 'info-props' }, [
        el('h2', { text: 'Propiedades' }),
        el('div', { class: 'info-grid' }, [
          el('div', { text: 'Título' }), title,
          el('div', { text: 'Autor' }), author,
          el('div', { text: 'Asunto' }), subject,
          el('div', { text: 'Palabras clave' }), keywords,
        ]),
      ]),
      el('div', { class: 'info-stats' }, [
        el('h2', { text: 'Documento' }),
        el('div', { class: 'info-grid ro' }, [
          el('div', { text: 'Ubicación' }), el('div', { class: 'sel', text: Doc.path || 'Todavía no se ha guardado' }),
          el('div', { text: 'Formato' }), el('div', { text: fmtName }),
          el('div', { text: 'Páginas' }), el('div', { text: String(s.pages) }),
          el('div', { text: 'Palabras' }), el('div', { text: s.words.toLocaleString('es') }),
          el('div', { text: 'Caracteres' }), el('div', { text: s.chars.toLocaleString('es') }),
          el('div', { text: 'Creado' }), el('div', { text: Doc.meta.created ? formatDate(new Date(Doc.meta.created), 'datetime') : '—' }),
          el('div', { text: 'Modificado' }), el('div', { text: Doc.meta.modified ? formatDate(new Date(Doc.meta.modified), 'datetime') : '—' }),
        ]),
      ]),
    ]));
  },
  page_saveas(main) {
    main.append(el('h1', { text: 'Guardar como' }));
    const act = (ic, t, d, fn) => el('button', { class: 'bs-action', onclick: async () => { this.close(); await fn(); } }, [el('span', { html: icon(ic) }), el('div', {}, [el('b', { text: t }), el('span', { text: d })])]);
    main.append(el('div', { class: 'bs-actions' }, [
      act('doc', 'Documento de Write It (.wit)', 'Conserva todo: comentarios, notas, marca de agua y diseño.', () => Files.save({ saveAs: true, preferExt: 'wit' })),
      act('word', 'Documento de Word (.docx)', 'Para abrirlo en Microsoft Word, Google Docs o LibreOffice.', () => Files.save({ saveAs: true, preferExt: 'docx' })),
      act('pdf', 'PDF', 'Para compartir o imprimir con el mismo aspecto en cualquier equipo.', () => Files.exportPdf()),
      act('globe', 'Página web (.html)', 'Para publicarlo o verlo en un navegador.', () => Files.save({ saveAs: true, preferExt: 'html' })),
      act('textDir', 'Texto sin formato (.txt)', 'Solo el texto, sin formato.', () => Files.save({ saveAs: true, preferExt: 'txt' })),
    ]));
  },
  page_export(main) {
    main.append(el('h1', { text: 'Exportar' }));
    const act = (ic, t, d, fn) => el('button', { class: 'bs-action', onclick: async () => { this.close(); await fn(); } }, [el('span', { html: icon(ic) }), el('div', {}, [el('b', { text: t }), el('span', { text: d })])]);
    main.append(el('div', { class: 'bs-actions' }, [
      act('pdf', 'Crear un PDF', 'Se abrirá automáticamente al terminar.', () => Files.exportPdf()),
      act('word', 'Documento de Word', 'Compatible con Microsoft Word.', () => Files.save({ saveAs: true, preferExt: 'docx' })),
      act('globe', 'Página web', 'Un archivo .html con el mismo formato.', () => Files.save({ saveAs: true, preferExt: 'html' })),
    ]));
  },
  async page_print(main) {
    main.append(el('h1', { text: 'Imprimir' }));
    const preview = el('div', { class: 'print-preview' }, [el('div', { class: 'muted', text: 'Preparando la vista previa…' })]);
    const pn = Doc.pageNumbers;
    main.append(el('div', { class: 'print-layout' }, [
      el('div', { class: 'print-side' }, [
        el('button', { class: 'big-print', onclick: async () => { await Files.print(); } }, [el('span', { html: icon('print') }), el('span', { text: 'Imprimir' })]),
        el('div', { class: 'print-facts' }, [
          el('div', {}, [el('b', { text: 'Páginas' }), el('span', { text: `${Layout.pages} (aprox.)` })]),
          el('div', {}, [el('b', { text: 'Papel' }), el('span', { text: `${PAGE_SIZES[Doc.page.size]?.name || 'Personalizado'}, ${Doc.page.orientation === 'portrait' ? 'vertical' : 'horizontal'}` })]),
          el('div', {}, [el('b', { text: 'Márgenes' }), el('span', { text: MARGINS[Doc.page.marginsPreset]?.name || 'Personalizados' })]),
          el('div', {}, [el('b', { text: 'Números de página' }), el('span', { text: pn ? 'Sí' : 'No' })]),
        ]),
        el('button', { class: 'pbtn', text: 'Configurar página…', onclick: () => { UI.pageSetupDialog(); } }),
        el('button', { class: 'pbtn', text: 'Exportar a PDF', onclick: () => { this.close(); Files.exportPdf(); } }),
      ]),
      preview,
    ]));
    try {
      Images.deselect();
      const url = await api.printPreview();
      if (this.page !== 'print' || !this.isOpen()) return;
      preview.innerHTML = '';
      preview.append(el('iframe', { src: url + '#toolbar=0&navpanes=0&view=Fit', title: 'Vista previa de impresión' }));
    } catch (err) {
      preview.innerHTML = '';
      preview.append(el('div', { class: 'muted', text: 'No se pudo generar la vista previa. ' + err.message }));
    }
  },
  async page_about(main) {
    const info = AppInfo;
    main.append(el('div', { class: 'about' }, [
      el('div', { class: 'about-logo' }, [el('span', { text: 'W' })]),
      el('h1', { text: 'Write It' }),
      el('p', { class: 'muted', text: `Versión ${info.version} · Electron ${info.electron} · Chromium ${info.chrome}` }),
      el('p', { text: 'Un procesador de textos hecho a medida para Fabrizzio. Abre y guarda documentos de Word, exporta a PDF, tiene dictado por voz y una IA local opcional que ordena tus textos sin cambiar tu forma de escribir.' }),
      el('p', { text: 'Software libre bajo licencia MIT. Iconos Fluent UI de Microsoft (MIT). Dictado con Whisper de OpenAI (MIT) mediante Transformers.js; IA local con llama.cpp (MIT) y modelos Qwen2.5 (Apache 2.0).' }),
      el('h2', { text: 'Atajos de teclado más usados' }),
      el('div', { class: 'keys' }, [
        ['bold', 'Negrita'], ['italic', 'Cursiva'], ['underline', 'Subrayado'], ['save', 'Guardar'], ['open', 'Abrir'], ['new', 'Nuevo'],
        ['find', 'Buscar'], ['findReplace', 'Reemplazar'], ['selectAll', 'Seleccionar todo'], ['alignCenter', 'Centrar'], ['alignJustify', 'Justificar'],
        ['undo', 'Deshacer'], ['redo', 'Rehacer'], ['pageBreak', 'Salto de página'], ['print', 'Imprimir'], ['dictate', 'Dictar'], ['aiPolish', 'Ordenar texto con IA'],
      ].map(([id, l]) => el('div', { class: 'key-row' }, [el('span', { text: l }), el('kbd', { text: keyOf(id) })]))),
    ]));
  },
};
