/* Respuestas JSON, CORS y errores con mensaje para quien usa la web. */
import { list, optEnv } from "./env.ts";

/* Error «esperado»: su mensaje (en castellano) llega tal cual al navegador. */
export class HttpError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/* La web (SITE_URL) y las previews (ALLOWED_ORIGINS, admite «*» como
   comodín: https://*.workers.dev). Sin coincidencia no se devuelve
   ningún origen y el navegador bloquea la respuesta. */
function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  const allowed = [optEnv("SITE_URL").replace(/\/+$/, ""), ...list(optEnv("ALLOWED_ORIGINS"))].filter(Boolean);
  for (const a of allowed) {
    if (a === origin) return origin;
    if (a.includes("*")) {
      const re: RegExp = new RegExp("^" + a.split("*").map(s => s.replace(/[.+?^${}()|[\]\\/]/g, "\\$&")).join("[a-z0-9-]+") + "$", "i");
      if (re.test(origin)) return origin;
    }
  }
  return null;
}

export function corsHeaders(req: Request): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Vary": "Origin",
  };
  const o = allowedOrigin(req.headers.get("origin"));
  if (o) h["Access-Control-Allow-Origin"] = o;
  return h;
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8" },
  });
}

/* Envoltorio común: preflight, método, cuerpo JSON y errores.
   Lo inesperado se registra entero pero al navegador le llega un mensaje corto. */
export function serve(
  methods: string[],
  handler: (req: Request) => Promise<Response>,
) {
  Deno.serve(async req => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
    if (!methods.includes(req.method)) return json(req, { error: "Método no permitido." }, 405);
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof HttpError) return json(req, { error: e.message }, e.status);
      console.error(e);
      return json(req, { error: "Algo ha fallado. Inténtalo de nuevo en un momento." }, 500);
    }
  });
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const b = await req.json();
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error();
    return b as T;
  } catch {
    throw new HttpError("Petición mal formada.");
  }
}

/* Cron: el secreto viaja en una cabecera; comparación en tiempo constante. */
export function checkCronSecret(req: Request, secret: string) {
  const got = new TextEncoder().encode(req.headers.get("x-cron-secret") ?? "");
  const want = new TextEncoder().encode(secret);
  let diff = got.length ^ want.length;
  for (let i = 0; i < want.length; i++) diff |= want[i] ^ (got[i] ?? 0);
  if (diff !== 0) throw new HttpError("No autorizado.", 401);
}

// ---------- validación ----------
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Texto recortado y con tope de longitud; vacío → undefined. */
export function text(v: unknown, max: number, field: string, required = false): string | undefined {
  if (v === undefined || v === null || v === "") {
    if (required) throw new HttpError(`Falta ${field}.`);
    return undefined;
  }
  if (typeof v !== "string") throw new HttpError(`Revisa ${field}.`);
  const s = v.trim();
  if (!s) {
    if (required) throw new HttpError(`Falta ${field}.`);
    return undefined;
  }
  if (s.length > max) throw new HttpError(`${field[0].toUpperCase() + field.slice(1)}: máximo ${max} caracteres.`);
  return s;
}

export function email(v: unknown, msg = "Revisa el email."): string {
  if (typeof v !== "string" || v.length > 254 || !EMAIL_RE.test(v.trim())) throw new HttpError(msg);
  return v.trim().toLowerCase();
}
