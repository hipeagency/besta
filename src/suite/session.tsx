/* Sesión de la suite.
   - Modo de prueba: eliges quién eres (datos en el navegador).
   - Datos reales: Supabase Auth (email + contraseña o enlace mágico).
     La ficha de miembro (rol y permisos) se busca por la cuenta. */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Member } from "@/data/types";
import { useCollection } from "@/data/hooks";
import { DATA_MODE } from "@/data/api";
import { sb } from "@/data/supabase";
import { Button, Field, Input, Logo } from "@/components/ui";

const KEY = "besta:sesion-prueba";
const Ctx = createContext<{ me: Member; logout: () => void } | null>(null);

export function useMe() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useMe fuera de la sesión");
  return c;
}

export function SessionGate({ children }: { children: ReactNode }) {
  return DATA_MODE === "supabase" ? <RealGate>{children}</RealGate> : <MockGate>{children}</MockGate>;
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh grid place-items-center p-6">
      <div className="w-full max-w-[420px] rounded-[28px] bg-tubo p-7 flex flex-col gap-5">
        <Logo className="w-36" />
        <p className="kicker text-crema/70 text-xs">suite interna</p>
        {children}
      </div>
    </div>
  );
}

// ---------- modo de prueba ----------
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };

function MockGate({ children }: { children: ReactNode }) {
  const { data: members, loading } = useCollection("members");
  const [id, setId] = useState<string | null>(read);
  const me: Member | undefined = members.find(m => m.id === id && m.active !== false);

  const pick = (mid: string) => { try { localStorage.setItem(KEY, mid); } catch { /* sin almacenamiento */ } setId(mid); };
  const logout = () => { try { localStorage.removeItem(KEY); } catch { /* */ } setId(null); };

  if (loading) return <div className="min-h-dvh grid place-items-center text-crema/60">comprobando sesión…</div>;

  if (!me) return (
    <Card>
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
    </Card>
  );

  return <Ctx.Provider value={{ me, logout }}>{children}</Ctx.Provider>;
}

// ---------- datos reales ----------
/* El enlace de invitación o de «olvidé la contraseña» trae el tipo en
   la URL; se lee antes de que Supabase la limpie al iniciar sesión. */
const arrivedFor = typeof window !== "undefined" && /type=(invite|recovery)/.test(window.location.hash + window.location.search) ? "password" : null;

type Phase = "cargando" | "fuera" | "contraseña" | "dentro";

function RealGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("cargando");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const client = sb();
    client.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setPhase(data.session ? (arrivedFor ? "contraseña" : "dentro") : "fuera");
    });
    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      setUserId(session?.user.id ?? null);
      if (event === "PASSWORD_RECOVERY") setPhase("contraseña");
      else if (event === "SIGNED_OUT") setPhase("fuera");
      else if (session) setPhase(p => (p === "contraseña" ? p : "dentro"));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const logout = () => { sb().auth.signOut(); };

  if (phase === "cargando") return <div className="min-h-dvh grid place-items-center text-crema/60">comprobando sesión…</div>;
  if (phase === "fuera") return <Login />;
  if (phase === "contraseña") return <SetPassword onDone={() => setPhase("dentro")} />;
  return <Membership userId={userId!} logout={logout}>{children}</Membership>;
}

/* Con sesión, falta la ficha de miembro. Sin ficha (o desactivada) no se entra. */
function Membership({ userId, logout, children }: { userId: string; logout: () => void; children: ReactNode }) {
  const { data: members, loading } = useCollection("members");
  if (loading) return <div className="min-h-dvh grid place-items-center text-crema/60">cargando…</div>;
  const me = members.find(m => m.userId === userId);
  if (!me || me.active === false) return (
    <Card>
      <p className="leading-relaxed">Tu cuenta existe, pero no tiene acceso a la suite. Pídeselo a alguien de la banda.</p>
      <Button onClick={logout}>salir</Button>
    </Card>
  );
  return <Ctx.Provider value={{ me, logout }}>{children}</Ctx.Provider>;
}

function Login() {
  const [mode, setMode] = useState<"password" | "enlace" | "olvido">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const redirectTo = `${window.location.origin}/suite/`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg("");
    const auth = sb().auth;
    const { error } =
      mode === "password" ? await auth.signInWithPassword({ email, password })
      : mode === "enlace" ? await auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } })
      : await auth.resetPasswordForEmail(email, { redirectTo });
    setBusy(false);
    if (error) setMsg(error.message === "Invalid login credentials" ? "Email o contraseña incorrectos." : error.message);
    else if (mode !== "password") setMsg("Te hemos mandado un email con el enlace. Ábrelo en este mismo aparato.");
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="email">{id => <Input id={id} type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} />}</Field>
        {mode === "password" && <Field label="contraseña">{id => <Input id={id} type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />}</Field>}
        <Button type="submit" variant="primary" size="lg" disabled={busy}>{mode === "password" ? "entrar" : mode === "enlace" ? "mandarme el enlace" : "recuperar contraseña"}</Button>
        {msg && <p role="status" className="text-sm rounded-xl bg-noche p-3">{msg}</p>}
      </form>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-crema/70">
        {mode !== "password" && <button type="button" className="underline" onClick={() => { setMode("password"); setMsg(""); }}>con contraseña</button>}
        {mode !== "enlace" && <button type="button" className="underline" onClick={() => { setMode("enlace"); setMsg(""); }}>entrar con un enlace al email</button>}
        {mode !== "olvido" && <button type="button" className="underline" onClick={() => { setMode("olvido"); setMsg(""); }}>he olvidado la contraseña</button>}
      </div>
    </Card>
  );
}

function SetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <Card>
      <p className="leading-relaxed">Elige tu contraseña para la suite.</p>
      <form className="flex flex-col gap-3" onSubmit={async e => {
        e.preventDefault();
        if (password.length < 8) { setMsg("Mínimo 8 caracteres."); return; }
        const { error } = await sb().auth.updateUser({ password });
        if (error) setMsg(error.message); else { history.replaceState(null, "", window.location.pathname); onDone(); }
      }}>
        <Field label="contraseña nueva">{id => <Input id={id} type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />}</Field>
        <Button type="submit" variant="primary" size="lg">guardar y entrar</Button>
        {msg && <p role="alert" className="text-sm">{msg}</p>}
      </form>
    </Card>
  );
}
