// Autoprueba: npm test  (ejecuta la app, prueba las funciones principales y guarda capturas)
'use strict';

window.runSelftest = async function () {
  const results = [];
  let failed = 0;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const check = (name, ok, info) => { results.push(`${ok ? 'OK  ' : 'FALLO'} ${name}${info ? ' — ' + info : ''}`); if (!ok) failed++; };
  const safe = async (name, fn) => { try { await fn(); } catch (err) { check(name, false, err.message + '\n' + err.stack); } };
  const caretEnd = () => { const r = document.createRange(); r.selectNodeContents(docEl()); r.collapse(false); selectRange(r); focusDoc(); };
  const selectText = (txt) => {
    const ms = Find.rangesFor(txt, { matchCase: true });
    if (!ms.length) throw new Error('no se encontró: ' + txt);
    selectRange(ms[0]); docEl().focus(); return ms[0];
  };
  const type = (t) => { focusDoc(); document.execCommand('insertText', false, t); afterContentChange(true); };
  const enter = () => { focusDoc(); document.execCommand('insertParagraph'); fixNewParagraph(); };

  await wait(400);
  await safe('arranque', async () => {
    check('interfaz construida', !!$('#ribbon .ribbon-inner') && $$('#tabs .tab').length >= 9);
    check('documento vacío listo', docEl().innerHTML === '<p><br></p>');
  });

  await safe('escritura y estilos', async () => {
    caretEnd();
    type('Informe de prueba');
    run('style_title');
    check('estilo Título', !!docEl().querySelector('h1.doc-title'));
    enter();
    check('Intro tras título vuelve a Normal', closestBlock(currentRange().startContainer).nodeName === 'P');
    type('Introducción');
    run('style_h1');
    enter();
    type('Este es un párrafo de ejemplo con palabras importantes y un texto largo para comprobar la paginación del documento. ');
    check('h1', !!docEl().querySelector('h1:not(.doc-title)'));
    selectText('importantes');
    await api.selftest.keys([{ key: 'N', mods: ['control'] }]);
    check('negrita con Ctrl+N (atajo de Word en español)', !!docEl().querySelector('b'), docEl().querySelector('p:last-of-type')?.innerHTML.slice(0, 160));
    selectText('ejemplo');
    run('italic');
    check('cursiva', !!docEl().querySelector('i'), docEl().innerHTML.slice(0, 300));
    selectText('palabras');
    setFontSize(16);
    check('tamaño de fuente', !!docEl().querySelector('span[style*="16pt"]'));
    selectText('texto largo');
    setFontFamily('Georgia');
    check('fuente', !!docEl().querySelector('span[style*="Georgia"]'));
    selectText('comprobar');
    run('highlight', '#ffff00');
    check('resaltado', !!docEl().querySelector('[style*="background-color"]'));
    selectText('paginación');
    run('fontColor', '#c00000');
    check('color de fuente', /192, 0, 0|#c00000/i.test(docEl().innerHTML));
    selectText('Introducción');
    run('alignCenter');
    check('centrar', docEl().querySelector('h1:not(.doc-title)').style.textAlign === 'center');
  });

  await safe('listas y tablas', async () => {
    caretEnd();
    await api.selftest.keys([{ key: 'Enter' }, '- Primer punto', { key: 'Enter' }, 'Segundo punto', { key: 'Enter' }, { key: 'Enter' }]);
    check('autolista al escribir "- "', !!docEl().querySelector('ul'));
    check('lista de 2 elementos', docEl().querySelectorAll('ul li').length === 2, docEl().querySelectorAll('ul li').length + ' elementos');
    run('numbers');
    type('Numerado'); enter(); enter();
    check('lista numerada', !!docEl().querySelector('ol li'));
    Tables.insert(3, 3);
    check('tabla 3x3', docEl().querySelectorAll('table td').length === 9);
    type('Celda A1');
    Tables.tab(false);
    type('B1');
    run('rowBelow');
    check('insertar fila', docEl().querySelector('table').rows.length === 4);
    run('colRight');
    check('insertar columna', docEl().querySelector('table').rows[0].cells.length === 4);
    run('tableStyle', 't-blue');
    check('estilo de tabla', docEl().querySelector('table').classList.contains('t-blue'));
    UI.updateState(true);
    check('pestaña contextual Tabla', !$('#tabs [data-tab="table"]').hidden);
    UI.setTab('table'); await wait(80);
    await api.selftest.shot('08-tabla');
    UI.setTab('home');
  });

  await safe('notas, comentarios, vínculos, imagen', async () => {
    caretEnd();
    type('Texto con nota');
    run('footnote');
    type('Esta es la nota.');
    check('nota al final', docEl().querySelectorAll('.footnote-ref').length === 1 && !!docEl().querySelector('.footnotes li'));
    selectText('Texto con nota');
    Comments.add();
    const ta = $('#comment-list textarea');
    if (ta) { ta.value = 'Revisar esta frase'; ta.dispatchEvent(new Event('input')); }
    check('comentario', !!docEl().querySelector('span.comment[data-text="Revisar esta frase"]'));
    await wait(50);
    await api.selftest.shot('09-comentarios');
    UI.showPane('commentpane', false);
    caretEnd(); enter();
    selectRange((() => { const r = document.createRange(); r.selectNodeContents(closestBlock(currentRange().startContainer)); r.collapse(true); return r; })());
    edit(() => exec('insertHTML', '<a href="https://example.com">vínculo de prueba</a>'));
    check('vínculo', !!docEl().querySelector('a[href="https://example.com"]'));
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAAQklEQVR42u3PMQ0AAAgDILV/52nBzwMSkJ5UwKoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgrqXQHKpgEBAcU4WQAAAABJRU5ErkJggg==';
    caretEnd(); enter();
    Images.insert([png]);
    await wait(80);
    const img = docEl().querySelector('img');
    check('imagen', !!img);
    if (img) { Images.select(img); run('imgCenter'); check('imagen centrada', img.classList.contains('wrap-center')); UI.updateState(true); check('pestaña Imagen', !$('#tabs [data-tab="picture"]').hidden); Images.deselect(); }
  });

  await safe('saltos, paginación e índice', async () => {
    caretEnd(); enter();
    run('pageBreak');
    type('Segunda parte');
    run('style_h2');
    enter();
    for (let i = 0; i < 25; i++) { type(`Párrafo número ${i + 1}: ` + 'lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(3)); enter(); }
    renderPages();
    check('paginación (≥3 páginas)', Layout.pages >= 3, Layout.pages + ' páginas');
    const r = document.createRange(); r.setStart(docEl(), 0); r.collapse(true); selectRange(r);
    Toc.insert();
    await wait(400);
    check('tabla de contenido', docEl().querySelectorAll('.toc .toc-row').length >= 2, docEl().querySelectorAll('.toc .toc-row').length + ' filas');
  });

  await safe('buscar, reemplazar, deshacer', async () => {
    const n = Find.replaceAll('lorem', 'LOREM', { matchCase: true });
    check('reemplazar todo', n >= 25, n + ' reemplazos');
    run('undo');
    check('deshacer', docEl().innerText.includes('lorem') && !docEl().innerText.includes('LOREM'));
    run('redo');
    check('rehacer', docEl().innerText.includes('LOREM'));
    Find.open(true);
    $('#find-input').value = 'Párrafo'; Find.search(true);
    check('buscar', Find.matches.length >= 25, Find.matches.length + ' coincidencias');
    await wait(50);
    await api.selftest.shot('10-buscar');
    Find.close();
  });

  await safe('mayúsculas y conteo', async () => {
    selectText('Segunda parte');
    run('caseUpper');
    check('MAYÚSCULAS', docEl().innerText.includes('SEGUNDA PARTE'));
    const s = docStats();
    check('contar palabras', s.words > 300, s.words + ' palabras');
  });

  await safe('configuración de página', async () => {
    run('orientation', 'landscape');
    check('horizontal', Doc.page.orientation === 'landscape' && /297mm/.test($('#page-style').textContent));
    run('orientation', 'portrait');
    run('margins', 'narrow');
    check('márgenes', Doc.page.margins.left === 12.7);
    run('margins', 'normal');
    run('pageNumber', { where: 'footer', align: 'center', format: 'pageOf' });
    check('números de página', /counter\(pages\)/.test($('#page-style').textContent));
    $('#doc-header').textContent = 'Encabezado de prueba';
    applyDoc();
    check('encabezado en @page', /Encabezado de prueba/.test($('#page-style').textContent));
    run('watermark', 'BORRADOR');
    check('marca de agua', $('#print-watermark').textContent === 'BORRADOR');
  });

  await safe('protección de palabras de la IA', async () => {
    const orig = 'bueno la verdad es que yo creo que esta bien pero hay que ver';
    const fake = 'Bueno, la verdad es que creo que está muy bien, pero habría que ver.';
    const r = keepOriginalWords(orig, fake);
    const words = (s) => tokenize(s).filter(isWord).map(normWord).join(' ');
    check('la IA nunca cambia palabras', words(r.text) === words(orig), r.text);
    check('acepta puntuación y tildes', /^Bueno, la verdad/.test(r.text) && /está/.test(r.text));
  });

  await safe('dictado dentro de la app', async () => {
    const st = await api.ai.status();
    if (!st.whisper.some(m => m.downloaded)) { results.push('     (modelo de dictado no descargado: se omite)'); return; }
    const audio = new Float32Array(16000);
    for (let i = 0; i < audio.length; i++) audio[i] = Math.sin(i / 16000 * 2 * Math.PI * 220) * 0.02;
    const res = await api.ai.transcribe({ audio, lang: 'spanish' });
    check('motor de dictado (Whisper) carga y responde', !res.error, res.error || JSON.stringify(res.text));
  });

  await safe('IA local dentro de la app', async () => {
    const st = await api.ai.status();
    if (!st.llm.some(m => m.downloaded)) { results.push('     (IA local no descargada: se omite)'); return; }
    caretEnd(); enter();
    type('bueno la reunion fue bien creo que tenemos que mandar el informe el lunes y despues vemos lo del presupuesto');
    const blk = closestBlock(currentRange().startContainer);
    const r = document.createRange(); r.selectNodeContents(blk); selectRange(r);
    await AI.polish('punctuate');
    const btn = $('#modal-root .pbtn.primary');
    check('revisión de cambios de la IA', !!btn && !!$('#modal-root .diff-view'));
    await wait(400);
    check('diálogo de progreso cerrado', $$('#modal-root .modal').length === 1, $$('#modal-root .modal').length + ' diálogos');
    await api.selftest.shot('20-ia-revision');
    if (btn) btn.click();
    await wait(50);
    const txt = docEl().innerText;
    check('IA aplicada sin cambiar palabras', /reuni[oó]n fue bien/i.test(txt) && /[,.]/.test(txt.split('reuni')[1] || ''), (txt.match(/[Bb]ueno.{0,140}/) || [''])[0]);
  });

  await safe('guardar y exportar', async () => {
    renderPages();
    const payload = Files.payload();
    const out = await api.selftest.docx(payload);
    check('Word .docx', out.docxBytes > 4000, out.docxBytes + ' bytes');
    check('Word ida y vuelta: texto', /Introducción/.test(out.docxRoundTrip), out.docxRoundTrip.slice(0, 200));
    check('Word ida y vuelta: tabla', /<table/.test(out.docxRoundTrip));
    check('Word ida y vuelta: negrita', /<strong>[^<]*importantes/.test(out.docxRoundTrip), (out.docxRoundTrip.match(/.{80}importantes.{40}/) || [''])[0]);
    check('formato .wit ida y vuelta', out.fwdRoundTrip === true);
    check('PDF', out.pdfBytes > 10000, out.pdfBytes + ' bytes');
    check('TXT', /INFORME DE PRUEBA|Informe de prueba/i.test(out.txt), out.txt.slice(0, 40));
    results.push('     archivos en: ' + out.dir);
  });

  await safe('capturas de la interfaz', async () => {
    run('watermark', '');
    $('#scroller').scrollTop = 0;
    for (const [i, [tab]] of TAB_ORDER.entries()) {
      UI.setTab(tab); await wait(60);
      await api.selftest.shot(`0${i}-pestana-${tab}`);
    }
    UI.setTab('home');
    UI.showPane('navpane', true); await wait(80);
    await api.selftest.shot('11-navegacion');
    UI.showPane('navpane', false);
    Backstage.open('home'); await wait(300);
    await api.selftest.shot('12-archivo');
    Backstage.open('saveas'); await wait(80);
    await api.selftest.shot('13-guardar-como');
    Backstage.close();
    UI.menu($('[data-cmd="margins"]') || $('#tabs .tab'), UI.caseMenu()); await wait(60);
    UI.closePopup();
    UI.setTab('layout'); await wait(50);
    $('[data-cmd="margins"]').click(); await wait(80);
    await api.selftest.shot('14-margenes');
    UI.closePopup();
    UI.setTab('home');
    UI.optionsDialog(); await wait(150);
    await api.selftest.shot('15-opciones');
    UI.closeModal();
    Settings.theme = 'dark'; UI.applyTheme(); await wait(80);
    await api.selftest.shot('16-oscuro');
    Settings.theme = 'light'; UI.applyTheme();
    UI.setView('focus'); await wait(80);
    await api.selftest.shot('17-enfoque');
    UI.setView('print');
    Files.applyTemplate('report'); await wait(200);
    await api.selftest.shot('18-plantilla-informe');
    Files.applyTemplate('blank'); await wait(100);
    await api.selftest.shot('19-documento-en-blanco');
  });

  const errs = window.__errors || [];
  check('sin errores de JavaScript', errs.length === 0, errs.join(' | '));
  api.selftest.done({ failed, results });
};

window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(e.message));
window.addEventListener('unhandledrejection', (e) => window.__errors.push(String(e.reason && e.reason.message || e.reason)));
