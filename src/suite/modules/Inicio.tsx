/* Inicio: lo urgente arriba, lo demás a elección de cada uno.
   «pendiente» junta en una sola lista todo lo que pide que alguien
   haga algo; el resto son módulos que cada usuario enciende, apaga
   y ordena desde «personalizar inicio». */
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { useMe } from "@/suite/session";
import { can } from "@/suite/nav";
import { useHomeLayout, type WidgetId } from "@/suite/home";
import { HomeModulesEditor } from "@/suite/HomeEditor";
import { useCollection } from "@/data/hooks";
import { eventStats, gigChecklist, quoteTotals, salesByDay, upcomingGigs, balances } from "@/data/selectors";
import { Button, Card, CardTitle, Dot, IconButton, Pill, Progress, Sheet, Stat } from "@/components/ui";
import { ago, cx, dateShort, dayNum, daysUntil, eur, eur0, gigSub, gigTitle, maskEmail, mon, monYear, plural } from "@/lib/format";
import { Icon, type IconName } from "@/components/ui/icons";
import { NotifyButton, TOPIC_LABEL, songDraft, useNewsStats } from "@/suite/NotifyList";
import type { Gig, Member, Topic } from "@/data/types";

export default function Inicio() {
  const { me } = useMe();
  const nav = useNavigate();
  const layout = useHomeLayout(me);
  const [editing, setEditing] = useState(false);
  const todo = usePendientes(me);
  const h = new Date().getHours();
  const hello = h < 6 ? "buenas noches" : h < 14 ? "buenos días" : h < 21 ? "buenas tardes" : "buenas noches";
  const today = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

  const actions: ReactNode[] = [];
  if (me.role === "admin") actions.push(<Button key="bolo" variant="primary" onClick={() => nav("/bolos?nuevo=1")}>+ bolo</Button>);
  if (can("presupuestos", me)) actions.push(<Button key="pres" onClick={() => nav("/presupuestos")}>presupuestos</Button>);
  if (can("finanzas", me)) actions.push(<Button key="gasto" onClick={() => nav("/finanzas?nuevo=1")}>+ gasto</Button>);
  if (me.role === "staff" && can("puerta", me)) actions.push(<Button key="puerta" variant="primary" onClick={() => nav("/puerta")}>abrir puerta</Button>);
  if (me.role === "musico" && can("ensayos", me)) actions.push(<Button key="ensayos" variant="primary" onClick={() => nav("/ensayos")}>abrir ensayos</Button>);

  return (
    <main className="px-4 sm:px-6 lg:px-10 pt-6 md:pt-10 pb-12 flex flex-col gap-5 md:gap-6 max-w-[1400px]">
      {/* cabecera */}
      <header className="relative flex flex-col gap-3">
        <div aria-hidden className="pointer-events-none absolute -top-32 right-0 w-[520px] h-[340px] max-w-full rounded-full bg-senal/10 blur-3xl" />
        <p className="relative flex items-center gap-2.5 font-mono text-[11px] tracking-[.2em] uppercase text-crema/55">
          <span className="size-2 rounded-full bg-senal shadow-[0_0_0_4px] shadow-senal/20" />besta<span className="text-crema/25">/</span>{today}
        </p>
        <h1 className="relative text-[40px] sm:text-[56px] lg:text-[68px] font-extrabold tracking-[-.045em] leading-[.95]">
          {hello}, {me.name}<span className="text-senal">.</span>
        </h1>
        <p className="relative flex items-center gap-2 text-crema/70 md:text-[17px]">
          <Dot tone={todo.length ? "senal" : "ok"} />
          {todo.length ? `${plural(todo.length, "cosa pide", "cosas piden")} tu atención` : "todo al día"}
        </p>
        <div className="relative flex flex-wrap gap-2 mt-1">
          {actions}
          <Button onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))} className="hidden md:inline-flex">buscar <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded-md border border-crema/20">⌘K</kbd></Button>
          <a href="/" target="_blank" rel="noopener" className="inline-flex items-center justify-center gap-2 rounded-full h-11 px-[18px] text-[15px] border-[1.5px] border-crema/25 text-crema hover:border-crema/60">ver la web <Icon name="externo" size={15} /></a>
          <IconButton label="personalizar inicio" onClick={() => setEditing(true)} className="border-[1.5px] border-crema/25 hover:border-crema/60 hover:bg-transparent"><Icon name="ajustes" size={18} /></IconButton>
        </div>
      </header>

      {layout.visible.length === 0 ? (
        <Card className="flex flex-col items-start gap-3">
          <p className="text-crema/75">Has quitado todos los módulos del inicio.</p>
          <Button size="sm" onClick={() => setEditing(true)}>personalizar inicio</Button>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 lg:grid-flow-row-dense items-start">
          {layout.visible.map(w => (
            <div key={w.id} className={cx("min-w-0", w.size === "ancho" && "lg:col-span-2")}>
              <Widget id={w.id} todo={todo} />
            </div>
          ))}
        </div>
      )}

      <Customize open={editing} onClose={() => setEditing(false)} layout={layout} />
    </main>
  );
}

function Widget({ id, todo }: { id: WidgetId; todo: Todo[] }) {
  switch (id) {
    case "resumen": return <Resumen />;
    case "presupuestos": return <Presupuestos />;
    case "pendiente": return <Pendiente items={todo} />;
    case "proximo": return <Proximo />;
    case "agenda": return <Agenda />;
    case "caja": return <Caja />;
    case "entradas": return <Entradas />;
    case "pedidos": return <Pedidos />;
    case "newsletter": return <Newsletter />;
  }
}

/* ---------- resumen ---------- */
function Kpi({ to, k, v, sub, tone }: { to: string; k: string; v: ReactNode; sub: ReactNode; tone?: "senal" }) {
  return (
    <Link to={to} className="group min-h-[132px] p-4 sm:p-5 rounded-[18px] bg-tubo border border-crema/8 hover:border-senal/45 hover:-translate-y-0.5 transition flex flex-col gap-2">
      <span className="font-mono text-[10px] tracking-[.16em] uppercase text-crema/55">{k}</span>
      <span className={cx("text-[30px] sm:text-[36px] font-extrabold tracking-[-.04em] leading-none tabular-nums", tone === "senal" && "text-senal")}>{v}</span>
      <span className="text-[12.5px] text-crema/60 leading-snug">{sub}</span>
    </Link>
  );
}

function Resumen() {
  const { me } = useMe();
  const { data: songs } = useCollection("songs");
  const { data: gigs } = useCollection("gigs");
  const { data: quotes } = useCollection("quotes");
  const { data: incomes } = useCollection("incomes");
  const { data: expenses } = useCollection("expenses");
  const { data: members } = useCollection("members");
  const { data: settlements } = useCollection("settlements");
  const next = upcomingGigs(gigs)[0];
  const days = next?.date && !next.dateTbc ? daysUntil(next.date) : null;
  const open = quotes.filter(q => q.status === "enviado");
  const openSum = open.reduce((s, q) => s + quoteTotals(q).total, 0);
  const cash = incomes.reduce((s, i) => s + i.amountCents, 0) - expenses.reduce((s, e) => s + e.amountCents, 0);
  const mine = balances(members.filter(m => m.band), expenses, settlements).find(b => b.member.id === me.id);
  const cards: ReactNode[] = [];
  if (can("ensayos", me)) cards.push(<Kpi key="rep" to="/ensayos" k="repertorio" v={songs.length} sub={`${songs.filter(s => s.own).length} propias · ${songs.filter(s => !s.own).length} versiones`} />);
  if (can("bolos", me)) cards.push(<Kpi key="gig" to={next ? `/bolos/${next.id}` : "/bolos"} k="próximo bolo" tone="senal"
    v={next ? (next.dateTbc ? monYear(next.date).toLowerCase() : dateShort(next.date)) : "—"}
    sub={next ? `${gigTitle(next)}${days !== null ? ` · ${days === 0 ? "hoy" : `en ${days} días`}` : ""}` : "sin bolos a la vista"} />);
  if (can("presupuestos", me)) cards.push(<Kpi key="q" to="/presupuestos" k="presupuestos en juego" v={open.length} sub={open.length ? `${eur0(openSum)} esperando respuesta` : "ninguno esperando respuesta"} />);
  if (can("finanzas", me)) cards.push(<Kpi key="caja" to="/finanzas" k="caja de la banda" v={eur0(cash)}
    sub={mine && Math.abs(mine.cents) > 50 ? (mine.cents > 0 ? `te deben ${eur(mine.cents)}` : `debes ${eur(-mine.cents)}`) : "estás en paz con todos"} />);
  if (!cards.length) return null;
  return <div className={cx("grid gap-3 grid-cols-2", cards.length >= 4 ? "lg:grid-cols-4" : cards.length === 3 ? "lg:grid-cols-3" : "")}>{cards}</div>;
}

/* ---------- presupuestos ---------- */
function Presupuestos() {
  const { data: quotes } = useCollection("quotes");
  const recent = [...quotes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const tone = (st: string) => st === "aceptado" ? "bg-ok/15 text-crema" : st === "enviado" ? "bg-senal/15 text-senal-suave" : st === "rechazado" ? "bg-error/15 text-crema/80" : "bg-crema/8 text-crema/70";
  return (
    <Card>
      <CardTitle action={<Link to="/presupuestos" className="text-sm text-crema/75 hover:text-crema">todos <Icon name="flecha" size={14} className="inline align-[-2px]" /></Link>}>presupuestos recientes</CardTitle>
      {recent.length === 0 && <p className="text-sm text-crema/60">Aún no hay presupuestos.</p>}
      <ul className="flex flex-col -mx-2">
        {recent.map(q => (
          <li key={q.id}>
            <Link to={`/presupuestos/${q.id}`} className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-crema/5">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{q.client || "sin cliente"}</span>
                <span className="block font-mono text-[11px] text-crema/55 truncate">{q.number}{q.eventDate ? ` · ${dateShort(q.eventDate)}` : ""}</span>
              </span>
              <span className={cx("shrink-0 hidden sm:inline-block font-mono text-[10px] tracking-wider uppercase px-2 py-1 rounded-full", tone(q.status))}>{q.status}</span>
              <span className="shrink-0 w-[80px] text-right font-mono">{eur0(quoteTotals(q).total)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------- pendiente ---------- */
interface Todo { id: string; icon: IconName; title: string; sub: string; cta: string; to: string; urgent?: boolean; rank: number }

function usePendientes(me: Member): Todo[] {
  const { data: gigs } = useCollection("gigs");
  const { data: leads } = useCollection("leads");
  const { data: quotes } = useCollection("quotes");
  const { data: riders } = useCollection("riders");
  const { data: events } = useCollection("events");
  const { data: setlists } = useCollection("setlists");
  const { data: settings } = useCollection("settings");
  const { data: requests } = useCollection("requests");
  const { data: products } = useCollection("products");
  const { data: members } = useCollection("members");
  const { data: expenses } = useCollection("expenses");
  const { data: settlements } = useCollection("settlements");

  return useMemo(() => {
    const out: Todo[] = [];

    if (can("presupuestos", me)) {
      for (const l of leads.filter(x => x.status === "nueva")) out.push({
        id: "lead-" + l.id, icon: "presupuestos", rank: 1, urgent: true,
        title: `${l.org || l.name} quiere contrataros`,
        sub: [l.city, l.date && dateShort(l.date), ago(l.createdAt)].filter(Boolean).join(" · "),
        cta: "presupuestar", to: `/presupuestos?lead=${l.id}`,
      });
      const week = Date.now() - 7 * 864e5;
      for (const q of quotes.filter(x => x.status === "enviado" && x.sentAt && Date.parse(x.sentAt) < week)) out.push({
        id: "quote-" + q.id, icon: "presupuestos", rank: 4,
        title: `${q.client} no ha contestado`,
        sub: `${q.number} · enviado ${ago(q.sentAt!)}`,
        cta: "revisar", to: `/presupuestos/${q.id}`,
      });
    }

    if (can("bolos", me)) {
      for (const g of upcomingGigs(gigs).filter(x => x.date && daysUntil(x.date) <= 45)) {
        // Un músico solo ve lo que le toca a él (el setlist); el resto es cosa de la banda.
        const missing = gigChecklist(g, { quotes, riders, events, setlists, settings })
          .filter(c => !c.done && (me.role === "admin" || c.key === "setlist"));
        const tbc = g.status === "tentativo";
        if (!missing.length && !tbc) continue;
        const days = daysUntil(g.date);
        const what = [tbc && "sin confirmar", missing.length && `falta ${missing.slice(0, 2).map(c => c.name).join(", ")}${missing.length > 2 ? ` y ${missing.length - 2} más` : ""}`].filter(Boolean).join(" · ");
        out.push({
          id: "gig-" + g.id, icon: "bolos", rank: days <= 14 ? 0 : 3, urgent: days <= 14,
          title: `${gigTitle(g)} · ${g.dateTbc ? monYear(g.date).toLowerCase() : dateShort(g.date)}${days <= 14 ? ` · en ${days} días` : ""}`,
          sub: what, cta: "abrir ficha",
          to: `/bolos/${g.id}${missing[0] && ["rider", "entradas", "setlist"].includes(missing[0].key) ? `?tab=${missing[0].key}` : ""}`,
        });
      }
    }

    if (can("merch", me)) {
      const fresh = requests.filter(r => r.status === "nueva");
      if (fresh.length) out.push({
        id: "requests", icon: "merch", rank: 2,
        title: `${plural(fresh.length, "encargo", "encargos")} de merch por confirmar`,
        sub: fresh.slice(0, 2).map(r => r.name).join(", ") + (fresh.length > 2 ? "…" : ""),
        cta: "ver encargos", to: "/merch",
      });
      const low = products.filter(p => !p.archived).flatMap(p => p.variants.filter(v => v.stock <= 2).map(v => `${p.name}${p.variants.length > 1 ? " " + v.label : ""} (${v.stock})`));
      if (low.length) out.push({
        id: "stock", icon: "merch", rank: 5,
        title: `poco stock en ${plural(low.length, "talla", "tallas")}`,
        sub: low.slice(0, 3).join(" · ") + (low.length > 3 ? "…" : ""),
        cta: "ver stock", to: "/merch",
      });
    }

    if (can("finanzas", me) && me.band) {
      const mine = balances(members.filter(m => m.band), expenses, settlements).find(b => b.member.id === me.id);
      if (mine && mine.cents < -500) out.push({
        id: "debt", icon: "finanzas", rank: 4,
        title: `debes ${eur(-mine.cents)} a la banda`,
        sub: "se liquida en finanzas", cta: "liquidar", to: "/finanzas",
      });
    }

    return out.sort((a, b) => a.rank - b.rank);
  }, [me, gigs, leads, quotes, riders, events, setlists, settings, requests, products, members, expenses, settlements]);
}

function Pendiente({ items }: { items: Todo[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 5);
  return (
    <Card>
      <CardTitle action={items.length > 0 && <span className="font-mono text-xs text-crema/60">{items.length}</span>}>pendiente</CardTitle>
      {items.length === 0 ? (
        <div className="py-6 flex flex-col items-center gap-2 text-center">
          <span className="size-10 rounded-full bg-crema/8 grid place-items-center"><Icon name="check" /></span>
          <p className="text-crema/70 text-sm">Nada esperando. Lo que necesite que hagas algo aparecerá aquí.</p>
        </div>
      ) : (
        <ul className="flex flex-col -mx-2">
          {shown.map(t => (
            <li key={t.id}>
              <Link to={t.to} className="group flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-crema/5">
                <span className={cx("size-9 shrink-0 rounded-xl grid place-items-center", t.urgent ? "bg-senal/15 text-senal-suave" : "bg-crema/8 text-crema/80")}><Icon name={t.icon} size={17} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{t.title}</span>
                  <span className="block truncate text-xs text-crema/60">{t.sub}</span>
                </span>
                <span className="shrink-0 hidden sm:inline-flex items-center gap-1 text-[13px] text-crema/70 group-hover:text-crema">{t.cta}<Icon name="flecha" size={13} /></span>
                <Icon name="flecha" size={15} className="sm:hidden shrink-0 text-crema/50" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {items.length > 5 && <button type="button" onClick={() => setAll(a => !a)} className="mt-2 text-sm text-crema/70 hover:text-crema">{all ? "ver menos" : `ver ${items.length - 5} más`}</button>}
    </Card>
  );
}

/* ---------- próximo bolo ---------- */
function Proximo() {
  const { me } = useMe();
  const { data: gigs } = useCollection("gigs");
  const { data: events } = useCollection("events");
  const { data: quotes } = useCollection("quotes");
  const { data: riders } = useCollection("riders");
  const { data: setlists } = useCollection("setlists");
  const { data: settings } = useCollection("settings");
  const next = upcomingGigs(gigs)[0];

  if (!next) return (
    <Card className="flex flex-col items-start gap-3">
      <CardTitle className="!mb-0">próximo bolo</CardTitle>
      <p className="text-sm text-crema/70">No hay bolos a la vista.</p>
      {me.role === "admin" && <Link to="/bolos?nuevo=1" className="text-sm underline">crear uno</Link>}
    </Card>
  );

  const ev = events.find(e => e.gigId === next.id);
  const list = gigChecklist(next, { quotes, riders, events, setlists, settings });
  const done = list.filter(c => c.done).length;
  const days = next.date && !next.dateTbc ? daysUntil(next.date) : null;
  const to = can("bolos", me) ? `/bolos/${next.id}` : `/entradas/${ev?.id ?? ""}`;

  return (
    <Link to={to} className="group block rounded-[20px] bg-tubo overflow-hidden">
      <div className="relative h-[120px] sm:h-[140px]">
        <img src="/img/escenario-azul.jpg" alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-tubo via-tubo/40 to-transparent" />
        <span className="absolute top-3 left-4 font-mono text-xs text-crema/90 bg-noche/60 backdrop-blur px-2.5 py-1 rounded-full">
          próximo bolo{days !== null ? ` · ${days === 0 ? "hoy" : `en ${days} días`}` : ""}
        </span>
      </div>
      <div className="px-5 pb-5 -mt-6 relative flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[24px] font-bold tracking-[-.02em] leading-tight truncate">{gigTitle(next)}</h2>
            <p className="text-sm text-crema/70 truncate">{[next.dateTbc ? monYear(next.date).toLowerCase() : dateShort(next.date), next.time, gigSub(next)].filter(Boolean).join(" · ")}</p>
          </div>
          <span className="shrink-0 size-10 rounded-full border-[1.5px] border-crema/25 grid place-items-center group-hover:border-crema/60"><Icon name="flecha" size={16} /></span>
        </div>
        {can("bolos", me) && list.length > 0 && <>
          <div className="flex items-center gap-3">
            <Progress value={done / list.length} className="flex-1" />
            <span className="font-mono text-xs text-crema/70 shrink-0">{done}/{list.length} listo</span>
          </div>
          {done < list.length && <div className="flex flex-wrap gap-1.5">
            {list.filter(c => !c.done).slice(0, 4).map(c => <Pill key={c.key}>{c.name}</Pill>)}
            {list.length - done > 4 && <Pill>+{list.length - done - 4}</Pill>}
          </div>}
        </>}
      </div>
    </Link>
  );
}

/* ---------- agenda ---------- */
function Agenda() {
  const { data: gigs } = useCollection("gigs");
  const next = upcomingGigs(gigs).slice(0, 5);
  return (
    <Card>
      <CardTitle action={<Link to="/bolos" className="text-sm text-crema/75 hover:text-crema">todos <Icon name="flecha" size={14} className="inline align-[-2px]" /></Link>}>agenda</CardTitle>
      {next.length === 0 && <p className="text-sm text-crema/60">Sin bolos por delante.</p>}
      <ul className="flex flex-col -mx-2">
        {next.map((g: Gig) => (
          <li key={g.id}>
            <Link to={`/bolos/${g.id}`} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-crema/5">
              <span className="w-12 h-[50px] shrink-0 rounded-xl bg-noche grid place-items-center content-center leading-none">
                <span className="text-[18px] font-bold">{g.date && !g.dateTbc ? dayNum(g.date) : "—"}</span>
                <span className="font-mono text-[10px] text-crema/60 mt-1">{g.date ? mon(g.date) : "s/f"}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{gigTitle(g)}</span>
                <span className="block truncate text-xs text-crema/60">{gigSub(g) || g.time || "hora por confirmar"}</span>
              </span>
              <Pill tone={g.status === "confirmado" ? "ok" : "mute"}>{g.status}</Pill>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------- caja ---------- */
function Caja() {
  const { me } = useMe();
  const { data: incomes } = useCollection("incomes");
  const { data: expenses } = useCollection("expenses");
  const { data: members } = useCollection("members");
  const { data: settlements } = useCollection("settlements");
  const cash = incomes.reduce((s, i) => s + i.amountCents, 0) - expenses.reduce((s, e) => s + e.amountCents, 0);
  const mine = balances(members.filter(m => m.band), expenses, settlements).find(b => b.member.id === me.id);
  return (
    <Link to="/finanzas" className="rounded-[20px] bg-crema text-noche p-5 flex flex-col gap-1">
      <span className="text-sm">caja de la banda</span>
      <span className="font-mono text-[32px] leading-tight">{eur0(cash)}</span>
      <span className="text-[13px] text-noche/70">{mine && Math.abs(mine.cents) > 50 ? (mine.cents > 0 ? `te deben ${eur(mine.cents)}` : `debes ${eur(-mine.cents)}`) : "estás en paz con todos"}</span>
    </Link>
  );
}

/* ---------- entradas ---------- */
function Entradas() {
  const { data: gigs } = useCollection("gigs");
  const { data: events } = useCollection("events");
  const { data: orders } = useCollection("orders");
  const { data: tickets } = useCollection("tickets");
  const gig = upcomingGigs(gigs).find(g => events.some(e => e.gigId === g.id));
  const ev = gig && events.find(e => e.gigId === gig.id);
  if (!gig || !ev) return (
    <Card><CardTitle className="!mb-1">entradas</CardTitle><p className="text-sm text-crema/60">Ningún bolo próximo vende entradas desde aquí.</p></Card>
  );
  const stats = eventStats(ev, { orders, tickets });
  const bars = salesByDay(ev.id, { orders });
  const maxBar = Math.max(1, ...bars.map(b => b.qty));
  const peak = bars.reduce((a, b) => (b.qty > a.qty ? b : a), bars[0] ?? { qty: 0, day: "" });
  return (
    <Card className="flex flex-col gap-4">
      <CardTitle className="!mb-0" action={<span className="font-mono text-xs text-crema/75 flex items-center gap-2"><Dot tone={ev.salesEnabled ? "ok" : "mute"} />{ev.salesEnabled ? "venta activa" : "venta cerrada"}</span>}>
        <Link to={`/entradas/${ev.id}`} className="hover:underline">entradas · {gigTitle(gig)}</Link>
      </CardTitle>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="vendidas" value={stats.sold} sub={`de ${ev.capacity} · ${Math.round(stats.pct * 100)} %`} />
        <Stat label="ingresos" value={eur0(stats.gross)} sub={`neto aprox. ${eur0(stats.net)}`} />
        <Stat label="disponibles" value={stats.free} sub={`en pago ahora: ${stats.pending}`} />
        <Stat label="dentro" value={stats.inside || "—"} sub={stats.inside ? "escaneadas" : "el día del bolo"} />
      </div>
      <Progress value={stats.pct} />
      <div className="hidden sm:block">
        <div className="flex justify-between text-xs text-crema/60 mb-2"><span>ventas por día · últimas 3 semanas</span>{peak?.qty > 0 && <span className="font-mono">pico: {dateShort(peak.day)} · {peak.qty}</span>}</div>
        <div role="img" aria-label="Ventas diarias de las últimas tres semanas" className="h-[80px] flex items-end gap-1">
          {bars.map(b => (
            <div key={b.day} title={`${dateShort(b.day)}: ${b.qty}`} className={cx("flex-1 rounded-t", b === peak && b.qty ? "bg-senal" : "bg-crema/25")} style={{ height: `${Math.max(3, (b.qty / maxBar) * 100)}%` }} />
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ---------- pedidos ---------- */
function Pedidos() {
  const { data: orders } = useCollection("orders");
  const recent = orders.filter(o => o.status !== "caducado").slice(0, 5);
  return (
    <Card>
      <CardTitle action={<Link to="/entradas" className="text-sm text-crema/75 hover:text-crema">ver todos <Icon name="flecha" size={14} className="inline align-[-2px]" /></Link>}>últimos pedidos</CardTitle>
      {recent.length === 0 && <p className="text-sm text-crema/60">Todavía no hay pedidos.</p>}
      <ul className="flex flex-col">
        {recent.map(o => (
          <li key={o.id} className="flex items-center justify-between gap-3 py-2.5 border-t border-crema/8 text-sm">
            <span className="min-w-0">
              <span className="block truncate">{o.email ? maskEmail(o.email) : `taquilla · ${o.method ?? "efectivo"}`}</span>
              <span className="text-xs text-crema/60">{ago(o.createdAt)}</span>
            </span>
            <span className="flex items-center gap-3 shrink-0">
              <Pill tone={o.status === "pagado" ? "ok" : o.status === "devuelto" ? "error" : "mute"}>{o.status}</Pill>
              <span className="font-mono w-[72px] text-right">{eur(o.amountCents)}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------- personalizar ---------- */
function Customize({ open, onClose, layout }: { open: boolean; onClose: () => void; layout: ReturnType<typeof useHomeLayout> }) {
  return (
    <Sheet open={open} onClose={onClose} title="personalizar inicio"
      footer={<div className="flex justify-between gap-2"><Button size="sm" variant="quiet" onClick={layout.reset}>restablecer</Button><Button size="sm" variant="primary" onClick={onClose}>listo</Button></div>}>
      <p className="text-sm text-crema/70 mb-4">Elige qué ves al entrar y en qué orden. Solo te afecta a ti, en este aparato.</p>
      <HomeModulesEditor layout={layout} />
    </Sheet>
  );
}

/* La lista de la web: cuánta gente hay por interés, últimos avisos y
   el de canción nueva (los de bolo y merch salen en su ficha). */
function Newsletter() {
  const stats = useNewsStats();
  const d = stats.data;
  return (
    <Card className="flex flex-col gap-3">
      <CardTitle action={<Link to="/newsletter" className="text-sm text-crema/75 hover:text-crema">ver todo <Icon name="flecha" size={14} className="inline align-[-2px]" /></Link>}>newsletter</CardTitle>
      {stats.isPending && <p className="text-sm text-crema/60">contando…</p>}
      {stats.error && <p className="text-sm text-crema/60">No se ha podido leer la lista de Brevo.</p>}
      {d && <>
        <p className="text-sm text-crema/75"><b className="text-crema">{d.total}</b> {d.total === 1 ? "persona apuntada" : "personas apuntadas"}</p>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(TOPIC_LABEL) as Topic[]).map(t => (
            <div key={t} className="rounded-xl bg-noche px-3 py-2">
              <div className="font-mono text-lg leading-tight">{d.byTopic[t]}</div>
              <div className="text-[11px] text-crema/60">{TOPIC_LABEL[t]}</div>
            </div>
          ))}
        </div>
        {d.recent.length > 0 && <ul className="flex flex-col">
          {d.recent.slice(0, 3).map(c => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2 border-t border-crema/8 text-sm">
              <span className="min-w-0 truncate">{c.subject}</span>
              <span className="shrink-0 font-mono text-[11px] text-crema/60">{c.sentAt ? ago(c.sentAt) : ""} · {c.opened}/{c.delivered}</span>
            </li>
          ))}
        </ul>}
      </>}
      <NotifyButton size="sm" label="avisar de canción nueva" draft={songDraft()} />
      <p className="text-xs text-crema/55">Avisos de bolos, merch o libres, historial y suscriptores en <Link to="/newsletter" className="underline">newsletter</Link>.</p>
    </Card>
  );
}
