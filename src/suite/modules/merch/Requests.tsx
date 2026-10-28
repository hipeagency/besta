/* Solicitudes de merch hechas desde la web. Flujo: llega «nueva» →
   se aparta (crea la reserva y resta stock) → al entregar y cobrar se
   convierte en venta desde «reservas abiertas». */
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
                  <span className="block font-medium">{r.qty} × {p?.name ?? "?"}{v?.label ? ` ${v.label}` : ""}</span>
                  <span className="block text-[13px] text-crema/65 truncate">{r.name} · {r.delivery === "concierto" ? `recoge en ${g ? `${g.city} ${dateShort(g.date)}` : "un concierto"}` : `envío · ${r.address ?? ""}`}</span>
                  {r.note && <span className="block text-[13px] text-crema/55 italic">«{r.note}»</span>}
                </span>
                <span className="text-right shrink-0">
                  <span className="block font-mono text-sm">{p ? eur(p.priceCents * r.qty) : ""}</span>
                  <span className="block text-[11px] text-crema/55">{ago(r.createdAt)}</span>
                </span>
              </div>
              {r.status === "nueva" ? (
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="primary" disabled={!v || v.stock < r.qty}
                    onClick={async () => { try { await reserve.run(r.id); toast("Apartado: ya está en reservas", "ok"); } catch (e) { toast((e as Error).message, "error"); } }}>
                    {v && v.stock < r.qty ? "sin stock" : "apartar"}
                  </Button>
                  <a className="h-9 px-3.5 rounded-full border-[1.5px] border-crema/25 text-sm grid place-items-center"
                    href={`mailto:${r.email}?subject=${encodeURIComponent(`Tu pedido de merch · besta`)}&body=${encodeURIComponent(`¡Hola, ${r.name}!\n\nTe guardamos ${r.qty} × ${p?.name ?? ""}${v?.label ? " " + v.label : ""}. `)}`}>escribir</a>
                  <Button size="sm" variant="quiet" onClick={() => cancel.run(r.id)}>descartar</Button>
                </div>
              ) : <Pill tone={r.status === "entregada" ? "ok" : "mute"}>{r.status}</Pill>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
