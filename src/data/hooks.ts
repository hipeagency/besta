/* Hooks de datos para las pantallas. Cada colección es una query;
   cualquier cambio en el almacén las invalida todas (la de prueba es
   instantánea; con Supabase lo hará Realtime). */
import { useEffect, useState } from "react";
import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, subscribe, type Collection, type DB } from "./api";
import { offlineList, withOffline } from "./offline";

/* networkMode "always": sin conexión React Query dejaría las consultas en
   pausa (y la suite en «cargando…»); así fallan y tiran de la copia del directo. */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, refetchOnWindowFocus: false, retry: 1, networkMode: "always" } },
});

/* Llamar una vez arriba del árbol. */
export function useLiveData() {
  const qc = useQueryClient();
  useEffect(() => subscribe(() => qc.invalidateQueries()), [qc]);
}

export function useCollection<K extends Collection>(k: K) {
  const q = useQuery({ queryKey: [k], queryFn: () => withOffline(offlineList(k) as DB[K] | null, api.list(k)) });
  return { data: (q.data ?? []) as DB[K], loading: q.isPending, error: q.error };
}

/* Mutación que invalida todo al terminar. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (args: A) => fn(...args),
    onSettled: () => qc.invalidateQueries(),
  });
  return {
    run: (...args: A) => m.mutateAsync(args),
    pending: m.isPending,
    error: m.error as Error | null,
  };
}

/* URL utilizable de un archivo guardado: los privados («sb://…») se
   piden firmados y caducan; el resto se usa tal cual. */
export function useFileUrl(url?: string) {
  const [resolved, setResolved] = useState<string | undefined>(url?.startsWith("sb://") ? undefined : url);
  useEffect(() => {
    let alive = true;
    if (!url) { setResolved(undefined); return; }
    if (!url.startsWith("sb://")) { setResolved(url); return; }
    api.fileUrl(url).then(u => { if (alive) setResolved(u); }).catch(() => { if (alive) setResolved(undefined); });
    return () => { alive = false; };
  }, [url]);
  return resolved;
}
