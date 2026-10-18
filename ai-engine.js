// Write It — IA local: dictado (Whisper vía Transformers.js) y corrección de textos (llama.cpp)
// Todo se ejecuta en el equipo del usuario. Los modelos se descargan una sola vez, a petición.
'use strict';

const path = require('path');
const fs = require('fs');
const https = require('https');

const WHISPER_MODELS = [
  { id: 'whisper-small', repo: 'onnx-community/whisper-small', name: 'Whisper Small', size: '250 MB', recommended: true,
    desc: 'Entiende muy bien el español. Necesita unos 2 GB de RAM libre.' },
  { id: 'whisper-base', repo: 'onnx-community/whisper-base', name: 'Whisper Base', size: '77 MB',
    desc: 'Más rápido y ligero, para equipos modestos. Algo menos preciso.' },
];

const LLM_MODELS = [
  { id: 'qwen2.5-1.5b', name: 'Qwen2.5 1,5B', size: '1,1 GB', bytes: 1117320736, recommended: true,
    file: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    desc: 'Buen equilibrio entre calidad y velocidad. Funciona con 4 GB de RAM.' },
  { id: 'qwen2.5-0.5b', name: 'Qwen2.5 0,5B', size: '490 MB', bytes: 491400032,
    file: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    desc: 'El más ligero: corre en casi cualquier computador. Útil sobre todo para puntuación.' },
];

const PROMPTS = {
  punctuate: {
    system: 'Eres un corrector de puntuación. Tu única tarea es poner o corregir los signos de puntuación (puntos, comas, punto y coma, dos puntos, signos de interrogación y de exclamación de apertura y de cierre), las mayúsculas, las tildes y los espacios, y separar el texto en párrafos dejando una línea en blanco cuando cambia la idea. '
      + 'Reglas estrictas: no cambies, no añadas, no quites y no reordenes ninguna palabra. No resumas. No expliques nada. Conserva las muletillas, el tono, el estilo y el idioma del autor tal como están. Responde únicamente con el texto corregido.',
    examples: [
      ['hola como estas yo bien la verdad es que ayer fui al cine con mi hermano y estuvo buenisimo despues fuimos a comer pero bueno eso ya es otra historia',
        'Hola, ¿cómo estás? Yo bien. La verdad es que ayer fui al cine con mi hermano y estuvo buenísimo. Después fuimos a comer, pero bueno, eso ya es otra historia.'],
    ],
  },
  rewrite: {
    system: 'Eres un editor cuidadoso. Reescribe el texto para que quede claro, ordenado y bien puntuado, separado en párrafos con una línea en blanco. '
      + 'Mantén el mismo tono, el mismo idioma, la misma persona gramatical y las expresiones propias del autor; que siga sonando como él. No añadas información ni ideas nuevas, no quites ideas y no lo vuelvas más formal de lo que es. No expliques nada. Responde únicamente con el texto reescrito.',
    examples: [
      ['o sea yo creo que el proyecto va bien pero hay que apurarse con lo del diseño porque si no no llegamos y eso seria un problema la verdad',
        'O sea, yo creo que el proyecto va bien, pero hay que apurarse con lo del diseño, porque si no, no llegamos. Y eso sería un problema, la verdad.'],
    ],
  },
};

class AIEngine {
  constructor({ userData, getSettings, setSettings, broadcast }) {
    this.dir = path.join(userData, 'models');
    this.getSettings = getSettings;
    this.setSettings = setSettings;
    this.broadcast = broadcast;
    this.downloading = null;
    this.asr = null; this.asrId = null;
    this.llama = null; this.model = null; this.context = null; this.modelId = null;
    this.abort = null;
    this.queue = Promise.resolve();
  }

  whisperDir() { return path.join(this.dir, 'whisper'); }
  llmPath(m) { return path.join(this.dir, 'llm', m.file); }
  whisperReady(m) { return fs.existsSync(path.join(this.whisperDir(), m.id + '.ok')); }

  status() {
    const s = this.getSettings();
    const whisper = WHISPER_MODELS.map(m => ({ id: m.id, name: m.name, size: m.size, desc: m.desc, recommended: !!m.recommended, downloaded: this.whisperReady(m) }));
    const llm = LLM_MODELS.map(m => ({ id: m.id, name: m.name, size: m.size, desc: m.desc, recommended: !!m.recommended, downloaded: fs.existsSync(this.llmPath(m)) }));
    const pick = (list, want) => (list.find(m => m.id === want && m.downloaded) || list.find(m => m.downloaded) || {}).id || want || list[0].id;
    return {
      whisper, llm, dir: this.dir, accel: this.accel || null,
      selected: { whisper: pick(whisper, s.aiWhisper), llm: pick(llm, s.aiLlm) },
      downloading: this.downloading && { kind: this.downloading.kind, id: this.downloading.id, received: this.downloading.received, total: this.downloading.total },
    };
  }

  progress() { this.broadcast('ai:progress', this.status().downloading); }

  async download(kind, id) {
    if (this.downloading) return { error: 'Ya hay una descarga en curso.' };
    const list = kind === 'whisper' ? WHISPER_MODELS : LLM_MODELS;
    const m = list.find(x => x.id === id);
    if (!m) return { error: 'Modelo desconocido.' };
    this.downloading = { kind, id, received: 0, total: m.bytes || 0, canceled: false };
    this.progress();
    try {
      if (kind === 'whisper') await this.downloadWhisper(m);
      else await this.downloadFile(m.url, this.llmPath(m));
      this.setSettings(kind === 'whisper' ? { aiWhisper: id } : { aiLlm: id });
      return { ok: true };
    } catch (err) {
      if (this.downloading && this.downloading.canceled) return { canceled: true };
      return { error: 'No se pudo descargar el modelo. Revisa tu conexión a internet e inténtalo de nuevo.\n\n' + err.message };
    } finally {
      this.downloading = null;
      this.progress();
    }
  }

  cancelDownload() {
    if (!this.downloading) return;
    this.downloading.canceled = true;
    if (this.downloading.req) this.downloading.req.destroy(new Error('Cancelado'));
  }

  downloadFile(url, dest, redirects = 0) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const part = dest + '.part';
    return new Promise((resolve, reject) => {
      const req = https.get(url, { headers: { 'User-Agent': 'WriteIt/1.0' } }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 8) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          this.downloadFile(next, dest, redirects + 1).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) { res.resume(); reject(new Error('HTTP ' + res.statusCode)); return; }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        if (total) this.downloading.total = total;
        const out = fs.createWriteStream(part);
        let last = 0;
        res.on('data', (chunk) => {
          this.downloading.received += chunk.length;
          const now = Date.now();
          if (now - last > 250) { last = now; this.progress(); }
        });
        res.pipe(out);
        out.on('finish', () => {
          out.close(() => {
            if (this.downloading.canceled) { fs.rmSync(part, { force: true }); reject(new Error('Cancelado')); return; }
            if (total && fs.statSync(part).size !== total) { fs.rmSync(part, { force: true }); reject(new Error('Descarga incompleta')); return; }
            fs.renameSync(part, dest);
            resolve();
          });
        });
        res.on('error', (e) => { out.destroy(); fs.rmSync(part, { force: true }); reject(e); });
      });
      req.on('error', (e) => { fs.rmSync(part, { force: true }); reject(e); });
      req.setTimeout(60000, () => req.destroy(new Error('Tiempo de espera agotado')));
      this.downloading.req = req;
    });
  }

  async transformers() {
    const t = await import('@huggingface/transformers');
    t.env.cacheDir = this.whisperDir();
    t.env.localModelPath = this.whisperDir();
    return t;
  }

  async downloadWhisper(m) {
    const t = await this.transformers();
    t.env.allowRemoteModels = true;
    const files = {};
    const pipe = await t.pipeline('automatic-speech-recognition', m.repo, {
      dtype: 'q8', device: 'cpu',
      progress_callback: (p) => {
        if (this.downloading.canceled) throw new Error('Cancelado');
        if (p.status === 'progress' && p.file) {
          files[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
          const vals = Object.values(files);
          this.downloading.received = vals.reduce((a, f) => a + f.loaded, 0);
          this.downloading.total = Math.max(vals.reduce((a, f) => a + f.total, 0), this.downloading.received);
          this.progress();
        }
      },
    });
    fs.writeFileSync(path.join(this.whisperDir(), m.id + '.ok'), new Date().toISOString());
    this.asr = pipe; this.asrId = m.id;
  }

  async remove(kind, id) {
    if (kind === 'whisper') {
      const m = WHISPER_MODELS.find(x => x.id === id);
      if (!m) return false;
      if (this.asrId === id) { try { await this.asr.dispose(); } catch { /* */ } this.asr = null; this.asrId = null; }
      fs.rmSync(path.join(this.whisperDir(), m.id + '.ok'), { force: true });
      fs.rmSync(path.join(this.whisperDir(), ...m.repo.split('/')), { recursive: true, force: true });
    } else {
      const m = LLM_MODELS.find(x => x.id === id);
      if (!m) return false;
      if (this.modelId === id) await this.unloadLlm();
      fs.rmSync(this.llmPath(m), { force: true });
    }
    return true;
  }

  select(kind, id) { this.setSettings(kind === 'whisper' ? { aiWhisper: id } : { aiLlm: id }); return true; }

  // ---------- dictado ----------
  async transcribe({ audio, lang }) {
    const st = this.status();
    const m = WHISPER_MODELS.find(x => x.id === st.selected.whisper);
    if (!m || !this.whisperReady(m)) return { error: 'Primero descarga un modelo de dictado en Dictado e IA › Modelos de IA.' };
    return this.serial(async () => {
      if (!this.asr || this.asrId !== m.id) {
        const t = await this.transformers();
        t.env.allowRemoteModels = false;
        if (this.asr) { try { await this.asr.dispose(); } catch { /* */ } }
        this.asr = await t.pipeline('automatic-speech-recognition', m.repo, { dtype: 'q8', device: 'cpu' });
        this.asrId = m.id;
      }
      const data = audio instanceof Float32Array ? audio : new Float32Array(Object.values(audio));
      const out = await this.asr(data, { language: lang || 'spanish', task: 'transcribe', chunk_length_s: 30, stride_length_s: 4 });
      return { text: (Array.isArray(out) ? out.map(o => o.text).join(' ') : out.text) || '' };
    });
  }

  // ---------- modelo de lenguaje ----------
  async loadLlm(m) {
    if (this.model && this.modelId === m.id) return;
    await this.unloadLlm();
    const { getLlama } = await import('node-llama-cpp');
    const cpu = () => getLlama({ build: 'never', gpu: false });
    if (!this.llama) {
      // Vulkan funciona con gráficas AMD Radeon, NVIDIA e Intel; si no hay ninguna compatible, procesador
      try { this.llama = await getLlama({ build: 'never', gpu: 'vulkan' }); }
      catch { this.llama = await cpu(); }
    }
    try {
      this.model = await this.llama.loadModel({ modelPath: this.llmPath(m) });
      this.context = await this.model.createContext({ contextSize: 4096 });
    } catch (err) {
      // p. ej. poca memoria de vídeo: reintentar en el procesador
      if (this.llama.gpu === false) throw err;
      await this.unloadLlm();
      this.llama = await cpu();
      this.model = await this.llama.loadModel({ modelPath: this.llmPath(m) });
      this.context = await this.model.createContext({ contextSize: 4096 });
    }
    this.modelId = m.id;
    try {
      const names = this.llama.gpu ? await this.llama.getGpuDeviceNames() : [];
      this.accel = this.llama.gpu ? `Tarjeta gráfica (${names.join(', ') || this.llama.gpu}, Vulkan)` : 'Procesador';
    } catch { this.accel = this.llama.gpu ? 'Tarjeta gráfica (Vulkan)' : 'Procesador'; }
  }

  async unloadLlm() {
    try { if (this.context) await this.context.dispose(); } catch { /* */ }
    try { if (this.model) await this.model.dispose(); } catch { /* */ }
    this.context = null; this.model = null; this.modelId = null;
  }

  async generate({ mode, text }) {
    const st = this.status();
    const m = LLM_MODELS.find(x => x.id === st.selected.llm);
    if (!m || !fs.existsSync(this.llmPath(m))) return { error: 'Primero descarga un modelo de IA en Dictado e IA › Modelos de IA.' };
    const p = PROMPTS[mode] || PROMPTS.punctuate;
    return this.serial(async () => {
      await this.loadLlm(m);
      const { LlamaChatSession } = await import('node-llama-cpp');
      const seq = this.context.getSequence();
      const session = new LlamaChatSession({ contextSequence: seq, systemPrompt: p.system });
      const history = [{ type: 'system', text: p.system }];
      for (const [u, a] of p.examples) history.push({ type: 'user', text: u }, { type: 'model', response: [a] });
      session.setChatHistory(history);
      this.abort = new AbortController();
      try {
        const words = text.split(/\s+/).length;
        const answer = await session.prompt(text, {
          temperature: mode === 'rewrite' ? 0.3 : 0,
          maxTokens: Math.min(3000, Math.round(words * 3) + 80),
          signal: this.abort.signal,
          stopOnAbortSignal: true,
        });
        return { text: answer };
      } finally {
        this.abort = null;
        try { session.dispose(); } catch { /* */ }
        try { seq.dispose(); } catch { /* */ }
      }
    });
  }

  cancel() { if (this.abort) this.abort.abort(); }

  // una tarea de IA a la vez
  serial(fn) {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run.catch(err => ({ error: err.message || String(err) }));
  }
}

module.exports = { AIEngine, WHISPER_MODELS, LLM_MODELS };
