import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { refreshChronopost, getChronopostStats } from "@/lib/chronopost.functions";

const statsQueryOptions = queryOptions({
  queryKey: ["chronopost-stats"],
  queryFn: () => getChronopostStats(),
  refetchInterval: 5000,
});

export const Route = createFileRoute("/refresh-chronopost")({
  head: () => ({
    meta: [
      { title: "Refresh Chronopost" },
      { name: "description", content: "Rafraîchit les points relais Chronopost depuis l'API publique." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(statsQueryOptions),
  component: RefreshChronopostPage,
});

function RefreshChronopostPage() {
  const { data } = useSuspenseQuery(statsQueryOptions);
  const qc = useQueryClient();
  const refreshFn = useServerFn(refreshChronopost);
  const [busy, setBusy] = useState(false);

  const handleRefresh = async () => {
    setBusy(true);
    try {
      const res = await refreshFn({ data: {} });
      toast.success(
        `Chronopost rafraîchi : ${res.insertedCount} points (raw ${res.rawCount})`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["chronopost-stats"] });
    }
  };

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Chronopost</h1>
        <p className="text-sm text-muted-foreground">
          1 requête par adresse maison sur l'API publique{" "}
          <code className="text-xs">stubpointsearch.json</code> de chronopost.fr.
          Chaque requête remonte ~30 points autour de l'adresse (rayon ~9 km),
          horaires incluses. Upsert par identifiant point relais — relance
          idempotente.
        </p>
      </header>

      <section className="flex items-center gap-4">
        <Button
          onClick={handleRefresh}
          disabled={busy}
          size="lg"
          style={{ backgroundColor: "#00925A", color: "#fff" }}
        >
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {busy ? "Rafraîchissement…" : "Rafraîchir Chronopost"}
        </Button>
        <div className="text-sm text-muted-foreground">
          Total en DB : <span className="font-medium text-foreground">{data.total}</span> points
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">10 derniers runs</h2>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Démarré</TableHead>
                <TableHead>Durée</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Raw</TableHead>
                <TableHead className="text-right">Upserts</TableHead>
                <TableHead>Détails</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.queries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    Aucun run pour l'instant.
                  </TableCell>
                </TableRow>
              )}
              {data.queries.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(q.started_at!).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatDuration(q.started_at, q.finished_at)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={q.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{q.raw_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{q.inserted_count}</TableCell>
                  <TableCell
                    className="max-w-md truncate text-xs text-muted-foreground"
                    title={q.error ?? ""}
                  >
                    {q.error ?? ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "running") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        en cours
      </Badge>
    );
  }
  if (status === "success") return <Badge className="bg-emerald-600 hover:bg-emerald-600">succès</Badge>;
  if (status === "error") return <Badge variant="destructive">erreur</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start || !end) return "…";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}
