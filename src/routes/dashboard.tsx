import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  deleteQuery,
  getDashboardOverview,
  getProviderQueries,
  getQueryPoints,
  type ProviderOverview,
  type ProviderQuery,
} from "@/lib/dashboard.functions";

const overviewQO = queryOptions({
  queryKey: ["dashboard-overview"],
  queryFn: () => getDashboardOverview(),
  refetchInterval: 10_000,
});

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard admin" },
      { name: "description", content: "Vue d'ensemble des providers, queries et points relais." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(overviewQO),
  component: DashboardPage,
});

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR");
}

function DashboardPage() {
  const { data } = useSuspenseQuery(overviewQO);
  const providers = data.providers;
  const [activeTab, setActiveTab] = useState<string>(providers[0]?.id ?? "");

  return (
    <main className="mx-auto max-w-7xl space-y-8 p-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            État des providers, historique des queries et points associés.
          </p>
        </div>
        <nav className="flex gap-2 text-sm">
          <Link to="/" className="text-muted-foreground hover:text-foreground">Carte</Link>
          <span className="text-muted-foreground">·</span>
          <Link to="/refresh" className="text-muted-foreground hover:text-foreground">Refresh manuel</Link>
          <span className="text-muted-foreground">·</span>
          <Link to="/refresh-vinted" className="text-muted-foreground hover:text-foreground">Vinted Go</Link>
        </nav>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map((p) => (
          <ProviderCard key={p.id} provider={p} />
        ))}
      </section>

      {providers.length > 0 && (
        <section>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex h-auto flex-wrap">
              {providers.map((p) => (
                <TabsTrigger key={p.id} value={p.id} className="gap-2">
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  {p.name}
                </TabsTrigger>
              ))}
            </TabsList>
            {providers.map((p) => (
              <TabsContent key={p.id} value={p.id} className="mt-4">
                <ProviderQueriesTable providerId={p.id} />
              </TabsContent>
            ))}
          </Tabs>
        </section>
      )}
    </main>
  );
}

function ProviderCard({ provider }: { provider: ProviderOverview }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
        <span
          className="inline-block size-4 shrink-0 rounded-full"
          style={{ backgroundColor: provider.color }}
        />
        <CardTitle className="text-base">{provider.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <Row label="Dernier refresh" value={fmtDate(provider.last_query_at)} />
        <Row
          label="Statut"
          value={
            provider.last_query_status ? (
              <Badge
                variant={provider.last_query_status === "success" ? "default" : "destructive"}
              >
                {provider.last_query_status}
              </Badge>
            ) : (
              "—"
            )
          }
        />
        <Row
          label="Points du dernier refresh"
          value={provider.last_query_inserted ?? "—"}
        />
        <Row label="Total points actuels" value={provider.total_points} />
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function ProviderQueriesTable({ providerId }: { providerId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["provider-queries", providerId],
    queryFn: () => getProviderQueries({ data: { provider_id: providerId } }),
  });
  const deleteFn = useServerFn(deleteQuery);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await deleteFn({ data: { query_id: id } });
      toast.success("Query supprimée (points et enrichments associés en cascade)");
      qc.invalidateQueries({ queryKey: ["provider-queries", providerId] });
      qc.invalidateQueries({ queryKey: ["dashboard-overview"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(null);
    }
  };

  if (isLoading) return <div className="text-sm text-muted-foreground">Chargement…</div>;
  const queries = data?.queries ?? [];
  if (queries.length === 0)
    return <div className="text-sm text-muted-foreground">Aucune query pour ce provider.</div>;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Date</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Code postal</TableHead>
            <TableHead className="text-right">Raw</TableHead>
            <TableHead className="text-right">Insérés</TableHead>
            <TableHead className="text-right">Points actuels</TableHead>
            <TableHead>Erreur</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {queries.map((q) => {
            const isOpen = expanded === q.id;
            return (
              <>
                <TableRow key={q.id} className="cursor-pointer" onClick={() => setExpanded(isOpen ? null : q.id)}>
                  <TableCell>
                    {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{fmtDate(q.created_at)}</TableCell>
                  <TableCell>
                    <Badge variant={q.status === "success" ? "default" : q.status === "error" ? "destructive" : "secondary"}>
                      {q.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{q.postal_code ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{q.raw_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{q.inserted_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{q.current_point_count}</TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={q.error ?? ""}>
                    {q.error ?? "—"}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DeleteQueryButton
                      onConfirm={() => handleDelete(q.id)}
                      disabled={deleting === q.id}
                    />
                  </TableCell>
                </TableRow>
                {isOpen && (
                  <TableRow key={`${q.id}-points`}>
                    <TableCell colSpan={9} className="bg-muted/30 p-0">
                      <QueryPointsList queryId={q.id} />
                    </TableCell>
                  </TableRow>
                )}
              </>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function DeleteQueryButton({ onConfirm, disabled }: { onConfirm: () => void; disabled: boolean }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" disabled={disabled} aria-label="Supprimer">
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer cette query ?</AlertDialogTitle>
          <AlertDialogDescription>
            Tous les points relais rattachés à cette query seront aussi supprimés, ainsi que leurs
            enrichments. Cette action est irréversible.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Supprimer</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function QueryPointsList({ queryId }: { queryId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["query-points", queryId],
    queryFn: () => getQueryPoints({ data: { query_id: queryId } }),
  });

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Chargement des points…</div>;
  const points = data?.points ?? [];
  if (points.length === 0)
    return <div className="p-4 text-sm text-muted-foreground">Aucun point pour cette query.</div>;

  return (
    <div className="max-h-[28rem] overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>External ID</TableHead>
            <TableHead>Nom</TableHead>
            <TableHead>Adresse</TableHead>
            <TableHead>CP</TableHead>
            <TableHead>Ville</TableHead>
            <TableHead className="text-right">Lat</TableHead>
            <TableHead className="text-right">Lng</TableHead>
            <TableHead>Horaires</TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {points.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-mono text-xs">{p.external_id ?? "—"}</TableCell>
              <TableCell className="text-xs">{p.name}</TableCell>
              <TableCell className="text-xs">{p.address}</TableCell>
              <TableCell className="font-mono text-xs">{p.postal_code}</TableCell>
              <TableCell className="text-xs">{p.city}</TableCell>
              <TableCell className="text-right font-mono text-xs">{p.lat.toFixed(5)}</TableCell>
              <TableCell className="text-right font-mono text-xs">{p.lng.toFixed(5)}</TableCell>
              <TableCell className="text-xs">
                {p.hours_fetched_at ? fmtDate(p.hours_fetched_at) : <span className="text-muted-foreground">en attente</span>}
              </TableCell>
              <TableCell className="max-w-[12rem] truncate text-xs text-muted-foreground" title={p.notes ?? ""}>
                {p.notes ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type _Q = ProviderQuery; // keep type imported
