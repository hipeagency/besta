/* Cron cada hora: «gracias por venir» el día después del concierto.
   Sale una sola vez por pedido (thanksSentAt), así que da igual que
   corra 24 veces. El recordatorio del día antes se quitó. */
import { env } from "../_shared/env.ts";
import { thanksEmail } from "../_shared/emails.ts";
import { checkCronSecret, json, serve } from "../_shared/http.ts";
import { sendOnce } from "../_shared/orders.ts";
import { type Admin, adminClient } from "../_shared/supabase.ts";

/* «Ayer» en hora de Madrid, que es donde tocamos. */
function madridDay(offsetDays: number) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

async function paidOrdersOn(db: Admin, date: string): Promise<string[]> {
  const { data: gigs, error } = await db.from("gigs").select("id").eq("date", date).neq("doc->>status", "cancelado");
  if (error) throw error;
  if (!gigs?.length) return [];
  const { data: evs, error: e2 } = await db.from("events").select("id").in("gig_id", gigs.map(g => g.id));
  if (e2) throw e2;
  if (!evs?.length) return [];
  const { data: orders, error: e3 } = await db.from("orders").select("id").in("event_id", evs.map(e => e.id)).eq("status", "pagado");
  if (e3) throw e3;
  return (orders ?? []).map(o => o.id);
}

serve(["POST"], async req => {
  checkCronSecret(req, env("CRON_SECRET"));
  const db = adminClient();
  const out = { thanks: 0, errors: 0 };

  for (const id of await paidOrdersOn(db, madridDay(-1))) {
    try {
      if (await sendOnce(db, id, "thanksSentAt", thanksEmail, "gracias")) out.thanks++;
    } catch (e) {
      // Uno que falla no para a los demás; la próxima hora se reintenta.
      console.error("thanksSentAt", id, e);
      out.errors++;
    }
  }
  return json(req, { ok: true, ...out });
});
