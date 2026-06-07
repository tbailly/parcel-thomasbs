import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { getMapData } from "@/lib/pickup-points.functions";

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
          "Carte interactive des lockers et points de dépôt de colis (Mondial Relay, Vinted Go, Chronopost) à Paris, dans les Hauts-de-Seine et la Seine-Saint-Denis.",
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
  const { data } = useSuspenseQuery(mapDataQueryOptions);

  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-screen items-center justify-center text-sm text-muted-foreground">
          Chargement de la carte…
        </div>
      }
    >
      <PickupMap providers={data.providers} points={data.points} config={data.config} />
    </Suspense>
  );
}
