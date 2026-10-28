/* Sesión. Hoy: modo de prueba, eliges quién eres. Con backend:
   Supabase Auth (email + contraseña / enlace mágico) y el rol
   sale de la tabla de miembros. */
import { createContext, useContext, useState, type ReactNode } from "react";
import type { Member } from "@/data/types";
import { useCollection } from "@/data/hooks";
import { Button, Logo } from "@/components/ui";

const KEY = "besta:sesion-prueba";
const Ctx = createContext<{ me: Member; logout: () => void } | null>(null);

export function useMe() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useMe fuera de la sesión");
  return c;
}

const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };

export function SessionGate({ children }: { children: ReactNode }) {
  const { data: members, loading } = useCollection("members");
  const [id, setId] = useState<string | null>(read);
  const me: Member | undefined = members.find(m => m.id === id && m.active !== false);

  const pick = (mid: string) => { try { localStorage.setItem(KEY, mid); } catch { /* sin almacenamiento */ } setId(mid); };
  const logout = () => { try { localStorage.removeItem(KEY); } catch { /* */ } setId(null); };

  if (loading) return <div className="min-h-dvh grid place-items-center text-crema/60">comprobando sesión…</div>;

  if (!me) return (
    <div className="min-h-dvh grid place-items-center p-6">
      <div className="w-full max-w-[420px] rounded-[28px] bg-tubo p-7 flex flex-col gap-5">
        <Logo className="w-36" />
        <p className="kicker text-crema/70 text-xs">suite interna</p>
        <div className="rounded-2xl bg-noche p-4 text-sm leading-relaxed text-crema/80">
          <b className="text-crema">Modo de prueba.</b> Aún no hay backend: los datos son de ejemplo y se guardan en este navegador. Entra como:
        </div>
        <div className="grid grid-cols-2 gap-2">
          {members.filter(m => m.active !== false).map(m => (
            <Button key={m.id} variant={m.role === "admin" ? "primary" : "ghost"} onClick={() => pick(m.id)} className={m.role === "admin" ? "!justify-start" : "!justify-start col-span-2"}>
              {m.name} <span className="font-mono text-[11px] opacity-70">{m.role === "admin" ? m.instrument : m.role === "musico" ? "músico · solo música" : "staff · entradas y merch"}</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );

  return <Ctx.Provider value={{ me, logout }}>{children}</Ctx.Provider>;
}
