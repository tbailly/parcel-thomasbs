import { useState } from "react";

type ClientResult = {
  startedAt: string;
  finishedAt: string;
  url: string;
  ok: boolean;
  status: number | null;
  statusText: string | null;
  contentType: string | null;
  bodyBytes: number;
  rawCount: number | null;
  sample: unknown[];
  errorName: string | null;
  errorMessage: string | null;
  likelyCorsBlocked: boolean;
};

const URL_API =
  "https://www.mondialrelay.fr/api/parcelshop?country=FR&postcode=75001&city=&services=&excludeSat=false&naturesAllowed=1,A,E,F,D,J,T,S,C";

export function ClientScrapeButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ClientResult | null>(null);

  const run = async () => {
    setLoading(true);
    setResult(null);
    const startedAt = new Date().toISOString();
    try {
      const res = await fetch(URL_API, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        headers: { Accept: "application/json" },
      });
      const text = await res.text();
      let rawCount: number | null = null;
      let sample: unknown[] = [];
      try {
        const json = JSON.parse(text);
        if (Array.isArray(json)) {
          rawCount = json.length;
          sample = json.slice(0, 3);
        }
      } catch {
        // body not JSON (Cloudflare HTML, etc.)
      }
      setResult({
        startedAt,
        finishedAt: new Date().toISOString(),
        url: URL_API,
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        contentType: res.headers.get("content-type"),
        bodyBytes: text.length,
        rawCount,
        sample,
        errorName: null,
        errorMessage: null,
        likelyCorsBlocked: false,
      });
    } catch (err) {
      const e = err as Error;
      // Un fetch cross-origin bloqué par CORS lève un TypeError opaque.
      const likelyCors =
        e.name === "TypeError" && /fetch/i.test(e.message);
      setResult({
        startedAt,
        finishedAt: new Date().toISOString(),
        url: URL_API,
        ok: false,
        status: null,
        statusText: null,
        contentType: null,
        bodyBytes: 0,
        rawCount: null,
        sample: [],
        errorName: e.name,
        errorMessage: e.message,
        likelyCorsBlocked: likelyCors,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={run}
        disabled={loading}
        className="self-end rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground shadow-lg ring-1 ring-border disabled:opacity-60"
      >
        {loading ? "Fetch direct en cours…" : "Tester fetch direct (navigateur)"}
      </button>

      {result && (
        <div className="flex flex-col gap-2">
          {result.likelyCorsBlocked && (
            <div className="rounded-md bg-destructive p-3 text-xs text-destructive-foreground shadow-lg">
              <strong>CORS probablement bloqué.</strong> Le navigateur a
              levé <code>{result.errorName}: {result.errorMessage}</code>.
              Ouvre l'onglet Réseau du navigateur pour voir le détail (statut
              Cloudflare, en-tête <code>Access-Control-Allow-Origin</code>
              absent, etc.).
            </div>
          )}
          <pre className="max-h-96 overflow-auto rounded-md bg-card p-3 text-xs text-card-foreground shadow-lg ring-1 ring-border">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
