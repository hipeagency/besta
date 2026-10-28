/* Plano de escenario en papel. Cada músico va en % del escenario, así
   el plano escala igual en pantalla, en móvil y en el PDF. Se arrastra
   con el dedo o el ratón, y con las flechas si tiene el foco. */
import { useRef } from "react";
import type { StagePos } from "@/data/types";
import { cx } from "@/lib/format";

const clamp = (v: number) => Math.round(Math.min(96, Math.max(4, v)) * 10) / 10;

export function StagePlot({ stage, onChange, className }: { stage: StagePos[]; onChange?: (next: StagePos[]) => void; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<string | null>(null);

  const move = (id: string, x: number, y: number) => onChange?.(stage.map(p => (p.memberId === id ? { ...p, x: clamp(x), y: clamp(y) } : p)));

  const fromPointer = (id: string, e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    move(id, ((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
  };

  return (
    <div className={className}>
      <div ref={box} className="relative h-[220px] sm:h-[260px] border-[1.5px] border-noche rounded-[4px] print:h-[300px]"
        style={{ backgroundImage: "radial-gradient(rgba(15,11,8,.18) 1px, transparent 1px)", backgroundSize: "16px 16px" }}>
        {stage.map(p => {
          const lead = /voz/i.test(p.label);
          return (
            <span key={p.memberId}
              role={onChange ? "button" : undefined}
              tabIndex={onChange ? 0 : undefined}
              aria-label={onChange ? `${p.label}: arrastra o usa las flechas para moverlo` : undefined}
              onPointerDown={onChange ? e => { drag.current = p.memberId; e.currentTarget.setPointerCapture(e.pointerId); } : undefined}
              onPointerMove={onChange ? e => { if (drag.current === p.memberId) fromPointer(p.memberId, e); } : undefined}
              onPointerUp={onChange ? () => { drag.current = null; } : undefined}
              onPointerCancel={onChange ? () => { drag.current = null; } : undefined}
              onKeyDown={onChange ? e => {
                const d = e.shiftKey ? 5 : 2;
                const k: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
                if (k[e.key]) { e.preventDefault(); move(p.memberId, p.x + k[e.key][0], p.y + k[e.key][1]); }
              } : undefined}
              className={cx("absolute -translate-x-1/2 -translate-y-1/2 px-2.5 py-2 rounded-lg text-[11px] sm:text-xs font-semibold text-center whitespace-nowrap select-none",
                lead ? "bg-senal text-noche" : "bg-noche text-crema",
                onChange && "cursor-grab active:cursor-grabbing touch-none focus-visible:outline-senal min-h-9 grid place-items-center")}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}>
              {p.label}
            </span>
          );
        })}
        <span className="absolute left-1/2 bottom-1.5 -translate-x-1/2 font-mono text-[10px] tracking-[.14em] pointer-events-none">PÚBLICO ↓</span>
      </div>
    </div>
  );
}
