/* Importes que se escriben en euros y se guardan en céntimos.
   Acepta «1200», «1.200», «1200,50» y «1.200,50 €». */
import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { Input } from "@/components/ui";
import { cx } from "@/lib/format";

export function parseEuros(s: string): number {
  let t = s.replace(/[€\s]/g, "");
  if (!t) return 0;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export const centsToText = (c: number) => (c ? (c / 100).toFixed(2).replace(".", ",") : "");

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & { cents: number; onValue: (cents: number) => void };

/** Campo de importe: el texto es libre mientras escribes, al salir se normaliza. */
export function MoneyInput({ cents, onValue, className, onBlur, onFocus, ...rest }: Props) {
  const [text, setText] = useState(centsToText(cents));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(centsToText(cents)); }, [cents]);
  return (
    <Input
      inputMode="decimal"
      placeholder="0,00"
      {...rest}
      value={text}
      onFocus={e => { focused.current = true; onFocus?.(e); }}
      onBlur={e => { focused.current = false; setText(centsToText(parseEuros(text))); onBlur?.(e); }}
      onChange={e => { setText(e.target.value); onValue(parseEuros(e.target.value)); }}
      className={cx("font-mono text-right", className)}
    />
  );
}
