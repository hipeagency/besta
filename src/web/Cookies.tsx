/* Banner y preferencias de cookies. «Rechazar» pesa lo mismo que
   «aceptar» (lo exige la normativa) y no bloquea la web. */
import { useEffect, useState } from "react";
import { Button, Modal, Toggle } from "@/components/ui";
import { loadTrackers, needsBanner, readConsent, saveConsent } from "./consent";

export default function Cookies() {
  const [banner, setBanner] = useState(false);
  const [prefs, setPrefs] = useState(false);
  const [analitica, setAnalitica] = useState(false);
  const [publicidad, setPublicidad] = useState(false);

  useEffect(() => {
    const c = readConsent();
    if (c) { setAnalitica(c.analitica); setPublicidad(c.publicidad); loadTrackers(c); }
    else if (needsBanner()) setBanner(true);
    const open = (e: MouseEvent) => {
      if (needsBanner() && (e.target as HTMLElement).closest("[data-cookies]")) { e.preventDefault(); setPrefs(true); }
    };
    document.addEventListener("click", open);
    return () => document.removeEventListener("click", open);
  }, []);

  const decide = (a: boolean, p: boolean) => { saveConsent({ analitica: a, publicidad: p }); setAnalitica(a); setPublicidad(p); setBanner(false); setPrefs(false); };

  return (
    <>
      {banner && !prefs && (
        <div role="region" aria-label="Cookies" className="fixed z-40 inset-x-3 bottom-3 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:max-w-[420px] rounded-3xl bg-tubo border border-crema/12 p-5 shadow-2xl anim-sheet flex flex-col gap-3">
          <p className="font-semibold">¿cookies?</p>
          <p className="text-sm text-crema/75 leading-relaxed">Usamos las necesarias para que la web funcione. Con tu permiso, también para saber cuánta gente nos visita y para que nuestros anuncios lleguen a quien le pueda gustar besta.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => decide(false, false)}>rechazar</Button>
            <Button variant="light" onClick={() => decide(true, true)}>aceptar</Button>
          </div>
          <button type="button" onClick={() => setPrefs(true)} className="text-sm underline self-start text-crema/75">elegir cuáles</button>
        </div>
      )}
      <Modal open={prefs} onClose={() => setPrefs(false)} title="cookies">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="font-semibold">necesarias · siempre activas</span>
            <span className="text-sm text-crema/70">Recordar tu elección de cookies y, en la suite, tu sesión. Sin ellas no funciona la web.</span>
          </div>
          <div className="flex flex-col gap-2">
            <Toggle checked={analitica} onChange={setAnalitica} label="analítica" className="self-start" />
            <span className="text-sm text-crema/70">Cuánta gente entra y qué mira, sin saber quién eres.</span>
          </div>
          <div className="flex flex-col gap-2">
            <Toggle checked={publicidad} onChange={setPublicidad} label="publicidad" className="self-start" />
            <span className="text-sm text-crema/70">Para medir nuestros anuncios en Instagram y Facebook y enseñárselos a gente parecida.</span>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button onClick={() => decide(analitica, publicidad)}>guardar</Button>
            <Button variant="light" onClick={() => decide(true, true)}>aceptar todo</Button>
          </div>
          <a href="/legal/cookies/" className="text-sm underline text-crema/75">más detalle</a>
        </div>
      </Modal>
    </>
  );
}
