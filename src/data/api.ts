/* =========================================================
   La única puerta a los datos. Las pantallas importan `api` de
   aquí y no saben si detrás hay datos de prueba (mock.ts, en el
   navegador) o Supabase (supabase.ts).

   Se elige al compilar con PUBLIC_DATA_MODE:
     - "prueba" (por defecto): sin backend, para enseñar y probar.
     - "supabase": datos reales; necesita PUBLIC_SUPABASE_URL y
       PUBLIC_SUPABASE_ANON_KEY.
   ========================================================= */
import { mockApi, subscribe as mockSubscribe, uid } from "./mock";
import { supabaseApi, subscribeLive } from "./supabase";

export const DATA_MODE: "prueba" | "supabase" = import.meta.env.PUBLIC_DATA_MODE === "supabase" ? "supabase" : "prueba";

export type Api = typeof mockApi;
export const api: Api = DATA_MODE === "supabase" ? (supabaseApi as Api) : mockApi;
export const subscribe = DATA_MODE === "supabase" ? subscribeLive : mockSubscribe;

export { uid };
export type { Collection, DB } from "./mock";
