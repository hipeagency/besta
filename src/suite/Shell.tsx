/* El marco de la suite: barra lateral en escritorio, pestañas abajo
   en móvil, ⌘K para saltar a cualquier sitio. Ensayos, puerta y el
   modo puesto de merch van a pantalla completa, fuera de esto. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { NAV, TABS, canSee, type NavItem } from "./nav";
import { useMe } from "./session";
import { useTheme, themeLabel } from "./theme";
import { Icon } from "@/components/ui/icons";
import { Logo } from "@/components/ui";
import { useCollection } from "@/data/hooks";
import { cx, dateShort } from "@/lib/format";

export function Shell() {
  const { me, logout } = useMe();
  const theme = useTheme();
  const items = NAV.filter(i => canSee(i, me));
  const [palette, setPalette] = useState(false);
  const loc = useLocation();

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(p => !p); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  useEffect(() => { setPalette(false); window.scrollTo(0, 0); }, [loc.pathname]);

  const groups = ["", "MÚSICA", "DIRECTO", "NEGOCIO", "AJUSTES"] as const;

  return (
    <div className="min-h-dvh md:flex">
      {/* lateral */}
      <nav aria-label="Suite" className="hidden md:flex w-[248px] shrink-0 flex-col gap-5 px-4 py-6 bg-lateral border-r border-crema/8 sticky top-0 h-dvh overflow-y-auto">
        <div className="flex items-center gap-2.5 px-2">
          <Logo className="w-[84px]" />
          <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-senal/15 text-senal-suave">suite</span>
        </div>
        <button type="button" onClick={() => setPalette(true)} className="flex items-center justify-between h-10 px-3 rounded-[10px] bg-tubo text-sm text-crema/70 hover:text-crema">
          <span className="flex items-center gap-2"><Icon name="buscar" size={16} />buscar o saltar…</span><span className="font-mono text-[11px]">⌘K</span>
        </button>
        {groups.map(g => {
          const list = items.filter(i => i.group === g);
          if (!list.length) return null;
          return (
            <div key={g} className="flex flex-col gap-0.5">
              {g && <p className="px-3 mb-1.5 font-mono text-[11px] tracking-[.14em] text-crema/55">{g}</p>}
              {list.map(i => (
                <NavLink key={i.id} to={i.path} end={i.path === "/"}
                  className={({ isActive }) => cx("h-[38px] px-3 rounded-[10px] flex items-center gap-2.5 text-[15px] transition",
                    isActive ? "bg-senal text-noche font-semibold" : "text-crema/80 hover:text-crema hover:bg-crema/5")}>
                  <Icon name={i.icon} size={17} />{i.name}
                </NavLink>
              ))}
            </div>
          );
        })}
        <div className="mt-auto flex items-center gap-2.5 p-2.5 rounded-xl border border-crema/10">
          <span className="size-8 rounded-full bg-senal text-noche grid place-items-center font-semibold text-sm">{me.name[0]}</span>
          <span className="text-sm leading-tight flex-1"><span className="block">{me.name}</span><span className="block font-mono text-[11px] text-crema/55">{me.role}</span></span>
          <button type="button" onClick={theme.next} aria-label={themeLabel[theme.pref]} title={themeLabel[theme.pref]} className="size-9 grid place-items-center rounded-full hover:bg-crema/10 "><Icon name={theme.pref === "auto" ? "auto" : theme.pref === "claro" ? "sol" : "luna"} size={16} /></button>
          <button type="button" onClick={logout} aria-label="Salir" title="Salir" className="size-9 grid place-items-center rounded-full hover:bg-crema/10"><Icon name="salir" size={16} /></button>
        </div>
      </nav>

      <div className="flex-1 min-w-0 pb-[88px] md:pb-0">
        <Outlet />
      </div>

      {/* pestañas móvil */}
      <nav aria-label="Suite" className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-lateral/95 backdrop-blur border-t border-crema/10 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5 h-[68px]">
          {[...TABS.map(t => NAV.find(n => n.id === t)!), { id: "mas", name: "más", path: "/mas", icon: "mas" as const }].filter(i => !("group" in i) || canSee(i as NavItem, me)).map(i => (
            <NavLink key={i.id} to={i.path} end={i.path === "/"}
              className={({ isActive }) => cx("flex flex-col items-center justify-center gap-1 text-[11px]", isActive ? "text-crema font-semibold" : "text-crema/65")}>
              {({ isActive }) => (<>
                <span className={cx("w-11 h-7 rounded-full grid place-items-center", isActive && "bg-senal text-noche")}><Icon name={i.icon} size={19} /></span>
                {i.name}
              </>)}
            </NavLink>
          ))}
        </div>
      </nav>

      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </div>
  );
}

/* Cabecera estándar de cada pantalla. */
export function Page({ title, kicker, actions, children, back, className }: { title: ReactNode; kicker?: ReactNode; actions?: ReactNode; children: ReactNode; back?: { to: string; label: string }; className?: string }) {
  const nav = useNavigate();
  return (
    <main className={cx("px-4 sm:px-6 lg:px-10 pt-5 md:pt-7 pb-12 flex flex-col gap-5 md:gap-6 max-w-[1400px]", className)}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5 min-w-0">
          {back && <button type="button" onClick={() => nav(back.to)} className="self-start font-mono text-xs text-crema/70 hover:text-crema inline-flex items-center gap-1.5"><Icon name="atras" size={14} />{back.label}</button>}
          {kicker && <div className="font-mono text-xs tracking-wider text-crema/65">{kicker}</div>}
          <h1 className="text-[34px] md:text-[44px] font-extrabold tracking-[-.035em] leading-none">{title}</h1>
        </div>
        {actions && <div className="flex flex-wrap gap-2 items-center">{actions}</div>}
      </header>
      {children}
    </main>
  );
}

// ---------- ⌘K ----------
function CommandPalette({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const { me } = useMe();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const { data: songs } = useCollection("songs");
  const { data: gigs } = useCollection("gigs");
  const { data: orders } = useCollection("orders");
  const { data: products } = useCollection("products");
  const { data: quotes } = useCollection("quotes");

  useEffect(() => { input.current?.focus(); }, []);

  const results = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const n = norm(q.trim());
    const all = [
      ...NAV.filter(i => canSee(i, me)).map(i => ({ kind: "módulo", label: i.name, sub: i.desc, to: i.path })),
      ...gigs.map(g => ({ kind: "bolo", label: `${g.city} · ${dateShort(g.date)}`, sub: g.venue, to: `/bolos/${g.id}` })),
      ...songs.map(s => ({ kind: "canción", label: s.title, sub: s.artist, to: `/ensayos/${s.id}` })),
      ...quotes.map(x => ({ kind: "presupuesto", label: x.number, sub: x.client, to: `/presupuestos/${x.id}` })),
      ...products.map(p => ({ kind: "merch", label: p.name, sub: "producto", to: `/merch` })),
      ...(n.includes("@") || n.length > 2 ? orders.slice(0, 400).map(o => ({ kind: "pedido", label: o.email, sub: `#${String(o.number).padStart(4, "0")}`, to: `/entradas/${o.eventId}?q=${encodeURIComponent(o.email)}` })) : []),
    ];
    return (n ? all.filter(r => norm(r.label + " " + r.sub).includes(n)) : all.slice(0, 11)).slice(0, 12);
  }, [q, songs, gigs, orders, products, quotes, me]);

  const go = (to: string) => { onClose(); nav(to); };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <button type="button" aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-black/60 anim-fade" />
      <div role="dialog" aria-label="Buscar" className="relative w-full max-w-[560px] rounded-3xl bg-tubo overflow-hidden anim-fade shadow-2xl">
        <div className="flex items-center gap-3 px-4 border-b border-crema/10">
          <Icon name="buscar" />
          <input ref={input} value={q} onChange={e => { setQ(e.target.value); setSel(0); }} placeholder="canción, bolo, pedido, presupuesto…"
            aria-label="Buscar"
            onKeyDown={e => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") { e.preventDefault(); setSel(s => Math.min(results.length - 1, s + 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
              if (e.key === "Enter" && results[sel]) go(results[sel].to);
            }}
            className="flex-1 h-14 bg-transparent outline-none text-[17px] placeholder:text-crema/40" />
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2">
          {results.map((r, i) => (
            <li key={r.kind + r.to + r.label}>
              <button type="button" onMouseEnter={() => setSel(i)} onClick={() => go(r.to)}
                className={cx("w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left", i === sel && "bg-crema/8")}>
                <span className="min-w-0"><span className="block truncate">{r.label}</span><span className="block text-xs text-crema/60 truncate">{r.sub}</span></span>
                <span className="font-mono text-[11px] text-crema/55 shrink-0">{r.kind}</span>
              </button>
            </li>
          ))}
          {!results.length && <li className="p-4 text-sm text-crema/60">Nada con «{q}».</li>}
        </ul>
      </div>
    </div>
  );
}
