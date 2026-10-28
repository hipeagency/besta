/* Hooks de datos para las pantallas. Cada colección es una query;
   cualquier cambio en el almacén las invalida todas (la de prueba es
   instantánea; con Supabase lo hará Realtime). */
import { useEffect } from "react";
import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, subscribe, type Collection, type DB } from "./api";

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, refetchOnWindowFocus: false, retry: 1 } },
});

/* Llamar una vez arriba del árbol. */
export function useLiveData() {
  const qc = useQueryClient();
  useEffect(() => subscribe(() => qc.invalidateQueries()), [qc]);
}

export function useCollection<K extends Collection>(k: K) {
  const q = useQuery({ queryKey: [k], queryFn: () => api.list(k) });
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
