/* Alta de un producto, todo en un formulario: foto, nombre, precio,
   coste, tallas con las unidades que llegan y si sale en la web.
   Nada se guarda hasta «crear». Las unidades iniciales se apuntan como
   una reposición al coste (así cuentan en lo invertido). */
import { useState } from "react";
import { useMe } from "@/suite/session";
import { useAction } from "@/data/hooks";
import { api, uid } from "@/data/api";
import type { Product, WebMode } from "@/data/types";
import { Button, Field, IconButton, Input, Segmented, Sheet, Textarea, Toggle, useToast } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { MoneyInput } from "../presupuestos/money";
import { PhotoPicker } from "./Photo";
import { eur } from "@/lib/format";

type Row = { id: string; label: string; qty: number };
const PRESETS: { label: string; sizes: string[] }[] = [
  { label: "talla única", sizes: [""] },
  { label: "S · M · L · XL", sizes: ["S", "M", "L", "XL"] },
  { label: "XS – XXL", sizes: ["XS", "S", "M", "L", "XL", "XXL"] },
];

export function NewProduct({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { me } = useMe();
  const toast = useToast();
  const [image, setImage] = useState<string | undefined>();
  const [name, setName] = useState("");
  const [price, setPrice] = useState(0);
  const [cost, setCost] = useState(0);
  const [info, setInfo] = useState("");
  const [color, setColor] = useState<Product["color"]>("tubo");
  const [rows, setRows] = useState<Row[]>([{ id: uid("v-"), label: "", qty: 0 }]);
  const [published, setPublished] = useState(false);
  const [webMode, setWebMode] = useState<WebMode>("reservar");

  const reset = () => {
    setImage(undefined); setName(""); setPrice(0); setCost(0); setInfo(""); setColor("tubo");
    setRows([{ id: uid("v-"), label: "", qty: 0 }]); setPublished(false); setWebMode("reservar");
  };
  const close = () => { reset(); onClose(); };
  const units = rows.reduce((s, r) => s + r.qty, 0);
  const sized = rows.length > 1 || !!rows[0]?.label;

  const create = useAction(async () => {
    const p: Product = {
      id: uid("p-"), name: name.trim(), priceCents: price, costCents: cost, color, archived: false, published,
      ...(published ? { webMode } : {}), ...(info.trim() ? { info: info.trim() } : {}), ...(image ? { image } : {}),
      variants: rows.map(r => ({ id: r.id, label: r.label.trim(), stock: 0 })),
    };
    await api.insert("products", p);
    for (const r of rows.filter(x => x.qty > 0))
      await api.moveStock({ productId: p.id, variantId: r.id, kind: "reposicion", qty: r.qty, unitCents: cost, by: me.name, note: "stock inicial" });
    return p;
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast("Ponle nombre", "error"); return; }
    if (price <= 0) { toast("Ponle precio de venta", "error"); return; }
    if (sized && rows.some(r => !r.label.trim())) { toast("Pon nombre a cada talla (o deja una sola, «talla única»)", "error"); return; }
    const labels = rows.map(r => r.label.trim().toLowerCase());
    if (new Set(labels).size !== labels.length) { toast("Hay dos tallas con el mismo nombre", "error"); return; }
    try {
      const p = await create.run();
      toast(`${p.name} creado${units ? ` con ${units} ud` : ""}`, "ok");
      reset();
      onCreated(p.id);
    } catch (err) { toast((err as Error).message, "error"); }
  }

  const setRow = (id: string, patch: Partial<Row>) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <Sheet open={open} onClose={close} title="nuevo producto" width={520}>
      <form onSubmit={submit} className="flex flex-col gap-5 pt-1">
        <PhotoPicker value={image} onChange={setImage} color={color} />

        <Field label="nombre">{id => <Input id={id} autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="camiseta tele, tote bag, vinilo…" />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="precio de venta €">{id => <MoneyInput id={id} cents={price} onValue={setPrice} />}</Field>
          <Field label="coste por unidad €" hint={price && cost ? `margen ${eur(price - cost)}` : "lo que os cuesta a vosotros"}>{id => <MoneyInput id={id} cents={cost} onValue={setCost} />}</Field>
        </div>
        <Field label="descripción (opcional)">{id => <Textarea id={id} rows={2} value={info} onChange={e => setInfo(e.target.value)} placeholder="algodón orgánico, serigrafía a dos tintas…" />}</Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[13px] text-crema/75 mb-1.5">tallas y unidades que tenéis</legend>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(pr => (
              <Button key={pr.label} type="button" size="sm" onClick={() => setRows(pr.sizes.map(l => ({ id: uid("v-"), label: l, qty: rows.find(r => r.label === l)?.qty ?? 0 })))}>{pr.label}</Button>
            ))}
          </div>
          <ul className="flex flex-col gap-1.5 mt-1">
            {rows.map(r => (
              <li key={r.id} className="flex items-center gap-2">
                <Input aria-label="Talla" value={r.label} placeholder={rows.length === 1 ? "única" : "talla"} onChange={e => setRow(r.id, { label: e.target.value })} className="flex-1" />
                <Input aria-label={`Unidades ${r.label || "única"}`} type="number" inputMode="numeric" min={0} value={r.qty || ""} placeholder="0 ud"
                  onChange={e => setRow(r.id, { qty: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} className="w-24 font-mono" />
                <IconButton label={`Quitar talla ${r.label}`} disabled={rows.length === 1} onClick={() => setRows(rs => rs.filter(x => x.id !== r.id))} className="text-crema/60">
                  <Icon name="x" size={16} />
                </IconButton>
              </li>
            ))}
          </ul>
          <Button type="button" size="sm" className="self-start border-dashed" onClick={() => setRows(rs => [...rs, { id: uid("v-"), label: "", qty: 0 }])}>+ talla</Button>
          <p className="text-xs text-crema/55">{units ? `Se apuntan ${units} ud como reposición${cost ? ` (${eur(units * cost)} invertido)` : ""}.` : "Sin unidades: lo creas vacío y repones cuando llegue."}</p>
        </fieldset>

        {!image && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] text-crema/75">color de la ficha (sin foto)</span>
            <Segmented size="sm" value={color} onChange={setColor} className="self-start"
              options={(["senal", "crema", "tubo", "noche"] as const).map(c => ({ value: c, label: c === "senal" ? "señal" : c }))} />
          </div>
        )}

        <div className="flex flex-col gap-2 rounded-2xl bg-noche p-4">
          <Toggle checked={published} onChange={setPublished} label="visible en la web" />
          {published && (
            <>
              <Segmented size="sm" value={webMode} onChange={setWebMode} className="self-start"
                options={[{ value: "reservar", label: "solo reservar" }, { value: "comprar", label: "comprar online" }]} />
              <p className="text-xs text-crema/55">{webMode === "comprar" ? "Se paga con tarjeta al momento (Stripe)." : "Lo piden desde la web y se paga al recogerlo."}</p>
            </>
          )}
        </div>

        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={create.pending}>{create.pending ? "creando…" : "crear producto"}</Button>
          <Button type="button" onClick={close}>cancelar</Button>
        </div>
      </form>
    </Sheet>
  );
}
