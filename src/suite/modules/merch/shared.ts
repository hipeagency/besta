/* Lo que comparten merch y el modo puesto. */
import type { MerchMove, MoveKind, PayMethod, Product, Variant } from "@/data/types";

/* El «color» del producto, solo con los cuatro de la marca. Sobre tubo, el tubo es marco. */
export const swatch: Record<Product["color"], string> = {
  senal: "bg-senal text-noche",
  crema: "bg-crema text-noche",
  tubo: "bg-marco text-crema",
  noche: "bg-noche text-crema border border-crema/12",
};

export const LOW = 3;
export const PAYMENTS: PayMethod[] = ["efectivo", "bizum", "tarjeta"];

export const KIND_LABEL: Record<MoveKind, string> = {
  venta: "venta", reserva: "reserva", regalo: "regalo", reposicion: "reposición", recuento: "recuento",
};

/** «camiseta tele M», «gorra besta» */
export const itemName = (p: Product | undefined, v: Variant | undefined) =>
  `${p?.name ?? "producto borrado"}${v?.label ? " " + v.label : ""}`;

export const sizeLabel = (v: Variant, p: Product) => v.label || (p.variants.length === 1 ? "única" : "—");

/** Importe de una venta (qty viene en negativo). */
export const moveCents = (m: MerchMove) => -m.qty * m.unitCents;
