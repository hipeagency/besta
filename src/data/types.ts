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
  owner?: boolean;         // superadmin: da y quita admin, borra usuarios. Solo se cambia en el servidor
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
  date: "mes" | "exacta";  // «mes» = mes y año; un «oculta» de antes se trata como «mes»
  city: boolean;
  venue: boolean;
  event?: boolean;         // el festival o evento, si lo hay
}

export interface Gig {
  id: ID;
  date: ISODate | "";      // "" = sin fecha todavía
  dateTbc?: boolean;       // solo se sabe el mes: date es su último día
  time: string;            // hora del show, «21:30»; "" = por confirmar
  doors?: string;          // «21:00»
  city: string;
  venue: string;
  event?: string;          // festival o evento del que forma parte: «Sonorama Ribera»
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
  checklist: Record<string, boolean>;  // lo marcado a mano: tareas comunes y las de este bolo
  tasks?: Task[];          // tareas solo de este bolo
  bandsintownId?: string;  // si existe en Bandsintown (de ahí lo coge Spotify)
  soldOut?: boolean;       // cartel de sold out en la web; al marcarlo se cierra la venta propia
}

// ---------- entradas ----------
/* Dónde se vende un tipo de entrada: en la web, en la taquilla o en las dos. */
export type SaleChannel = "online" | "puerta" | "ambos";

export interface TicketType {
  id: ID;                  // «general» es el de los eventos de antes de haber tipos
  name: string;            // «anticipada», «general», «taquilla»
  priceCents: number;
  channel: SaleChannel;
  limit?: number;          // cuántas como mucho de este tipo (dentro del aforo)
  salesStart?: ISODateTime; // solo cuenta para la venta online
  salesEnd?: ISODateTime;
  active: boolean;         // apagado: no se vende, pero lo vendido sigue valiendo
  note?: string;           // una línea en la web: «hasta el 1 de diciembre»
}

export interface TicketEvent {
  id: ID;
  gigId: ID;
  name: string;
  description: string;
  image?: string;
  priceCents: number;      // el más barato de los que se venden online («desde»); lo calcula la suite al guardar
  capacity: number;
  maxPerOrder: number;
  salesEnabled: boolean;   // venta online abierta (la taquilla no depende de esto)
  salesEnd?: ISODateTime;
  types?: TicketType[];    // sin tipos: una sola «general» a priceCents
  bizumPhone?: string;     // a qué número se hace el Bizum en la taquilla
}

export type OrderStatus = "pendiente" | "pagado" | "devuelto" | "caducado";
export type OrderChannel = "online" | "puerta";
/* Cómo se cobró en la taquilla. Online siempre es Stripe. */
export type DoorMethod = "efectivo" | "bizum" | "tarjeta";

export interface OrderItem { typeId: ID; name: string; qty: number; unitCents: number }

export interface Order {
  id: ID;
  number: number;          // #0143
  eventId: ID;
  email: string;           // en taquilla puede ir vacío (efectivo, Bizum)
  name?: string;
  qty: number;
  amountCents: number;
  items?: OrderItem[];     // los pedidos de antes de haber tipos no lo llevan: todo «general»
  channel?: OrderChannel;  // sin canal: online
  method?: DoorMethod;     // solo taquilla
  soldBy?: string;         // quién vendió en taquilla
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
  typeId?: ID;             // tipo de entrada (sin él: «general»)
  typeName?: string;       // copiado al emitirla, por si luego se renombra el tipo
  holder?: string;         // nombre en invitaciones
  status: TicketStatus;
  email?: string;          // invitación mandada por email: a quién
  sentAt?: ISODateTime;    // y cuándo (la última vez)
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
  lyricSync?: LyricSync;   // letra con tiempos, para videolyrics
  lyricVideo?: LyricVideo; // cómo se ve el videolyric
}

/* Letra sincronizada con la pista de directo. Tiempos en segundos desde
   el inicio del audio. Guarda su propia copia del texto: si luego se
   cambia la letra en ensayos, los tiempos no se descuadran solos. */
export type LyricEmphasis = "fuerte" | "impacto" | "temblor";
export interface LyricWord { text: string; t?: number; em?: LyricEmphasis }   // t: solo si se marcó a mano
export interface LyricLine { id: ID; sectionId?: ID; section?: string; t?: number; end?: number; words: LyricWord[] }
export interface LyricSync {
  audioName: string;       // la pista con la que se sincronizó
  durationSec: number;     // y su duración exacta: el vídeo dura esto
  lines: LyricLine[];
  updatedAt: ISODateTime;
}

/* Diseño del videolyric. Todo es determinista (la «suerte» sale de la
   semilla): el mismo diseño da siempre el mismo vídeo. */
export type LyricMode = "linea" | "palabra" | "karaoke" | "una";
export type LyricAnim = "fade" | "subir" | "zoom" | "maquina" | "glitch" | "parpadeo" | "desenfoque" | "corte";
export interface LyricStyle {
  mode: LyricMode;
  size: "s" | "m" | "l" | "xl";
  pos: "centro" | "arriba" | "abajo" | "azar";
  font: "jost" | "fina" | "mono";
  caps: "normal" | "mayus" | "minus";
  color: "crema" | "senal";
  box: boolean;            // franja detrás del texto
  in: LyricAnim;
  out: LyricAnim;
  variar: boolean;         // cada línea con su entrada y sitio al azar (fijo por semilla)
}
export type LyricBg =
  | { kind: "gen"; id: string; tint: "senal" | "crema" }
  | { kind: "media"; id: string; name: string; fit: "cover" | "contain" };   // archivo guardado en este ordenador
export interface LyricVideo {
  style: LyricStyle;
  preset?: string;
  seed: number;
  bg: LyricBg;
  bySection: Record<ID, LyricBg>;   // sectionId → fondo propio
  overlay: { scan: boolean; grain: boolean; vignette: boolean };
  width: number;
  height: number;
  fps: number;
  updatedAt: ISODateTime;
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
export interface RiderInput { ch: string; source: string; mic: string; stand: string; dest?: string }  // dest: FOH + IEM, solo IEM…
export interface StagePos { memberId: ID; label: string; detail?: string; x: number; y: number }  // % del escenario; detail: «CH 01-06 · 13-14»
/** Material propio: qué traemos y de quién es. owner es el nombre tal cual
    sale en el papel («Pau», «banda», «sala»), así el papel no depende de members. */
export interface RiderGear { id: string; qty: number; item: string; owner: string; note?: string }
export interface RiderBlock { id: string; name: string; enabled: boolean; body?: string }

export interface Rider {
  id: ID;
  name: string;            // banda completa, acústico…
  version: string;
  blocks: RiderBlock[];
  inputs: RiderInput[];
  stage: StagePos[];
  stageSize: string;       // «6 × 4 m»
  gear?: RiderGear[];      // bloque «material» (los riders antiguos no lo traen)
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
export interface Product {
  id: ID; name: string; priceCents: number; costCents: number; variants: Variant[]; archived: boolean; published: boolean;
  color: "senal" | "crema" | "tubo" | "noche"; info?: string;
  /** En la web (si está publicado): «reservar» = se pide y se paga al recogerlo;
      «comprar» = se paga online con Stripe. Lo agotado siempre se encarga, sin pagar. */
  webMode?: WebMode;
}
export type WebMode = "reservar" | "comprar";
/** Lo que manda la web al comprar merch online. */
export interface MerchCheckout { productId: ID; variantId: ID; qty: number; name: string; email: string; phone?: string; note?: string }

export type MoveKind = "venta" | "reserva" | "regalo" | "reposicion" | "recuento";
export type PayMethod = "efectivo" | "bizum" | "tarjeta" | "otro" | "online";   // online: Stripe, desde la web

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
  online?: "pendiente" | "pagado"; // compra en la web: pagando ahora / pagada (por entregar hasta que se entrega)
  paidAt?: ISODateTime;
  refundedAt?: ISODateTime; // devuelta en Stripe después de entregarla: deja de contar como ingreso
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
  /* Compra online (producto en modo «comprar»): nace ya apartada y espera el pago.
     pendiente → pagado (por entregar), o caducado si no paga en 30 min, o devuelto. */
  pay?: "pendiente" | "pagado" | "caducado" | "devuelto";
  amountCents?: number;
  paidAt?: ISODateTime;
  refundedAt?: ISODateTime;
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

/* Ajustes de la banda: un documento por tema (id «checklist»…). */
export interface Task { key: string; name: string }
export interface Settings { id: ID; tasks?: Task[]; gear?: RiderGear[] }  // gear: doc «material», nuestra lista de material

export interface AuditEntry { id: ID; who: string; action: string; at: ISODateTime }

// ---------- avisos a la lista (newsletter) ----------
export interface NewsInput { topic: Topic; subject: string; title: string; body: string; ctaLabel?: string; ctaUrl?: string; image?: string }
export interface NewsStats {
  total: number;
  byTopic: Record<Topic, number>;
  recent: NewsCampaign[];
}
export interface NewsCampaign { id: number; name: string; subject: string; sentAt?: string; topic?: Topic; delivered: number; opened: number; clicked?: number; unsubscribed?: number }
export interface NewsAdd { email: string; name?: string; city?: string; topics: Topic[]; confirm: boolean; consent: boolean }
export interface NewsContact { email: string; name?: string; city?: string; topics: Topic[]; createdAt?: string }
