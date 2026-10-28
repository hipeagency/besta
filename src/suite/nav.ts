/* El árbol de la suite y quién ve qué.
   Añadir un módulo = una entrada aquí + su ruta en App. */
import type { IconName } from "@/components/ui/icons";
import type { Member, Role } from "@/data/types";

export interface NavItem {
  id: string;
  name: string;
  path: string;
  icon: IconName;
  group: "" | "MÚSICA" | "DIRECTO" | "NEGOCIO" | "AJUSTES";
  desc: string;
  desktopOnly?: boolean;
  adminOnly?: boolean;     // ni con permisos a mano lo ve otro rol
}

export const NAV: NavItem[] = [
  { id: "inicio", name: "inicio", path: "/", icon: "inicio", group: "", desc: "lo urgente de un vistazo" },
  { id: "ensayos", name: "ensayos", path: "/ensayos", icon: "ensayos", group: "MÚSICA", desc: "repertorio, setlists y directo" },
  { id: "composicion", name: "composición", path: "/composicion", icon: "composicion", group: "MÚSICA", desc: "ideas, demos y letras" },
  { id: "bolos", name: "bolos", path: "/bolos", icon: "bolos", group: "DIRECTO", desc: "la ficha de cada concierto" },
  { id: "rider", name: "rider", path: "/rider", icon: "rider", group: "DIRECTO", desc: "rider técnico y escenario" },
  { id: "visuales", name: "visuales", path: "/visuales", icon: "visuales", group: "DIRECTO", desc: "muro CRT", desktopOnly: true },
  { id: "puerta", name: "puerta", path: "/puerta", icon: "puerta", group: "DIRECTO", desc: "escáner de entradas" },
  { id: "entradas", name: "entradas", path: "/entradas", icon: "entradas", group: "NEGOCIO", desc: "venta y asistentes" },
  { id: "presupuestos", name: "presupuestos", path: "/presupuestos", icon: "presupuestos", group: "NEGOCIO", desc: "ofertas y solicitudes" },
  { id: "merch", name: "merch", path: "/merch", icon: "merch", group: "NEGOCIO", desc: "stock, ventas y solicitudes" },
  { id: "finanzas", name: "finanzas", path: "/finanzas", icon: "finanzas", group: "NEGOCIO", desc: "caja y reparto" },
  { id: "usuarios", name: "usuarios", path: "/usuarios", icon: "usuarios", group: "AJUSTES", desc: "accesos y permisos", adminOnly: true },
];

/* Pestañas de abajo en móvil. El resto vive en «más». */
export const TABS = ["inicio", "bolos", "entradas", "ensayos"] as const;

export const ROLES: { value: Role; name: string; desc: string }[] = [
  { value: "admin", name: "admin", desc: "La banda. Ve y cambia todo, y gestiona usuarios." },
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
