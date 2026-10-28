/* Merch en la web: de momento no se paga online. Eliges producto y
   talla, nos dejas tus datos y te escribimos para confirmar; se paga
   al recogerlo en un concierto o antes de enviarlo. */
import { useEffect, useState } from "react";
import { api } from "@/data/api";
import type { Product } from "@/data/types";
import { Button, Field, Input, Modal, Select, Stepper, Textarea } from "@/components/ui";
import { cx, dateShort, eur } from "@/lib/format";

export interface WebGig { id: string; city: string; date: string }

const tone: Record<Product["color"], string> = {
  senal: "bg-senal text-noche", crema: "bg-crema text-noche", tubo: "bg-tubo text-crema", noche: "bg-marco text-crema",
};

export default function MerchRequest({ products: initial, gigs, empty = false }: { products: Product[]; gigs: WebGig[]; empty?: boolean }) {
  const [products, setProducts] = useState(initial);
  const [open, setOpen] = useState<Product | null>(null);

  // El stock de verdad se lee al cargar (el HTML se generó en el build).
  useEffect(() => { if (!empty) api.list("products").then(setProducts).catch(() => {}); }, [empty]);

  const available = empty ? [] : products.filter(p => !p.archived && p.variants.some(v => v.stock > 0));

  if (!available.length) return (
    <div className="rounded-[28px] border-[1.5px] border-dashed border-crema/25 p-7 sm:p-10 flex flex-wrap items-center justify-between gap-6">
      <div className="flex flex-col gap-2 max-w-[520px]">
        <p className="kicker text-senal">● agotado</p>
        <p className="text-[28px] sm:text-[34px] font-bold tracking-[-.02em] leading-tight">se nos ha acabado todo. ya estamos con lo siguiente.</p>
        <p className="text-crema/70">Te avisamos cuando salga el merch nuevo.</p>
      </div>
      <button type="button" data-avisame="merch" className="h-12 px-6 rounded-full bg-crema text-noche font-semibold">avísame</button>
    </div>
  );

  return (
    <>
      <div className="grid gap-5 grid-cols-2 lg:grid-cols-4">
        {available.map(p => {
          const sizes = p.variants.filter(v => v.label);
          return (
            <div key={p.id} className="flex flex-col gap-3">
              <div className={cx("aspect-[4/5] rounded-3xl grid place-items-center font-mono text-[13px]", tone[p.color])}>[foto {p.name}]</div>
              <div className="flex justify-between gap-2 text-[17px]"><span className="font-semibold">{p.name}</span><span className="font-mono">{eur(p.priceCents).replace(",00", "")}</span></div>
              {sizes.length > 0 && (
                <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                  {sizes.map(v => <span key={v.id} className={cx("px-2 py-1 rounded-md", v.stock > 0 ? "bg-tubo" : "bg-tubo/40 text-crema/40 line-through")}>{v.label}</span>)}
                </div>
              )}
              <button type="button" onClick={() => setOpen(p)} className="h-11 rounded-full border-[1.5px] border-crema/35 hover:border-crema font-semibold">lo quiero</button>
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-sm text-crema/65">No se paga aquí: nos lo pides, te lo apartamos y lo pagas al recogerlo en un concierto (o antes del envío).</p>
      {open && <RequestModal product={open} gigs={gigs} onClose={() => setOpen(null)} />}
    </>
  );
}

function RequestModal({ product, gigs, onClose }: { product: Product; gigs: WebGig[]; onClose: () => void }) {
  const inStock = product.variants.filter(v => v.stock > 0);
  const [variantId, setVariantId] = useState(inStock[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const [delivery, setDelivery] = useState<"concierto" | "envio">(gigs.length ? "concierto" : "envio");
  const [gigId, setGigId] = useState(gigs[0]?.id ?? "");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const v = product.variants.find(x => x.id === variantId);
  const light = "h-12 bg-white border-noche/25 text-noche placeholder:text-noche/40";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(""); setBusy(true);
    try {
      await api.requestMerch({
        productId: product.id, variantId, qty, name: String(f.get("name")), email: String(f.get("email")),
        phone: String(f.get("phone") || "") || undefined, delivery,
        gigId: delivery === "concierto" ? gigId : undefined,
        address: delivery === "envio" ? String(f.get("address")) : undefined,
        note: String(f.get("note") || "") || undefined,
      });
      setSent(true);
    } catch (err) { setError((err as Error).message); }
    setBusy(false);
  }

  return (
    <Modal open onClose={onClose} title={sent ? "apuntado." : product.name} tone="crema">
      {sent ? (
        <p className="text-lg leading-relaxed">Te escribimos en un par de días para confirmarlo y decirte cómo pagar. {delivery === "concierto" ? "Te lo guardamos para el concierto." : "Los gastos de envío dependen de dónde vivas."}</p>
      ) : (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 [&_label]:text-noche/75">
          {product.variants.some(x => x.label) && (
            <Field label="talla">{id => (
              <Select id={id} value={variantId} onChange={e => { setVariantId(e.target.value); setQty(1); }} className="h-12 bg-white border-noche/25 text-noche">
                {product.variants.map(x => <option key={x.id} value={x.id} disabled={x.stock === 0}>{x.label}{x.stock === 0 ? " · agotada" : x.stock <= 3 ? ` · quedan ${x.stock}` : ""}</option>)}
              </Select>
            )}</Field>
          )}
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] text-noche/75">cuántas · {eur(product.priceCents * qty)}</span>
            <div className="[&_button]:border-noche/30 [&_button:last-child]:bg-noche [&_button:last-child]:text-crema"><Stepper value={qty} onChange={setQty} max={Math.min(5, v?.stock ?? 1)} /></div>
          </div>
          <Field label="nombre">{id => <Input id={id} name="name" required autoComplete="name" className={light} />}</Field>
          <Field label="email">{id => <Input id={id} name="email" type="email" required autoComplete="email" className={light} />}</Field>
          <Field label="teléfono (opcional)" className="sm:col-span-2">{id => <Input id={id} name="phone" type="tel" autoComplete="tel" className={light} />}</Field>

          <div className="sm:col-span-2 flex flex-col gap-2">
            <span className="text-[13px] text-noche/75">cómo te lo damos</span>
            <div className="grid grid-cols-2 gap-2">
              {gigs.length > 0 && <button type="button" aria-pressed={delivery === "concierto"} onClick={() => setDelivery("concierto")} className={cx("h-12 rounded-xl font-semibold", delivery === "concierto" ? "bg-noche text-crema" : "bg-white border border-noche/25")}>en un concierto</button>}
              <button type="button" aria-pressed={delivery === "envio"} onClick={() => setDelivery("envio")} className={cx("h-12 rounded-xl font-semibold", delivery === "envio" ? "bg-noche text-crema" : "bg-white border border-noche/25", !gigs.length && "col-span-2")}>envío a casa</button>
            </div>
          </div>
          {delivery === "concierto" ? (
            <Field label="en qué concierto" className="sm:col-span-2">{id => (
              <Select id={id} value={gigId} onChange={e => setGigId(e.target.value)} className="h-12 bg-white border-noche/25 text-noche">
                {gigs.map(g => <option key={g.id} value={g.id}>{g.city} · {dateShort(g.date)}</option>)}
              </Select>
            )}</Field>
          ) : (
            <Field label="dirección de envío" className="sm:col-span-2">{id => <Textarea id={id} name="address" rows={2} required className="bg-white border-noche/25 text-noche" />}</Field>
          )}
          <Field label="algo más (opcional)" className="sm:col-span-2">{id => <Input id={id} name="note" className={light} />}</Field>

          {error && <p role="alert" className="sm:col-span-2 rounded-xl bg-noche text-crema px-4 py-3 text-sm">{error}</p>}
          <Button type="submit" variant="primary" size="lg" block className="sm:col-span-2" disabled={busy || !v || v.stock === 0}>{busy ? "enviando…" : "pedirlo"}</Button>
          <p className="sm:col-span-2 text-xs text-noche/65">No pagas nada ahora. Usamos tus datos solo para esta petición (<a href="/legal/privacidad" className="underline">privacidad</a>).</p>
        </form>
      )}
    </Modal>
  );
}
