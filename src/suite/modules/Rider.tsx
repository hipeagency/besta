/* Rider técnico: un documento por formato (banda completa, acústico…).
   A la izquierda los bloques que se encienden y se editan; a la derecha
   el papel tal cual le llega a la sala. Lo que se edita va a un borrador
   local y se guarda solo al momento (sin tirones al teclear). */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Page } from "@/suite/Shell";
import { useAction, useCollection } from "@/data/hooks";
import { api, uid } from "@/data/api";
import { upcomingGigs } from "@/data/selectors";
import type { Rider as RiderT, RiderBlock } from "@/data/types";
import { Button, Card, CardTitle, Field, Input, Segmented, Select, Sheet, Toggle, useToast } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { cx, dateShort } from "@/lib/format";
import { RiderDoc, channels } from "./rider/RiderDoc";
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
  const setBlock = (id: string, p: Partial<RiderBlock>) => edit(x => ({ ...x, blocks: x.blocks.map(b => (b.id === id ? { ...b, ...p } : b)) }));
  const switchTo = (id: string) => { flush(); setRid(id); setBid(undefined); };

  const link = `https://besta.es/rider/${r.id}-v${r.version}`;
  async function copyLink() {
    try { await navigator.clipboard.writeText(link); toast("Enlace copiado. La página pública llega con el backend.", "ok"); }
    catch { toast(`No se pudo copiar: ${link}`, "error"); }
  }

  const sent = r.sentTo.map(s => ({ ...s, gig: gigs.find(g => g.id === s.gigId) })).sort((a, b) => b.date.localeCompare(a.date));
  const pending = upcomingGigs(gigs).filter(g => !r.sentTo.some(s => s.gigId === g.id));

  const sub = (b: RiderBlock) =>
    b.id === "inputs" ? `${channels(r.inputs)} canales`
      : b.id === "plano" ? "arrastra a cada músico"
        : (b.body ?? "").split("\n")[0].slice(0, 40) || "vacío";

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

      <div className="flex flex-wrap gap-5 items-start">
        {/* bloques + edición */}
        <div className="flex-[1_1_320px] min-w-0 flex flex-col gap-2 print:hidden">
          {r.blocks.map(b => (
            <div key={b.id} className={cx("flex items-center gap-2 pl-4 pr-1.5 py-1.5 rounded-[14px] border-[1.5px]", b.id === block?.id ? "bg-tubo border-senal" : "border-crema/10")}>
              <button type="button" onClick={() => setBid(b.id)} aria-pressed={b.id === block?.id} className="flex-1 min-w-0 text-left py-1.5 min-h-11">
                <span className={cx("block text-[15px] font-medium truncate", !b.enabled && "text-crema/60")}>{b.name}</span>
                <span className="block text-xs text-crema/65 truncate">{sub(b)}</span>
              </button>
              <Toggle checked={b.enabled} onChange={v => setBlock(b.id, { enabled: v })} className="!bg-transparent !px-2 text-xs text-crema/70"
                label={<span className="w-[52px] text-left">{b.enabled ? "incluido" : "oculto"}</span>} />
            </div>
          ))}
          <button type="button" onClick={() => { const id = uid("b"); edit(x => ({ ...x, blocks: [...x.blocks, { id, name: "nuevo bloque", enabled: true, body: "" }] })); setBid(id); }}
            className="h-11 rounded-[14px] border border-dashed border-crema/25 font-mono text-xs text-crema/75 hover:text-crema">+ bloque</button>

          {block && (
            <BlockEditor key={r.id + block.id} rider={r} block={block} edit={edit} setBlock={p => setBlock(block.id, p)}
              onRemove={() => { edit(x => ({ ...x, blocks: x.blocks.filter(b => b.id !== block.id) })); setBid(undefined); }} />
          )}

          <Card className="mt-2">
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
        <div className="flex-[2_1_480px] min-w-0 print:flex-none print:w-full">
          <RiderDoc rider={r} onStage={stage => edit(x => ({ ...x, stage }))} />
          <p className="mt-2 text-xs text-crema/55 print:hidden">Vista previa: lo que ves es lo que se imprime. Puedes arrastrar a los músicos aquí mismo.</p>
        </div>
      </div>

      <NewFormat open={newFormat} onClose={() => setNewFormat(false)} from={r}
        onCreated={id => { flush(); switchTo(id); setNewFormat(false); }} />
    </Page>
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
