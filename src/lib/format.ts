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

/** «12» */
export const dayNum = (iso: string) => String(parse(iso).getDate()).padStart(2, "0");
/** «DIC» */
export const mon = (iso: string) => MON[parse(iso).getMonth()];
/** «SÁB 12 DIC» */
export const dateLabel = (iso: string) => { const d = parse(iso); return `${WD[d.getDay()]} ${dayNum(iso)} ${MON[d.getMonth()]}`; };
/** «12 dic» */
export const dateShort = (iso: string) => `${parse(iso).getDate()} ${MON[parse(iso).getMonth()].toLowerCase()}`;
/** «sábado 12 dic 2026» */
export const dateLong = (iso: string) => { const d = parse(iso); return `${WD_LONG[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()].toLowerCase()} ${d.getFullYear()}`; };
/** «MIÉRCOLES 28 OCT» */
export const todayLabel = () => { const d = new Date(); return `${WD_LONG[d.getDay()].toUpperCase()} ${d.getDate()} ${MON[d.getMonth()]}`; };

export const isPast = (iso: string) => parse(iso).getTime() < new Date(new Date().toDateString()).getTime();
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
