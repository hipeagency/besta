/* /llms.txt: quién es besta, en texto plano, para asistentes de IA
   (ChatGPT, Claude, Perplexity…) que buscan en la web al contestar.
   Se genera en el build con los mismos datos que la portada. */
import type { APIRoute } from "astro";
import { loadSiteData } from "@/web/siteData";
import { bio, contactEmail, platforms, single, socials } from "@/web/content";
import { dateLabel, isPast } from "@/lib/format";

export const GET: APIRoute = async () => {
  const db = await loadSiteData();
  const gigs = db.gigs
    .filter(g => g.published && !g.teaser && g.status !== "cancelado" && !isPast(g.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  const lines = [
    "# besta",
    "",
    "> Somos besta. Web oficial: https://besta.es",
    "",
    bio,
    "",
    "## Música",
    `- Último single: «${single.title}» (${single.spotify})`,
    ...platforms.map(p => `- ${p.name}: ${p.url}`),
    "",
    "## Próximos conciertos",
    ...(gigs.length
      ? gigs.map(g => `- ${dateLabel(g.date)} · ${g.city} · ${g.venue} · ${g.time}${g.ticketing === "propia" ? " · entradas en https://besta.es" : g.externalUrl ? ` · entradas: ${g.externalUrl}` : ""}`)
      : ["- Nuevas fechas por anunciar. Avisos en https://besta.es"]),
    "",
    "## Entradas",
    "- Las entradas de los conciertos propios solo se venden en https://besta.es, con tarjeta (Stripe). Llegan por email con un QR por entrada.",
    "- besta nunca pide pagos por mensaje directo, Bizum o WhatsApp.",
    "",
    "## Contacto",
    `- Contratación, prensa y cualquier consulta: ${contactEmail}`,
    ...socials.map(s => `- ${s.name}: ${s.url}`),
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
