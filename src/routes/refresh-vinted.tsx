import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { scrapeVintedGoDebug } from "@/lib/vinted-go.functions";

export const Route = createFileRoute("/refresh-vinted")({
  head: () => ({
    meta: [
      { title: "Refresh Vinted Go (exp)" },
      { name: "description", content: "Bac à sable pour tester la récupération des points Vinted Go via l'endpoint RSC." },
    ],
  }),
  component: RefreshVintedPage,
});

function RefreshVintedPage() {
  const scrapeFn = useServerFn(scrapeVintedGoDebug);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  const onClick = async () => {
    setLoading(true);
    setResult(null);
    try {
      const r = await scrapeFn({ data: {} });
      setResult(r);
      if (r.error) toast.error(`Erreur : ${r.error}`);
      else toast.success(`OK — ${r.rawCount} bruts, ${r.insertedCount} insérés`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult({ thrown: msg });
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Vinted Go — bac à sable</h1>
      <p className="text-sm text-muted-foreground">
        Appel direct de l'endpoint RSC <code>/fr/carrier-locations</code> avec une bounding box
        Paris centre codée en dur. Parse le payload <code>text/x-component</code>, extrait{" "}
        <code>points[]</code>, insère dans <code>pickup_points</code> (sans <code>opening_hours</code> pour la v1).
      </p>
      <Button onClick={onClick} disabled={loading}>
        {loading ? "Scrape en cours…" : "Lancer scrape Paris centre (bbox unique)"}
      </Button>
      {result !== null && (
        <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  );
}
