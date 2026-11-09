/* Solicitudes de merch hechas desde la web. Flujo: llega «nueva» →
   se aparta (crea la reserva y resta stock) → al entregar y cobrar se
   convierte en venta desde «reservas abiertas». Si no hay stock se
   aparta igual, como encargo: queda por pedir y se avisa cuando llegue. */
import { useState } from "react";
import { useMe } from "@/suite/session";
import { useAction, useCollection } from "@/data/hooks";
import { api } from "@/data/api";
import type { MerchRequest } from "@/data/types";
import { Button, Card, CardTitle, Pill, useToast } from "@/components/ui";
import { ago, cx, dateShort, eur } from "@/lib/format";

export function Requests() {
  const { me } = useMe();
  const toast = useToast();
  const { data: requests } = useCollection("requests");
  const { data: products } = useCollection("products");
  const { data: gigs } = useCollection("gigs");
  const [showDone, setShowDone] = useState(false);
  const reserve = useAction((id: string) => api.reserveRequest(id, me.name));
  const cancel = useAction((id: string) => api.update("requests", id, { status: "cancelada" } as Partial<MerchRequest>));
  const refund = useAction((id: string) => api.refundMerch(id));
  const [refunding, setRefunding] = useState("");

  const pending = requests.filter(r => r.status === "nueva");
  const shown = showDone ? requests : pending;

  return (
    <Card className="!p-4">
      <CardTitle action={<button type="button" className="text-xs text-crema/65 underline" onClick={() => setShowDone(!showDone)}>{showDone ? "solo nuevas" : "ver todas"}</button>}>
        pedidos desde la web{pending.length ? ` · ${pending.length}` : ""}
      </CardTitle>
      {!shown.length && <p className="text-sm text-crema/60">Nada nuevo. Lo que pidan en besta.es aparece aquí.</p>}
      <ul className="flex flex-col">
        {shown.map(r => {
          const p = products.find(x => x.id === r.productId);
          const v = p?.variants.find(x => x.id === r.variantId);
          const g = gigs.find(x => x.id === r.gigId);
          return (
            <li key={r.id} className={cx("py-3 border-t border-crema/8 flex flex-col gap-2", r.status !== "nueva" && "opacity-70")}>
              <div className="flex justify-between gap-3">
                <span className="min-w-0">
                  <span className="block font-medium">{r.qty} × {p?.name ?? "?"}{v?.label ? ` ${v.label}` : ""}{r.status === "nueva" && v && v.stock < r.qty && <span className="ml-2 align-middle rounded-md bg-senal px-1.5 py-0.5 text-[11px] font-semibold text-noche">sin stock</span>}</span>
                  <span className="block text-[13px] text-crema/65 truncate">{r.name}{r.delivery === "concierto" ? ` · recoge en ${g ? `${g.city} ${dateShort(g.date)}` : "un concierto"}` : r.delivery === "envio" ? ` · envío · ${r.address ?? ""}` : ""}</span>
                  {r.note && <span className="block text-[13px] text-crema/55 italic">«{r.note}»</span>}
                </span>
                <span className="text-right shrink-0">
                  <span className="block font-mono text-sm">{p ? eur(p.priceCents * r.qty) : ""}</span>
                  <span className="block text-[11px] text-crema/55">{ago(r.createdAt)}</span>
                </span>
              </div>
              {r.status === "nueva" ? (
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="primary" disabled={!v || reserve.pending}
                    onClick={async () => { const short = !!v && v.stock < r.qty; try { await reserve.run(r.id); toast(short ? "Encargado: queda en reservas, por pedir" : "Apartado: ya está en reservas", "ok"); } catch (e) { toast((e as Error).message, "error"); } }}>
                    {v && v.stock < r.qty ? "encargar" : "apartar"}
                  </Button>
                  <a className="h-9 px-3.5 rounded-full border-[1.5px] border-crema/25 text-sm grid place-items-center"
                    href={`mailto:${r.email}?subject=${encodeURIComponent(`Tu pedido de merch · besta`)}&body=${encodeURIComponent(v && v.stock < r.qty
                      ? `¡Hola, ${r.name}!\n\nAhora mismo no nos quedan ${p?.name ?? ""}${v?.label ? " " + v.label : ""}. Te apuntamos ${r.qty} y te avisamos en cuanto lleguen. No pagas nada hasta entonces.`
                      : `¡Hola, ${r.name}!\n\nTe guardamos ${r.qty} × ${p?.name ?? ""}${v?.label ? " " + v.label : ""}. `)}`}>escribir</a>
                  <Button size="sm" variant="quiet" onClick={() => cancel.run(r.id)}>descartar</Button>
                </div>
              ) : (
                <span className="flex flex-wrap gap-1.5">
                  <Pill tone={r.status === "entregada" ? "ok" : "mute"}>{r.status}</Pill>
                  {r.pay && <Pill tone={r.pay === "pagado" ? "ok" : "mute"}>{{ pendiente: "pagando online", pagado: "pagado online", caducado: "no pagó", devuelto: "devuelto" }[r.pay]}</Pill>}
                  {r.pay === "pagado" && (refunding === r.id ? (
                    <span className="flex flex-wrap items-center gap-1.5 basis-full pt-1">
                      <span className="text-xs text-crema/70">Stripe devuelve {eur(r.amountCents ?? 0)}{r.status === "entregada" ? "; ya se entregó, así que el producto no vuelve al stock solo" : " y la unidad vuelve al stock"}. Le llega un email.</span>
                      <Button size="sm" variant="primary" disabled={refund.pending} onClick={async () => { try { await refund.run(r.id); toast("Devuelto", "ok"); } catch (e) { toast((e as Error).message, "error"); } setRefunding(""); }}>{refund.pending ? "devolviendo…" : "sí, devolver"}</Button>
                      <Button size="sm" variant="quiet" onClick={() => setRefunding("")}>cancelar</Button>
                    </span>
                  ) : <button type="button" className="text-xs text-crema/65 underline" onClick={() => setRefunding(r.id)}>devolver</button>)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
