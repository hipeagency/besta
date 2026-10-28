/* Ficha de bolo: el centro de todo. Lo que pasa alrededor de un
   concierto (entradas, setlist, rider, merch, dinero) se ve aquí. */
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Page } from "@/suite/Shell";
import { useAction, useCollection } from "@/data/hooks";
import { api, uid } from "@/data/api";
import { eventStats, gigChecklist, setlistMinutes, upcomingGigs } from "@/data/selectors";
import type { Gig, NewsInput, TicketEvent } from "@/data/types";
import { Button, Card, CardTitle, Empty, Input, Pill, Progress, Segmented, Select, Stat, Textarea, Toggle, useToast } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { NewGig, applySoldOut } from "./Bolos";
import { NotifyButton } from "@/suite/NotifyList";
import { cx, dateLong, dateShort, daysUntil, eur, isPast } from "@/lib/format";

/* En la web: oculto, en secreto (teaser con lo desvelado) o público. */
type WebMode = "oculto" | "secreto" | "publico";
const webMode = (g: Gig): WebMode => !g.published ? "oculto" : g.teaser ? "secreto" : "publico";
const webPatch = (g: Gig, m: WebMode): Partial<Gig> =>
  m === "oculto" ? { published: false }
  : m === "secreto" ? { published: true, teaser: g.teaser ?? { date: "mes", city: true, venue: false } }
  : { published: true, teaser: null };
const WEB_TOAST: Record<WebMode, string> = {
  oculto: "Oculto en la web",
  secreto: "En la web en secreto: elige qué se desvela",
  publico: "Ahora sale en la web con todo",
};

type Tab = "resumen" | "entradas" | "setlist" | "rider" | "merch" | "dinero";

export default function Bolo() {
  const { id } = useParams();
  const toast = useToast();
  const { data: gigs, loading } = useCollection("gigs");
  const { data: events } = useCollection("events");
  const { data: orders } = useCollection("orders");
  const { data: tickets } = useCollection("tickets");
  const { data: quotes } = useCollection("quotes");
  const { data: riders } = useCollection("riders");
  const { data: setlists } = useCollection("setlists");
  const [tab, setTab] = useState<Tab>("resumen");
  const [editing, setEditing] = useState(false);
  const patch = useAction((p: Partial<Gig>) => api.update("gigs", id!, p));

  const g = gigs.find(x => x.id === id);
  if (loading) return null;
  if (!g) return <Page title="bolo no encontrado" back={{ to: "/bolos", label: "bolos" }}><Empty title="Este bolo ya no existe" /></Page>;

  const ev = events.find(e => e.gigId === g.id);
  const checklist = gigChecklist(g, { quotes, riders, events, setlists });
  const strip = [...upcomingGigs(gigs)].slice(0, 6);
  const d = daysUntil(g.date);

  return (
    <Page
      back={{ to: "/bolos", label: "bolos" }}
      kicker={<span className="flex flex-wrap items-center gap-2">
        <Pill tone={g.status === "confirmado" ? "solid" : "mute"}>{g.status}</Pill>
        <span>{dateLong(g.date).toUpperCase()}{!isPast(g.date) ? ` · ${d === 0 ? "HOY" : `EN ${d} DÍAS`}` : " · PASADO"}</span>
      </span>}
      title={g.city}
      actions={<>
        <Segmented size="sm" value={webMode(g)} onChange={m => { patch.run(webPatch(g, m)); toast(WEB_TOAST[m], "ok"); }} options={[
          { value: "oculto", label: "oculto" }, { value: "secreto", label: "secreto" }, { value: "publico", label: "en la web" },
        ]} />
        {g.ticketing !== "ninguna" && !isPast(g.date) && (
          <Button variant={g.soldOut ? "primary" : "ghost"} aria-pressed={!!g.soldOut} onClick={async () => {
            const on = !g.soldOut;
            if (on && !confirm(ev?.salesEnabled ? "¿Marcar sold out? Se cierra la venta de entradas y en la web sale el cartel." : "¿Marcar sold out? En la web sale el cartel en lugar del botón de entradas.")) return;
            await applySoldOut(g, on, ev);
            toast(on ? (ev?.salesEnabled ? "Sold out: venta cerrada y cartel en la web" : "Sold out: cartel en la web") : "Quitado el sold out. La venta sigue cerrada: ábrela en entradas si quieres.", "ok");
          }}>{g.soldOut ? "sold out ✓" : "sold out"}</Button>
        )}
        {g.published && !isPast(g.date) && <NotifyButton draft={gigDraft(g, ev)} />}
        <Button onClick={() => setEditing(true)}><Icon name="editar" size={16} />editar</Button>
      </>}
    >
      <p className="-mt-3 text-crema/70">{g.venue}{g.address ? ` · ${g.address}` : ""}{g.capacity ? ` · aforo ${g.capacity}` : ""}</p>

      {g.published && g.teaser && <Teaser g={g} onChange={p => patch.run(p)} />}

      {/* otros bolos */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {strip.map(x => (
          <Link key={x.id} to={`/bolos/${x.id}`} className={cx("shrink-0 min-w-[130px] px-3.5 py-2.5 rounded-2xl border flex flex-col", x.id === g.id ? "border-senal bg-tubo" : "border-crema/12 hover:border-crema/30")}>
            <span className={cx("font-mono text-[11px]", x.id === g.id ? "text-senal" : "text-crema/60")}>{dateShort(x.date).toUpperCase()}</span>
            <span className="font-medium">{x.city}</span>
          </Link>
        ))}
      </div>

      <Segmented value={tab} onChange={setTab} className="self-start" options={[
        { value: "resumen", label: "resumen" }, { value: "entradas", label: "entradas" }, { value: "setlist", label: "setlist" },
        { value: "rider", label: "rider" }, { value: "merch", label: "merch" }, { value: "dinero", label: "dinero" },
      ]} />

      {tab === "resumen" && (
        <div className="flex flex-wrap gap-4 items-start">
          <div className="flex-[2_1_420px] min-w-0 flex flex-col gap-4">
            <Schedule g={g} onChange={schedule => patch.run({ schedule })} />
            <Card>
              <CardTitle>contactos</CardTitle>
              {g.contacts.length === 0 && <p className="text-sm text-crema/60">Sin contactos todavía. Añádelos desde «editar».</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                {g.contacts.map((c, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-noche">
                    <span className="min-w-0"><span className="block font-mono text-[11px] tracking-wider text-crema/60">{c.role.toUpperCase()}</span><span className="block truncate">{c.name}</span></span>
                    <span className="flex gap-1.5 shrink-0">
                      {c.email && <a href={`mailto:${c.email}`} aria-label={`Escribir a ${c.name}`} title={c.email} className="h-10 px-3 rounded-full bg-tubo grid place-items-center font-mono text-xs">@</a>}
                      {c.phone && <a href={`tel:${c.phone}`} aria-label={`Llamar a ${c.name}`} title={c.phone} className="size-10 rounded-full bg-tubo grid place-items-center"><Icon name="telefono" size={17} /></a>}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                {g.feeCents ? <Pill>caché {eur(g.feeCents)}</Pill> : null}
                {g.deal && <Pill>{g.deal}</Pill>}
                {g.quoteId && <Link to={`/presupuestos/${g.quoteId}`}><Pill tone="senal">presupuesto {quotes.find(q => q.id === g.quoteId)?.number} <Icon name="flecha" size={14} className="inline align-[-2px]" /></Pill></Link>}
                {(g.address || g.venue) && <a href={`https://www.google.com/maps/search/${encodeURIComponent(`${g.venue} ${g.address ?? ""} ${g.city}`)}`} target="_blank" rel="noopener"><Pill>cómo llegar <Icon name="externo" size={14} className="inline align-[-2px]" /></Pill></a>}
              </div>
            </Card>
            <Card>
              <CardTitle>notas</CardTitle>
              <Textarea defaultValue={g.notes ?? ""} rows={4} placeholder="Aparcamiento, camerino, lo que haya que recordar…"
                onBlur={e => { if (e.target.value !== (g.notes ?? "")) { patch.run({ notes: e.target.value }); toast("Notas guardadas", "ok"); } }} />
            </Card>
          </div>

          <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-3">
            <section className="rounded-[20px] bg-crema text-noche p-5 flex flex-col gap-2.5">
              <h2 className="font-semibold">checklist</h2>
              {checklist.map(c => (
                <label key={c.key} className={cx("flex items-center gap-2.5 text-[15px]", c.auto ? "cursor-default" : "cursor-pointer")}>
                  <input type="checkbox" checked={c.done} disabled={c.auto} className="size-5 accent-noche"
                    onChange={e => patch.run({ checklist: { ...g.checklist, [c.key]: e.target.checked } })} />
                  <span className="flex-1">{c.name}</span>
                  {c.auto && <span className="font-mono text-[11px] text-noche/60">auto</span>}
                </label>
              ))}
            </section>
            <Bandsintown g={g} ev={ev} />
            <LinkCard onClick={() => setTab("entradas")} mod="ENTRADAS"
              main={ev ? `${eventStats(ev, { orders, tickets }).sold} / ${ev.capacity} vendidas` : g.ticketing === "externa" ? "las vende otro" : "sin venta"}
              pct={ev ? eventStats(ev, { orders, tickets }).pct : 0} />
            <LinkCard onClick={() => setTab("setlist")} mod="SETLIST"
              main={(() => { const sl = setlists.find(s => s.id === g.setlistId || s.gigId === g.id); return sl ? `${sl.songIds.length} canciones` : "sin setlist"; })()}
              pct={(() => { const sl = setlists.find(s => s.id === g.setlistId || s.gigId === g.id); return sl?.closed ? 1 : sl ? .5 : 0; })()} />
            <LinkCard onClick={() => setTab("rider")} mod="RIDER" main={riders.find(r => r.sentTo.some(s => s.gigId === g.id))?.name ?? "sin enviar"} pct={riders.some(r => r.sentTo.some(s => s.gigId === g.id)) ? 1 : 0} />
          </div>
        </div>
      )}

      {tab === "entradas" && <TicketsTab g={g} ev={ev} />}
      {tab === "setlist" && <SetlistTab g={g} />}
      {tab === "rider" && <RiderTab g={g} />}
      {tab === "merch" && <MerchTab g={g} />}
      {tab === "dinero" && <MoneyTab g={g} ev={ev} />}

      <NewGig open={editing} onClose={() => setEditing(false)} gig={g} />
    </Page>
  );
}

function LinkCard({ mod, main, pct, onClick }: { mod: string; main: string; pct: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-left rounded-[18px] bg-tubo hover:bg-tubo-alto p-4 flex flex-col gap-2">
      <span className="flex justify-between font-mono text-[11px] tracking-wider text-crema/60"><span>{mod}</span><Icon name="flecha" size={14} /></span>
      <span className="text-lg font-semibold">{main}</span>
      <Progress value={pct} />
    </button>
  );
}

function Schedule({ g, onChange }: { g: Gig; onChange: (s: Gig["schedule"]) => void }) {
  const [time, setTime] = useState("");
  const [what, setWhat] = useState("");
  const sorted = [...g.schedule].sort((a, b) => a.time.localeCompare(b.time));
  const key = (w: string) => /puertas|besta/i.test(w);
  return (
    <Card>
      <CardTitle>el día</CardTitle>
      <ul>
        {sorted.map((s, i) => (
          <li key={i} className="flex items-center gap-4 py-2.5 border-t border-crema/8 group">
            <span className={cx("w-14 font-mono", key(s.what) ? "text-crema" : "text-crema/70")}>{s.time}</span>
            <span className={cx("size-2.5 rounded-full shrink-0", key(s.what) ? "bg-senal" : "bg-crema/35")} />
            <span className="flex-1">{s.what}</span>
            <span className="text-[13px] text-crema/60 hidden sm:block">{s.note}</span>
            <button type="button" aria-label={`Quitar ${s.what}`} onClick={() => onChange(g.schedule.filter(x => x !== s))} className="size-8 rounded-full grid place-items-center text-crema/50 hover:text-crema hover:bg-crema/10 sm:opacity-0 group-hover:opacity-100"><Icon name="x" size={14} /></button>
          </li>
        ))}
      </ul>
      <form className="flex gap-2 mt-3" onSubmit={e => { e.preventDefault(); if (!time || !what) return; onChange([...g.schedule, { time, what }]); setTime(""); setWhat(""); }}>
        <Input type="time" aria-label="Hora" value={time} onChange={e => setTime(e.target.value)} className="w-[110px]" />
        <Input aria-label="Qué pasa" placeholder="prueba de sonido, puertas…" value={what} onChange={e => setWhat(e.target.value)} />
        <Button type="submit">añadir</Button>
      </form>
    </Card>
  );
}

function TicketsTab({ g, ev }: { g: Gig; ev?: TicketEvent }) {
  const nav = useNavigate();
  const { data: orders } = useCollection("orders");
  const { data: tickets } = useCollection("tickets");
  const create = useAction(async () => {
    const e: TicketEvent = { id: uid("ev-"), gigId: g.id, name: `besta en ${g.city}`, description: "", image: "/img/escenario-azul.jpg", priceCents: 1200, capacity: g.capacity ?? 200, maxPerOrder: 10, salesEnabled: false };
    await api.insert("events", e);
    await api.update("gigs", g.id, { ticketing: "propia" });
    return e;
  });
  if (g.ticketing === "externa") return <Card><p>Las entradas las vende otro. {g.externalUrl && <a className="underline" href={g.externalUrl} target="_blank" rel="noopener">Ver enlace <Icon name="externo" size={14} className="inline align-[-2px]" /></a>}</p></Card>;
  if (!ev) return <Empty title="Este bolo no tiene venta de entradas" action={<Button variant="primary" onClick={async () => { const e = await create.run(); nav(`/entradas/${e.id}`); }}>crear venta de entradas</Button>}>Se crea cerrada: revisa precio y aforo y actívala cuando quieras.</Empty>;
  const s = eventStats(ev, { orders, tickets });
  return (
    <Card>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <Stat label="vendidas" value={s.sold} sub={`de ${ev.capacity}`} />
        <Stat label="invitaciones" value={s.invites} />
        <Stat label="ingresos" value={eur(s.gross)} sub={`neto ≈ ${eur(s.net)}`} />
        <Stat label="dentro" value={s.inside} />
      </div>
      {g.soldOut && <p className="mb-4 text-sm"><Pill tone="senal">sold out</Pill> <span className="text-crema/70">En la web sale el cartel y no se venden más.</span></p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => nav(`/entradas/${ev.id}`)}>gestionar entradas</Button>
        <Button onClick={() => nav(`/puerta/${ev.id}`)}><Icon name="puerta" size={16} />abrir puerta</Button>
      </div>
    </Card>
  );
}

function SetlistTab({ g }: { g: Gig }) {
  const nav = useNavigate();
  const { data: setlists } = useCollection("setlists");
  const { data: songs } = useCollection("songs");
  const sl = setlists.find(s => s.id === g.setlistId || s.gigId === g.id);
  const create = useAction(async () => {
    const s = { id: uid("sl-"), name: `${g.city} · ${dateShort(g.date)}`, gigId: g.id, songIds: [], closed: false };
    await api.insert("setlists", s);
    await api.update("gigs", g.id, { setlistId: s.id });
    return s;
  });
  if (!sl) return <Empty title="Sin setlist" action={<Button variant="primary" onClick={async () => { const s = await create.run(); nav(`/ensayos/setlists/${s.id}`); }}>crear setlist</Button>}>Se crea vacío y lo montáis en ensayos.</Empty>;
  const mins = setlistMinutes(sl.songIds, songs);
  return (
    <Card>
      <CardTitle action={<span className="font-mono text-sm text-crema/70">{sl.songIds.length} canciones · {Math.round(mins)} min{sl.closed ? " · cerrado" : ""}</span>}>{sl.name}</CardTitle>
      <ol className="flex flex-col">
        {sl.songIds.map((sid, i) => {
          const s = songs.find(x => x.id === sid);
          return <li key={sid} className="flex gap-4 py-2 border-t border-crema/8"><span className="w-6 font-mono text-crema/55">{i + 1}</span><span className="flex-1">{s?.title ?? "?"}</span><span className="font-mono text-sm text-crema/60">{s?.key}</span></li>;
        })}
      </ol>
      <div className="flex flex-wrap gap-2 mt-4">
        <Button variant="primary" onClick={() => nav(`/ensayos/setlists/${sl.id}`)}>editar en ensayos</Button>
        <Button onClick={() => nav(`/ensayos/directo/${sl.id}`)}><Icon name="play" size={14} />modo directo</Button>
      </div>
    </Card>
  );
}

function RiderTab({ g }: { g: Gig }) {
  const toast = useToast();
  const { data: riders } = useCollection("riders");
  const sent = riders.find(r => r.sentTo.some(s => s.gigId === g.id));
  const [pick, setPick] = useState(g.riderId ?? riders[0]?.id ?? "");
  const markSent = useAction(async () => {
    const r = riders.find(x => x.id === pick);
    if (!r) return;
    await api.update("riders", r.id, { sentTo: [...r.sentTo.filter(s => s.gigId !== g.id), { gigId: g.id, date: new Date().toISOString().slice(0, 10) }] });
    await api.update("gigs", g.id, { riderId: r.id });
  });
  if (!riders.length) return <Empty title="Todavía no hay ningún rider" action={<Link to="/rider" className="underline">crear rider</Link>} />;
  return (
    <Card>
      {sent ? <p className="mb-4">Se envió <b>{sent.name} v{sent.version}</b> el {dateShort(sent.sentTo.find(s => s.gigId === g.id)!.date)}.</p> : <p className="mb-4 text-crema/70">Aún no se ha enviado ningún rider a este bolo.</p>}
      <div className="flex flex-wrap gap-2 items-center">
        <Select aria-label="Formato del rider" value={pick} onChange={e => setPick(e.target.value)} className="w-auto min-w-[220px]">
          {riders.map(r => <option key={r.id} value={r.id}>{r.name} · v{r.version}</option>)}
        </Select>
        <Button variant="primary" onClick={async () => { await markSent.run(); toast("Marcado como enviado", "ok"); }}>marcar como enviado</Button>
        <Link to="/rider" className="text-sm underline text-crema/75">abrir rider</Link>
      </div>
    </Card>
  );
}

function MerchTab({ g }: { g: Gig }) {
  const nav = useNavigate();
  const { data: moves } = useCollection("moves");
  const { data: products } = useCollection("products");
  const sales = moves.filter(m => m.gigId === g.id && m.kind === "venta");
  const units = sales.reduce((s, m) => s + -m.qty, 0);
  const total = sales.reduce((s, m) => s + -m.qty * m.unitCents, 0);
  const low = products.filter(p => !p.archived).flatMap(p => p.variants.filter(v => v.stock <= 3).map(v => `${p.name}${v.label ? " " + v.label : ""}: ${v.stock}`));
  return (
    <Card>
      <div className="grid grid-cols-2 gap-4 mb-4"><Stat label="unidades vendidas" value={units} /><Stat label="ventas" value={eur(total)} /></div>
      {low.length > 0 && <p className="text-sm text-crema/75 mb-4">Stock bajo: {low.join(" · ")}</p>}
      <Button variant="primary" onClick={() => nav(`/merch/puesto?bolo=${g.id}`)}>abrir puesto para este bolo</Button>
    </Card>
  );
}

function MoneyTab({ g, ev }: { g: Gig; ev?: TicketEvent }) {
  const { data: orders } = useCollection("orders");
  const { data: tickets } = useCollection("tickets");
  const { data: expenses } = useCollection("expenses");
  const { data: moves } = useCollection("moves");
  const fee = g.feeCents ?? 0;
  const tix = ev ? eventStats(ev, { orders, tickets }).net : 0;
  const merch = moves.filter(m => m.gigId === g.id && m.kind === "venta").reduce((s, m) => s + -m.qty * m.unitCents, 0);
  const exp = expenses.filter(e => e.gigId === g.id);
  const out = exp.reduce((s, e) => s + e.amountCents, 0);
  const rows: [string, number][] = [["caché", fee], ["entradas (neto de Stripe)", tix], ["merch", merch], ["gastos del bolo", -out]];
  return (
    <Card>
      <ul>
        {rows.map(([k, v]) => <li key={k} className="flex justify-between py-2.5 border-t border-crema/8"><span>{k}</span><span className="font-mono">{v < 0 ? "− " + eur(-v) : eur(v)}</span></li>)}
        <li className="flex justify-between py-3 border-t-2 border-crema/20 text-xl font-semibold"><span>resultado</span><span className="font-mono">{eur(fee + tix + merch - out)}</span></li>
      </ul>
      {exp.length > 0 && <p className="text-sm text-crema/60 mt-3">Gastos: {exp.map(e => e.title).join(", ")}.</p>}
      <Link to={`/finanzas?nuevo=1&bolo=${g.id}`} className="inline-block mt-4 text-sm underline">+ añadir gasto a este bolo</Link>
    </Card>
  );
}

/* Bandsintown es de donde Spotify e Instagram sacan los conciertos.
   Importar de allí es automático; crear allí no: su API para artistas
   es solo de lectura. Esto deja los datos listos para pegarlos. */
function Bandsintown({ g, ev }: { g: Gig; ev?: TicketEvent }) {
  const toast = useToast();
  if (g.bandsintownId) return (
    <a href={`https://www.bandsintown.com/e/${g.bandsintownId}`} target="_blank" rel="noopener" className="rounded-[18px] bg-tubo hover:bg-tubo-alto p-4 flex items-center justify-between gap-3">
      <span><span className="block font-mono text-[11px] tracking-wider text-crema/60">BANDSINTOWN</span><span className="font-semibold">publicado · sale en Spotify</span></span>
      <Icon name="externo" size={16} className="text-crema/60 shrink-0" />
    </a>
  );
  const text = [
    `Fecha: ${g.date} · ${g.time}`, `Sala: ${g.venue}`, `Ciudad: ${g.city}`, g.address ? `Dirección: ${g.address}` : "",
    g.ticketing === "propia" && ev ? `Entradas: https://besta.es/#directo · ${eur(ev.priceCents)}` : g.externalUrl ? `Entradas: ${g.externalUrl}` : "",
  ].filter(Boolean).join("\n");
  return (
    <div className="rounded-[18px] border border-dashed border-crema/25 p-4 flex flex-col gap-2.5">
      <span className="font-mono text-[11px] tracking-wider text-crema/60">BANDSINTOWN</span>
      <span className="text-sm text-crema/80">{g.published ? "Aún no está en Bandsintown: no saldrá en Spotify." : "Cuando lo publiquéis, súbelo también a Bandsintown."}</span>
      <Button size="sm" className="self-start" onClick={async () => {
        try { await navigator.clipboard.writeText(text); toast("Datos copiados: pégalos en Bandsintown", "ok"); } catch { /* sin portapapeles */ }
        window.open("https://artists.bandsintown.com/", "_blank", "noopener");
      }}>copiar datos y abrir Bandsintown <Icon name="externo" size={14} className="inline align-[-2px]" /></Button>
      <span className="text-xs text-crema/55">Al día siguiente se enlaza solo con la importación.</span>
    </div>
  );
}

/* Qué se ve del bolo mientras está en secreto. Lo no desvelado ni siquiera
   llega a la web; allí sale borroso con un «avísame». */
function Teaser({ g, onChange }: { g: Gig; onChange: (p: Partial<Gig>) => void }) {
  const t = g.teaser!;
  const set = (p: Partial<typeof t>) => onChange({ teaser: { ...t, ...p } });
  const when = t.date === "exacta" ? dateShort(g.date) : t.date === "mes" ? dateLong(g.date).split(" ").slice(2).join(" ") : "fecha secreta";
  return (
    <Card className="flex flex-col gap-4 border border-senal/40">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>en la web, en secreto</CardTitle>
        <Button size="sm" variant="primary" onClick={() => onChange({ teaser: null })}>desvelar todo</Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <span className="text-sm text-crema/70">fecha</span>
          <Segmented size="sm" value={t.date} onChange={date => set({ date })} options={[
            { value: "oculta", label: "oculta" }, { value: "mes", label: "solo el mes" }, { value: "exacta", label: "exacta" },
          ]} />
        </div>
        <Toggle checked={t.city} onChange={city => set({ city })} label="ciudad" />
        <Toggle checked={t.venue} onChange={venue => set({ venue })} label="sala" />
      </div>
      <p className="text-sm text-crema/70">
        Así sale: <b className="text-crema">{when} · {t.city ? g.city : "ciudad secreta"}{t.venue ? ` · ${g.venue}` : ""}</b>.
        Lo que no está desvelado sale borroso, con un botón de avísame. Las entradas no se venden hasta que lo desveléis todo.
      </p>
    </Card>
  );
}

/* Borrador del aviso a la lista: en secreto, solo lo desvelado. */
function gigDraft(g: Gig, ev?: TicketEvent): NewsInput {
  const t = g.teaser;
  const city = !t || t.city ? g.city : "";
  const date = !t || t.date === "exacta" ? dateLong(g.date) : t.date === "mes" ? dateLong(g.date).split(" ").slice(2).join(" ") : "";
  const venue = !t || t.venue ? g.venue : "";
  if (t) return {
    topic: "fechas", subject: `besta prepara algo${city ? ` en ${city}` : ""}`, title: city ? `algo se cuece en ${city}` : "concierto secreto a la vista",
    body: [`Tenemos concierto nuevo${date ? ` en ${date}` : ""} y aún no lo podemos contar todo.`, "Te avisaremos antes que a nadie cuando lo desvelemos."].join("\n\n"),
    ctaLabel: "ver en la web", ctaUrl: "https://besta.es/#directo", image: "/img/escenario-azul.jpg",
  };
  const own = g.ticketing === "propia" && ev;
  return {
    topic: "fechas", subject: `besta en ${city} · ${dateShort(g.date)}`, title: `nos vemos en ${city}`,
    body: [`${date[0]?.toUpperCase()}${date.slice(1)}${venue ? `, ${venue}` : ""}${g.time ? `. Empezamos a las ${g.time}` : ""}.`,
      own ? "Las entradas ya están a la venta en besta.es: te llegan al momento con tu QR." : g.externalUrl ? "Entradas e info en el enlace de abajo." : "Te esperamos."].join("\n\n"),
    ctaLabel: own ? "comprar entradas" : g.externalUrl ? "entradas e info" : "ver en la web",
    ctaUrl: own ? "https://besta.es/#directo" : g.externalUrl || "https://besta.es/#directo",
    image: ev?.image || "/img/escenario-azul.jpg",
  };
}
