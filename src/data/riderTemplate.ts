/* Rider técnico de banda completa (octubre 2026): directo a línea, sin
   amplis en escenario, IEM y playback desde el Mac de Víctor.
   Sirve de semilla en local y de plantilla al crear un formato nuevo
   («+ formato → partir de la plantilla»). */
import type { Rider } from "./types";

export const RIDER_TEMPLATE: Omit<Rider, "id" | "name" | "sentTo"> = {
  version: "2026.2",
  stageSize: "6 × 4 m mín.",
  blocks: [
    {
      id: "musicos", name: "resumen", enabled: true,
      body: "6 músicos · 17 entradas de mesa · monitorización por IEM (no hacen falta cuñas).\n"
        + "Todo directo a línea: guitarras y bajo sin amplificadores ni pantallas en escenario.\n"
        + "La guitarra eléctrica es compartida entre Max y Albert: un solo canal (08).",
    },
    { id: "inputs", name: "input list", enabled: true },
    {
      id: "patch", name: "notas de patch", enabled: true,
      body: "CH 08 · eléctrica compartida por Max y Albert (pedalera de Albert, mono).\n"
        + "CH 13 · pistas: al PA y a los IEM.\n"
        + "CH 14 · click + cues: SOLO al AUX de IEM. Nunca al Master L/R ni al PA.",
    },
    { id: "plano", name: "plano de escenario", enabled: true },
    {
      id: "backline", name: "backline", enabled: true,
      body: "Max + Albert · eléctrica compartida por la pedalera digital de Albert. 1 señal mono.\n"
        + "Albert · acústica a línea. Sin ampli.\n"
        + "Pau · guitarra inalámbrica → Line 6 Helix LT → salida XLR LEFT/MONO. Sin ampli ni pantalla.\n"
        + "Lars · bajo inalámbrico, salida directa a línea mono. Sin ampli.\n"
        + "Carlos · teclado estéreo L/R + 1 micro de coros.\n\n"
        + "Batería · Víctor: Mapex Horizon. Bombo 22 × 18\". Caja 14 × 5,5\" Mapex MPX Steel. "
        + "1 tom aéreo + tom base 16 × 16. Hi-hat, crash ×2, ride. Pedal doble Yamaha DFP9500D. "
        + "MacBook para lanzar pistas.",
    },
    {
      id: "monitores", name: "playback y monitores", enabled: true,
      body: "El Mac saca dos salidas mono independientes:\n"
        + "· Mac L → CH 14 · click + cues → solo bus de IEM.\n"
        + "· Mac R → CH 13 · pistas → PA + bus de IEM.\n\n"
        + "Mezcla IEM = directo + pistas + click/cues, por un envío AUX hacia el IEM (Debra ST-202).\n"
        + "Al PA: voces, instrumentos y pistas. El click no sale nunca por PA.",
    },
    {
      id: "sala", name: "necesidades de sala y prueba", enabled: true,
      body: "Mesa con 17 entradas y un envío AUX de monitores para el IEM.\n"
        + "DI y cableado para las dos salidas del Mac.\n"
        + "Corriente en los puntos de uso: batería/Mac, teclado, pedaleras e IEM.\n"
        + "En la prueba de sonido: comprobar que click/cues suenan en IEM y NO en PA.",
    },
    { id: "camerino", name: "camerino y catering", enabled: true, body: "Camerino para 8 personas. Agua y algo de cena." },
    { id: "contactos", name: "contacto / booking", enabled: true, body: "besta@besta.es · +34 687 283 763" },
  ],
  inputs: [
    { ch: "01", source: "bombo", mic: "mic bombo", stand: "", dest: "FOH + IEM" },
    { ch: "02", source: "caja", mic: "mic caja", stand: "", dest: "FOH + IEM" },
    { ch: "03", source: "tom aéreo", mic: "mic tom", stand: "", dest: "FOH + IEM" },
    { ch: "04", source: "tom base 16×16", mic: "mic tom", stand: "", dest: "FOH + IEM" },
    { ch: "05", source: "overhead L", mic: "condensador", stand: "", dest: "FOH + IEM" },
    { ch: "06", source: "overhead R", mic: "condensador", stand: "", dest: "FOH + IEM" },
    { ch: "07", source: "bajo · Lars", mic: "DI / línea mono", stand: "", dest: "FOH + IEM" },
    { ch: "08", source: "eléctrica · Max / Albert", mic: "pedalera Albert · mono", stand: "", dest: "FOH + IEM · compartido" },
    { ch: "09", source: "guitarra solista · Pau", mic: "Helix LT · XLR mono", stand: "", dest: "FOH + IEM" },
    { ch: "10", source: "acústica · Albert", mic: "DI / línea mono", stand: "", dest: "FOH + IEM" },
    { ch: "11", source: "teclado L · Carlos", mic: "DI / línea", stand: "", dest: "FOH + IEM" },
    { ch: "12", source: "teclado R · Carlos", mic: "DI / línea", stand: "", dest: "FOH + IEM" },
    { ch: "13", source: "playback · pistas (Mac R)", mic: "DI / línea mono", stand: "", dest: "PA + IEM" },
    { ch: "14", source: "playback · click + cues (Mac L)", mic: "DI / línea mono", stand: "", dest: "SOLO IEM · NO PA" },
    { ch: "15", source: "voz principal · Max", mic: "mic voz", stand: "", dest: "FOH + IEM" },
    { ch: "16", source: "coros · Albert", mic: "mic voz", stand: "", dest: "FOH + IEM" },
    { ch: "17", source: "coros · Carlos", mic: "mic voz", stand: "", dest: "FOH + IEM" },
  ],
  stage: [
    { memberId: "victor", label: "Víctor · batería + playback", detail: "CH 01-06 · 13-14", x: 50, y: 24 },
    { memberId: "carlinhos", label: "Carlos · teclado / coros", detail: "teclado 11-12 · voz 17", x: 15, y: 62 },
    { memberId: "albert", label: "Albert · gtr / coros", detail: "acús. 10 · eléc. 08 · voz 16", x: 33, y: 76 },
    { memberId: "maxim", label: "Max · voz", detail: "voz 15 · eléc. 08", x: 51, y: 84 },
    { memberId: "pau", label: "Pau · gtr solista", detail: "Helix LT 09", x: 69, y: 76 },
    { memberId: "lars", label: "Lars · bajo", detail: "línea 07", x: 86, y: 62 },
  ],
  // Lo que sale del PDF; cables, jacks y pies los rellena cada uno.
  gear: [
    { id: "g1", qty: 1, item: "kit Mapex Horizon (bombo 22×18, tom aéreo, tom base 16×16)", owner: "Víctor" },
    { id: "g2", qty: 1, item: "caja Mapex MPX Steel 14×5,5", owner: "Víctor" },
    { id: "g3", qty: 1, item: "platos: hi-hat, crash ×2, ride", owner: "Víctor" },
    { id: "g4", qty: 1, item: "pedal doble Yamaha DFP9500D", owner: "Víctor" },
    { id: "g5", qty: 1, item: "MacBook de pistas", owner: "Víctor", note: "2 salidas mono" },
    { id: "g6", qty: 1, item: "Line 6 Helix LT", owner: "Pau" },
    { id: "g7", qty: 1, item: "guitarra + sistema inalámbrico", owner: "Pau" },
    { id: "g8", qty: 1, item: "pedalera digital", owner: "Albert", note: "la usan Albert y Max" },
    { id: "g9", qty: 1, item: "guitarra acústica", owner: "Albert" },
    { id: "g10", qty: 1, item: "guitarra eléctrica compartida", owner: "banda", note: "Max / Albert" },
    { id: "g11", qty: 1, item: "bajo + sistema inalámbrico", owner: "Lars" },
    { id: "g12", qty: 1, item: "teclado", owner: "Carlos", note: "estéreo L/R" },
    { id: "g13", qty: 1, item: "IEM Debra ST-202", owner: "banda" },
    { id: "g14", qty: 1, item: "mesa de 17 entradas + AUX para IEM", owner: "sala" },
    { id: "g15", qty: 2, item: "DI para el Mac", owner: "sala" },
  ],
};
