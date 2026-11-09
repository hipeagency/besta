/* Exportar el muro: vídeo (MP4/WebM), secuencia PNG en ZIP, GIF, y los
   ajustes en JSON (para llevarlos a otro ordenador o guardar versiones).

   El grabador del navegador le pone a cada fotograma la hora del reloj y
   pasa de las marcas de tiempo que le demos: si el muro se dibuja más
   rápido que el vídeo, 30 s salían en 2 s. Así que se graba a ritmo
   real, esperando a que toque cada fotograma: tarda lo que dura el
   vídeo, pero sale exacto. Para ir rápido y sin pérdida está el PNG. */
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { fmt, isVid, newCv, sRate, vIn, vLen, vRate, type Studio } from "./engine";

type Say = (msg: string, tone?: "error") => void;

export interface VFormat { id: string; ext: string; label: string; types: string[] | null }
const VFMT: VFormat[] = [
  { id: "mp4", ext: "mp4", label: "MP4 · H.264 — el que traga todo el mundo", types: ["video/mp4;codecs=avc1.42E01E", "video/mp4;codecs=avc1", "video/mp4;codecs=h264", "video/mp4"] },
  { id: "webm9", ext: "webm", label: "WebM · VP9 — más nitidez, menos compatible", types: ["video/webm;codecs=vp9", "video/webm"] },
  { id: "webm8", ext: "webm", label: "WebM · VP8 — el más compatible de los WebM", types: ["video/webm;codecs=vp8"] },
  { id: "png", ext: "zip", label: "Secuencia PNG (ZIP) — sin pérdida, para montar", types: null },
];
const recType = (f: VFormat) => f.types && typeof MediaRecorder !== "undefined"
  ? f.types.find(x => { try { return MediaRecorder.isTypeSupported(x); } catch { return false; } }) ?? null
  : null;
let available: VFormat[] | null = null;
/** Formatos que este navegador sabe grabar (la secuencia PNG siempre). */
export const formats = () => (available ??= VFMT.filter(f => !f.types || recType(f)));
export const currentFormat = (id: string) => formats().find(f => f.id === id) ?? formats()[0];

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const untilMs = async (ms: number) => { let d = ms - performance.now(); while (d > 0) { await wait(Math.min(d, 40)); d = ms - performance.now(); } };
export function stamp() {
  const d = new Date(), p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
export function save(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

/* Para y devuelve si estaba sonando, para reanudar al terminar. */
function pause(st: Studio) { const was = st.playing; if (was) st.play(false); return was; }

/* cuánto dura de verdad lo exportado */
function measure(blob: Blob): Promise<number> {
  return new Promise(r => {
    const v = document.createElement("video"), url = URL.createObjectURL(blob);
    let fin = (d: number) => { fin = () => {}; URL.revokeObjectURL(url); r(d); };
    v.preload = "metadata"; v.muted = true;
    v.onloadedmetadata = () => {
      if (isFinite(v.duration) && v.duration > 0) return fin(v.duration);
      v.ontimeupdate = () => { v.ontimeupdate = null; fin(isFinite(v.duration) ? v.duration : 0); };
      v.currentTime = 1e6;                 // truco viejo: obliga a calcular la duración
    };
    v.onerror = () => fin(0);
    setTimeout(() => fin(0), 5000);
    v.src = url;
  });
}

export async function exportVideo(st: Studio, say: Say) {
  const f = currentFormat(st.set.vfmt);
  if (f.id === "png") return exportPNG(st);
  const type = recType(f);
  if (!type) { say("Este navegador no sabe grabar vídeo desde el lienzo.", "error"); return; }
  const { secs, fps } = st.set, N = Math.round(secs * fps), per = 1000 / fps;
  const was = pause(st), cv = st.cv;
  try {
    // tanteo: si el muro tarda más en dibujarse de lo que dura el fotograma,
    // el vídeo sale a cámara lenta y más largo. Mejor decirlo antes de grabar.
    st.setBusy("midiendo el muro"); await wait(0);
    const t1 = performance.now();
    for (let i = 0; i < 3; i++) { await st.seekAll(i / N); st.draw(i / N); }
    const perFrame = (performance.now() - t1) / 3, fpsMax = Math.max(1, Math.floor(1000 / perFrame));
    st.setBusy(false);
    if (perFrame > per * 0.85 && !confirm(
      `A ${cv.width}×${cv.height} el muro tarda ${Math.round(perFrame)} ms en dibujar cada fotograma, y a ${fps} fps tocarían ${Math.round(per)} ms. ` +
      `El grabador del navegador va con el reloj, así que el vídeo saldría a cámara lenta y más largo de lo que pides.\n\n` +
      `Baja la resolución, o pon los fotogramas en ${fpsMax}, o exporta la secuencia PNG, que sale siempre con la duración exacta.\n\n¿Lo grabo igualmente?`)) return;

    const stream = cv.captureStream(0), track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 60e6 });
    const parts: Blob[] = [];
    rec.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
    const done = new Promise(r => { rec.onstop = r; });
    rec.start();
    const t0 = performance.now();
    let late = 0;
    for (let i = 0; i < N; i++) {
      const t = i / N;
      await st.seekAll(t);
      st.draw(t);
      const due = t0 + i * per;                 // el instante en que le toca a este fotograma
      if (performance.now() - due > per) late++;
      await untilMs(due);
      track.requestFrame();
      st.setBusy("grabando vídeo", `fotograma ${i + 1} de ${N} · a ritmo real, quedan ${Math.max(0, Math.ceil(((N - i) * per) / 1000))} s`, i / N);
      await wait(0);
    }
    await untilMs(t0 + N * per);               // el último fotograma también dura lo suyo
    const real = (performance.now() - t0) / 1000;
    rec.stop(); await done;
    st.setBusy("comprobando el archivo", "", 1);
    const blob = new Blob(parts, { type });
    save(blob, `besta-muro-${stamp()}.${f.ext}`);
    const dur = (await measure(blob)) || real;
    if (Math.abs(dur - secs) > Math.max(0.6, secs * 0.15))
      say(`Ojo: el archivo ha salido de ${fmt(dur)} s en vez de ${secs} s. ` +
        (late ? `El muro no da abasto a esta resolución (${late} de ${N} fotogramas llegaron tarde): baja la resolución, pon ${fpsMax} fps o exporta la secuencia PNG.`
          : "Prueba con otro formato de vídeo, o exporta la secuencia PNG, que sale siempre exacta."), "error");
  } finally {
    st.setBusy(false);
    if (was) st.play(true);
  }
}

/* ZIP sin comprimir: los PNG ya vienen comprimidos por dentro */
const CRCT = (() => {
  const T = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
  return T;
})();
function crc32(u8: Uint8Array) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRCT[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zipStore(files: { name: string; data: Uint8Array<ArrayBuffer> }[]) {
  const te = new TextEncoder(), body: BlobPart[] = [], dir: BlobPart[] = [];
  let off = 0, dl = 0;
  for (const f of files) {
    const nm = te.encode(f.name), n = f.data.length, crc = crc32(f.data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, n, true); lh.setUint32(22, n, true);
    lh.setUint16(26, nm.length, true);
    body.push(lh.buffer, nm, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, n, true); ch.setUint32(24, n, true);
    ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
    dir.push(ch.buffer, nm);
    off += 30 + nm.length + n; dl += 46 + nm.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, dl, true); end.setUint32(16, off, true);
  return new Blob([...body, ...dir, end.buffer], { type: "application/zip" });
}

/* secuencia de PNG: sin grabador de por medio, calidad intacta */
export async function exportPNG(st: Studio) {
  const { secs, fps } = st.set, N = secs * fps;
  const was = pause(st);
  const files: { name: string; data: Uint8Array<ArrayBuffer> }[] = [];
  try {
    for (let f = 0; f < N; f++) {
      const t = f / N;
      await st.seekAll(t); st.draw(t);
      const blob = await new Promise<Blob | null>(r => st.cv.toBlob(r, "image/png"));
      if (!blob) throw new Error("El navegador no ha podido guardar el fotograma.");
      files.push({ name: `besta-${String(f).padStart(4, "0")}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
      if (f === 4) {                          // con cinco fotogramas ya se sabe lo que pesa
        const est = Math.round((blob.size * N) / 1e6);
        if (est > 600 && !confirm(`La secuencia va a pesar unos ${est} MB y hay que tenerla entera en memoria antes de guardarla. ` +
          `El navegador puede quedarse sin aire: si quieres, cancela y baja la resolución, los segundos o los fotogramas.\n\n¿Sigo?`)) return;
      }
      st.setBusy("guardando fotogramas", `${f + 1} de ${N}`, (f / N) * 0.96);
      await wait(0);
    }
    st.setBusy("montando el ZIP", `${files.length} fotogramas`, 0.98); await wait(0);
    save(zipStore(files), `besta-muro-${stamp()}-png.zip`);
  } finally {
    st.setBusy(false);
    if (was) st.play(true);
  }
}

/* GIF: hasta 15 fps y 900 px de ancho, que si no pesa una barbaridad */
export async function exportGif(st: Studio) {
  const { secs } = st.set, fps = Math.min(15, st.set.fps), N = Math.round(secs * fps);
  const was = pause(st);
  try {
    const { PW, PH } = st.dims();
    const gw = Math.min(900, PW), gh = Math.round((gw * PH) / PW);
    const tmp = newCv(gw, gh), tg = tmp.getContext("2d", { willReadFrequently: true })!;
    const gif = GIFEncoder();
    for (let f = 0; f < N; f++) {
      const t = f / N;
      await st.seekAll(t); st.draw(t);
      tg.clearRect(0, 0, gw, gh); tg.drawImage(st.cv, 0, 0, gw, gh);
      const { data } = tg.getImageData(0, 0, gw, gh);
      const palette = quantize(data, 256);
      gif.writeFrame(applyPalette(data, palette), gw, gh, { palette, delay: Math.round(1000 / fps) });
      st.setBusy("montando GIF", `fotograma ${f + 1} de ${N}`, f / N);
      await wait(0);
    }
    gif.finish();
    save(new Blob([gif.bytes()], { type: "image/gif" }), `besta-muro-${stamp()}.gif`);
  } finally {
    st.setBusy(false);
    if (was) st.play(true);
  }
}

/* ══ ajustes en JSON ═══════════════════════════════════════════════ */
export function exportSettings(st: Studio) {
  const p = st.set, V = st.scene, { PW, PH } = st.dims();
  const cfg = {
    formato: p.aspect, lienzo: [PW, PH], escala: p.scale, segundos: p.secs, fps: p.fps,
    textura: { lineas: p.scan, grano: p.grain, banda: p.sweep, parpadeo: p.flick },
    cinta: { ...st.tick }, modo: st.mode,
    portada: st.mode === "scene" || V.bg ? {
      fondo: V.bgName, relleno: V.fill, brillo: V.gain, opacidad: V.op, colorDebajo: V.col,
      elementos: V.layers.map(L => ({ nombre: L.name, x: +L.x.toFixed(4), y: +L.y.toFixed(4), tamano: L.s, opacidad: L.op, deriva: L.amp, vueltas: L.spd, balanceo: L.rot, respiracion: L.br, epoca: L.aged })),
    } : null,
    pantallas: st.wall.screens.map(s => ({
      n: s.i, x: s.cx, y: s.cy, w: s.cw, h: s.ch, rol: s.role, archivo: s.media, encuadre: s.fit, epoca: s.aged, brillo: s.gain, color: s.col,
      velocidad: +sRate(s).toFixed(2), ruido: { tipo: s.nz || "no", cantidad: s.nzA ?? 45 },
      texto: s.role === "text" ? { texto: s.txt, tamano: s.tsize || 100 } : null,
      video: isVid(s) ? { inicio: +vIn(s).toFixed(2), duracion: +vLen(s).toFixed(2), velocidad: +vRate(s).toFixed(2) } : null,
    })),
  };
  save(new Blob([JSON.stringify(cfg, null, 1)], { type: "application/json" }), `besta-ajustes-${stamp()}.json`);
}

/* Cargar un JSON de ajustes sobre la pared abierta. Las pantallas se
   emparejan por posición, no por orden, para que un archivo guardado
   siga valiendo aunque la detección varíe un poco. Devuelve el resumen. */
export async function importSettings(st: Studio, file: File): Promise<string> {
  if (!st.wall.screens.length && !st.scene.bg) throw new Error("Carga primero la pared o la portada.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cfg: any;
  try { cfg = JSON.parse(await file.text()); } catch { throw new Error("Ese archivo no es un JSON de ajustes del estudio."); }
  if (!cfg || !Array.isArray(cfg.pantallas)) throw new Error("Ese JSON no lleva la lista de pantallas.");

  let placed = 0, noFile = 0;
  st.change(() => {
    const p = st.set;
    if (cfg.escala) p.scale = Number(cfg.escala);
    if (cfg.segundos) p.secs = Number(cfg.segundos);
    if (cfg.fps) p.fps = Number(cfg.fps);
    const T = cfg.textura || {};
    if (T.lineas != null) p.scan = +T.lineas;
    if (T.grano != null) p.grain = +T.grano;
    if (T.banda != null) p.sweep = +T.banda;
    if (T.parpadeo != null) p.flick = +T.parpadeo;

    const free = st.wall.screens.slice();
    for (const a of cfg.pantallas) {
      const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
      let best = null, bd = Infinity;
      for (const s of free) { const d = Math.hypot(s.cx + s.cw / 2 - cx, s.cy + s.ch / 2 - cy); if (d < bd) { bd = d; best = s; } }
      if (!best || bd > Math.max(best.cw, best.ch)) continue;   // demasiado lejos: no es la misma tele
      free.splice(free.indexOf(best), 1);
      best.fit = a.encuadre || best.fit;
      if (a.epoca != null) best.aged = a.epoca;
      if (a.brillo != null) best.gain = a.brillo;
      if (a.color) best.col = a.color;
      if (a.velocidad != null) best.rate = a.velocidad;
      if (a.ruido) { best.nz = a.ruido.tipo || "no"; if (a.ruido.cantidad != null) best.nzA = a.ruido.cantidad; }
      if (a.texto) { best.txt = a.texto.texto; best.tsize = a.texto.tamano || 100; }
      if (a.video) {
        best.vin = a.video.inicio || 0; best.vlen = a.video.duracion || best.vlen; best.vrate = a.video.velocidad || 1;
        if (isVid(best)) best.el.playbackRate = vRate(best);
      }
      if (a.rol === "media" && !best.el) { best.role = "logo"; noFile++; }   // el JSON no lleva los archivos
      else if (a.rol) best.role = a.rol;
      placed++;
    }
    if (cfg.cinta) Object.assign(st.tick, cfg.cinta);
    if (cfg.portada) {                       // los PNG no viajan en el JSON, sí su colocación
      const V = st.scene, c = cfg.portada;
      V.fill = c.relleno || V.fill;
      if (c.brillo != null) V.gain = c.brillo;
      if (c.opacidad != null) V.op = c.opacidad;
      if (c.colorDebajo) V.col = c.colorDebajo;
      (c.elementos || []).forEach((a: Record<string, number>, i: number) => {
        const L = V.layers[i];
        if (L) Object.assign(L, { x: a.x, y: a.y, s: a.tamano, op: a.opacidad, amp: a.deriva, spd: a.vueltas, rot: a.balanceo, br: a.respiracion, aged: a.epoca });
      });
    }
    st.selSet = new Set(); st.sel = -1;
  });
  const { PW, PH } = st.dims();
  return `Ajustes cargados en ${placed} de ${st.wall.screens.length} pantallas.` +
    (noFile ? ` ${noFile} tenían foto o vídeo: el JSON solo guarda el nombre, así que han quedado con el logo y hay que volver a cargarles el archivo.` : "") +
    (cfg.lienzo && (cfg.lienzo[0] !== PW || cfg.lienzo[1] !== PH) ? ` Ojo: se guardó con un lienzo de ${cfg.lienzo[0]}×${cfg.lienzo[1]} y ahora es ${PW}×${PH}; puede que no cuadren todas.` : "");
}
