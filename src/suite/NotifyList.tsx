/* Avisar a la lista: bolo, merch o canción nueva. Se escribe el email
   (con un texto ya propuesto), se manda una prueba a uno mismo y luego
   la campaña a quien eligió ese interés en la web. */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/data/api";
import type { NewsInput, Topic } from "@/data/types";
import { Button, Field, Input, Modal, Textarea, useToast } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { useMe } from "./session";

export const TOPIC_LABEL: Record<Topic, string> = { fechas: "conciertos", merch: "merch", lanzamientos: "canciones nuevas" };

export function useNewsStats(enabled = true) {
  return useQuery({ queryKey: ["newsletter"], queryFn: () => api.newsletterStats(), enabled, staleTime: 60e3, retry: 0 });
}

/* Botón que abre el aviso con un borrador ya escrito. */
export function NotifyButton({ draft, label = "avisar a la lista", size = "md" }: { draft: NewsInput; label?: string; size?: "sm" | "md" }) {
  const { me } = useMe();
  const [open, setOpen] = useState(false);
  if (me.role !== "admin") return null;
  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}><Icon name="nota" size={16} />{label}</Button>
      {open && <NotifyList draft={draft} onClose={() => setOpen(false)} />}
    </>
  );
}

export function NotifyList({ draft, onClose }: { draft: NewsInput; onClose: () => void }) {
  const { me } = useMe();
  const toast = useToast();
  const stats = useNewsStats();
  const [d, setD] = useState<NewsInput>(draft);
  const [busy, setBusy] = useState<"" | "prueba" | "envio">("");
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setD(draft), [draft]);
  const set = <K extends keyof NewsInput>(k: K, v: NewsInput[K]) => { setD(x => ({ ...x, [k]: v })); setConfirm(false); };
  const n = stats.data?.byTopic[d.topic];

  async function run(kind: "prueba" | "envio") {
    setBusy(kind);
    try {
      if (kind === "prueba") {
        await api.newsletterSend(d, me.email);
        toast(`Prueba enviada a ${me.email}`, "ok");
      } else {
        const r = await api.newsletterSend(d);
        toast(`Aviso enviado a ${r.recipients ?? n} personas`, "ok");
        stats.refetch();
        onClose();
      }
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy("");
    }
  }

  return (
    <Modal open onClose={onClose} title={`avisar de ${TOPIC_LABEL[d.topic]}`}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-crema/75">
          {stats.isPending ? "contando la lista…"
            : stats.error ? `No se ha podido leer la lista: ${(stats.error as Error).message}`
            : <>Le llega a <b className="text-crema">{n} {n === 1 ? "persona" : "personas"}</b> que pidieron avisos de {TOPIC_LABEL[d.topic]} (de {stats.data!.total} en la lista).</>}
        </p>
        <Field label="asunto">{id => <Input id={id} value={d.subject} maxLength={120} onChange={e => set("subject", e.target.value)} />}</Field>
        <Field label="titular">{id => <Input id={id} value={d.title} maxLength={120} onChange={e => set("title", e.target.value)} />}</Field>
        <Field label="texto" hint="Una línea en blanco separa párrafos.">{id => <Textarea id={id} rows={5} value={d.body} maxLength={2000} onChange={e => set("body", e.target.value)} />}</Field>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-3">
          <Field label="botón">{id => <Input id={id} value={d.ctaLabel ?? ""} maxLength={40} onChange={e => set("ctaLabel", e.target.value)} />}</Field>
          <Field label="enlace del botón">{id => <Input id={id} value={d.ctaUrl ?? ""} onChange={e => set("ctaUrl", e.target.value)} />}</Field>
        </div>
        <Field label="imagen (opcional)" hint="https://… o una de la web, como /img/escenario-azul.jpg">{id => <Input id={id} value={d.image ?? ""} onChange={e => set("image", e.target.value)} />}</Field>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={() => run("prueba")} disabled={!!busy || !me.email}>{busy === "prueba" ? "enviando…" : "mandarme una prueba"}</Button>
          {!confirm
            ? <Button variant="primary" onClick={() => setConfirm(true)} disabled={!!busy || !n}>enviar a la lista</Button>
            : <Button variant="primary" onClick={() => run("envio")} disabled={!!busy}>{busy === "envio" ? "enviando…" : `sí, enviar a ${n}`}</Button>}
        </div>
        {confirm && <p className="text-xs text-crema/65">Se envía al momento y no se puede deshacer.</p>}
      </div>
    </Modal>
  );
}
