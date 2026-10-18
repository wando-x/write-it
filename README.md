<p align="center">
  <img src="build/icon-256.png" width="96" alt="Logo de Write It">
</p>

<h1 align="center">Write It</h1>

<p align="center">
  Un procesador de textos para Windows, sencillo y bonito, con <b>dictado por voz</b> y una <b>IA que ordena tus textos</b> sin cambiar tu forma de escribir.<br>
  Todo funciona en tu computador: sin cuentas, sin suscripciones y sin enviar tus textos a internet.
</p>

---

## Descargar e instalar

1. Ve a la sección [**Releases**](../../releases) de este repositorio.
2. Descarga **`Write-It-Setup-1.0.1.exe`** (instalador) o **`Write-It-Portable-1.0.1.exe`** (no necesita instalación, se abre directamente).
3. Ábrelo. Si Windows muestra «Windows protegió su PC», pulsa **Más información → Ejecutar de todas formas**. Aparece porque la app no está firmada con un certificado de pago; el código es abierto y puedes revisarlo aquí mismo.

> **Si Windows dice que «una directiva de Control de aplicaciones bloqueó este archivo»**, tu equipo tiene activado *Smart App Control*, que solo deja abrir programas firmados con certificado. Puedes desactivarlo en *Seguridad de Windows → Control de aplicaciones y navegador → Smart App Control* (ojo: después no se puede volver a activar sin reinstalar Windows), o ejecutar la app desde el código con `npm start` (ver más abajo).

Requisitos: Windows 10 u 11 de 64 bits. Para la IA se recomiendan 8 GB de RAM (funciona con 4 GB usando los modelos ligeros).

## Qué puede hacer

**Escribir y dar formato** como en Word
- Fuentes, tamaños, negrita, cursiva, subrayado, colores, resaltado, mayúsculas y minúsculas, copiar formato.
- Estilos (Título, Título 1–3, Cita…), listas con viñetas y numeradas, sangrías, interlineado y alineación.
- Listas automáticas: escribe `- ` o `1. ` al comienzo de una línea.
- Regla con sangrías que se pueden arrastrar.

**Insertar**
- Tablas (con estilos, filas, columnas y celdas combinadas), imágenes (desde archivo, pegadas o arrastradas), vínculos, portada, saltos de página, fecha y hora, símbolos, notas al final, comentarios.
- Encabezado, pie de página y números de página (por ejemplo, «Página 1 de 10»).
- Tabla de contenido automática a partir de los títulos.

**Página**
- Tamaño (A4, Carta, Oficio…), orientación, márgenes, columnas, color de página y marca de agua.
- Plantillas: carta formal, currículum, informe, trabajo académico en formato APA y apuntes de clase.

**Revisar**
- Corrector ortográfico en español e inglés (clic derecho sobre la palabra subrayada).
- Buscar y reemplazar, contar palabras, leer en voz alta, panel de navegación por títulos.

**Archivos**
- Abre y guarda documentos de **Word (.docx)**.
- Exporta a **PDF**, página web y texto.
- Formato propio **.wit**, que conserva todo (comentarios, notas, marca de agua…).
- Autoguardado y recuperación de documentos si la app se cierra de golpe.

**Vista**
- Modo de lectura, modo enfoque (sin distracciones), zoom.
- Interruptor de tema claro / oscuro arriba a la derecha (oscuro cálido, no negro puro), con una transición en onda.
- Pestaña **Favoritos** con tus comandos más usados (se personaliza en Opciones).

## Dictado por voz

Pulsa **Dictar** (pestaña Inicio o *AI*, o `Ctrl+Mayús+D`) y habla. El texto aparece donde está el cursor cada vez que haces una pausa.

- Usa [Whisper](https://github.com/openai/whisper) de OpenAI, que funciona **sin internet** en tu computador.
- La primera vez te pedirá descargar el modelo: **Whisper Small** (250 MB, recomendado) o **Whisper Base** (77 MB, para equipos modestos).
- Idiomas: español, inglés, portugués, francés, italiano y alemán.

## IA local (pestaña AI)

Funciona dentro de tu computador: tus textos no salen de aquí. Antes de aplicar cualquier cambio verás una ventana de revisión (verde = añadido, rojo = quitado) para aceptarlo, pedir otra versión o descartarlo. Todo se puede deshacer con `Ctrl+Z`.

- **Ordenar texto** (`Ctrl+Mayús+O`): pone puntos, comas, signos de interrogación, mayúsculas, tildes y separa en párrafos. **Nunca cambia tus palabras**: la app compara el resultado con tu texto y, si la IA intenta cambiar, añadir o quitar alguna palabra, la descarta y restaura la tuya. Así siempre suena a ti.
- **Reescribir**: *Más pulido*, *Más profesional*, *Más casual*, *Más corto* o *Más claro*.
- **Traducir**: a inglés, español, portugués, francés, italiano o alemán.
- **Escribir por mí**: dile qué necesitas («un correo a mi profesor pidiendo una prórroga»), elige extensión y tono, y lo redacta donde está el cursor.

Si no seleccionas nada, trabaja sobre todo el documento.

Usa [llama.cpp](https://github.com/ggml-org/llama.cpp) con el modelo **Qwen2.5 1,5B** (1,1 GB, recomendado) o **Qwen2.5 0,5B** (490 MB, el más ligero). Usa la tarjeta gráfica si tienes una compatible con Vulkan (**AMD Radeon**, NVIDIA o Intel) y, si no, el procesador. Se descarga una sola vez desde **AI → Modelos de IA**; es opcional y el resto de la app funciona sin ella.

## Atajos de teclado

Por defecto se usan los de **Word en español**; en *Opciones* puedes cambiar a los de Word en inglés.

| Acción | Español (predeterminado) | Inglés |
|---|---|---|
| Negrita / Cursiva / Subrayado | `Ctrl+N` / `Ctrl+K` / `Ctrl+S` | `Ctrl+B` / `Ctrl+I` / `Ctrl+U` |
| Guardar / Abrir / Nuevo | `Ctrl+G` / `Ctrl+A` / `Ctrl+U` | `Ctrl+S` / `Ctrl+O` / `Ctrl+N` |
| Buscar / Reemplazar | `Ctrl+B` / `Ctrl+L` | `Ctrl+F` / `Ctrl+H` |
| Seleccionar todo | `Ctrl+E` | `Ctrl+A` |
| Centrar / Justificar | `Ctrl+T` / `Ctrl+J` | `Ctrl+E` / `Ctrl+J` |
| Deshacer / Rehacer | `Ctrl+Z` / `Ctrl+Y` | `Ctrl+Z` / `Ctrl+Y` |
| Salto de página | `Ctrl+Intro` | `Ctrl+Intro` |
| Título 1 / 2 / 3 | `Ctrl+Alt+1` / `2` / `3` | igual |
| Dictar / Ordenar texto | `Ctrl+Mayús+D` / `Ctrl+Mayús+O` | igual |
| Buscar comandos | `Alt+Q` | `Alt+Q` |

## Para desarrolladores

```bash
git clone <este repositorio>
cd write-it
npm install
npm start          # abre la app
npm test           # autoprueba: recorre las funciones y guarda capturas
npm run test:ai    # prueba real del dictado y de la IA (descarga los modelos)
npm run dist       # crea el instalador y la versión portable en dist/
```

Estructura:

| Archivo | Qué contiene |
|---|---|
| `main.js` | Proceso principal de Electron: ventanas, archivos, Word/PDF, corrector, recuperación |
| `ai-engine.js` | Dictado (Transformers.js + Whisper) e IA local (node-llama-cpp) |
| `preload.js` | Puente seguro entre la interfaz y el sistema |
| `src/js/editor.js` | Núcleo del editor: selección, historial, formato, paginación |
| `src/js/features.js` | Tablas, imágenes, comentarios, notas, índice, buscar, regla |
| `src/js/ui.js`, `backstage.js` | Cinta de opciones, menús, diálogos y menú Archivo |
| `src/js/ai.js` | Dictado y revisión de cambios de la IA en la interfaz |
| `src/selftest.js` | Autoprueba (`npm test`) |

## Licencia

[MIT](LICENSE). Software libre: úsalo, cópialo y modifícalo.

Incluye o descarga a petición: iconos [Fluent UI](https://github.com/microsoft/fluentui-system-icons) (MIT), [Electron](https://www.electronjs.org/) (MIT), [mammoth](https://github.com/mwilliamson/mammoth.js) (BSD-2), [html-to-docx](https://github.com/privateOmega/html-to-docx) (MIT), [Transformers.js](https://github.com/huggingface/transformers.js) (Apache 2.0), [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) (MIT), modelos [Whisper](https://huggingface.co/openai/whisper-small) (MIT) y [Qwen2.5](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct) (Apache 2.0).
