/* Nota de voz: grabar con el micro y que nazca una idea nueva con
   su demo v1. El audio queda solo en esta pestaña hasta que haya backend. */
import { useEffect, useRef, useState } from "react";
import { api, uid } from "@/data/api";
import type { Idea } from "@/data/types";
import { useMe } from "@/suite/session";
import { Button, Sheet, useToast } from "@/components/ui";
import { dateShort } from "@/lib/format";
import { fmtTime, rememberDemoUrl } from "./audio";

export function VoiceNote({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { me } = useMe();
  const toast = useToast();
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const keep = useRef(false);
  const [state, setState] = useState<"listo" | "pidiendo" | "grabando">("listo");
  const [secs, setSecs] = useState(0);

  const release = () => { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; };

  useEffect(() => {
    if (state !== "grabando") return;
    const t = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  // Cerrar a mitad descarta la grabación y suelta el micro.
  useEffect(() => {
    if (open) return;
    keep.current = false;
    if (rec.current?.state === "recording") rec.current.stop();
    release();
    setState("listo"); setSecs(0);
  }, [open]);

  async function start() {
    setState("pidiendo");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      const r = new MediaRecorder(s);
      chunks.current = [];
      r.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => { release(); if (keep.current) void save(new Blob(chunks.current, { type: r.mimeType || "audio/webm" })); };
      rec.current = r;
      keep.current = true;
      r.start();
      setSecs(0);
      setState("grabando");
    } catch {
      setState("listo");
      toast("Sin permiso para el micro. Actívalo en el navegador.", "error");
    }
  }

  async function save(blob: Blob) {
    const today = new Date().toISOString().slice(0, 10);
    const demo = { id: uid("d"), version: 1, by: me.name, date: today };
    rememberDemoUrl(demo.id, URL.createObjectURL(blob));
    const idea: Idea = {
      id: uid("i"), title: `nota de voz · ${dateShort(today)}`, status: "idea", author: me.name,
      lyrics: "", sections: [], demos: [demo], comments: [], updatedAt: new Date().toISOString(),
    };
    await api.insert("ideas", idea);
    toast("Nota de voz guardada como idea", "ok");
    setState("listo");
    onCreated(idea.id);
  }

  return (
    <Sheet open={open} onClose={onClose} title="nota de voz" width={420}>
      <div className="flex flex-col items-center gap-5 py-6 text-center">
        <span className="font-mono text-[44px] leading-none" aria-live="polite">{fmtTime(secs)}</span>
        <span className="flex items-center gap-2 text-sm text-crema/70">
          {state === "grabando" && <span className="size-2.5 rounded-full bg-error animate-pulse" />}
          {state === "grabando" ? "grabando…" : state === "pidiendo" ? "pidiendo el micro…" : "tararea, canta o toca: sale una idea nueva"}
        </span>
        {state === "grabando"
          ? <Button variant="light" size="lg" onClick={() => rec.current?.stop()}>parar y guardar</Button>
          : <Button variant="primary" size="lg" onClick={start} disabled={state === "pidiendo"}>● empezar a grabar</Button>}
        <p className="text-xs text-crema/55 max-w-xs">El audio se queda en este navegador hasta que llegue el backend.</p>
      </div>
    </Sheet>
  );
}
