/* Gestión de un evento: aforo en directo, pedidos, asistentes,
   invitaciones y ajustes de la venta. Las devoluciones y reenvíos
   de verdad irán por Stripe y Brevo; aquí se llama a la API igual. */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { Page } from "@/suite/Shell";
import { useMe } from "@/suite/session";
import { useAction, useCollection } from "@/data/hooks";
import { api } from "@/data/api";
import { eventStats } from "@/data/selectors";
import type { Order, Ticket, TicketEvent } from "@/data/types";
import { Button, Card, CardTitle, Dot, Empty, Field, Input, Pill, Segmented, Sheet, Stat, Stepper, Table, Textarea, Toggle, useToast } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { QR } from "@/components/ui/QR";
import { ago, cx, dateLabel, eur, eur0, hhmm, maskEmail } from "@/lib/format";
import { ConfirmButton, downloadCSV, fromLocalInput, kindLabel, orderNo, orderState, ticketState, toLocalInput } from "./entradas/shared";

type Tab = "pedidos" | "asistentes" | "invitaciones";
const PAGE = 50;

export default function EntradasEvento() {
  const { eventId } = useParams();
  const toast = useToast();
  const { data: events, loading } = useCollection("events");
  const { data: gigs } = useCollection("gigs");
  const { data: orders } = useCollection("orders");
  const { data: tickets } = useCollection("tickets");
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>("pedidos");
  const patch = useAction((p: Partial<TicketEvent>) => api.update("events", eventId!, p));

  const ev = events.find(e => e.id === eventId);
  if (loading) return null;
  if (!ev) return <Page title="evento no encontrado" back={{ to: "/entradas", label: "entradas" }}><Empty title="Este evento ya no existe" /></Page>;

  const g = gigs.find(x => x.id === ev.gigId);
  const s = eventStats(ev, { orders, tickets });

  return (
    <Page
      back={{ to: "/entradas", label: `entradas · ${events.length} ${events.length === 1 ? "evento" : "eventos"}` }}
      kicker={g ? `${dateLabel(g.date)} · ${g.time} · ${g.venue.toUpperCase()}` : undefined}
      title={ev.name}
      actions={<>
        <Toggle checked={ev.salesEnabled} label="venta activa"
          onChange={v => { patch.run({ salesEnabled: v }); toast(v ? "Venta abierta en la web" : "Venta cerrada", "ok"); }} />
        <a href="/#directo" className="inline-flex items-center h-11 px-[18px] rounded-full border-[1.5px] border-crema/25 hover:border-crema/60 text-[15px]">ver en la web&nbsp;<Icon name="externo" size={14} /></a>
        <Link to={`/puerta/${ev.id}`} className="inline-flex items-center gap-2 h-11 px-[18px] rounded-full bg-senal text-noche font-semibold text-[15px] hover:brightness-110">
          <Icon name="puerta" size={16} />abrir puerta
        </Link>
      </>}
    >
      {g && <Link to={`/bolos/${g.id}`} className="-mt-3 self-start text-sm text-crema/70 hover:text-crema">ficha del bolo <Icon name="flecha" size={14} className="inline align-[-2px]" /></Link>}

      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex-[2_1_520px] min-w-0 flex flex-col gap-4">
          <Capacity ev={ev} s={s} />
          <Segmented value={tab} onChange={setTab} className="self-start" options={[
            { value: "pedidos", label: `pedidos · ${s.orders.length}` },
            { value: "asistentes", label: `asistentes · ${s.sold + s.invites}` },
            { value: "invitaciones", label: `invitaciones · ${s.invites}` },
          ]} />
          {tab === "pedidos" && <Orders orders={s.orders} tickets={s.tickets} initialQ={params.get("q") ?? ""} />}
          {tab === "asistentes" && <Attendees ev={ev} orders={s.orders} tickets={s.tickets} />}
          {tab === "invitaciones" && <Invites ev={ev} tickets={s.tickets} />}
        </div>
        <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-4">
          <Settings ev={ev} minCapacity={s.sold + s.invites + s.pending} />
          <Card>
            <CardTitle>emails automáticos</CardTitle>
            <ul className="flex flex-col gap-2.5 text-[15px]">
              {[["confirmación + entradas", "al pagar"], ["recordatorio", "24 h antes"], ["gracias + newsletter", "día siguiente"]].map(([n, w]) => (
                <li key={n} className="flex items-center gap-2.5"><Dot tone="ok" /><span className="flex-1">{n}</span><span className="font-mono text-xs text-crema/60">{w}</span></li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-crema/55">Salen solos. El texto se cambia en la plantilla de emails.</p>
          </Card>
        </div>
      </div>
    </Page>
  );
}

// ---------- aforo ----------
function Capacity({ ev, s }: { ev: TicketEvent; s: ReturnType<typeof eventStats> }) {
  const w = (n: number) => `${ev.capacity ? Math.min(100, (n / ev.capacity) * 100) : 0}%`;
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-[17px] font-semibold">aforo · <span className="font-mono">{ev.capacity}</span></h2>
        <span className="font-mono text-xs text-crema/55">se actualiza en directo</span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden bg-crema/10" role="img"
        aria-label={`${s.sold} vendidas, ${s.invites} invitaciones, ${s.pending} en pago, ${s.free} libres`}>
        <div className="bg-senal" style={{ width: w(s.sold) }} />
        <div className="bg-crema" style={{ width: w(s.invites) }} />
        <div className="bg-crema/45" style={{ width: w(s.pending) }} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-4 mt-5">
        <Stat label="vendidas" value={s.sold} swatch="bg-senal" />
        <Stat label="invitaciones" value={s.invites} swatch="bg-crema" />
        <Stat label="en pago ahora" value={s.pending} swatch="bg-crema/45" />
        <Stat label="libres" value={s.free} swatch="bg-crema/10" />
        <Stat label="ingresos brutos" value={eur0(s.gross)} />
        <Stat label="neto tras Stripe" value={`≈ ${eur0(s.net)}`} sub="1,5 % + 0,25 € por pedido" />
      </div>
    </Card>
  );
}

// ---------- pedidos ----------
function Orders({ orders, tickets, initialQ }: { orders: Order[]; tickets: Ticket[]; initialQ: string }) {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(initialQ);
  const [limit, setLimit] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(null);

  // ?q= viene del ⌘K: si cambia desde fuera, manda
  useEffect(() => { setQ(params.get("q") ?? ""); }, [params]);
  const search = (v: string) => {
    setQ(v); setLimit(PAGE);
    setParams(p => { const n = new URLSearchParams(p); if (v) n.set("q", v); else n.delete("q"); return n; }, { replace: true });
  };

  const list = useMemo(() => {
    const n = q.trim().toLowerCase().replace(/^#/, "");
    const sorted = [...orders].sort((a, b) => b.number - a.number);
    if (!n) return sorted;
    const byCode = new Set(tickets.filter(t => t.code.toLowerCase().includes(n) && t.orderId).map(t => t.orderId));
    return sorted.filter(o => o.email.includes(n) || String(o.number).padStart(4, "0").includes(n) || byCode.has(o.id));
  }, [orders, tickets, q]);

  const open = orders.find(o => o.id === openId);

  return (
    <Card className="!p-4 sm:!p-5">
      <label className="relative block mb-3">
        <span className="sr-only">Buscar pedido por email, número o código</span>
        <Icon name="buscar" size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-crema/55" />
        <Input type="search" value={q} onChange={e => search(e.target.value)} placeholder="email, #número o código BST-…" className="pl-10" />
      </label>

      {!list.length && <p className="p-4 text-sm text-crema/60">Ningún pedido con «{q}».</p>}

      {/* escritorio: tabla */}
      {!!list.length && (
        <div className="hidden md:block">
          <Table head={["PEDIDO", "EMAIL", "ENTR.", "IMPORTE", "ESTADO", ""]} minWidth={560}>
            {list.slice(0, limit).map(o => {
              const st = orderState(o);
              return (
                <tr key={o.id} className="hover:bg-crema/[.03] cursor-pointer" onClick={() => setOpenId(o.id)}>
                  <td className="px-1.5 py-2.5 font-mono">{orderNo(o.number)}</td>
                  <td className="px-1.5 py-2.5 max-w-[240px] truncate">{o.email}</td>
                  <td className="px-1.5 py-2.5 font-mono">{o.qty}</td>
                  <td className="px-1.5 py-2.5 font-mono">{o.status === "caducado" ? "—" : eur(o.amountCents)}</td>
                  <td className="px-1.5 py-2.5"><span className="inline-flex items-center gap-2"><Dot tone={st.tone === "senal" ? "senal" : st.tone} />{st.label}</span></td>
                  <td className="px-1.5 py-1 text-right">
                    <button type="button" onClick={e => { e.stopPropagation(); setOpenId(o.id); }} aria-label={`Abrir pedido ${orderNo(o.number)}`}
                      className="size-9 rounded-full hover:bg-crema/10 grid place-items-center"><Icon name="mas" size={18} /></button>
                  </td>
                </tr>
              );
            })}
          </Table>
        </div>
      )}

      {/* móvil: tarjetas */}
      <ul className="md:hidden flex flex-col gap-2">
        {list.slice(0, limit).map(o => {
          const st = orderState(o);
          return (
            <li key={o.id}>
              <button type="button" onClick={() => setOpenId(o.id)} className="w-full text-left rounded-2xl bg-noche p-3.5 flex items-center gap-3 min-h-[60px]">
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{maskEmail(o.email)}</span>
                  <span className="flex items-center gap-1.5 text-xs text-crema/60"><Dot tone={st.tone === "senal" ? "senal" : st.tone} />{o.status === "pendiente" ? st.label : `${st.label} · ${ago(o.createdAt)}`}</span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block font-mono">{o.status === "caducado" ? "—" : eur(o.amountCents)}</span>
                  <span className="block font-mono text-xs text-crema/60">{o.qty} entr.</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {list.length > limit && (
        <Button size="sm" className="mt-3" onClick={() => setLimit(l => l + PAGE)}>ver más · quedan {list.length - limit}</Button>
      )}

      <OrderSheet order={open} tickets={tickets.filter(t => t.orderId === openId)} onClose={() => setOpenId(null)} />
    </Card>
  );
}

function OrderSheet({ order, tickets, onClose }: { order?: Order; tickets: Ticket[]; onClose: () => void }) {
  const { me } = useMe();
  const toast = useToast();
  const resend = useAction((id: string) => api.resendTickets(id));
  const refund = useAction((id: string) => api.refundOrder(id));
  const cancel = useAction((code: string) => api.cancelTicket(code));
  const checkIn = useAction((code: string) => api.checkInManual(code, me.name));

  if (!order) return null;
  const st = orderState(order);
  const live = tickets.filter(t => t.status !== "cancelada");
  return (
    <Sheet open onClose={onClose} title={`pedido ${orderNo(order.number)}`}
      footer={order.status === "pagado" ? (
        <div className="flex flex-col gap-2">
          <Button variant="primary" block disabled={resend.pending}
            onClick={async () => { await resend.run(order.id); toast(`Entradas reenviadas a ${order.email}`, "ok"); }}>
            <Icon name="enviar" size={16} />reenviar entradas
          </Button>
          <ConfirmButton size="md" className="w-full" disabled={refund.pending}
            confirm={`sí, devolver ${eur(order.amountCents)}`}
            onConfirm={async () => { await refund.run(order.id); toast("Pedido devuelto. Entradas anuladas.", "ok"); }}>
            devolver pedido
          </ConfirmButton>
        </div>
      ) : undefined}>
      <div className="flex flex-col gap-4 pt-1">
        <div>
          <p className="font-mono text-xs tracking-wider text-crema/65 uppercase">{st.label} · {ago(order.createdAt)}</p>
          <p className="text-lg break-all">{order.email}</p>
          {order.name && <p className="text-sm text-crema/70">{order.name}</p>}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="font-mono text-[26px]">{eur(order.amountCents)}</span>
            <Pill>{order.qty} entr.</Pill>
            {order.newsletter && <Pill>newsletter</Pill>}
          </div>
        </div>

        {order.status === "pendiente" && <p className="text-sm text-crema/70 rounded-xl bg-noche p-3">Está en la pasarela de pago. Si no paga en 30 min, el pedido caduca y las plazas vuelven a la venta.</p>}
        {order.status === "devuelto" && <p className="text-sm text-crema/70 rounded-xl bg-noche p-3">Devuelto: las entradas ya no valen en la puerta.</p>}

        {!!tickets.length && (
          <ul className="flex flex-col gap-2">
            {tickets.map(t => {
              const ts = ticketState(t);
              return (
                <li key={t.code} className="rounded-2xl bg-noche p-3.5 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block font-mono">{t.code}</span>
                      <span className="block text-xs text-crema/60">{kindLabel(t)}{t.checkedInAt ? ` · entró ${hhmm(t.checkedInAt)}${t.checkedInBy ? ` · ${t.checkedInBy}` : ""}` : ""}</span>
                    </span>
                    <Pill tone={ts.tone === "senal" ? "senal" : ts.tone}>{ts.label}</Pill>
                  </div>
                  {t.status === "valida" && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" disabled={checkIn.pending} onClick={async () => { await checkIn.run(t.code); toast(`${t.code} dentro`, "ok"); }}>
                        <Icon name="check" size={15} />check-in manual
                      </Button>
                      {live.length > 1 && order.status === "pagado" && (
                        <ConfirmButton confirm="sí, cancelar" onConfirm={async () => { await cancel.run(t.code); toast(`${t.code} cancelada`, "ok"); }}>
                          cancelar esta
                        </ConfirmButton>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {order.status === "pagado" && <p className="text-xs text-crema/55">Cancelar una entrada no devuelve dinero: para eso, devuelve el pedido entero desde Stripe.</p>}
      </div>
    </Sheet>
  );
}

// ---------- asistentes ----------
function Attendees({ ev, orders, tickets }: { ev: TicketEvent; orders: Order[]; tickets: Ticket[] }) {
  const [filter, setFilter] = useState<"todos" | "dentro" | "fuera">("todos");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const emailOf = (t: Ticket) => orders.find(o => o.id === t.orderId)?.email;
  const who = (t: Ticket) => t.holder ?? emailOf(t) ?? "—";

  const list = tickets
    .filter(t => t.status !== "cancelada")
    .filter(t => filter === "todos" || (filter === "dentro" ? t.status === "usada" : t.status === "valida"))
    .filter(t => { const n = q.trim().toLowerCase(); return !n || t.code.toLowerCase().includes(n) || who(t).toLowerCase().includes(n); })
    .sort((a, b) => (b.checkedInAt ?? "").localeCompare(a.checkedInAt ?? "") || a.code.localeCompare(b.code));
  const inside = tickets.filter(t => t.status === "usada").length;

  const exportCSV = () => {
    downloadCSV(`asistentes-${ev.id}.csv`, [
      ["codigo", "tipo", "titular", "pedido", "estado", "entrada", "escaneada por"],
      ...tickets.map(t => {
        const o = orders.find(x => x.id === t.orderId);
        return [t.code, kindLabel(t), t.holder ?? o?.email, o ? orderNo(o.number) : "", ticketState(t).label,
          t.checkedInAt ? new Date(t.checkedInAt).toLocaleString("es-ES") : "", t.checkedInBy];
      }),
    ]);
  };

  return (
    <Card className="!p-4 sm:!p-5">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Segmented size="sm" value={filter} onChange={v => { setFilter(v); setLimit(PAGE); }} options={[
          { value: "todos", label: "todos" }, { value: "dentro", label: `dentro · ${inside}` }, { value: "fuera", label: "sin entrar" },
        ]} />
        <Button size="sm" className="ml-auto" onClick={exportCSV}><Icon name="descargar" size={15} />CSV</Button>
      </div>
      <label className="relative block mb-3">
        <span className="sr-only">Buscar asistente por código, email o nombre</span>
        <Icon name="buscar" size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-crema/55" />
        <Input type="search" value={q} onChange={e => { setQ(e.target.value); setLimit(PAGE); }} placeholder="código, email o nombre" className="pl-10" />
      </label>
      <ul className="flex flex-col">
        {list.slice(0, limit).map(t => {
          const ts = ticketState(t);
          return (
            <li key={t.code} className="flex items-center gap-3 py-2.5 border-t border-crema/8 first:border-t-0">
              <Dot tone={ts.tone === "senal" ? "senal" : ts.tone} />
              <span className="flex-1 min-w-0">
                <span className="block truncate">{t.holder ?? maskEmail(emailOf(t) ?? "—")}</span>
                <span className="block font-mono text-xs text-crema/60">{t.code} · {kindLabel(t)}</span>
              </span>
              <span className="text-right font-mono text-xs text-crema/70 shrink-0">
                {t.checkedInAt ? <><span className="block text-crema">{hhmm(t.checkedInAt)}</span><span className="block">{t.checkedInBy}</span></> : ts.label}
              </span>
            </li>
          );
        })}
        {!list.length && <li className="p-4 text-sm text-crema/60">Nadie por aquí.</li>}
      </ul>
      {list.length > limit && <Button size="sm" className="mt-3" onClick={() => setLimit(l => l + PAGE)}>ver más · quedan {list.length - limit}</Button>}
    </Card>
  );
}

// ---------- invitaciones ----------
function Invites({ ev, tickets }: { ev: TicketEvent; tickets: Ticket[] }) {
  const toast = useToast();
  const [holder, setHolder] = useState("");
  const [qty, setQty] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const invite = useAction((h: string, n: number) => api.invite(ev.id, h, n));
  const cancel = useAction((code: string) => api.cancelTicket(code));

  const invites = tickets.filter(t => t.kind === "invitacion");
  const groups = [...new Set(invites.map(t => t.holder ?? "sin nombre"))].map(h => ({ holder: h, list: invites.filter(t => (t.holder ?? "sin nombre") === h) }));
  const group = groups.find(x => x.holder === open);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const h = holder.trim();
    if (!h) return;
    await invite.run(h, qty);
    toast(`${qty} ${qty === 1 ? "invitación" : "invitaciones"} para ${h}`, "ok");
    setHolder(""); setQty(1); setOpen(h);
  }

  return (
    <Card className="!p-4 sm:!p-5 flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <Field label="a nombre de" className="flex-[1_1_220px]">{id => <Input id={id} required value={holder} onChange={e => setHolder(e.target.value)} placeholder="Ràdio, familia, prensa…" />}</Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-crema/75" id="inv-qty">cuántas</span>
          <div role="group" aria-labelledby="inv-qty"><Stepper value={qty} onChange={setQty} min={1} max={20} /></div>
        </div>
        <Button type="submit" variant="primary" disabled={invite.pending}>invitar</Button>
      </form>
      <p className="-mt-2 text-xs text-crema/55">Cuentan para el aforo. No llegan por email: enséñales el QR o pásales el código.</p>

      <ul className="flex flex-col">
        {groups.map(gr => {
          const used = gr.list.filter(t => t.status === "usada").length;
          const valid = gr.list.filter(t => t.status !== "cancelada").length;
          return (
            <li key={gr.holder} className="border-t border-crema/8 first:border-t-0">
              <button type="button" onClick={() => setOpen(gr.holder)} className="w-full flex items-center gap-3 py-3 text-left min-h-[52px]">
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{gr.holder}</span>
                  <span className="block font-mono text-xs text-crema/60 truncate">{gr.list.map(t => t.code).join(" · ")}</span>
                </span>
                <span className="font-mono text-sm shrink-0">{valid}{used ? <span className="text-crema/60"> · {used} dentro</span> : null}</span>
                <span className="shrink-0 text-crema/60 inline-flex items-center gap-1" aria-hidden="true">QR <Icon name="flecha" size={14} /></span>
              </button>
            </li>
          );
        })}
        {!groups.length && <li className="p-4 text-sm text-crema/60">Sin invitaciones todavía.</li>}
      </ul>

      <Sheet open={!!group} onClose={() => setOpen(null)} title={group ? `invitaciones · ${group.holder}` : "invitaciones"}>
        <ul className="flex flex-col gap-3 pt-1">
          {group?.list.map(t => {
            const ts = ticketState(t);
            return (
              <li key={t.code} className="rounded-2xl bg-noche p-4 flex flex-col items-center gap-3">
                <div className={cx(t.status !== "valida" && "opacity-40")}><QR code={t.code} size={200} /></div>
                <div className="w-full flex items-center justify-between gap-3">
                  <span className="font-mono text-lg">{t.code}</span>
                  <Pill tone={ts.tone === "senal" ? "senal" : ts.tone}>{ts.label}{t.checkedInAt ? ` · ${hhmm(t.checkedInAt)}` : ""}</Pill>
                </div>
                {t.status === "valida" && (
                  <div className="w-full flex gap-2">
                    <Button size="sm" onClick={() => { navigator.clipboard?.writeText(t.code).then(() => toast("Código copiado", "ok"), () => {}); }}>
                      <Icon name="copiar" size={15} />copiar código
                    </Button>
                    <ConfirmButton className="ml-auto" confirm="sí, anular" onConfirm={async () => { await cancel.run(t.code); toast(`${t.code} anulada`, "ok"); }}>anular</ConfirmButton>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Sheet>
    </Card>
  );
}

// ---------- ajustes ----------
function Settings({ ev, minCapacity }: { ev: TicketEvent; minCapacity: number }) {
  const toast = useToast();
  const save = useAction((p: Partial<TicketEvent>) => api.update("events", ev.id, p));
  const init = () => ({
    name: ev.name, price: (ev.priceCents / 100).toFixed(2).replace(".", ","), capacity: String(ev.capacity),
    maxPerOrder: ev.maxPerOrder, salesEnd: toLocalInput(ev.salesEnd), description: ev.description, image: ev.image ?? "",
  });
  const [f, setF] = useState(init);
  // si el evento cambia de verdad (otra pestaña), recargamos el formulario; por
  // contenido y no por referencia: cada venta refresca todas las colecciones
  const sig = JSON.stringify({ ...ev, salesEnabled: null });
  useEffect(() => { setF(init()); }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof ReturnType<typeof init>>(k: K, v: ReturnType<typeof init>[K]) => setF(x => ({ ...x, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const priceCents = Math.round(Number(f.price.replace(",", ".")) * 100);
    const capacity = Math.floor(Number(f.capacity));
    if (!Number.isFinite(priceCents) || priceCents <= 0) { toast("Revisa el precio", "error"); return; }
    if (!capacity || capacity < minCapacity) { toast(`El aforo no puede bajar de ${minCapacity}: ya están dadas`, "error"); return; }
    await save.run({
      name: f.name.trim() || ev.name, priceCents, capacity, maxPerOrder: f.maxPerOrder,
      salesEnd: fromLocalInput(f.salesEnd), description: f.description, image: f.image.trim() || undefined,
    });
    toast("Evento guardado", "ok");
  }

  return (
    <Card>
      <CardTitle>evento</CardTitle>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        {f.image && <img src={f.image} alt="" className="w-full aspect-[16/9] object-cover rounded-xl bg-noche" />}
        <Field label="imagen (ruta o url)">{id => <Input id={id} value={f.image} onChange={e => set("image", e.target.value)} placeholder="/img/escenario-azul.jpg" className="font-mono text-sm" />}</Field>
        <Field label="nombre">{id => <Input id={id} value={f.name} onChange={e => set("name", e.target.value)} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="precio (€)">{id => <Input id={id} inputMode="decimal" value={f.price} onChange={e => set("price", e.target.value)} className="font-mono" />}</Field>
          <Field label="aforo total">{id => <Input id={id} type="number" min={minCapacity} value={f.capacity} onChange={e => set("capacity", e.target.value)} className="font-mono" />}</Field>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-crema/75" id="ev-max">máximo por pedido</span>
          <div role="group" aria-labelledby="ev-max"><Stepper value={f.maxPerOrder} onChange={v => set("maxPerOrder", v)} min={1} max={20} /></div>
        </div>
        <Field label="fin de la venta online" hint="Vacío: hasta agotar o hasta que la cerréis.">{id =>
          <Input id={id} type="datetime-local" value={f.salesEnd} onChange={e => set("salesEnd", e.target.value)} className="font-mono" />}</Field>
        <Field label="descripción">{id => <Textarea id={id} rows={3} value={f.description} onChange={e => set("description", e.target.value)} />}</Field>
        <Button type="submit" variant="primary" disabled={save.pending}>guardar</Button>
      </form>
    </Card>
  );
}
