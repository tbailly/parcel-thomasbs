import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  refreshVintedGoList,
  enrichVintedGoBatch,
  getVintedGoStats,
  getVintedGoEnrichmentJobs,
} from "@/lib/vinted-go.functions";

const statsQueryOptions = queryOptions({
  queryKey: ["vinted-go-stats"],
  queryFn: () => getVintedGoStats(),
  refetchInterval: 5000,
});

const jobsQueryOptions = queryOptions({
  queryKey: ["vinted-go-enrichment-jobs"],
  queryFn: () => getVintedGoEnrichmentJobs(),
  refetchInterval: 5000,
});

export const Route = createFileRoute("/refresh-vinted")({
  head: () => ({
    meta: [
      { title: "Refresh Vinted Go" },
      { name: "description", content: "Refresh Vinted Go et suivi des jobs d'enrichissement." },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(statsQueryOptions);
    context.queryClient.ensureQueryData(jobsQueryOptions);
  },
  component: RefreshVintedPage,
});

function RefreshVintedPage() {
  const { data: stats } = useSuspenseQuery(statsQueryOptions);
  const { data: jobsData } = useSuspenseQuery(jobsQueryOptions);
  const qc = useQueryClient();
  const listFn = useServerFn(refreshVintedGoList);
  const batchFn = useServerFn(enrichVintedGoBatch);
  const [busy, setBusy] = useState(false);

  const handleRefresh = async () => {
    setBusy(true);
    try {
      const listRes = await listFn({ data: {} });
      toast.success(`Liste rafraîchie : ${listRes.upsertedCount} points`);
      qc.invalidateQueries({ queryKey: ["vinted-go-stats"] });
      // Kickoff immédiat — le cron toutes les 2 min prend ensuite le relais
      await batchFn({ data: { batchSize: 5 } });
      toast.success("Enrichissement démarré — le cron continue en arrière-plan");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["vinted-go-stats"] });
      qc.invalidateQueries({ queryKey: ["vinted-go-enrichment-jobs"] });
    }
  };

  const progress = stats.total > 0 ? (stats.enriched / stats.total) * 100 : 0;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Vinted Go</h1>
        <p className="text-sm text-muted-foreground">
          Rafraîchit la liste de points puis enrichit les horaires en arrière-plan
          (cron toutes les 2 min, 5 points par tic).
        </p>
      </header>

      <section className="flex items-center gap-3">
        <Button onClick={handleRefresh} disabled={busy} size="lg">
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {busy ? "Rafraîchissement…" : "Rafraîchir Vinted Go"}
        </Button>
      </section>

      <section className="space-y-2 rounded-lg border p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {stats.enriched} / {stats.total} points avec horaires
          </span>
          <span className="text-muted-foreground">
            {stats.pending > 0
              ? `${stats.pending} en attente — enrichissement en cours`
              : "Tout est enrichi ✓"}
          </span>
        </div>
        <Progress value={progress} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Jobs d'enrichissement</h2>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Démarré</TableHead>
                <TableHead>Durée</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Traités</TableHead>
                <TableHead className="text-right">OK</TableHead>
                <TableHead className="text-right">Échecs</TableHead>
                <TableHead className="text-right">Restants</TableHead>
                <TableHead>Erreur</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobsData.jobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">
                    Aucun job pour l'instant.
                  </TableCell>
                </TableRow>
              )}
              {jobsData.jobs.map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(j.started_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-xs">{formatDuration(j.started_at, j.finished_at)}</TableCell>
                  <TableCell className="text-xs">{j.trigger}</TableCell>
                  <TableCell>
                    <StatusBadge status={j.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{j.processed}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-600">{j.succeeded}</TableCell>
                  <TableCell className="text-right tabular-nums text-destructive">
                    {j.failed}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {j.remaining_after ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={j.error ?? ""}>
                    {j.error ?? ""}
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

function formatDuration(start: string, end: string | null): string {
  if (!end) return "…";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}
