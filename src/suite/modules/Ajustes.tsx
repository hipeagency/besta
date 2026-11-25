/* Ajustes: todo lo que se configura, en una sola pantalla.
   Lo tuyo (tema, inicio, cuenta) y lo de la banda (tareas comunes,
   accesos) separado para que se sepa a quién afecta cada cosa. */
import { useState } from "react";
import { Link } from "react-router";
import { Page } from "@/suite/Shell";
import { useMe } from "@/suite/session";
import { can } from "@/suite/nav";
import { useHomeLayout } from "@/suite/home";
import { HomeModulesEditor } from "@/suite/HomeEditor";
import { useTheme, type ThemePref } from "@/suite/theme";
import { useAction, useCollection } from "@/data/hooks";
import { api, DATA_MODE } from "@/data/api";
import { commonTasks } from "@/data/selectors";
import { Button, Card, CardTitle, Segmented, useToast } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { CommonTasks } from "./Bolo";

export default function Ajustes() {
  const { me, logout } = useMe();
  const theme = useTheme();
  const layout = useHomeLayout(me);
  const toast = useToast();
  const { data: settings } = useCollection("settings");
  const [tasks, setTasks] = useState(false);
  const reset = useAction(() => api.reset());
  const isAdmin = me.role === "admin";

  return (
    <Page title="ajustes" kicker="TU CUENTA Y LA BANDA">
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <p className="px-1 font-mono text-[11px] tracking-[.14em] text-crema/55">SOLO PARA TI</p>
          <Card className="flex flex-col gap-3">
            <CardTitle className="!mb-0">apariencia</CardTitle>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-sm text-crema/75">tema</span>
              <Segmented<ThemePref> value={theme.pref} onChange={theme.setPref} size="sm" options={[{ value: "auto", label: "automático" }, { value: "claro", label: "claro" }, { value: "oscuro", label: "oscuro" }]} />
            </div>
            <p className="text-xs text-crema/55">«Automático» sigue al móvil u ordenador: claro de día, oscuro de noche.</p>
          </Card>
          <Card className="flex flex-col gap-3">
            <CardTitle className="!mb-0" action={<Button size="sm" variant="quiet" onClick={layout.reset}>restablecer</Button>}>inicio</CardTitle>
            <p className="text-sm text-crema/70">Qué ves al entrar y en qué orden. Se guarda en este aparato.</p>
            <HomeModulesEditor layout={layout} />
          </Card>
          <Card className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-3 min-w-0">
              <span className="size-10 rounded-full bg-senal text-noche grid place-items-center font-semibold shrink-0">{me.name[0]}</span>
              <span className="min-w-0">
                <span className="block font-medium truncate">{me.name}</span>
                <span className="block font-mono text-[11px] text-crema/60">{me.owner ? "superadmin" : me.role === "musico" ? "músico" : me.role}{me.instrument ? ` · ${me.instrument}` : ""}</span>
              </span>
            </span>
            <Button size="sm" onClick={logout}><Icon name="salir" size={15} />salir</Button>
          </Card>
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          <p className="px-1 font-mono text-[11px] tracking-[.14em] text-crema/55">PARA TODA LA BANDA</p>
          {can("bolos", me) && (
            <Card className="flex flex-col gap-3">
              <CardTitle className="!mb-0" action={isAdmin && <Button size="sm" onClick={() => setTasks(true)}>editar</Button>}>checklist de cada bolo</CardTitle>
              <p className="text-sm text-crema/70">Tareas que salen en todos los bolos, además de las automáticas (presupuesto, rider, entradas y setlist).</p>
              <ul className="flex flex-wrap gap-1.5">
                {commonTasks(settings).map(t => <li key={t.key} className="px-2.5 py-1 rounded-full bg-crema/8 text-sm">{t.name}</li>)}
              </ul>
            </Card>
          )}
          {can("usuarios", me) && (
            <Link to="/usuarios" className="rounded-[20px] bg-tubo hover:bg-tubo-alto p-5 flex items-center justify-between gap-3">
              <span><span className="block font-semibold">usuarios y permisos</span><span className="block text-sm text-crema/65">Invita a alguien o cambia qué puede ver.</span></span>
              <Icon name="flecha" />
            </Link>
          )}
          {can("rider", me) && (
            <Link to="/rider" className="rounded-[20px] bg-tubo hover:bg-tubo-alto p-5 flex items-center justify-between gap-3">
              <span><span className="block font-semibold">material de la banda</span><span className="block text-sm text-crema/65">Lo que lleváis a cada bolo, en rider.</span></span>
              <Icon name="flecha" />
            </Link>
          )}
          {DATA_MODE === "prueba" && (
            <div className="rounded-[20px] border border-dashed border-crema/20 p-5 flex flex-col gap-2 text-sm text-crema/70">
              <p><b className="text-crema">Modo de prueba.</b> Los datos son de ejemplo y viven en este navegador.</p>
              <Button size="sm" className="self-start" onClick={async () => { if (confirm("¿Volver a los datos de ejemplo? Se pierde lo que hayas cambiado.")) { await reset.run(); toast("Datos de prueba reiniciados", "ok"); } }}>reiniciar datos de prueba</Button>
            </div>
          )}
        </div>
      </div>
      {tasks && <CommonTasks settings={settings} onClose={() => { setTasks(false); toast("Tareas comunes guardadas", "ok"); }} onCancel={() => setTasks(false)} />}
    </Page>
  );
}
