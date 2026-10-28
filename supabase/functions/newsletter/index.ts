/* Avisos a la lista desde la suite (solo admin): cuántos hay por interés,
   prueba a un email y campaña de Brevo a quien eligió ese interés
   (concierto, merch o canción nueva). */
import { email, HttpError, json, readJson, serve, text } from "../_shared/http.ts";
import { newsletterCounts, recentCampaigns, sendCampaign, sendEmail, TOPICS, type Topic } from "../_shared/brevo.ts";
import { newsletterEmail } from "../_shared/emails.ts";
import { userClient } from "../_shared/supabase.ts";

const url = (v: unknown, field: string) => {
  const s = text(v, 500, field);
  if (s && !/^(https:\/\/|\/)/.test(s)) throw new HttpError(`Revisa ${field}: tiene que empezar por https:// o /.`);
  return s;
};

serve(["POST"], async req => {
  const { data: isAdmin, error } = await userClient(req).rpc("is_admin");
  if (error) throw new HttpError("Inicia sesión de nuevo.", 401);
  if (isAdmin !== true) throw new HttpError("Solo un admin puede avisar a la lista.", 403);

  const b = await readJson(req);
  if (b.action === "stats") {
    const [counts, recent] = await Promise.all([newsletterCounts(), recentCampaigns(5).catch(() => [])]);
    return json(req, { ...counts, recent });
  }

  const topic = b.topic as Topic;
  if (!(topic in TOPICS)) throw new HttpError("Elige de qué avisas: concierto, merch o canción.");
  const info = {
    topic,
    subject: text(b.subject, 120, "el asunto", true)!,
    title: text(b.title, 120, "el titular", true)!,
    body: text(b.body, 2000, "el texto", true)!,
    ctaLabel: text(b.ctaLabel, 40, "el botón"),
    ctaUrl: url(b.ctaUrl, "el enlace del botón"),
    image: url(b.image, "la imagen"),
  };

  if (b.action === "test") {
    const to = email(b.to, "Revisa el email de la prueba.");
    const mail = newsletterEmail(info, "#");
    await sendEmail({ email: to }, { ...mail, subject: `[prueba] ${mail.subject}` }, { tags: ["aviso-prueba"] });
    return json(req, { ok: true });
  }
  if (b.action !== "send") throw new HttpError("Acción desconocida.");
  const mail = newsletterEmail(info);
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const res = await sendCampaign(topic, { ...mail, name: `${TOPICS[topic]} · ${info.title} · ${stamp}`, preheader: info.body.slice(0, 110) });
  return json(req, res);
});
