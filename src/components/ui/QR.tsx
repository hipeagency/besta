/* QR de una entrada. Solo lleva el código opaco (BESTA:T:BST-7K2Q):
   ningún dato personal, la validez la decide el servidor. */
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export const qrPayload = (code: string) => `BESTA:T:${code}`;

/* Con `text`, el QR lleva ese texto tal cual (p. ej. el enlace de pago de Stripe en taquilla). */
export function QR({ code, text, size = 220, label }: { code: string; text?: string; size?: number; label?: string }) {
  const [svg, setSvg] = useState<string>("");
  useEffect(() => {
    let alive = true;
    QRCode.toString(text ?? qrPayload(code), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0F0B08", light: "#FFFFFF" } })
      .then(s => { if (alive) setSvg(s); });
    return () => { alive = false; };
  }, [code, text]);
  return (
    <div role="img" aria-label={label ?? `Código QR de la entrada ${code}`}
      className="bg-white rounded-xl p-2 [&>svg]:w-full [&>svg]:h-full"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }} />
  );
}
