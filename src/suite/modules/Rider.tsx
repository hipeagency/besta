/* Rider técnico: un documento por formato (banda completa, acústico…).
   A la izquierda se edita el bloque elegido (el menú flotante de bloques
   dice cuáles van incluidos); a la derecha, el papel tal cual le llega
   a la sala. Lo que se edita va a un borrador
   local y se guarda solo al momento (sin tirones al teclear). */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Page } from "@/suite/Shell";
import { useAction, useCollection } from "@/data/hooks";
import { api, uid } from "@/data/api";
import { upcomingGigs } from "@/data/selectors";
import type { Rider as RiderT, RiderBlock } from "@/data/types";
import { Button, Card, CardTitle, Field, IconButton, Input, Segmented, Select, Sheet, Toggle, useToast } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { cx, dateShort } from "@/lib/format";
import { RiderDoc } from "./rider/RiderDoc";
import { BlockEditor } from "./rider/BlockEditor";

/* Al imprimir solo sale el papel: fuera la navegación de la suite y la cabecera. */
const PRINT_CSS = `@media print {
  @page { margin: 12mm; }
  html, body { background: #fff !important; }
  body:has(#rider-doc) nav, body:has(#rider-doc) main > header { display: none !important; }
  #rider-doc { box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;

export default function Rider() {
  const toast = useToast();
  const { data: riders, loading } = useCollection("riders");
  const { data: gigs } = useCollection("gigs");
  const [rid, setRid] = useState<string>();
  const [bid, setBid] = useState<string>();
  const [newFormat, setNewFormat] = useState(false);
  const [view, setView] = useState<"editar" | "papel">("editar");
  const server = riders.find(r => r.id === rid) ?? riders[0];

  // ---------- borrador con guardado diferido ----------
  const [draft, setDraft] = useState<RiderT | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef<RiderT | null>(null);
  const flush = useCallback(() => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = undefined;
    const d = latest.current;
    if (d) void api.update("riders", d.id, d);
  }, []);
  useEffect(() => { if (server && draft?.id !== server.id) setDraft(structuredClone(server)); }, [server, draft?.id]);
  useEffect(() => flush, [flush]);
  const edit = (fn: (r: RiderT) => RiderT) => setDraft(cur => {
    if (!cur) return cur;
    const next = fn(cur);
    latest.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 400);
    return next;
  });

  const r = draft && draft.id === server?.id ? draft : null;
  if (loading) return null;
  if (!r) return <Page title="rider"><p className="text-crema/60">Sin riders todavía.</p></Page>;

  const block = r.blocks.find(b => b.id === bid) ?? r.blocks[0];
  const pos = block ? r.blocks.indexOf(block) : -1;
  const setBlock = (id: string, p: Partial<RiderBlock>) => edit(x => ({ ...x, blocks: x.blocks.map(b => (b.id === id ? { ...b, ...p } : b)) }));
  const switchTo = (id: string) => { flush(); setRid(id); setBid(undefined); };

  const link = `https://besta.es/rider/${r.id}-v${r.version}`;
  async function copyLink() {
    try { await navigator.clipboard.writeText(link); toast("Enlace copiado. La página pública llega con el backend.", "ok"); }
    catch { toast(`No se pudo copiar: ${link}`, "error"); }
  }

  const sent = r.sentTo.map(s => ({ ...s, gig: gigs.find(g => g.id === s.gigId) })).sort((a, b) => b.date.localeCompare(a.date));
  const pending = upcomingGigs(gigs).filter(g => !r.sentTo.some(s => s.gigId === g.id));


  return (
    <Page title="rider" actions={<>
      <Button onClick={copyLink} className="print:hidden"><Icon name="copiar" size={16} />copiar enlace para la sala</Button>
      <Button variant="primary" onClick={() => window.print()} className="print:hidden"><Icon name="descargar" size={16} />imprimir / PDF</Button>
    </>}>
      <style>{PRINT_CSS}</style>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Segmented value={r.id} onChange={switchTo} options={riders.map(x => ({ value: x.id, label: x.name }))} />
        <Button size="sm" variant="quiet" className="h-11" onClick={() => setNewFormat(true)}>+ formato</Button>
        <label className="ml-auto flex items-center gap-2 font-mono text-xs text-crema/70">
          versión
          <Input value={r.version} onChange={e => edit(x => ({ ...x, version: e.target.value }))} className="w-28 h-10 font-mono text-sm" />
        </label>
        <span className="font-mono text-xs text-crema/70">· enviado a {sent.length} {sent.length === 1 ? "bolo" : "bolos"}</span>
      </div>

      {/* En el móvil no caben los dos: se cambia entre editar y ver el papel. */}
      <Segmented value={view} onChange={setView} className="self-start lg:hidden print:hidden"
        options={[{ value: "editar", label: "editar" }, { value: "papel", label: "ver el papel" }]} />

      <div className="grid gap-5 items-start lg:grid-cols-[minmax(340px,1fr)_minmax(0,1.3fr)]">
        {/* edición: fija a la vista mientras el papel se desplaza al lado */}
        <div className={cx("min-w-0 flex flex-col gap-3 print:hidden lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:pr-1",
          view !== "editar" && "max-lg:hidden")}>
          <div className="relative flex items-center gap-1.5">
            <Sections rider={r} current={block?.id} onPick={id => setBid(id)} onToggle={(id, v) => setBlock(id, { enabled: v })}
              onAdd={() => { const id = uid("b"); edit(x => ({ ...x, blocks: [...x.blocks, { id, name: "nuevo bloque", enabled: true, body: "" }] })); setBid(id); }} />
            <IconButton label="Bloque anterior" disabled={pos <= 0} className="disabled:opacity-30" onClick={() => setBid(r.blocks[pos - 1].id)}><Icon name="arriba" size={16} /></IconButton>
            <IconButton label="Bloque siguiente" disabled={pos >= r.blocks.length - 1} className="disabled:opacity-30" onClick={() => setBid(r.blocks[pos + 1].id)}><Icon name="abajo" size={16} /></IconButton>
            {block && (
              <Toggle checked={block.enabled} onChange={v => setBlock(block.id, { enabled: v })} className="ml-auto !h-10 !px-3 text-xs text-crema/75"
                label={<span className="w-[52px] text-left">{block.enabled ? "incluido" : "oculto"}</span>} />
            )}
          </div>

          {block && (
            <BlockEditor key={r.id + block.id} rider={r} block={block} edit={edit} setBlock={p => setBlock(block.id, p)}
              onRemove={() => { edit(x => ({ ...x, blocks: x.blocks.filter(b => b.id !== block.id) })); setBid(undefined); }} />
          )}

          <Card>
            <CardTitle>enviado a</CardTitle>
            {!sent.length && <p className="text-sm text-crema/60 mb-3">Este formato aún no ha salido hacia ninguna sala.</p>}
            <ul className="flex flex-col gap-1.5 mb-3">
              {sent.map(s => (
                <li key={s.gigId}>
                  <Link to={`/bolos/${s.gigId}`} className="flex items-center justify-between gap-3 min-h-11 px-3 rounded-xl bg-noche hover:bg-crema/5">
                    <span>{s.gig ? `${s.gig.city} · ${dateShort(s.gig.date)}` : "bolo borrado"}</span>
                    <span className="font-mono text-[11px] text-crema/60">enviado {dateShort(s.date)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {pending.length > 0 && (
              <Select aria-label="Marcar como enviado a un bolo" value=""
                onChange={e => { const gigId = e.target.value; if (gigId) { edit(x => ({ ...x, sentTo: [...x.sentTo, { gigId, date: new Date().toISOString().slice(0, 10) }] })); toast("Marcado como enviado", "ok"); } }}>
                <option value="">marcar enviado a…</option>
                {pending.map(g => <option key={g.id} value={g.id}>{g.city} · {dateShort(g.date)}</option>)}
              </Select>
            )}
          </Card>
        </div>

        {/* papel */}
        <div className={cx("min-w-0 print:block print:w-full", view !== "papel" && "max-lg:hidden")}>
          <RiderDoc rider={r} onStage={stage => edit(x => ({ ...x, stage }))} selected={block?.id}
            onSelect={id => { setBid(id); setView("editar"); }} />
          <p className="mt-2 text-xs text-crema/55 print:hidden">Lo que ves es lo que se imprime. Pincha un bloque para editarlo; a los músicos los puedes arrastrar aquí mismo.</p>
        </div>
      </div>

      <NewFormat open={newFormat} onClose={() => setNewFormat(false)} from={r}
        onCreated={id => { flush(); switchTo(id); setNewFormat(false); }} />
    </Page>
  );
}

/* Menú flotante de bloques: cuáles van en el papel y cuál se edita.
   Pequeño y encima de todo, para no empujar el editor hacia abajo. */
function Sections({ rider, current, onPick, onToggle, onAdd }: {
  rider: RiderT; current?: string;
  onPick: (id: string) => void; onToggle: (id: string, v: boolean) => void; onAdd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const name = rider.blocks.find(b => b.id === current)?.name ?? "bloques";
  const on = rider.blocks.filter(b => b.enabled).length;

  return (
    <div ref={box} className="relative min-w-0">
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(o => !o)}
        className="h-10 max-w-[260px] pl-4 pr-3 rounded-full bg-tubo border-[1.5px] border-crema/15 hover:border-crema/40 inline-flex items-center gap-2 text-sm font-medium">
        <Icon name="bloques" size={16} className="shrink-0 text-senal" />
        <span className="truncate">{name}</span>
        <span className="font-mono text-[11px] text-crema/60 shrink-0">{on}/{rider.blocks.length}</span>
        <Icon name="desplegar" size={14} className={cx("shrink-0 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-12 z-30 w-[300px] max-h-[60vh] overflow-y-auto p-1.5 rounded-2xl bg-tubo-alto border border-crema/10 shadow-[0_18px_40px_rgba(0,0,0,.45)]">
          {rider.blocks.map(b => (
            <div key={b.id} className={cx("flex items-center gap-1 pl-3 pr-1 rounded-xl", b.id === current && "bg-crema/[.07]")}>
              <button type="button" role="menuitem" onClick={() => { onPick(b.id); setOpen(false); }}
                className={cx("flex-1 min-w-0 text-left min-h-10 text-sm truncate", b.id === current && "font-semibold", !b.enabled && "text-crema/55")}>
                {b.name}
              </button>
              <button type="button" role="switch" aria-checked={b.enabled} aria-label={`${b.name}: ${b.enabled ? "incluido" : "oculto"}`}
                onClick={() => onToggle(b.id, !b.enabled)} className="h-10 px-2 inline-flex items-center gap-2 font-mono text-[11px] text-crema/65">
                {b.enabled ? "incluido" : "oculto"}
                <span className={cx("relative w-8 h-[18px] rounded-full transition", b.enabled ? "bg-senal" : "bg-crema/20")}>
                  <span className={cx("absolute top-[3px] size-3 rounded-full bg-noche transition-all", b.enabled ? "left-[17px]" : "left-[3px]")} />
                </span>
              </button>
            </div>
          ))}
          <button type="button" onClick={() => { onAdd(); setOpen(false); }}
            className="w-full mt-1 h-10 rounded-xl border border-dashed border-crema/25 font-mono text-xs text-crema/75 hover:text-crema">+ bloque</button>
        </div>
      )}
    </div>
  );
}

function NewFormat({ open, onClose, from, onCreated }: { open: boolean; onClose: () => void; from: RiderT; onCreated: (id: string) => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  useEffect(() => { if (open) setName(""); }, [open]);
  const create = useAction((x: RiderT) => api.insert("riders", x));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    const x: RiderT = { ...structuredClone(from), id: uid("rider-"), name: n, sentTo: [] };
    await create.run(x);
    toast(`Formato «${n}» creado a partir de «${from.name}»`, "ok");
    onCreated(x.id);
  }

  return (
    <Sheet open={open} onClose={onClose} title="nuevo formato" width={420}>
      <form onSubmit={submit} className="flex flex-col gap-4 pt-2">
        <p className="text-sm text-crema/70">Se copia «{from.name}» tal cual; luego quitas o cambias lo que no toque.</p>
        <Field label="nombre del formato">{id => <Input id={id} autoFocus required value={name} onChange={e => setName(e.target.value)} placeholder="trío, festival, fiesta privada…" />}</Field>
        <Button type="submit" variant="primary" size="lg" disabled={create.pending || !name.trim()}>crear formato</Button>
      </form>
    </Sheet>
  );
}
