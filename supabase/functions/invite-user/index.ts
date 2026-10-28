/* Alta de alguien en la suite (solo admin). Supabase Auth manda el
   email de invitación; aquí queda su ficha de miembro enlazada a la cuenta. */
import { siteUrl } from "../_shared/env.ts";
import { email, HttpError, json, readJson, serve, text } from "../_shared/http.ts";
import { type Admin, adminClient, userClient } from "../_shared/supabase.ts";

const ROLES = ["admin", "musico", "staff"] as const;
type Role = typeof ROLES[number];

serve(["POST"], async req => {
  const { data: isAdmin, error: permErr } = await userClient(req).rpc("is_admin");
  if (permErr) throw new HttpError("Inicia sesión de nuevo.", 401);
  if (isAdmin !== true) throw new HttpError("Solo un admin puede invitar.", 403);

  const b = await readJson(req);
  const name = text(b.name, 80, "el nombre", true)!;
  const mail = email(b.email);
  const role = b.role as Role;
  if (!ROLES.includes(role)) throw new HttpError("Elige un rol: admin, músico o staff.");
  let scopes: string[] | undefined;
  if (b.scopes !== undefined && b.scopes !== null) {
    if (!Array.isArray(b.scopes) || b.scopes.some(s => typeof s !== "string" || !/^[a-z]{2,20}$/.test(s))) throw new HttpError("Revisa los permisos.");
    scopes = Array.from(new Set(b.scopes as string[]));
  }
  const instrument = text(b.instrument, 60, "el instrumento") ?? (role === "staff" ? "puerta y merch" : "");
  const band = typeof b.band === "boolean" ? b.band : undefined;

  const db = adminClient();
  const { userId, invited } = await inviteOrFind(db, mail, name);

  // ¿Ya tiene ficha? (miembro antiguo sin login, o invitado otra vez)
  const byUser = await db.from("members").select("id, doc").eq("user_id", userId).maybeSingle();
  if (byUser.error) throw byUser.error;
  const byEmail = byUser.data ? byUser : await db.from("members").select("id, doc").eq("email", mail).maybeSingle();
  if (byEmail.error) throw byEmail.error;
  const existing = byEmail.data;

  const invitedAt = new Date().toISOString();
  const memberId = existing?.id ?? await freeId(db, name);
  const doc = {
    ...(existing?.doc as Record<string, unknown> ?? {}),
    id: memberId, name, instrument, role, email: mail, active: true, invitedAt,
    ...(scopes ? { scopes } : {}),
    ...(band !== undefined ? { band } : {}),
  };
  const { error: upErr } = await db.from("members").upsert({ id: memberId, user_id: userId, email: mail, doc }, { onConflict: "id" });
  if (upErr) throw new HttpError(upErr.code === "23505" ? "Ese email ya está en otra ficha." : "No se ha podido guardar la ficha.");

  return json(req, { ok: true, id: memberId, invited, member: doc });
});

/* Invitación de Auth; si ya tenía cuenta no hace falta invitar, solo enlazar. */
async function inviteOrFind(db: Admin, mail: string, name: string): Promise<{ userId: string; invited: boolean }> {
  const { data, error } = await db.auth.admin.inviteUserByEmail(mail, { redirectTo: `${siteUrl()}/suite/`, data: { name } });
  if (!error && data.user) return { userId: data.user.id, invited: true };
  if (error && !/already|registered|exists/i.test(error.message)) {
    console.error("invite", error);
    throw new HttpError("No se ha podido mandar la invitación.");
  }
  for (let page = 1; page <= 50; page++) {
    const { data: l, error: e } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (e) throw e;
    const u = l.users.find(x => x.email?.toLowerCase() === mail);
    if (u) return { userId: u.id, invited: false };
    if (l.users.length < 200) break;
  }
  throw new HttpError("Esa cuenta existe pero no la encontramos. Inténtalo otra vez.");
}

/* id legible a partir del nombre («Ana Pérez» → «ana-perez»), sin repetir. */
async function freeId(db: Admin, name: string) {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "miembro";
  const { data, error } = await db.from("members").select("id").like("id", `${base}%`);
  if (error) throw error;
  const taken = new Set((data ?? []).map(r => r.id));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return crypto.randomUUID();
}
