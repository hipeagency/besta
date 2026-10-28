/* Punto de entrada de la suite (SPA bajo /suite). */
import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient, useLiveData } from "@/data/hooks";
import { ToastProvider } from "@/components/ui";
import { SessionGate, useMe } from "./session";
import { Shell } from "./Shell";
import { can, scopesOf, NAV } from "./nav";
import { ThemeProvider } from "./theme";

const Inicio = lazy(() => import("./modules/Inicio"));
const Bolos = lazy(() => import("./modules/Bolos"));
const Bolo = lazy(() => import("./modules/Bolo"));
const Entradas = lazy(() => import("./modules/Entradas"));
const EntradasEvento = lazy(() => import("./modules/EntradasEvento"));
const Puerta = lazy(() => import("./modules/Puerta"));
const Ensayos = lazy(() => import("./modules/ensayos/EnsayosApp"));
const Composicion = lazy(() => import("./modules/Composicion"));
const Rider = lazy(() => import("./modules/Rider"));
const Visuales = lazy(() => import("./modules/Visuales"));
const Presupuestos = lazy(() => import("./modules/Presupuestos"));
const Merch = lazy(() => import("./modules/Merch"));
const MerchPuesto = lazy(() => import("./modules/MerchPuesto"));
const Finanzas = lazy(() => import("./modules/Finanzas"));
const Mas = lazy(() => import("./modules/Mas"));
const Usuarios = lazy(() => import("./modules/Usuarios"));

function Live({ children }: { children: ReactNode }) { useLiveData(); return <>{children}</>; }

const Loading = () => <div className="p-10 text-crema/60">cargando…</div>;

/* Cada ruta comprueba el permiso: si alguien entra por URL a un
   módulo que no tiene, vuelve a su primera pantalla permitida. */
function Guard({ id, children }: { id: string; children: ReactNode }) {
  const { me } = useMe();
  if (can(id, me)) return <>{children}</>;
  const first = NAV.find(i => i.id !== "inicio" && scopesOf(me).includes(i.id));
  return <Navigate to={first && me.role === "staff" ? first.path : "/"} replace />;
}

function Routed() {
  const g = (id: string, el: ReactNode) => <Guard id={id}>{el}</Guard>;
  return (
    <Routes>
      <Route path="ensayos/*" element={g("ensayos", <Ensayos />)} />
      <Route path="puerta" element={g("puerta", <Puerta />)} />
      <Route path="puerta/:eventId" element={g("puerta", <Puerta />)} />
      <Route path="merch/puesto" element={g("merch", <MerchPuesto />)} />
      <Route element={<Shell />}>
        <Route index element={<Inicio />} />
        <Route path="bolos" element={g("bolos", <Bolos />)} />
        <Route path="bolos/:id" element={g("bolos", <Bolo />)} />
        <Route path="entradas" element={g("entradas", <Entradas />)} />
        <Route path="entradas/:eventId" element={g("entradas", <EntradasEvento />)} />
        <Route path="composicion" element={g("composicion", <Composicion />)} />
        <Route path="rider" element={g("rider", <Rider />)} />
        <Route path="visuales" element={g("visuales", <Visuales />)} />
        <Route path="presupuestos" element={g("presupuestos", <Presupuestos />)} />
        <Route path="presupuestos/:id" element={g("presupuestos", <Presupuestos />)} />
        <Route path="merch" element={g("merch", <Merch />)} />
        <Route path="finanzas" element={g("finanzas", <Finanzas />)} />
        <Route path="usuarios" element={g("usuarios", <Usuarios />)} />
        <Route path="mas" element={<Mas />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Live>
        <ThemeProvider>
        <ToastProvider>
          <BrowserRouter basename="/suite">
            <SessionGate>
              <Suspense fallback={<Loading />}>
                <Routed />
              </Suspense>
            </SessionGate>
          </BrowserRouter>
        </ToastProvider>
        </ThemeProvider>
      </Live>
    </QueryClientProvider>
  );
}
