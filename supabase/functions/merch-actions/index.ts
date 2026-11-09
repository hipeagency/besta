/* Acciones de la suite sobre compras de merch online: de momento,
   devolver. Solo quien tiene el módulo «merch» (se pregunta a la base
   con su propio JWT, como en order-actions). */
import { HttpError, json, readJson, serve, text } from "../_shared/http.ts";
import { refundMerchNow } from "../_shared/merch.ts";
import { adminClient, userClient } from "../_shared/supabase.ts";

serve(["POST"], async req => {
  const { data: allowed, error: permErr } = await userClient(req).rpc("can", { scope: "merch" });
  if (permErr) throw new HttpError("Inicia sesión de nuevo.", 401);
  if (allowed !== true) throw new HttpError("Sin permiso para merch.", 403);

  const body = await readJson(req);
  const requestId = text(body.requestId, 100, "el pedido", true)!;
  switch (body.action) {
    case "refund":
      await refundMerchNow(adminClient(), requestId);
      return json(req, { ok: true });
    default:
      throw new HttpError("Acción desconocida.");
  }
});
