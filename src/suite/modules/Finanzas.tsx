/* Finanzas: la caja de la banda y, aparte, quién debe a quién.
   Entradas, cachés y merch entran solos; los gastos los apunta
   quien paga (con foto del ticket desde el móvil). */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Page } from "@/suite/Shell";
import { useMe } from "@/suite/session";
import { useAction, useCollection } from "@/data/hooks";
import { api, uid } from "@/data/api";
import { balances, eventStats, settleUp, upcomingGigs } from "@/data/selectors";
import type { Expense, Income } from "@/data/types";
import { Button, Card, CardTitle, Field, Input, Segmented, Select, Sheet, Table, useToast } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { ago, cx, dateShort, eur, eur0 } from "@/lib/format";

type Tab = "caja" | "saldos" | "bolos" | "registro";

interface Row { id: string; title: string; meta: string; cents: number; date: string; auto: boolean }

export default function Finanzas() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>("caja");
  const { data: everyone } = useCollection("members");
  const members = everyone.filter(m => m.band);   // el reparto es solo de la banda
  const { data: expenses } = useCollection("expenses");
  const { data: incomes } = useCollection("incomes");
  const { data: settlements } = useCollection("settlements");
  const { data: events } = useCollection("events");
  const { data: orders } = useCollection("orders");
  const { data: tickets } = useCollection("tickets");
  const { data: gigs } = useCollection("gigs");
  const { data: audit } = useCollection("audit");
  const [incomeOpen, setIncomeOpen] = useState(false);

  const name = (id: string) => members.find(m => m.id === id)?.name ?? id;
  const gigName = (id?: string) => { const g = gigs.find(x => x.id === id); return g ? `${g.city} ${dateShort(g.date)}` : ""; };

  /* Lo de las entradas no se apunta: sale de los pedidos pagados. */
  const ticketRows: Row[] = events.map(ev => {
    const s = eventStats(ev, { orders, tickets });
    return { id: "tix-" + ev.id, title: `entradas · ${gigs.find(g => g.id === ev.gigId)?.city ?? ev.name}`, meta: `automático · ${s.paid.length} pedidos · neto de Stripe`, cents: s.net, date: s.paid[0]?.createdAt.slice(0, 10) ?? "", auto: true };
  }).filter(r => r.cents > 0);

  const rows: Row[] = useMemo(() => [
    ...ticketRows,
    ...incomes.map(i => ({ id: i.id, title: i.title, meta: `${i.source === "cache" || i.source === "merch" ? "automático" : "a mano"}${i.gigId ? " · " + gigName(i.gigId) : ""}`, cents: i.amountCents, date: i.date, auto: i.source !== "otro" })),
    ...expenses.map(e => ({ id: e.id, title: e.title, meta: `${name(e.payerId)} pagó · ${e.category}${e.gigId ? " · " + gigName(e.gigId) : ""}`, cents: -e.amountCents, date: e.date, auto: false })),
  ].sort((a, b) => b.date.localeCompare(a.date)), [ticketRows, incomes, expenses]); // eslint-disable-line react-hooks/exhaustive-deps

  const cashIn = rows.filter(r => r.cents > 0).reduce((s, r) => s + r.cents, 0);
  const cashOut = -rows.filter(r => r.cents < 0).reduce((s, r) => s + r.cents, 0);
  const bal = balances(members, expenses, settlements);
  const plan = settleUp(bal);
  const maxBal = Math.max(1, ...bal.map(b => Math.abs(b.cents)));

  return (
    <Page title="finanzas" actions={<>
      <Button onClick={() => setIncomeOpen(true)}>+ ingreso</Button>
      <Button variant="primary" onClick={() => setParams({ nuevo: "1" })}><Icon name="camara" size={17} />+ gasto</Button>
    </>}>
      <Segmented value={tab} onChange={setTab} className="self-start" options={[
        { value: "caja", label: "caja de la banda" }, { value: "saldos", label: "quién debe a quién" },
        { value: "bolos", label: "por bolo" }, { value: "registro", label: "registro" },
      ]} />

      {tab === "caja" && (
        <div className="flex flex-wrap gap-4 items-start">
          <div className="flex-[3_1_440px] min-w-0 flex flex-col gap-4">
            <section className="rounded-[20px] bg-crema text-noche p-6 flex flex-wrap items-end justify-between gap-4">
              <div><p className="text-sm">en la caja ahora</p><p className="font-mono text-[44px] leading-tight tracking-tight">{eur0(cashIn - cashOut)}</p></div>
              <div className="flex gap-6 text-sm">
                <div><span className="block text-noche/70">entra</span><b className="font-mono text-xl font-medium">{eur0(cashIn)}</b></div>
                <div><span className="block text-noche/70">sale</span><b className="font-mono text-xl font-medium">{eur0(cashOut)}</b></div>
              </div>
            </section>
            <Card>
              <CardTitle>movimientos</CardTitle>
              <ul>
                {rows.map(r => (
                  <li key={r.id} className="flex items-center gap-3 py-2.5 border-t border-crema/8">
                    <span className={cx("size-9 rounded-[10px] grid place-items-center shrink-0 text-sm", r.cents > 0 ? "bg-senal/15 text-senal-suave" : "bg-crema/8")}><Icon name={r.cents > 0 ? "abajo" : "arriba"} size={14} /></span>
                    <span className="flex-1 min-w-0"><span className="block truncate">{r.title}</span><span className="block text-xs text-crema/60 truncate">{r.meta}</span></span>
                    <span className={cx("font-mono shrink-0", r.cents > 0 && "text-senal-suave")}>{r.cents > 0 ? "+ " : "− "}{eur(Math.abs(r.cents))}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <div className="flex-[2_1_300px] min-w-0"><Balances bal={bal} max={maxBal} plan={plan} /></div>
        </div>
      )}

      {tab === "saldos" && <div className="max-w-[640px]"><Balances bal={bal} max={maxBal} plan={plan} /></div>}

      {tab === "bolos" && (
        <Card>
          <Table head={["BOLO", "INGRESOS", "GASTOS", "RESULTADO"]} minWidth={480}>
            {[...gigs].sort((a, b) => b.date.localeCompare(a.date)).map(g => {
              const ev = events.find(e => e.gigId === g.id);
              const inc = incomes.filter(i => i.gigId === g.id).reduce((s, i) => s + i.amountCents, 0) + (ev ? eventStats(ev, { orders, tickets }).net : 0);
              const out = expenses.filter(e => e.gigId === g.id).reduce((s, e) => s + e.amountCents, 0);
              if (!inc && !out) return null;
              return (
                <tr key={g.id}>
                  <td className="px-1.5 py-3">{g.city} <span className="text-crema/60">· {dateShort(g.date)}</span></td>
                  <td className="px-1.5 py-3 font-mono">{eur(inc)}</td>
                  <td className="px-1.5 py-3 font-mono">{eur(out)}</td>
                  <td className="px-1.5 py-3 font-mono font-medium">{eur(inc - out)}</td>
                </tr>
              );
            })}
          </Table>
          <p className="text-xs text-crema/55 mt-3">Los cachés entran como ingreso al cobrarlos; las entradas, en cuanto se pagan.</p>
        </Card>
      )}

      {tab === "registro" && (
        <Card>
          <CardTitle action={<Button size="sm" onClick={() => exportCsv(expenses, incomes, name)}><Icon name="descargar" size={15} />exportar CSV</Button>}>registro</CardTitle>
          <ul>
            {audit.map(a => <li key={a.id} className="flex justify-between gap-3 py-2.5 border-t border-crema/8 text-sm"><span><b className="font-medium">{a.who}</b> {a.action}</span><span className="text-crema/55 shrink-0">{ago(a.at)}</span></li>)}
          </ul>
        </Card>
      )}

      <ExpenseSheet open={params.get("nuevo") === "1"} gig={params.get("bolo") ?? undefined} onClose={() => setParams({})} />
      <IncomeSheet open={incomeOpen} onClose={() => setIncomeOpen(false)} />
    </Page>
  );
}

function Balances({ bal, max, plan }: { bal: ReturnType<typeof balances>; max: number; plan: ReturnType<typeof settleUp> }) {
  const { me } = useMe();
  const toast = useToast();
  const settle = useAction(async (fromId: string, toId: string, cents: number) => {
    await api.insert("settlements", { id: uid("st-"), fromId, toId, amountCents: cents, date: new Date().toISOString().slice(0, 10) });
    await api.insert("audit", { id: uid("a-"), who: me.name, action: `marcó pagados ${eur(cents)}`, at: new Date().toISOString() });
  });
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardTitle>saldos entre vosotros</CardTitle>
        <ul className="flex flex-col gap-3">
          {bal.map(b => (
            <li key={b.member.id} className="flex items-center gap-3">
              <span className="w-[76px] text-sm truncate">{b.member.name}</span>
              <span className="relative flex-1 h-2.5 rounded bg-crema/6">
                <span className="absolute left-1/2 -top-1 -bottom-1 w-px bg-crema/30" />
                <span className={cx("absolute top-0 h-full rounded", b.cents >= 0 ? "bg-senal" : "bg-crema")}
                  style={b.cents >= 0 ? { left: "50%", width: `${(b.cents / max) * 50}%` } : { right: "50%", width: `${(-b.cents / max) * 50}%` }} />
              </span>
              <span className="w-[86px] text-right font-mono text-[13px]">{b.cents > 0 ? "+" : ""}{eur(b.cents)}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-crema/60 mt-3">naranja: le debéis · crema: debe</p>
      </Card>
      <Card>
        <CardTitle>para quedar en paz{plan.length ? ` · ${plan.length} ${plan.length === 1 ? "pago" : "pagos"}` : ""}</CardTitle>
        {plan.length === 0 && <p className="text-sm text-crema/60">Todo cuadrado.</p>}
        {plan.map(p => (
          <div key={p.from.id + p.to.id} className="flex items-center justify-between gap-3 py-2.5 border-t border-crema/8">
            <span className="inline-flex items-center gap-1.5">{p.from.name} <Icon name="flecha" size={14} /> {p.to.name}</span>
            <span className="flex items-center gap-3">
              <span className="font-mono">{eur(p.cents)}</span>
              <Button size="sm" onClick={async () => { await settle.run(p.from.id, p.to.id, p.cents); toast("Pago apuntado", "ok"); }}>pagado</Button>
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function ExpenseSheet({ open, onClose, gig }: { open: boolean; onClose: () => void; gig?: string }) {
  const { me } = useMe();
  const toast = useToast();
  const { data: everyone } = useCollection("members");
  const members = everyone.filter(m => m.band);
  const { data: gigs } = useCollection("gigs");
  const { data: categories } = useCollection("categories");
  const [photo, setPhoto] = useState<string>("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");
  const [payer, setPayer] = useState(me.id);
  const [parts, setParts] = useState<string[]>([]);
  const [category, setCategory] = useState("otros");
  const [gigId, setGigId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!open) return;
    setPhoto(""); setPhotoFile(null); setAmount(""); setTitle(""); setPayer(members.some(m => m.id === me.id) ? me.id : members[0]?.id ?? "");
    setParts(members.map(m => m.id)); setCategory("otros"); setDate(new Date().toISOString().slice(0, 10));
    setGigId(gig ?? upcomingGigs(gigs)[0]?.id ?? "");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useAction(async (e: Expense) => {
    await api.insert("expenses", e);
    await api.insert("audit", { id: uid("a-"), who: me.name, action: `creó el gasto «${e.title}»`, at: new Date().toISOString() });
  });

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const cents = Math.round(parseFloat(amount.replace(",", ".")) * 100);
    if (!cents || cents <= 0) { toast("Pon el importe", "error"); return; }
    await save.run({ id: uid("e-"), title: title || category, amountCents: cents, payerId: payer, participantIds: parts, category, gigId: gigId || undefined, date, receipt: photoFile ? await api.uploadFile("recibos", photoFile) : undefined });
    toast("Gasto guardado", "ok");
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="nuevo gasto">
      <form onSubmit={submit} className="flex flex-col gap-4 pt-1">
        <label className="relative flex items-center gap-4 rounded-2xl bg-noche p-3.5 cursor-pointer">
          {photo ? <img src={photo} alt="Foto del ticket" className="w-[72px] h-[96px] object-cover rounded-lg" />
            : <span className="w-[72px] h-[96px] rounded-lg border border-dashed border-crema/30 grid place-items-center"><Icon name="camara" /></span>}
          <span className="flex-1 text-sm"><b className="block font-semibold">{photo ? "ticket adjunto" : "foto del ticket"}</b><span className="text-crema/65">{photo ? "toca para repetir" : "opcional · abre la cámara en el móvil"}</span></span>
          <input type="file" accept="image/*" capture="environment" className="sr-only"
            onChange={e => { const f = e.target.files?.[0]; if (f) { setPhoto(URL.createObjectURL(f)); setPhotoFile(f); } }} />
        </label>

        <div className="flex flex-col items-center gap-1">
          <label htmlFor="importe" className="text-[13px] text-crema/70">importe</label>
          <div className="flex items-baseline gap-1 font-mono text-[44px]">
            <input id="importe" inputMode="decimal" autoFocus required placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
              className="w-[200px] bg-transparent text-center outline-none placeholder:text-crema/30" />
            <span>€</span>
          </div>
        </div>

        <Field label="concepto">{id => <Input id={id} placeholder="gasolina furgo, local, cuerdas…" value={title} onChange={e => setTitle(e.target.value)} />}</Field>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] text-crema/75">pagó</span>
          <div className="flex flex-wrap gap-1.5">
            {members.map(m => (
              <button key={m.id} type="button" aria-pressed={payer === m.id} onClick={() => setPayer(m.id)}
                className={cx("h-9 px-3.5 rounded-full text-sm", payer === m.id ? "bg-senal text-noche font-semibold" : "bg-noche")}>{m.name}</button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] text-crema/75">a repartir entre · {parts.length === members.length ? "todos" : parts.length}</span>
          <div className="flex flex-wrap gap-1.5">
            {members.map(m => {
              const on = parts.includes(m.id);
              return <button key={m.id} type="button" aria-pressed={on} onClick={() => setParts(p => on ? p.filter(x => x !== m.id) : [...p, m.id])}
                className={cx("h-9 px-3.5 rounded-full text-sm", on ? "bg-crema text-noche" : "bg-noche text-crema/60")}>{m.name}</button>;
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="categoría">{id => <Select id={id} value={category} onChange={e => setCategory(e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</Select>}</Field>
          <Field label="fecha">{id => <Input id={id} type="date" value={date} onChange={e => setDate(e.target.value)} />}</Field>
        </div>
        <Field label="bolo (opcional)">{id => (
          <Select id={id} value={gigId} onChange={e => setGigId(e.target.value)}>
            <option value="">ninguno</option>
            {[...gigs].sort((a, b) => b.date.localeCompare(a.date)).map(g => <option key={g.id} value={g.id}>{g.city} · {dateShort(g.date)}</option>)}
          </Select>
        )}</Field>
        <Button type="submit" variant="primary" size="lg" disabled={save.pending}>guardar gasto</Button>
      </form>
    </Sheet>
  );
}

function IncomeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { me } = useMe();
  const { data: gigs } = useCollection("gigs");
  const [f, setF] = useState({ title: "", amount: "", source: "cache" as Income["source"], gigId: "", date: new Date().toISOString().slice(0, 10) });
  const save = useAction(async (i: Income) => {
    await api.insert("incomes", i);
    await api.insert("audit", { id: uid("a-"), who: me.name, action: `apuntó el ingreso «${i.title}»`, at: new Date().toISOString() });
  });
  return (
    <Sheet open={open} onClose={onClose} title="nuevo ingreso">
      <form className="flex flex-col gap-4 pt-1" onSubmit={async e => {
        e.preventDefault();
        const cents = Math.round(parseFloat(f.amount.replace(",", ".")) * 100);
        if (!cents) return;
        await save.run({ id: uid("in-"), title: f.title || f.source, amountCents: cents, source: f.source, gigId: f.gigId || undefined, date: f.date });
        toast("Ingreso guardado", "ok"); onClose();
      }}>
        <Field label="concepto">{id => <Input id={id} required value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="caché Benicarló, subvención…" />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="importe (€)">{id => <Input id={id} inputMode="decimal" required value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} />}</Field>
          <Field label="tipo">{id => <Select id={id} value={f.source} onChange={e => setF({ ...f, source: e.target.value as Income["source"] })}><option value="cache">caché</option><option value="merch">merch</option><option value="otro">otro</option></Select>}</Field>
        </div>
        <Field label="bolo (opcional)">{id => <Select id={id} value={f.gigId} onChange={e => setF({ ...f, gigId: e.target.value })}><option value="">ninguno</option>{gigs.map(g => <option key={g.id} value={g.id}>{g.city} · {dateShort(g.date)}</option>)}</Select>}</Field>
        <p className="text-xs text-crema/60">Las entradas no hace falta apuntarlas: entran solas al pagarse.</p>
        <Button type="submit" variant="primary" size="lg">guardar ingreso</Button>
      </form>
    </Sheet>
  );
}

function exportCsv(expenses: Expense[], incomes: Income[], name: (id: string) => string) {
  const rows = [["fecha", "tipo", "concepto", "importe", "pagó", "categoría"],
    ...incomes.map(i => [i.date, "ingreso", i.title, (i.amountCents / 100).toFixed(2), "", i.source]),
    ...expenses.map(e => [e.date, "gasto", e.title, (-e.amountCents / 100).toFixed(2), name(e.payerId), e.category])];
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = `besta-finanzas-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}
