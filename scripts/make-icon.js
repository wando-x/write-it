// Genera el logo de Write It (fondo blanco, "W" negra en Times New Roman)
// Uso: npm run icon   ->  build/icon.png (1024 px) y build/icon.ico (16–256 px)
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const OUT = path.join(__dirname, '..', 'build');

const html = `<!doctype html><html><body><script>
function draw(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  // en tamaños pequeños el cuadro ocupa todo; en grandes deja margen como los iconos de Windows/macOS
  const pad = size <= 32 ? 0 : Math.round(size * 0.06);
  const s = size - pad * 2;
  const r = s * 0.2;
  g.save();
  if (size > 32) { g.shadowColor = 'rgba(0,0,0,0.22)'; g.shadowBlur = size * 0.03; g.shadowOffsetY = size * 0.012; }
  g.beginPath();
  g.roundRect(pad, pad, s, s, r);
  g.fillStyle = '#ffffff';
  g.fill();
  g.restore();
  g.lineWidth = Math.max(1, size / 128);
  g.strokeStyle = 'rgba(0,0,0,0.16)';
  g.beginPath();
  g.roundRect(pad + g.lineWidth / 2, pad + g.lineWidth / 2, s - g.lineWidth, s - g.lineWidth, r);
  g.stroke();
  g.fillStyle = '#000000';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const fs = s * (size <= 24 ? 0.9 : 0.78);
  g.font = 'bold ' + fs + 'px "Times New Roman", Times, serif';
  const m = g.measureText('W');
  const h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  g.fillText('W', size / 2, size / 2 + h / 2 - m.actualBoundingBoxDescent);
  return c.toDataURL('image/png');
}
window.render = (sizes) => sizes.map(draw);
</script></body></html>`;

function ico(pngs) {
  // ICO con imágenes PNG embebidas (admitido desde Windows Vista)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({ size, buf }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(buf.length, o + 8); dir.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, dir, ...pngs.map(p => p.buf)]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await win.webContents.executeJavaScript('document.fonts.ready');
  const all = [...SIZES, 1024];
  const urls = await win.webContents.executeJavaScript(`render(${JSON.stringify(all)})`);
  const bufs = urls.map(u => Buffer.from(u.split(',')[1], 'base64'));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'icon.png'), bufs[bufs.length - 1]);
  fs.writeFileSync(path.join(OUT, 'icon-256.png'), bufs[SIZES.indexOf(256)]);
  fs.writeFileSync(path.join(OUT, 'icon.ico'), ico(SIZES.map((size, i) => ({ size, buf: bufs[i] }))));
  console.log('Logo generado en', OUT);
  app.quit();
});
