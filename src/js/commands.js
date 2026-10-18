// Registro de comandos y atajos de teclado
'use strict';

const CMDS = {};
function cmd(id, def) { CMDS[id] = { id, ...def }; }

function run(id, arg) {
  const c = CMDS[id];
  if (!c) return;
  if (c.enabled && !c.enabled()) return;
  try { c.run(arg); } catch (err) { console.error(err); toast('Algo salió mal: ' + err.message); }
  UI.updateState();
}

const inTable = () => !!Tables.cell();
const hasImage = () => !!Images.selected;

// ---------- archivo ----------
cmd('new', { label: 'Nuevo documento', icon: 'new', run: () => Files.newDoc() });
cmd('open', { label: 'Abrir…', icon: 'open', run: () => Files.openDialog() });
cmd('save', { label: 'Guardar', icon: 'save', run: () => Files.save() });
cmd('saveAs', { label: 'Guardar como…', icon: 'save', run: () => Files.save({ saveAs: true }) });
cmd('saveDocx', { label: 'Guardar como documento de Word', icon: 'word', kw: 'docx word exportar', run: () => Files.save({ saveAs: true, preferExt: 'docx' }) });
cmd('exportPdf', { label: 'Exportar a PDF', icon: 'pdf', kw: 'pdf exportar', run: () => Files.exportPdf() });
cmd('print', { label: 'Imprimir…', icon: 'print', run: () => Backstage.open('print') });
cmd('printNow', { label: 'Imprimir', icon: 'print', run: () => Files.print() });
cmd('close', { label: 'Cerrar documento', icon: 'close', run: () => window.close() });
cmd('fileMenu', { label: 'Archivo', icon: 'doc', run: () => Backstage.open('home') });
cmd('newWindow', { label: 'Nueva ventana', icon: 'template', run: () => api.newWindow({}) });
cmd('options', { label: 'Opciones', icon: 'settings', kw: 'preferencias configuración ajustes', run: () => UI.optionsDialog() });

// ---------- edición ----------
cmd('undo', { label: 'Deshacer', icon: 'undo', run: () => History.undo(), enabled: () => History.canUndo() });
cmd('redo', { label: 'Rehacer', icon: 'redo', run: () => History.redo(), enabled: () => History.canRedo() });
cmd('cut', { label: 'Cortar', icon: 'cut', run: () => { focusDoc(); api.clipboard('cut'); } });
cmd('copy', { label: 'Copiar', icon: 'copy', run: () => { focusDoc(); api.clipboard('copy'); } });
cmd('paste', { label: 'Pegar', icon: 'paste', run: () => { focusDoc(); api.clipboard('paste'); } });
cmd('pasteText', { label: 'Pegar solo texto', icon: 'paste', run: () => { focusDoc(); api.clipboard('pasteText'); } });
cmd('selectAll', { label: 'Seleccionar todo', icon: 'selectAll', run: () => { focusDoc(); const r = document.createRange(); r.selectNodeContents(docEl()); selectRange(r); } });
cmd('find', { label: 'Buscar', icon: 'search', run: () => Find.open(false) });
cmd('findReplace', { label: 'Reemplazar', icon: 'replace', kw: 'buscar sustituir', run: () => Find.open(true) });
cmd('painter', { label: 'Copiar formato', icon: 'painter', kw: 'brocha', run: () => (Painter.fmt ? Painter.stop() : Painter.start(false)), state: () => !!Painter.fmt });
cmd('goto', { label: 'Ir a la página…', icon: 'doc', run: () => UI.gotoDialog() });

// ---------- fuente ----------
const toggleCmd = (id, label, icon, execName, kw) => cmd(id, {
  label, icon, kw, run: () => edit(() => exec(execName)), state: () => queryState(execName),
});
toggleCmd('bold', 'Negrita', 'bold', 'bold');
toggleCmd('italic', 'Cursiva', 'italic', 'italic');
toggleCmd('underline', 'Subrayado', 'underline', 'underline');
toggleCmd('strike', 'Tachado', 'strike', 'strikeThrough');
toggleCmd('sub', 'Subíndice', 'sub', 'subscript');
toggleCmd('sup', 'Superíndice', 'sup', 'superscript');
cmd('grow', { label: 'Aumentar tamaño de fuente', icon: 'grow', run: () => growFont(1) });
cmd('shrink', { label: 'Disminuir tamaño de fuente', icon: 'grow', run: () => growFont(-1) });
cmd('clearFormat', { label: 'Borrar todo el formato', icon: 'clear', run: () => clearFormatting() });
cmd('fontColor', { label: 'Color de fuente', icon: 'color', run: (c) => edit(() => exec('foreColor', c || UI.lastColor.font, true)) });
cmd('highlight', { label: 'Resaltar texto', icon: 'highlight', kw: 'marcador fosforito', run: (c) => edit(() => exec('hiliteColor', c === undefined ? UI.lastColor.highlight : (c || 'transparent'), true)) });
cmd('caseUpper', { label: 'MAYÚSCULAS', icon: 'upper', run: () => transformSelectedText(CASES.upper) });
cmd('caseLower', { label: 'minúsculas', icon: 'lower', run: () => transformSelectedText(CASES.lower) });
cmd('caseTitle', { label: 'Poner En Mayúsculas Cada Palabra', icon: 'title', run: () => transformSelectedText(CASES.title) });
cmd('caseSentence', { label: 'Tipo oración.', icon: 'case', run: () => transformSelectedText(CASES.sentence) });
cmd('caseToggle', { label: 'tIPO iNVERSO', icon: 'case', run: () => transformSelectedText(CASES.toggle) });
cmd('caseCycle', {
  label: 'Cambiar mayúsculas y minúsculas', icon: 'case', run: () => {
    const r = currentRange(); if (!r || r.collapsed) { toast('Selecciona el texto primero'); return; }
    const t = r.toString();
    transformSelectedText(t === t.toLocaleUpperCase('es') ? CASES.lower : t === t.toLocaleLowerCase('es') ? CASES.title : CASES.upper);
  },
});

// ---------- párrafo ----------
cmd('bullets', { label: 'Viñetas', icon: 'bullets', kw: 'lista', run: (st) => toggleList('ul', st), state: () => queryState('insertUnorderedList') });
cmd('numbers', { label: 'Numeración', icon: 'numbers', kw: 'lista numerada', run: (st) => toggleList('ol', st), state: () => queryState('insertOrderedList') });
cmd('indent', { label: 'Aumentar sangría', icon: 'indent', run: () => changeIndent(1) });
cmd('outdent', { label: 'Disminuir sangría', icon: 'outdent', run: () => changeIndent(-1) });
const alignCmd = (id, label, icon, a) => cmd(id, {
  label, icon, run: () => setAlign(a),
  state: () => { const al = currentFormat().align; return a === 'left' ? (al === 'left' || al === 'start') : al === a; },
});
alignCmd('alignLeft', 'Alinear a la izquierda', 'alignLeft', 'left');
alignCmd('alignCenter', 'Centrar', 'alignCenter', 'center');
alignCmd('alignRight', 'Alinear a la derecha', 'alignRight', 'right');
alignCmd('alignJustify', 'Justificar', 'alignJustify', 'justify');
cmd('lineSpacing', { label: 'Interlineado', icon: 'lineSpacing', run: (v) => setBlockStyle({ lineHeight: String(v || 1.15) }) });
cmd('shading', { label: 'Sombreado del párrafo', icon: 'shading', run: (c) => setBlockStyle({ backgroundColor: c || '' }) });
cmd('showMarks', { label: 'Mostrar marcas de párrafo', icon: 'paragraph', kw: '¶ símbolos ocultos', run: () => docEl().classList.toggle('show-marks'), state: () => docEl().classList.contains('show-marks') });
cmd('paragraphDialog', { label: 'Fuente y párrafo…', icon: 'paragraph', kw: 'sangría espaciado', run: () => paragraphDialog() });
for (const [id, s] of Object.entries(STYLES)) {
  cmd('style_' + id, { label: 'Estilo ' + s.name, icon: id === 'h1' || id === 'title' ? 'h1' : id === 'h2' ? 'h2' : id === 'h3' ? 'h3' : id === 'quote' || id === 'intense' ? 'quote' : id === 'code' ? 'code' : 'paragraph', kw: 'estilo', run: () => applyStyle(id), state: () => currentStyleId() === id });
}

// ---------- insertar ----------
cmd('cover', { label: 'Portada', icon: 'cover', run: () => insertCover() });
cmd('blankPage', { label: 'Página en blanco', icon: 'new', run: () => insertBlankPage() });
cmd('pageBreak', { label: 'Salto de página', icon: 'pageBreak', run: () => insertPageBreak() });
cmd('columnBreak', { label: 'Salto de columna', icon: 'col2', run: () => insertColumnBreak() });
cmd('insertTable', { label: 'Tabla', icon: 'table', run: () => Tables.dialog() });
cmd('insertImage', { label: 'Imagen', icon: 'image', kw: 'foto picture', run: () => Images.pick() });
cmd('link', { label: 'Vínculo', icon: 'link', kw: 'hipervínculo enlace url', run: () => Links.dialog() });
cmd('unlink', { label: 'Quitar vínculo', icon: 'unlink', run: () => Links.unlink() });
cmd('header', { label: 'Encabezado', icon: 'header', run: () => UI.editHeaderFooter('doc-header') });
cmd('footer', { label: 'Pie de página', icon: 'footer', run: () => UI.editHeaderFooter('doc-footer') });
cmd('pageNumber', { label: 'Número de página', icon: 'pageNumber', run: (pn) => { Doc.pageNumbers = pn === undefined ? { where: 'footer', align: 'center', format: 'n' } : pn; docChanged(); } });
cmd('dateTime', { label: 'Fecha y hora', icon: 'date', run: () => dateDialog() });
cmd('hr', { label: 'Línea horizontal', icon: 'hr', run: () => insertHr() });
cmd('symbol', { label: 'Símbolo', icon: 'symbol', kw: 'emoji carácter especial', run: (s) => insertText(s || '©') });

// ---------- diseño y disposición ----------
cmd('watermark', { label: 'Marca de agua', icon: 'watermark', run: (t) => { Doc.watermark = t || ''; docChanged(); } });
cmd('pageColor', { label: 'Color de página', icon: 'pageColor', run: (c) => { Doc.pageColor = c || ''; docChanged(); } });
cmd('margins', { label: 'Márgenes', icon: 'margins', run: (k) => setMargins(k || 'normal') });
cmd('orientation', { label: 'Orientación', icon: 'landscape', kw: 'horizontal vertical', run: (o) => setOrientation(o || (Doc.page.orientation === 'portrait' ? 'landscape' : 'portrait')) });
cmd('pageSize', { label: 'Tamaño', icon: 'size', kw: 'a4 carta oficio papel', run: (k) => setPageSize(k || 'A4') });
cmd('columns', { label: 'Columnas', icon: 'col2', run: (n) => setColumns(n || 1) });
cmd('pageSetup', { label: 'Configurar página…', icon: 'margins', run: () => UI.pageSetupDialog() });

// ---------- referencias ----------
cmd('toc', { label: 'Tabla de contenido', icon: 'toc', kw: 'índice', run: () => Toc.insert() });
cmd('tocUpdate', { label: 'Actualizar tabla', icon: 'history', run: () => Toc.update() });
cmd('tocRemove', { label: 'Quitar tabla de contenido', icon: 'delete', run: () => Toc.remove() });
cmd('footnote', { label: 'Insertar nota al final', icon: 'footnote', kw: 'nota pie cita referencia', run: () => Notes.insert() });

// ---------- revisar ----------
cmd('spelling', {
  label: 'Revisar ortografía', icon: 'proofing', kw: 'corrector', run: async () => {
    Settings = await api.setSettings({ spellcheck: !Settings.spellcheck });
    applySpellcheck();
    toast(Settings.spellcheck ? 'Revisión ortográfica activada. Haz clic derecho sobre una palabra subrayada para ver sugerencias.' : 'Revisión ortográfica desactivada');
  }, state: () => Settings.spellcheck !== false,
});
cmd('wordCount', { label: 'Contar palabras', icon: 'wordCount', kw: 'estadísticas caracteres', run: () => wordCountDialog() });
cmd('speak', { label: 'Leer en voz alta', icon: 'speak', run: () => Speech.toggle(), state: () => Speech.speaking });
cmd('commentAdd', { label: 'Nuevo comentario', icon: 'commentAdd', run: () => Comments.add() });
cmd('commentDelete', { label: 'Eliminar comentario', icon: 'commentDel', run: () => Comments.remove() });
cmd('commentDeleteAll', { label: 'Eliminar todos los comentarios', icon: 'commentDel', run: () => Comments.removeAll() });
cmd('commentPrev', { label: 'Comentario anterior', icon: 'chevronUp', run: () => Comments.step(-1) });
cmd('commentNext', { label: 'Comentario siguiente', icon: 'chevronDown', run: () => Comments.step(1) });
cmd('commentsPane', { label: 'Mostrar comentarios', icon: 'comments', run: () => UI.showPane('commentpane'), state: () => !$('#commentpane').hidden });

// ---------- vista ----------
cmd('readMode', { label: 'Modo de lectura', icon: 'read', run: () => UI.setView('reading'), state: () => UI.view === 'reading' });
cmd('printLayout', { label: 'Diseño de impresión', icon: 'doc', run: () => UI.setView('print'), state: () => UI.view === 'print' });
cmd('focusMode', { label: 'Modo enfoque', icon: 'focus', kw: 'concentración sin distracciones', run: () => UI.setView('focus'), state: () => UI.view === 'focus' });
cmd('ruler', { label: 'Regla', icon: 'ruler', run: () => UI.toggleRuler(), state: () => Settings.showRuler !== false });
cmd('navPane', { label: 'Panel de navegación', icon: 'nav', kw: 'esquema títulos', run: () => UI.showPane('navpane'), state: () => !$('#navpane').hidden });
cmd('zoomIn', { label: 'Acercar', icon: 'zoomIn', run: () => UI.setZoom(UI.zoom + 10) });
cmd('zoomOut', { label: 'Alejar', icon: 'zoomOut', run: () => UI.setZoom(UI.zoom - 10) });
cmd('zoom100', { label: '100 %', icon: 'zoomFit', run: () => UI.setZoom(100) });
cmd('zoomPage', { label: 'Una página', icon: 'pageFit', run: () => UI.zoomFit('page') });
cmd('zoomWidth', { label: 'Ancho de página', icon: 'width', run: () => UI.zoomFit('width') });
cmd('zoomDialog', { label: 'Zoom…', icon: 'zoomIn', run: () => UI.zoomDialog() });
cmd('darkMode', {
  label: 'Tema oscuro', icon: 'dark', kw: 'modo noche', run: async () => {
    Settings = await api.setSettings({ theme: UI.isDark() ? 'light' : 'dark' });
    UI.applyTheme();
  }, state: () => UI.isDark(),
});
cmd('fullscreen', { label: 'Pantalla completa', icon: 'fullscreen', run: () => api.toggleFullscreen() });
cmd('toggleRibbon', { label: 'Mostrar u ocultar la cinta', icon: 'chevronUp', run: () => UI.toggleRibbon() });
cmd('tellMe', { label: 'Buscar comandos', icon: 'search', run: () => $('#tell-me').focus() });

// ---------- tabla ----------
cmd('rowAbove', { label: 'Insertar fila arriba', icon: 'rowAdd', run: () => Tables.rowInsert(false), enabled: inTable });
cmd('rowBelow', { label: 'Insertar fila debajo', icon: 'rowAdd', run: () => Tables.rowInsert(true), enabled: inTable });
cmd('colLeft', { label: 'Insertar columna a la izquierda', icon: 'colAdd', run: () => Tables.colInsert(false), enabled: inTable });
cmd('colRight', { label: 'Insertar columna a la derecha', icon: 'colAdd', run: () => Tables.colInsert(true), enabled: inTable });
cmd('rowDelete', { label: 'Eliminar fila', icon: 'rowDel', run: () => Tables.rowDelete(), enabled: inTable });
cmd('colDelete', { label: 'Eliminar columna', icon: 'colDel', run: () => Tables.colDelete(), enabled: inTable });
cmd('tableDelete', { label: 'Eliminar tabla', icon: 'tableDel', run: () => Tables.tableDelete(), enabled: inTable });
cmd('mergeCells', { label: 'Combinar celdas', icon: 'merge', run: () => Tables.merge(), enabled: inTable });
cmd('headerRow', { label: 'Fila de encabezado', icon: 'tableStyle', run: () => Tables.headerRow(), enabled: inTable });
cmd('tableStyle', { label: 'Estilo de tabla', icon: 'tableStyle', run: (c) => Tables.setStyle(c), enabled: inTable });
cmd('cellShade', { label: 'Sombreado de celda', icon: 'shading', run: (c) => Tables.shade(c), enabled: inTable });

// ---------- imagen ----------
cmd('imgInline', { label: 'En línea con el texto', icon: 'alignL', run: () => Images.wrap('inline'), enabled: hasImage, state: () => hasImage() && !/wrap-/.test(Images.selected.className) });
cmd('imgLeft', { label: 'Ajustar a la izquierda', icon: 'alignL', run: () => Images.wrap('left'), enabled: hasImage, state: () => hasImage() && Images.selected.classList.contains('wrap-left') });
cmd('imgRight', { label: 'Ajustar a la derecha', icon: 'alignR', run: () => Images.wrap('right'), enabled: hasImage, state: () => hasImage() && Images.selected.classList.contains('wrap-right') });
cmd('imgCenter', { label: 'Centrada', icon: 'alignC', run: () => Images.wrap('center'), enabled: hasImage, state: () => hasImage() && Images.selected.classList.contains('wrap-center') });
cmd('imgBorder', { label: 'Borde', icon: 'border', run: () => Images.toggleClass('border'), enabled: hasImage, state: () => hasImage() && Images.selected.classList.contains('border') });
cmd('imgShadow', { label: 'Sombra', icon: 'effects', run: () => Images.toggleClass('shadow'), enabled: hasImage, state: () => hasImage() && Images.selected.classList.contains('shadow') });
cmd('imgRounded', { label: 'Esquinas redondeadas', icon: 'crop', run: () => Images.toggleClass('rounded'), enabled: hasImage, state: () => hasImage() && Images.selected.classList.contains('rounded') });
cmd('imgReset', { label: 'Tamaño original', icon: 'history', run: () => Images.resetSize(), enabled: hasImage });
cmd('imgAlt', { label: 'Texto alternativo', icon: 'info', run: () => Images.altText(), enabled: hasImage });
cmd('imgDelete', { label: 'Eliminar imagen', icon: 'delete', run: () => Images.remove(), enabled: hasImage });

// ---------- dictado e IA local ----------
cmd('dictate', { label: 'Dictar', icon: 'mic', kw: 'voz hablar whisper micrófono', run: () => Dictation.toggle(), state: () => Dictation.active });
cmd('aiPolish', { label: 'Ordenar texto', icon: 'sparkle', kw: 'ia puntuación comas corregir reestructurar', run: () => AI.polish('punctuate') });
cmd('aiRewrite', { label: 'Reformular', icon: 'wrap', kw: 'ia reescribir mejorar claridad', run: () => AI.polish('rewrite') });
cmd('aiModels', { label: 'Modelos de IA', icon: 'settings', kw: 'descargar whisper ia local', run: () => AI.modelsDialog() });

// ---------- atajos de teclado ----------
// "es": los mismos atajos de Word en español. "en": los de Word en inglés.
const SHORTCUTS = {
  common: {
    'Ctrl+Z': 'undo', 'Ctrl+Y': 'redo', 'Ctrl+Shift+Z': 'redo',
    'Ctrl+Enter': 'pageBreak', 'Ctrl+Shift+Enter': 'columnBreak', 'F12': 'saveAs', 'Ctrl+P': 'print', 'Ctrl+F2': 'print', 'Ctrl+W': 'close',
    'Ctrl+Alt+1': 'style_h1', 'Ctrl+Alt+2': 'style_h2', 'Ctrl+Alt+3': 'style_h3', 'Ctrl+Shift+N': 'style_normal',
    'Ctrl+1': ['lineSpacing', 1], 'Ctrl+2': ['lineSpacing', 2], 'Ctrl+5': ['lineSpacing', 1.5],
    'Ctrl+Shift+>': 'grow', 'Ctrl+Shift+<': 'shrink', 'Ctrl+>': 'grow', 'Ctrl+<': 'shrink', 'Ctrl+]': 'grow', 'Ctrl+[': 'shrink',
    'Ctrl+=': 'sub', 'Ctrl+Shift+=': 'sup', 'Ctrl++': 'sup', 'Ctrl+Shift++': 'sup',
    'Shift+F3': 'caseCycle', 'Ctrl+Space': 'clearFormat', 'Ctrl+M': 'indent', 'Ctrl+Shift+M': 'outdent',
    'Ctrl+Shift+L': 'bullets', 'Ctrl+Shift+C': 'painter', 'Ctrl+Shift+8': 'showMarks', 'Ctrl+Shift+*': 'showMarks', 'Ctrl+*': 'showMarks',
    'Ctrl+F1': 'toggleRibbon', 'Alt+Q': 'tellMe', 'Ctrl+Alt+M': 'commentAdd', 'Ctrl+Alt+D': 'footnote', 'Ctrl+Alt+F': 'footnote',
    'F7': 'spelling', 'Shift+F7': 'wordCount', 'Ctrl+Shift+G': 'wordCount', 'Ctrl+0': 'zoom100', 'Ctrl+Alt+R': 'readMode',
    'Ctrl+Shift+D': 'dictate', 'Ctrl+Shift+O': 'aiPolish', 'Alt+F7': 'spelling',
  },
  es: {
    'Ctrl+N': 'bold', 'Ctrl+K': 'italic', 'Ctrl+S': 'underline', 'Ctrl+G': 'save', 'Ctrl+A': 'open', 'Ctrl+U': 'new',
    'Ctrl+B': 'find', 'Ctrl+L': 'findReplace', 'Ctrl+E': 'selectAll', 'Ctrl+I': 'goto',
    'Ctrl+T': 'alignCenter', 'Ctrl+Q': 'alignLeft', 'Ctrl+D': 'alignRight', 'Ctrl+J': 'alignJustify', 'Ctrl+Alt+K': 'link',
  },
  en: {
    'Ctrl+B': 'bold', 'Ctrl+I': 'italic', 'Ctrl+U': 'underline', 'Ctrl+S': 'save', 'Ctrl+O': 'open', 'Ctrl+N': 'new',
    'Ctrl+F': 'find', 'Ctrl+H': 'findReplace', 'Ctrl+A': 'selectAll', 'Ctrl+G': 'goto',
    'Ctrl+E': 'alignCenter', 'Ctrl+L': 'alignLeft', 'Ctrl+R': 'alignRight', 'Ctrl+J': 'alignJustify', 'Ctrl+K': 'link',
  },
};

function shortcutMap() {
  return { ...SHORTCUTS.common, ...(SHORTCUTS[Settings.shortcuts === 'en' ? 'en' : 'es']) };
}

function keyOf(cmdId) {
  const map = shortcutMap();
  for (const [k, v] of Object.entries(map)) if (v === cmdId) return k.replace('Ctrl', 'Ctrl').replace('Shift', 'Mayús');
  return '';
}

function comboFromEvent(e) {
  let k = e.key;
  if (/^Key[A-Z]$/.test(e.code)) k = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code) && !e.shiftKey) k = e.code.slice(5);
  else if (k === ' ') k = 'Space';
  else if (k.length === 1) k = k.toUpperCase();
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey && !(k.length === 1 && /[^A-Z0-9]/.test(k) && !['=', '+', '*', '>', '<'].includes(k))) parts.push('Shift');
  parts.push(k);
  return parts.join('+');
}

function handleShortcut(e) {
  if (e.isComposing || e.getModifierState('AltGraph')) return false; // AltGr escribe @ # € etc.
  const combo = comboFromEvent(e);
  const map = shortcutMap();
  let target = map[combo];
  if (!target && e.shiftKey) target = map[combo.replace('Shift+', '')] && /[<>+*]/.test(e.key) ? map[combo.replace('Shift+', '')] : null;
  if (!target) return false;
  const [id, arg] = Array.isArray(target) ? target : [target];
  e.preventDefault();
  e.stopPropagation();
  run(id, arg);
  return true;
}
