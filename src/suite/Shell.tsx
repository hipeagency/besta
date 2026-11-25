/* El marco de la suite: barra lateral en escritorio, pestañas abajo
   en móvil, ⌘K para saltar a cualquier sitio. Ensayos, puerta y el
   modo puesto de merch van a pantalla completa, fuera de esto. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { GROUPS, NAV, TABS, canSee, type NavItem } from "./nav";
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
  /* Avisos en el menú: lo que espera a alguien en cada módulo. */
  const { data: leads } = useCollection("leads");
  const { data: requests } = useCollection("requests");
  const badges: Record<string, number> = {
    presupuestos: leads.filter(l => l.status === "nueva").length,
    merch: requests.filter(r => r.status === "nueva").length,
  };
  const moreBadge = items.filter(i => !(TABS as readonly string[]).includes(i.id)).reduce((n, i) => n + (badges[i.id] ?? 0), 0);
  const [palette, setPalette] = useState(false);
  const [wsOpen, setWsOpen] = useState(false);
  /* Barra lateral completa o solo iconos: se recuerda por aparato. */
  const [rail, setRail] = useState(() => { try { return localStorage.getItem("besta:barra") === "iconos"; } catch { return false; } });
  const toggleRail = () => setRail(r => { const n = !r; try { n ? localStorage.setItem("besta:barra", "iconos") : localStorage.removeItem("besta:barra"); } catch { /* */ } return n; });
  const loc = useLocation();

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(p => !p); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  useEffect(() => { setPalette(false); setWsOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);


  return (
    <div className="min-h-dvh md:flex">
      {/* lateral */}
      <nav aria-label="Suite" className={cx("hidden md:flex shrink-0 flex-col gap-1.5 py-4 bg-lateral border-r border-crema/8 sticky top-0 h-dvh overflow-y-auto overflow-x-hidden transition-[width] duration-200",
        rail ? "w-[76px] px-3" : "w-[252px] px-3")}>
        {/* banda (espacio de trabajo) */}
        <div className="relative">
          <button type="button" onClick={() => setWsOpen(o => !o)} aria-expanded={wsOpen} aria-haspopup="menu"
            className={cx("w-full flex items-center gap-3 p-2 rounded-xl border border-transparent hover:bg-crema/5 hover:border-crema/8 text-left", rail && "justify-center")}>
            <span className="size-10 shrink-0 rounded-[11px] bg-[#0F0B08] border border-crema/15 grid place-items-center overflow-hidden [&_img]:![filter:none]"><Logo className="w-[30px]" /></span>
            {!rail && <>
              <span className="min-w-0 flex-1"><span className="block font-bold tracking-wide leading-tight">BESTA</span><span className="block text-[11px] text-crema/55 truncate">suite de la banda</span></span>
              <Icon name="desplegar" size={15} className="text-crema/45 shrink-0" />
            </>}
          </button>
          {wsOpen && (
            <div role="menu" className="absolute z-30 top-[58px] left-0 w-[228px] p-2 rounded-xl bg-tubo border border-crema/12 shadow-2xl anim-fade">
              <p className="px-2 pt-1 pb-2 font-mono text-[10px] tracking-[.18em] text-crema/45">TUS ESPACIOS</p>
              <NavLink to="/" onClick={() => setWsOpen(false)} className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-crema/5">
                <span className="size-7 rounded-lg bg-[#0F0B08] grid place-items-center overflow-hidden [&_img]:![filter:none]"><Logo className="w-[22px]" /></span>
                <span className="flex-1 text-sm font-semibold">BESTA</span><Icon name="check" size={15} className="text-senal" />
              </NavLink>
              {me.owner && <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-crema/50">
                <span className="size-7 rounded-lg border border-dashed border-crema/25 grid place-items-center">+</span>
                <span className="flex-1 text-sm">nueva banda</span>
                <span className="font-mono text-[9px] tracking-wider px-1.5 py-0.5 rounded-full bg-senal/15 text-senal-suave">PRONTO</span>
              </div>}
            </div>
          )}
        </div>

        <button type="button" onClick={() => setPalette(true)} title="Buscar (⌘K)"
          className={cx("flex items-center gap-2.5 h-10 px-3 mb-2 rounded-[10px] bg-crema/[.04] border border-crema/8 text-sm text-crema/60 hover:text-crema hover:border-crema/15", rail && "justify-center px-0")}>
          <Icon name="buscar" size={16} />{!rail && <><span className="flex-1 text-left">buscar o saltar…</span><kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded-md border border-crema/15">⌘K</kbd></>}
        </button>

        {GROUPS.map(g => {
          const list = items.filter(i => i.group === g);
          if (!list.length) return null;
          return (
            <div key={g} className={cx("flex flex-col gap-0.5", g && "mt-3")}>
              {g && <p className={cx("px-3 mb-1 font-mono text-[10px] tracking-[.2em] text-crema/40", rail && "invisible h-0 mb-0")}>{g}</p>}
              {list.map(i => (
                <NavLink key={i.id} to={i.path} end={i.path === "/"} title={rail ? i.name : undefined}
                  className={({ isActive }) => cx("relative h-[38px] px-3 rounded-[10px] flex items-center gap-3 text-[14.5px] transition",
                    rail && "justify-center px-0",
                    isActive ? "bg-senal/12 text-crema font-semibold before:absolute before:-left-3 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r before:bg-senal [&>svg]:text-senal"
                      : "text-crema/65 hover:text-crema hover:bg-crema/[.045]")}>
                  <Icon name={i.icon} size={17} />{!rail && <span className="truncate">{i.name}</span>}
                  {!!badges[i.id] && (rail
                    ? <span className="absolute top-1.5 right-2 size-2 rounded-full bg-senal" />
                    : <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-senal text-noche font-mono text-[11px] grid place-items-center" aria-label={`${badges[i.id]} pendientes`}>{badges[i.id]}</span>)}
                </NavLink>
              ))}
            </div>
          );
        })}

        <div className="mt-auto pt-2 border-t border-crema/8 flex flex-col gap-0.5">
          <NavLink to="/ajustes" title={rail ? "ajustes" : undefined}
            className={({ isActive }) => cx("h-[38px] px-3 rounded-[10px] flex items-center gap-3 text-[14.5px]", rail && "justify-center px-0", isActive ? "bg-senal/12 text-crema font-semibold [&>svg]:text-senal" : "text-crema/65 hover:text-crema hover:bg-crema/[.045]")}>
            <Icon name="ajustes" size={17} />{!rail && "ajustes"}
          </NavLink>
          <a href="/" target="_blank" rel="noopener" title={rail ? "web pública" : undefined} className={cx("h-[38px] px-3 rounded-[10px] flex items-center gap-3 text-[14.5px] text-crema/65 hover:text-crema hover:bg-crema/[.045]", rail && "justify-center px-0")}>
            <Icon name="externo" size={17} />{!rail && "web pública"}
          </a>
          <div className={cx("mt-1.5 flex items-center gap-2.5 p-2 rounded-xl bg-crema/[.03] border border-crema/8", rail && "justify-center bg-transparent border-transparent")}>
            <span className="size-8 shrink-0 rounded-full bg-senal/18 text-senal border border-senal/35 grid place-items-center font-bold text-sm">{me.name[0]}</span>
            {!rail && <>
              <span className="text-sm leading-tight flex-1 min-w-0"><span className="block font-semibold truncate">{me.name}</span><span className="block font-mono text-[10.5px] text-crema/50 truncate">{me.owner ? "superadmin" : me.role === "musico" ? "músico" : me.role}</span></span>
              <button type="button" onClick={theme.next} aria-label={themeLabel[theme.pref]} title={themeLabel[theme.pref]} className="size-8 grid place-items-center rounded-lg text-crema/60 hover:text-crema hover:bg-crema/10"><Icon name={theme.pref === "auto" ? "auto" : theme.pref === "claro" ? "sol" : "luna"} size={15} /></button>
              <button type="button" onClick={logout} aria-label="Salir" title="Salir" className="size-8 grid place-items-center rounded-lg text-crema/60 hover:text-crema hover:bg-crema/10"><Icon name="salir" size={15} /></button>
            </>}
          </div>
          <button type="button" onClick={toggleRail} className="mt-1 h-8 rounded-lg grid place-items-center text-crema/40 hover:text-crema hover:bg-crema/5" aria-label={rail ? "Desplegar barra lateral" : "Plegar barra lateral"} title={rail ? "Desplegar" : "Plegar"}>
            <Icon name={rail ? "flecha" : "atras"} size={15} />
          </button>
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
                <span className={cx("relative w-11 h-7 rounded-full grid place-items-center", isActive && "bg-senal/15 text-senal")}>
                  <Icon name={i.icon} size={19} />
                  {i.id === "mas" && moreBadge > 0 && <span className="absolute top-0 right-1.5 size-2 rounded-full bg-senal ring-2 ring-lateral" aria-label="hay cosas pendientes" />}
                </span>
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
      { kind: "módulo", label: "ajustes", sub: "tema, inicio y tareas de cada bolo", to: "/ajustes" },
      ...gigs.map(g => ({ kind: "bolo", label: `${g.city} · ${dateShort(g.date)}`, sub: g.venue, to: `/bolos/${g.id}` })),
      ...songs.map(s => ({ kind: "canción", label: s.title, sub: s.artist, to: `/ensayos/${s.id}` })),
      ...quotes.map(x => ({ kind: "presupuesto", label: x.number, sub: x.client, to: `/presupuestos/${x.id}` })),
      ...products.map(p => ({ kind: "merch", label: p.name, sub: "producto", to: `/merch` })),
      ...(n.includes("@") || n.length > 2 ? orders.slice(0, 400).filter(o => o.email).map(o => ({ kind: "pedido", label: o.email, sub: `#${String(o.number).padStart(4, "0")}`, to: `/entradas/${o.eventId}?q=${encodeURIComponent(o.email)}` })) : []),
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
