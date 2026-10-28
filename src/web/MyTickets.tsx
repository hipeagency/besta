/* «Mis entradas»: la página a la que lleva el email. Sin cuenta:
   el enlace lleva un token secreto del pedido. */
import { useEffect, useState } from "react";
import { api } from "@/data/api";
import type { Order, Ticket, TicketEvent, Gig } from "@/data/types";
import { QR } from "@/components/ui/QR";
import { dateLabel, eur } from "@/lib/format";
import { cx } from "@/lib/format";

type Data = { order: Order; tickets: Ticket[]; ev?: TicketEvent; gig?: Gig };

export default function MyTickets() {
  const [data, setData] = useState<Data | null | undefined>(undefined);
  const [i, setI] = useState(0);
  const params = typeof window !== "undefined" ? new URLSearchParams(location.search) : null;
  const isNew = params?.get("nuevo") === "1";

  useEffect(() => {
    const token = params?.get("pedido");
    if (!token) { setData(null); return; }
    (async () => {
      const r = await api.orderByToken(token);
      if (!r) { setData(null); return; }
      setData({ order: r.order, tickets: r.tickets, ev: r.event, gig: r.gig });
    })();
  }, []);

  if (data === undefined) return <p className="p-10 text-center text-crema/70">cargando tus entradas…</p>;
  if (data === null) return (
    <div className="max-w-md mx-auto p-8 text-center flex flex-col gap-4">
      <h1 className="text-3xl font-bold">no encontramos ese pedido</h1>
      <p className="text-crema/70">Abre el enlace tal cual viene en el email. Si no te llegó, escríbenos a besta@besta.es con el email de la compra.</p>
      <a href="/" className="underline">volver a besta.es</a>
    </div>
  );

  const { order, tickets, ev, gig } = data;
  const t = tickets[i];
  const mapsUrl = gig ? `https://www.google.com/maps/search/${encodeURIComponent(`${gig.venue} ${gig.address ?? ""} ${gig.city}`)}` : "#";

  return (
    <div className="max-w-[440px] mx-auto min-h-dvh flex flex-col">
      <div className="relative h-[190px] shrink-0">
        <img src={ev?.image ?? "/img/escenario-azul.jpg"} alt="" className="size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-noche/10 to-noche" />
        <div className="scan absolute inset-0" />
        <a href="/" className="absolute left-4 top-4 w-20"><span className="logo-crop"><img src="/img/logo-crema.png" alt="besta" /></span></a>
        <div className="absolute left-5 bottom-3">
          {gig && <p className="font-mono text-xs text-senal">{dateLabel(gig.date)} · {gig.time}</p>}
          <h1 className="text-[28px] font-bold tracking-[-.02em]">{ev?.name ?? "tus entradas"}</h1>
        </div>
      </div>

      <div className="px-5 py-4 flex flex-col gap-4">
        {isNew && (
          <div className="rounded-2xl bg-crema text-noche p-4">
            <p className="font-semibold">¡Pago recibido! Nos vemos en primera fila.</p>
            <p className="text-sm mt-1">También te las hemos mandado a <b>{order.email}</b>. Guarda este enlace: son tus entradas.</p>
          </div>
        )}
        {order.status === "devuelto" && <p className="rounded-2xl bg-crema text-noche p-4 font-semibold">Este pedido está devuelto: las entradas ya no son válidas.</p>}

        <div className="flex justify-between items-center font-mono text-xs text-crema/70">
          <span>MIS ENTRADAS · PEDIDO #{String(order.number).padStart(4, "0")}</span>
          {tickets.length > 1 && (
            <span className="flex items-center gap-1">
              <button type="button" aria-label="Entrada anterior" disabled={i === 0} onClick={() => setI(i - 1)} className="size-9 rounded-full bg-tubo">‹</button>
              {i + 1} / {tickets.length}
              <button type="button" aria-label="Entrada siguiente" disabled={i === tickets.length - 1} onClick={() => setI(i + 1)} className="size-9 rounded-full bg-tubo">›</button>
            </span>
          )}
        </div>

        {t && (
          <div className={cx("bg-crema text-noche rounded-3xl p-5 flex flex-col gap-3.5 items-center", t.status !== "valida" && "opacity-60")}>
            <QR code={t.code} size={240} />
            <div className="w-full flex justify-between font-mono text-[13px]"><span>ENTRADA {i + 1} de {tickets.length}</span><span>{t.code}</span></div>
            <div className="w-full border-t-2 border-dashed border-noche/25" />
            <div className="w-full flex justify-between text-sm">
              <span>{t.status === "usada" ? "ya usada" : t.status === "cancelada" ? "cancelada" : "Entrada general"}</span>
              {ev && <span className="font-mono">{eur(ev.priceCents)}</span>}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={() => window.print()} className="flex-1 h-12 rounded-full border-[1.5px] border-crema/30">guardar / imprimir</button>
          <a href={mapsUrl} target="_blank" rel="noopener" className="flex-1 h-12 rounded-full border-[1.5px] border-crema/30 grid place-items-center">cómo llegar</a>
        </div>
        <p className="text-center text-[13px] text-crema/65">Cada QR vale para una persona y se escanea una sola vez. Sube el brillo en la puerta.</p>
      </div>
    </div>
  );
}
