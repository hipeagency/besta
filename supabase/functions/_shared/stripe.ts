import Stripe from "npm:stripe@17";
import { env } from "./env.ts";

/* Cliente con fetch (Deno no tiene el http de Node que usa por defecto). */
export function stripe() {
  return new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });
}

export { Stripe };
