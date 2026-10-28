/* Usuarios (solo admin): quién entra en la suite, con qué rol y a
   qué módulos. De verdad: el alta manda una invitación por email
   (Supabase Auth) y los permisos se aplican también en la base de
   datos, no solo escondiendo menús. */
import { useEffect, useState } from "react";
import { Page } from "@/suite/Shell";
import { useMe } from "@/suite/session";
import { NAV, ROLES, ROLE_SCOPES, scopesOf } from "@/suite/nav";
import { useAction, useCollection } from "@/data/hooks";
import { api, uid, DATA_MODE } from "@/data/api";
import type { Member, Role } from "@/data/types";
import { Button, Card, Field, Input, Pill, Sheet, Toggle, useToast } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { ago, cx } from "@/lib/format";

const roleName = (r: Role) => ROLES.find(x => x.value === r)?.name ?? r;
const modName = (id: string) => NAV.find(i => i.id === id)?.name ?? id;

export default function Usuarios() {
  const { me } = useMe();
  const { data: members } = useCollection("members");
  const [editing, setEditing] = useState<Member | "nuevo" | null>(null);
  const groups: { role: Role; list: Member[] }[] = ROLES.map(r => ({ role: r.value, list: members.filter(m => m.role === r.value) }));

  return (
    <Page title="usuarios" actions={<Button variant="primary" onClick={() => setEditing("nuevo")}><Icon name="mas_add" size={16} />invitar</Button>}>
      <div className="grid gap-3 sm:grid-cols-3">
        {ROLES.map(r => (
          <div key={r.value} className="rounded-2xl border border-crema/10 p-4 flex flex-col gap-1">
            <span className="font-semibold">{r.name}</span>
            <span className="text-[13px] text-crema/65 leading-snug">{r.desc}</span>
          </div>
        ))}
      </div>

      {groups.map(g => g.list.length > 0 && (
        <Card key={g.role} className="!p-0 overflow-hidden">
          <h2 className="px-5 pt-4 pb-2 font-mono text-xs tracking-[.14em] text-crema/60">{roleName(g.role).toUpperCase()} · {g.list.length}</h2>
          <ul>
            {g.list.map(m => (
              <li key={m.id}>
                <button type="button" onClick={() => setEditing(m)}
                  className={cx("w-full text-left flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 border-t border-crema/8 hover:bg-tubo-alto", m.active === false && "opacity-55")}>
                  <span className="size-9 shrink-0 rounded-full bg-senal text-noche grid place-items-center font-semibold">{m.name[0]}</span>
                  <span className="flex-[1_1_180px] min-w-0">
                    <span className="block font-medium">{m.name}{m.id === me.id && <span className="text-crema/55 font-normal"> · tú</span>}</span>
                    <span className="block text-[13px] text-crema/60 truncate">{m.instrument}{m.email ? ` · ${m.email}` : ""}</span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {m.active === false ? <Pill>sin acceso</Pill> : m.role === "admin" ? <Pill tone="senal">todo</Pill>
                      : scopesOf(m).filter(s => s !== "inicio").map(s => <Pill key={s}>{modName(s)}</Pill>)}
                    {m.band && <Pill>en el reparto</Pill>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ))}

      <UserSheet member={editing} onClose={() => setEditing(null)} />
    </Page>
  );
}

function UserSheet({ member, onClose }: { member: Member | "nuevo" | null; onClose: () => void }) {
  const { me } = useMe();
  const toast = useToast();
  const isNew = member === "nuevo";
  const blank: Member = { id: "", name: "", instrument: "", role: "musico", email: "", active: true, band: false };
  const [f, setF] = useState<Member>(blank);
  useEffect(() => { if (member) setF(member === "nuevo" ? blank : { ...member }); }, [member]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof Member>(k: K, v: Member[K]) => setF(x => ({ ...x, [k]: v }));
  const scopes = scopesOf(f);
  const custom = f.role !== "admin" && f.scopes !== undefined;

  const save = useAction(async (m: Member) => {
    if (isNew) await api.inviteMember({ ...m, id: uid("u-") });
    else await api.update("members", m.id, m);
  });
  const remove = useAction((id: string) => api.remove("members", id));

  const toggleScope = (id: string) => {
    const cur = scopes.filter(s => s !== "inicio");
    set("scopes", cur.includes(id) ? cur.filter(s => s !== id) : [...cur, id]);
  };

  const isMe = !isNew && f.id === me.id;

  return (
    <Sheet open={!!member} onClose={onClose} title={isNew ? "invitar a la suite" : f.name || "usuario"}>
      <form className="flex flex-col gap-4 pt-1" onSubmit={async e => {
        e.preventDefault();
        await save.run(f);
        toast(isNew ? (DATA_MODE === "supabase" ? `Invitación enviada a ${f.email}` : `Invitación lista para ${f.email || f.name} (de prueba: no se envía)`) : "Guardado", "ok");
        onClose();
      }}>
        <Field label="nombre">{id => <Input id={id} required value={f.name} onChange={e => set("name", e.target.value)} />}</Field>
        <Field label="email" hint={isNew ? "le llega un enlace para crear su contraseña" : undefined}>{id => <Input id={id} type="email" required={isNew} value={f.email ?? ""} onChange={e => set("email", e.target.value)} />}</Field>
        <Field label="instrumento o función">{id => <Input id={id} placeholder="gtr solo, puerta y merch…" value={f.instrument} onChange={e => set("instrument", e.target.value)} />}</Field>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] text-crema/75">tipo de acceso</span>
          {ROLES.map(r => (
            <label key={r.value} className={cx("flex gap-3 items-start p-3 rounded-xl border cursor-pointer", f.role === r.value ? "border-senal bg-noche" : "border-crema/12")}>
              <input type="radio" name="role" checked={f.role === r.value} disabled={isMe && r.value !== "admin"}
                onChange={() => setF(x => ({ ...x, role: r.value, scopes: undefined, band: r.value === "admin" ? x.band ?? true : x.band }))} className="mt-1 accent-senal" />
              <span><b className="font-semibold">{r.name}</b><span className="block text-[13px] text-crema/65">{r.desc}</span></span>
            </label>
          ))}
          {isMe && <span className="text-xs text-crema/55">No puedes quitarte el admin a ti mismo.</span>}
        </div>

        {f.role !== "admin" && (
          <div className="flex flex-col gap-2">
            <span className="flex justify-between text-[13px] text-crema/75">
              <span>qué puede abrir</span>
              {custom && <button type="button" className="underline" onClick={() => set("scopes", undefined)}>volver a los de «{roleName(f.role)}»</button>}
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {NAV.filter(i => !i.adminOnly && i.id !== "inicio").map(i => {
                const on = scopes.includes(i.id);
                return (
                  <button key={i.id} type="button" aria-pressed={on} onClick={() => toggleScope(i.id)}
                    className={cx("h-11 px-3 rounded-xl flex items-center gap-2 text-sm text-left", on ? "bg-crema text-noche font-medium" : "bg-noche text-crema/65")}>
                    <Icon name={i.icon} size={16} />{i.name}
                  </button>
                );
              })}
            </div>
            <span className="text-xs text-crema/55">Por defecto, {roleName(f.role)}: {ROLE_SCOPES[f.role].filter(s => s !== "inicio").map(modName).join(", ")}.</span>
          </div>
        )}

        <Toggle checked={!!f.band} onChange={v => set("band", v)} label="de la banda (entra en finanzas y en el reparto)" className="self-start" />
        {!isNew && !isMe && <Toggle checked={f.active !== false} onChange={v => set("active", v)} label={f.active !== false ? "tiene acceso" : "sin acceso (se guarda su historial)"} className="self-start" />}
        {!isNew && f.invitedAt && <p className="text-xs text-crema/55">Invitado {ago(f.invitedAt)}.</p>}

        <Button type="submit" variant="primary" size="lg" disabled={save.pending}>{isNew ? "enviar invitación" : "guardar"}</Button>
        {!isNew && !isMe && !f.band && (
          <Button variant="quiet" onClick={async () => { if (confirm(`¿Borrar a ${f.name}? Si solo quieres cortarle el acceso, usa «sin acceso».`)) { await remove.run(f.id); toast("Usuario borrado", "ok"); onClose(); } }}>
            <Icon name="basura" size={16} />borrar usuario
          </Button>
        )}
      </form>
    </Sheet>
  );
}
