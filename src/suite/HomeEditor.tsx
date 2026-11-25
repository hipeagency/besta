/* Lista de módulos del inicio con interruptor y orden. La usan la hoja
   «personalizar inicio» y la pantalla de ajustes. */
import { IconButton } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { cx } from "@/lib/format";
import type { useHomeLayout } from "./home";

export function HomeModulesEditor({ layout }: { layout: ReturnType<typeof useHomeLayout> }) {
  const list = layout.available;
  return (
    <ul className="flex flex-col gap-2">
      {list.map((w, i) => {
        const on = layout.isOn(w.id);
        return (
          <li key={w.id} className={cx("flex items-center gap-2 p-2 pl-3 rounded-2xl bg-noche", !on && "opacity-60")}>
            <button type="button" role="switch" aria-checked={on} onClick={() => layout.toggle(w.id)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
              <span className={cx("relative w-9 h-5 shrink-0 rounded-full transition", on ? "bg-senal" : "bg-crema/20")}>
                <span className={cx("absolute top-0.5 size-4 rounded-full bg-noche transition-all", on ? "left-[18px]" : "left-0.5")} />
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{w.name}</span>
                <span className="block text-xs text-crema/60 truncate">{w.desc}</span>
              </span>
            </button>
            <IconButton label={`subir ${w.name}`} disabled={i === 0} onClick={() => layout.move(w.id, -1)} className="size-9 disabled:opacity-25"><Icon name="arriba" size={16} /></IconButton>
            <IconButton label={`bajar ${w.name}`} disabled={i === list.length - 1} onClick={() => layout.move(w.id, 1)} className="size-9 disabled:opacity-25"><Icon name="abajo" size={16} /></IconButton>
          </li>
        );
      })}
    </ul>
  );
}
