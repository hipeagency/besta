/* Editor de setlist: orden de canciones, momentos y bloques («primer
   pase», «bis»), notas por canción, bolo al que va, duración total y
   «cerrado». Saca la hoja para imprimir y arranca el modo directo. */
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useAction, useCollection } from "@/data/hooks";
import { api } from "@/data/api";
import { setlistMinutes, upcomingGigs } from "@/data/selectors";
import type { ID, Setlist, Song } from "@/data/types";
import { Button, Empty, Field, IconButton, Input, Select, Toggle, useToast } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { cx, dateShort } from "@/lib/format";
import { displayKey, norm, useView } from "./lib";
import { setlistItems, songIdsOf, updateSetlist, type SetlistItem, type SetlistX } from "./extra";
import { uid } from "@/data/api";
import { SaveStatus } from "./parts";

export function SetlistEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { latin } = useView();
  const { data: setlists, loading } = useCollection("setlists");
  const { data: songs } = useCollection("songs");
  const { data: gigs } = useCollection("gigs");
  const [q, setQ] = useState("");
  const patch = useAction((p: Partial<Setlist>) => api.update("setlists", id!, p));

  /* El bolo también apunta a su setlist (lo lee la ficha del bolo). */
  const linkGig = useAction(async (gigId: ID | undefined, sl: Setlist) => {
    const old = gigs.find(g => g.id === sl.gigId);
    if (old && old.setlistId === sl.id) await api.update("gigs", old.id, { setlistId: undefined });
    if (gigId) await api.update("gigs", gigId, { setlistId: sl.id });
    await api.update("setlists", sl.id, { gigId });
  });
  const remove = useAction(async (sl: Setlist) => {
    for (const g of gigs.filter(g => g.setlistId === sl.id)) await api.update("gigs", g.id, { setlistId: undefined });
    await api.remove("setlists", sl.id);
  });

  const sl = setlists.find(s => s.id === id);
  if (loading) return null;
  if (!sl) return (
    <main className="flex-1 p-6">
      <Link to="/ensayos/setlists" className="md:hidden font-mono text-xs text-crema/80 inline-flex items-center gap-1.5"><Icon name="atras" size={14} />setlists</Link>
      <div className="mt-4"><Empty title="Este setlist ya no existe" /></div>
    </main>
  );

  const mins = setlistMinutes(sl.songIds, songs);
  const locked = sl.closed;
  const slx = sl as SetlistX;
  const items = setlistItems(sl);
  const gig = gigs.find(g => g.id === sl.gigId);
  /* items y songIds siempre juntos: songIds es lo que leen el bolo y el directo. */
  const setItems = (next: SetlistItem[]) => updateSetlist(sl.id, { items: next, songIds: songIdsOf(next) });
  const setIds = (songIds: ID[]) => setItems([...items, ...songIds.filter(x => !sl.songIds.includes(x)).map((songId): SetlistItem => ({ id: uid("i"), type: "song", songId }))]);
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const n = [...items]; [n[i], n[j]] = [n[j], n[i]]; setItems(n);
  };
  const editItem = (i: number, p: Partial<{ title: string; notes: string }>) => setItems(items.map((x, j) => (j === i ? { ...x, ...p } as SetlistItem : x)));
  let num = 0;
  const nq = norm(q.trim());
  const candidates = songs
    .filter(s => !sl.songIds.includes(s.id) && (!nq || norm(`${s.title} ${s.artist}`).includes(nq)))
    .sort((a, b) => a.title.localeCompare(b.title, "es"))
    .slice(0, nq ? 20 : 8);
  const gigOptions = [...upcomingGigs(gigs), ...gigs.filter(g => g.id === sl.gigId && !upcomingGigs(gigs).includes(g))];

  return (
    <main className="flex-1 min-w-0 md:overflow-y-auto px-4 md:px-[clamp(16px,3vw,40px)] pt-4 md:pt-6 pb-16 flex flex-col gap-5 max-w-[920px] print:p-0 print:max-w-none print:overflow-visible">
      <div className="print:hidden md:hidden flex items-center justify-between gap-3 -mt-1">
        <Link to="/ensayos/setlists" className="font-mono text-xs text-crema/80 h-11 inline-flex items-center gap-1.5"><Icon name="atras" size={14} />setlists</Link>
        <SaveStatus />
      </div>

      <header className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div className="min-w-0">
          <p className="font-mono text-xs text-senal mb-1">SETLIST · {sl.songIds.length} CANCIONES · {Math.round(mins)} MIN{locked ? " · CERRADO" : ""}</p>
          <h1 className="text-[30px] md:text-[44px] font-extrabold tracking-[-.035em] leading-none">{sl.name}</h1>
        </div>
        <span className="flex gap-2">
          <Button variant="ghost" disabled={!sl.songIds.length} onClick={() => window.print()}><Icon name="descargar" size={16} />hoja · PDF</Button>
          <Button variant="primary" disabled={!sl.songIds.length} onClick={() => nav(`/ensayos/directo/${sl.id}`)}><Icon name="play" size={14} />modo directo</Button>
        </span>
      </header>

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end print:hidden">
        <Field label="nombre">{fid => <Input id={fid} key={sl.id + sl.name} defaultValue={sl.name}
          onBlur={e => { const v = e.target.value.trim(); if (v && v !== sl.name) { patch.run({ name: v }); toast("Renombrado", "ok"); } }} />}</Field>
        <Field label="bolo">{fid => (
          <Select id={fid} value={sl.gigId ?? ""} onChange={e => linkGig.run(e.target.value || undefined, sl)}>
            <option value="">sin bolo (ensayo)</option>
            {gigOptions.map(g => <option key={g.id} value={g.id}>{dateShort(g.date)} · {g.city} · {g.venue}</option>)}
          </Select>
        )}</Field>
        <Toggle checked={sl.closed} onChange={v => { patch.run({ closed: v }); toast(v ? "Setlist cerrado" : "Setlist abierto", "ok"); }} label="cerrado" />
        {/* sin bolo: fecha y sala a mano, solo para la hoja */}
        {!gig && <>
          <Field label="fecha (hoja)">{fid => <Input id={fid} key={`d${sl.id}${slx.date ?? ""}`} defaultValue={slx.date ?? ""} placeholder="12 dic"
            onBlur={e => { const v = e.target.value.trim(); if (v !== (slx.date ?? "")) updateSetlist(sl.id, { date: v || undefined }); }} />}</Field>
          <Field label="sala (hoja)">{fid => <Input id={fid} key={`v${sl.id}${slx.venue ?? ""}`} defaultValue={slx.venue ?? ""} placeholder="sala, ciudad"
            onBlur={e => { const v = e.target.value.trim(); if (v !== (slx.venue ?? "")) updateSetlist(sl.id, { venue: v || undefined }); }} />}</Field>
        </>}
      </div>

      <section className="rounded-[20px] bg-tubo p-2 md:p-3 print:hidden">
        {!items.length && <p className="p-4 text-sm text-crema/65">Vacío. Añade canciones abajo.</p>}
        <ol className="flex flex-col">
          {items.map((it, i) => {
            const s = it.type === "song" ? songs.find(x => x.id === it.songId) : undefined;
            const n = it.type === "song" ? ++num : 0;
            const label = it.type === "song" ? s?.title ?? "canción borrada" : it.title || it.type;
            return (
              <li key={it.id} className={cx("flex flex-col pl-2 md:pl-3 py-1", i > 0 && "border-t border-crema/8", it.type === "bloque" && "pt-3")}>
                <div className="flex items-center gap-2 md:gap-3 min-h-[44px]">
                  {it.type === "song" ? <>
                    <span className="w-6 font-mono text-sm text-crema/55">{n}</span>
                    <span className="flex-1 min-w-0">
                      {s ? <Link to={`/ensayos/${s.id}`} className="block truncate hover:text-senal-suave">{s.title}</Link> : <span className="text-crema/50">canción borrada</span>}
                      {s && <span className="block truncate text-xs text-crema/55">{s.artist}</span>}
                    </span>
                    <span className="font-mono text-sm text-crema/75 w-10 text-right">{s ? displayKey(s.key, 0, latin) : ""}</span>
                    <span className="hidden sm:inline font-mono text-sm text-crema/55 w-11 text-right">{s?.duration ?? ""}</span>
                  </> : (
                    <span className="flex-1 min-w-0 flex items-center gap-2">
                      <span className={cx("shrink-0 font-mono text-[10px] uppercase tracking-[.12em] px-2 py-1 rounded-full", it.type === "bloque" ? "bg-crema text-noche" : "bg-senal/15 text-senal-suave")}>{it.type}</span>
                      <label className="sr-only" htmlFor={`it-${it.id}`}>Título del {it.type}</label>
                      <input id={`it-${it.id}`} key={it.title} defaultValue={it.title} disabled={locked}
                        placeholder={it.type === "bloque" ? "primer pase, bis…" : "presentación, cambio de guitarra…"}
                        onBlur={e => { if (e.target.value.trim() !== it.title) editItem(i, { title: e.target.value.trim() }); }}
                        className={cx("flex-1 min-w-0 h-10 bg-transparent rounded-lg px-2 focus:outline-none focus:bg-noche", it.type === "bloque" ? "font-semibold uppercase tracking-wide" : "italic")} />
                    </span>
                  )}
                  {!locked && <span className="flex shrink-0">
                    {it.notes == null && <IconButton label={`Añadir nota a ${label}`} onClick={() => editItem(i, { notes: "" })} className="text-[13px] font-mono">+ nota</IconButton>}
                    <IconButton label={`Subir ${label}`} disabled={i === 0} onClick={() => move(i, -1)}><Icon name="arriba" size={16} /></IconButton>
                    <IconButton label={`Bajar ${label}`} disabled={i === items.length - 1} onClick={() => move(i, 1)}><Icon name="abajo" size={16} /></IconButton>
                    <IconButton label={`Quitar ${label}`} onClick={() => setItems(items.filter((_, j) => j !== i))}><Icon name="x" size={16} /></IconButton>
                  </span>}
                </div>
                {it.notes != null && (
                  <div className="flex items-center gap-2 pl-8 pr-1 pb-1">
                    <label className="sr-only" htmlFor={`in-${it.id}`}>Nota de {label}</label>
                    <input id={`in-${it.id}`} key={it.notes} defaultValue={it.notes} disabled={locked} autoFocus={!it.notes}
                      placeholder="cambio de afinación, presentar a la banda, sin pausa…"
                      onBlur={e => { const v = e.target.value.trim(); if (!v) { const { notes: _drop, ...rest } = it; void _drop; setItems(items.map((x, j) => (j === i ? rest as SetlistItem : x))); } else if (v !== it.notes) editItem(i, { notes: v }); }}
                      className="flex-1 min-w-0 h-9 rounded-lg bg-noche px-2.5 text-[13px] text-crema/85 placeholder:text-crema/40 focus:outline-none focus:ring-1 focus:ring-senal" />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {!locked && (
          <div className="flex gap-1 pt-2 pl-1">
            <Button size="sm" variant="quiet" onClick={() => setItems([...items, { id: uid("i"), type: "momento", title: "" }])}>+ momento</Button>
            <Button size="sm" variant="quiet" onClick={() => setItems([...items, { id: uid("i"), type: "bloque", title: "" }])}>+ bloque</Button>
          </div>
        )}
      </section>

      <SetlistSheet name={sl.name} items={items} songs={songs} latin={latin}
        date={gig ? dateShort(gig.date) : slx.date} venue={gig ? `${gig.venue} · ${gig.city}` : slx.venue} />

      {locked ? (
        <p className="print:hidden text-sm text-crema/65">Está cerrado: ábrelo para cambiar el orden o las canciones.</p>
      ) : (
        <section className="flex flex-col gap-3 print:hidden">
          <h2 className="text-[17px] font-semibold">añadir canciones</h2>
          <label className="sr-only" htmlFor="sl-q">Buscar canción para añadir</label>
          <Input id="sl-q" type="search" placeholder="buscar…" value={q} onChange={e => setQ(e.target.value)} />
          <ul className="flex flex-col">
            {candidates.map(s => (
              <li key={s.id}>
                <button type="button" onClick={() => setIds([...sl.songIds, s.id])}
                  className="w-full flex items-center justify-between gap-3 min-h-11 px-2.5 rounded-[10px] hover:bg-crema/5 text-left">
                  <span className="min-w-0 truncate">{s.title} <span className="text-crema/55 text-sm">· {s.artist}</span></span>
                  <span className="shrink-0 font-mono text-sm text-senal-suave">+ añadir</span>
                </button>
              </li>
            ))}
            {!candidates.length && <li className="text-sm text-crema/60 px-2.5">{nq ? "Nada con eso." : "Ya están todas."}</li>}
          </ul>
        </section>
      )}

      <Button variant="quiet" className="self-start mt-4 print:hidden" onClick={async () => {
        if (!window.confirm(`¿Borrar «${sl.name}»? Las canciones no se borran.`)) return;
        await remove.run(sl);
        toast("Setlist borrado", "ok");
        nav("/ensayos/setlists", { replace: true });
      }}><Icon name="basura" size={16} />borrar setlist</Button>
    </main>
  );
}

/* Hoja del setlist para pegar en el escenario: solo se ve al imprimir.
   Títulos enormes y numerados; bloques como cabecera; momentos en cursiva. */
function SetlistSheet({ name, items, songs, latin, date, venue }: {
  name: string; items: SetlistItem[]; songs: Song[]; latin: boolean; date?: string; venue?: string;
}) {
  let n = 0;
  const count = items.filter(i => i.type === "song").length;
  /* Cuantas más canciones, letra más pequeña: que quepa en un folio. */
  const size = count <= 10 ? 34 : count <= 14 ? 28 : count <= 18 ? 23 : 19;
  return (
    <section className="hidden print:block text-black">
      <header className="flex justify-between items-baseline border-b-2 border-black pb-2 mb-4">
        <h1 className="text-[28px] font-extrabold tracking-[-.02em] uppercase">{name}</h1>
        <p className="font-mono text-sm">{[date, venue].filter(Boolean).join(" · ")}</p>
      </header>
      <ol className="flex flex-col gap-1">
        {items.map(it => {
          if (it.type === "bloque") return <li key={it.id} className="mt-3 font-mono text-sm font-bold uppercase tracking-[.14em] border-b border-black/40">{it.title || "bloque"}</li>;
          if (it.type !== "song") return (
            <li key={it.id} className="italic text-[17px] pl-10">— {it.title || "momento"}{it.notes && <span className="not-italic text-sm text-black/60"> · {it.notes}</span>}</li>
          );
          const s = songs.find(x => x.id === it.songId);
          if (!s) return null;
          return (
            <li key={it.id} className="flex items-baseline gap-3 leading-tight">
              <span className="w-8 shrink-0 font-mono text-base text-black/60 text-right">{++n}</span>
              <span className="flex-1 font-extrabold tracking-[-.02em]" style={{ fontSize: size }}>{s.title}
                {it.notes && <span className="block font-normal text-sm tracking-normal text-black/60">{it.notes}</span>}
              </span>
              <span className="font-mono text-base">{displayKey(s.key, 0, latin)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
