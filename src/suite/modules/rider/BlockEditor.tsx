/* Edición del bloque elegido: texto libre, input list (tabla) o el
   plano de escenario. Todo escribe en el borrador del rider. */
import { useCollection } from "@/data/hooks";
import type { Rider, RiderBlock, RiderInput } from "@/data/types";
import { Button, Card, IconButton, Input, Select, Table, Textarea } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { StagePlot } from "./StagePlot";

const FIXED = ["inputs", "plano"];

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
    return { ...r, inputs: [...r.inputs, { ch: String(last + 1).padStart(2, "0"), source: "", mic: "", stand: "" }] };
  });
  const cell = "h-10 px-2 text-sm";
  return (
    <div className="flex flex-col gap-3">
      <Table head={["CH", "FUENTE", "MIC / DI", "PIE", ""]} minWidth={560}>
        {rider.inputs.map((i, n) => (
          <tr key={n}>
            <td className="p-1 w-16"><Input value={i.ch} aria-label={`Canal fila ${n + 1}`} onChange={e => set(n, { ch: e.target.value })} className={`${cell} font-mono`} /></td>
            <td className="p-1"><Input value={i.source} aria-label={`Fuente canal ${i.ch}`} onChange={e => set(n, { source: e.target.value })} className={cell} /></td>
            <td className="p-1"><Input value={i.mic} aria-label={`Micro canal ${i.ch}`} onChange={e => set(n, { mic: e.target.value })} className={cell} /></td>
            <td className="p-1 w-24"><Input value={i.stand} aria-label={`Pie canal ${i.ch}`} onChange={e => set(n, { stand: e.target.value })} className={cell} /></td>
            <td className="p-1 w-11">
              <IconButton label={`Quitar canal ${i.ch}`} className="text-crema/60" onClick={() => edit(r => ({ ...r, inputs: r.inputs.filter((_, k) => k !== n) }))}>
                <Icon name="basura" size={16} />
              </IconButton>
            </td>
          </tr>
        ))}
      </Table>
      <Button size="sm" className="self-start h-11" onClick={add}>+ canal</Button>
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
            <Input value={p.label} aria-label={`Etiqueta de ${p.memberId}`} className="flex-1 h-10 text-sm"
              onChange={e => edit(r => ({ ...r, stage: r.stage.map(x => (x.memberId === p.memberId ? { ...x, label: e.target.value } : x)) }))} />
            <span className="w-[86px] shrink-0 text-right font-mono text-[11px] text-crema/55">{Math.round(p.x)} · {Math.round(p.y)} %</span>
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
