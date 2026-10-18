// Dictado por voz (Whisper) e IA local para ordenar textos, todo dentro del equipo
'use strict';

// Frases que Whisper a veces "inventa" cuando hay silencio
const WHISPER_GHOSTS = [/subt[ií]tulos realizados por/i, /amara\.org/i, /gracias por ver el video/i, /suscr[ií]bete/i, /^\s*\[?(m[uú]sica|silencio|risas|aplausos)\]?\.?\s*$/i,
  /^\s*(\.|,|…)+\s*$/, /^\s*gracias\.?\s*$/i, /thanks for watching/i, /^\s*you\s*$/i];

const Dictation = {
  LANGS: [['spanish', 'Español'], ['english', 'Inglés'], ['portuguese', 'Portugués'], ['french', 'Francés'], ['italian', 'Italiano'], ['german', 'Alemán']],
  active: false,
  queue: [],
  busy: false,
  inserted: 0,

  async toggle() {
    if (this.active) return this.stop();
    const st = await api.ai.status();
    const model = st.whisper.find(m => m.id === st.selected.whisper && m.downloaded) || st.whisper.find(m => m.downloaded);
    if (!model) {
      const ok = await UI.confirm('Para dictar, Write It necesita descargar una vez el modelo de reconocimiento de voz Whisper (funciona sin internet después).\n\n¿Quieres elegir y descargar el modelo ahora?', 'Dictado', 'Elegir modelo');
      if (ok) AI.modelsDialog('whisper');
      return;
    }
    this.start();
  },

  async start() {
    focusDoc();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (err) {
      UI.alert('No se pudo usar el micrófono. Revisa que esté conectado y que Windows permita el acceso al micrófono (Configuración › Privacidad › Micrófono).\n\n' + err.message, 'Dictado');
      return;
    }
    this.ctx = new AudioContext({ sampleRate: 16000 });
    const src = this.ctx.createMediaStreamSource(this.stream);
    const proc = this.ctx.createScriptProcessor(4096, 1, 1);
    this.proc = proc;
    this.chunks = [];      // trozos de la frase actual
    this.pre = [];         // audio previo (para no cortar el inicio de la palabra)
    this.speaking = false;
    this.silence = 0;
    this.noise = 0.004;
    this.segLen = 0;
    const rate = 16000;
    proc.onaudioprocess = (e) => {
      const data = new Float32Array(e.inputBuffer.getChannelData(0));
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      this.level = rms;
      const threshold = Math.max(0.012, this.noise * 3);
      const dur = data.length / rate;
      if (rms > threshold) {
        if (!this.speaking) { this.speaking = true; this.chunks = [...this.pre]; this.segLen = this.pre.reduce((a, c) => a + c.length, 0) / rate; }
        this.silence = 0;
      } else {
        this.noise = this.noise * 0.95 + rms * 0.05;
        if (this.speaking) this.silence += dur;
      }
      if (this.speaking) {
        this.chunks.push(data);
        this.segLen += dur;
        if ((this.silence > 0.75 && this.segLen > 0.6) || this.segLen > 24) this.flush();
      } else {
        this.pre.push(data);
        if (this.pre.length > 2) this.pre.shift();
      }
      this.paintLevel();
    };
    src.connect(proc);
    proc.connect(this.ctx.destination);
    this.active = true;
    const off = getSelOffsets();
    this.startOffset = off ? off.start : null;
    this.inserted = 0;
    this.showBar();
    UI.updateState();
  },

  flush() {
    if (!this.chunks.length) return;
    const len = this.chunks.reduce((a, c) => a + c.length, 0);
    const audio = new Float32Array(len);
    let o = 0;
    for (const c of this.chunks) { audio.set(c, o); o += c.length; }
    this.chunks = [];
    this.speaking = false;
    this.silence = 0;
    this.segLen = 0;
    if (len / 16000 < 0.45) return;
    this.queue.push(audio);
    this.process();
  },

  async process() {
    if (this.busy) return;
    this.busy = true;
    this.paintBar();
    while (this.queue.length) {
      const audio = this.queue.shift();
      try {
        const res = await api.ai.transcribe({ audio, lang: Settings.dictationLang || 'spanish' });
        if (res.error) { toast(res.error, 4000); continue; }
        const text = (res.text || '').replace(/\s+/g, ' ').trim();
        if (!text || WHISPER_GHOSTS.some(re => re.test(text))) continue;
        this.insert(text);
      } catch (err) { toast('Error al transcribir: ' + err.message, 4000); }
    }
    this.busy = false;
    this.paintBar();
    if (!this.active && this.pendingFinish) this.finish();
  },

  insert(text) {
    focusDoc();
    const r = currentRange();
    let prefix = '';
    if (r && r.collapsed) {
      const before = document.createRange();
      const blk = closestBlock(r.startContainer);
      if (blk) {
        before.setStart(blk, 0);
        before.setEnd(r.startContainer, r.startOffset);
        const prev = before.toString().replace(/​/g, '');
        if (prev && !/[\s ]$/.test(prev)) prefix = ' ';
        if (!prev || /[.!?…]\s*$/.test(prev)) text = text.charAt(0).toLocaleUpperCase('es') + text.slice(1);
      }
    }
    edit(() => exec('insertText', prefix + text));
    this.inserted++;
  },

  async stop() {
    if (!this.active) return;
    this.active = false;
    try { this.flush(); } catch { /* */ }
    try { this.proc.disconnect(); } catch { /* */ }
    try { this.stream.getTracks().forEach(t => t.stop()); } catch { /* */ }
    try { await this.ctx.close(); } catch { /* */ }
    this.pendingFinish = true;
    if (!this.busy) this.finish();
    this.paintBar();
    UI.updateState();
  },

  finish() {
    this.pendingFinish = false;
    this.hideBar();
    if (Settings.dictAutoPolish && this.inserted && this.startOffset !== null) {
      const end = getSelOffsets();
      if (end && end.end > this.startOffset) {
        setSelOffsets({ start: this.startOffset, end: end.end });
        AI.polish('punctuate');
      }
    }
  },

  // ---------- indicador flotante ----------
  showBar() {
    this.hideBar();
    const bar = el('div', { class: 'dict-bar', id: 'dict-bar', role: 'status' }, [
      el('span', { class: 'dict-dot' }),
      el('span', { class: 'dict-level' }, [el('i'), el('i'), el('i'), el('i'), el('i')]),
      el('span', { class: 'dict-text', text: 'Escuchando…' }),
      el('button', { class: 'dict-stop', text: 'Detener', onmousedown: (e) => e.preventDefault(), onclick: () => this.stop() }),
    ]);
    document.body.append(bar);
  },
  hideBar() { $('#dict-bar')?.remove(); },
  paintBar() {
    const t = $('#dict-bar .dict-text');
    if (!t) return;
    if (!this.active) t.textContent = 'Terminando de escribir…';
    else t.textContent = this.busy ? 'Escribiendo lo que dijiste…' : 'Escuchando…';
    $('#dict-bar').classList.toggle('stopping', !this.active);
  },
  paintLevel() {
    const bars = $$('#dict-bar .dict-level i');
    if (!bars.length) return;
    const lvl = Math.min(1, (this.level || 0) * 18);
    bars.forEach((b, i) => { b.style.transform = `scaleY(${Math.max(0.2, Math.min(1, lvl * (1 - Math.abs(i - 2) * 0.22) + 0.1))})`; });
  },
};

// ---------- IA local ----------
const AI = {
  busy: false,

  async ensureModel() {
    const st = await api.ai.status();
    const m = st.llm.find(x => x.id === st.selected.llm && x.downloaded) || st.llm.find(x => x.downloaded);
    if (m) return m;
    const ok = await UI.confirm('Para ordenar y reformular textos, Write It usa una IA que funciona dentro de tu computador, sin internet y sin enviar tus textos a ningún sitio.\n\nPrimero hay que descargarla una sola vez. ¿Quieres elegirla ahora?', 'IA local', 'Elegir modelo');
    if (ok) this.modelsDialog('llm');
    return null;
  },

  // Bloques de texto sobre los que trabajar
  targets() {
    const r = currentRange() || lastRange;
    const skip = (b) => b.closest('.toc, pre, .cover-band') || !b.textContent.trim();
    if (r && !r.collapsed) {
      const blocks = selectedBlocks().filter(b => !skip(b));
      if (blocks.length === 1) {
        // selección dentro de un único párrafo: solo el texto seleccionado
        const b = blocks[0];
        const whole = document.createRange(); whole.selectNodeContents(b);
        if (r.toString().trim().length < whole.toString().trim().length - 1) return { partial: r.cloneRange(), blocks: [] };
      }
      return { blocks };
    }
    return { blocks: Array.from(docEl().querySelectorAll(BLOCK_SEL)).filter(b => !b.querySelector(BLOCK_SEL) && !skip(b)), whole: true };
  },

  async polish(mode) {
    if (this.busy) return;
    if (!(await this.ensureModel())) return;
    const t = this.targets();
    const items = t.partial ? [{ range: t.partial, text: t.partial.toString() }] : t.blocks.map(b => ({ block: b, text: b.innerText.replace(/\n+$/, '') }));
    const total = items.reduce((a, i) => a + countWords(i.text), 0);
    if (!total) { toast('No hay texto para ordenar'); return; }
    if (t.whole && total > 120) {
      const ok = await UI.confirm(`No hay texto seleccionado, así que se revisará todo el documento (${total.toLocaleString('es')} palabras). Puede tardar un poco.\n\n¿Continuar?`, mode === 'rewrite' ? 'Reformular' : 'Ordenar texto', 'Continuar');
      if (!ok) return;
    }
    this.busy = true;
    let canceled = false;
    const bar = el('div', { class: 'progress' }, [el('i')]);
    const label = el('div', { class: 'muted', text: 'Cargando la IA…' });
    UI.modal({
      title: mode === 'rewrite' ? 'Reformulando…' : 'Ordenando el texto…', width: 420,
      body: el('div', {}, [label, bar, el('p', { class: 'muted small', text: 'Todo se procesa en tu computador. Tus textos no salen de aquí.' })]),
      buttons: [{ label: 'Cancelar', action: () => { canceled = true; api.ai.cancel(); } }],
    });
    const results = [];
    let done = 0, fixedWords = 0;
    try {
      for (const it of items) {
        if (canceled) break;
        if (!it.text.trim()) { results.push(it.text); continue; }
        const chunks = splitForModel(it.text, 220);
        const out = [];
        for (const ch of chunks) {
          if (canceled) break;
          label.textContent = `Procesando… ${Math.min(100, Math.round(done / total * 100))} %`;
          bar.firstChild.style.width = Math.round(done / total * 100) + '%';
          const res = await api.ai.generate({ mode, text: ch });
          if (res.error) throw new Error(res.error);
          let txt = cleanModelOutput(res.text, ch);
          if (mode === 'punctuate') {
            const p = keepOriginalWords(ch, txt);
            txt = p.text; fixedWords += p.restored;
          }
          out.push(txt);
          done += countWords(ch);
        }
        results.push(out.join(' ').replace(/ *\n\n */g, '\n\n'));
      }
    } catch (err) {
      UI.closeModal();
      this.busy = false;
      UI.alert('La IA no pudo terminar: ' + err.message, 'IA local');
      return;
    }
    UI.closeModal();
    this.busy = false;
    if (canceled) { toast('Cancelado'); return; }
    this.review(mode, items, results, fixedWords);
  },

  review(mode, items, results, fixedWords) {
    const before = items.map(i => i.text).join('\n\n');
    const after = results.join('\n\n');
    if (before.trim() === after.trim()) { toast('El texto ya estaba bien. No hubo cambios.'); return; }
    const diff = el('div', { class: 'diff-view' });
    diff.innerHTML = diffHtml(before, after);
    const note = mode === 'punctuate'
      ? `Solo se cambiaron puntuación, mayúsculas, tildes y párrafos. Tus palabras se mantienen igual.${fixedWords ? ` (La IA intentó cambiar ${fixedWords} palabra${fixedWords === 1 ? '' : 's'} y se restauraron las originales.)` : ''}`
      : 'Revisa la propuesta. Puedes deshacerla después con Ctrl+Z.';
    UI.modal({
      title: mode === 'rewrite' ? 'Propuesta de reformulación' : 'Revisa los cambios', width: 760,
      body: el('div', {}, [
        el('div', { class: 'diff-legend' }, [el('span', { class: 'ins', text: 'añadido' }), el('span', { class: 'del', text: 'quitado' }), el('span', { class: 'muted', text: note })]),
        diff,
      ]),
      buttons: [{ label: 'Descartar' }, { label: 'Aplicar cambios', primary: true, action: () => this.apply(items, results) }],
    });
  },

  apply(items, results) {
    edit(() => {
      items.forEach((it, i) => {
        const text = results[i];
        if (it.range) {
          selectRange(it.range);
          exec('insertText', text.replace(/\n{2,}/g, ' ').trim());
          return;
        }
        const b = it.block;
        if (!document.contains(b)) return;
        const paras = text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
        const plain = !b.querySelector('*:not(br)');
        if (plain && paras.length > 1 && b.nodeName !== 'TD' && b.nodeName !== 'TH' && b.nodeName !== 'LI') {
          const nodes = paras.map(p => { const n = b.cloneNode(false); n.textContent = p; return n; });
          b.replaceWith(...nodes);
        } else if (plain) {
          b.textContent = paras.join(' ');
        } else {
          applyTextDiff(b, b.innerText.replace(/\n+$/, ''), paras.join(' '));
        }
      });
    });
    toast('Cambios aplicados. Pulsa Ctrl+Z si quieres volver atrás.');
  },

  // ---------- gestor de modelos ----------
  async modelsDialog(focus) {
    const body = el('div', { class: 'models' });
    const render = async () => {
      const st = await api.ai.status();
      body.innerHTML = '';
      const sect = (title, desc, kind, list) => {
        body.append(el('div', { class: 'opt-section', text: title }), el('p', { class: 'muted', text: desc }));
        for (const m of list) {
          const selected = st.selected[kind] === m.id;
          const dl = st.downloading && st.downloading.id === m.id;
          const prog = dl ? Math.round((st.downloading.received / (st.downloading.total || 1)) * 100) : 0;
          const actions = [];
          if (m.downloaded) {
            actions.push(selected ? el('span', { class: 'badge', text: 'En uso' }) : el('button', { class: 'pbtn', text: 'Usar', onclick: async () => { await api.ai.select(kind, m.id); render(); } }));
            actions.push(el('button', { class: 'icon-btn', title: 'Eliminar del equipo', html: icon('delete'), onclick: async () => { if (await UI.confirmInline(`¿Eliminar ${m.name} del equipo?`)) { await api.ai.remove(kind, m.id); render(); } } }));
          } else if (dl) {
            actions.push(el('div', { class: 'progress small' }, [el('i', { style: { width: prog + '%' } })]), el('span', { class: 'muted', text: prog + ' %' }),
              el('button', { class: 'pbtn', text: 'Cancelar', onclick: () => api.ai.cancelDownload() }));
          } else {
            actions.push(el('button', {
              class: 'pbtn primary', text: `Descargar · ${m.size}`, disabled: !!st.downloading,
              onclick: async () => {
                const p = api.ai.download(kind, m.id);
                setTimeout(render, 300);
                const res = await p;
                if (res && res.error) UI.alert(res.error, 'Descarga'); else if (res && res.ok) toast(`${m.name} listo para usar`);
                render();
              },
            }));
          }
          body.append(el('div', { class: 'model-row' + (focus === kind && m.recommended ? ' hl' : '') }, [
            el('div', { class: 'model-info' }, [el('b', { text: m.name }), m.recommended ? el('span', { class: 'tag', text: 'Recomendado' }) : null, el('div', { class: 'muted', text: m.desc })]),
            el('div', { class: 'model-actions' }, actions),
          ]));
        }
      };
      sect('Dictado por voz (Whisper)', 'Convierte tu voz en texto. Funciona sin internet una vez descargado.', 'whisper', st.whisper);
      sect('IA para ordenar y reformular (llama.cpp)', 'Pone puntos, comas, tildes y párrafos sin cambiar tus palabras. Corre en el procesador, sin tarjeta gráfica.', 'llm', st.llm);
      body.append(el('p', { class: 'muted small', text: `La IA usa la tarjeta gráfica si es compatible con Vulkan (AMD Radeon, NVIDIA o Intel) y, si no, el procesador.${st.accel ? ' Ahora mismo: ' + st.accel + '.' : ''}` }));
      body.append(el('p', { class: 'muted small', text: `Los modelos se guardan en: ${st.dir}` }));
    };
    await render();
    const off = api.on('ai:progress', () => { if (document.contains(body)) render(); });
    UI.modal({ title: 'Modelos de IA local', width: 640, body, buttons: [{ label: 'Cerrar', primary: true }], onClose: () => off && off() });
  },
};

UI.confirmInline = (msg) => Promise.resolve(window.confirm(msg));

// Divide un texto largo en trozos de ~n palabras, cortando en finales de frase si es posible
function splitForModel(text, n) {
  const words = text.split(/(\s+)/);
  const out = [];
  let cur = '', count = 0;
  for (const w of words) {
    cur += w;
    if (/\S/.test(w)) count++;
    if (count >= n && /[.!?…]$/.test(w)) { out.push(cur.trim()); cur = ''; count = 0; }
    else if (count >= n * 1.6) { out.push(cur.trim()); cur = ''; count = 0; }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function cleanModelOutput(t, original) {
  let s = (t || '').trim();
  s = s.replace(/^```[a-z]*\n?|```$/g, '').trim();
  s = s.replace(/^(texto (corregido|reescrito|ordenado)|aquí (tienes|está)[^:]*):\s*/i, '');
  if (/^["«“]/.test(s) && /["»”]$/.test(s) && !/^["«“]/.test(original.trim())) s = s.slice(1, -1).trim();
  s = s.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').replace(/([^\n])\n([^\n])/g, '$1\n\n$2');
  return s || original;
}

// ---------- garantía: el modo "Ordenar" nunca cambia tus palabras ----------
const normWord = (w) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function tokenize(s) { return s.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*|\s+|[^\s\p{L}\p{N}]/gu) || []; }
const isWord = (t) => /^[\p{L}\p{N}]/u.test(t);

// LCS entre dos listas
function lcsPairs(a, b, eq) {
  const n = a.length, m = b.length;
  if (n * m > 4e6) return null;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = eq(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) { pairs.push([i, j]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  return pairs;
}

// Toma la puntuación y los párrafos de la IA, pero conserva exactamente las palabras originales
function keepOriginalWords(original, output) {
  const ow = tokenize(original).filter(isWord);
  const outTok = tokenize(output);
  const outWordIdx = outTok.map((t, i) => isWord(t) ? i : -1).filter(i => i >= 0);
  const pairs = lcsPairs(ow, outWordIdx.map(i => outTok[i]), (x, y) => normWord(x) === normWord(y));
  if (!pairs) return { text: original, restored: 0 };
  const matchedOut = new Map(pairs.map(([oi, k]) => [outWordIdx[k], oi]));
  const res = [];
  let nextOrig = 0, restored = 0;
  const pushOrig = (upto) => {
    while (nextOrig < upto) {
      const last = res.length ? res[res.length - 1] : '';
      if (last && !/\s$/.test(last)) res.push(' ');
      res.push(ow[nextOrig]); nextOrig++; restored++;
    }
  };
  for (let i = 0; i < outTok.length; i++) {
    const t = outTok[i];
    if (!isWord(t)) { res.push(t); continue; }
    if (matchedOut.has(i)) {
      const oi = matchedOut.get(i);
      if (oi > nextOrig) { pushOrig(oi); if (!/\s$/.test(res[res.length - 1] || '')) res.push(' '); }
      // misma palabra: se aceptan mayúsculas y tildes de la IA
      res.push(t);
      nextOrig = oi + 1;
    } else {
      // palabra añadida o cambiada por la IA: se descarta
      restored++;
      if (res.length && /\s$/.test(res[res.length - 1]) && /^\s/.test(outTok[i + 1] || '')) i++;
    }
  }
  pushOrig(ow.length);
  let text = res.join('').replace(/[ \t]+([,.;:!?…])/g, '$1').replace(/[ \t]{2,}/g, ' ').replace(/ *\n */g, '\n').trim();
  // palabras que la IA quitó o cambió + palabras que añadió
  restored = (ow.length - pairs.length) + (outWordIdx.length - pairs.length);
  return { text, restored };
}

// Vista de diferencias por palabras
function diffHtml(a, b) {
  const ta = tokenize(a), tb = tokenize(b);
  const pairs = lcsPairs(ta, tb, (x, y) => x === y);
  if (!pairs) return `<div class="del">${escapeHtml(a)}</div><div class="ins">${escapeHtml(b)}</div>`;
  let i = 0, j = 0, html = '';
  const fmt = (s) => escapeHtml(s).replace(/\n/g, '<br>');
  for (const [pi, pj] of [...pairs, [ta.length, tb.length]]) {
    const del = ta.slice(i, pi).join(''), ins = tb.slice(j, pj).join('');
    if (del.trim()) html += `<del>${fmt(del)}</del>`;
    if (ins) html += ins.trim() ? `<ins>${fmt(ins)}</ins>` : fmt(ins);
    if (pi < ta.length) html += fmt(ta[pi]);
    i = pi + 1; j = pj + 1;
  }
  return html;
}

// Aplica cambios de texto a un bloque con formato sin perder negritas, vínculos, etc.
function applyTextDiff(block, oldText, newText) {
  const nodes = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let n, acc = 0;
  while ((n = walker.nextNode())) { nodes.push({ node: n, start: acc }); acc += n.data.length; }
  const full = nodes.map(x => x.node.data).join('');
  if (!nodes.length) return;
  const ta = tokenize(full), tb = tokenize(newText);
  const pairs = lcsPairs(ta, tb, (x, y) => x === y);
  if (!pairs) return;
  // operaciones: [posición en texto original, longitud a borrar, texto a insertar]
  const ops = [];
  let i = 0, j = 0, pos = 0;
  const offs = []; { let p = 0; for (const t of ta) { offs.push(p); p += t.length; } offs.push(p); }
  for (const [pi, pj] of [...pairs, [ta.length, tb.length]]) {
    const delLen = offs[pi] - offs[i];
    const ins = tb.slice(j, pj).join('');
    if (delLen || ins) ops.push([offs[i], delLen, ins]);
    i = pi + 1; j = pj + 1;
  }
  void pos;
  for (let k = ops.length - 1; k >= 0; k--) {
    const [start, len, ins] = ops[k];
    let idx = nodes.findIndex((x, q) => start >= x.start && (start < x.start + x.node.data.length || q === nodes.length - 1));
    if (idx < 0) idx = nodes.length - 1;
    let remaining = len, at = start - nodes[idx].start, first = true;
    while (idx < nodes.length) {
      const t = nodes[idx].node;
      const take = Math.min(remaining, t.data.length - at);
      t.data = t.data.slice(0, at) + (first ? ins : '') + t.data.slice(at + take);
      remaining -= take; first = false;
      if (remaining <= 0) break;
      idx++; at = 0;
    }
  }
}
