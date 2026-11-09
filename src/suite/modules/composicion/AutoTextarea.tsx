/* Textarea que crece con lo que lleva dentro: nunca tiene scroll propio. */
import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";
import { cx } from "@/lib/format";

export function AutoTextarea({ className, onInput, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  };
  useLayoutEffect(() => {
    fit();
    // Al cambiar el ancho (girar el móvil, redimensionar) cambian los saltos de línea.
    const ro = new ResizeObserver(fit);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return <textarea ref={ref} {...p} onInput={e => { fit(); onInput?.(e); }}
    className={cx("w-full rounded-xl border border-crema/15 bg-noche px-3.5 py-2.5 text-crema placeholder:text-crema/40 focus:border-senal focus:outline-none resize-none overflow-hidden", className)} />;
}
