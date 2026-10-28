/* Piezas comunes de entradas y puerta: cómo se nombra cada estado,
   el botón de «¿seguro?» y la descarga de CSV. */
import { useEffect, useState, type ReactNode } from "react";
import type { Order, Ticket } from "@/data/types";
import { Button } from "@/components/ui";
import { ago } from "@/lib/format";

type Tone = "ok" | "error" | "mute" | "senal";

export function orderState(o: Order): { label: string; tone: Tone } {
  switch (o.status) {
    case "pagado": return { label: "pagado", tone: "ok" };
    case "pendiente": return { label: `en pago · ${ago(o.createdAt)}`, tone: "mute" };
    case "devuelto": return { label: "devuelto", tone: "error" };
    default: return { label: "caducado", tone: "mute" };
  }
}

export function ticketState(t: Ticket): { label: string; tone: Tone } {
  if (t.status === "usada") return { label: "dentro", tone: "ok" };
  if (t.status === "cancelada") return { label: "cancelada", tone: "error" };
  return { label: "sin usar", tone: "mute" };
}

export const kindLabel = (t: Ticket) => (t.kind === "invitacion" ? "invitación" : "general");

/** «#0143» */
export const orderNo = (n: number) => `#${String(n).padStart(4, "0")}`;

/** Botón de dos toques: el primero arma, el segundo confirma. Se desarma solo. */
export function ConfirmButton({ children, confirm, onConfirm, size = "sm", className, disabled }: {
  children: ReactNode; confirm: ReactNode; onConfirm: () => void; size?: "sm" | "md" | "lg"; className?: string; disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button size={size} variant={armed ? "primary" : "ghost"} className={className} disabled={disabled} aria-live="polite"
      onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
      {armed ? confirm : children}
    </Button>
  );
}

/** Descarga un CSV (separado por «;», que es lo que abre bien Excel en castellano). */
export function downloadCSV(filename: string, rows: (string | number | undefined)[][]) {
  const esc = (v: string | number | undefined) => {
    const s = v === undefined ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = "﻿" + rows.map(r => r.map(esc).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** ISO → valor de <input type="datetime-local"> en hora local, y vuelta. */
export function toLocalInput(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : undefined);
