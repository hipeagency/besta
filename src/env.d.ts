/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** "prueba" (datos en el navegador) o "supabase" (datos reales). */
  readonly PUBLIC_DATA_MODE?: "prueba" | "supabase";
  readonly PUBLIC_SUPABASE_URL?: string;
  /** Clave pública (anon): segura en el navegador, la protección la dan las políticas RLS. */
  readonly PUBLIC_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
