/* El presupuesto en papel. Vive fuera del árbol de la suite (portal al
   body) y solo se ve al imprimir: el resto de la página se esconde. */
import { createPortal } from "react-dom";
import type { Quote } from "@/data/types";
import { quoteTotals } from "@/data/selectors";
import { dateLong, eur } from "@/lib/format";

/* Datos del emisor. Con backend saldrán de ajustes. */
export const ISSUER = { name: "Maxim", kind: "autónomo", nif: "[NIF]", email: "besta@besta.es" };

const PRINT_CSS = `
@media print {
  @page { margin: 16mm; }
  html, body { background: #fff !important; }
  body > *:not(.besta-print) { display: none !important; }
}`;

export function QuotePrint({ q }: { q: Quote }) {
  const t = quoteTotals(q);
  return createPortal(
    <div className="besta-print papel hidden print:block text-noche bg-white font-sans text-[11pt] leading-snug">
      <style>{PRINT_CSS}</style>
      <header className="flex justify-between items-start gap-8 pb-6 border-b-2 border-noche">
        <div>
          <img src="/img/logo-tinta.png" alt="besta" width={170} height={52} className="h-[52px] w-auto" />
          <p className="mt-3">{ISSUER.name} · {ISSUER.kind} · NIF {ISSUER.nif}</p>
          <p>{ISSUER.email}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[9pt] tracking-[.14em]">PRESUPUESTO</p>
          <p className="font-mono text-[14pt]">{q.number}</p>
          <p className="mt-1">{dateLong(q.createdAt.slice(0, 10))}</p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-8 py-6">
        <div>
          <p className="font-mono text-[9pt] tracking-[.14em] mb-1">CLIENTE</p>
          <p className="font-semibold">{q.client || "—"}</p>
          {q.contactEmail && <p>{q.contactEmail}</p>}
        </div>
        <div>
          <p className="font-mono text-[9pt] tracking-[.14em] mb-1">EVENTO</p>
          <p>{q.eventDate ? dateLong(q.eventDate) : "fecha por concretar"}</p>
          {q.place && <p>{q.place}</p>}
          {q.format && <p>{q.format}</p>}
        </div>
      </section>

      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left font-mono text-[9pt] tracking-[.1em] border-b border-noche">
            <th className="py-2 font-normal">CONCEPTO</th>
            <th className="py-2 font-normal text-right">IMPORTE</th>
          </tr>
        </thead>
        <tbody>
          {q.lines.map(l => (
            <tr key={l.id} className="border-b border-noche/20 align-top">
              <td className="py-2.5 pr-6">{l.name}{l.note && <span className="block text-[9.5pt] opacity-70">{l.note}</span>}</td>
              <td className="py-2.5 text-right font-mono whitespace-nowrap">{eur(l.amountCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto mt-5 w-[260px] flex flex-col gap-1">
        <Row k="base imponible" v={eur(t.base)} />
        <Row k={`IVA ${q.ivaPct} %`} v={`+ ${eur(t.iva)}`} />
        {q.irpfPct > 0 && <Row k={`retención IRPF ${q.irpfPct} %`} v={`− ${eur(t.irpf)}`} />}
        <div className="flex justify-between pt-2 mt-1 border-t-2 border-noche text-[13pt] font-semibold">
          <span>total a cobrar</span><span className="font-mono">{eur(t.total)}</span>
        </div>
      </div>

      {q.conditions && (
        <section className="mt-10">
          <p className="font-mono text-[9pt] tracking-[.14em] mb-1">CONDICIONES</p>
          <p className="whitespace-pre-line">{q.conditions}</p>
        </section>
      )}
      <p className="mt-10 text-[9pt] opacity-70">Validez del presupuesto: 30 días desde su fecha.</p>
    </div>,
    document.body,
  );
}

const Row = ({ k, v }: { k: string; v: string }) =>
  <div className="flex justify-between"><span>{k}</span><span className="font-mono">{v}</span></div>;
