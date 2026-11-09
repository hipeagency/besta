/* La pista de una canción: cargarla (y recordarla en este ordenador),
   decodificarla y sacar lo que usan los fondos que reaccionan al audio:
   el nivel en cada instante y los golpes (bombo, caja, acentos). */
import { useCallback, useEffect, useState } from "react";
import { peaks } from "./sync";
import { tracks } from "./local";

export interface AudioFeat {
  level: (t: number) => number;   // 0..1, suavizado
  hit: (t: number) => number;     // 1 justo en un golpe, cae a 0 en ~0.35 s
  hits: number[];                 // instantes de los golpes (s)
}

const RATE = 60;   // muestras de nivel por segundo

export function analyse(buf: AudioBuffer): AudioFeat {
  const n = Math.ceil(buf.duration * RATE);
  const env = new Float32Array(n);
  const ch = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const win = Math.floor(buf.sampleRate / RATE);
  let max = 1e-6;
  for (let i = 0; i < n; i++) {
    let sum = 0, cnt = 0;
    const from = i * win, to = Math.min(buf.length, from + win);
    for (const d of ch) for (let j = from; j < to; j += 2) { sum += d[j] * d[j]; cnt++; }
    env[i] = Math.sqrt(sum / Math.max(1, cnt));
    if (env[i] > max) max = env[i];
  }
  for (let i = 0; i < n; i++) env[i] /= max;
  // suavizado de subida rápida y bajada lenta
  const lvl = new Float32Array(n);
  for (let i = 0, v = 0; i < n; i++) { v = env[i] > v ? v + (env[i] - v) * 0.6 : v + (env[i] - v) * 0.12; lvl[i] = v; }
  // golpes: subidas claras sobre la media reciente, separadas al menos 120 ms
  const hits: number[] = [];
  let avg = 0, last = -1;
  for (let i = 0; i < n; i++) {
    avg = avg * 0.92 + env[i] * 0.08;
    const rise = env[i] - (i > 0 ? env[i - 1] : 0);
    if (env[i] > avg * 1.35 && rise > 0.06 && env[i] > 0.15 && (last < 0 || i - last > RATE * 0.12)) { hits.push(i / RATE); last = i; }
  }
  const idx = (t: number) => Math.max(0, Math.min(n - 1, Math.floor(t * RATE)));
  return {
    level: t => lvl[idx(t)] ?? 0,
    hit: t => {
      // último golpe antes de t (búsqueda binaria)
      let lo = 0, hi = hits.length - 1, k = -1;
      while (lo <= hi) { const m = (lo + hi) >> 1; if (hits[m] <= t) { k = m; lo = m + 1; } else hi = m - 1; }
      if (k < 0) return 0;
      const age = t - hits[k];
      return age < 0.35 ? 1 - age / 0.35 : 0;
    },
    hits,
  };
}

export const silent: AudioFeat = { level: () => 0, hit: () => 0, hits: [] };

/* Pista de la canción, recordada en este ordenador entre sesiones. */
export function useTrack(songId: string) {
  const [state, setState] = useState<{ src?: string; name: string; duration: number; wave?: Float32Array; feat: AudioFeat; loading: boolean }>({ name: "", duration: 0, feat: silent, loading: true });

  const open = useCallback(async (blob: Blob, name: string) => {
    const buf = await blob.arrayBuffer();
    const ctx = new AudioContext();
    const decoded = await ctx.decodeAudioData(buf);
    void ctx.close();
    setState(s => {
      if (s.src) URL.revokeObjectURL(s.src);
      return { src: URL.createObjectURL(blob), name, duration: decoded.duration, wave: peaks(decoded, 1600), feat: analyse(decoded), loading: false };
    });
    return decoded.duration;
  }, []);

  useEffect(() => {
    let alive = true;
    tracks.get(songId).then(t => {
      if (!alive) return;
      if (t) open(t.blob, t.name).catch(() => setState(s => ({ ...s, loading: false })));
      else setState(s => ({ ...s, loading: false }));
    });
    return () => { alive = false; };
  }, [songId, open]);
  useEffect(() => () => { if (state.src) URL.revokeObjectURL(state.src); }, [state.src]);

  /* Cargar un archivo nuevo: se recuerda para la próxima vez. */
  const load = useCallback(async (file: File) => {
    const d = await open(file, file.name);
    void tracks.put(songId, file);
    return d;
  }, [open, songId]);

  return { ...state, load };
}
