# besta

Web pública, venta de entradas y suite interna de besta, en un solo proyecto.

- **Web** (`/`): one-page en Astro, estática. Conciertos, escucha, banda, merch, contratación.
- **Entradas** (`/entradas/?pedido=…`): «mis entradas» con los QR, sin cuenta.
- **Suite** (`/suite/…`): app React para la banda: bolos, entradas, puerta, ensayos, composición, rider, presupuestos, merch y finanzas.

## Arrancar

```sh
pnpm install
pnpm dev        # http://localhost:4321  ·  suite en /suite/
pnpm build      # genera dist/ (lo que se sube a Cloudflare Pages)
pnpm check      # tipos
```

Necesita Node 22.

## Estado actual: modo de prueba

Todavía **no hay backend**. Los datos salen de `src/data/seed.ts` (ejemplos, no reales) y se guardan en el `localStorage` del navegador. En la suite entras eligiendo quién eres y desde «más» puedes reiniciar los datos.

La compra de entradas funciona de punta a punta en local: la web crea el pedido, te lleva a «mis entradas» con los QR y esos QR se pueden escanear desde `/suite/puerta`. El pago con Stripe y el email con Brevo están simulados.

## Cómo está organizado

```
src/
  styles/global.css     tokens de marca «señal» (4 colores, Jost + DM Mono) y recursos CRT
  components/ui/        botones, tarjetas, paneles, campos, QR, iconos
  data/
    types.ts            el modelo (= futuras tablas de Supabase)
    seed.ts             datos de ejemplo
    api.ts              ÚNICA puerta a los datos (hoy localStorage, mañana Supabase)
    hooks.ts            useCollection / useAction (React Query)
    selectors.ts        cuentas: aforo, saldos, checklist, totales…
  lib/                  formatos (€, fechas) y transposición de acordes
  pages/                rutas de Astro: web, entradas, legal y el contenedor de la suite
  web/                  partes interactivas de la web (compra, contratación, newsletter)
  suite/                shell, navegación, sesión y un archivo por módulo
```

Para enchufar el backend basta con reimplementar `src/data/api.ts` contra Supabase; las pantallas no tocan el almacén directamente.

## Despliegue (pendiente de configurar)

Cloudflare Pages, gratis: comando `pnpm build`, carpeta `dist`. `public/_redirects` hace que cualquier `/suite/*` sirva la app.
