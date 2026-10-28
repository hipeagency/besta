/* Clientes de Supabase. El de servidor salta las políticas (solo para lo
   que la web pública no puede hacer sola); el de usuario las respeta. */
import { createClient } from "npm:@supabase/supabase-js@2";
import { env } from "./env.ts";
import { HttpError } from "./http.ts";

const opts = { db: { schema: "besta" }, auth: { persistSession: false, autoRefreshToken: false } } as const;

export function adminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), opts);
}

export type Admin = ReturnType<typeof adminClient>;

/* Con el JWT de quien llama: besta.can() y besta.is_admin() le ven a él. */
export function userClient(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) throw new HttpError("Inicia sesión de nuevo.", 401);
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    ...opts,
    global: { headers: { Authorization: auth } },
  });
}

/* Las funciones SQL avisan con `raise exception '…'` en castellano:
   ese texto es el que enseñamos. */
export function dbError(e: { message?: string } | null, fallback = "No se ha podido guardar."): never {
  const msg = e?.message?.trim();
  throw new HttpError(msg && !/permission denied|violates|syntax|relation/i.test(msg) ? msg : fallback);
}

type Doc = Record<string, unknown>;
export interface Row<T = Doc> { id: string; doc: T; updated_at: string }

export async function getRow<T = Doc>(db: Admin, table: string, id: string): Promise<Row<T> | null> {
  const { data, error } = await db.from(table).select("id, doc, updated_at").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Row<T> | null;
}

/* Fusiona `patch` en el doc sin pisar lo que otro haya cambiado entre
   medias: la escritura solo entra si updated_at sigue igual (si no,
   se relee y se reintenta). Con `unless`, no hace nada si el doc ya
   tiene ese campo: así un email «solo una vez» no sale dos veces
   aunque Stripe o el cron lleguen a la vez. Devuelve el doc nuevo,
   o null si no había fila o `unless` ya estaba puesto. */
export async function patchDoc<T = Doc>(
  db: Admin, table: string, id: string,
  patch: Doc | ((doc: T) => Doc | null),
  unless?: string,
): Promise<T | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await getRow<T>(db, table, id);
    if (!row) return null;
    const cur = row.doc as Doc;
    if (unless && cur[unless]) return null;
    const p = typeof patch === "function" ? patch(row.doc) : patch;
    if (!p) return null;
    const next: Doc = { ...cur, ...p };
    for (const k of Object.keys(p)) if (p[k] === undefined || p[k] === null) delete next[k];
    const { data, error } = await db.from(table).update({ doc: next })
      .eq("id", id).eq("updated_at", row.updated_at).select("doc");
    if (error) throw error;
    if (data?.length) return data[0].doc as T;
  }
  throw new Error(`No se pudo actualizar ${table} ${id}: demasiados cambios a la vez`);
}
