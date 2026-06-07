import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  refreshVintedGoList,
  enrichVintedGoBatch,
  getVintedGoStats,
} from "@/lib/vinted-go.functions";

const statsQueryOptions = queryOptions({
  queryKey: ["vinted-go-stats"],
  queryFn: () => getVintedGoStats(),
  refetchInterval: 5000,
});

export const Route = createFileRoute("/refresh-vinted")({
  head: () => ({
    meta: [
      { title: "Refresh Vinted Go" },
      { name: "description", content: "Récupération des points Vinted Go et enrichissement lent des horaires." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(statsQueryOptions),
  component: RefreshVintedPage,
});

function RefreshVintedPage() {
  const { data: stats } = useSuspenseQuery(statsQueryOptions);
  const qc = useQueryClient();
  const listFn = useServerFn(refreshVintedGoList);
  const batchFn = useServerFn(enrichVintedGoBatch);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  const run = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    setResult(null);
    try {
      const r = await fn();
      setResult(r);
      toast.success(`${name} OK`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult({ thrown: msg });
      toast.error(msg);
    } finally {
      setBusy(null);
      qc.invalidateQueries({ queryKey: ["vinted-go-stats"] });
    }
  };

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Vinted Go</h1>
        <p className="text-sm text-muted-foreground">
          Récupération de la liste par tuiles autour des home addresses, puis enrichissement des horaires
          en arrière-plan (cron toutes les 2 min, 5 points par tic).
        </p>
      </header>

      <section className="grid grid-cols-3 gap-3">
        <Stat label="Total" value={stats.total} />
        <Stat label="Avec horaires" value={stats.enriched} />
        <Stat label="En attente" value={stats.pending} />
      </section>

      <section className="space-y-2 rounded-lg border p-4 text-sm">
        <div className="font-medium">Dernière activité</div>
        <div>
          <span className="text-muted-foreground">Dernier succès : </span>
          {stats.lastOk
            ? `${stats.lastOk.external_id} · ${new Date(stats.lastOk.created_at).toLocaleString()}`
            : "—"}
        </div>
        <div>
          <span className="text-muted-foreground">Dernière erreur : </span>
          {stats.lastError
            ? `${stats.lastError.external_id} · ${new Date(stats.lastError.created_at).toLocaleString()} · ${stats.lastError.error?.slice(0, 120) ?? ""}`
            : "—"}
        </div>
      </section>

      <section className="flex flex-wrap gap-2">
        <Button
          onClick={() => run("Rafraîchir liste", () => listFn({ data: {} }))}
          disabled={busy !== null}
        >
          {busy === "Rafraîchir liste" ? "En cours…" : "Rafraîchir la liste (tuiles)"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => run("Enrichir 5 points", () => batchFn({ data: { batchSize: 5 } }))}
          disabled={busy !== null}
        >
          {busy === "Enrichir 5 points" ? "En cours…" : "Enrichir 5 points maintenant"}
        </Button>
      </section>

      {result !== null && (
        <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
