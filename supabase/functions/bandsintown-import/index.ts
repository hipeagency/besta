/* Trae los conciertos de Bandsintown a la agenda de bolos (cron diario).
   Bandsintown es de donde lo cogen Spotify y compañía, así que lo que
   se publica ahí es la fuente de verdad de fecha, hora y sitio; todo lo
   demás del bolo (horarios, contactos, caché, entradas propias…) es de
   la suite y no se toca. Nunca borra: un bolo que desaparece de
   Bandsintown lo revisa la banda. */
import { env } from "../_shared/env.ts";
import { checkCronSecret, json, serve } from "../_shared/http.ts";
import { adminClient, patchDoc } from "../_shared/supabase.ts";
import type { Gig } from "../_shared/types.ts";

// Por id y no por nombre: hay otro grupo llamado Besta.
const ARTIST = "id_15661145";

interface BitEvent {
  id: string | number;
  datetime?: string;
  url?: string;
  venue?: { name?: string; city?: string; street_address?: string; location?: string };
  offers?: { type?: string; url?: string; status?: string }[];
}

/* Lo que nos interesa de cada evento, ya limpio. */
interface Synced { date: string; time: string; venue: string; city: string; externalUrl: string }

/* Bandsintown pega su app_id a las URLs: fuera, que la web es pública. */
function cleanUrl(u?: string) {
  if (typeof u !== "string" || !u.trim()) return "";
  try {
    const url = new URL(u.trim());
    url.searchParams.delete("app_id");
    return url.toString();
  } catch {
    return u.trim().split(/[?&]app_id=/)[0];
  }
}

/* «2026-08-15T21:00:00» → fecha y hora; 00:00 = hora sin anunciar. */
function normalize(raw: BitEvent): Synced & { ticketsUrl: string; address?: string } {
  const dt = raw.datetime ?? "";
  const hhmm = dt.slice(11, 16);
  const offers = Array.isArray(raw.offers) ? raw.offers : [];
  const offer = offers.find(o => /ticket/i.test(o?.type ?? "")) ?? offers[0];
  const ticketsUrl = cleanUrl(offer?.url);
  return {
    date: dt.slice(0, 10),
    time: hhmm && hhmm !== "00:00" ? hhmm : "",
    venue: raw.venue?.name?.trim() ?? "",
    city: raw.venue?.city?.trim() ?? "",
    address: raw.venue?.street_address?.trim() || undefined,
    externalUrl: ticketsUrl || cleanUrl(raw.url),
    ticketsUrl,
  };
}

const FIELDS: (keyof Synced)[] = ["date", "time", "venue", "city", "externalUrl"];

serve(["POST"], async req => {
  checkCronSecret(req, env("CRON_SECRET"));

  const url = `https://rest.bandsintown.com/artists/${ARTIST}/events?app_id=${encodeURIComponent(env("BANDSINTOWN_APP_ID"))}&date=upcoming`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Bandsintown HTTP ${res.status}: ${raw.slice(0, 200)}`);
  const events = JSON.parse(raw) as BitEvent[];
  if (!Array.isArray(events)) throw new Error(`Bandsintown no ha devuelto una lista: ${raw.slice(0, 200)}`);

  const db = adminClient();
  const { data: rows, error } = await db.from("gigs").select("id, doc");
  if (error) throw error;
  const gigs = (rows ?? []) as { id: string; doc: Gig & { bandsintown?: Synced } }[];
  const byBit = new Map(gigs.filter(g => g.doc.bandsintownId).map(g => [String(g.doc.bandsintownId), g]));

  const summary = { total: events.length, created: [] as string[], updated: [] as string[], linked: [] as string[], unchanged: 0, skipped: 0 };
  const importedAt = new Date().toISOString();

  for (const raw of events) {
    const bitId = String(raw.id ?? "");
    const ev = normalize(raw);
    if (!bitId || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date)) { summary.skipped++; continue; }
    const synced: Synced = { date: ev.date, time: ev.time, venue: ev.venue, city: ev.city, externalUrl: ev.externalUrl };

    let gig = byBit.get(bitId);
    // Un bolo dado de alta a mano en la suite el mismo día: se enlaza en vez de duplicarlo.
    if (!gig) {
      gig = gigs.find(g => !g.doc.bandsintownId && g.doc.date === ev.date && g.doc.status !== "cancelado");
      if (gig) {
        await patchDoc(db, "gigs", gig.id, { bandsintownId: bitId, bandsintown: synced, importedAt });
        gig.doc.bandsintownId = bitId;
        summary.linked.push(`${ev.date} · ${gig.doc.city || ev.city}`);
        continue;
      }
    }

    if (!gig) {
      const id = `gig-bit-${bitId}`;
      const doc: Gig & Record<string, unknown> = {
        id, date: ev.date, time: ev.time, city: ev.city, venue: ev.venue,
        ...(ev.address ? { address: ev.address } : {}),
        status: "confirmado", published: true,
        ticketing: ev.ticketsUrl ? "externa" : "ninguna",
        ...(ev.externalUrl ? { externalUrl: ev.externalUrl } : {}),
        schedule: [], contacts: [], checklist: {},
        bandsintownId: bitId, bandsintown: synced, importedAt,
      };
      const { error: insErr } = await db.from("gigs").upsert({ id, doc }, { onConflict: "id", ignoreDuplicates: true });
      if (insErr) throw insErr;
      summary.created.push(`${ev.date} · ${ev.city} · ${ev.venue}`);
      continue;
    }

    // Solo lo que ha cambiado EN Bandsintown desde la última importación
    // (doc.bandsintown); si la banda lo retocó en la suite, se respeta.
    const last = gig.doc.bandsintown;
    const patch: Record<string, unknown> = {};
    for (const f of FIELDS) {
      const before = last ? last[f] : gig.doc[f] ?? "";
      if (synced[f] !== before && synced[f]) patch[f] = synced[f];
    }
    if (Object.keys(patch).length) {
      await patchDoc(db, "gigs", gig.id, { ...patch, bandsintown: synced, importedAt });
      summary.updated.push(`${ev.date} · ${ev.city}: ${Object.keys(patch).join(", ")}`);
    } else {
      if (!last) await patchDoc(db, "gigs", gig.id, { bandsintown: synced, importedAt });
      summary.unchanged++;
    }
  }

  console.log("bandsintown", JSON.stringify(summary));
  return json(req, { ok: true, ...summary });
});
