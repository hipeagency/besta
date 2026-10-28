/* «más» (móvil): accesos grandes a lo que se usa en un bolo y el
   resto de módulos que no caben en las pestañas. */
import { Link } from "react-router";
import { Page } from "@/suite/Shell";
import { useMe } from "@/suite/session";
import { NAV, TABS, can, canSee } from "@/suite/nav";
import { useAction } from "@/data/hooks";
import { api, DATA_MODE } from "@/data/api";
import { Button, Segmented, useToast } from "@/components/ui";
import { useTheme, type ThemePref } from "@/suite/theme";
import { Icon } from "@/components/ui/icons";

export default function Mas() {
  const { me, logout } = useMe();
  const toast = useToast();
  const reset = useAction(() => api.reset());
  const theme = useTheme();
  const rest = NAV.filter(i => !(TABS as readonly string[]).includes(i.id) && i.id !== "puerta" && canSee(i, me));

  return (
    <Page title="más">
      {can("merch", me) && <Link to="/merch/puesto" className="h-16 px-5 rounded-[18px] bg-senal text-noche flex items-center justify-between font-semibold text-[17px]">abrir puesto de merch <Icon name="flecha" /></Link>}
      {can("puerta", me) && <Link to="/puerta" className="h-16 px-5 rounded-[18px] bg-crema text-noche flex items-center justify-between font-semibold text-[17px]">escáner de puerta <Icon name="flecha" /></Link>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {rest.map(i => (
          <Link key={i.id} to={i.path} className="min-h-[88px] rounded-2xl bg-tubo p-4 flex flex-col gap-1">
            <Icon name={i.icon} />
            <span className="font-semibold mt-1">{i.name}</span>
            <span className="text-xs text-crema/60">{i.desktopOnly ? "solo en ordenador" : i.desc}</span>
          </Link>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-crema/10">
        <span className="flex items-center gap-3">
          <span className="size-9 rounded-full bg-senal text-noche grid place-items-center font-semibold">{me.name[0]}</span>
          <span className="text-sm">{me.name} · {me.role === "musico" ? "músico" : me.role}</span>
        </span>
        <Button size="sm" variant="quiet" onClick={logout}>salir</Button>
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm text-crema/75">tema</span>
        <Segmented<ThemePref> value={theme.pref} onChange={theme.setPref} size="sm" options={[{ value: "auto", label: "automático" }, { value: "claro", label: "claro" }, { value: "oscuro", label: "oscuro" }]} />
      </div>
      {DATA_MODE === "prueba" && <div className="rounded-2xl border border-dashed border-crema/20 p-4 flex flex-col gap-2 text-sm text-crema/70">
        <p><b className="text-crema">Modo de prueba.</b> Los datos son de ejemplo y viven en este navegador.</p>
        <Button size="sm" className="self-start" onClick={async () => { if (confirm("¿Volver a los datos de ejemplo? Se pierde lo que hayas cambiado.")) { await reset.run(); toast("Datos de prueba reiniciados", "ok"); } }}>reiniciar datos de prueba</Button>
      </div>}
    </Page>
  );
}
