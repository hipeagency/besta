/* Puerta: el escáner de acceso. Pantalla completa, fuera del marco
   de la suite. Escanea, mira el color, deja pasar. Legible a dos
   metros y con una mano. Varios móviles a la vez: el check-in es
   atómico en la API, una entrada solo la acepta el primero. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import jsQR from "jsqr";
import { useMe } from "@/suite/session";
import { useCollection } from "@/data/hooks";
import { api } from "@/data/api";
import { eventStats } from "@/data/selectors";
import type { Gig, ScanResult, TicketEvent } from "@/data/types";
import { Button, Input, Pill, Sheet, useToast } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { cx, dateLabel, dateShort, daysUntil, hhmm, isPast, maskEmail } from "@/lib/format";
import { kindLabel, ticketState } from "./entradas/shared";

export default function Puerta() {
  const { eventId } = useParams();
  const { data: events, loading } = useCollection("events");
  const { data: gigs } = useCollection("gigs");

  if (loading) return <div className="fixed inset-0 bg-noche grid place-items-center text-crema/60">cargando…</div>;
  const ev = eventId ? events.find(e => e.id === eventId) : undefined;
  if (!ev) return <PickEvent missing={!!eventId} />;
  return <Scanner key={ev.id} ev={ev} gig={gigs.find(g => g.id === ev.gigId)} />;
}

/* Volver a la suite, o salir del todo si quien escanea es personal de puerta. */
function Exit({ className }: { className?: string }) {
  const { me, logout } = useMe();
  if (me.role === "staff") {
    return (
      <button type="button" onClick={logout} className={cx("h-11 px-3.5 rounded-full border-[1.5px] border-crema/25 flex items-center gap-2 text-sm shrink-0", className)}>
        <Icon name="salir" size={16} />salir
      </button>
    );
  }
  return (
    <Link to="/" aria-label="Volver a la suite" title="Volver a la suite"
      className={cx("size-11 rounded-full grid place-items-center hover:bg-crema/10 shrink-0", className)}>
      <Icon name="atras" />
    </Link>
  );
}

// ---------- elegir evento ----------
function PickEvent({ missing }: { missing: boolean }) {
  const { data: events } = useCollection("events");
  const { data: gigs } = useCollection("gigs");
  const rows = events
    .map(ev => ({ ev, g: gigs.find(g => g.id === ev.gigId) }))
    .filter((r): r is { ev: TicketEvent; g: Gig } => !!r.g)
    .sort((a, b) => a.g.date.localeCompare(b.g.date));
  const upcoming = rows.filter(r => !isPast(r.g.date));
  const list = upcoming.length ? upcoming : [...rows].reverse();

  return (
    <div className="min-h-dvh bg-noche text-crema flex flex-col">
      <header className="flex items-center gap-3 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3">
        <Exit />
        <p className="font-bold text-lg">puerta</p>
      </header>
      <main className="flex-1 w-full max-w-[560px] mx-auto px-4 pb-10 flex flex-col gap-5">
        <div>
          <h1 className="text-[40px] font-extrabold tracking-[-.035em] leading-none">¿qué concierto?</h1>
          <p className="mt-2 text-crema/70">{missing ? "Ese evento ya no existe. Elige otro." : "Elige el evento y empieza a escanear."}</p>
        </div>
        {!list.length && <p className="rounded-2xl bg-tubo p-5 text-crema/70">No hay eventos con entradas propias.</p>}
        <ul className="flex flex-col gap-2">
          {list.map(({ ev, g }) => {
            const d = daysUntil(g.date);
            const today = d === 0;
            return (
              <li key={ev.id}>
                <Link to={`/puerta/${ev.id}`}
                  className={cx("flex items-center gap-4 rounded-[20px] p-5 min-h-[84px] transition", today ? "bg-senal text-noche" : "bg-tubo hover:bg-tubo-alto")}>
                  <span className="flex-1 min-w-0">
                    <span className={cx("block font-mono text-xs tracking-wider", today ? "text-noche/75" : "text-crema/65")}>
                      {today ? "HOY" : dateLabel(g.date)} · {g.doors ? `PUERTAS ${g.doors}` : g.time}
                    </span>
                    <span className="block text-2xl font-bold tracking-[-.02em] truncate">{g.city}</span>
                    <span className={cx("block text-sm truncate", today ? "text-noche/75" : "text-crema/65")}>{g.venue}</span>
                  </span>
                  <Icon name="flecha" size={22} />
                </Link>
              </li>
            );
          })}
        </ul>
        {!upcoming.length && !!rows.length && <p className="text-sm text-crema/55">No hay conciertos próximos: se muestran los pasados.</p>}
      </main>
    </div>
  );
}

// ---------- escáner ----------
type CamState = "starting" | "on" | "denied" | "unavailable" | "error";
type Shown = { r: ScanResult; code: string; at: string };

interface Detector { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> }
interface DetectorCtor { new(o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> }

const OK_MS = 2200;
const DENY_MS = 3500;   // lo rojo se lee con más calma
const SAME_CODE_MS = 3000;

function Scanner({ ev, gig }: { ev: TicketEvent; gig?: Gig }) {
  const { me } = useMe();
  const toast = useToast();
  const { data: orders } = useCollection("orders");
  const { data: tickets } = useCollection("tickets");
  const s = eventStats(ev, { orders, tickets });

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const genRef = useRef(0);
  const [cam, setCam] = useState<CamState>("starting");
  const [torch, setTorch] = useState<boolean | null>(null);   // null: la cámara no tiene linterna
  const [shown, setShown] = useState<Shown | null>(null);
  const [sheet, setSheet] = useState<null | "codigo" | "email">(null);

  // el bucle de lectura vive fuera de React: lee estas refs
  const pausedRef = useRef(false);
  pausedRef.current = !!shown || !!sheet;
  const busyRef = useRef(false);
  const lastRef = useRef({ code: "", t: 0 });

  // ---- sonido y vibración ----
  const audioRef = useRef<AudioContext | null>(null);
  const unlockAudio = () => {
    try {
      if (!audioRef.current) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AC) audioRef.current = new AC();
      }
      if (audioRef.current?.state === "suspended") void audioRef.current.resume();
    } catch { /* sin audio */ }
  };
  useEffect(() => () => { void audioRef.current?.close().catch(() => {}); }, []);

  const feedback = (ok: boolean) => {
    try { navigator.vibrate?.(ok ? 90 : [200, 90, 200, 90, 200]); } catch { /* sin vibración */ }
    const ac = audioRef.current;
    if (!ac || ac.state !== "running") return;
    const tone = (freq: number, at: number, dur: number, type: OscillatorType) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.22, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g).connect(ac.destination);
      o.start(at); o.stop(at + dur + 0.02);
    };
    const t = ac.currentTime;
    if (ok) tone(1320, t, 0.14, "sine");
    else { tone(330, t, 0.18, "square"); tone(220, t + 0.2, 0.3, "square"); }
  };

  // ---- comprobar un código ----
  const handle = async (raw: string, fromCamera: boolean) => {
    const code = raw.trim().toUpperCase();
    if (!code) return;
    if (fromCamera) {
      const now = Date.now();
      const same = lastRef.current.code === code && now - lastRef.current.t < SAME_CODE_MS;
      lastRef.current = { code, t: now };   // ventana deslizante: si sigue delante, no se relee
      if (same) return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const r = await api.scan(code, ev.id, me.name);
      feedback(r.ok);
      setShown({ r, code: r.ticket?.code ?? code.replace(/^BESTA:T:/, ""), at: new Date().toISOString() });
    } catch {
      toast("No se pudo comprobar. Prueba otra vez.", "error");
    } finally {
      busyRef.current = false;
    }
  };
  const handleRef = useRef(handle);
  handleRef.current = handle;

  const next = useCallback(() => {
    setShown(null);
    lastRef.current = { ...lastRef.current, t: Date.now() };
  }, []);

  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(next, shown.r.ok ? OK_MS : DENY_MS);
    return () => clearTimeout(t);
  }, [shown, next]);

  // ---- cámara ----
  const stopCam = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const start = useCallback(async () => {
    const gen = ++genRef.current;
    stopCam();
    setTorch(null);
    if (!navigator.mediaDevices?.getUserMedia) { setCam("unavailable"); return; }
    setCam("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      if (gen !== genRef.current) { stream.getTracks().forEach(t => t.stop()); return; }   // desmontado o reintentado
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) { v.srcObject = stream; await v.play().catch(() => {}); }
      const track = stream.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
      setTorch(caps?.torch ? false : null);
      setCam("on");
    } catch (e) {
      if (gen !== genRef.current) return;
      const name = (e as { name?: string })?.name;
      setCam(name === "NotAllowedError" || name === "SecurityError" ? "denied"
        : name === "NotFoundError" || name === "OverconstrainedError" ? "unavailable" : "error");
    }
  }, []);

  useEffect(() => {
    void start();
    return () => { genRef.current++; stopCam(); };
  }, [start]);

  // el móvil bloqueado mata la cámara: al volver, se reengancha
  useEffect(() => {
    const h = () => {
      if (document.visibilityState !== "visible") return;
      const track = streamRef.current?.getVideoTracks()[0];
      if (!track || track.readyState === "ended") void start();
    };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, [start]);

  // bucle de lectura, ~6 por segundo
  useEffect(() => {
    if (cam !== "on") return;
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let detector: Detector | null = null;
    let stop = false, inflight = false;

    const BD = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    if (BD) {
      (async () => {
        try {
          const formats = await BD.getSupportedFormats?.();
          if (!formats || formats.includes("qr_code")) detector = new BD({ formats: ["qr_code"] });
        } catch { detector = null; }
      })();
    }

    const id = setInterval(async () => {
      if (stop || inflight || pausedRef.current || busyRef.current || video.readyState < 2) return;
      inflight = true;
      try {
        let text: string | null = null;
        if (detector) {
          try { text = (await detector.detect(video))[0]?.rawValue ?? null; }
          catch { detector = null; }   // falla el nativo: seguimos con jsQR
        } else if (ctx && video.videoWidth) {
          const k = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
          const w = Math.round(video.videoWidth * k), h = Math.round(video.videoHeight * k);
          if (canvas.width !== w) canvas.width = w;
          if (canvas.height !== h) canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          text = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" })?.data ?? null;
        }
        if (text && !stop && !pausedRef.current) await handleRef.current(text, true);
      } finally {
        inflight = false;
      }
    }, 166);
    return () => { stop = true; clearInterval(id); };
  }, [cam]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch { setTorch(null); }
  };

  const place = gig ? `${dateShort(gig.date).toUpperCase()} · ${gig.city.toUpperCase()}` : ev.name.toUpperCase();

  return (
    <div className="fixed inset-0 bg-black text-crema flex flex-col select-none" onPointerDown={unlockAudio}>
      {/* barra de arriba */}
      <header className="relative z-10 flex items-center gap-2 px-3 pt-[max(10px,env(safe-area-inset-top))] pb-2.5 bg-noche">
        <Exit />
        <Link to="/puerta" className="flex-1 min-w-0 rounded-xl px-1.5 py-0.5" aria-label={`${place}. Cambiar de evento`}>
          <span className="block font-mono text-[11px] text-crema/70 truncate">{place}</span>
          <span className="block font-bold text-lg leading-tight">puerta <span className="font-normal text-sm text-crema/55">· cambiar</span></span>
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 bg-crema/10 font-mono text-[13px] shrink-0"
          title="dentro / vendidas + invitaciones" aria-live="polite">
          <span className="size-2 rounded-full bg-ok" aria-hidden="true" />
          dentro {s.inside} / {s.sold + s.invites}
        </span>
      </header>

      {/* visor */}
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted autoPlay aria-hidden="true"
          className={cx("absolute inset-0 size-full object-cover", cam !== "on" && "invisible")} />
        {cam === "on" && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none" aria-hidden="true">
            <div className="absolute inset-0 shadow-[inset_0_0_0_9999px_rgba(15,11,8,.35)]" />
            <div className="relative size-[min(64vw,300px)]">
              <span className="absolute left-0 top-0 size-11 border-l-4 border-t-4 border-senal rounded-tl-[18px]" />
              <span className="absolute right-0 top-0 size-11 border-r-4 border-t-4 border-senal rounded-tr-[18px]" />
              <span className="absolute left-0 bottom-0 size-11 border-l-4 border-b-4 border-senal rounded-bl-[18px]" />
              <span className="absolute right-0 bottom-0 size-11 border-r-4 border-b-4 border-senal rounded-br-[18px]" />
              <span className="absolute left-3.5 right-3.5 top-1/2 h-0.5 bg-senal shadow-[0_0_16px_#E8662C] animate-pulse" />
            </div>
          </div>
        )}
        {cam !== "on" && <CamMessage cam={cam} onRetry={start} />}
      </div>

      {/* abajo, al alcance del pulgar */}
      <div className="relative z-10 px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] bg-noche flex flex-col gap-2.5">
        <p className="text-center text-[15px] text-crema/80" aria-live="polite">
          {cam === "on" ? "apunta al QR de la entrada" : "sin cámara: entra a mano"}
        </p>
        <div className="flex gap-2">
          <Button size="lg" variant={cam === "on" ? "ghost" : "primary"} className="flex-1 !px-3 !text-[15px]" onClick={() => setSheet("codigo")}>código a mano</Button>
          <Button size="lg" variant="ghost" className="flex-1 !px-3 !text-[15px]" onClick={() => setSheet("email")}>buscar por email</Button>
          {torch !== null && (
            <button type="button" onClick={toggleTorch} aria-pressed={torch} aria-label={torch ? "Apagar linterna" : "Encender linterna"}
              className={cx("size-14 shrink-0 rounded-full grid place-items-center border-[1.5px]", torch ? "bg-crema text-noche border-crema" : "border-crema/30")}>
              <Icon name="linterna" />
            </button>
          )}
        </div>
      </div>

      <CodeSheet open={sheet === "codigo"} onClose={() => setSheet(null)} onSubmit={c => { setSheet(null); void handle(c, false); }} />
      <EmailSheet open={sheet === "email"} onClose={() => setSheet(null)} ev={ev} onCheckIn={() => feedback(true)} />

      {shown && <Result shown={shown} ev={ev} onNext={next} />}
    </div>
  );
}

function CamMessage({ cam, onRetry }: { cam: CamState; onRetry: () => void }) {
  const text: Record<Exclude<CamState, "on">, { t: string; p: string }> = {
    starting: { t: "abriendo cámara…", p: "Si el móvil pregunta, dale permiso." },
    denied: { t: "sin permiso de cámara.", p: "Actívalo en los ajustes del navegador para esta web y vuelve a intentarlo. Mientras, entra los códigos a mano." },
    unavailable: { t: "no hay cámara.", p: "Este dispositivo no tiene cámara o el navegador no la deja usar. Entra los códigos a mano." },
    error: { t: "la cámara no arranca.", p: "Puede que otra app la esté usando. Ciérrala y vuelve a intentarlo." },
  };
  const m = text[cam as Exclude<CamState, "on">];
  return (
    <div className="absolute inset-0 grid place-items-center p-6 bg-noche">
      <div className="max-w-[340px] flex flex-col items-center text-center gap-3">
        <span className="size-16 rounded-full bg-tubo grid place-items-center text-crema/70"><Icon name="camara" size={28} /></span>
        <p className="text-[28px] font-extrabold tracking-[-.03em] leading-none" role={cam === "starting" ? undefined : "alert"}>{m.t}</p>
        <p className="text-crema/70">{m.p}</p>
        {cam !== "starting" && cam !== "unavailable" && <Button onClick={onRetry}>reintentar</Button>}
      </div>
    </div>
  );
}

// ---------- resultado ----------
function Result({ shown, ev, onNext }: { shown: Shown; ev: TicketEvent; onNext: () => void }) {
  const { me } = useMe();
  const { data: tickets } = useCollection("tickets");
  const { data: events } = useCollection("events");
  const { data: gigs } = useCollection("gigs");
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { btn.current?.focus(); }, []);

  const { r, code, at } = shown;
  const t = r.ticket;
  const who = t?.holder ?? (r.order ? maskEmail(r.order.email) : undefined);

  let title: string;
  let lines: ReactNode[] = [];
  if (r.ok) {
    title = "pasa.";
    const mates = t?.orderId ? tickets.filter(x => x.orderId === t.orderId) : [];
    const pos = mates.findIndex(x => x.code === t?.code);
    lines = [
      <>{t?.kind === "invitacion" ? "Invitación" : "Entrada general"}{mates.length > 1 && pos >= 0 ? ` · ${pos + 1} de ${mates.length}` : ""}</>,
      who,
    ];
  } else if (r.reason === "usada") {
    title = "ya usada.";
    lines = [
      t?.checkedInAt ? <>Entró a las <b className="font-mono">{hhmm(t.checkedInAt)}</b></> : "Ya entró.",
      t?.checkedInBy ? `escaneada por ${t.checkedInBy}` : undefined,
      who,
    ];
  } else if (r.reason === "cancelada") {
    title = "cancelada.";
    lines = ["Pedido devuelto o entrada anulada.", who];
  } else if (r.reason === "otro-evento") {
    title = "es de otro concierto.";
    const oe = events.find(e => e.id === t?.eventId);
    const og = gigs.find(g => g.id === oe?.gigId);
    lines = [og ? `Es para ${og.city} · ${dateShort(og.date)}.` : "Es para otro evento.", who];
  } else {
    title = "no existe.";
    lines = ["Ese código no es de una entrada de besta.", "Prueba a teclearlo o busca por email."];
  }

  const showOrder = !r.ok && me.role !== "staff" && r.order;

  return (
    <div role="alert" onClick={onNext}
      className={cx("fixed inset-0 z-40 flex flex-col justify-between gap-6 px-6 pt-[max(28px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))] text-noche anim-fade cursor-pointer",
        r.ok ? "bg-ok" : "bg-error")}>
      <span className="font-mono text-sm">{code} · {hhmm(at)}</span>
      <div className="flex flex-col gap-4 items-start max-w-[640px]">
        <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true" className="size-20 sm:size-24">
          <circle cx="48" cy="48" r="44" fill="none" stroke="currentColor" strokeWidth="6" />
          {r.ok
            ? <path d="M28 50l14 13 26-30" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            : <path d="M32 32l32 32M64 32L32 64" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />}
        </svg>
        <p className={cx("font-extrabold leading-[.86] tracking-[-.045em] break-words", title.length > 10 ? "text-[56px] sm:text-[88px]" : "text-[76px] sm:text-[120px]")}>{title}</p>
        <p className="text-lg sm:text-xl leading-snug">
          {lines.filter(Boolean).map((l, i) => <span key={i} className="block">{l}</span>)}
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full max-w-[640px]">
        <button ref={btn} type="button" onClick={e => { e.stopPropagation(); onNext(); }}
          className="h-14 rounded-full bg-noche text-crema font-semibold text-[17px] focus-visible:outline-noche">
          siguiente · toca o espera {Math.round((r.ok ? OK_MS : DENY_MS) / 1000)} s
        </button>
        {showOrder && (
          <Link to={`/entradas/${t?.eventId ?? ev.id}?q=${encodeURIComponent(r.order!.email)}`} onClick={e => e.stopPropagation()}
            className="h-12 rounded-full border-2 border-noche grid place-items-center font-medium">ver pedido</Link>
        )}
      </div>
    </div>
  );
}

// ---------- entrada a mano ----------
function CodeSheet({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (code: string) => void }) {
  const [v, setV] = useState("");
  useEffect(() => { if (open) setV(""); }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title="código a mano">
      <form className="flex flex-col gap-3 pt-1" onSubmit={e => {
        e.preventDefault();
        let c = v.trim().toUpperCase();
        if (!c) return;
        if (/^[A-Z0-9]{4}$/.test(c)) c = "BST-" + c;   // con las 4 últimas basta
        onSubmit(c);
      }}>
        <label htmlFor="puerta-codigo" className="text-[13px] text-crema/75">código de la entrada</label>
        <Input id="puerta-codigo" autoFocus autoComplete="off" autoCapitalize="characters" spellCheck={false}
          value={v} onChange={e => setV(e.target.value)} placeholder="BST-7K2Q" className="!h-14 font-mono text-2xl tracking-wider" />
        <p className="text-xs text-crema/55">Vale con las 4 letras después de «BST-». Las invitaciones empiezan por «INV-».</p>
        <Button type="submit" variant="primary" size="lg">comprobar</Button>
      </form>
    </Sheet>
  );
}

function EmailSheet({ open, onClose, ev, onCheckIn }: { open: boolean; onClose: () => void; ev: TicketEvent; onCheckIn: () => void }) {
  const { me } = useMe();
  const toast = useToast();
  const { data: orders } = useCollection("orders");
  const { data: tickets } = useCollection("tickets");
  const [q, setQ] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => { if (open) setQ(""); }, [open]);

  const n = q.trim().toLowerCase();
  const ready = n.length >= 3;
  const found = ready ? orders.filter(o => o.eventId === ev.id && o.status !== "caducado" && o.email.includes(n)).slice(0, 8) : [];
  const invites = ready ? tickets.filter(t => t.eventId === ev.id && t.kind === "invitacion" && t.holder?.toLowerCase().includes(n)) : [];
  const groups = [
    ...found.map(o => ({ key: o.id, title: o.email, sub: o.status === "pagado" ? `${o.qty} entr.` : o.status, list: tickets.filter(t => t.orderId === o.id) })),
    ...(invites.length ? [{ key: "inv", title: "invitaciones", sub: `${invites.length}`, list: invites }] : []),
  ];

  const checkIn = async (code: string) => {
    setPending(code);
    try {
      await api.checkInManual(code, me.name);
      onCheckIn();
      toast(`${code} dentro`, "ok");
    } finally { setPending(null); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="buscar por email">
      <div className="flex flex-col gap-4 pt-1">
        <label htmlFor="puerta-email" className="sr-only">Email o nombre de la invitación</label>
        <Input id="puerta-email" type="search" inputMode="email" autoFocus autoComplete="off" autoCapitalize="none" spellCheck={false}
          value={q} onChange={e => setQ(e.target.value)} placeholder="email o nombre de invitación" className="!h-14 text-lg" />
        {!ready && <p className="text-sm text-crema/60">Escribe al menos 3 letras.</p>}
        {ready && !groups.length && <p className="text-sm text-crema/60">Nada con «{q}» en este concierto.</p>}
        {groups.map(gr => (
          <section key={gr.key} className="flex flex-col gap-2">
            <p className="flex items-baseline justify-between gap-3">
              <span className="truncate">{gr.title}</span>
              <span className="font-mono text-xs text-crema/60 shrink-0">{gr.sub}</span>
            </p>
            <ul className="flex flex-col gap-2">
              {gr.list.map(t => {
                const ts = ticketState(t);
                return (
                  <li key={t.code} className="rounded-2xl bg-noche p-3 pl-4 flex items-center gap-3">
                    <span className="flex-1 min-w-0">
                      <span className="block font-mono text-lg">{t.code}</span>
                      <span className="block text-xs text-crema/60 truncate">{t.holder ?? kindLabel(t)}{t.checkedInAt ? ` · ${hhmm(t.checkedInAt)} · ${t.checkedInBy ?? ""}` : ""}</span>
                    </span>
                    {t.status === "valida"
                      ? <Button variant="primary" size="md" disabled={pending === t.code} onClick={() => checkIn(t.code)}>dentro</Button>
                      : <Pill tone={ts.tone === "senal" ? "senal" : ts.tone}>{ts.label}</Pill>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  );
}
