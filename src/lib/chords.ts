/* Transposición de acordes y notación latina.
   Trabaja sobre la línea de acordes tal cual (respeta los espacios
   para que cada acorde siga encima de su sílaba). */

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const LATIN: Record<string, string> = { C: "Do", D: "Re", E: "Mi", F: "Fa", G: "Sol", A: "La", B: "Si" };

const ROOT = /\b([A-G])(#|b)?(?=(m|maj|min|dim|aug|sus|add|\d|\/|\s|$|\)))/g;

function shift(root: string, acc: string | undefined, semis: number, preferFlat: boolean) {
  const name = root + (acc || "");
  let i = SHARP.indexOf(name);
  if (i < 0) i = FLAT.indexOf(name);
  if (i < 0) return name;
  const j = (i + semis + 120) % 12;
  return (preferFlat ? FLAT : SHARP)[j];
}

/** Sube o baja `semis` semitonos todos los acordes de la línea. */
export function transposeLine(line: string, semis: number): string {
  if (!semis) return line;
  const preferFlat = /\b[A-G]b/.test(line);
  return line.replace(ROOT, (_m, r: string, a: string | undefined) => shift(r, a, semis, preferFlat));
}

/** Tono de la canción tras transponer: «G» +2 → «A». */
export function transposeKey(key: string, semis: number): string {
  if (!key) return key;
  return transposeLine(key, semis);
}

/** C D E → Do Re Mi (mantiene alteraciones y extensiones). */
export function toLatin(line: string): string {
  return line.replace(ROOT, (_m, r: string, a: string | undefined) => LATIN[r] + (a || ""));
}
