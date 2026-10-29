/* Formatos de la casa: euros, fechas y horas en castellano. */

/* useGrouping "always": en es-ES el estándar no pone punto en 4 cifras (1716 €), y queda raro al lado de 12.450 €. */
const eurFmt = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", useGrouping: "always" });
const eurRound = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" });

/** 1200 → «12,00 €» */
export const eur = (cents: number) => eurFmt.format(cents / 100);
/** 171600 → «1.716 €» */
export const eur0 = (cents: number) => eurRound.format(cents / 100);

const MON = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
const WD = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const WD_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const parse = (iso: string) => new Date(iso.length === 10 ? iso + "T12:00:00" : iso);

/* Un bolo puede no tener fecha todavía (""): los formatos lo dicen en vez de romperse. */
/** «12» */
export const dayNum = (iso: string) => (iso ? String(parse(iso).getDate()).padStart(2, "0") : "");
/** «DIC» */
export const mon = (iso: string) => (iso ? MON[parse(iso).getMonth()] : "");
/** «SÁB 12 DIC» */
export const dateLabel = (iso: string) => { if (!iso) return "SIN FECHA"; const d = parse(iso); return `${WD[d.getDay()]} ${dayNum(iso)} ${MON[d.getMonth()]}`; };
/** «12 dic» */
export const dateShort = (iso: string) => (iso ? `${parse(iso).getDate()} ${MON[parse(iso).getMonth()].toLowerCase()}` : "sin fecha");
/** «sábado 12 dic 2026» */
export const dateLong = (iso: string) => { if (!iso) return "sin fecha"; const d = parse(iso); return `${WD_LONG[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()].toLowerCase()} ${d.getFullYear()}`; };
/** «DIC 2026» */
export const monYear = (iso: string) => (iso ? `${MON[parse(iso).getMonth()]} ${parse(iso).getFullYear()}` : "");
/** «diciembre 2026» */
export const monthLong = (iso: string) => (iso ? parse(iso).toLocaleDateString("es-ES", { month: "long", year: "numeric" }) : "");

/* Fecha y hora de un bolo, con lo que se sepa. Con dateTbc solo vale el mes. */
type GigWhen = { date: string; time?: string; dateTbc?: boolean };
/** «SÁB 12 DIC», «DIC 2026 · DÍA POR CONFIRMAR» o «FECHA POR CONFIRMAR» */
export const gigDate = (g: GigWhen) => (!g.date ? "FECHA POR CONFIRMAR" : g.dateTbc ? `${monYear(g.date)} · DÍA POR CONFIRMAR` : dateLabel(g.date));
/** Para listas: «SÁB 12 DIC», «DIC 2026» o «SIN FECHA» */
export const gigDateShort = (g: GigWhen) => (g.date && g.dateTbc ? monYear(g.date) : dateLabel(g.date));
/** Cómo se llama un bolo en listas y títulos: la ciudad, o lo que se sepa. */
export const gigTitle = (g: { city: string; venue: string; event?: string }) => g.city || g.event || g.venue || "bolo por confirmar";
/** La línea de debajo: evento y sala que no estén ya en el título. */
export const gigSub = (g: { city: string; venue: string; event?: string }) => [g.event, g.venue].filter(x => x && x !== gigTitle(g)).join(" · ");
/** «SÁB 12 DIC · 21:30», con «hora por confirmar» si falta */
export const gigWhen = (g: GigWhen) => `${gigDate(g)} · ${g.time || "hora por confirmar"}`;
/** «MIÉRCOLES 28 OCT» */
export const todayLabel = () => { const d = new Date(); return `${WD_LONG[d.getDay()].toUpperCase()} ${d.getDate()} ${MON[d.getMonth()]}`; };

export const isPast = (iso: string) => !!iso && parse(iso).getTime() < new Date(new Date().toDateString()).getTime();
/** NaN si no hay fecha. */
export const daysUntil = (iso: string) => Math.round((parse(iso).getTime() - new Date(new Date().toDateString()).getTime() - 12 * 3600e3) / 86400e3);

/** «hace 4 min», «ayer» */
export function ago(isoTime: string) {
  const s = (Date.now() - Date.parse(isoTime)) / 1000;
  if (s < 60) return "ahora";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 172800) return "ayer";
  if (s < 30 * 86400) return `hace ${Math.floor(s / 86400)} días`;
  return dateShort(isoTime.slice(0, 10));
}

export const hhmm = (isoTime: string) => new Date(isoTime).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

/** Para mostrar emails en listas sin enseñarlos enteros: laura@…mail.com */
export const maskEmail = (e: string) => { const [u, d = ""] = e.split("@"); return `${u}@…${d.slice(-8)}`; };

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
