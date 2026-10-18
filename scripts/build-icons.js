// Genera src/icons.js a partir de los iconos Fluent UI (MIT) de Microsoft.
// Uso: node scripts/build-icons.js
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'node_modules', '@fluentui', 'svg-icons', 'icons');

// nombre interno -> nombre del icono Fluent
const MAP = {
  bold: 'text_bold', italic: 'text_italic', underline: 'text_underline',
  strike: 'text_strikethrough', sub: 'text_subscript', sup: 'text_superscript',
  color: 'text_color', highlight: 'highlight', clear: 'text_clear_formatting',
  case: 'text_change_case', grow: 'text_font_size', font: 'text_font',
  bullets: 'text_bullet_list_ltr', numbers: 'text_number_list_ltr',
  indent: 'text_indent_increase_ltr', outdent: 'text_indent_decrease_ltr',
  alignLeft: 'text_align_left', alignCenter: 'text_align_center',
  alignRight: 'text_align_right', alignJustify: 'text_align_justify',
  lineSpacing: 'text_line_spacing', paragraph: 'text_paragraph',
  painter: 'paint_brush', shading: 'paint_bucket', paste: 'clipboard_paste',
  cut: 'cut', copy: 'copy', save: 'save', undo: 'arrow_undo', redo: 'arrow_redo',
  print: 'print', search: 'search', replace: 'arrow_swap', selectAll: 'copy_select',
  table: 'table', tableAdd: 'table_add', rowAdd: 'table_insert_row',
  colAdd: 'table_insert_column', rowDel: 'table_delete_row', colDel: 'table_delete_column',
  tableDel: 'table_dismiss', cellShade: 'table_cell_edit', tableStyle: 'table_simple',
  textbox: 'textbox', quote: 'text_quote', symbol: 'math_symbols', hash: 'number_symbol',
  date: 'calendar_ltr', col1: 'text_column_one', col2: 'text_column_two', col3: 'text_column_three',
  landscape: 'document_landscape', margins: 'document_margins', size: 'slide_size',
  wordCount: 'text_word_count', speak: 'speaker_2', read: 'book_open',
  h1: 'text_header_1', h2: 'text_header_2', h3: 'text_header_3',
  ruler: 'ruler', zoomIn: 'zoom_in', zoomOut: 'zoom_out', zoomFit: 'zoom_fit',
  fullscreen: 'full_screen_maximize', dark: 'dark_theme', nav: 'panel_left', panelRight: 'panel_right',
  star: 'star', settings: 'settings', open: 'folder_open', new: 'document_add',
  emoji: 'emoji', effects: 'text_effects', watermark: 'water', footnote: 'text_footnote',
  endnote: 'document_endnote', toc: 'text_bullet_list_square', pageBreak: 'document_page_break',
  header: 'document_header', footer: 'document_footer', pageNumber: 'document_page_number',
  commentAdd: 'comment_add', commentDel: 'comment_dismiss', comments: 'comment_multiple',
  proofing: 'text_proofing_tools', check: 'checkmark', image: 'image_add', link: 'link_add',
  unlink: 'link_dismiss', hr: 'line_horizontal_1', code: 'code_block', cover: 'book_contacts',
  export: 'arrow_export_up', history: 'history', home: 'home', doc: 'document_text',
  wrap: 'text_wrap', pdf: 'document_pdf', word: 'document_word', info: 'info',
  close: 'dismiss', chevronDown: 'chevron_down', chevronUp: 'chevron_up', more: 'more_horizontal',
  eraser: 'eraser', upper: 'text_case_uppercase', lower: 'text_case_lowercase', title: 'text_case_title',
  pin: 'pin', pageColor: 'color', border: 'document_border', alignL: 'align_left', alignR: 'align_right',
  alignC: 'align_center_vertical', crop: 'crop', delete: 'delete', add: 'add', ribbon: 'ribbon',
  focus: 'full_screen_minimize', pageFit: 'document_one_page', width: 'document_width',
  textDir: 'text_direction_vertical', template: 'document_one_page_multiple', person: 'person',
  merge: 'table_cells_merge', print2: 'document_print', globe: 'globe', shapes: 'shapes',
  mic: 'mic', arrowLeft: 'arrow_left', stop: 'stop', sun: 'weather_sunny', moon: 'weather_moon',
  keyboard: 'keyboard', lightbulb: 'lightbulb', sparkle: 'sparkle', calendarDate: 'calendar_date',
};

const out = {};
for (const [key, name] of Object.entries(MAP)) {
  const file = path.join(DIR, `${name}_20_regular.svg`);
  if (!fs.existsSync(file)) { console.warn('Falta icono:', name); continue; }
  let svg = fs.readFileSync(file, 'utf8').trim();
  svg = svg.replace(/ width="20" height="20"/, '').replace('<svg ', '<svg fill="currentColor" aria-hidden="true" ');
  out[key] = svg;
}
const js = '// Generado por scripts/build-icons.js — Iconos Fluent UI (MIT, Microsoft) — Write It\n' +
  'window.ICONS = ' + JSON.stringify(out, null, 0).replace(/","/g, '",\n"') + ';\n';
fs.writeFileSync(path.join(__dirname, '..', 'src', 'icons.js'), js);
console.log('Iconos generados:', Object.keys(out).length);
