/* Edición del bloque elegido: texto libre, input list (tabla), el
   plano de escenario o el material. Todo escribe en el borrador del rider. */
import { useState } from "react";
import { useCollection } from "@/data/hooks";
import { uid } from "@/data/api";
import type { Rider, RiderBlock, RiderGear, RiderInput } from "@/data/types";
import { Button, Card, IconButton, Input, Select, Table, Textarea } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { StagePlot } from "./StagePlot";

const FIXED = ["inputs", "plano", "material"];

export function BlockEditor({ rider, block, edit, setBlock, onRemove }: {
  rider: Rider; block: RiderBlock;
  edit: (fn: (r: Rider) => Rider) => void;
  setBlock: (p: Partial<RiderBlock>) => void;
  onRemove: () => void;
}) {
  return (
    <Card className="mt-2 flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-[13px] text-crema/75">nombre del bloque
        <Input value={block.name} onChange={e => setBlock({ name: e.target.value })} />
      </label>
      {block.id === "inputs" ? <InputsEditor rider={rider} edit={edit} />
        : block.id === "plano" ? <StageEditor rider={rider} edit={edit} />
        : block.id === "material" ? <GearEditor rider={rider} edit={edit} />
          : (
            <label className="flex flex-col gap-1.5 text-[13px] text-crema/75">texto
              <Textarea rows={6} value={block.body ?? ""} onChange={e => setBlock({ body: e.target.value })} className="text-[15px] leading-relaxed" />
            </label>
          )}
      {!FIXED.includes(block.id) && (
        <button type="button" onClick={() => { if (confirm(`¿Quitar el bloque «${block.name}» de este formato?`)) onRemove(); }}
          className="self-start h-11 font-mono text-xs text-crema/55 hover:text-crema">quitar bloque</button>
      )}
    </Card>
  );
}

function InputsEditor({ rider, edit }: { rider: Rider; edit: (fn: (r: Rider) => Rider) => void }) {
  const set = (n: number, p: Partial<RiderInput>) => edit(r => ({ ...r, inputs: r.inputs.map((x, i) => (i === n ? { ...x, ...p } : x)) }));
  const add = () => edit(r => {
    const last = Math.max(0, ...r.inputs.map(i => parseInt(i.ch, 10) || 0));
    return { ...r, inputs: [...r.inputs, { ch: String(last + 1).padStart(2, "0"), source: "", mic: "", stand: "", dest: "FOH + IEM" }] };
  });
  const cell = "h-10 px-2 text-sm";
  return (
    <div className="flex flex-col gap-3">
      <Table head={["CH", "FUENTE", "MIC / DI", "PIE", "DESTINO", ""]} minWidth={700}>
        {rider.inputs.map((i, n) => (
          <tr key={n}>
            <td className="p-1 w-16"><Input value={i.ch} aria-label={`Canal fila ${n + 1}`} onChange={e => set(n, { ch: e.target.value })} className={`${cell} font-mono`} /></td>
            <td className="p-1"><Input value={i.source} aria-label={`Fuente canal ${i.ch}`} onChange={e => set(n, { source: e.target.value })} className={cell} /></td>
            <td className="p-1"><Input value={i.mic} aria-label={`Micro canal ${i.ch}`} onChange={e => set(n, { mic: e.target.value })} className={cell} /></td>
            <td className="p-1 w-24"><Input value={i.stand} aria-label={`Pie canal ${i.ch}`} onChange={e => set(n, { stand: e.target.value })} className={cell} /></td>
            <td className="p-1 w-36"><Input value={i.dest ?? ""} aria-label={`Destino canal ${i.ch}`} onChange={e => set(n, { dest: e.target.value })} placeholder="FOH + IEM" className={cell} /></td>
            <td className="p-1 w-11">
              <IconButton label={`Quitar canal ${i.ch}`} className="text-crema/60" onClick={() => edit(r => ({ ...r, inputs: r.inputs.filter((_, k) => k !== n) }))}>
                <Icon name="basura" size={16} />
              </IconButton>
            </td>
          </tr>
        ))}
      </Table>
      <Button size="sm" className="self-start h-11" onClick={add}>+ canal</Button>
      <p className="text-xs text-crema/60">Las columnas que dejes vacías en todos los canales (p. ej. «pie») no salen en el papel.</p>
    </div>
  );
}

function StageEditor({ rider, edit }: { rider: Rider; edit: (fn: (r: Rider) => Rider) => void }) {
  const { data: members } = useCollection("members");
  const missing = members.filter(m => !rider.stage.some(p => p.memberId === m.id));
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-[13px] text-crema/75">tamaño mínimo
        <Input value={rider.stageSize} onChange={e => edit(r => ({ ...r, stageSize: e.target.value }))} placeholder="6 × 4 m mín." className="font-mono" />
      </label>
      <div className="papel rounded-xl bg-crema text-noche p-3">
        <StagePlot stage={rider.stage} onChange={stage => edit(r => ({ ...r, stage }))} />
      </div>
      <p className="text-xs text-crema/60">Arrastra a cada músico. Con el teclado: foco y flechas (mayúsculas para ir más rápido).</p>
      <ul className="flex flex-col gap-1.5">
        {rider.stage.map(p => (
          <li key={p.memberId} className="flex items-center gap-1.5">
            <Input value={p.label} aria-label={`Etiqueta de ${p.memberId}`} className="flex-1 min-w-0 h-10 text-sm"
              onChange={e => edit(r => ({ ...r, stage: r.stage.map(x => (x.memberId === p.memberId ? { ...x, label: e.target.value } : x)) }))} />
            <Input value={p.detail ?? ""} aria-label={`Canales de ${p.memberId}`} placeholder="canales" className="flex-1 min-w-0 h-10 text-sm font-mono"
              onChange={e => edit(r => ({ ...r, stage: r.stage.map(x => (x.memberId === p.memberId ? { ...x, detail: e.target.value } : x)) }))} />
            <span className="w-[70px] shrink-0 text-right max-sm:hidden font-mono text-[11px] text-crema/55">{Math.round(p.x)} · {Math.round(p.y)} %</span>
            <IconButton label={`Quitar ${p.label} del plano`} className="shrink-0 text-crema/60"
              onClick={() => edit(r => ({ ...r, stage: r.stage.filter(x => x.memberId !== p.memberId) }))}><Icon name="basura" size={16} /></IconButton>
          </li>
        ))}
      </ul>
      {missing.length > 0 && (
        <Select aria-label="Añadir músico al plano" value=""
          onChange={e => {
            const m = members.find(x => x.id === e.target.value);
            if (m) edit(r => ({ ...r, stage: [...r.stage, { memberId: m.id, label: `${m.name} · ${m.instrument}`, x: 50, y: 50 }] }));
          }}>
          <option value="">+ añadir músico al plano…</option>
          {missing.map(m => <option key={m.id} value={m.id}>{m.name} · {m.instrument}</option>)}
        </Select>
      )}
    </div>
  );
}

/* Material: qué traemos y de quién es. «de quién» es texto libre con
   sugerencias (músicos, «banda» para lo común, «sala» para lo que pedimos). */
const OWNER_BANDA = "banda";
const OWNER_SALA = "sala";

function GearEditor({ rider, edit }: { rider: Rider; edit: (fn: (r: Rider) => Rider) => void }) {
  const { data: members } = useCollection("members");
  const gear = rider.gear ?? [];
  const owners = [...new Set([...members.filter(m => m.band && m.active).map(m => m.name), ...gear.map(g => g.owner).filter(Boolean), OWNER_BANDA, OWNER_SALA])];
  const [who, setWho] = useState("");
  const shown = who ? gear.filter(g => g.owner === who) : gear;

  const set = (id: string, p: Partial<RiderGear>) => edit(r => ({ ...r, gear: (r.gear ?? []).map(g => (g.id === id ? { ...g, ...p } : g)) }));
  const add = () => edit(r => ({ ...r, gear: [...(r.gear ?? []), { id: uid("g"), qty: 1, item: "", owner: who || gear.at(-1)?.owner || "" }] }));
  const cell = "h-10 px-2 text-sm";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Ver el material de" value={who} onChange={e => setWho(e.target.value)} className="h-10 w-auto text-sm">
          <option value="">todo ({gear.length})</option>
          {owners.map(o => <option key={o} value={o}>{o} ({gear.filter(g => g.owner === o).length})</option>)}
        </Select>
        <span className="text-xs text-crema/60">«banda» = común · «sala» = lo que tiene que poner la sala</span>
      </div>
      <datalist id="rider-owners">{owners.map(o => <option key={o} value={o} />)}</datalist>
      <Table head={["CANT.", "MATERIAL", "DE QUIÉN", "NOTA", ""]} minWidth={640}>
        {shown.map(g => (
          <tr key={g.id}>
            <td className="p-1 w-16"><Input type="number" min={1} inputMode="numeric" value={g.qty} aria-label={`Cantidad de ${g.item || "material"}`}
              onChange={e => set(g.id, { qty: Math.max(1, parseInt(e.target.value, 10) || 1) })} className={`${cell} font-mono`} /></td>
            <td className="p-1"><Input value={g.item} aria-label="Material" placeholder="jack guitarra 3 m" onChange={e => set(g.id, { item: e.target.value })} className={cell} /></td>
            <td className="p-1 w-32"><Input value={g.owner} list="rider-owners" aria-label={`De quién es ${g.item || "el material"}`} placeholder="Pau"
              onChange={e => set(g.id, { owner: e.target.value })} className={cell} /></td>
            <td className="p-1 w-40"><Input value={g.note ?? ""} aria-label={`Nota de ${g.item || "material"}`} onChange={e => set(g.id, { note: e.target.value })} className={cell} /></td>
            <td className="p-1 w-11">
              <IconButton label={`Quitar ${g.item || "material"}`} className="text-crema/60" onClick={() => edit(r => ({ ...r, gear: (r.gear ?? []).filter(x => x.id !== g.id) }))}>
                <Icon name="basura" size={16} />
              </IconButton>
            </td>
          </tr>
        ))}
      </Table>
      {!shown.length && <p className="text-sm text-crema/60">{who ? `Nada apuntado de ${who}.` : "Aún no hay material apuntado."}</p>}
      <Button size="sm" className="self-start h-11" onClick={add}>+ material{who ? ` de ${who}` : ""}</Button>
      <p className="text-xs text-crema/60">En el papel sale agrupado por persona.</p>
    </div>
  );
}
