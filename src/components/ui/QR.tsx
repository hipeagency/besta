/* QR de una entrada. Solo lleva el código opaco (BESTA:T:BST-7K2Q):
   ningún dato personal, la validez la decide el servidor. */
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export const qrPayload = (code: string) => `BESTA:T:${code}`;

export function QR({ code, size = 220, label }: { code: string; size?: number; label?: string }) {
  const [svg, setSvg] = useState<string>("");
  useEffect(() => {
    let alive = true;
    QRCode.toString(qrPayload(code), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0F0B08", light: "#FFFFFF" } })
      .then(s => { if (alive) setSvg(s); });
    return () => { alive = false; };
  }, [code]);
  return (
    <div role="img" aria-label={label ?? `Código QR de la entrada ${code}`}
      className="bg-white rounded-xl p-2 [&>svg]:w-full [&>svg]:h-full"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }} />
  );
}
