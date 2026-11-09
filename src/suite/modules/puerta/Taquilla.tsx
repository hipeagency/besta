/* Taquilla: vender entradas en la puerta. Pantalla completa sobre el
   escáner, con una mano y a dos metros.

   1. Se eligen las entradas (solo los tipos que se venden en taquilla).
   2. Se cobra:
      - efectivo: se apunta y, si hace falta, se calcula el cambio.
      - Bizum: sale el número y el importe en grande; cuando le llega
        a quien cobra, «recibido». (Bizum no tiene enlace para abrir
        la app con el pago puesto: se hace a mano desde su móvil.)
      - tarjeta: QR con un pago de Stripe. El cliente lo escanea y paga
        en su móvil. Se pasa a «pagado» solo cuando Stripe lo confirma
        (se pregunta cada 3 s; «ya ha pagado» pregunta al momento).
   3. Las entradas se emiten ya «dentro»: quien paga en la puerta, pasa. */
import { useEffect, useRef, useState } from "react";
import { useMe } from "@/suite/session";
import { api } from "@/data/api";
import { eventTypes, itemsLabel, sellsAtDoor, takenByType, typeLeft } from "@/data/tickets";
import type { DoorMethod, Order, Ticket, TicketEvent } from "@/data/types";
import { Button, Stepper, useToast } from "@/components/ui";
import { QR } from "@/components/ui/QR";
import { cx, eur } from "@/lib/format";

type Stage =
  | { k: "elegir" }
  | { k: "efectivo" }
  | { k: "bizum" }
  | { k: "tarjeta"; orderId: string; number: number; url: string }
  | { k: "hecho"; method: DoorMethod; qty: number; amount: number };

const POLL_MS = 3000;

export function Taquilla({ ev, place, orders, tickets, onClose }: {
  ev: TicketEvent; place: string; orders: Order[]; tickets: Ticket[]; onClose: () => void;
}) {
  const { me } = useMe();
  const toast = useToast();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [stage, setStage] = useState<Stage>({ k: "elegir" });
  const [busy, setBusy] = useState(false);

  // Aforo y límites con lo que ve la puerta (el servidor lo vuelve a mirar al vender).
  const sold = tickets.filter(t => t.eventId === ev.id && t.status !== "cancelada").length;
  const pending = orders.filter(o => o.eventId === ev.id && o.status === "pendiente").reduce((s, o) => s + o.qty, 0);
  const free = Math.max(0, ev.capacity - sold - pending);
  const taken = takenByType(ev.id, orders, tickets);
  const types = eventTypes(ev).filter(t => t.active && sellsAtDoor(t));

  const want = Object.entries(qty).filter(([, n]) => n > 0).map(([typeId, n]) => ({ typeId, qty: n }));
  const total = want.reduce((s, w) => s + w.qty, 0);
  const amount = types.reduce((s, t) => s + (qty[t.id] ?? 0) * t.priceCents, 0);
  const label = itemsLabel(types.filter(t => qty[t.id]).map(t => ({ typeId: t.id, name: t.name, qty: qty[t.id], unitCents: t.priceCents })));
  const maxFor = (id: string) => {
    const t = types.find(x => x.id === id)!;
    return Math.max(0, Math.min(typeLeft(t, taken, free - (total - (qty[id] ?? 0))), 50));
  };

  // Una sola: con un tipo, empezamos con 1 puesta.
  useEffect(() => { if (types.length === 1 && !Object.keys(qty).length) setQty({ [types[0].id]: 1 }); }, [types.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function sell(method: "efectivo" | "bizum") {
    setBusy(true);
    try {
      const o = await api.doorSale(ev.id, want, method, me.name);
      setStage({ k: "hecho", method, qty: o.qty, amount: o.amountCents });
      try { navigator.vibrate?.(90); } catch { /* sin vibración */ }
    } catch (e) {
      toast((e as Error).message, "error");
    } finally { setBusy(false); }
  }

  async function card() {
    setBusy(true);
    try {
      const r = await api.doorCard(ev.id, want, me.name);
      setStage({ k: "tarjeta", orderId: r.orderId, number: r.number, url: r.url });
    } catch (e) {
      toast((e as Error).message, "error");
    } finally { setBusy(false); }
  }

  const reset = () => { setQty(types.length === 1 ? { [types[0].id]: 1 } : {}); setStage({ k: "elegir" }); };

  return (
    <div className="fixed inset-0 z-30 bg-noche text-crema flex flex-col anim-fade" role="dialog" aria-modal="true" aria-label="Taquilla">
      <header className="flex items-center gap-2 px-3 pt-[max(10px,env(safe-area-inset-top))] pb-2.5">
        <button type="button" onClick={stage.k === "tarjeta" ? undefined : stage.k === "elegir" || stage.k === "hecho" ? onClose : () => setStage({ k: "elegir" })}
          disabled={stage.k === "tarjeta"} aria-label={stage.k === "elegir" || stage.k === "hecho" ? "Volver al escáner" : "Atrás"}
          className="size-11 rounded-full grid place-items-center hover:bg-crema/10 text-2xl disabled:opacity-30">‹</button>
        <span className="flex-1 min-w-0">
          <span className="block font-mono text-[11px] text-crema/70 truncate">{place}</span>
          <span className="block font-bold text-lg leading-tight">taquilla</span>
        </span>
        <span className="font-mono text-[13px] rounded-full px-3 py-1.5 bg-crema/10 shrink-0">libres {free}</span>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-[max(16px,env(safe-area-inset-bottom))] flex flex-col gap-4 w-full max-w-[560px] mx-auto">
        {stage.k === "elegir" && (
          <>
            {!types.length && (
              <p className="rounded-2xl bg-tubo p-5 text-crema/75">No hay ningún tipo de entrada a la venta en taquilla. Actívalo en la suite: entradas → tipos de entrada.</p>
            )}
            <ul className="flex flex-col gap-2">
              {types.map(t => {
                const left = typeLeft(t, taken, free);
                return (
                  <li key={t.id} className={cx("rounded-[20px] bg-tubo p-4 flex items-center gap-3", !left && "opacity-55")}>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xl font-bold truncate first-letter:uppercase">{t.name}</span>
                      <span className="block font-mono text-sm text-crema/70">{eur(t.priceCents)}{!left ? " · agotada" : t.limit != null || left <= 20 ? ` · quedan ${left}` : ""}</span>
                    </span>
                    {left > 0 && <Stepper value={qty[t.id] ?? 0} onChange={n => setQty(q => ({ ...q, [t.id]: n }))} min={0} max={maxFor(t.id)} />}
                  </li>
                );
              })}
            </ul>

            <div className="mt-auto flex flex-col gap-2.5 pt-2">
              <div className="flex items-baseline justify-between">
                <span className="text-crema/75">{total ? label : "elige entradas"}</span>
                <span className="font-mono text-[40px] leading-none">{eur(amount)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <PayButton disabled={!total || busy} onClick={() => setStage({ k: "efectivo" })}>efectivo</PayButton>
                <PayButton disabled={!total || busy} onClick={() => setStage({ k: "bizum" })}>Bizum</PayButton>
                <PayButton disabled={!total || busy} onClick={card} primary>{busy ? "…" : "tarjeta"}</PayButton>
              </div>
            </div>
          </>
        )}

        {stage.k === "efectivo" && <Cash amount={amount} label={label} busy={busy} onPaid={() => sell("efectivo")} />}

        {stage.k === "bizum" && (
          <div className="flex-1 flex flex-col gap-5 pt-4">
            <p className="text-crema/75">{label}</p>
            <p className="font-mono text-[64px] leading-none">{eur(amount)}</p>
            {ev.bizumPhone ? (
              <div className="rounded-[20px] bg-crema text-noche p-5 flex flex-col gap-2">
                <span className="font-mono text-xs tracking-wider">BIZUM A</span>
                <span className="font-mono text-[34px] font-semibold tracking-wide leading-none">{formatPhone(ev.bizumPhone)}</span>
                <span className="text-sm">concepto: entradas besta {itemsCount(total)}</span>
                <button type="button" className="self-start mt-1 h-10 px-4 rounded-full border-2 border-noche text-sm font-medium"
                  onClick={() => navigator.clipboard?.writeText(ev.bizumPhone!.replace(/\s/g, "")).then(() => toast("Número copiado", "ok"), () => {})}>
                  copiar número
                </button>
              </div>
            ) : (
              <p className="rounded-2xl bg-tubo p-4 text-crema/80">No hay número de Bizum en este evento. Ponlo en la suite (entradas → evento → «Bizum de taquilla») o díselo de palabra.</p>
            )}
            <p className="text-sm text-crema/65">Bizum no deja abrir el pago con un enlace: que lo mande desde su app. Cuando te llegue, márcalo.</p>
            <Button variant="primary" size="lg" className="mt-auto" disabled={busy} onClick={() => sell("bizum")}>recibido · {eur(amount)}</Button>
          </div>
        )}

        {stage.k === "tarjeta" && (
          <CardQR orderId={stage.orderId} number={stage.number} url={stage.url} amount={amount} label={label}
            onPaid={() => { try { navigator.vibrate?.(90); } catch { /* */ } setStage({ k: "hecho", method: "tarjeta", qty: total, amount }); }}
            onGone={msg => { toast(msg, "error"); setStage({ k: "elegir" }); }} />
        )}

        {stage.k === "hecho" && (
          <div className="flex-1 flex flex-col gap-5 justify-center -mx-4 px-6 bg-ok text-noche">
            <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true" className="size-20">
              <circle cx="48" cy="48" r="44" fill="none" stroke="currentColor" strokeWidth="6" />
              <path d="M28 50l14 13 26-30" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-[72px] font-extrabold leading-[.86] tracking-[-.045em]">pasa.</p>
            <p className="text-xl leading-snug">{itemsCount(stage.qty)} · {eur(stage.amount)} · {stage.method}<br />Ya cuentan como dentro.</p>
            <div className="flex flex-col gap-2 mt-4">
              <button type="button" onClick={reset} className="h-14 rounded-full bg-noche text-crema font-semibold text-[17px]">otra venta</button>
              <button type="button" onClick={onClose} className="h-12 rounded-full border-2 border-noche font-medium">volver a escanear</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function PayButton({ children, primary, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button type="button" {...rest}
      className={cx("h-16 rounded-2xl text-[17px] font-semibold disabled:opacity-40",
        primary ? "bg-senal text-noche" : "border-[1.5px] border-crema/30")}>
      {children}
    </button>
  );
}

const itemsCount = (n: number) => `${n} ${n === 1 ? "entrada" : "entradas"}`;
const formatPhone = (p: string) => p.replace(/\s/g, "").replace(/^(\+34)?(\d{3})(\d{3})(\d{3})$/, (_m, cc, a, b, c) => `${cc ? cc + " " : ""}${a} ${b} ${c}`);

// ---------- efectivo ----------
function Cash({ amount, label, busy, onPaid }: { amount: number; label: string; busy: boolean; onPaid: () => void }) {
  const [given, setGiven] = useState<number | null>(null);
  const notes = [500, 1000, 2000, 5000].filter(n => n >= amount).slice(0, 3);
  return (
    <div className="flex-1 flex flex-col gap-5 pt-4">
      <p className="text-crema/75">{label}</p>
      <p className="font-mono text-[64px] leading-none">{eur(amount)}</p>
      <div className="flex flex-col gap-2">
        <span className="text-sm text-crema/70">te da… (para el cambio, opcional)</span>
        <div className="flex flex-wrap gap-2">
          {notes.map(n => (
            <button key={n} type="button" onClick={() => setGiven(given === n ? null : n)} aria-pressed={given === n}
              className={cx("h-12 min-w-[84px] px-4 rounded-full font-mono text-lg border-[1.5px]", given === n ? "bg-crema text-noche border-crema" : "border-crema/30")}>
              {eur(n).replace(",00", "")}
            </button>
          ))}
        </div>
        {given !== null && <p className="text-2xl">cambio: <b className="font-mono">{eur(given - amount)}</b></p>}
      </div>
      <Button variant="primary" size="lg" className="mt-auto" disabled={busy} onClick={onPaid}>cobrado · {eur(amount)}</Button>
    </div>
  );
}

// ---------- tarjeta: QR de Stripe ----------
function CardQR({ orderId, number, url, amount, label, onPaid, onGone }: {
  orderId: string; number: number; url: string; amount: number; label: string;
  onPaid: () => void; onGone: (msg: string) => void;
}) {
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const done = useRef(false);

  const check = async (manual: boolean) => {
    if (done.current) return;
    if (manual) setChecking(true);
    try {
      const st = await api.doorStatus(orderId);
      if (done.current) return;
      if (st === "pagado") { done.current = true; onPaid(); }
      else if (st === "caducado" || st === "devuelto") { done.current = true; onGone("El pago ha caducado. Vuelve a cobrar."); }
      else if (manual) toast("Stripe todavía no lo ve pagado. Espera a que le salga «pago completado».", "error");
    } catch (e) {
      if (manual) toast((e as Error).message, "error");
    } finally { if (manual) setChecking(false); }
  };
  const checkRef = useRef(check);
  checkRef.current = check;

  useEffect(() => {
    const id = setInterval(() => { void checkRef.current(false); }, POLL_MS);
    return () => clearInterval(id);
  }, []);

  async function cancel() {
    setCancelling(true);
    try {
      const st = await api.doorCancel(orderId);
      done.current = true;
      if (st === "pagado") onPaid();   // justo había pagado
      else onGone("Cobro cancelado. Las plazas vuelven a la venta.");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally { setCancelling(false); }
  }

  return (
    <div className="flex-1 flex flex-col items-center gap-4 pt-2 text-center">
      <p className="font-mono text-[44px] leading-none">{eur(amount)}</p>
      <p className="text-crema/75 -mt-2">{label} · pedido #{String(number).padStart(4, "0")}</p>
      <QR code="" text={url} size={Math.min(300, typeof window !== "undefined" ? window.innerWidth - 64 : 300)} label="QR para pagar con tarjeta" />
      <p className="text-lg leading-snug">Que lo escanee con la cámara y pague en su móvil.<br /><span className="text-crema/65 text-base">Tarjeta, Apple Pay o Google Pay.</span></p>
      <p className="flex items-center gap-2 text-sm text-crema/70" aria-live="polite">
        <span className="size-2 rounded-full bg-senal animate-pulse" aria-hidden="true" />esperando el pago…
      </p>
      <div className="mt-auto w-full flex flex-col gap-2">
        <Button variant="primary" size="lg" disabled={checking} onClick={() => check(true)}>{checking ? "preguntando a Stripe…" : "ya ha pagado"}</Button>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => navigator.clipboard?.writeText(url).then(() => toast("Enlace copiado", "ok"), () => {})}>copiar enlace</Button>
          <Button className="flex-1" disabled={cancelling} onClick={cancel}>cancelar</Button>
        </div>
      </div>
    </div>
  );
}
