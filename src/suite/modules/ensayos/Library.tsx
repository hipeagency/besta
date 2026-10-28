/* Biblioteca: canciones (buscar, filtrar, crear, pegar letra) y setlists. */
import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAction, useCollection } from "@/data/hooks";
import { api, uid } from "@/data/api";
import { setlistMinutes } from "@/data/selectors";
import type { ID, Setlist, Song } from "@/data/types";
import { Button, Field, Input, Pill, Segmented, Sheet, Textarea, Toggle, useToast } from "@/components/ui";
import { cx, dateShort } from "@/lib/format";
import { guessKey, importSections, norm } from "./lib";
import { songFromJson } from "./extra";

export type LibraryTab = "canciones" | "setlists";
type Filter = "todas" | "propias" | "versiones" | "comentarios";

export function Library({ tab, onTab, songId, setlistId }: { tab: LibraryTab; onTab: (t: LibraryTab) => void; songId?: ID; setlistId?: ID }) {
  return (
    <>
      <Segmented value={tab} onChange={onTab} className="w-full shrink-0 [&>button]:flex-1" options={[
        { value: "canciones", label: "canciones" }, { value: "setlists", label: "setlists" },
      ]} />
      {tab === "canciones" ? <Songs active={songId} /> : <Setlists active={setlistId} />}
    </>
  );
}

const openComments = (s: Song) => s.comments.filter(c => !c.resolved).length;

function Songs({ active }: { active?: ID }) {
  const nav = useNavigate();
  const { data: songs, loading } = useCollection("songs");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("todas");
  const [importing, setImporting] = useState(false);

  const create = useAction(async () => {
    const s: Song = {
      id: uid("song-"), title: "nueva canción", artist: "besta", own: true, key: "", sections: [{ id: uid(), name: "Estrofa", lines: [] }],
      instrumentNotes: {}, memberChords: {}, comments: [],
    };
    await api.insert("songs", s);
    return s;
  });

  const tests: Record<Filter, (s: Song) => boolean> = {
    todas: () => true, propias: s => s.own, versiones: s => !s.own, comentarios: s => openComments(s) > 0,
  };
  const list = useMemo(() => {
    const nq = norm(q.trim());
    return songs
      .filter(tests[filter])
      .filter(s => !nq || norm(`${s.title} ${s.artist}`).includes(nq) || norm(s.key) === nq)
      .sort((a, b) => a.title.localeCompare(b.title, "es"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs, q, filter]);

  return (
    <>
      <label className="sr-only" htmlFor="ens-q">Buscar canción</label>
      <Input id="ens-q" type="search" placeholder="buscar título, artista, tono…" value={q} onChange={e => setQ(e.target.value)} className="shrink-0" />
      <div className="flex gap-1.5 flex-wrap shrink-0" role="group" aria-label="Filtrar">
        {([["todas", "todas"], ["propias", "propias"], ["versiones", "versiones"], ["comentarios", "con comentarios"]] as const).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
            className={cx("h-9 px-3 rounded-full font-mono text-[11px] transition", filter === k ? "bg-crema text-noche" : "bg-tubo text-crema/85 hover:text-crema")}>
            {label} {songs.filter(tests[k]).length}
          </button>
        ))}
      </div>

      <nav aria-label="Canciones" className="flex flex-col">
        {loading && <p className="text-sm text-crema/60 p-2">cargando…</p>}
        {!loading && !list.length && <p className="text-sm text-crema/60 p-2">Nada con «{q}».</p>}
        {list.map(s => {
          const on = s.id === active;
          const open = openComments(s);
          return (
            <Link key={s.id} to={`/ensayos/${s.id}`} aria-current={on ? "page" : undefined}
              className={cx("flex justify-between items-center gap-2 px-2.5 py-2 min-h-11 rounded-[10px] transition", on ? "bg-tubo" : "hover:bg-crema/5")}>
              <span className="min-w-0">
                <span className={cx("block truncate text-[15px]", on && "text-senal-suave")}>{s.title}</span>
                <span className="block truncate text-xs text-crema/60">{s.artist}{open ? ` · ${open} coment.` : ""}</span>
              </span>
              <span className="font-mono text-xs text-crema/70 shrink-0">{s.key || "—"}</span>
            </Link>
          );
        })}
      </nav>

      <div className="grid grid-cols-2 gap-2 mt-auto pt-2">
        <Button className="!rounded-[10px] border-dashed" onClick={async () => { const s = await create.run(); nav(`/ensayos/${s.id}?editar=1`); }}>+ canción</Button>
        <Button className="!rounded-[10px] border-dashed" onClick={() => setImporting(true)}>pegar letra</Button>
      </div>
      <ImportJson />
      <ImportSheet open={importing} onClose={() => setImporting(false)} />
    </>
  );
}

/** Pegar una letra entera con los acordes encima: sale una canción con secciones. */
function ImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [key, setKey] = useState("");
  const [own, setOwn] = useState(false);
  const [text, setText] = useState("");
  const sections = useMemo(() => importSections(text), [text]);
  const guessed = guessKey(sections);
  const chordLines = sections.reduce((n, s) => n + s.lines.filter(l => l.chords).length, 0);

  const save = useAction(async () => {
    const s: Song = {
      id: uid("song-"), title: title.trim(), artist: artist.trim() || (own ? "besta" : ""), own, key: key.trim() || guessed,
      sections: sections.length ? sections : [{ id: uid(), name: "Estrofa", lines: [] }], instrumentNotes: {}, memberChords: {}, comments: [],
    };
    await api.insert("songs", s);
    return s;
  });

  const submit = async () => {
    if (!title.trim()) { toast("Ponle título", "error"); return; }
    const s = await save.run();
    toast("Canción creada", "ok");
    setTitle(""); setArtist(""); setKey(""); setText(""); setOwn(false);
    onClose();
    nav(`/ensayos/${s.id}`);
  };

  return (
    <Sheet open={open} onClose={onClose} title="pegar letra" width={620}
      footer={<div className="flex justify-end gap-2"><Button variant="quiet" onClick={onClose}>cancelar</Button><Button variant="primary" onClick={submit} disabled={save.pending}>crear canción</Button></div>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="título" className="col-span-2">{id => <Input id={id} value={title} onChange={e => setTitle(e.target.value)} />}</Field>
          <Field label="artista">{id => <Input id={id} value={artist} onChange={e => setArtist(e.target.value)} placeholder={own ? "besta" : ""} />}</Field>
          <Field label="tono" hint={guessed && !key ? `parece ${guessed}` : undefined}>{id => <Input id={id} value={key} onChange={e => setKey(e.target.value)} placeholder={guessed} className="font-mono" />}</Field>
        </div>
        <Toggle checked={own} onChange={setOwn} label="es propia" className="self-start bg-noche" />
        <Field label="letra con acordes" hint="Acordes en la línea de encima de cada verso. Una línea en blanco separa secciones; si la primera línea es «estribillo», «[puente]»… se usa como nombre.">
          {id => <Textarea id={id} rows={14} value={text} onChange={e => setText(e.target.value)} spellCheck={false}
            className="font-mono text-[13px] leading-relaxed whitespace-pre overflow-x-auto"
            placeholder={"estrofa\nG               D/F#\nprimera línea de la estrofa\nEm7             C\nsegunda línea\n\nestribillo\nC       G        D\nno me sale olvidarte"} />}
        </Field>
        {text.trim() && (
          <div className="rounded-xl bg-noche p-3 text-sm">
            <p className="text-crema/75 mb-2"><span className="font-mono">{sections.length}</span> secciones · <span className="font-mono">{chordLines}</span> líneas con acordes</p>
            <div className="flex flex-wrap gap-1.5">{sections.map(s => <Pill key={s.id}>{s.name} · {s.lines.length}</Pill>)}</div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function Setlists({ active }: { active?: ID }) {
  const nav = useNavigate();
  const { data: setlists, loading } = useCollection("setlists");
  const { data: songs } = useCollection("songs");
  const { data: gigs } = useCollection("gigs");
  const create = useAction(async () => {
    const s: Setlist = { id: uid("sl-"), name: "nuevo setlist", songIds: [], closed: false };
    await api.insert("setlists", s);
    return s;
  });
  return (
    <>
      <nav aria-label="Setlists" className="flex flex-col">
        {loading && <p className="text-sm text-crema/60 p-2">cargando…</p>}
        {setlists.map(s => {
          const on = s.id === active;
          const gig = gigs.find(g => g.id === s.gigId);
          return (
            <Link key={s.id} to={`/ensayos/setlists/${s.id}`} aria-current={on ? "page" : undefined}
              className={cx("flex justify-between items-center gap-2 px-2.5 py-2 min-h-11 rounded-[10px] transition", on ? "bg-tubo" : "hover:bg-crema/5")}>
              <span className="min-w-0">
                <span className={cx("block truncate text-[15px]", on && "text-senal-suave")}>{s.name}</span>
                <span className="block truncate font-mono text-[11px] text-crema/60">{s.songIds.length} canc. · {Math.round(setlistMinutes(s.songIds, songs))} min{gig ? ` · ${dateShort(gig.date)}` : ""}</span>
              </span>
              {s.closed && <Pill tone="senal">cerrado</Pill>}
            </Link>
          );
        })}
      </nav>
      <Button className="!rounded-[10px] border-dashed mt-auto" onClick={async () => { const s = await create.run(); nav(`/ensayos/setlists/${s.id}`); }}>+ setlist</Button>
    </>
  );
}

/* Importar un JSON de canciones: el export de la app antigua (letra con
   [acordes] dentro) o el de esta. Las que ya existen por título no se duplican. */
function ImportJson() {
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const { data: songs } = useCollection("songs");
  const run = useAction(async (list: unknown[]) => {
    const have = new Set(songs.map(s => norm(s.title)));
    let n = 0;
    for (const raw of list) {
      const s = songFromJson(raw as Parameters<typeof songFromJson>[0], uid);
      if (!s || have.has(norm(s.title))) continue;
      have.add(norm(s.title));
      await api.insert("songs", s);
      n++;
    }
    return n;
  });
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text()) as unknown;
      const list = Array.isArray(data) ? data : (data as { songs?: unknown[] })?.songs;
      if (!Array.isArray(list)) throw new Error();
      const n = await run.run(list);
      toast(n ? `${n} canciones importadas` : "Nada nuevo que importar", n ? "ok" : "info");
    } catch { toast("Ese archivo no es un JSON de canciones", "error"); }
  };
  return (
    <>
      <input ref={file} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} onChange={e => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      <button type="button" onClick={() => file.current?.click()} disabled={run.pending} className="self-center h-11 px-3 text-[13px] text-crema/65 hover:text-crema underline">
        importar JSON
      </button>
    </>
  );
}
