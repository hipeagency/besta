/* Foto del producto: la que sale en la web, en la suite y en el pago de
   Stripe. Se reduce en el navegador antes de subirla (lado largo 1400 px,
   JPEG) para que pese poco y no se coma el almacenamiento gratis. Va al
   bucket público «web»: la web la enseña sin pedir permiso. */
import { useState } from "react";
import { api } from "@/data/api";
import type { Product } from "@/data/types";
import { useToast } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { cx } from "@/lib/format";
import { swatch } from "./shared";

const MAX_SIDE = 1400;

async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * k);
    canvas.height = Math.round(bmp.height * k);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff";   // los PNG transparentes no quedan en negro
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const out = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/jpeg", 0.85));
    return out && out.size < file.size ? out : file;
  } catch {
    return file;   // HEIC en navegadores que no lo leen, etc.: se sube tal cual
  }
}

export async function uploadProductPhoto(file: File) {
  const blob = await shrink(file);
  const name = file.name.replace(/\.[^.]+$/, "") || "producto";
  return api.uploadFile("web", new File([blob], `merch-${name}.jpg`, { type: blob.type || "image/jpeg" }));
}

/** Miniatura: la foto o, sin foto, el color de la ficha. */
export function ProductThumb({ p, className }: { p: Pick<Product, "image" | "color" | "name">; className?: string }) {
  return p.image
    ? <img src={p.image} alt="" loading="lazy" className={cx("object-cover bg-noche", className)} />
    : <span className={cx(swatch[p.color], className)} aria-hidden="true" />;
}

/** Elegir, cambiar o quitar la foto. `onChange` recibe la URL pública (o undefined al quitarla). */
export function PhotoPicker({ value, onChange, color = "tubo" }: { value?: string; onChange: (url: string | undefined) => void; color?: Product["color"] }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function pick(f: File | undefined) {
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) { toast("La foto pesa demasiado (máx. 25 MB)", "error"); return; }
    setBusy(true);
    try { onChange(await uploadProductPhoto(f)); }
    catch (e) { toast(`No se ha podido subir la foto: ${(e as Error).message}`, "error"); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex items-center gap-4">
      <label className={cx("relative shrink-0 w-[104px] aspect-[4/5] rounded-2xl overflow-hidden cursor-pointer grid place-items-center", !value && "border border-dashed border-crema/30", busy && "opacity-60")}>
        {value ? <img src={value} alt="Foto del producto" className="absolute inset-0 size-full object-cover" />
          : <span className={cx("absolute inset-0 opacity-40", swatch[color])} aria-hidden="true" />}
        {!value && <span className="relative"><Icon name="camara" /></span>}
        <input type="file" accept="image/*" className="sr-only" disabled={busy} aria-label={value ? "Cambiar foto" : "Subir foto"}
          onChange={e => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      <div className="flex flex-col gap-1 text-sm">
        <b className="font-semibold">{busy ? "subiendo…" : value ? "foto del producto" : "añadir foto"}</b>
        <span className="text-crema/65">{value ? "toca la foto para cambiarla" : "la que sale en la web y en el pago · mejor vertical (4:5)"}</span>
        {value && !busy && <button type="button" onClick={() => onChange(undefined)} className="self-start h-9 text-crema/70 hover:text-crema underline">quitar foto</button>}
      </div>
    </div>
  );
}
