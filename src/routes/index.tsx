import { createFileRoute, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMapData } from "@/lib/pickup-points.functions";
import { scrapeMondialRelay } from "@/lib/mondial-relay.functions";


const PickupMap = lazy(() =>
  import("@/components/PickupMap").then((m) => ({ default: m.PickupMap })),
);

const mapDataQueryOptions = queryOptions({
  queryKey: ["map-data"],
  queryFn: () => getMapData(),
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Carte des points relais — Paris & petite couronne" },
      {
        name: "description",
        content:
          "Carte interactive des lockers et points de dépôt de colis (Mondial Relay, Vinted Go, Chronopost, Shop2Shop) à Paris, dans les Hauts-de-Seine et la Seine-Saint-Denis.",
      },
      { property: "og:title", content: "Carte des points relais — 75 / 92 / 93" },
      {
        property: "og:description",
        content:
          "Trouvez le point relais ou locker le plus proche, tous transporteurs confondus.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(mapDataQueryOptions),
  component: Index,
  errorComponent: ({ error, reset }) => (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Impossible de charger la carte</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => reset()}
          className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Réessayer
        </button>
      </div>
    </div>
  ),
  notFoundComponent: () => <div>Page introuvable</div>,
});

function Index() {
  const router = useRouter();
  const { data } = useSuspenseQuery(mapDataQueryOptions);
  const scrape = useServerFn(scrapeMondialRelay);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      const res = await scrape({ data: {} });
      setResult(res);
      router.invalidate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Suspense
        fallback={
          <div className="flex h-screen w-screen items-center justify-center text-sm text-muted-foreground">
            Chargement de la carte…
          </div>
        }
      >
        <PickupMap providers={data.providers} points={data.points} config={data.config} />
      </Suspense>

      <div className="fixed bottom-4 right-4 z-[1000] flex max-w-md flex-col gap-2">
        <button
          onClick={run}
          disabled={loading}
          className="self-end rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg disabled:opacity-60"
        >
          {loading ? "Import en cours…" : "Importer Mondial Relay (adresse maison)"}
        </button>
        {err && (
          <pre className="max-h-72 overflow-auto rounded-md bg-destructive p-3 text-xs text-destructive-foreground shadow-lg">
            {err}
          </pre>
        )}
        {result != null && (
          <pre className="max-h-96 overflow-auto rounded-md bg-card p-3 text-xs text-card-foreground shadow-lg ring-1 ring-border">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </>
  );
}
