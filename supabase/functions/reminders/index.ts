/* Cron cada hora: recordatorio el día antes del concierto y «gracias
   por venir» el día después. Cada email sale una sola vez por pedido
   (reminderSentAt / thanksSentAt), así que da igual que corra 24 veces. */
import { env } from "../_shared/env.ts";
import { reminderEmail, thanksEmail } from "../_shared/emails.ts";
import { checkCronSecret, json, serve } from "../_shared/http.ts";
import { sendOnce } from "../_shared/orders.ts";
import { type Admin, adminClient } from "../_shared/supabase.ts";

/* «Mañana» y «ayer» en hora de Madrid, que es donde tocamos. */
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
  const out = { reminders: 0, thanks: 0, errors: 0 };

  const jobs: [string, "reminderSentAt" | "thanksSentAt", typeof reminderEmail, "reminders" | "thanks"][] = [
    [madridDay(1), "reminderSentAt", reminderEmail, "reminders"],
    [madridDay(-1), "thanksSentAt", thanksEmail, "thanks"],
  ];
  for (const [date, field, build, key] of jobs) {
    for (const id of await paidOrdersOn(db, date)) {
      try {
        if (await sendOnce(db, id, field, build, key === "reminders" ? "recordatorio" : "gracias")) out[key]++;
      } catch (e) {
        // Uno que falla no para a los demás; la próxima hora se reintenta.
        console.error(field, id, e);
        out.errors++;
      }
    }
  }
  return json(req, { ok: true, ...out });
});
