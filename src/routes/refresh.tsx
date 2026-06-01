import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getRefreshProviders } from "@/lib/refresh.functions";
import { Button } from "@/components/ui/button";

const refreshProvidersQueryOptions = queryOptions({
  queryKey: ["refresh-providers"],
  queryFn: () => getRefreshProviders(),
});

export const Route = createFileRoute("/refresh")({
  head: () => ({
    meta: [
      { title: "Refresh points relais" },
      {
        name: "description",
        content:
          "Outil interne pour rafraîchir semi-automatiquement les points relais par provider.",
      },
    ],
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(refreshProvidersQueryOptions),
  component: RefreshPage,
});

function RefreshPage() {
  const { data } = useSuspenseQuery(refreshProvidersQueryOptions);

  const handleClick = async (provider: {
    name: string;
    refresh_url: string;
    refresh_script: string;
  }) => {
    try {
      await navigator.clipboard.writeText(provider.refresh_script);
      toast.success(`Script ${provider.name} copié dans le presse-papiers`);
    } catch (err) {
      toast.error(
        `Impossible de copier automatiquement le script (${
          err instanceof Error ? err.message : String(err)
        }). Copie-le manuellement depuis l'encadré ci-dessous.`,
      );
    }
    window.open(provider.refresh_url, "_blank", "noopener,noreferrer");
  };

  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Refresh des points relais
          </h1>
          <p className="text-sm text-muted-foreground">
            Clique sur un provider : le script est copié dans ton presse-papiers
            et le site s'ouvre dans un nouvel onglet. Colle ensuite le script
            dans la console (DevTools) du site ouvert.
          </p>
        </header>

        {data.providers.length === 0 ? (
          <p className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground">
            Aucun provider n'a encore de script de refresh configuré.
          </p>
        ) : (
          <ul className="flex flex-col gap-6">
            {data.providers.map((provider) => (
              <li
                key={provider.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-sm"
              >
                <Button
                  size="lg"
                  className="h-16 text-lg font-semibold"
                  style={{
                    backgroundColor: provider.color,
                    color: "#fff",
                  }}
                  onClick={() => handleClick(provider)}
                >
                  {provider.name}
                </Button>
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer select-none">
                    Voir le script
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-3 text-foreground">
                    {provider.refresh_script}
                  </pre>
                  <p className="mt-1 break-all">URL : {provider.refresh_url}</p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
