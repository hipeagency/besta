/* Cobro con tarjeta, común al puesto de merch y a la venta en puerta.
   La pantalla que vende solo pregunta «¿se ha cobrado?»; cómo se cobra
   lo decide el modo:

     - "simulado": datos de prueba. Botones para fingir aprobado o
       rechazado, sin tocar SumUp.
     - "manual": la web de siempre. Se cobra en la app de SumUp y aquí
       se confirma a mano (una web no puede leer tarjetas por NFC).
     - más adelante, "sumup": la app de BESTA (Capacitor) abre SumUp con
       el importe puesto y recibe el resultado sola, con su código.

   Pase lo que pase, quien llama no registra la venta hasta que llega
   { ok: true }, y si el registro falla después hay que dejar claro que
   el dinero YA está cobrado (ver `registerAfterCharge`). */
import { useState } from "react";
import { DATA_MODE } from "@/data/api";
import { Button } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { eur } from "@/lib/format";

export type CardMode = "simulado" | "manual";
export const CARD_MODE: CardMode = DATA_MODE === "prueba" ? "simulado" : "manual";

export type CardOutcome = { ok: true; ref?: string } | { ok: false; reason: "rechazado" | "cancelado" };

type Stage =
  | { k: "cobrando" }
  | { k: "fallo"; reason: "rechazado" | "cancelado" }
  | { k: "registrando"; ref?: string }
  | { k: "sin_registrar"; ref?: string; error: string };

/* Pantalla completa sobre el puesto. `onPaid` registra la venta: si
   lanza error, el cobro no se pierde y se puede reintentar el registro. */
export function CardCharge({ amountCents, title, onPaid, onCancel, onCash }: {
  amountCents: number;
  title: string;                  // «2 camisetas», «3 entradas · Taquilla»
  onPaid: (ref?: string) => Promise<void>;
  onCancel: () => void;           // volver a la cesta sin cobrar
  onCash?: () => void;            // la tarjeta no pasa: cobrar en efectivo
}) {
  const [st, setSt] = useState<Stage>({ k: "cobrando" });

  async function register(ref?: string) {
    setSt({ k: "registrando", ref });
    try {
      await onPaid(ref);
    } catch (e) {
      setSt({ k: "sin_registrar", ref, error: (e as Error).message });
    }
  }
  const outcome = (o: CardOutcome) => (o.ok ? register(o.ref) : setSt({ k: "fallo", reason: o.reason }));

  return (
    <div role="dialog" aria-modal="true" aria-label="Cobro con tarjeta"
      className="fixed inset-0 z-50 bg-noche flex flex-col items-center justify-center gap-7 p-6 text-center anim-fade">
      <div>
        <p className="font-mono text-xs text-crema/65 tracking-[.14em]">TARJETA · {title.toUpperCase()}</p>
        <p className="font-mono text-[56px] leading-none mt-2">{eur(amountCents)}</p>
      </div>

      {st.k === "cobrando" && (CARD_MODE === "simulado" ? (
        <>
          <p className="text-crema/75 max-w-[320px]">Modo prueba: aquí se abriría SumUp y el cliente acercaría la tarjeta.</p>
          <div className="flex flex-col gap-2.5 w-full max-w-[300px]">
            <Button variant="primary" size="lg" block autoFocus onClick={() => outcome({ ok: true, ref: `PRUEBA-${Date.now().toString(36).toUpperCase()}` })}>simular aprobado</Button>
            <Button variant="ghost" size="lg" block onClick={() => outcome({ ok: false, reason: "rechazado" })}>simular rechazado</Button>
            <Button variant="quiet" block onClick={onCancel}>volver a la cesta</Button>
          </div>
        </>
      ) : (
        <>
          <ol className="text-left text-crema/80 flex flex-col gap-2 max-w-[320px] list-decimal pl-5">
            <li>Abre la app de SumUp y cobra <b className="text-crema">{eur(amountCents)}</b>.</li>
            <li>Cuando salga aprobado, vuelve aquí y confírmalo.</li>
          </ol>
          <div className="flex flex-col gap-2.5 w-full max-w-[300px]">
            <Button variant="primary" size="lg" block onClick={() => outcome({ ok: true })}>cobrado en SumUp</Button>
            <Button variant="ghost" size="lg" block onClick={() => outcome({ ok: false, reason: "rechazado" })}>no ha pasado</Button>
            <Button variant="quiet" block onClick={onCancel}>volver a la cesta</Button>
          </div>
        </>
      ))}

      {st.k === "fallo" && (
        <>
          <span className="size-16 rounded-full bg-tubo text-crema grid place-items-center"><Icon name="x" size={30} /></span>
          <p className="text-crema/80 max-w-[300px]">{st.reason === "rechazado" ? "La tarjeta no ha pasado. No se ha cobrado nada." : "Cobro cancelado. No se ha cobrado nada."}</p>
          <div className="flex flex-col gap-2.5 w-full max-w-[300px]">
            <Button variant="primary" size="lg" block autoFocus onClick={() => setSt({ k: "cobrando" })}>reintentar con tarjeta</Button>
            {onCash && <Button variant="ghost" size="lg" block onClick={onCash}>cobrar en efectivo</Button>}
            <Button variant="quiet" block onClick={onCancel}>volver a la cesta</Button>
          </div>
        </>
      )}

      {st.k === "registrando" && <p className="text-crema/70" aria-live="polite">cobrado · apuntando la venta…</p>}

      {st.k === "sin_registrar" && (
        <>
          <p className="text-crema max-w-[320px]"><b>El dinero ya está cobrado</b>, pero no se ha podido apuntar la venta: {st.error}</p>
          {st.ref && <p className="font-mono text-xs text-crema/60">código del cobro: {st.ref}</p>}
          <div className="flex flex-col gap-2.5 w-full max-w-[300px]">
            <Button variant="primary" size="lg" block autoFocus onClick={() => register(st.ref)}>reintentar apuntarla</Button>
            <Button variant="quiet" block onClick={onCancel}>volver a la cesta (apúntala a mano)</Button>
          </div>
        </>
      )}
    </div>
  );
}
