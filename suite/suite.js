/* =========================================================
   BESTA · suite interna — núcleo compartido
   Un solo sitio para: credenciales, cliente de Supabase,
   el catálogo de espacios y el conmutador de navegación.
   Lo cargan ensayos, visuales, merch, finanzas y el hub.
   ========================================================= */
(function () {
  const SUPABASE_URL = "https://vjydiddybwutbcfigtie.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqeWRpZGR5Ynd1dGJjZmlndGllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjgxMDYsImV4cCI6MjA5MjcwNDEwNn0.0SHKjvATs4dyOPo1zKaq3CyG1mbgU5qb4I1vkNw5-V0";

  /* --------------------------------------------------------
     El espacio de trabajo (la banda). Todo lo que hace que la
     suite sea "de BESTA" vive aquí y en ningún otro sitio:
     cuando haya más bandas, esto vendrá de una tabla
     `workspaces` en Supabase y el resto del código no cambia.
     -------------------------------------------------------- */
  const WORKSPACE = {
    id: "besta",
    name: "BESTA",
    tagline: "suite de la banda",
    logo: "/assets/images/besta_color.png",
    site: "https://besta.es",
    accent: "#db7f4e",
    role: "owner",          // owner | admin | member — el superadmin crea espacios nuevos
    members: [
      { id: "voice",         name: "Màxim",     role: "voz" },
      { id: "guitar_rhythm", name: "Albert",    role: "guitarra" },
      { id: "guitar_lead",   name: "Pau",       role: "guitarra solista" },
      { id: "bass",          name: "Lars",      role: "bajo" },
      { id: "drums",         name: "Víctor",    role: "batería" },
      { id: "piano",         name: "Carlinhos", role: "piano" }
    ]
  };

  /* Colores de acento que se ofrecen en Ajustes. El primero es el de la marca. */
  const ACCENTS = [
    { name: "cobre",   hex: "#db7f4e" },
    { name: "rojo",    hex: "#e5484d" },
    { name: "ámbar",   hex: "#f5a524" },
    { name: "lima",    hex: "#b8e04a" },
    { name: "menta",   hex: "#3dd68c" },
    { name: "cian",    hex: "#2cc8e0" },
    { name: "azul",    hex: "#6e8bff" },
    { name: "violeta", hex: "#a78bfa" },
    { name: "rosa",    hex: "#f472b6" }
  ];

  /* El árbol de la suite. Añadir un espacio nuevo es añadir una entrada aquí:
     el inicio, la barra lateral, la barra móvil y el buscador se enteran solos. */
  const GROUPS = [
    { id: "musica",  name: "música" },
    { id: "negocio", name: "negocio" }
  ];
  const SPACES = [
    {
      id: "ensayos", group: "musica", icon: "mic",
      name: "ensayos",
      href: "/suite/ensayos.html",
      tagline: "repertorio, setlists y directo",
      desc: "Letras, acordes, notas por instrumento, listas y el modo directo para el escenario.",
      glyph: "♫", status: "live", mode: "app", tab: true
    },
    {
      id: "composicion", group: "musica", icon: "pen",
      name: "composición",
      href: "/suite/composicion.html",
      tagline: "ideas, acordes y demos",
      desc: "Cuadernos compartidos para componer canciones en equipo.",
      glyph: "✎", status: "live"
    },
    {
      id: "visuales", group: "musica", icon: "tv",
      name: "visuales",
      href: "/suite/visuales.html",
      tagline: "estudio de muro CRT",
      desc: "Monta el muro de televisores, programa los pases y exporta el vídeo del directo.",
      glyph: "▣", status: "live", mode: "app"
    },
    {
      id: "presupuestos", group: "negocio", icon: "file",
      name: "presupuestos",
      href: "/suite/presupuestos.html",
      tagline: "ofertas para salas y promotores",
      desc: "Conceptos, IVA y retención calculados solos, con su número, su estado y el PDF listo para mandar.",
      glyph: "§", status: "live", tab: true
    },
    {
      id: "rider", group: "negocio", icon: "clipboard",
      name: "rider",
      href: "/suite/rider.html",
      tagline: "rider técnico y plano de escenario",
      desc: "El documento que se manda a la sala: necesidades por músico, input list, backline y escenario, listo para PDF.",
      glyph: "▤", status: "live"
    },
    {
      id: "merch", group: "negocio", icon: "shirt",
      name: "merch",
      href: "/suite/merch.html",
      tagline: "stock, reservas y ventas",
      desc: "Catálogo de productos con tallas y precio, control de stock y registro de cada venta o reserva.",
      glyph: "◈", status: "live"
    },
    {
      id: "finanzas", group: "negocio", icon: "wallet",
      name: "finanzas",
      href: "/suite/finanzas.html",
      tagline: "cachés, gastos y reparto",
      desc: "Ingresos por bolo, gastos de la banda y cuánto toca a cada uno con un resumen tipo Tricount.",
      glyph: "€", status: "live", tab: true
    }
  ];

  /* Iconos de línea propios (24×24, trazo). Sin librerías: cero peticiones. */
  const ICONS = {
    home: "M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z",
    mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7",
    pen: "M4 20l4.2-1L19 8.2a2.1 2.1 0 0 0-3-3L5.2 16zM14.5 6.7l2.8 2.8",
    tv: "M3.5 7.5h17v12h-17zM8.5 3.5l3.5 4 3.5-4",
    file: "M14 3.5H6.5v17h11V7zM14 3.5V7h3.5M9.5 12.5h5M9.5 16h5",
    clipboard: "M9 3.5h6v3H9zM7 5H5.5v15.5h13V5H17M9 11.5h6M9 15h4",
    shirt: "M8.5 3.5 3.5 6.5l2 4.5 2.5-1v10.5h8V10l2.5 1 2-4.5-5-3a3.5 3.5 0 0 1-7 0z",
    wallet: "M3.5 7.5h14a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2zM3.5 7.5l11-4v4M16.5 14h.01",
    search: "M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.3-4.3",
    sliders: "M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4",
    logout: "M14.5 4.5h4v15h-4M10 8l-4 4 4 4M6 12h10",
    external: "M13.5 4.5h6v6M19.5 4.5l-8.5 8.5M17.5 13.5v6h-13v-13h6",
    grid: "M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z",
    updown: "M8.5 9 12 5.5 15.5 9M8.5 15l3.5 3.5 3.5-3.5",
    plus: "M12 5v14M5 12h14",
    collapse: "M15 6l-6 6 6 6M20 4v16",
    check: "M5 12.5l4.5 4.5L19 7.5",
    close: "M6 6l12 12M18 6 6 18"
  };
  function icon(name, size) {
    const s = size || 18;
    return `<svg class="bs-ico" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" ` +
      `stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ` +
      `aria-hidden="true"><path d="${ICONS[name] || ICONS.grid}"/></svg>`;
  }

  /* --------------------------------------------------------
     Preferencias de personalización (por banda y aparato).
     Hoy en localStorage; mañana en `workspace_settings`.
     -------------------------------------------------------- */
  const PREFS_KEY = "bs-prefs:" + WORKSPACE.id;
  function prefs() {
    try { return Object.assign({ accent: WORKSPACE.accent, rail: "open" }, JSON.parse(localStorage.getItem(PREFS_KEY) || "{}")); }
    catch (_) { return { accent: WORKSPACE.accent, rail: "open" }; }
  }
  function savePrefs(patch) {
    const next = Object.assign(prefs(), patch);
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch (_) {}
    applyBrand();
    return next;
  }
  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  /* El acento de la banda se pinta en línea sobre <html>: gana a los :root
     de cada página, así que ensayos, composición y el resto lo heredan
     sin tocar sus hojas de estilo. */
  function applyBrand() {
    const p = prefs();
    const rgb = hexToRgb(p.accent) || hexToRgb(WORKSPACE.accent);
    const root = document.documentElement;
    const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    root.style.setProperty("--accent", `rgb(${rgb.join(",")})`);
    root.style.setProperty("--accent-rgb", rgb.join(", "));
    root.style.setProperty("--accent-ink", lum > 0.55 ? "#111014" : "#fff8f2");
    root.classList.toggle("bs-rail-collapsed", p.rail === "collapsed");
  }
  applyBrand();

  const HUB = "/suite/";
  let clientPromise = null;

  /* --------------------------------------------------------
     La base de datos no contesta.
     El plan gratuito de Supabase duerme el proyecto tras unos
     días sin uso y le quita hasta el DNS: desde fuera parece
     que el servidor no existe. Pasó el 29/09/2026 y la suite
     se quedó en "comprobando sesión…" sin decir por qué.
     -------------------------------------------------------- */
  const DB_DOWN_FIX =
    "Si el proyecto de Supabase está en pausa (el plan gratuito la aplica tras unos días sin uso), " +
    "entra en <a href=\"https://supabase.com/dashboard\" target=\"_blank\" rel=\"noopener\">supabase.com/dashboard</a> " +
    "y pulsa <b>Restore project</b>. Los datos siguen ahí; tarda un par de minutos.";
  const DB_DOWN_HTML = "<b>No hay conexión con la base de datos.</b><br>" + DB_DOWN_FIX;

  /* Un fallo de red no es un error de la app: ni la sesión caducada ni una
     tabla que falta se parecen a esto. */
  function isDbDown(err) {
    if (!err) return false;
    const msg = (err.message || err.error_description || String(err)).toLowerCase();
    return /failed to fetch|load failed|networkerror|network error|fetch failed|err_name_not_resolved|timeout|typeerror/.test(msg);
  }

  /* ¿Contesta el proyecto? Sin sesión guardada, getSession() dice "no hay
     sesión" sin tocar la red, así que la puerta pintaba el formulario y el
     fallo solo aparecía al pulsar "entrar". Esto lo pregunta de verdad. */
  async function reachable() {
    try {
      // no-cors: la respuesta viene opaca y da igual, aquí solo se pregunta
      // si hay alguien al otro lado. Con CORS normal, un dominio que no
      // devuelve cabeceras se confundiría con un servidor caído.
      await withTimeout(fetch(SUPABASE_URL + "/auth/v1/health", {
        method: "GET", mode: "no-cors", cache: "no-store"
      }), 8000);
      return true;
    } catch (_) {
      return false;   // DNS caído o sin respuesta: esto sí es estar muerto
    }
  }

  /* ¿Hay una sesión guardada en este aparato? supabase-js la deja en
     localStorage bajo sb-<proyecto>-auth-token. Si la hay, sin conexión se
     puede seguir con lo que ya está descargado. */
  function storedSession() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!/^sb-.*-auth-token$/.test(k)) continue;
        let raw = localStorage.getItem(k);
        if (!raw) continue;
        if (raw.startsWith("base64-")) raw = atob(raw.slice(7));
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.access_token || parsed.user)) return parsed;
      }
    } catch (_) {}
    return null;
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
    ]);
  }

  /* Pantalla de "esto no va a arrancar", con su botón de reintentar.
     Trae su propio CSS porque la usan páginas que no se parecen en nada. */
  function fatal(html) {
    if (document.querySelector(".bs-fatal")) return;
    const style = document.createElement("style");
    style.textContent = `
      .bs-fatal {
        position: fixed; inset: 0; z-index: 4000; display: grid; place-items: center;
        padding: 24px; background: #050508; color: #f5f7ff;
        font-family: 'Space Grotesk', system-ui, sans-serif;
      }
      .bs-fatal-card {
        max-width: 430px; width: 100%; text-align: center;
        background: #0d0b11; border: 1px solid rgba(255,255,255,.14);
        border-radius: 16px; padding: 28px 24px;
      }
      .bs-fatal-card p { margin: 0 0 18px; font-size: 14px; line-height: 1.55; color: rgba(245,247,255,.8); }
      .bs-fatal-card b { color: #f5f7ff; }
      .bs-fatal-card a { color: #db7f4e; }
      .bs-fatal-card button {
        padding: 10px 18px; border-radius: 10px; border: 1px solid rgba(255,255,255,.18);
        background: transparent; color: #f5f7ff; font: 600 13px/1 inherit; cursor: pointer;
      }
      .bs-fatal-card button:hover { border-color: #db7f4e; color: #db7f4e; }`;
    document.head.appendChild(style);

    const box = document.createElement("div");
    box.className = "bs-fatal";
    box.innerHTML = `<div class="bs-fatal-card"><p>${html}</p>
      <button type="button">reintentar</button></div>`;
    box.querySelector("button").addEventListener("click", () => location.reload());
    document.body.appendChild(box);
    document.body.style.visibility = "visible";
  }

  /* --------------------------------------------------------
     Cliente de Supabase — uno solo por pestaña.
     Varias instancias sobre el mismo localStorage se pelean
     al refrescar el token, así que todo el mundo pide este.
     -------------------------------------------------------- */
  function client() {
    if (clientPromise) return clientPromise;
    clientPromise = (async () => {
      if (!window.supabase) {
        // Con límite: sin red y sin el CDN cacheado esto no llega nunca,
        // y una pantalla en blanco eterna encima del escenario no vale.
        await new Promise((resolve, reject) => {
          const started = Date.now();
          const t = setInterval(() => {
            if (window.supabase) { clearInterval(t); resolve(); return; }
            if (Date.now() - started > 15000) {
              clearInterval(t);
              reject(new Error("No se pudo cargar la librería de Supabase."));
            }
          }, 30);
        });
      }
      return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, detectSessionInUrl: true, autoRefreshToken: true }
      });
    })();
    return clientPromise;
  }

  /* --------------------------------------------------------
     Guardia de página. Sin sesión, al hub con ?next= para
     volver aquí en cuanto entre. Devuelve la sesión.
     -------------------------------------------------------- */
  async function guard() {
    const supa = await client();
    let session = null;
    try {
      const res = await withTimeout(supa.auth.getSession(), 12000);
      session = (res && res.data && res.data.session) || null;
    } catch (err) {
      // Con sesión guardada se sigue: ensayos tiene modo sin conexión y el
      // atril no puede morir en el escenario porque no se refresque un token.
      const stored = storedSession();
      if (stored) {
        banner("Sin conexión con la base de datos: ves lo último guardado en " +
               "este aparato y los cambios no se envían. " + DB_DOWN_FIX);
        return stored;
      }
      // Sin sesión no hay nada que hacer: mandar al hub sería el mismo muro.
      fatal(DB_DOWN_HTML);
      return new Promise(() => {});
    }
    if (!session) {
      // Puede no haber sesión porque el token caducó y no hay con quién
      // renovarlo. Mandar al hub sin servidor es mandar a otra pared: si el
      // aparato tiene sesión guardada, se sigue con lo que ya está bajado.
      const stored = storedSession();
      if (stored && !(await reachable())) {
        banner("Sin conexión con la base de datos: ves lo último guardado en " +
               "este aparato y los cambios no se envían. " + DB_DOWN_FIX);
        return stored;
      }
      const next = location.pathname + location.search;
      location.replace(HUB + "?next=" + encodeURIComponent(next));
      // Promesa que nunca resuelve: la página no debe seguir montándose.
      return new Promise(() => {});
    }
    supa.auth.onAuthStateChange((event, s) => {
      if (!s && event === "SIGNED_OUT") location.replace(HUB);
    });
    return session;
  }

  async function logout() {
    const supa = await client();
    await supa.auth.signOut();
    location.href = HUB;
  }

  /* Aviso de una línea arriba del todo, para las páginas que sí pueden
     seguir funcionando con datos locales pero deben avisar de que lo están. */
  function banner(html) {
    if (document.querySelector(".bs-banner")) return;
    const el = document.createElement("div");
    el.className = "bs-banner";
    el.style.cssText = "position:sticky;top:0;z-index:3500;padding:10px 16px;" +
      "background:#3a2318;border-bottom:1px solid rgba(244,211,94,.35);color:#ffe9c9;" +
      "font:500 13px/1.5 'Space Grotesk',system-ui,sans-serif;text-align:center";
    el.innerHTML = html;
    document.body.insertBefore(el, document.body.firstChild);
  }

  /* --------------------------------------------------------
     Shell de navegación.
     · Páginas de gestión (inicio, merch, finanzas…): barra
       lateral en escritorio y barra de pestañas en móvil.
     · Apps a pantalla completa (ensayos, visuales): el logo de
       su propia cabecera abre el buscador; nada flota encima
       del atril ni del muro.
     · En todas: ⌘K / Ctrl+K abre el buscador de espacios.
     Estilos en /suite/suite-nav.css (se inyecta solo).
     -------------------------------------------------------- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cap = s => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);

  function displayName(session) {
    const u = session && session.user;
    if (!u) return "";
    const meta = u.user_metadata || {};
    const raw = meta.name || meta.full_name || (u.email || "").split("@")[0];
    return cap(String(raw).split(/[._-]/)[0]);
  }
  function initials(session) {
    const n = displayName(session) || "?";
    return n.slice(0, 1).toUpperCase();
  }

  let navState = null;   // { active, session, palette, settings }

  function ensureNavCss() {
    if (document.querySelector('link[data-bs-nav]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/suite/suite-nav.css";
    link.setAttribute("data-bs-nav", "");
    document.head.appendChild(link);
  }

  function navItem(space, active, cls) {
    const on = space.id === active;
    return `<a class="${cls}${on ? " on" : ""}" href="${space.href}" ${on ? 'aria-current="page"' : ""}
      data-tip="${esc(cap(space.name))}">${icon(space.icon)}<span>${esc(cap(space.name))}</span></a>`;
  }

  function buildRail(active) {
    const rail = document.createElement("aside");
    rail.className = "bs-rail";
    rail.setAttribute("aria-label", "Navegación de la suite");
    const groups = GROUPS.map(g => `
      <div class="bs-rail-group">
        <p class="bs-rail-label">${esc(g.name)}</p>
        ${SPACES.filter(s => s.group === g.id).map(s => navItem(s, active, "bs-rail-item")).join("")}
      </div>`).join("");
    rail.innerHTML = `
      <button type="button" class="bs-ws" aria-haspopup="menu" aria-expanded="false">
        <span class="bs-ws-logo"><img src="${esc(WORKSPACE.logo)}" alt=""></span>
        <span class="bs-ws-txt"><b>${esc(WORKSPACE.name)}</b><small>${esc(WORKSPACE.tagline)}</small></span>
        ${icon("updown", 16)}
      </button>
      <div class="bs-ws-menu" role="menu" hidden>
        <p class="bs-rail-label">tus espacios</p>
        <a class="bs-ws-row on" href="${HUB}"><span class="bs-ws-logo sm"><img src="${esc(WORKSPACE.logo)}" alt=""></span>
          <span>${esc(WORKSPACE.name)}</span>${icon("check", 16)}</a>
        ${WORKSPACE.role === "owner" ? `<button type="button" class="bs-ws-row soon" disabled>
          <span class="bs-ws-logo sm add">${icon("plus", 14)}</span><span>Nueva banda</span><em>pronto</em></button>` : ""}
      </div>
      <button type="button" class="bs-search" data-open="palette">
        ${icon("search", 16)}<span>Buscar o saltar…</span><kbd>${/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"} K</kbd>
      </button>
      <nav class="bs-rail-nav">
        <a class="bs-rail-item${active === "inicio" ? " on" : ""}" href="${HUB}" data-tip="Inicio">${icon("home")}<span>Inicio</span></a>
        ${groups}
      </nav>
      <div class="bs-rail-foot">
        <button type="button" class="bs-rail-item" data-open="settings" data-tip="Ajustes">${icon("sliders")}<span>Ajustes</span></button>
        <a class="bs-rail-item" href="${esc(WORKSPACE.site)}" target="_blank" rel="noopener" data-tip="Web pública">${icon("external")}<span>Web pública</span></a>
        <div class="bs-me">
          <span class="bs-avatar" data-me-initial>·</span>
          <span class="bs-me-txt"><b data-me-name></b><small data-me-email></small></span>
          <button type="button" class="bs-icon-btn" data-logout title="Salir" aria-label="Salir">${icon("logout", 17)}</button>
        </div>
        <button type="button" class="bs-collapse" data-collapse title="Plegar barra" aria-label="Plegar barra lateral">${icon("collapse", 16)}</button>
      </div>`;

    const ws = rail.querySelector(".bs-ws"), menu = rail.querySelector(".bs-ws-menu");
    ws.addEventListener("click", e => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      ws.setAttribute("aria-expanded", String(!menu.hidden));
    });
    document.addEventListener("click", e => {
      if (!menu.hidden && !menu.contains(e.target)) { menu.hidden = true; ws.setAttribute("aria-expanded", "false"); }
    });
    rail.querySelector("[data-collapse]").addEventListener("click", () => {
      savePrefs({ rail: prefs().rail === "collapsed" ? "open" : "collapsed" });
    });
    return rail;
  }

  function buildTabbar(active) {
    const bar = document.createElement("nav");
    bar.className = "bs-tabbar";
    bar.setAttribute("aria-label", "Navegación de la suite");
    const tabs = SPACES.filter(s => s.tab);
    const inTabs = active === "inicio" || tabs.some(s => s.id === active);
    bar.innerHTML = `
      <a class="bs-tab${active === "inicio" ? " on" : ""}" href="${HUB}">${icon("home", 21)}<span>Inicio</span></a>
      ${tabs.map(s => `<a class="bs-tab${s.id === active ? " on" : ""}" href="${s.href}">${icon(s.icon, 21)}<span>${esc(cap(s.name))}</span></a>`).join("")}
      <button type="button" class="bs-tab${inTabs ? "" : " on"}" data-open="palette">${icon("grid", 21)}<span>Más</span></button>`;
    return bar;
  }

  /* ---------- buscador de espacios (⌘K) ---------- */
  function buildPalette() {
    const sheet = document.createElement("div");
    sheet.className = "bs-overlay bs-palette";
    sheet.hidden = true;
    sheet.innerHTML = `
      <div class="bs-pal" role="dialog" aria-modal="true" aria-label="Buscar en la suite">
        <label class="bs-pal-input">${icon("search", 18)}
          <input type="search" placeholder="¿A dónde vamos?" autocomplete="off" spellcheck="false">
          <kbd>esc</kbd></label>
        <div class="bs-pal-list" role="listbox"></div>
        <div class="bs-pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> moverse</span><span><kbd>↵</kbd> abrir</span></div>
      </div>`;
    const input = sheet.querySelector("input"), list = sheet.querySelector(".bs-pal-list");
    let idx = 0, rows = [];

    const entries = () => [
      { id: "inicio", label: "Inicio", sub: "resumen de la banda", icon: "home", href: HUB, group: "ir a" },
      ...SPACES.map(s => ({ id: s.id, label: cap(s.name), sub: s.tagline, icon: s.icon, href: s.href, group: "ir a" })),
      { id: "ajustes", label: "Ajustes y personalización", sub: "color de la suite, barra lateral", icon: "sliders", run: openSettings, group: "acciones" },
      { id: "web", label: "Abrir la web pública", sub: WORKSPACE.site.replace(/^https?:\/\//, ""), icon: "external", href: WORKSPACE.site, blank: true, group: "acciones" },
      { id: "salir", label: "Cerrar sesión", sub: "", icon: "logout", run: logout, group: "acciones" }
    ];
    const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

    function render() {
      const q = norm(input.value.trim());
      rows = entries().filter(e => !q || norm(e.label + " " + e.sub).includes(q));
      idx = Math.min(idx, Math.max(rows.length - 1, 0));
      let last = "";
      list.innerHTML = rows.length ? rows.map((r, i) => {
        const head = r.group !== last ? `<p class="bs-pal-group">${esc(r.group)}</p>` : "";
        last = r.group;
        const on = navState && navState.active === r.id;
        return `${head}<button type="button" class="bs-pal-row${i === idx ? " sel" : ""}" data-i="${i}" role="option">
          <span class="bs-pal-ico">${icon(r.icon, 17)}</span>
          <span class="bs-pal-txt"><b>${esc(r.label)}</b>${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</span>
          ${on ? '<em>aquí</em>' : ""}</button>`;
      }).join("") : `<p class="bs-pal-empty">Nada con «${esc(input.value)}».</p>`;
    }
    function go(r) {
      if (!r) return;
      close();
      if (r.run) r.run();
      else if (r.blank) window.open(r.href, "_blank", "noopener");
      else location.href = r.href;
    }
    function open() { sheet.hidden = false; input.value = ""; idx = 0; render(); setTimeout(() => input.focus(), 0); }
    function close() { sheet.hidden = true; }

    input.addEventListener("input", () => { idx = 0; render(); });
    input.addEventListener("keydown", e => {
      if (e.key === "ArrowDown") { e.preventDefault(); idx = (idx + 1) % Math.max(rows.length, 1); render(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); idx = (idx - 1 + rows.length) % Math.max(rows.length, 1); render(); }
      else if (e.key === "Enter") { e.preventDefault(); go(rows[idx]); }
    });
    list.addEventListener("click", e => {
      const b = e.target.closest(".bs-pal-row");
      if (b) go(rows[+b.dataset.i]);
    });
    sheet.addEventListener("click", e => { if (e.target === sheet) close(); });
    return { el: sheet, open, close };
  }

  /* ---------- ajustes / personalización ---------- */
  function buildSettings() {
    const sheet = document.createElement("div");
    sheet.className = "bs-overlay bs-settings";
    sheet.hidden = true;
    sheet.innerHTML = `
      <div class="bs-set" role="dialog" aria-modal="true" aria-labelledby="bs-set-title">
        <header class="bs-set-head">
          <div><p class="bs-rail-label">${esc(WORKSPACE.name)}</p><h2 id="bs-set-title">Ajustes</h2></div>
          <button type="button" class="bs-icon-btn" data-close aria-label="Cerrar">${icon("close", 18)}</button>
        </header>
        <section class="bs-set-sec">
          <h3>Color de la suite</h3>
          <p>El acento tiñe botones, enlaces y datos destacados en todos los espacios.</p>
          <div class="bs-swatches">
            ${ACCENTS.map(a => `<button type="button" class="bs-swatch" data-hex="${a.hex}" style="--sw:${a.hex}" title="${esc(a.name)}" aria-label="${esc(a.name)}"></button>`).join("")}
            <label class="bs-swatch custom" title="Color propio">${icon("plus", 14)}<input type="color" aria-label="Color propio"></label>
          </div>
          <div class="bs-preview">
            <span class="bs-preview-btn">Botón principal</span>
            <span class="bs-preview-chip">etiqueta</span>
            <span class="bs-preview-num">1.240 €</span>
          </div>
        </section>
        <section class="bs-set-sec">
          <h3>Barra lateral</h3>
          <div class="bs-seg" data-seg="rail">
            <button type="button" data-v="open">Completa</button>
            <button type="button" data-v="collapsed">Solo iconos</button>
          </div>
        </section>
        <section class="bs-set-sec">
          <h3>Banda</h3>
          <dl class="bs-kv">
            <dt>Nombre</dt><dd>${esc(WORKSPACE.name)}</dd>
            <dt>Miembros</dt><dd>${WORKSPACE.members.map(m => esc(m.name)).join(" · ")}</dd>
          </dl>
          <p class="bs-note">Los ajustes se guardan en este aparato.</p>
        </section>
        <footer class="bs-set-foot">
          <button type="button" class="bs-link" data-reset>Restablecer color de la marca</button>
        </footer>
      </div>`;

    function sync() {
      const p = prefs();
      sheet.querySelectorAll(".bs-swatch[data-hex]").forEach(b =>
        b.classList.toggle("on", b.dataset.hex.toLowerCase() === String(p.accent).toLowerCase()));
      const custom = sheet.querySelector(".bs-swatch.custom");
      const isPreset = ACCENTS.some(a => a.hex.toLowerCase() === String(p.accent).toLowerCase());
      custom.classList.toggle("on", !isPreset);
      if (!isPreset) custom.style.setProperty("--sw", p.accent);
      custom.querySelector("input").value = hexToRgb(p.accent) ? p.accent : WORKSPACE.accent;
      sheet.querySelectorAll('[data-seg="rail"] button').forEach(b => b.classList.toggle("on", b.dataset.v === p.rail));
    }
    sheet.addEventListener("click", e => {
      if (e.target === sheet || e.target.closest("[data-close]")) { close(); return; }
      const sw = e.target.closest(".bs-swatch[data-hex]");
      if (sw) { savePrefs({ accent: sw.dataset.hex }); sync(); return; }
      const seg = e.target.closest('[data-seg="rail"] button');
      if (seg) { savePrefs({ rail: seg.dataset.v }); sync(); return; }
      if (e.target.closest("[data-reset]")) { savePrefs({ accent: WORKSPACE.accent }); sync(); }
    });
    sheet.querySelector('input[type="color"]').addEventListener("input", e => { savePrefs({ accent: e.target.value }); sync(); });
    function open() { sync(); sheet.hidden = false; setTimeout(() => sheet.querySelector("[data-close]").focus(), 0); }
    function close() { sheet.hidden = true; }
    return { el: sheet, open, close };
  }

  function openPalette() { navState && navState.palette.open(); }
  function openSettings() { navState && navState.settings.open(); }

  /* Rellena nombre, email e inicial del usuario donde haya hueco. */
  async function fillMe() {
    try {
      const supa = await client();
      const res = await supa.auth.getSession();
      const session = (res && res.data && res.data.session) || storedSession();
      if (!session) return;
      document.querySelectorAll("[data-me-name]").forEach(el => el.textContent = displayName(session));
      document.querySelectorAll("[data-me-email]").forEach(el => el.textContent = (session.user && session.user.email) || "");
      document.querySelectorAll("[data-me-initial]").forEach(el => el.textContent = initials(session));
    } catch (_) {}
  }

  function mountNav(opts) {
    const active = (opts && opts.active) || "";
    if (navState) return navState;
    ensureNavCss();
    const space = SPACES.find(s => s.id === active);
    const mode = (opts && opts.mode) || (space && space.mode) || "page";

    const palette = buildPalette(), settings = buildSettings();
    navState = { active, palette, settings };
    document.body.appendChild(palette.el);
    document.body.appendChild(settings.el);

    if (mode === "page") {
      document.documentElement.classList.add("bs-shell");
      document.body.appendChild(buildRail(active));
      document.body.appendChild(buildTabbar(active));
    } else {
      // Apps a pantalla completa: su logo pasa a ser la puerta al resto.
      document.documentElement.classList.add("bs-app");
      const brand = document.querySelector("header .brand, .topbar .brand");
      if (brand) {
        brand.classList.add("bs-brand-launch");
        brand.insertAdjacentHTML("afterbegin", `<span class="bs-launch-ico">${icon("grid", 14)}</span>`);
        brand.setAttribute("title", "Cambiar de espacio (⌘K)");
        brand.setAttribute("role", "button");
        brand.addEventListener("click", e => { e.preventDefault(); palette.open(); });
      } else {
        const btn = document.createElement("button");
        btn.className = "bs-switch"; btn.type = "button";
        btn.setAttribute("aria-label", "Cambiar de espacio en la suite");
        btn.innerHTML = icon("grid", 18);
        btn.addEventListener("click", () => palette.open());
        document.body.appendChild(btn);
      }
    }

    document.addEventListener("click", e => {
      const o = e.target.closest("[data-open]");
      if (o) { e.preventDefault(); o.dataset.open === "settings" ? settings.open() : palette.open(); return; }
      if (e.target.closest("[data-logout]")) logout();
    });
    document.addEventListener("keydown", e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        palette.el.hidden ? palette.open() : palette.close();
      } else if (e.key === "Escape") {
        if (!palette.el.hidden) palette.close();
        if (!settings.el.hidden) settings.close();
      }
    });
    fillMe();
    return navState;
  }

  window.BestaSuite = {
    SUPABASE_URL, SUPABASE_ANON_KEY, WORKSPACE, ACCENTS, GROUPS, SPACES, HUB, DB_DOWN_HTML, DB_DOWN_FIX,
    client, guard, logout, mountNav, fatal, banner, isDbDown, withTimeout, reachable, storedSession,
    icon, prefs, savePrefs, applyBrand, displayName, openPalette, openSettings
  };
})();
