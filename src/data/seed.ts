/* =========================================================
   Datos de prueba. Lo que ves en la suite mientras no hay
   backend: se guarda en el navegador (localStorage) y se puede
   reiniciar desde «más → reiniciar datos de prueba».
   Las fechas, salas e importes son ejemplos, no reales.
   ========================================================= */
import type {
  Member, Gig, TicketEvent, Order, Ticket, Song, Setlist, Idea, Rider,
  Quote, Lead, Product, MerchMove, MerchRequest, Subscriber, Expense, Income, Settlement, AuditEntry, Settings,
} from "./types";

export interface DB {
  members: Member[];
  gigs: Gig[];
  events: TicketEvent[];
  orders: Order[];
  tickets: Ticket[];
  songs: Song[];
  setlists: Setlist[];
  ideas: Idea[];
  riders: Rider[];
  quotes: Quote[];
  leads: Lead[];
  products: Product[];
  moves: MerchMove[];
  requests: MerchRequest[];
  subscribers: Subscriber[];
  expenses: Expense[];
  incomes: Income[];
  settlements: Settlement[];
  audit: AuditEntry[];
  categories: string[];
  settings: Settings[];
}

const members: Member[] = [
  { id: "maxim", name: "Maxim", instrument: "voz", role: "admin", band: true, active: true, owner: true },
  { id: "pau", name: "Pau", instrument: "gtr solo", role: "admin", band: true, active: true },
  { id: "albert", name: "Albert", instrument: "gtr acomp", role: "admin", band: true, active: true },
  { id: "carlinhos", name: "Carlinhos", instrument: "piano", role: "admin", band: true, active: true },
  { id: "lars", name: "Lars", instrument: "bajo", role: "admin", band: true, active: true },
  { id: "victor", name: "Víctor", instrument: "batería", role: "admin", band: true, active: true },
  // ejemplos de los otros dos tipos de acceso
  { id: "musico-invitado", name: "Músico invitado", instrument: "teclados (sustituto)", role: "musico", email: "[email]", active: true, invitedAt: "2026-10-20T10:00:00.000Z" },
  { id: "staff-1", name: "Staff", instrument: "puerta y merch", role: "staff", email: "[email]", active: true, invitedAt: "2026-10-22T10:00:00.000Z" },
];
const allIds = members.filter(m => m.band).map(m => m.id);

const gigs: Gig[] = [
  {
    id: "bcn-2026-12-12", date: "2026-12-12", time: "21:30", doors: "21:00",
    city: "Barcelona", venue: "[sala por confirmar]", address: "[dirección]", capacity: 250,
    status: "confirmado", published: true, ticketing: "propia",
    feeCents: 60000, deal: "caché fijo + taquilla propia",
    schedule: [
      { time: "17:00", what: "carga y montaje", note: "puerta de carga" },
      { time: "18:30", what: "prueba de sonido", note: "45 min" },
      { time: "20:00", what: "cena", note: "catering sala" },
      { time: "21:00", what: "puertas", note: "empieza el escáner" },
      { time: "21:30", what: "besta", note: "75 min" },
      { time: "23:30", what: "desmontaje" },
    ],
    contacts: [
      { role: "sala", name: "[nombre]", phone: "[teléfono]" },
      { role: "técnico de sonido", name: "[nombre]", phone: "[teléfono]" },
    ],
    notes: "Aparcar la furgo por la puerta de carga. Camerino compartido con el telonero. Llevar el muro de teles pequeño (6 teles).",
    quoteId: "q-014", setlistId: "sl-bcn", riderId: "rider-full",
    checklist: { furgo: false, merch: false },
  },
  {
    id: "vlc-2027-02-20", date: "2027-02-20", time: "22:00", doors: "21:30",
    city: "Valencia", venue: "[sala por confirmar]", capacity: 180,
    status: "confirmado", published: true, ticketing: "propia",
    feeCents: 0, deal: "100 % taquilla",
    schedule: [{ time: "21:30", what: "puertas" }, { time: "22:00", what: "besta", note: "70 min" }],
    contacts: [], checklist: {}, quoteId: "q-013",
  },
  {
    id: "mad-2027-03-07", date: "2027-03-07", time: "19:00",
    city: "Madrid", venue: "[festival por confirmar]",
    status: "confirmado", published: true, ticketing: "externa", externalUrl: "https://example.com",
    teaser: { date: "mes", city: true, venue: false },
    schedule: [{ time: "19:00", what: "besta", note: "45 min" }], contacts: [], checklist: {},
  },
  {
    id: "sitges-2027-07-10", date: "2027-07-10", time: "20:00",
    city: "Sitges", venue: "boda privada",
    status: "tentativo", published: false, ticketing: "ninguna",
    schedule: [], contacts: [], checklist: {},
  },
  {
    id: "benicarlo-2026-08-29", date: "2026-08-29", time: "22:00",
    city: "Benicarló", venue: "El Catxull", address: "Plaza de la Constitución, Benicarló",
    status: "confirmado", published: true, ticketing: "ninguna",
    feeCents: 90000, schedule: [{ time: "22:00", what: "besta" }], contacts: [], checklist: {}, bandsintownId: "108794780",
  },
  {
    id: "castelldefels-2026-08-15", date: "2026-08-15", time: "21:00",
    city: "Castelldefels", venue: "Festa Major de Castelldefels",
    status: "confirmado", published: true, ticketing: "ninguna",
    externalUrl: "https://www.castelldefels.org/es/actualidad/agenda/fiesta-mayor-verano-2026-besta-en-concierto",
    schedule: [{ time: "21:00", what: "besta", note: "30 min" }], contacts: [], checklist: {},
  },
];

const events: TicketEvent[] = [
  {
    id: "ev-bcn", gigId: "bcn-2026-12-12", name: "besta en Barcelona",
    description: "Presentamos «No me sale olvidarte» en directo. Puertas a las 21:00.",
    image: "/img/escenario-azul.jpg", priceCents: 1200, capacity: 250, maxPerOrder: 10,
    salesEnabled: true, salesEnd: "2026-12-12T19:00:00.000Z",
  },
  {
    id: "ev-vlc", gigId: "vlc-2027-02-20", name: "besta en Valencia",
    description: "Primera vez en Valencia.", image: "/img/escenario-atardecer.jpg",
    priceCents: 1000, capacity: 180, maxPerOrder: 8, salesEnabled: true,
  },
];

/* Pedidos de ejemplo: unos 140 vendidos para Barcelona. Generador
   determinista para que siempre salga lo mismo. */
function makeOrders(): { orders: Order[]; tickets: Ticket[] } {
  const names = ["laura", "pau.r", "nerea", "jordi.m", "carla", "sergi.p", "marta", "anna", "xavi", "irene", "dani", "julia", "pol", "noa", "biel", "aina", "marc", "clara"];
  const domains = ["gmail.com", "hotmail.com", "yahoo.es", "icloud.com"];
  let seed = 42;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const orders: Order[] = [];
  const tickets: Ticket[] = [];
  let sold = 0, n = 1;
  const start = Date.parse("2026-10-07T10:00:00Z");
  const end = Date.parse("2026-10-28T09:00:00Z");
  while (sold < 143) {
    const qty = Math.min(143 - sold, 1 + Math.floor(rnd() * 4));
    const t = start + (end - start) * Math.pow(rnd(), .7);
    const id = `ord-${String(n).padStart(4, "0")}`;
    const status = rnd() < 0.04 ? "devuelto" : "pagado";
    orders.push({
      id, number: n, eventId: "ev-bcn",
      email: `${names[n % names.length]}${n > names.length ? n : ""}@${domains[n % domains.length]}`,
      qty, amountCents: qty * 1200, status, newsletter: rnd() < .5,
      createdAt: new Date(t).toISOString(), token: `tk${n}x${Math.floor(rnd() * 1e8).toString(36)}`,
    });
    for (let i = 0; i < qty; i++) {
      tickets.push({
        code: `BST-${Math.floor(rnd() * 36 ** 4).toString(36).toUpperCase().padStart(4, "0")}`,
        orderId: id, eventId: "ev-bcn", kind: "general",
        status: status === "devuelto" ? "cancelada" : "valida",
      });
    }
    if (status === "pagado") sold += qty;
    n++;
  }
  // dos pedidos a medio pagar y uno caducado
  orders.push({ id: `ord-${String(n).padStart(4, "0")}`, number: n, eventId: "ev-bcn", email: "nerea@gmail.com", qty: 1, amountCents: 1200, status: "pendiente", newsletter: false, createdAt: "2026-10-28T08:40:00.000Z", token: "tkpend1" }); n++;
  orders.push({ id: `ord-${String(n).padStart(4, "0")}`, number: n, eventId: "ev-bcn", email: "oriol@hotmail.com", qty: 3, amountCents: 3600, status: "pendiente", newsletter: true, createdAt: "2026-10-28T08:52:00.000Z", token: "tkpend2" }); n++;
  orders.push({ id: `ord-${String(n).padStart(4, "0")}`, number: n, eventId: "ev-bcn", email: "marta@icloud.com", qty: 1, amountCents: 1200, status: "caducado", newsletter: false, createdAt: "2026-10-27T18:00:00.000Z", token: "tkcad1" });
  // invitaciones
  ["Ràdio Castelldefels", "familia Pau", "familia Pau", "prensa · [medio]"].forEach((holder, i) => {
    tickets.push({ code: `INV-${(1000 + i * 37).toString(36).toUpperCase()}`, eventId: "ev-bcn", kind: "invitacion", holder, status: "valida" });
  });
  return { orders: orders.reverse(), tickets };
}

const ln = (chords: string, lyric: string) => ({ chords, lyric });

const songs: Song[] = [
  {
    id: "no-me-sale-olvidarte", title: "No me sale olvidarte", artist: "besta", own: true, key: "G", bpm: 92, duration: "3:41",
    sections: [
      { id: "s1", name: "Estrofa 1", note: "todos", lines: [ln("G               D/F#", "[primera línea de la estrofa]"), ln("Em7             C", "[segunda línea de la estrofa]")] },
      { id: "s2", name: "Estribillo 1", note: "todos", lines: [ln("C       G        D", "[línea del estribillo]"), ln("Em      C        D", "no me sale olvidarte")] },
      { id: "s3", name: "Estrofa 2", note: "todos", lines: [ln("G               D/F#", "[primera línea]"), ln("Em7             C", "[segunda línea]")] },
      { id: "s4", name: "Estribillo 2", note: "todos", lines: [ln("C       G        D", "[línea del estribillo]"), ln("Em      C        D", "no me sale olvidarte")] },
      { id: "s5", name: "Último estribillo — 1ª vuelta", note: "solo guitarra, bajan todos", lines: [ln("C       G        D", "[línea del estribillo]")] },
      { id: "s6", name: "Último estribillo — 2ª vuelta", note: "vuelven todos full", lines: [ln("C       G        D", "[línea del estribillo]"), ln("Em      C        D", "no me sale olvidarte")] },
    ],
    instrumentNotes: {
      pau: "Sigue solo en la 1ª vuelta del último estribillo, sosteniendo.",
      carlinhos: "Para en la 1ª vuelta del último estribillo.",
      victor: "Para en la 1ª vuelta del último estribillo. Click 92.",
      maxim: "Para (o muy bajita) en la 1ª vuelta del último estribillo.",
    },
    memberChords: {},
    comments: [
      { id: "c1", who: "Albert", where: "Estribillo 1", text: "¿Subimos medio tono? A Maxim le queda justo en directo.", resolved: false, at: "2026-10-24T20:00:00.000Z" },
      { id: "c2", who: "Víctor", where: "Estrofa 1", text: "Propongo 4 compases de intro para entrar con las teles.", resolved: false, at: "2026-10-25T19:00:00.000Z" },
    ],
  },
  ...([
    ["Ibiza", "besta", true, "A"], ["Apaga el llum", "besta", true, "D"], ["Valeria", "besta", true, "E"],
    ["Bailemos", "Dani Fernández", false, "G"], ["Vulnerable", "Dani Fernández", false, "G"], ["Todo contigo", "Álvaro de Luna", false, "C"],
    ["Física o Química", "Despistaos", false, "A"], ["La suerte de mi vida", "El Canto del Loco", false, "D"], ["Antes que ver el sol", "Coti", false, "E"],
    ["Tenía tanto que darte", "Nena Daconte", false, "F"], ["La revolución sexual", "La Casa Azul", false, "C"], ["Antes de que cuente diez", "Fito y Fitipaldis", false, "D"],
    ["1+1 son 7", "Fran Perea", false, "Gm"], ["Si antes te hubiera conocido", "Karol G", false, "E"], ["Como si fueras a morir mañana", "Leiva", false, "A"],
  ] as const).map(([title, artist, own, key], i): Song => ({
    id: title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    title, artist, own, key, bpm: 90 + (i * 7) % 40, duration: `3:${String(10 + (i * 13) % 50).padStart(2, "0")}`,
    sections: [
      { id: "a", name: "Estrofa", lines: [ln(`${key}               ${key === "G" ? "D" : "G"}`, "[letra]")] },
      { id: "b", name: "Estribillo", lines: [ln(`C       ${key}        D`, "[letra]")] },
    ],
    instrumentNotes: {}, memberChords: {}, comments: [],
  })),
];

const setlists: Setlist[] = [
  {
    id: "sl-bcn", name: "Barcelona · 12 dic", gigId: "bcn-2026-12-12", closed: false,
    songIds: ["bailemos", "fisica-o-quimica", "ibiza", "no-me-sale-olvidarte", "la-suerte-de-mi-vida", "vulnerable", "antes-que-ver-el-sol", "valeria", "1-1-son-7", "tenia-tanto-que-darte", "apaga-el-llum", "la-revolucion-sexual", "antes-de-que-cuente-diez", "como-si-fueras-a-morir-manana"],
  },
  { id: "sl-ensayo", name: "Ensayo jueves", closed: false, songIds: ["no-me-sale-olvidarte", "valeria", "apaga-el-llum"] },
];

const ideas: Idea[] = [
  { id: "i1", title: "nota de voz · bus", status: "idea", author: "Maxim", lyrics: "", sections: [], demos: [{ id: "d1", version: 1, by: "Maxim", date: "2026-10-26" }], comments: [], updatedAt: "2026-10-26T10:00:00.000Z" },
  { id: "i2", title: "progresión piano", status: "idea", author: "Carlinhos", key: "Dm", sections: [{ id: "x", name: "intro", chords: "Dm Bb F C" }], lyrics: "", demos: [{ id: "d2", version: 1, by: "Carlinhos", date: "2026-10-20" }], comments: [{ id: "k", who: "Pau", text: "Me flipa, le meto un arpegio encima" }], updatedAt: "2026-10-20T10:00:00.000Z" },
  {
    id: "i3", title: "riff del local", status: "desarrollo", author: "Pau", key: "Am", bpm: 110, lyrics: "[letra en construcción]",
    sections: [{ id: "a", name: "intro", chords: "Am F C G" }, { id: "b", name: "estrofa", chords: "Am F" }, { id: "c", name: "puente", chords: "?" }],
    demos: [{ id: "d3", version: 1, by: "Pau", date: "2026-10-10" }, { id: "d4", version: 2, by: "Pau", date: "2026-10-17" }, { id: "d5", version: 3, by: "Pau", date: "2026-10-24" }],
    comments: [{ id: "k1", at: "0:42", who: "Carlinhos", text: "Aquí entraría bien un cambio a Fmaj7" }, { id: "k2", at: "1:58", who: "Maxim", text: "Tengo letra para este puente, la subo" }],
    updatedAt: "2026-10-28T08:00:00.000Z",
  },
  { id: "i4", title: "balada verano", status: "desarrollo", author: "Maxim", lyrics: "", sections: [], demos: [{ id: "d6", version: 1, by: "Maxim", date: "2026-10-22" }, { id: "d7", version: 2, by: "Carlinhos", date: "2026-10-23" }], comments: [], updatedAt: "2026-10-23T10:00:00.000Z" },
  { id: "i5", title: "[nombre del próximo single]", status: "lista", author: "besta", lyrics: "", sections: [], demos: [{ id: "d8", version: 4, by: "Pau", date: "2026-10-12" }], comments: [], updatedAt: "2026-10-12T10:00:00.000Z" },
];

const riders: Rider[] = [
  {
    id: "rider-full", name: "banda completa", version: "2026.1", stageSize: "6 × 4 m mín.",
    blocks: [
      { id: "musicos", name: "necesidades por músico", enabled: true, body: "Seis músicos. Voz con micro propio. Piano con soporte en X y banqueta." },
      { id: "inputs", name: "input list", enabled: true },
      { id: "plano", name: "plano de escenario", enabled: true },
      { id: "backline", name: "backline", enabled: true, body: "Batería completa (bombo 22\"), amplis de guitarra ×2, ampli de bajo." },
      { id: "monitores", name: "monitoraje", enabled: true, body: "5 envíos + IEM para voz." },
      { id: "corriente", name: "corriente", enabled: false, body: "4 puntos de corriente en escenario." },
      { id: "camerino", name: "camerino y catering", enabled: true, body: "Camerino para 8 personas. Agua y algo de cena." },
      { id: "contactos", name: "contactos", enabled: true, body: "Técnico: [nombre] · [teléfono]\nManagement: Maxim · [teléfono]" },
    ],
    inputs: [
      { ch: "01", source: "bombo", mic: "Beta 91 / D112", stand: "corto" },
      { ch: "02", source: "caja", mic: "SM57", stand: "corto" },
      { ch: "03", source: "hi-hat", mic: "condensador", stand: "corto" },
      { ch: "04", source: "overheads L/R", mic: "condensador ×2", stand: "alto" },
      { ch: "06", source: "bajo · Lars", mic: "DI", stand: "—" },
      { ch: "07", source: "guitarra · Pau", mic: "SM57", stand: "corto" },
      { ch: "08", source: "guitarra · Albert", mic: "SM57", stand: "corto" },
      { ch: "09", source: "piano L/R · Carlinhos", mic: "DI ×2", stand: "—" },
      { ch: "11", source: "voz · Maxim", mic: "propio", stand: "jirafa" },
      { ch: "12", source: "coro · Pau", mic: "SM58", stand: "jirafa" },
      { ch: "13", source: "coro · Albert", mic: "SM58", stand: "jirafa" },
    ],
    stage: [
      { memberId: "victor", label: "Víctor · batería", x: 50, y: 22 },
      { memberId: "lars", label: "Lars · bajo", x: 28, y: 34 },
      { memberId: "carlinhos", label: "Carlinhos · piano", x: 76, y: 34 },
      { memberId: "pau", label: "Pau · gtr", x: 20, y: 68 },
      { memberId: "albert", label: "Albert · gtr", x: 78, y: 68 },
      { memberId: "maxim", label: "Maxim · voz", x: 50, y: 74 },
    ],
    sentTo: [{ gigId: "bcn-2026-12-12", date: "2026-10-20" }, { gigId: "benicarlo-2026-08-29", date: "2026-08-10" }],
  },
  {
    id: "rider-acustico", name: "acústico", version: "2026.1", stageSize: "4 × 3 m",
    blocks: [
      { id: "musicos", name: "necesidades por músico", enabled: true, body: "Formato a tres: voz, guitarra y piano." },
      { id: "inputs", name: "input list", enabled: true },
      { id: "plano", name: "plano de escenario", enabled: true },
      { id: "contactos", name: "contactos", enabled: true, body: "Management: Maxim · [teléfono]" },
    ],
    inputs: [
      { ch: "01", source: "guitarra · Pau", mic: "DI", stand: "—" },
      { ch: "02", source: "piano L/R · Carlinhos", mic: "DI ×2", stand: "—" },
      { ch: "04", source: "voz · Maxim", mic: "propio", stand: "jirafa" },
    ],
    stage: [
      { memberId: "pau", label: "Pau · gtr", x: 25, y: 50 },
      { memberId: "maxim", label: "Maxim · voz", x: 50, y: 60 },
      { memberId: "carlinhos", label: "Carlinhos · piano", x: 75, y: 50 },
    ],
    sentTo: [],
  },
];

const quotes: Quote[] = [
  {
    id: "q-016", number: "BESTA-2026-016", status: "enviado", client: "Ajuntament de [ciudad]", contactEmail: "cultura@[ciudad].cat",
    eventDate: "2027-06-20", place: "plaza mayor", format: "banda completa",
    lines: [
      { id: "l1", name: "actuación besta · banda completa", note: "75 min · 6 músicos", amountCents: 120000 },
      { id: "l2", name: "desplazamiento", note: "furgo + gasolina", amountCents: 15000 },
      { id: "l3", name: "técnico de sonido propio", amountCents: 20000 },
    ],
    ivaPct: 21, irpfPct: 15, conditions: "50 % a la firma y 50 % el día del concierto. Sonido y luces a cargo de la organización según rider.",
    createdAt: "2026-10-25T10:00:00.000Z", sentAt: "2026-10-25T12:00:00.000Z",
  },
  { id: "q-015", number: "BESTA-2026-015", status: "enviado", client: "[Festival] Madrid", eventDate: "2027-03-07", lines: [{ id: "l", name: "actuación · 45 min", amountCents: 80000 }], ivaPct: 21, irpfPct: 15, conditions: "", createdAt: "2026-10-18T10:00:00.000Z", sentAt: "2026-10-18T10:00:00.000Z" },
  { id: "q-014", number: "BESTA-2026-014", status: "aceptado", client: "[Sala] Barcelona", eventDate: "2026-12-12", lines: [{ id: "l", name: "actuación · 75 min", amountCents: 60000 }], ivaPct: 21, irpfPct: 15, conditions: "", createdAt: "2026-10-02T10:00:00.000Z", gigId: "bcn-2026-12-12" },
  { id: "q-013", number: "BESTA-2026-013", status: "aceptado", client: "[Promotor] Valencia", eventDate: "2027-02-20", lines: [{ id: "l", name: "actuación · 70 min", amountCents: 0, note: "a taquilla" }], ivaPct: 21, irpfPct: 15, conditions: "", createdAt: "2026-09-20T10:00:00.000Z", gigId: "vlc-2027-02-20" },
  { id: "q-012", number: "BESTA-2026-012", status: "rechazado", client: "[Bar] Castelldefels", lines: [{ id: "l", name: "acústico · 60 min", amountCents: 35000 }], ivaPct: 21, irpfPct: 15, conditions: "", createdAt: "2026-09-01T10:00:00.000Z" },
];

const leads: Lead[] = [
  { id: "lead-1", name: "[nombre]", org: "[Sala] Barcelona", city: "Barcelona", date: "2027-03-14", email: "programacion@[sala].com", message: "Ciclo de bandas jóvenes en marzo, ¿os encaja un viernes?", createdAt: "2026-10-23T10:00:00.000Z", status: "nueva" },
  { id: "lead-2", name: "[nombre]", org: "Boda", city: "Sitges", date: "2027-07-10", email: "novios@[email].com", message: "Nos casamos en julio y queremos música en directo para la fiesta.", createdAt: "2026-10-27T10:00:00.000Z", status: "nueva" },
];

const v = (id: string, label: string, stock: number) => ({ id, label, stock });
const products: Product[] = [
  { id: "p-camiseta", name: "camiseta tele", priceCents: 2200, costCents: 700, color: "senal", archived: false, published: true, variants: [v("cam-s", "S", 8), v("cam-m", "M", 3), v("cam-l", "L", 12), v("cam-xl", "XL", 6)] },
  { id: "p-sudadera", name: "sudadera atardecer", priceCents: 3800, costCents: 1600, color: "crema", archived: false, published: true, variants: [v("sud-s", "S", 4), v("sud-m", "M", 2), v("sud-l", "L", 5), v("sud-xl", "XL", 1)] },
  { id: "p-gorra", name: "gorra besta", priceCents: 1800, costCents: 600, color: "noche", archived: false, published: true, variants: [v("gor", "", 24)] },
  { id: "p-vinilo", name: "vinilo 7\"", priceCents: 1500, costCents: 650, color: "tubo", archived: false, published: true, variants: [v("vin", "", 40)] },
];

const moves: MerchMove[] = [
  { id: "m1", productId: "p-camiseta", variantId: "cam-l", kind: "venta", qty: -2, unitCents: 2200, payment: "bizum", by: "Albert", gigId: "benicarlo-2026-08-29", at: "2026-08-29T23:10:00.000Z" },
  { id: "m2", productId: "p-gorra", variantId: "gor", kind: "venta", qty: -1, unitCents: 1800, payment: "efectivo", by: "Albert", gigId: "benicarlo-2026-08-29", at: "2026-08-29T23:20:00.000Z" },
  { id: "m3", productId: "p-camiseta", variantId: "cam-m", kind: "regalo", qty: -1, unitCents: 0, by: "Maxim", customer: "Ràdio Castelldefels", note: "prensa", at: "2026-06-19T12:00:00.000Z" },
  { id: "m4", productId: "p-sudadera", variantId: "sud-l", kind: "reposicion", qty: 20, unitCents: 1600, by: "Maxim", note: "imprenta", at: "2026-10-01T10:00:00.000Z" },
  { id: "m5", productId: "p-camiseta", variantId: "cam-m", kind: "reserva", qty: -1, unitCents: 2200, by: "Pau", customer: "Laura", open: true, at: "2026-10-20T10:00:00.000Z" },
  { id: "m6", productId: "p-gorra", variantId: "gor", kind: "reserva", qty: -2, unitCents: 1800, by: "Pau", customer: "familia Pau", open: true, at: "2026-10-22T10:00:00.000Z" },
];

const requests: MerchRequest[] = [
  { id: "rq1", productId: "p-sudadera", variantId: "sud-m", qty: 1, name: "Irene", email: "irene@gmail.com", delivery: "concierto", gigId: "bcn-2026-12-12", status: "nueva", createdAt: "2026-10-27T19:20:00.000Z" },
  { id: "rq2", productId: "p-camiseta", variantId: "cam-l", qty: 2, name: "Pol", email: "pol@hotmail.com", phone: "[teléfono]", delivery: "envio", address: "[dirección], Sabadell", note: "Una para regalar", status: "nueva", createdAt: "2026-10-28T08:05:00.000Z" },
];

const expenses: Expense[] = [
  { id: "e1", title: "gasolina furgo", amountCents: 6480, payerId: "maxim", participantIds: allIds, category: "viajes", gigId: "benicarlo-2026-08-29", date: "2026-08-29" },
  { id: "e2", title: "local de ensayo · octubre", amountCents: 18000, payerId: "pau", participantIds: allIds, category: "local", date: "2026-10-01" },
  { id: "e3", title: "cuerdas y baquetas", amountCents: 5400, payerId: "victor", participantIds: allIds, category: "material", date: "2026-10-10" },
  { id: "e4", title: "cena Benicarló", amountCents: 9600, payerId: "albert", participantIds: allIds, category: "comida", gigId: "benicarlo-2026-08-29", date: "2026-08-29" },
  { id: "e5", title: "peaje autopista", amountCents: 2340, payerId: "lars", participantIds: allIds, category: "viajes", gigId: "benicarlo-2026-08-29", date: "2026-08-29" },
];

const incomes: Income[] = [
  { id: "in1", title: "caché · Benicarló", amountCents: 90000, source: "cache", gigId: "benicarlo-2026-08-29", date: "2026-09-05" },
  { id: "in2", title: "merch · Benicarló", amountCents: 6200, source: "merch", gigId: "benicarlo-2026-08-29", date: "2026-08-29" },
];

const settlements: Settlement[] = [];
const audit: AuditEntry[] = [
  { id: "a1", who: "Maxim", action: "creó el gasto «gasolina furgo»", at: "2026-08-29T23:50:00.000Z" },
  { id: "a2", who: "Pau", action: "creó el gasto «local de ensayo · octubre»", at: "2026-10-01T10:00:00.000Z" },
];

export function createSeed(): DB {
  const { orders, tickets } = makeOrders();
  return {
    members, gigs, events, orders, tickets, songs, setlists, ideas, riders, quotes, leads,
    products, moves, requests, subscribers: [] as Subscriber[], expenses, incomes, settlements, audit,
    categories: ["viajes", "local", "instrumentos", "material", "comida", "directo", "otros"],
    settings: [],  // sin documento, la checklist usa DEFAULT_TASKS
  };
}

