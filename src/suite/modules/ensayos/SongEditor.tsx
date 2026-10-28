/* Editor de canción: datos, material, secciones con dos modos —«escribir»
   (texto plano, acordes encima o [Am] dentro de la letra) y «poner acordes»
   (tocas una palabra y eliges el acorde)—, cortar/unir/duplicar, tu nota
   en cada sección y «mis acordes» de quien edita. Borrar se pide y lo
   aprueba la banda. */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useAction, useCollection } from "@/data/hooks";
import { api, uid } from "@/data/api";
import type { ID, Song, SongSection } from "@/data/types";
import { Button, Field, IconButton, Input, Modal, Segmented, Sheet, Textarea, Toggle, useToast } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { cx } from "@/lib/format";
import { chordsIn, guessKey, isChordLine, linesToText, parseChordText, useView } from "./lib";
import { sx, updateSong, type SongAudio, type SongLink } from "./extra";
import { MaterialEditor } from "./Material";
import { ChordPalette, ChordPlacer } from "./ChordPlacer";

interface Draft { id: ID; name: string; note: string; text: string; mine: string; mineOn: boolean; myNote: string }

const bandChords = (text: string) => parseChordText(text).map(l => l.chords).join("\n");
const blank = (name: string, text = ""): Draft => ({ id: uid(), name, note: "", text, mine: "", mineOn: false, myNote: "" });

function toDraft(song: Song, me: ID): Draft[] {
  const notes = sx(song).sectionNotes ?? {};
  return song.sections.map(s => {
    const mine = song.memberChords[me]?.[s.id];
    return { id: s.id, name: s.name, note: s.note ?? "", text: linesToText(s.lines), mine: mine ?? s.lines.map(l => l.chords).join("\n"), mineOn: mine != null, myNote: notes[s.id]?.[me] ?? "" };
  });
}

export function SongEditor({ open, onClose, song }: { open: boolean; onClose: () => void; song: Song }) {
  const { me, latin } = useView();
  const toast = useToast();
  const [tab, setTab] = useState<"cancion" | "material" | "mis">("cancion");
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [key, setKey] = useState(song.key);
  const [bpm, setBpm] = useState(song.bpm ? String(song.bpm) : "");
  const [duration, setDuration] = useState(song.duration ?? "");
  const [own, setOwn] = useState(song.own);
  const [notes, setNotes] = useState(sx(song).notes ?? "");
  const [audios, setAudios] = useState<SongAudio[]>([]);
  const [links, setLinks] = useState<SongLink[]>([]);
  const [secs, setSecsRaw] = useState<Draft[]>(() => toDraft(song, me.id));
  const [history, setHistory] = useState<Draft[][]>([]);
  const [deleting, setDeleting] = useState(false);
  const [pal, setPal] = useState<number | null>(null); // sección con la paleta abierta
  const [modo, setModo] = useState<"acordes" | "escribir">("escribir");
  const areas = useRef<Record<ID, HTMLTextAreaElement | null>>({});
  const carets = useRef<Record<ID, number>>({});

  /* Cada vez que se abre, se parte de lo guardado. El demoUrl antiguo pasa a ser un link o un audio más. */
  useEffect(() => {
    if (!open) return;
    const x = sx(song);
    setTitle(song.title); setArtist(song.artist); setKey(song.key); setBpm(song.bpm ? String(song.bpm) : "");
    setDuration(song.duration ?? ""); setOwn(song.own); setNotes(x.notes ?? ""); setSecsRaw(toDraft(song, me.id)); setHistory([]); setTab("cancion"); setPal(null);
    setModo(song.sections.some(s => s.lines.some(l => l.lyric.trim())) ? "acordes" : "escribir");
    const a = [...(x.audios ?? [])];
    const l = [...(x.links ?? [])];
    for (const [url, label] of [[x.video, "referencia youtube"], [song.demoUrl, "demo"]] as const) {
      const u = url?.trim();
      if (!u || a.some(i => i.url === u) || l.some(i => i.url === u)) continue;
      if (/\.(mp3|m4a|wav|ogg|aac|flac)(\?|$)/i.test(u)) a.unshift({ id: uid("a"), name: label, url: u });
      else l.unshift({ id: uid("l"), label, url: u });
    }
    setAudios(a); setLinks(l);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* Cambios de estructura (cortar, unir, quitar, mover…) se pueden deshacer. */
  const setSecs = (f: (s: Draft[]) => Draft[]) => {
    const next = f(secs);
    if (next === secs) return;
    setHistory(h => [...h.slice(-29), secs]);
    setSecsRaw(next);
  };
  const undo = () => { const last = history[history.length - 1]; if (!last) return; setHistory(h => h.slice(0, -1)); setSecsRaw(last); };
  /* Escribir no cuenta como estructura: para eso está el deshacer del propio campo. */
  const edit = (i: number, p: Partial<Draft>) => setSecsRaw(s => s.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const move = (i: number, d: -1 | 1) => setSecs(s => {
    const j = i + d;
    if (j < 0 || j >= s.length) return s;
    const n = [...s]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });

  /** ✂ corta la sección en la línea del cursor: lo de debajo pasa a una sección nueva. */
  const splitAtCaret = (i: number) => setSecs(s => {
    const d = s[i];
    const pos = carets.current[d.id] ?? areas.current[d.id]?.selectionStart ?? 0;
    const lineStart = d.text.lastIndexOf("\n", Math.max(0, pos - 1)) + 1;
    const head = d.text.slice(0, lineStart).replace(/\n+$/, "");
    const tail = d.text.slice(lineStart).replace(/^\n+/, "");
    if (!head.trim() || !tail.trim()) { toast("Pon el cursor en la línea donde empieza la nueva sección", "error"); return s; }
    const n = [...s];
    n.splice(i, 1, { ...d, text: head }, blank(`${d.name} (2)`, tail));
    return n;
  });

  /** ⤒ une con la anterior: el texto se pega debajo y la nota se conserva. */
  const mergeUp = (i: number) => setSecs(s => {
    if (i === 0) return s;
    const a = s[i - 1], b = s[i];
    const n = [...s];
    n.splice(i - 1, 2, { ...a, text: [a.text, b.text].filter(t => t.trim()).join("\n"), note: [a.note, b.note].filter(Boolean).join(" · "), myNote: [a.myNote, b.myNote].filter(Boolean).join(" · ") });
    return n;
  });

  /** ⇥ divide en bloques por las líneas en blanco. */
  const splitBlocks = (i: number) => setSecs(s => {
    const d = s[i];
    const blocks = d.text.split(/\n\s*\n/).map(b => b.replace(/^\n+|\s+$/g, "")).filter(b => b.trim());
    if (blocks.length < 2) { toast("No hay líneas en blanco para dividir", "error"); return s; }
    const n = [...s];
    n.splice(i, 1, { ...d, text: blocks[0] }, ...blocks.slice(1).map((b, k) => blank(`${d.name} (${k + 2})`, b)));
    return n;
  });

  /** ♫ mete un acorde donde está el cursor: en una línea de letra va como [Am] (se coloca encima al guardar). */
  const insertChord = (i: number, chord: string) => {
    const d = secs[i];
    const el = areas.current[d.id];
    const pos = el?.selectionStart ?? carets.current[d.id] ?? d.text.length;
    const end = el?.selectionEnd ?? pos;
    const before = d.text.slice(0, pos);
    const row = before.slice(before.lastIndexOf("\n") + 1) + d.text.slice(end).split("\n")[0];
    const ins = row.trim() && !isChordLine(row) ? `[${chord}]` : (before && !/\s$/.test(before) ? " " : "") + chord + " ";
    edit(i, { text: before + ins + d.text.slice(end) });
    const at = pos + ins.length;
    carets.current[d.id] = at;
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at, at); });
  };

  const save = useAction((patch: Parameters<typeof updateSong>[1]) => updateSong(song.id, patch));

  const submit = async () => {
    if (!title.trim()) { toast("La canción necesita título", "error"); return; }
    if (duration && !/^\d{1,2}:\d{2}$/.test(duration.trim())) { toast("Duración como 3:41", "error"); return; }
    const sections: SongSection[] = secs.map(s => ({ id: s.id, name: s.name.trim() || "Sección", note: s.note.trim() || undefined, lines: parseChordText(s.text) }));
    const mine: Record<ID, string> = {};
    secs.forEach(s => { if (s.mineOn) mine[s.id] = s.mine.replace(/\s+$/, ""); });
    const memberChords = { ...song.memberChords };
    if (Object.keys(mine).length) memberChords[me.id] = mine; else delete memberChords[me.id];
    /* Notas por sección: solo se toca la mía; las de los demás se quedan (y se van con su sección si se borra). */
    const old = sx(song).sectionNotes ?? {};
    const sectionNotes: Record<ID, Record<ID, string>> = {};
    for (const s of secs) {
      const row = { ...(old[s.id] ?? {}) };
      if (s.myNote.trim()) row[me.id] = s.myNote.trim(); else delete row[me.id];
      if (Object.keys(row).length) sectionNotes[s.id] = row;
    }
    const n = Number(bpm);
    await save.run({
      title: title.trim(), artist: artist.trim(), key: key.trim(), own, bpm: n > 0 ? Math.round(n) : undefined,
      duration: duration.trim() || undefined, notes: notes.trim() || undefined, sections, memberChords, sectionNotes,
      audios: audios.filter(a => a.url), links: links.filter(l => l.url.trim()).map(l => ({ ...l, url: l.url.trim(), label: l.label.trim() })),
      demoUrl: undefined, video: undefined, // ya están en audios o links
    });
    toast("Canción guardada", "ok");
    onClose();
  };

  const songChords = chordsIn(secs.flatMap(s => parseChordText(s.text)));
  const guessed = guessKey(secs.map(s => ({ id: s.id, name: s.name, lines: parseChordText(s.text) })));
  /* Al pasar a «poner acordes», los [Am] escritos dentro de la letra suben a su línea. */
  const switchModo = (m: typeof modo) => {
    if (m === "acordes") setSecsRaw(s => s.map(x => ({ ...x, text: linesToText(parseChordText(x.text)) })));
    setPal(null); setModo(m);
  };
  const duplicate = (i: number) => setSecs(s => { const n = [...s]; n.splice(i + 1, 0, { ...s[i], id: uid(), mine: "", mineOn: false, myNote: "" }); return n; });
  const tool = "inline-grid place-items-center h-9 px-2.5 rounded-full text-[13px] text-crema/80 hover:text-crema hover:bg-crema/10 disabled:opacity-35";

  return (
    <>
      <Sheet open={open} onClose={onClose} title="editar canción" width={720}
        footer={<div className="flex flex-wrap justify-between gap-2">
          <Button variant="quiet" onClick={() => setDeleting(true)}><Icon name="basura" size={16} />borrar</Button>
          <span className="flex gap-2">
            {history.length > 0 && <Button variant="quiet" onClick={undo}><Icon name="deshacer" size={16} />deshacer</Button>}
            <Button variant="quiet" onClick={onClose}>cancelar</Button><Button variant="primary" onClick={submit} disabled={save.pending}>guardar</Button>
          </span>
        </div>}>
        <div className="flex flex-col gap-5">
          <Segmented value={tab} onChange={setTab} className="self-start" options={[
            { value: "cancion", label: "canción" }, { value: "material", label: `material${audios.length + links.length ? ` · ${audios.length + links.length}` : ""}` },
            { value: "mis", label: `mis acordes · ${me.instrument}` },
          ]} />

          {tab === "cancion" && (<>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="título" className="col-span-2">{id => <Input id={id} value={title} onChange={e => setTitle(e.target.value)} />}</Field>
              <Field label="artista" className="col-span-2">{id => <Input id={id} value={artist} onChange={e => setArtist(e.target.value)} />}</Field>
              <Field label="tono">{id => <Input id={id} value={key} onChange={e => setKey(e.target.value)} className="font-mono" placeholder={guessed || "G"} />}</Field>
              <Field label="bpm">{id => <Input id={id} inputMode="numeric" value={bpm} onChange={e => setBpm(e.target.value.replace(/\D/g, ""))} className="font-mono" />}</Field>
              <Field label="duración">{id => <Input id={id} value={duration} onChange={e => setDuration(e.target.value)} className="font-mono" placeholder="3:41" />}</Field>
              <div className="flex items-end"><Toggle checked={own} onChange={setOwn} label="propia" className="bg-noche" /></div>
              <Field label="notas generales" hint="para toda la banda: estructura, de dónde sale, qué ensayar…" className="col-span-2 sm:col-span-4">
                {id => <Textarea id={id} value={notes} onChange={e => setNotes(e.target.value)} rows={2} />}
              </Field>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">secciones</h3>
                <Segmented size="sm" value={modo} onChange={switchModo} options={[{ value: "escribir", label: "escribir letra" }, { value: "acordes", label: "poner acordes" }]} />
              </div>
              <p className="text-xs text-crema/60 -mt-1">{modo === "acordes"
                ? "Toca una palabra y elige el acorde: se pone encima. En palabras largas puedes elegir la sílaba. Toca un acorde para cambiarlo o quitarlo."
                : "Escribe o pega la letra. Los acordes van en la línea de encima o dentro, como [Am]hola. «acorde» (o ⌘/Ctrl+K) mete uno donde está el cursor; «dividir» corta en la línea del cursor y «bloques» por las líneas en blanco."}</p>
              {secs.map((s, i) => (
                <div key={s.id} className="rounded-2xl bg-noche p-3.5 flex flex-col gap-2.5">
                  <div className="flex gap-1 items-center">
                    <label className="sr-only" htmlFor={`sn-${s.id}`}>Nombre de la sección</label>
                    <Input id={`sn-${s.id}`} value={s.name} onChange={e => edit(i, { name: e.target.value })} className="flex-1 min-w-0 font-mono text-sm uppercase tracking-wider !bg-tubo" />
                    <IconButton label="Subir sección" disabled={i === 0} onClick={() => move(i, -1)}><Icon name="arriba" size={16} /></IconButton>
                    <IconButton label="Bajar sección" disabled={i === secs.length - 1} onClick={() => move(i, 1)}><Icon name="abajo" size={16} /></IconButton>
                    <IconButton label={`Duplicar ${s.name}`} onClick={() => duplicate(i)}><Icon name="copiar" size={16} /></IconButton>
                    <IconButton label={`Quitar ${s.name}`} onClick={() => setSecs(x => x.filter((_, j) => j !== i))}><Icon name="x" size={16} /></IconButton>
                  </div>
                  <label className="sr-only" htmlFor={`sx-${s.id}`}>Nota de la sección</label>
                  <Input id={`sx-${s.id}`} value={s.note} onChange={e => edit(i, { note: e.target.value })} placeholder="nota para todos: todos, solo piano, bajan todos…" className="!bg-tubo text-sm" />
                  <label className="sr-only" htmlFor={`sy-${s.id}`}>Tu nota en {s.name}</label>
                  <Input id={`sy-${s.id}`} value={s.myNote} onChange={e => edit(i, { myNote: e.target.value })} placeholder={`tu nota (${me.instrument}): entra el wah, cejilla 3…`} className="!bg-tubo text-sm" />
                  {modo === "acordes" ? (
                    <ChordPlacer text={s.text} onChange={t => edit(i, { text: t })} songChords={songChords} latin={latin} onWrite={() => switchModo("escribir")} />
                  ) : (<>
                  <div className="flex flex-wrap gap-0.5 -mb-1" role="toolbar" aria-label={`herramientas de ${s.name}`}>
                    <button type="button" className={tool} onMouseDown={e => e.preventDefault()} onClick={() => splitAtCaret(i)} title="dividir por el cursor"><Icon name="tijeras" size={14} />dividir</button>
                    <button type="button" className={tool} onClick={() => mergeUp(i)} disabled={i === 0} title="unir con la anterior"><Icon name="subir" size={14} />unir</button>
                    <button type="button" className={tool} onClick={() => splitBlocks(i)} title="dividir en bloques por las líneas en blanco"><Icon name="bloques" size={14} />bloques</button>
                    <button type="button" className={cx(tool, pal === i && "!bg-crema !text-noche")} aria-expanded={pal === i} onMouseDown={e => e.preventDefault()} onClick={() => setPal(pal === i ? null : i)}><Icon name="nota" size={14} />acorde</button>
                  </div>
                  {pal === i && <ChordPalette songChords={songChords} latin={latin} onPick={c => insertChord(i, c)} onClose={() => setPal(null)} />}
                  <label className="sr-only" htmlFor={`st-${s.id}`}>Letra y acordes de {s.name}</label>
                  <textarea id={`st-${s.id}`} ref={el => { areas.current[s.id] = el; }} value={s.text}
                    onChange={e => edit(i, { text: e.target.value })}
                    onSelect={e => { carets.current[s.id] = (e.target as HTMLTextAreaElement).selectionStart; }}
                    onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); e.stopPropagation(); setPal(pal === i ? null : i); } }}
                    spellCheck={false}
                    rows={Math.max(3, s.text.split("\n").length + 1)}
                    className="w-full rounded-xl border border-crema/15 bg-tubo px-3.5 py-2.5 text-crema placeholder:text-crema/40 focus:border-senal focus:outline-none resize-y min-h-20 font-mono text-[13px] leading-relaxed whitespace-pre overflow-x-auto"
                    placeholder={"G               D/F#\nprimera línea\no con [Em]acordes [C]dentro"} />
                  </>)}
                </div>
              ))}
              <Button className="self-start" onClick={() => setSecs(s => [...s, blank("Estribillo")])}>+ sección</Button>
            </div>
          </>)}

          {tab === "material" && <MaterialEditor audios={audios} links={links} onAudios={setAudios} onLinks={setLinks} />}

          {tab === "mis" && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-crema/70">Tus acordes para cada sección, si tocas algo distinto de lo que pone la banda (inversiones, cejilla, voicings…). Una línea por verso. Se ven en «mis acordes».</p>
              {secs.map((s, i) => (
                <div key={s.id} className="rounded-2xl bg-noche p-3.5 flex flex-col gap-2.5">
                  <div className="flex justify-between items-center gap-3">
                    <span className="font-mono text-xs tracking-[.14em] uppercase text-senal">{s.name}</span>
                    <Toggle checked={s.mineOn} onChange={v => edit(i, { mineOn: v, mine: v && !s.mineOn ? (s.mine.trim() ? s.mine : bandChords(s.text)) : s.mine })} label="propios" className="!bg-tubo" />
                  </div>
                  {s.mineOn ? (<>
                    <label className="sr-only" htmlFor={`sm-${s.id}`}>Mis acordes en {s.name}</label>
                    <Textarea id={`sm-${s.id}`} value={s.mine} onChange={e => edit(i, { mine: e.target.value })} spellCheck={false}
                      rows={Math.max(2, s.mine.split("\n").length + 1)} className="!bg-tubo font-mono text-[13px] leading-relaxed whitespace-pre overflow-x-auto" />
                    <button type="button" onClick={() => edit(i, { mine: bandChords(s.text) })} className="self-start h-9 text-[13px] text-crema/70 underline">copiar los de la banda</button>
                  </>) : <p className="font-mono text-[13px] text-crema/50 whitespace-pre overflow-x-auto">{bandChords(s.text) || "sin acordes"}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </Sheet>
      <DeleteSong open={deleting} onClose={() => setDeleting(false)} song={song} />
    </>
  );
}

// ---------- borrar ----------
/* Borrar es de toda la banda: uno lo pide y se borra cuando lo aprueban todos.
   Si en la banda solo hay una persona, se borra al momento. */
function DeleteSong({ open, onClose, song }: { open: boolean; onClose: () => void; song: Song }) {
  const { me } = useView();
  const toast = useToast();
  const { data: members } = useCollection("members");
  const req = sx(song).deleteRequest;
  const run = useDeleteFlow(song);
  const [typed, setTyped] = useState("");
  const ok = typed.trim().toLowerCase() === song.title.trim().toLowerCase();
  const mine = req?.approvals.includes(me.id);
  return (
    <Modal open={open} onClose={onClose} title={req ? "borrado pedido" : "pedir borrado"}>
      <form className="flex flex-col gap-4" onSubmit={async e => {
        e.preventDefault();
        if (!ok) return;
        const done = await run.request();
        toast(done ? "Canción borrada" : "Pedido: falta que lo aprueben los demás", "ok");
        onClose();
      }}>
        {req ? (
          <p className="text-crema/80">{req.name} pidió borrarla. Aprobado por {req.approvals.length} de {members.length}{mine ? " (tú ya)" : ""}.</p>
        ) : (
          <p className="text-crema/80">Se borra para toda la banda, con sus notas y comentarios, cuando lo aprueben todos{members.length > 1 ? ` (${members.length})` : ""}.</p>
        )}
        {!mine && <Field label={`escribe «${song.title}» para confirmar`}>{id => <Input id={id} value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" />}</Field>}
        <div className="flex flex-wrap justify-end gap-2">
          {req && (req.by === me.id || mine) && <Button variant="quiet" onClick={async () => { await run.cancel(); toast("Petición retirada", "ok"); onClose(); }}>retirar petición</Button>}
          <Button variant="quiet" onClick={onClose}>cerrar</Button>
          {!mine && <Button type="submit" variant="primary" disabled={!ok || run.pending}>{req ? "aprobar borrado" : "pedir borrado"}</Button>}
        </div>
      </form>
    </Modal>
  );
}

/** Pedir / aprobar / retirar el borrado. Devuelve true si se ha borrado de verdad. */
export function useDeleteFlow(song: Song) {
  const nav = useNavigate();
  const { me } = useView();
  const { data: members } = useCollection("members");
  const { data: setlists } = useCollection("setlists");
  const act = useAction(async (kind: "request" | "cancel") => {
    const req = sx(song).deleteRequest;
    if (kind === "cancel") { await updateSong(song.id, { deleteRequest: undefined }); return false; }
    const approvals = [...new Set([...(req?.approvals ?? []), me.id])];
    if (approvals.length >= Math.max(1, members.length)) {
      for (const s of setlists.filter(s => s.songIds.includes(song.id))) await api.update("setlists", s.id, { songIds: s.songIds.filter(x => x !== song.id) });
      await api.remove("songs", song.id);
      nav("/ensayos", { replace: true });
      return true;
    }
    await updateSong(song.id, { deleteRequest: req ? { ...req, approvals } : { by: me.id, name: me.name, at: new Date().toISOString(), approvals } });
    return false;
  });
  return { request: () => act.run("request"), cancel: () => act.run("cancel"), pending: act.pending };
}
