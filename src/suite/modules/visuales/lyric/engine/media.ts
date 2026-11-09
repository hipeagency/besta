/* Fotos, vídeos y GIF de la biblioteca, listos para pintar en el canvas.
   Los vídeos van en bucle; en la vista previa se mantienen a la par del
   audio, y al exportar se buscará cada fotograma exacto (paso 4). */
import { media } from "../local";
import type { MediaSource } from "./backgrounds";

type Loaded =
  | { kind: "img"; el: HTMLImageElement; url: string }
  | { kind: "video"; el: HTMLVideoElement; url: string }
  | { kind: "gif"; frames: ImageBitmap[]; ends: number[]; total: number; w: number; h: number };

/* Decodificar los fotogramas de un GIF (Chrome y Edge; en otros
   navegadores se ve quieto, como imagen). */
async function decodeGif(blob: Blob): Promise<Loaded | null> {
  const ID = (globalThis as unknown as { ImageDecoder?: new (o: { data: ReadableStream | ArrayBuffer; type: string }) => {
    tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
    decode: (o: { frameIndex: number }) => Promise<{ image: VideoFrame }>;
  } }).ImageDecoder;
  if (!ID) return null;
  const dec = new ID({ data: await blob.arrayBuffer(), type: "image/gif" });
  await dec.tracks.ready;
  const n = dec.tracks.selectedTrack?.frameCount ?? 0;
  if (n < 2) return null;
  const frames: ImageBitmap[] = [], ends: number[] = [];
  let total = 0, w = 0, h = 0;
  for (let i = 0; i < Math.min(n, 600); i++) {
    const { image } = await dec.decode({ frameIndex: i });
    total += (image.duration ?? 100000) / 1000;   // µs → ms
    ends.push(total);
    w = image.displayWidth; h = image.displayHeight;
    frames.push(await createImageBitmap(image));
    image.close();
  }
  return { kind: "gif", frames, ends, total, w, h };
}

export class MediaPool implements MediaSource {
  private items = new Map<string, Loaded | "loading" | "missing">();
  private onReady: () => void;
  playing = false;
  constructor(onReady: () => void) { this.onReady = onReady; }

  private load(id: string) {
    this.items.set(id, "loading");
    (async () => {
      const m = await media.get(id);
      if (!m) { this.items.set(id, "missing"); return; }
      if (m.type === "image/gif") {
        const gif = await decodeGif(m.blob).catch(() => null);
        if (gif) { this.items.set(id, gif); this.onReady(); return; }
      }
      const url = URL.createObjectURL(m.blob);
      if (m.type.startsWith("video/")) {
        const el = document.createElement("video");
        el.muted = true; el.loop = true; el.playsInline = true; el.preload = "auto"; el.src = url;
        el.addEventListener("loadeddata", () => { this.items.set(id, { kind: "video", el, url }); this.onReady(); }, { once: true });
      } else {
        const el = new Image();
        el.onload = () => { this.items.set(id, { kind: "img", el, url }); this.onReady(); };
        el.onerror = () => this.items.set(id, "missing");
        el.src = url;
      }
    })().catch(() => this.items.set(id, "missing"));
  }

  missing(id: string) { return this.items.get(id) === "missing"; }

  frame(id: string, t: number) {
    const it = this.items.get(id);
    if (!it) { this.load(id); return null; }
    if (it === "loading" || it === "missing") return null;
    if (it.kind === "img") return { img: it.el, w: it.el.naturalWidth, h: it.el.naturalHeight };
    if (it.kind === "gif") {
      const ms = (t * 1000) % it.total;
      let k = 0;
      while (k < it.ends.length - 1 && it.ends[k] <= ms) k++;
      return { img: it.frames[k], w: it.w, h: it.h };
    }
    // vídeo: a la par del audio (en bucle)
    const v = it.el, d = v.duration || 1, want = t % d;
    if (this.playing) {
      if (v.paused) void v.play().catch(() => {});
      if (Math.abs(v.currentTime - want) > 0.25) v.currentTime = want;
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - want) > 0.04) v.currentTime = want;
    }
    return { img: v, w: v.videoWidth, h: v.videoHeight };
  }

  dispose() {
    for (const it of this.items.values()) {
      if (typeof it !== "object") continue;
      if (it.kind === "gif") it.frames.forEach(f => f.close());
      else { URL.revokeObjectURL(it.url); if (it.kind === "video") it.el.pause(); }
    }
    this.items.clear();
  }
}
