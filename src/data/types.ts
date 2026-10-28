/* =========================================================
   Modelo de datos de besta.
   Cada tipo es una tabla (o una vista) de Supabase el día que
   se enchufe el backend. Importes siempre en céntimos.
   ========================================================= */

export type ID = string;
export type ISODate = string;      // 2026-12-12
export type ISODateTime = string;  // 2026-12-12T21:30:00Z

// ---------- banda ----------
/* admin = la banda (todo); músico = viene a tocar; staff = entradas, puerta y merch. */
export type Role = "admin" | "musico" | "staff";

export interface Member {
  id: ID;
  name: string;
  instrument: string;      // «voz», «gtr solo», «puerta y merch»…
  role: Role;
  email?: string;
  userId?: string;         // cuenta de acceso (Supabase Auth); sin ella, invitación pendiente
  scopes?: string[];       // módulos a mano; sin esto, los de su rol
  band?: boolean;          // de la banda: entra en finanzas y en el reparto
  active?: boolean;        // false = sin acceso, se conserva el historial
  invitedAt?: ISODateTime;
}

// ---------- bolos ----------
export type GigStatus = "tentativo" | "confirmado" | "cancelado";
export type Ticketing = "propia" | "externa" | "ninguna";

export interface ScheduleItem { time: string; what: string; note?: string }
export interface Contact { role: string; name: string; phone?: string; email?: string }

/* Bolo anunciado en secreto: sale en la web, pero solo con lo desvelado.
   Lo oculto no llega a la web (public_site lo vacía), no es solo un blur. */
export interface GigTeaser {
  date: "oculta" | "mes" | "exacta";
  city: boolean;
  venue: boolean;
}

export interface Gig {
  id: ID;
  date: ISODate;
  time: string;            // hora del show, «21:30»
  doors?: string;          // «21:00»
  city: string;
  venue: string;
  address?: string;
  capacity?: number;
  status: GigStatus;
  published: boolean;      // aparece en la web
  teaser?: GigTeaser | null; // con esto, sale en la web en modo secreto
  ticketing: Ticketing;
  externalUrl?: string;    // entradas o info fuera
  feeCents?: number;       // caché acordado
  deal?: string;           // «caché fijo + taquilla propia»
  schedule: ScheduleItem[];
  contacts: Contact[];
  notes?: string;
  quoteId?: ID;
  setlistId?: ID;
  riderId?: ID;
  checklist: Record<string, boolean>;  // claves manuales: furgo, merch…
  bandsintownId?: string;  // si existe en Bandsintown (de ahí lo coge Spotify)
  soldOut?: boolean;       // cartel de sold out en la web; al marcarlo se cierra la venta propia
}

// ---------- entradas ----------
export interface TicketEvent {
  id: ID;
  gigId: ID;
  name: string;
  description: string;
  image?: string;
  priceCents: number;
  capacity: number;
  maxPerOrder: number;
  salesEnabled: boolean;
  salesEnd?: ISODateTime;
}

export type OrderStatus = "pendiente" | "pagado" | "devuelto" | "caducado";

export interface Order {
  id: ID;
  number: number;          // #0143
  eventId: ID;
  email: string;
  name?: string;
  qty: number;
  amountCents: number;
  status: OrderStatus;
  newsletter: boolean;
  createdAt: ISODateTime;
  token: string;           // enlace secreto de «mis entradas»
  // los pone el servidor al mandar cada email
  emailSentAt?: ISODateTime;
  resentAt?: ISODateTime;
  thanksSentAt?: ISODateTime;
  refundEmailAt?: ISODateTime;
}

export type TicketStatus = "valida" | "usada" | "cancelada";
export type TicketKind = "general" | "invitacion";

export interface Ticket {
  code: string;            // BST-7K2Q — lo que lleva el QR
  orderId?: ID;            // las invitaciones no tienen pedido
  eventId: ID;
  kind: TicketKind;
  holder?: string;         // nombre en invitaciones
  status: TicketStatus;
  checkedInAt?: ISODateTime;
  checkedInBy?: string;
}

export type ScanResult =
  | { ok: true; ticket: Ticket; order?: Order }
  | { ok: false; reason: "usada" | "no-existe" | "cancelada" | "otro-evento"; ticket?: Ticket; order?: Order };

// ---------- ensayos ----------
export interface SongLine { chords: string; lyric: string }
export interface SongSection { id: ID; name: string; note?: string; lines: SongLine[] }
export interface SongComment { id: ID; who: string; where?: string; text: string; resolved: boolean; at: ISODateTime }

export interface Song {
  id: ID;
  title: string;
  artist: string;
  own: boolean;
  key: string;             // tono original
  bpm?: number;
  duration?: string;       // «3:41»
  sections: SongSection[];
  instrumentNotes: Record<ID, string>;          // por miembro
  memberChords: Record<ID, Record<ID, string>>;  // miembro → sección → acordes propios
  comments: SongComment[];
  demoUrl?: string;
}

export interface Setlist {
  id: ID;
  name: string;
  gigId?: ID;
  songIds: ID[];
  closed: boolean;
}

// ---------- composición ----------
export type IdeaStatus = "idea" | "desarrollo" | "lista";
export interface IdeaDemo { id: ID; version: number; by: string; date: ISODate; url?: string }
export interface IdeaComment { id: ID; at?: string; who: string; text: string }

export interface Idea {
  id: ID;
  title: string;
  status: IdeaStatus;
  author: string;
  key?: string;
  bpm?: number;
  lyrics: string;
  sections: { id: ID; name: string; chords: string }[];
  demos: IdeaDemo[];
  comments: IdeaComment[];
  updatedAt: ISODateTime;
  songId?: ID;             // si ya pasó a ensayos
}

// ---------- rider ----------
export interface RiderInput { ch: string; source: string; mic: string; stand: string }
export interface StagePos { memberId: ID; label: string; x: number; y: number }  // % del escenario
export interface RiderBlock { id: string; name: string; enabled: boolean; body?: string }

export interface Rider {
  id: ID;
  name: string;            // banda completa, acústico…
  version: string;
  blocks: RiderBlock[];
  inputs: RiderInput[];
  stage: StagePos[];
  stageSize: string;       // «6 × 4 m»
  sentTo: { gigId: ID; date: ISODate }[];
}

// ---------- presupuestos ----------
export type QuoteStatus = "borrador" | "enviado" | "aceptado" | "rechazado";
export interface QuoteLine { id: ID; name: string; note?: string; amountCents: number }

export interface Quote {
  id: ID;
  number: string;          // BESTA-2026-016
  status: QuoteStatus;
  client: string;
  contactEmail?: string;
  eventDate?: ISODate;
  place?: string;
  format?: string;
  lines: QuoteLine[];
  ivaPct: number;
  irpfPct: number;
  conditions: string;
  createdAt: ISODateTime;
  sentAt?: ISODateTime;
  leadId?: ID;
  gigId?: ID;
}

export interface Lead {
  id: ID;
  name: string;
  org: string;
  city: string;
  date?: ISODate;
  email: string;
  message: string;
  createdAt: ISODateTime;
  status: "nueva" | "presupuestada" | "descartada";
}

// ---------- merch ----------
export interface Variant { id: ID; label: string; stock: number }
export interface Product { id: ID; name: string; priceCents: number; costCents: number; variants: Variant[]; archived: boolean; published: boolean; color: "senal" | "crema" | "tubo" | "noche"; info?: string }

export type MoveKind = "venta" | "reserva" | "regalo" | "reposicion" | "recuento";
export type PayMethod = "efectivo" | "bizum" | "tarjeta" | "otro";

export interface MerchMove {
  id: ID;
  variantId: ID;
  productId: ID;
  kind: MoveKind;
  qty: number;             // con signo: venta −2, reposición +20
  unitCents: number;
  payment?: PayMethod;
  by: string;              // quién atendía
  customer?: string;
  gigId?: ID;
  open?: boolean;          // reserva sin entregar
  reservedAt?: ISODateTime; // venta que empezó como reserva: cuándo se apartó
  note?: string;
  at: ISODateTime;
}

/* Solicitud desde la web: de momento el merch no se paga online.
   La banda confirma, se aparta (reserva) y se cobra al entregar. */
export type RequestStatus = "nueva" | "apartada" | "entregada" | "cancelada";
export interface MerchRequest {
  id: ID;
  productId: ID;
  variantId: ID;
  qty: number;
  name: string;
  email: string;
  phone?: string;
  delivery?: "concierto" | "envio"; // la web ya no lo pide: se acuerda al confirmar
  gigId?: ID;              // en qué concierto lo recoge
  address?: string;        // si es envío
  note?: string;
  status: RequestStatus;
  moveId?: ID;             // la reserva que aparta el stock
  createdAt: ISODateTime;
}

/* Altas de «avísame» y newsletter. De verdad viven en Brevo (lista con
   intereses, doble confirmación); aquí solo lo que hace falta mostrar. */
export type Topic = "fechas" | "merch" | "lanzamientos";
export interface Subscriber { id: ID; email: string; name?: string; city?: string; topics: Topic[]; source: string; createdAt: ISODateTime }

// ---------- finanzas ----------
export interface Expense {
  id: ID;
  title: string;
  amountCents: number;
  payerId: ID;
  participantIds: ID[];
  category: string;
  gigId?: ID;
  date: ISODate;
  receipt?: string;
}

export interface Income {
  id: ID;
  title: string;
  amountCents: number;
  source: "cache" | "entradas" | "merch" | "otro";
  gigId?: ID;
  date: ISODate;
}

export interface Settlement { id: ID; fromId: ID; toId: ID; amountCents: number; date: ISODate; note?: string }

export interface AuditEntry { id: ID; who: string; action: string; at: ISODateTime }

// ---------- avisos a la lista (newsletter) ----------
export interface NewsInput { topic: Topic; subject: string; title: string; body: string; ctaLabel?: string; ctaUrl?: string; image?: string }
export interface NewsStats {
  total: number;
  byTopic: Record<Topic, number>;
  recent: { id: number; name: string; subject: string; sentAt?: string; delivered: number; opened: number }[];
}
