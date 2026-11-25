/* Qué módulos salen en el inicio y en qué orden.
   Cada usuario elige los suyos desde «personalizar inicio»; se guarda
   en este aparato (cuando haya ajustes por usuario en Supabase, esto
   pasa a leer de ahí y las pantallas no cambian). */
import { useCallback, useEffect, useState } from "react";
import type { Member } from "@/data/types";
import { can } from "./nav";

export type WidgetId = "resumen" | "pendiente" | "proximo" | "agenda" | "presupuestos" | "caja" | "entradas" | "pedidos" | "newsletter";
export type WidgetSize = "medio" | "ancho";

export interface WidgetDef {
  id: WidgetId;
  name: string;
  desc: string;
  size: WidgetSize;
  /** Quién puede tenerlo: si no tiene permiso al módulo, ni se ofrece. */
  allowed: (me: Pick<Member, "role" | "scopes">) => boolean;
}

/* El orden de esta lista es el orden por defecto. */
export const WIDGETS: WidgetDef[] = [
  { id: "resumen", name: "resumen", desc: "las cifras clave: repertorio, próximo bolo, presupuestos y caja", size: "ancho", allowed: () => true },
  { id: "pendiente", name: "pendiente", desc: "lo que necesita que alguien haga algo", size: "medio", allowed: () => true },
  { id: "proximo", name: "próximo bolo", desc: "cuándo, dónde y qué falta por preparar", size: "medio", allowed: me => can("bolos", me) || can("entradas", me) },
  { id: "agenda", name: "agenda", desc: "los próximos bolos de un vistazo", size: "medio", allowed: me => can("bolos", me) },
  { id: "presupuestos", name: "presupuestos", desc: "los últimos y en qué estado están", size: "medio", allowed: me => can("presupuestos", me) },
  { id: "caja", name: "caja", desc: "dinero de la banda y tu saldo", size: "medio", allowed: me => can("finanzas", me) },
  { id: "entradas", name: "entradas", desc: "venta del próximo bolo con entradas propias", size: "ancho", allowed: me => can("entradas", me) },
  { id: "pedidos", name: "últimos pedidos", desc: "las últimas compras de entradas", size: "medio", allowed: me => can("entradas", me) },
  { id: "newsletter", name: "newsletter", desc: "gente apuntada y últimos avisos", size: "medio", allowed: me => me.role === "admin" },
];

interface Prefs { order: WidgetId[]; hidden: WidgetId[] }
/* La caja ya sale en el resumen: de entrada, apagada (se puede encender). */
const DEFAULT_HIDDEN: WidgetId[] = ["caja"];
const key = (memberId: string) => `besta:inicio:${memberId}`;
const ids = WIDGETS.map(w => w.id);

function read(memberId: string): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(key(memberId)) || "null") as Partial<Prefs> | null;
    const order = (raw?.order ?? []).filter((x): x is WidgetId => ids.includes(x as WidgetId));
    // Módulos nuevos que aún no estaban guardados: al final, visibles.
    ids.forEach((id, i) => { if (!order.includes(id)) order.splice(Math.min(i, order.length), 0, id); });
    return { order, hidden: raw ? (raw.hidden ?? []).filter((x): x is WidgetId => ids.includes(x as WidgetId)) : [...DEFAULT_HIDDEN] };
  } catch {
    return { order: [...ids], hidden: [...DEFAULT_HIDDEN] };
  }
}

export function useHomeLayout(me: Member) {
  const [prefs, setPrefs] = useState<Prefs>(() => read(me.id));
  useEffect(() => { setPrefs(read(me.id)); }, [me.id]);

  const save = useCallback((next: Prefs) => {
    setPrefs(next);
    try { localStorage.setItem(key(me.id), JSON.stringify(next)); } catch { /* sin almacenamiento */ }
  }, [me.id]);

  const available = prefs.order.map(id => WIDGETS.find(w => w.id === id)!).filter(w => w.allowed(me));
  const visible = available.filter(w => !prefs.hidden.includes(w.id));

  return {
    available,
    visible,
    isOn: (id: WidgetId) => !prefs.hidden.includes(id),
    toggle: (id: WidgetId) => save({ ...prefs, hidden: prefs.hidden.includes(id) ? prefs.hidden.filter(x => x !== id) : [...prefs.hidden, id] }),
    move: (id: WidgetId, dir: -1 | 1) => {
      // Se mueve entre los que este usuario puede ver, para que el botón siempre haga algo.
      const mine = available.map(w => w.id);
      const i = mine.indexOf(id), j = i + dir;
      if (i < 0 || j < 0 || j >= mine.length) return;
      const order = [...prefs.order];
      const a = order.indexOf(mine[i]), b = order.indexOf(mine[j]);
      [order[a], order[b]] = [order[b], order[a]];
      save({ ...prefs, order });
    },
    reset: () => save({ order: [...ids], hidden: [...DEFAULT_HIDDEN] }),
  };
}
