/* Las formas de los docs que tocan las funciones. Copia reducida de
   src/data/types.ts (las funciones se despliegan solas, sin el front),
   más los campos que solo escribe el servidor. */

export type OrderStatus = "pendiente" | "pagado" | "devuelto" | "caducado";

export interface Order {
  id: string;
  number: number;
  eventId: string;
  email: string;
  name?: string;
  qty: number;
  amountCents: number;
  status: OrderStatus;
  newsletter: boolean;
  createdAt: string;
  token: string;
  // del servidor
  paidAt?: string;
  paymentIntent?: string;
  emailSentAt?: string;
  refundedAt?: string;
  refundEmailAt?: string;
  reminderSentAt?: string;
  thanksSentAt?: string;
}

export interface Ticket {
  code: string;
  orderId?: string;
  eventId: string;
  kind: "general" | "invitacion";
  holder?: string;
  status: "valida" | "usada" | "cancelada";
}

export interface TicketEvent {
  id: string;
  gigId: string;
  name: string;
  description: string;
  image?: string;
  priceCents: number;
  capacity: number;
  maxPerOrder: number;
  salesEnabled: boolean;
  salesEnd?: string;
}

export interface Gig {
  id: string;
  date: string;
  time: string;
  doors?: string;
  city: string;
  venue: string;
  address?: string;
  status: "tentativo" | "confirmado" | "cancelado";
  published: boolean;
  ticketing: "propia" | "externa" | "ninguna";
  externalUrl?: string;
  schedule: unknown[];
  contacts: unknown[];
  checklist: Record<string, boolean>;
  bandsintownId?: string;
  [k: string]: unknown;
}

export interface Variant { id: string; label: string; stock: number }
export interface Product { id: string; name: string; priceCents: number; variants: Variant[]; archived?: boolean; published?: boolean }

export type Topic = "fechas" | "merch" | "lanzamientos";
export const TOPICS: Topic[] = ["fechas", "merch", "lanzamientos"];
