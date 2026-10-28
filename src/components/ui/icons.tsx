/* Iconos de trazo, 20×20, heredan el color del texto. */
import type { SVGProps } from "react";

const paths = {
  inicio: "M3 9l7-6 7 6v8H3z",
  bolos: "M3 5h14v12H3zM3 9h14M7 3v4M13 3v4",
  entradas: "M3 6h14v3a2 2 0 000 4v3H3v-3a2 2 0 000-4zM12 6v10",
  ensayos: "M8 15V4l9-2v11M8 15a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM17 13a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z",
  composicion: "M4 16l1-4L14 3l3 3-9 9zM12 5l3 3",
  rider: "M5 2h7l4 4v12H5zM12 2v4h4M8 10h5M8 13h5",
  visuales: "M2 5h16v10H2zM7 18h6M10 15v3",
  puerta: "M3 3h5v5H3zM12 3h5v5h-5zM3 12h5v5H3zM12 12h2v2h-2zM16 16h1v1h-1zM12 16h1",
  presupuestos: "M5 2h10v16l-2-1.5L11 18l-2-1.5L7 18l-2-1.5zM8 7h4M8 10h4",
  merch: "M6 3l-4 3 2 3 2-1v9h8V8l2 1 2-3-4-3c-.5 1.5-2 2.5-4 2.5S6.5 4.5 6 3z",
  finanzas: "M3 6h14v10H3zM3 9h14M13 13h2",
  mas: "M4 10h.01M10 10h.01M16 10h.01",
  buscar: "M8.5 15a6.5 6.5 0 100-13 6.5 6.5 0 000 13zM13.5 13.5L18 18",
  play: "M6 4l10 6-10 6z",
  pause: "M6 4h3v12H6zM11 4h3v12h-3z",
  flecha: "M4 10h12M11 5l5 5-5 5",
  atras: "M16 10H4M9 5l-5 5 5 5",
  mas_add: "M10 4v12M4 10h12",
  check: "M4 10l4 4 8-8",
  x: "M5 5l10 10M15 5L5 15",
  camara: "M3 6h3l2-2h4l2 2h3v10H3zM10 14a3 3 0 100-6 3 3 0 000 6z",
  linterna: "M11 2L4 11h5l-1 7 7-9h-5z",
  editar: "M4 16l1-4 8-8 3 3-8 8zM11 6l3 3",
  copiar: "M7 7h9v9H7zM4 13V4h9",
  descargar: "M10 3v10M6 9l4 4 4-4M4 17h12",
  enviar: "M3 10l14-7-5 14-2-6z",
  telefono: "M5 3h3l1.5 4-2 1.5a10 10 0 004 4l1.5-2 4 1.5v3a1 1 0 01-1 1A14 14 0 014 4a1 1 0 011-1z",
  mapa: "M10 18s6-5.5 6-10a6 6 0 10-12 0c0 4.5 6 10 6 10zM10 10a2 2 0 100-4 2 2 0 000 4z",
  salir: "M8 4H4v12h4M12 6l4 4-4 4M16 10H8",
  reloj: "M10 18a8 8 0 100-16 8 8 0 000 16zM10 6v4l3 2",
  arrastrar: "M7 5h.01M13 5h.01M7 10h.01M13 10h.01M7 15h.01M13 15h.01",
  microfono: "M10 2a3 3 0 00-3 3v5a3 3 0 006 0V5a3 3 0 00-3-3zM5 10a5 5 0 0010 0M10 15v3",
  subir: "M10 17V7M6 11l4-4 4 4M4 3h12",
  usuarios: "M7.5 9a3 3 0 100-6 3 3 0 000 6zM2 17c0-3 2.5-5 5.5-5s5.5 2 5.5 5M13.5 3.5a3 3 0 010 5.5M15 12.2c1.8.6 3 2.3 3 4.8",
  basura: "M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.7}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={paths[name]} />
    </svg>
  );
}
