// Prueba real de la IA local: descarga los modelos recomendados (si faltan), dicta un audio y ordena un texto.
// Uso: npm run test:ai
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { AIEngine } = require('../ai-engine');

const userData = path.join(app.getPath('appData'), 'Write It');
let settings = {};
const ai = new AIEngine({
  userData,
  getSettings: () => settings,
  setSettings: (p) => { settings = { ...settings, ...p }; },
  broadcast: (ch, d) => { if (d) process.stdout.write(`\r  descargando ${d.id}: ${Math.round(d.received / 1e6)} / ${Math.round((d.total || 0) / 1e6)} MB   `); },
});

function wavToFloat32(file) {
  const b = fs.readFileSync(file);
  let o = 12, fmt, data;
  while (o < b.length) {
    const id = b.toString('ascii', o, o + 4), len = b.readUInt32LE(o + 4);
    if (id === 'fmt ') fmt = { channels: b.readUInt16LE(o + 10), rate: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) };
    if (id === 'data') data = b.subarray(o + 8, o + 8 + len);
    o += 8 + len + (len % 2);
  }
  const n = data.length / 2;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = data.readInt16LE(i * 2) / 32768;
  return { rate: fmt.rate, audio: out };
}

app.whenReady().then(async () => {
  const t = (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)} s] ${s}`);
  const t0 = Date.now();
  let failed = 0;
  try {
    for (const [kind, id] of [['whisper', 'whisper-small'], ['llm', 'qwen2.5-1.5b']]) {
      const st = ai.status();
      if (!st[kind].find(m => m.id === id).downloaded) {
        t(`descargando ${id}…`);
        const r = await ai.download(kind, id);
        console.log('');
        if (!r.ok) throw new Error(r.error || 'descarga cancelada');
      }
      t(`${id} listo`);
    }

    // audio de prueba con la voz de Windows, 16 kHz mono
    const wav = path.join(os.tmpdir(), 'writeit-voz.wav');
    const phrase = 'Hello, this is a dictation test for Write It. Today I want to write a short letter to my friends.';
    execFileSync('powershell', ['-NoProfile', '-Command',
      `Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $f=New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000,[System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,[System.Speech.AudioFormat.AudioChannel]::Mono); $s.SetOutputToWaveFile('${wav}',$f); $s.Speak('${phrase}'); $s.Dispose()`]);
    const { rate, audio } = wavToFloat32(wav);
    t(`audio: ${(audio.length / rate).toFixed(1)} s a ${rate} Hz`);
    const tr = await ai.transcribe({ audio, lang: 'english' });
    if (tr.error) throw new Error(tr.error);
    t(`dictado: "${tr.text.trim()}"`);
    const ok1 = /dictation test/i.test(tr.text) && /friends/i.test(tr.text);
    console.log(ok1 ? 'OK   dictado con Whisper' : 'FALLO dictado'); if (!ok1) failed++;

    const raw = 'bueno hoy fue un dia largo la verdad en la mañana fui a la universidad y despues me tocó trabajar toda la tarde osea casi no tuve tiempo de nada pero bueno mañana sera otro dia y espero poder descansar un poco mas';
    const g = await ai.generate({ mode: 'punctuate', text: raw });
    if (g.error) throw new Error(g.error);
    t(`IA (ordenar): "${g.text.trim()}"`);
    t(`aceleración: ${ai.accel}`);
    const ok2 = /[.,]/.test(g.text) && g.text.length > raw.length * 0.8;
    console.log(ok2 ? 'OK   ordenar texto con IA local' : 'FALLO ordenar texto'); if (!ok2) failed++;

    const g2 = await ai.generate({ mode: 'rewrite', text: raw });
    if (g2.error) throw new Error(g2.error);
    t(`IA (reformular): "${g2.text.trim()}"`);
  } catch (err) {
    console.log('FALLO', err.stack || err.message);
    failed++;
  }
  await ai.unloadLlm();
  app.exit(failed ? 1 : 0);
});
