/* =========================================================
   Componentes base «señal». Todo lo que se repite en la web
   y en la suite sale de aquí: si un botón cambia, cambia en
   todas partes.
   ========================================================= */
import { useEffect, useId, useRef, useState, createContext, useContext, useCallback, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes } from "react";
import { cx } from "@/lib/format";

// ---------- logotipo ----------
export function Logo({ className = "w-24", alt = "besta" }: { className?: string; alt?: string }) {
  return <span className={cx("logo-crop", className)}><img src="/img/logo-crema.png" alt={alt} /></span>;
}

// ---------- botones ----------
type Variant = "primary" | "light" | "ghost" | "quiet" | "dark";
type Size = "sm" | "md" | "lg";
const variants: Record<Variant, string> = {
  primary: "bg-senal text-noche font-semibold hover:brightness-110",
  light: "bg-crema text-noche font-semibold hover:brightness-95",
  ghost: "border-[1.5px] border-crema/25 text-crema hover:border-crema/60",
  quiet: "text-crema/80 hover:text-crema hover:bg-crema/5",
  dark: "bg-noche text-crema font-semibold hover:bg-tubo",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-[18px] text-[15px]",
  lg: "h-14 px-6 text-[17px]",
};

export function Button({ variant = "ghost", size = "md", className, block, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; block?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx("inline-flex items-center justify-center gap-2 rounded-full whitespace-nowrap transition select-none", variants[variant], sizes[size], block && "w-full", className)}
    />
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} {...rest}
      className={cx("inline-grid place-items-center size-11 rounded-full text-crema hover:bg-crema/10 transition", className)}>
      {children}
    </button>
  );
}

// ---------- texto ----------
export const Kicker = ({ children, className }: { children: ReactNode; className?: string }) =>
  <p className={cx("kicker text-senal", className)}>{children}</p>;

export const Mono = ({ children, className }: { children: ReactNode; className?: string }) =>
  <span className={cx("font-mono", className)}>{children}</span>;

// ---------- superficies ----------
export function Card({ children, className, as: Tag = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" }) {
  return <Tag className={cx("rounded-[20px] bg-tubo p-5", className)}>{children}</Tag>;
}

export function CardTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-center justify-between gap-3 mb-3", className)}>
      <h2 className="text-[17px] font-semibold">{children}</h2>
      {action}
    </div>
  );
}

// ---------- estados ----------
type Tone = "senal" | "crema" | "mute" | "ok" | "error" | "solid";
const tones: Record<Tone, string> = {
  senal: "bg-senal/15 text-senal-suave",
  crema: "bg-crema text-noche",
  mute: "bg-crema/10 text-crema/80",
  ok: "bg-crema/10 text-crema/85",
  error: "bg-crema/10 text-crema/85",
  solid: "bg-senal text-noche",
};
export function Pill({ tone = "mute", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  const dotColor = tone === "ok" ? "bg-ok" : tone === "error" ? "bg-error" : tone === "senal" ? "bg-senal" : "bg-crema/50";
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-xs whitespace-nowrap", tones[tone], className)}>
      {(dot || tone === "ok" || tone === "error") && <span className={cx("size-1.5 rounded-full", dotColor)} />}
      {children}
    </span>
  );
}

export const Dot = ({ tone = "mute" }: { tone?: "ok" | "error" | "senal" | "mute" }) =>
  <span className={cx("inline-block size-2 rounded-full shrink-0", tone === "ok" ? "bg-ok" : tone === "error" ? "bg-error" : tone === "senal" ? "bg-senal" : "bg-crema/40")} />;

export function Stat({ label, value, sub, swatch }: { label: string; value: ReactNode; sub?: ReactNode; swatch?: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="flex items-center gap-2 text-[13px] text-crema/70">{swatch && <span className={cx("size-2.5 rounded-[3px]", swatch)} />}{label}</span>
      <span className="font-mono text-[26px] leading-tight tracking-tight">{value}</span>
      {sub && <span className="text-[12.5px] text-crema/60">{sub}</span>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[20px] border border-dashed border-crema/20 p-8 text-center flex flex-col items-center gap-3">
      <p className="text-lg font-semibold">{title}</p>
      {children && <p className="text-sm text-crema/70 max-w-sm">{children}</p>}
      {action}
    </div>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cx("h-1 rounded-full bg-crema/12", className)} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-senal" style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}

// ---------- formularios ----------
const fieldBase = "w-full rounded-xl border border-crema/15 bg-noche px-3.5 text-crema placeholder:text-crema/40 focus:border-senal focus:outline-none";

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] text-crema/75">{label}</label>
      {children(id)}
      {hint && <span className="text-xs text-crema/55">{hint}</span>}
    </div>
  );
}

export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) =>
  <input {...p} className={cx(fieldBase, "h-11", className)} />;

export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) =>
  <textarea {...p} className={cx(fieldBase, "py-2.5 resize-y min-h-20", className)} />;

export const Select = ({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) =>
  <select {...p} className={cx(fieldBase, "h-11 appearance-none pr-8 bg-[length:12px] bg-no-repeat bg-[right_12px_center]", className)}
    style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23F6E6CC' stroke-width='1.6' fill='none'/%3E%3C/svg%3E\")" }}>{children}</select>;

export function Toggle({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; className?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={cx("inline-flex items-center gap-2.5 h-11 px-4 rounded-full bg-tubo text-sm", className)}>
      <span className={cx("relative w-9 h-5 rounded-full transition", checked ? "bg-senal" : "bg-crema/20")}>
        <span className={cx("absolute top-0.5 size-4 rounded-full bg-noche transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </span>
      {label}
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string; size?: "sm" | "md" }) {
  return (
    <div role="tablist" className={cx("inline-flex gap-1 p-1 rounded-full bg-tubo max-w-full overflow-x-auto no-scrollbar", className)}>
      {options.map(o => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cx("rounded-full px-3.5 whitespace-nowrap transition font-medium", size === "sm" ? "h-8 text-[13px]" : "h-[34px] text-sm",
            value === o.value ? "bg-crema text-noche" : "text-crema/75 hover:text-crema")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, min = 1, max = 10 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" aria-label="Una menos" disabled={value <= min} onClick={() => onChange(value - 1)}
        className="size-11 rounded-full border-[1.5px] border-crema/30 text-xl">−</button>
      <span className="w-8 text-center font-mono text-xl" aria-live="polite">{value}</span>
      <button type="button" aria-label="Una más" disabled={value >= max} onClick={() => onChange(value + 1)}
        className="size-11 rounded-full bg-crema text-noche text-xl">+</button>
    </div>
  );
}

// ---------- capas ----------
function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", h); document.body.style.overflow = prev; };
  }, [open, onClose]);
}

/** Panel lateral en escritorio, panel desde abajo en móvil. */
export function Sheet({ open, onClose, title, children, width = 460, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: number; footer?: ReactNode }) {
  useEscape(open, onClose);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) ref.current?.focus(); }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-stretch md:justify-end">
      <button type="button" aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-black/60 anim-fade" />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        style={{ ["--w" as string]: `${width}px` }}
        className="relative w-full md:w-[var(--w)] max-h-[92dvh] md:max-h-none md:h-dvh flex flex-col bg-tubo rounded-t-3xl md:rounded-none md:border-l md:border-crema/10 anim-sheet md:anim-drawer outline-none">
        <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-2 md:pt-5">
          <span className="md:hidden absolute left-1/2 top-2 -translate-x-1/2 w-10 h-1 rounded-full bg-crema/30" />
          <h2 className="text-lg font-semibold mt-2 md:mt-0">{title}</h2>
          <IconButton label="Cerrar" onClick={onClose} className="bg-noche">×</IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="border-t border-crema/10 p-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, tone = "dark" }: { open: boolean; onClose: () => void; title: string; children: ReactNode; tone?: "dark" | "crema" }) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button type="button" aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-black/65 anim-fade" />
      <div role="dialog" aria-modal="true" aria-label={title}
        className={cx("relative w-full max-w-[560px] max-h-[90dvh] overflow-y-auto rounded-[32px] p-6 sm:p-8 anim-fade", tone === "crema" ? "bg-crema text-noche" : "bg-tubo text-crema")}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="text-[34px] sm:text-[40px] font-extrabold leading-[.95] tracking-[-.03em]">{title}</h2>
          <button type="button" aria-label="Cerrar" onClick={onClose}
            className={cx("size-11 shrink-0 rounded-full text-xl", tone === "crema" ? "bg-noche text-crema" : "bg-noche text-crema")}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------- avisos ----------
type ToastT = { id: number; text: string; tone: "ok" | "error" | "info" };
const ToastCtx = createContext<(text: string, tone?: ToastT["tone"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<ToastT[]>([]);
  const push = useCallback((text: string, tone: ToastT["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setList(l => [...l, { id, text, tone }]);
    setTimeout(() => setList(l => l.filter(t => t.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="fixed z-[60] left-1/2 -translate-x-1/2 bottom-24 md:bottom-6 flex flex-col gap-2 items-center pointer-events-none px-4 w-full max-w-md">
        {list.map(t => (
          <div key={t.id} className={cx("anim-fade rounded-2xl px-4 py-3 text-sm shadow-2xl flex items-center gap-2", t.tone === "error" ? "bg-crema text-noche" : "bg-crema text-noche")}>
            {t.tone !== "info" && <Dot tone={t.tone === "ok" ? "ok" : "error"} />}{t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- tablas ----------
export function Table({ head, children, minWidth = 520 }: { head: ReactNode[]; children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        <thead>
          <tr className="text-left font-mono text-[11px] tracking-[.08em] text-crema/60">
            {head.map((h, i) => <th key={i} className="px-1.5 py-2 font-normal">{h}</th>)}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-t [&>tr]:border-crema/8">{children}</tbody>
      </table>
    </div>
  );
}
