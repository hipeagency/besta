import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/* La suite es una SPA: cualquier /suite/... la sirve /suite/.
   En producción lo hacen las reglas de public/_redirects (Cloudflare);
   en desarrollo, este middleware. */
const suiteFallback = {
  name: "besta-suite-fallback",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const url = req.url || "";
      const path = url.split("?")[0];
      if (path.startsWith("/suite/") && !path.includes(".") && path !== "/suite/") {
        req.url = "/suite/";
      }
      next();
    });
  },
};

/* Directo sin internet: al compilar, mete en dist/suite/sw.js la lista
   de archivos que necesita la suite para abrir sin cobertura (los de
   _astro cambian de nombre en cada compilación) y una versión nueva. */
const suiteOffline = {
  name: "besta-suite-offline",
  hooks: {
    "astro:build:done": ({ dir }) => {
      const root = fileURLToPath(dir);
      const assets = readdirSync(join(root, "_astro"))
        .filter(f => !f.endsWith(".woff")) // los navegadores de hoy usan .woff2
        .map(f => `/_astro/${f}`);
      const files = ["/suite/", "/suite.webmanifest", "/img/logo-crema.png", "/favicons/favicon-32x32.png",
        "/favicons/apple-touch-icon.png", "/favicons/android-chrome-192x192.png", "/favicons/android-chrome-512x512.png", ...assets];
      const version = createHash("sha256")
        .update(files.join("\n")).update(readFileSync(join(root, "suite/index.html")))
        .digest("hex").slice(0, 12);
      const sw = join(root, "suite/sw.js");
      writeFileSync(sw, readFileSync(sw, "utf8")
        .replace('"__VERSION__"', JSON.stringify(version))
        .replace("__FILES__", JSON.stringify(files)));
    },
  },
};

export default defineConfig({
  site: "https://besta.es",
  output: "static",
  devToolbar: { enabled: false },
  integrations: [react(), suiteOffline],
  vite: {
    plugins: [tailwindcss(), suiteFallback],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  },
});
