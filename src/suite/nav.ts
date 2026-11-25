/* El árbol de la suite y quién ve qué.
   Añadir un módulo = una entrada aquí + su ruta en App. */
import type { IconName } from "@/components/ui/icons";
import type { Member, Role } from "@/data/types";

export interface NavItem {
  id: string;
  name: string;
  path: string;
  icon: IconName;
  group: Group;
  desc: string;
  desktopOnly?: boolean;
  adminOnly?: boolean;     // ni con permisos a mano lo ve otro rol
}

/* Grupos del menú, en el orden en que vive un bolo:
   se ensaya y se compone → se cierra y se prepara el bolo →
   se vende → se cobra y se reparte. */
export const GROUPS = ["", "MÚSICA", "BOLOS", "VENTA", "BANDA"] as const;
export type Group = typeof GROUPS[number];

export const NAV: NavItem[] = [
  { id: "inicio", name: "inicio", path: "/", icon: "inicio", group: "", desc: "lo urgente de un vistazo" },
  { id: "ensayos", name: "ensayos", path: "/ensayos", icon: "ensayos", group: "MÚSICA", desc: "repertorio, setlists y directo" },
  { id: "composicion", name: "composición", path: "/composicion", icon: "composicion", group: "MÚSICA", desc: "ideas, demos y letras" },
  { id: "bolos", name: "bolos", path: "/bolos", icon: "bolos", group: "BOLOS", desc: "la ficha de cada concierto" },
  { id: "presupuestos", name: "presupuestos", path: "/presupuestos", icon: "presupuestos", group: "BOLOS", desc: "solicitudes y ofertas" },
  { id: "rider", name: "rider", path: "/rider", icon: "rider", group: "BOLOS", desc: "rider técnico y escenario" },
  { id: "visuales", name: "visuales", path: "/visuales", icon: "visuales", group: "BOLOS", desc: "muro CRT y videolyrics", desktopOnly: true },
  { id: "entradas", name: "entradas", path: "/entradas", icon: "entradas", group: "VENTA", desc: "venta y asistentes" },
  { id: "puerta", name: "puerta", path: "/puerta", icon: "puerta", group: "VENTA", desc: "escáner de entradas" },
  { id: "merch", name: "merch", path: "/merch", icon: "merch", group: "VENTA", desc: "stock, ventas y encargos" },
  { id: "finanzas", name: "finanzas", path: "/finanzas", icon: "finanzas", group: "BANDA", desc: "caja y reparto" },
  { id: "newsletter", name: "newsletter", path: "/newsletter", icon: "enviar", group: "BANDA", desc: "avisos y quién está apuntado", adminOnly: true },
  { id: "usuarios", name: "usuarios", path: "/usuarios", icon: "usuarios", group: "BANDA", desc: "accesos y permisos", adminOnly: true },
];

/* Pestañas de abajo en móvil. El resto vive en «más». */
export const TABS = ["inicio", "bolos", "entradas", "ensayos"] as const;

export const ROLES: { value: Role; name: string; desc: string }[] = [
  { value: "admin", name: "admin", desc: "La banda. Ve y cambia todo. Dar o quitar el admin y borrar usuarios, solo el superadmin." },
  { value: "musico", name: "músico", desc: "Viene a tocar: ensayos, composición, rider y la agenda de bolos." },
  { value: "staff", name: "staff", desc: "Ayuda en los bolos: entradas, puerta y merch." },
];

/* Lo que ve cada rol si no se le cambian los permisos a mano. */
export const ROLE_SCOPES: Record<Role, string[]> = {
  admin: NAV.map(i => i.id),
  musico: ["inicio", "ensayos", "composicion", "bolos", "rider"],
  staff: ["inicio", "entradas", "puerta", "merch"],
};

/** Módulos que puede abrir alguien (admin: todos). */
export function scopesOf(m: Pick<Member, "role" | "scopes">): string[] {
  if (m.role === "admin") return ROLE_SCOPES.admin;
  const s = m.scopes ?? ROLE_SCOPES[m.role];
  return s.includes("inicio") ? s : ["inicio", ...s];
}

export const canSee = (item: NavItem, me: Pick<Member, "role" | "scopes">) =>
  me.role === "admin" || (!item.adminOnly && scopesOf(me).includes(item.id));

export const can = (id: string, me: Pick<Member, "role" | "scopes">) => {
  const item = NAV.find(i => i.id === id);
  return item ? canSee(item, me) : false;
};
