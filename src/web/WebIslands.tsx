/* Lo interactivo de la web pública: compra de entradas, formulario
   de contratación y newsletter. La página es HTML estático; esto se
   engancha a los botones con data-tickets / data-contact. */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/data/api";
import type { Topic } from "@/data/types";
import { SubscribeForm } from "./Subscribe";
import { radioAudio } from "./content";
import Cookies from "./Cookies";
import { Button, Field, Input, Modal, Stepper, Textarea, ToastProvider } from "@/components/ui";
import { dateLabel, eur } from "@/lib/format";
import { Icon } from "@/components/ui/icons";

export interface IslandEvent {
  id: string; name: string; city: string; venue: string; date: string; time: string;
  priceCents: number; maxPerOrder: number; image: string;
}

export default function WebIslands({ events }: { events: IslandEvent[] }) {
  const [eventId, setEventId] = useState<string | null>(null);
  const [contact, setContact] = useState(false);
  const [avisame, setAvisame] = useState<Topic | null>(null);
  const [gallery, setGallery] = useState(false);
  const [nlSlot, setNlSlot] = useState<Element | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [radio, setRadio] = useState(false);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tickets],[data-avisame],[data-contact],[data-gallery],[data-radio]");
      if (!el) return;
      if (el.dataset.tickets) setEventId(el.dataset.tickets);
      else if (el.dataset.avisame) setAvisame(el.dataset.avisame as Topic);
      else if ("gallery" in el.dataset) setGallery(true);
      else if ("radio" in el.dataset) setRadio(true);
      else setContact(true);
    };
    document.addEventListener("click", onClick);
    setNlSlot(document.querySelector("[data-newsletter]"));
    // Vuelta del email de doble confirmación de Brevo (?suscrito=1).
    const url = new URL(location.href);
    if (url.searchParams.has("suscrito")) {
      setConfirmed(true);
      url.searchParams.delete("suscrito");
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    return () => document.removeEventListener("click", onClick);
  }, []);

  const ev = events.find(e => e.id === eventId) ?? null;

  return (
    <ToastProvider>
      {ev && <TicketDrawer ev={ev} onClose={() => setEventId(null)} />}
      <ContactModal open={contact} onClose={() => setContact(false)} />
      {gallery && <Gallery onClose={() => setGallery(false)} />}
      {nlSlot && createPortal(<SubscribeForm source="pie" compact />, nlSlot)}
      <Modal open={!!avisame} onClose={() => setAvisame(null)} title={avisame === "merch" ? "te avisamos del merch" : "te avisamos"} tone="crema">
        {avisame && <SubscribeForm key={avisame} source={`avisame-${avisame}`} tone="crema" />}
      </Modal>
      <Modal open={radio} onClose={() => setRadio(false)} title="besta en la radio">
        <p className="text-[15px] leading-relaxed mb-4">Nuestra entrevista en Ràdio Castelldefels 98.0 FM.</p>
        {radio && <audio src={radioAudio} controls autoPlay preload="none" className="w-full" />}
      </Modal>
      <Modal open={confirmed} onClose={() => setConfirmed(false)} title="¡confirmado!" tone="crema">
        <p className="text-[17px] leading-relaxed">Ya estás dentro. Te escribiremos solo cuando haya algo que contar: fechas nuevas, preventa y lanzamientos.</p>
      </Modal>
      <Cookies />
    </ToastProvider>
  );
}

// ---------- compra ----------
function TicketDrawer({ ev, onClose }: { ev: IslandEvent; onClose: () => void }) {
  const [qty, setQty] = useState(2);
  const [email, setEmail] = useState("");
  const [nl, setNl] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const [step, setStep] = useState<"form" | "paying">("form");
  const [error, setError] = useState("");

  useEffect(() => {
    api.availability(ev.id).then(setLeft).catch(() => setLeft(null));
  }, [ev.id]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", h); document.body.style.overflow = ""; };
  }, [onClose]);

  const max = Math.min(ev.maxPerOrder, left ?? ev.maxPerOrder);
  const soldOut = left === 0;

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      setStep("paying");
      const { redirectUrl } = await api.checkout({ eventId: ev.id, qty, email, newsletter: nl });
      // De verdad aquí se va a Stripe Checkout. De prueba, directo a «gracias».
      setTimeout(() => { window.location.href = redirectUrl; }, 900);
    } catch (err) {
      setStep("form");
      setError((err as Error).message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      <button type="button" aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-black/60 anim-fade" />
      <aside role="dialog" aria-modal="true" aria-label={`Comprar entradas para ${ev.name}`}
        className="relative w-full sm:w-[460px] max-h-[94dvh] sm:max-h-none sm:h-dvh overflow-y-auto bg-tubo rounded-t-3xl sm:rounded-none sm:border-l sm:border-crema/12 anim-sheet sm:anim-drawer flex flex-col">
        <div className="vig relative h-[150px] sm:h-[200px] shrink-0 overflow-hidden">
          <img src={ev.image} alt="" className="size-full object-cover" />
          <div className="scan absolute inset-0" />
          <button type="button" onClick={onClose} aria-label="Cerrar" className="absolute top-3.5 right-3.5 size-11 rounded-full bg-noche text-xl">×</button>
        </div>

        {step === "form" ? (
          <form onSubmit={pay} className="px-6 sm:px-7 pt-6 pb-8 flex flex-col gap-5">
            <div>
              <p className="font-mono text-[13px] tracking-wider text-senal mb-1.5">{dateLabel(ev.date)} · {ev.time}</p>
              <h2 className="text-[32px] sm:text-[34px] font-bold tracking-[-.02em] leading-none">besta en {ev.city}</h2>
              <p className="mt-1.5 text-crema/70">{ev.venue}</p>
            </div>

            {soldOut ? (
              <p className="rounded-2xl bg-crema text-noche p-4 font-semibold">Agotado. Apúntate a la newsletter y te avisamos si salen más.</p>
            ) : (
              <div className="flex items-center justify-between gap-3 p-4 rounded-[18px] border border-crema/15">
                <div>
                  <div className="font-semibold">Entrada general</div>
                  <div className="font-mono text-[13px] text-crema/70">{eur(ev.priceCents)}{left !== null && left <= 30 ? ` · quedan ${left}` : ""}</div>
                </div>
                <Stepper value={Math.min(qty, max)} onChange={setQty} max={max} />
              </div>
            )}

            <Field label="Email — aquí te llegan las entradas">
              {id => <Input id={id} type="email" required autoComplete="email" inputMode="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} className="h-[52px] bg-noche" />}
            </Field>

            <label className="flex gap-2.5 items-start text-sm leading-snug text-crema/80">
              <input type="checkbox" checked={nl} onChange={e => setNl(e.target.checked)} className="size-5 m-0 accent-senal shrink-0" />
              Quiero enterarme de próximos conciertos (opcional)
            </label>

            <div className="flex justify-between items-baseline pt-4 border-t border-crema/12">
              <span className="text-crema/80">Total · {qty} {qty === 1 ? "entrada" : "entradas"}</span>
              <span className="font-mono text-[30px]">{eur(ev.priceCents * Math.min(qty, max))}</span>
            </div>

            {error && <p role="alert" className="rounded-xl bg-crema text-noche px-4 py-3 text-sm">{error}</p>}

            <Button type="submit" variant="primary" size="lg" block disabled={soldOut}>pagar con tarjeta</Button>
            <p className="text-center text-[13px] leading-relaxed text-crema/65">
              Pago seguro con Stripe · Apple Pay · Google Pay<br />
              Al pagar aceptas las <a href="/legal/condiciones/" className="underline">condiciones de venta</a>
            </p>
          </form>
        ) : (
          <div className="px-7 py-12 flex flex-col gap-4 items-center text-center">
            <div className="size-[72px] rounded-full bg-senal/15 text-senal grid place-items-center"><Icon name="flecha" size={32} /></div>
            <h2 className="text-[28px] font-bold">te llevamos al pago seguro</h2>
            <p className="text-crema/75 leading-relaxed">Tus {qty} {qty === 1 ? "entrada queda reservada" : "entradas quedan reservadas"} 30 minutos. Al pagar te llegan al email con su QR.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

// ---------- contratación ----------
function ContactModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setSent(false); }, [open]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    await api.submitLead({
      name: String(f.get("name")), org: String(f.get("org")), city: String(f.get("city")),
      date: String(f.get("date") || "") || undefined, email: String(f.get("email")), message: String(f.get("message")),
    });
    setBusy(false);
    setSent(true);
  }

  const light = "h-12 bg-white border-noche/25 text-noche placeholder:text-noche/40";
  return (
    <Modal open={open} onClose={onClose} title={sent ? "recibido." : "cuéntanos tu bolo"} tone="crema">
      {sent ? (
        <p className="text-lg leading-relaxed">Te contestamos en menos de 48 h con disponibilidad y presupuesto.</p>
      ) : (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 [&_label]:text-noche/75">
          <Field label="Nombre">{id => <Input id={id} name="name" required autoComplete="name" className={light} />}</Field>
          <Field label="Sala / organización">{id => <Input id={id} name="org" required autoComplete="organization" className={light} />}</Field>
          <Field label="Ciudad">{id => <Input id={id} name="city" required className={light} />}</Field>
          <Field label="Fecha aproximada">{id => <Input id={id} name="date" type="date" className={light} />}</Field>
          <Field label="Email" className="sm:col-span-2">{id => <Input id={id} name="email" type="email" required autoComplete="email" className={light} />}</Field>
          <Field label="Qué tienes en mente" className="sm:col-span-2">{id => <Textarea id={id} name="message" rows={3} required className="bg-white border-noche/25 text-noche" />}</Field>
          <Button type="submit" variant="primary" size="lg" block className="sm:col-span-2 mt-1" disabled={busy}>{busy ? "enviando…" : "enviar"}</Button>
          <p className="sm:col-span-2 text-xs text-noche/65">Usamos tus datos solo para contestarte y preparar el presupuesto (<a href="/legal/privacidad/" className="underline">privacidad</a>).</p>
        </form>
      )}
    </Modal>
  );
}


// ---------- fotos del último bolo ----------
const GALLERY = {
  title: "EL CATXULL · BENICARLÓ · 29.08.26",
  photos: [
    "el público con las manos arriba bajo la carpa",
    "el cantante bajo focos rosas",
    "la banda saltando en el escenario con luz naranja",
    "guitarra y teclado a contraluz",
    "la bajista entre focos azules y rosas",
    "la banda posando delante del público",
    "la cantante sonriendo al micro",
    "el cantante bajo focos rojos",
    "el público con una pancarta para la banda",
    "el guitarrista con luz amarilla y azul",
    "el cantante bajando a cantar con el público",
    "una pancarta para la banda entre el público",
  ],
};

function Gallery({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const n = GALLERY.photos.length;
  const go = (d: number) => setI(x => (x + d + n) % n);
  const src = (k: number) => `/img/catxull/${String(k + 1).padStart(2, "0")}.jpg`;
  const touchX = useRef<number | null>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", h); document.body.style.overflow = ""; };
  }, [onClose]);
  // precarga la siguiente para que el paso sea inmediato
  useEffect(() => { new Image().src = src((i + 1) % n); }, [i, n]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-noche anim-fade" role="dialog" aria-modal="true" aria-label="Fotos de besta en El Catxull, Benicarló"
      onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={e => { if (touchX.current === null) return; const dx = e.changedTouches[0].clientX - touchX.current; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); touchX.current = null; }}>
      <div className="flex items-center justify-between gap-4 px-4 sm:px-8 h-16 shrink-0">
        <p className="font-mono text-xs tracking-wider text-crema/75 truncate">{GALLERY.title}</p>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="size-11 shrink-0 rounded-full bg-tubo text-xl">×</button>
      </div>
      <div className="relative flex-1 min-h-0 px-3 sm:px-20">
        <img key={i} src={src(i)} alt={`besta en El Catxull: ${GALLERY.photos[i]}`} className="size-full object-contain anim-fade" />
        <button type="button" onClick={() => go(-1)} aria-label="Foto anterior" className="hidden sm:grid absolute left-4 top-1/2 -translate-y-1/2 size-12 place-items-center rounded-full bg-tubo text-2xl hover:bg-senal hover:text-noche"><Icon name="atras" size={22} /></button>
        <button type="button" onClick={() => go(1)} aria-label="Foto siguiente" className="hidden sm:grid absolute right-4 top-1/2 -translate-y-1/2 size-12 place-items-center rounded-full bg-tubo text-2xl hover:bg-senal hover:text-noche"><Icon name="flecha" size={22} /></button>
      </div>
      <div className="flex items-center justify-center gap-4 h-16 shrink-0 font-mono text-[13px] text-crema/75">
        <button type="button" onClick={() => go(-1)} aria-label="Foto anterior" className="sm:hidden size-11 rounded-full bg-tubo grid place-items-center"><Icon name="atras" size={18} /></button>
        <span aria-live="polite">{String(i + 1).padStart(2, "0")} / {n}</span>
        <button type="button" onClick={() => go(1)} aria-label="Foto siguiente" className="sm:hidden size-11 rounded-full bg-tubo grid place-items-center"><Icon name="flecha" size={18} /></button>
      </div>
    </div>
  );
}
