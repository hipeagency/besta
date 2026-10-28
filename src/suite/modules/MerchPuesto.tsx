/* Modo puesto: el móvil en la mesa de merch. Pantalla completa,
   botones gordos, tres toques por venta: producto, talla, cobrar. */
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMe } from "@/suite/session";
import { useAction, useCollection } from "@/data/hooks";
import { api } from "@/data/api";
import type { PayMethod, Product } from "@/data/types";
import { Button, useToast } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { LOW, PAYMENTS, itemName, moveCents, sizeLabel, swatch } from "./merch/shared";
import { cx, dateShort, eur } from "@/lib/format";

type CartItem = { variantId: string; qty: number };

export default function MerchPuesto() {
  const { me } = useMe();
  const toast = useToast();
  const [params] = useSearchParams();
  const gigId = params.get("bolo") ?? undefined;
  const { data: products } = useCollection("products");
  const { data: gigs } = useCollection("gigs");
  const { data: members } = useCollection("members");
  const { data: moves } = useCollection("moves");
  const gig = gigs.find(g => g.id === gigId);

  const [by, setBy] = useState(me.name);
  const [picked, setPicked] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [pay, setPay] = useState<PayMethod>("efectivo");
  const [done, setDone] = useState<{ total: number; pay: PayMethod } | null>(null);
  const sell = useAction((items: CartItem[], p: PayMethod, who: string) => api.sell(items, p, who, gig?.id));

  const active = products.filter(p => !p.archived);
  const find = (variantId: string) => {
    const p = products.find(x => x.variants.some(v => v.id === variantId));
    return { p, v: p?.variants.find(v => v.id === variantId) };
  };
  const inCart = (variantId: string) => cart.find(c => c.variantId === variantId)?.qty ?? 0;
  const left = (variantId: string) => (find(variantId).v?.stock ?? 0) - inCart(variantId);
  const total = cart.reduce((s, c) => s + c.qty * (find(c.variantId).p?.priceCents ?? 0), 0);
  const current = active.find(p => p.id === picked);

  /* Ventas de hoy: las de este bolo o, sin bolo, las de hoy fuera de bolo. */
  const today = new Date().toDateString();
  const todays = moves.filter(m => m.kind === "venta" && (gig ? m.gigId === gig.id : !m.gigId && new Date(m.at).toDateString() === today));
  const todayUnits = todays.reduce((s, m) => s + -m.qty, 0);
  const todayCents = todays.reduce((s, m) => s + moveCents(m), 0);

  function add(variantId: string) {
    if (left(variantId) <= 0) return;
    setCart(c => (c.some(x => x.variantId === variantId) ? c.map(x => (x.variantId === variantId ? { ...x, qty: x.qty + 1 } : x)) : [...c, { variantId, qty: 1 }]));
  }
  function minus(variantId: string) {
    setCart(c => c.map(x => (x.variantId === variantId ? { ...x, qty: x.qty - 1 } : x)).filter(x => x.qty > 0));
  }
  function tapProduct(p: Product) {
    if (p.variants.length === 1) { add(p.variants[0].id); setPicked(null); return; }
    setPicked(x => (x === p.id ? null : p.id));
  }

  async function charge() {
    try {
      await sell.run(cart, pay, by);
      setDone({ total, pay });
      setCart([]); setPicked(null);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <div className="min-h-dvh flex flex-col max-w-[720px] mx-auto">
      <header className="px-4 pt-[max(16px,env(safe-area-inset-top))] pb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <Link to="/merch" className="inline-flex items-center gap-1.5 h-9 -ml-1 px-1 font-mono text-xs text-crema/70 hover:text-crema">
            <Icon name="atras" size={14} />merch
          </Link>
          <p className="font-mono text-[11px] text-senal truncate">PUESTO{gig ? ` · ${gig.city.toUpperCase()} ${dateShort(gig.date).toUpperCase()}` : " · SIN BOLO"}</p>
          <h1 className="text-2xl font-bold tracking-[-.02em] leading-tight">merch</h1>
        </div>
        <div className="flex flex-col items-end gap-1">
          <label className="text-[13px] text-crema/75 flex items-center gap-1">
            atiende:
            <select value={by} onChange={e => setBy(e.target.value)} className="h-11 bg-transparent font-semibold text-crema rounded-lg px-1 focus:outline-none">
              {members.map(m => <option key={m.id} value={m.name} className="bg-tubo">{m.name}</option>)}
            </select>
          </label>
          <span className="font-mono text-[11px] text-crema/60" aria-live="polite">hoy: {todayUnits} ud · {eur(todayCents)}</span>
        </div>
      </header>

      <main className="flex-1 px-3.5 pb-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {active.map(p => {
            const stock = p.variants.reduce((s, v) => s + v.stock - inCart(v.id), 0);
            const n = p.variants.reduce((s, v) => s + inCart(v.id), 0);
            return (
              <button key={p.id} type="button" onClick={() => tapProduct(p)} disabled={stock <= 0}
                aria-pressed={p.variants.length > 1 ? picked === p.id : undefined}
                className={cx("relative h-[104px] rounded-[18px] p-3 flex flex-col justify-end items-start text-left font-semibold text-base transition active:scale-[.98]",
                  swatch[p.color] === swatch.tubo ? "bg-tubo text-crema" : swatch[p.color],
                  picked === p.id ? "ring-2 ring-crema ring-offset-2 ring-offset-noche" : "")}>
                {n > 0 && <span className="absolute top-2.5 right-2.5 min-w-7 h-7 px-1.5 rounded-full bg-noche text-crema font-mono text-sm grid place-items-center">{n}</span>}
                <span className="leading-tight">{p.name}</span>
                <span className="font-mono text-[13px] font-normal">{eur(p.priceCents)}{stock <= 0 ? " · agotado" : ""}</span>
              </button>
            );
          })}
        </div>

        {current && (
          <div className="flex flex-col gap-2 anim-fade">
            <p className="text-[13px] text-crema/70">{current.name} · elige talla</p>
            <div className="grid grid-cols-4 gap-2">
              {current.variants.map(v => {
                const l = left(v.id);
                return (
                  <button key={v.id} type="button" disabled={l <= 0} onClick={() => add(v.id)}
                    aria-label={`${current.name} ${sizeLabel(v, current)}, quedan ${l}`}
                    className={cx("h-[60px] rounded-[14px] font-semibold text-lg leading-tight transition",
                      inCart(v.id) ? "bg-crema text-noche" : "border-[1.5px] border-crema/25 text-crema")}>
                    {sizeLabel(v, current)}
                    <span className={cx("block font-mono text-[11px] font-normal", inCart(v.id) ? "" : l <= LOW ? "text-senal-suave" : "text-crema/65")}>{l}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {!active.length && <p className="text-crema/60 p-4">No hay productos. Créalos en merch.</p>}
      </main>

      {/* carrito */}
      <footer className="sticky bottom-0 bg-tubo rounded-t-3xl px-3.5 pt-3.5 pb-[max(14px,env(safe-area-inset-bottom))] flex flex-col gap-2.5 shadow-[0_-12px_30px_rgba(0,0,0,.4)]">
        {cart.length ? (
          <>
            <div className="flex justify-between items-center text-sm text-crema/80">
              <span>{cart.reduce((s, c) => s + c.qty, 0)} en la cesta</span>
              <button type="button" onClick={() => setCart([])} className="h-9 px-2 text-senal-suave">vaciar</button>
            </div>
            <ul className="flex flex-col max-h-[30dvh] overflow-y-auto -my-1">
              {cart.map(c => {
                const { p, v } = find(c.variantId);
                return (
                  <li key={c.variantId} className="flex items-center gap-2 py-1">
                    <span className="flex-1 min-w-0 truncate">{itemName(p, v)}</span>
                    <button type="button" aria-label={`Una menos de ${itemName(p, v)}`} onClick={() => minus(c.variantId)} className="size-11 rounded-full border-[1.5px] border-crema/25 text-lg">−</button>
                    <span className="w-6 text-center font-mono">{c.qty}</span>
                    <button type="button" aria-label={`Una más de ${itemName(p, v)}`} disabled={left(c.variantId) <= 0} onClick={() => add(c.variantId)} className="size-11 rounded-full bg-crema text-noche text-lg">+</button>
                    <button type="button" aria-label={`Quitar ${itemName(p, v)}`} onClick={() => setCart(x => x.filter(y => y.variantId !== c.variantId))} className="size-11 grid place-items-center rounded-full text-crema/60 hover:bg-crema/10"><Icon name="x" size={16} /></button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : <p className="text-sm text-crema/60">Toca un producto para empezar.</p>}
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Forma de pago">
          {PAYMENTS.map(x => (
            <button key={x} type="button" role="radio" aria-checked={pay === x} onClick={() => setPay(x)}
              className={cx("h-11 rounded-xl text-[15px] transition", pay === x ? "bg-crema text-noche font-semibold" : "border-[1.5px] border-crema/25 text-crema font-medium")}>{x}</button>
          ))}
        </div>
        <Button variant="primary" size="lg" block className="!h-[58px] !text-[19px] !font-bold" disabled={!cart.length || sell.pending} onClick={charge}>
          {cart.length ? `cobrar ${eur(total)}` : "cobrar"}
        </Button>
      </footer>

      {done && (
        <div role="dialog" aria-modal="true" aria-label="Venta cobrada" className="fixed inset-0 z-50 bg-noche flex flex-col items-center justify-center gap-6 p-6 text-center anim-fade">
          <span className="size-16 rounded-full bg-senal text-noche grid place-items-center"><Icon name="check" size={32} /></span>
          <div>
            <p className="font-mono text-xs text-crema/65 tracking-[.14em]">COBRADO · {done.pay.toUpperCase()}</p>
            <p className="font-mono text-[56px] leading-none mt-2">{eur(done.total)}</p>
            <p className="text-crema/70 mt-3">hoy llevamos {todayUnits} ud · {eur(todayCents)}</p>
          </div>
          <Button variant="light" size="lg" autoFocus onClick={() => setDone(null)} className="min-w-[240px]">siguiente venta</Button>
        </div>
      )}
    </div>
  );
}
