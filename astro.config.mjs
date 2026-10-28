import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

/* La suite es una SPA: cualquier /suite/... la sirve /suite/ (en producción, con las reglas de public/_redirects).
   En producción lo hace public/_redirects (Cloudflare Pages);
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

export default defineConfig({
  site: "https://besta.es",
  output: "static",
  devToolbar: { enabled: false },
  integrations: [react()],
  vite: {
    plugins: [tailwindcss(), suiteFallback],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  },
});
