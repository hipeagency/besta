/* «Avísame»: un solo formulario para nuevas fechas, merch y
   lanzamientos. Sale en un modal desde los botones «avísame» y
   en línea en el pie (newsletter). */
import { useState } from "react";
import { api } from "@/data/api";
import type { Topic } from "@/data/types";
import { cx } from "@/lib/format";

const TOPICS: { value: Topic; label: string }[] = [
  { value: "fechas", label: "conciertos nuevos" },
  { value: "merch", label: "merch" },
  { value: "lanzamientos", label: "canciones nuevas" },
];

export function SubscribeForm({ initial = ["fechas", "lanzamientos"], source, tone = "dark", compact = false }: { initial?: Topic[]; source: string; tone?: "dark" | "crema"; compact?: boolean }) {
  const [topics, setTopics] = useState<Topic[]>(initial);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const light = tone === "crema";

  if (done) return (
    <p className={cx("rounded-2xl px-5 py-4 leading-relaxed", light ? "bg-noche text-crema" : "bg-tubo")}>
      Hecho. Te llega un email para confirmar (mira en spam si no aparece). Después, solo te escribimos cuando haya algo de lo que marcaste.
    </p>
  );

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(""); setBusy(true);
    try {
      await api.subscribe({ email: String(f.get("email")), name: String(f.get("name") || "") || undefined, city: String(f.get("city") || "") || undefined, topics, source });
      setDone(true);
    } catch (err) { setError((err as Error).message); }
    setBusy(false);
  }

  const field = cx("h-[52px] px-5 rounded-full border-[1.5px] focus:border-senal focus:outline-none",
    light ? "bg-white border-noche/20 text-noche placeholder:text-noche/40" : "bg-transparent border-crema/25 placeholder:text-crema/40");

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <fieldset className="flex flex-wrap gap-1.5">
        <legend className="sr-only">Qué te interesa</legend>
        {TOPICS.map(t => {
          const on = topics.includes(t.value);
          return (
            <button key={t.value} type="button" aria-pressed={on} onClick={() => setTopics(on ? topics.filter(x => x !== t.value) : [...topics, t.value])}
              className={cx("h-10 px-4 rounded-full text-sm border-[1.5px] transition",
                on ? (light ? "bg-noche text-crema border-noche" : "bg-crema text-noche border-crema") : (light ? "border-noche/25" : "border-crema/25 text-crema/80"))}>
              {on ? "✓ " : ""}{t.label}
            </button>
          );
        })}
      </fieldset>
      {!compact && (
        <div className="grid sm:grid-cols-2 gap-2">
          <label className="sr-only" htmlFor={`${source}-name`}>Nombre</label>
          <input id={`${source}-name`} name="name" autoComplete="given-name" placeholder="tu nombre (opcional)" className={field} />
          <label className="sr-only" htmlFor={`${source}-city`}>Ciudad</label>
          <input id={`${source}-city`} name="city" autoComplete="address-level2" placeholder="tu ciudad (para avisarte si tocamos cerca)" className={field} />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor={`${source}-email`}>Tu email</label>
        <input id={`${source}-email`} name="email" type="email" required autoComplete="email" placeholder="tu@email.com" className={cx(field, "flex-[1_1_220px]")} />
        <button type="submit" disabled={busy} className={cx("h-[52px] px-6 rounded-full font-semibold", light ? "bg-senal text-noche" : "bg-crema text-noche")}>{busy ? "…" : "avísame"}</button>
      </div>
      {error && <p role="alert" className="text-sm">{error}</p>}
      <p className={cx("text-xs", light ? "text-noche/65" : "text-crema/55")}>Solo para avisarte de lo que marques. Te das de baja con un clic. <a href="/legal/privacidad" className="underline">Privacidad</a>.</p>
    </form>
  );
}
