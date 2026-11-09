/* Comprar merch online (producto en modo «comprar»): aparta el stock y
   devuelve la URL de pago de Stripe. Pública: la llama la web. El resto
   del flujo (pagado, caducado, devuelto) va en stripe-webhook; todo en
   _shared/merch.ts. */
import { json, readJson, serve } from "../_shared/http.ts";
import { merchCheckout } from "../_shared/merch.ts";
import { adminClient } from "../_shared/supabase.ts";

serve(["POST"], async req => json(req, await merchCheckout(adminClient(), await readJson(req))));
