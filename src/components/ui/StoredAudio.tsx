/* <audio> para archivos guardados: resuelve los privados antes de reproducir. */
import { useFileUrl } from "@/data/hooks";

export function StoredAudio({ url, className, preload = "none" }: { url: string; className?: string; preload?: "none" | "metadata" }) {
  const src = useFileUrl(url);
  if (!src) return <span className="text-xs text-crema/55">cargando audio…</span>;
  return <audio controls preload={preload} src={src} className={className} />;
}
