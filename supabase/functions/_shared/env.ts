/* Secretos y configuración. Todo sale de `supabase secrets set`;
   si falta algo, mejor un error claro en el log que un fallo raro después. */

export function env(name: string): string {
  const v = Deno.env.get(name)?.trim();
  if (!v) throw new Error(`Falta el secreto ${name} (supabase secrets set ${name}=…)`);
  return v;
}

export function optEnv(name: string, fallback = ""): string {
  return Deno.env.get(name)?.trim() || fallback;
}

/* Sin barra final: así `${siteUrl()}/entradas/` nunca queda con «//». */
export const siteUrl = () => env("SITE_URL").replace(/\/+$/, "");

/* La URL pública de las funciones (para el QR de los emails). */
export const functionsUrl = () => env("SUPABASE_URL").replace(/\/+$/, "") + "/functions/v1";

export const list = (v: string) => v.split(",").map(s => s.trim()).filter(Boolean);
