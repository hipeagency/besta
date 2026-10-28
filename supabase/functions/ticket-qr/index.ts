/* PNG del QR de una entrada, para los emails (Gmail no enseña imágenes
   incrustadas). El QR solo lleva el código, que no es secreto por sí
   solo: en la puerta lo valida scan_ticket. Por eso puede ser pública
   y cachearse para siempre (un código nunca cambia de contenido). */
// @deno-types="npm:@types/qrcode@1"
import QRCode from "npm:qrcode@1";

const CODE_RE = /^(BST|INV)-[A-Z0-9]{4,10}$/;

Deno.serve(async req => {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Método no permitido.", { status: 405 });
  const code = (new URL(req.url).searchParams.get("code") ?? "").trim().toUpperCase();
  if (!CODE_RE.test(code)) return new Response("Código no válido.", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });

  try {
    const png = await QRCode.toBuffer(`BESTA:T:${code}`, {
      type: "png",
      errorCorrectionLevel: "M",
      margin: 1,
      width: 480,
      color: { dark: "#0F0B08FF", light: "#FFFFFFFF" },
    });
    return new Response(req.method === "HEAD" ? null : new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    console.error("qr", e);
    return new Response("No se pudo generar el QR.", { status: 500 });
  }
});
