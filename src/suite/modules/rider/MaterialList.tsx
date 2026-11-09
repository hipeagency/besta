/* Nuestro material: una lista de la banda, aparte del rider. Qué hay,
   cuánto y de quién. Se guarda en ajustes (doc «material»), sola, al
   momento; la primera vez parte de lo que ya estaba apuntado en los riders. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useCollection } from "@/data/hooks";
import { api, uid } from "@/data/api";
import type { RiderGear } from "@/data/types";
import { Button, Card, IconButton, Input, Select, Table } from "@/components/ui";
import { Icon } from "@/components/ui/icons";

const DOC = "material";
const OWNER_BANDA = "banda";
const OWNER_SALA = "sala";

export function MaterialList() {
  const { data: settings, loading } = useCollection("settings");
  const { data: riders, loading: loadingRiders } = useCollection("riders");
  const { data: members } = useCollection("members");
  const stored = settings.find(s => s.id === DOC);

  // ---------- borrador con guardado diferido ----------
  const [gear, setGear] = useState<RiderGear[] | null>(null);
  const exists = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef<RiderGear[]>([]);
  const flush = useCallback(() => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = undefined;
    const g = latest.current.map(x => ({ ...x, item: x.item.trim(), owner: x.owner.trim() }));
    if (exists.current) void api.update("settings", DOC, { gear: g });
    else { exists.current = true; void api.insert("settings", { id: DOC, gear: g }); }
  }, []);
  useEffect(() => flush, [flush]);
  useEffect(() => {
    if (gear || loading || loadingRiders) return;
    exists.current = !!stored;
    setGear(stored?.gear ?? fromRiders(riders.flatMap(r => r.gear ?? [])));
  }, [gear, loading, loadingRiders, stored, riders]);
  const edit = (fn: (g: RiderGear[]) => RiderGear[]) => setGear(cur => {
    const next = fn(cur ?? []);
    latest.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 400);
    return next;
  });

  const [who, setWho] = useState("");
  if (!gear) return null;

  const owners = [...new Set([...members.filter(m => m.band && m.active).map(m => m.name), ...gear.map(g => g.owner).filter(Boolean), OWNER_BANDA, OWNER_SALA])];
  const shown = who ? gear.filter(g => g.owner === who) : gear;
  const set = (id: string, p: Partial<RiderGear>) => edit(g => g.map(x => (x.id === id ? { ...x, ...p } : x)));
  const add = () => edit(g => [...g, { id: uid("g"), qty: 1, item: "", owner: who || g.at(-1)?.owner || "" }]);
  const cell = "h-10 px-2 text-sm";

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Ver el material de" value={who} onChange={e => setWho(e.target.value)} className="h-10 w-auto text-sm">
          <option value="">todo ({gear.length})</option>
          {owners.map(o => <option key={o} value={o}>{o} ({gear.filter(g => g.owner === o).length})</option>)}
        </Select>
        <span className="text-xs text-crema/60">«banda» = común · «sala» = lo que tiene que poner la sala</span>
      </div>
      <datalist id="material-owners">{owners.map(o => <option key={o} value={o} />)}</datalist>
      <Table head={["CANT.", "MATERIAL", "DE QUIÉN", "NOTA", ""]} minWidth={640}>
        {shown.map(g => (
          <tr key={g.id}>
            <td className="p-1 w-16"><Input type="number" min={1} inputMode="numeric" value={g.qty} aria-label={`Cantidad de ${g.item || "material"}`}
              onChange={e => set(g.id, { qty: Math.max(1, parseInt(e.target.value, 10) || 1) })} className={`${cell} font-mono`} /></td>
            <td className="p-1"><Input value={g.item} aria-label="Material" placeholder="jack guitarra 3 m" onChange={e => set(g.id, { item: e.target.value })} className={cell} /></td>
            <td className="p-1 w-36"><Input value={g.owner} list="material-owners" aria-label={`De quién es ${g.item || "el material"}`} placeholder="Pau"
              onChange={e => set(g.id, { owner: e.target.value })} className={cell} /></td>
            <td className="p-1 w-56"><Input value={g.note ?? ""} aria-label={`Nota de ${g.item || "material"}`} onChange={e => set(g.id, { note: e.target.value })} className={cell} /></td>
            <td className="p-1 w-11">
              <IconButton label={`Quitar ${g.item || "material"}`} className="text-crema/60" onClick={() => edit(l => l.filter(x => x.id !== g.id))}>
                <Icon name="basura" size={16} />
              </IconButton>
            </td>
          </tr>
        ))}
      </Table>
      {!shown.length && <p className="text-sm text-crema/60">{who ? `Nada apuntado de ${who}.` : "Aún no hay material apuntado."}</p>}
      <Button size="sm" className="self-start h-11" onClick={add}>+ material{who ? ` de ${who}` : ""}</Button>
    </Card>
  );
}

/** Lo apuntado en los riders, sin repetir (mismo material y mismo dueño). */
function fromRiders(all: RiderGear[]) {
  const seen = new Set<string>();
  return all.filter(g => {
    const k = `${g.item.trim().toLowerCase()}|${g.owner.trim().toLowerCase()}`;
    if (!g.item.trim() || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map(g => ({ ...g, id: uid("g") }));
}
