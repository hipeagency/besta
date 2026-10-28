/* Inicio: lo urgente de un vistazo. */
import { Link, useNavigate } from "react-router";
import { Page } from "@/suite/Shell";
import { useMe } from "@/suite/session";
import { can } from "@/suite/nav";
import { useCollection } from "@/data/hooks";
import { eventStats, gigChecklist, salesByDay, upcomingGigs, balances } from "@/data/selectors";
import { Button, Card, CardTitle, Dot, Pill, Stat } from "@/components/ui";
import { ago, cx, dateShort, daysUntil, eur, eur0, maskEmail, todayLabel } from "@/lib/format";
import { Icon } from "@/components/ui/icons";
import { NotifyButton, TOPIC_LABEL, useNewsStats } from "@/suite/NotifyList";
import type { Topic } from "@/data/types";

export default function Inicio() {
  const { me } = useMe();
  const nav = useNavigate();
  const { data: gigs } = useCollection("gigs");
  const { data: events } = useCollection("events");
  const { data: orders } = useCollection("orders");
  const { data: tickets } = useCollection("tickets");
  const { data: leads } = useCollection("leads");
  const { data: quotes } = useCollection("quotes");
  const { data: riders } = useCollection("riders");
  const { data: setlists } = useCollection("setlists");
  const { data: incomes } = useCollection("incomes");
  const { data: expenses } = useCollection("expenses");
  const { data: members } = useCollection("members");
  const { data: settlements } = useCollection("settlements");

  const next = upcomingGigs(gigs)[0];
  const ev = next && events.find(e => e.gigId === next.id);
  const stats = ev && eventStats(ev, { orders, tickets });
  const bars = ev ? salesByDay(ev.id, { orders }) : [];
  const maxBar = Math.max(1, ...bars.map(b => b.qty));
  const peak = bars.reduce((a, b) => (b.qty > a.qty ? b : a), bars[0] ?? { qty: 0, day: "" });
  const checklist = next ? gigChecklist(next, { quotes, riders, events, setlists }) : [];
  const newLeads = leads.filter(l => l.status === "nueva");
  const recent = orders.filter(o => o.status !== "caducado").slice(0, 5);
  const cash = incomes.reduce((s, i) => s + i.amountCents, 0) - expenses.reduce((s, e) => s + e.amountCents, 0);
  const myBalance = balances(members.filter(m => m.band), expenses, settlements).find(b => b.member.id === me.id);

  return (
    <Page
      kicker={todayLabel()}
      title={`buenas, ${me.name}.`}
      actions={<>
        {can("finanzas", me) && <Button onClick={() => nav("/finanzas?nuevo=1")}>+ gasto</Button>}
        {me.role === "admin" && <Button variant="primary" onClick={() => nav("/bolos?nuevo=1")}>+ nuevo bolo</Button>}
      </>}
    >
      {/* próximo bolo */}
      {!can("bolos", me) && !can("entradas", me) ? null : next ? (
        <Link to={can("bolos", me) ? `/bolos/${next.id}` : `/entradas/${ev?.id ?? ""}`} className="rounded-3xl bg-tubo overflow-hidden flex flex-wrap group">
          <div className="relative flex-[1_1_260px] min-h-[150px] sm:min-h-[220px]">
            <img src="/img/escenario-azul.jpg" alt="" className="absolute inset-0 size-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b sm:bg-gradient-to-r from-transparent from-40% to-tubo" />
          </div>
          <div className="flex-[2_1_380px] p-5 sm:p-7 flex flex-col gap-4">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="font-mono text-xs text-senal">PRÓXIMO BOLO · {daysUntil(next.date) === 0 ? "HOY" : `EN ${daysUntil(next.date)} DÍAS`}</p>
                <h2 className="text-[26px] sm:text-[30px] font-bold tracking-[-.02em]">{next.city} · {dateShort(next.date)}</h2>
                <p className="text-crema/70">{next.venue}{next.doors ? ` · puertas ${next.doors}` : ""}</p>
              </div>
              <span className="self-start h-10 px-4 rounded-full border-[1.5px] border-crema/25 grid place-items-center text-sm group-hover:border-crema/60">abrir ficha <Icon name="flecha" size={14} className="inline align-[-2px]" /></span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2">
              {checklist.map(c => (
                <div key={c.key} className="p-3 rounded-xl border border-crema/10 flex flex-col gap-0.5">
                  <span className={cx("font-mono text-[11px]", c.done ? "text-crema/85" : "text-crema/55")}>{c.done ? <><Icon name="check" size={12} className="inline align-[-1px] mr-1" />hecho</> : "pendiente"}</span>
                  <span className="text-[14px]">{c.name}</span>
                </div>
              ))}
            </div>
          </div>
        </Link>
      ) : (
        <Card><p className="text-crema/70">No hay bolos a la vista. <Link className="underline" to="/bolos?nuevo=1">Crea uno</Link>.</p></Card>
      )}

      {/* entradas */}
      {ev && stats && can("entradas", me) && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold">entradas · {next.city}</h2>
            <span className="font-mono text-xs text-crema/75 flex items-center gap-2"><Dot tone={ev.salesEnabled ? "ok" : "mute"} />{ev.salesEnabled ? "venta activa" : "venta cerrada"}</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="!p-4"><Stat label="vendidas" value={stats.sold} sub={`de ${ev.capacity} · ${Math.round(stats.pct * 100)} %`} /></Card>
            <Card className="!p-4"><Stat label="ingresos" value={eur0(stats.gross)} sub={`neto aprox. ${eur0(stats.net)}`} /></Card>
            <Card className="!p-4"><Stat label="disponibles" value={stats.free} sub={`en pago ahora: ${stats.pending}`} /></Card>
            <Card className="!p-4"><Stat label="dentro" value={stats.inside || "—"} sub={stats.inside ? "escaneadas" : "se activa el día del bolo"} /></Card>
          </div>
          <Card className="!p-4 hidden sm:block">
            <div className="flex justify-between text-sm text-crema/70 mb-3"><span>ventas por día · últimas 3 semanas</span>{peak?.qty > 0 && <span className="font-mono">pico: {dateShort(peak.day)} · {peak.qty}</span>}</div>
            <div role="img" aria-label="Ventas diarias de las últimas tres semanas" className="h-[110px] flex items-end gap-1">
              {bars.map(b => (
                <div key={b.day} title={`${dateShort(b.day)}: ${b.qty}`} className={cx("flex-1 rounded-t", b === peak && b.qty ? "bg-senal" : "bg-crema/30")} style={{ height: `${Math.max(3, (b.qty / maxBar) * 100)}%` }} />
              ))}
            </div>
          </Card>
        </section>
      )}

      <div className="flex flex-wrap gap-4 items-start">
        {can("entradas", me) && <Card className="flex-[3_1_420px] min-w-0">
          <CardTitle action={ev && <Link to={`/entradas/${ev.id}`} className="text-sm text-crema/75 hover:text-crema">ver todos <Icon name="flecha" size={14} className="inline align-[-2px]" /></Link>}>últimos pedidos</CardTitle>
          <ul className="flex flex-col">
            {recent.map(o => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-2.5 border-t border-crema/8 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">{maskEmail(o.email)}</span>
                  <span className="text-xs text-crema/60">{ago(o.createdAt)}</span>
                </span>
                <span className="flex items-center gap-3 shrink-0">
                  <Pill tone={o.status === "pagado" ? "ok" : o.status === "devuelto" ? "error" : "mute"}>{o.status}</Pill>
                  <span className="font-mono w-[72px] text-right">{eur(o.amountCents)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>}

        <div className="flex-[2_1_280px] min-w-0 flex flex-col gap-4">
          {can("presupuestos", me) && <Card>
            <CardTitle>solicitudes de contratación{newLeads.length ? ` · ${newLeads.length}` : ""}</CardTitle>
            {newLeads.length === 0 && <p className="text-sm text-crema/60">Nada nuevo. Las que lleguen desde la web aparecen aquí.</p>}
            {newLeads.map(l => (
              <div key={l.id} className="flex items-center justify-between gap-3 py-2.5 border-t border-crema/8">
                <span className="min-w-0"><span className="block truncate">{l.org}</span><span className="block font-mono text-[11px] text-crema/60">{l.city} · {ago(l.createdAt)}</span></span>
                <Link to={`/presupuestos?lead=${l.id}`} className="shrink-0 h-[34px] px-3 rounded-full bg-senal/15 text-senal-suave grid place-items-center text-[13px] inline-flex items-center gap-1"><Icon name="flecha" size={14} />presupuesto</Link>
              </div>
            ))}
          </Card>}
          {can("finanzas", me) && <Link to="/finanzas" className="rounded-[20px] bg-crema text-noche p-5 flex flex-col gap-1">
            <span className="text-sm">caja de la banda</span>
            <span className="font-mono text-[32px] leading-tight">{eur0(cash)}</span>
            <span className="text-[13px] text-noche/70">{myBalance && Math.abs(myBalance.cents) > 50 ? (myBalance.cents > 0 ? `te deben ${eur(myBalance.cents)}` : `debes ${eur(-myBalance.cents)}`) : "estás en paz con todos"}</span>
          </Link>}
          {me.role === "admin" && <Newsletter />}
        </div>
      </div>
    </Page>
  );
}

/* La lista de la web: cuánta gente hay por interés, últimos avisos y
   el de canción nueva (los de bolo y merch salen en su ficha). */
function Newsletter() {
  const stats = useNewsStats();
  const d = stats.data;
  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>newsletter</CardTitle>
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
      <NotifyButton size="sm" label="avisar de canción nueva" draft={{
        topic: "lanzamientos", subject: "canción nueva de besta", title: "canción nueva",
        body: "Ya está fuera nuestra canción nueva, en todas las plataformas.\n\nPonla alta.",
        ctaLabel: "escuchar en Spotify", ctaUrl: "https://open.spotify.com/intl-es/artist/14kN0Ny6BdnaWg1dShpZSe",
      }} />
      <p className="text-xs text-crema/55">Los avisos de bolos y merch están en la ficha de cada uno.</p>
    </Card>
  );
}
