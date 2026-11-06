/* Finanzas: la caja de la banda y, aparte, quién debe a quién.
   Entradas, cachés y merch entran solos; los gastos los apunta
   quien paga (con foto del ticket desde el móvil). */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Page } from "@/suite/Shell";
import { useMe } from "@/suite/session";
import { useAction, useCollection } from "@/data/hooks";
import { api, uid } from "@/data/api";
import { balances, eventStats, settleUp, upcomingGigs } from "@/data/selectors";
import type { Expense, Income, Member, Settlement } from "@/data/types";
import { Button, Card, CardTitle, Field, Input, Segmented, Select, Sheet, Table, useToast } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { ago, cx, dateShort, eur, eur0 } from "@/lib/format";

type Tab = "caja" | "saldos" | "bolos" | "registro";

interface Row { id: string; title: string; meta: string; cents: number; date: string; auto: boolean; kind: "tix" | "income" | "expense" }

const NEW = "__nueva__";  // la opción «+ nueva categoría…» del desplegable

/* Fecha de hoy en hora local (AAAA-MM-DD). toISOString() va en UTC y
   entre las 00:00 y las 01:00/02:00 en España daría el día anterior. */
const today = () => new Date().toLocaleDateString("sv-SE");

/* «12,50», «12.50», «1.234,56» o «1,234.56» → céntimos. NaN si no es un número. */
function parseCents(raw: string): number {
  let s = raw.trim().replace(/\s/g, "");
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // El último separador es el decimal; el otro es de miles.
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else {
    s = s.replace(",", ".");
  }
  return Math.round(parseFloat(s) * 100);
}
const onlyAmount = (v: string) => v.replace(/[^\d.,]/g, "");
const SOURCE_LABEL: Record<Income["source"], string> = { cache: "caché", merch: "merch", entradas: "entradas", otro: "otro" };

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
  const { me } = useMe();
  const toast = useToast();

  /* Borrar un gasto o un ingreso apuntado a mano. Las entradas no:
     salen de los pedidos y se gestionan desde allí. */
  const removeRow = useAction(async (r: Row) => {
    await api.remove(r.kind === "expense" ? "expenses" : "incomes", r.id);
    await api.insert("audit", { id: uid("a-"), who: me.name, action: `borró ${r.kind === "expense" ? "el gasto" : "el ingreso"} «${r.title}» (${eur(Math.abs(r.cents))})`, at: new Date().toISOString() });
  });
  async function askRemove(r: Row) {
    if (!window.confirm(`¿Borrar «${r.title}» (${eur(Math.abs(r.cents))})? Los saldos se recalculan.`)) return;
    try { await removeRow.run(r); toast("Borrado", "ok"); }
    catch { toast("No se ha podido borrar", "error"); }
  }

  // Se busca en todos los miembros: un gasto puede haberlo pagado alguien de fuera de la banda.
  const name = (id: string) => everyone.find(m => m.id === id)?.name ?? id;
  const gigName = (id?: string) => { const g = gigs.find(x => x.id === id); return g ? `${g.city} ${dateShort(g.date)}` : ""; };

  /* Lo de las entradas no se apunta: sale de los pedidos pagados. */
  const ticketRows: Row[] = useMemo(() => events.map(ev => {
    const s = eventStats(ev, { orders, tickets });
    const last = s.paid.reduce((d, o) => (o.createdAt > d ? o.createdAt : d), "");
    return { id: "tix-" + ev.id, title: `entradas · ${gigs.find(g => g.id === ev.gigId)?.city ?? ev.name}`, meta: `automático · ${s.paid.length} pedidos · neto de Stripe`, cents: s.net, date: last.slice(0, 10), auto: true, kind: "tix" as const };
  }).filter(r => r.cents > 0), [events, orders, tickets, gigs]);

  const rows: Row[] = useMemo(() => [
    ...ticketRows,
    ...incomes.map(i => ({ id: i.id, title: i.title, meta: `${SOURCE_LABEL[i.source] ?? i.source}${i.gigId ? " · " + gigName(i.gigId) : ""}`, cents: i.amountCents, date: i.date, auto: false, kind: "income" as const })),
    ...expenses.map(e => ({ id: e.id, title: e.title, meta: `${name(e.payerId)} pagó · ${e.category}${e.gigId ? " · " + gigName(e.gigId) : ""}`, cents: -e.amountCents, date: e.date, auto: false, kind: "expense" as const })),
  ].sort((a, b) => b.date.localeCompare(a.date)), [ticketRows, incomes, expenses, everyone, gigs]); // eslint-disable-line react-hooks/exhaustive-deps

  const cashIn = rows.filter(r => r.cents > 0).reduce((s, r) => s + r.cents, 0);
  const cashOut = -rows.filter(r => r.cents < 0).reduce((s, r) => s + r.cents, 0);
  const bal = balances(members, expenses, settlements);
  const plan = settleUp(bal);
  const maxBal = Math.max(1, ...bal.map(b => Math.abs(b.cents)));

  const gigRows = [...gigs].sort((a, b) => b.date.localeCompare(a.date)).map(g => {
    const ev = events.find(e => e.gigId === g.id);
    const inc = incomes.filter(i => i.gigId === g.id).reduce((s, i) => s + i.amountCents, 0) + (ev ? eventStats(ev, { orders, tickets }).net : 0);
    const out = expenses.filter(e => e.gigId === g.id).reduce((s, e) => s + e.amountCents, 0);
    return { g, inc, out };
  }).filter(r => r.inc || r.out);

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
              {rows.length === 0 && <p className="text-sm text-crema/60">Todavía no hay movimientos.</p>}
              <ul>
                {rows.map(r => (
                  <li key={r.id} className="flex items-center gap-3 py-2.5 border-t border-crema/8">
                    <span className={cx("size-9 rounded-[10px] grid place-items-center shrink-0 text-sm", r.cents > 0 ? "bg-senal/15 text-senal-suave" : "bg-crema/8")}><Icon name={r.cents > 0 ? "abajo" : "arriba"} size={14} /></span>
                    <span className="flex-1 min-w-0"><span className="block truncate">{r.title}</span><span className="block text-xs text-crema/60 truncate">{r.meta}</span></span>
                    <span className={cx("font-mono shrink-0", r.cents > 0 && "text-senal-suave")}>{r.cents > 0 ? "+ " : "− "}{eur(Math.abs(r.cents))}</span>
                    {r.kind !== "tix" && (
                      <button type="button" aria-label={`Borrar ${r.title}`} onClick={() => askRemove(r)} disabled={removeRow.pending}
                        className="size-8 rounded-full grid place-items-center shrink-0 text-crema/50 hover:text-crema hover:bg-crema/8"><Icon name="basura" size={15} /></button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <div className="flex-[2_1_300px] min-w-0"><Balances bal={bal} max={maxBal} plan={plan} members={members} settlements={settlements} /></div>
        </div>
      )}

      {tab === "saldos" && <div className="max-w-[640px]"><Balances bal={bal} max={maxBal} plan={plan} members={members} settlements={settlements} /></div>}

      {tab === "bolos" && (
        <Card>
          {gigRows.length === 0
            ? <p className="text-sm text-crema/60">Aún no hay ingresos ni gastos asociados a ningún bolo.</p>
            : <Table head={["BOLO", "INGRESOS", "GASTOS", "RESULTADO"]} minWidth={480}>
                {gigRows.map(({ g, inc, out }) => (
                  <tr key={g.id}>
                    <td className="px-1.5 py-3">{g.city} <span className="text-crema/60">· {dateShort(g.date)}</span></td>
                    <td className="px-1.5 py-3 font-mono">{eur(inc)}</td>
                    <td className="px-1.5 py-3 font-mono">{eur(out)}</td>
                    <td className="px-1.5 py-3 font-mono font-medium">{eur(inc - out)}</td>
                  </tr>
                ))}
              </Table>}
          <p className="text-xs text-crema/55 mt-3">Los cachés entran como ingreso al cobrarlos; las entradas, en cuanto se pagan.</p>
        </Card>
      )}

      {tab === "registro" && (
        <Card>
          <CardTitle action={<Button size="sm" onClick={() => exportCsv({ expenses, incomes, ticketRows, settlements, name })}><Icon name="descargar" size={15} />exportar CSV</Button>}>registro</CardTitle>
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

interface PayDraft { fromId: string; toId: string; cents: number }

function Balances({ bal, max, plan, members, settlements }: { bal: ReturnType<typeof balances>; max: number; plan: ReturnType<typeof settleUp>; members: Member[]; settlements: Settlement[] }) {
  const { me } = useMe();
  const toast = useToast();
  const [draft, setDraft] = useState<PayDraft | null>(null);
  const name = (id: string) => members.find(m => m.id === id)?.name ?? "?";
  const settle = useAction(async (fromId: string, toId: string, cents: number, note?: string) => {
    await api.insert("settlements", { id: uid("st-"), fromId, toId, amountCents: cents, date: today(), ...(note ? { note } : {}) });
    await api.insert("audit", { id: uid("a-"), who: me.name, action: `apuntó que ${name(fromId)} pagó ${eur(cents)} a ${name(toId)}`, at: new Date().toISOString() });
  });
  const undo = useAction(async (s: Settlement) => {
    await api.remove("settlements", s.id);
    await api.insert("audit", { id: uid("a-"), who: me.name, action: `deshizo el pago de ${name(s.fromId)} a ${name(s.toId)} (${eur(s.amountCents)})`, at: new Date().toISOString() });
  });
  async function askUndo(s: Settlement) {
    if (!window.confirm(`¿Deshacer el pago de ${name(s.fromId)} a ${name(s.toId)} (${eur(s.amountCents)})? Volverá a contar como pendiente.`)) return;
    try { await undo.run(s); toast("Pago deshecho", "ok"); }
    catch { toast("No se ha podido deshacer", "error"); }
  }
  async function markPaid(fromId: string, toId: string, cents: number, note?: string): Promise<boolean> {
    try { await settle.run(fromId, toId, cents, note); toast("Pago apuntado", "ok"); return true; }
    catch { toast("No se ha podido apuntar el pago", "error"); return false; }
  }
  const history = [...settlements].sort((a, b) => b.date.localeCompare(a.date));
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
        <CardTitle action={members.length > 1 ? <Button size="sm" onClick={() => setDraft({ fromId: plan[0]?.from.id ?? members[0].id, toId: plan[0]?.to.id ?? members[1].id, cents: 0 })}>+ pago</Button> : undefined}>
          para quedar en paz{plan.length ? ` · ${plan.length} ${plan.length === 1 ? "pago" : "pagos"}` : ""}
        </CardTitle>
        {plan.length === 0 && <p className="text-sm text-crema/60">Todo cuadrado.</p>}
        {plan.map(p => (
          <div key={p.from.id + p.to.id} className="flex items-center justify-between gap-3 py-2.5 border-t border-crema/8">
            <span className="inline-flex items-center gap-1.5">{p.from.name} <Icon name="flecha" size={14} /> {p.to.name}</span>
            <span className="flex items-center gap-3">
              <span className="font-mono">{eur(p.cents)}</span>
              <Button size="sm" variant="quiet" onClick={() => setDraft({ fromId: p.from.id, toId: p.to.id, cents: p.cents })}>parcial</Button>
              <Button size="sm" disabled={settle.pending} onClick={async () => {
                if (!window.confirm(`¿${p.from.name} ya ha pagado los ${eur(p.cents)} a ${p.to.name}?`)) return;
                await markPaid(p.from.id, p.to.id, p.cents);
              }}>pagado</Button>
            </span>
          </div>
        ))}
      </Card>
      {history.length > 0 && (
        <Card>
          <CardTitle>pagos hechos</CardTitle>
          <ul>
            {history.map(s => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 border-t border-crema/8">
                <span className="min-w-0">
                  <span className="inline-flex items-center gap-1.5">{name(s.fromId)} <Icon name="flecha" size={14} /> {name(s.toId)}</span>
                  <span className="block text-xs text-crema/60 truncate">{dateShort(s.date)}{s.note ? " · " + s.note : ""}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="font-mono">{eur(s.amountCents)}</span>
                  <Button size="sm" variant="quiet" disabled={undo.pending} onClick={() => askUndo(s)}><Icon name="deshacer" size={14} />deshacer</Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <PaySheet draft={draft} members={members} bal={bal} pending={settle.pending} onClose={() => setDraft(null)}
        onSave={async (d, note) => { if (await markPaid(d.fromId, d.toId, d.cents, note)) setDraft(null); }} />
    </div>
  );
}

/* Apuntar un pago entre miembros por el importe que sea: parcial,
   completo o de más (una devolución). */
function PaySheet({ draft, members, bal, pending, onClose, onSave }: {
  draft: PayDraft | null; members: Member[]; bal: ReturnType<typeof balances>; pending: boolean;
  onClose: () => void; onSave: (d: PayDraft, note?: string) => Promise<void>;
}) {
  const toast = useToast();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!draft) return;
    setFromId(draft.fromId); setToId(draft.toId);
    setAmount(draft.cents ? (draft.cents / 100).toFixed(2).replace(".", ",") : ""); setNote("");
  }, [draft]);

  const owed = -(bal.find(b => b.member.id === fromId)?.cents ?? 0);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const cents = parseCents(amount);
    if (!(cents > 0)) { toast("Pon el importe", "error"); return; }
    if (fromId === toId) { toast("Elige dos personas distintas", "error"); return; }
    if (owed > 0 && cents > owed + 1 && !window.confirm(`Son ${eur(cents)} y debe ${eur(owed)}. ¿Apuntarlo igualmente?`)) return;
    await onSave({ fromId, toId, cents }, note.trim() || undefined);
  }

  return (
    <Sheet open={draft !== null} onClose={onClose} title="apuntar pago">
      <form onSubmit={submit} className="flex flex-col gap-4 pt-1">
        <div className="grid grid-cols-2 gap-3">
          <Field label="paga">{id => <Select id={id} value={fromId} onChange={e => setFromId(e.target.value)}>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>}</Field>
          <Field label="a">{id => <Select id={id} value={toId} onChange={e => setToId(e.target.value)}>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>}</Field>
        </div>
        <Field label="importe (€)" hint={owed > 0 ? `debe ${eur(owed)} en total · puedes apuntar solo una parte` : "no tiene deuda pendiente"}>
          {id => <Input id={id} inputMode="decimal" autoFocus required placeholder="0,00" value={amount} onChange={e => setAmount(onlyAmount(e.target.value))} />}
        </Field>
        <Field label="nota (opcional)">{id => <Input id={id} value={note} onChange={e => setNote(e.target.value)} placeholder="bizum, efectivo en el local…" />}</Field>
        <Button type="submit" variant="primary" size="lg" disabled={pending}>guardar pago</Button>
      </form>
    </Sheet>
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
  const [newCat, setNewCat] = useState<string | null>(null);  // escribiendo una categoría nueva
  const [gigId, setGigId] = useState("");
  const [date, setDate] = useState(today());

  /* Se rellena al abrir, pero solo cuando ya han cargado miembros y bolos:
     si se entra directo con ?nuevo=1 desde el móvil, al principio están vacíos. */
  const filled = useRef(false);
  useEffect(() => {
    if (!open) { filled.current = false; return; }
    if (filled.current || members.length === 0) return;
    filled.current = true;
    setPhoto(""); setPhotoFile(null); setAmount(""); setTitle(""); setPayer(members.some(m => m.id === me.id) ? me.id : members[0].id);
    setParts(members.map(m => m.id)); setCategory("otros"); setNewCat(null); setDate(today());
    setGigId(gig ?? upcomingGigs(gigs)[0]?.id ?? "");
  }, [open, members.length, gigs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Liberar la vista previa de la foto al cambiarla o al cerrar.
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);

  const save = useAction(async (e: Expense, file: File | null) => {
    const receipt = file ? await api.uploadFile("recibos", file) : undefined;
    // Categoría nueva: se crea al guardar el gasto y ya sale para los siguientes.
    if (!categories.includes(e.category)) await api.insert("categories", e.category);
    await api.insert("expenses", { ...e, ...(receipt ? { receipt } : {}) });
    await api.insert("audit", { id: uid("a-"), who: me.name, action: `creó el gasto «${e.title}»`, at: new Date().toISOString() });
  });

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (save.pending) return;
    const cents = parseCents(amount);
    if (!(cents > 0)) { toast("Pon el importe", "error"); return; }
    if (!payer) { toast("Elige quién pagó", "error"); return; }
    if (!parts.length) { toast("Elige entre quién se reparte", "error"); return; }
    try {
      await save.run({ id: uid("e-"), title: title.trim() || category, amountCents: cents, payerId: payer, participantIds: parts, category, gigId: gigId || undefined, date }, photoFile);
    } catch {
      toast("No se ha podido guardar el gasto", "error");
      return;
    }
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
            <input id="importe" inputMode="decimal" autoFocus required placeholder="0,00" value={amount} onChange={e => setAmount(onlyAmount(e.target.value))}
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
          <span className="text-[13px] text-crema/75">a repartir entre · {parts.length === members.length ? "todos" : parts.length || "nadie"}</span>
          <div className="flex flex-wrap gap-1.5">
            {members.map(m => {
              const on = parts.includes(m.id);
              return <button key={m.id} type="button" aria-pressed={on} onClick={() => setParts(p => on ? p.filter(x => x !== m.id) : [...p, m.id])}
                className={cx("h-9 px-3.5 rounded-full text-sm", on ? "bg-crema text-noche" : "bg-noche text-crema/60")}>{m.name}</button>;
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="categoría">{id => newCat !== null
            ? <Input id={id} autoFocus value={newCat} placeholder="nueva categoría" onChange={e => { setNewCat(e.target.value); setCategory(e.target.value.trim().toLowerCase() || "otros"); }}
                onKeyDown={e => { if (e.key === "Escape") { setNewCat(null); setCategory("otros"); } }} />
            : <Select id={id} value={category} onChange={e => { if (e.target.value === NEW) { setNewCat(""); setCategory("otros"); } else setCategory(e.target.value); }}>
                {categories.map(c => <option key={c}>{c}</option>)}
                <option value={NEW}>+ nueva categoría…</option>
              </Select>}</Field>
          <Field label="fecha">{id => <Input id={id} type="date" value={date} onChange={e => setDate(e.target.value)} />}</Field>
        </div>
        <Field label="bolo (opcional)">{id => (
          <Select id={id} value={gigId} onChange={e => setGigId(e.target.value)}>
            <option value="">ninguno</option>
            {[...gigs].sort((a, b) => b.date.localeCompare(a.date)).map(g => <option key={g.id} value={g.id}>{g.city} · {dateShort(g.date)}</option>)}
          </Select>
        )}</Field>
        <Button type="submit" variant="primary" size="lg" disabled={save.pending}>{save.pending ? "guardando…" : "guardar gasto"}</Button>
      </form>
    </Sheet>
  );
}

const emptyIncome = () => ({ title: "", amount: "", source: "cache" as Income["source"], gigId: "", date: today() });

function IncomeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { me } = useMe();
  const { data: gigs } = useCollection("gigs");
  const [f, setF] = useState(emptyIncome);
  useEffect(() => { if (open) setF(emptyIncome()); }, [open]);
  const save = useAction(async (i: Income) => {
    await api.insert("incomes", i);
    await api.insert("audit", { id: uid("a-"), who: me.name, action: `apuntó el ingreso «${i.title}»`, at: new Date().toISOString() });
  });
  return (
    <Sheet open={open} onClose={onClose} title="nuevo ingreso">
      <form className="flex flex-col gap-4 pt-1" onSubmit={async e => {
        e.preventDefault();
        if (save.pending) return;
        const cents = parseCents(f.amount);
        if (!(cents > 0)) { toast("Pon el importe", "error"); return; }
        try {
          await save.run({ id: uid("in-"), title: f.title.trim() || SOURCE_LABEL[f.source], amountCents: cents, source: f.source, gigId: f.gigId || undefined, date: f.date });
        } catch {
          toast("No se ha podido guardar el ingreso", "error");
          return;
        }
        toast("Ingreso guardado", "ok"); onClose();
      }}>
        <Field label="concepto">{id => <Input id={id} required value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="caché Benicarló, subvención…" />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="importe (€)">{id => <Input id={id} inputMode="decimal" required placeholder="0,00" value={f.amount} onChange={e => setF({ ...f, amount: onlyAmount(e.target.value) })} />}</Field>
          <Field label="tipo">{id => <Select id={id} value={f.source} onChange={e => setF({ ...f, source: e.target.value as Income["source"] })}><option value="cache">caché</option><option value="merch">merch</option><option value="otro">otro</option></Select>}</Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="bolo (opcional)">{id => <Select id={id} value={f.gigId} onChange={e => setF({ ...f, gigId: e.target.value })}><option value="">ninguno</option>{[...gigs].sort((a, b) => b.date.localeCompare(a.date)).map(g => <option key={g.id} value={g.id}>{g.city} · {dateShort(g.date)}</option>)}</Select>}</Field>
          <Field label="fecha">{id => <Input id={id} type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} />}</Field>
        </div>
        <p className="text-xs text-crema/60">Las entradas no hace falta apuntarlas: entran solas al pagarse.</p>
        <Button type="submit" variant="primary" size="lg" disabled={save.pending}>{save.pending ? "guardando…" : "guardar ingreso"}</Button>
      </form>
    </Sheet>
  );
}

/* El CSV recoge lo mismo que la caja (ingresos, entradas y gastos)
   y, aparte, los pagos entre miembros, que no mueven la caja. */
function exportCsv({ expenses, incomes, ticketRows, settlements, name }: {
  expenses: Expense[]; incomes: Income[]; ticketRows: Row[]; settlements: Settlement[]; name: (id: string) => string;
}) {
  const money = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
  const rows = [["fecha", "tipo", "concepto", "importe", "pagó", "categoría", "nota"],
    ...ticketRows.map(t => [t.date, "entradas", t.title, money(t.cents), "", "entradas", t.meta]),
    ...incomes.map(i => [i.date, "ingreso", i.title, money(i.amountCents), "", SOURCE_LABEL[i.source] ?? i.source, ""]),
    ...expenses.map(e => [e.date, "gasto", e.title, money(-e.amountCents), name(e.payerId), e.category, ""]),
    ...settlements.map(s => [s.date, "pago entre miembros", `${name(s.fromId)} → ${name(s.toId)}`, money(s.amountCents), name(s.fromId), "", s.note ?? ""]),
  ];
  const [head, ...body] = rows;
  body.sort((a, b) => b[0].localeCompare(a[0]));
  const csv = [head, ...body].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `besta-finanzas-${today()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
