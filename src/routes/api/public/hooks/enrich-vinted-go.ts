import { createFileRoute } from "@tanstack/react-router";
import { enrichVintedGoBatchImpl } from "@/lib/vinted-go.functions";

export const Route = createFileRoute("/api/public/hooks/enrich-vinted-go")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CRON_SECRET;
        const auth = request.headers.get("authorization") ?? "";
        const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!expected || provided.length !== expected.length || provided !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let batchSize = 5;
        try {
          const body = (await request.json()) as { batchSize?: number } | null;
          if (body && typeof body.batchSize === "number") {
            batchSize = Math.max(1, Math.min(20, Math.floor(body.batchSize)));
          }
        } catch {
          // empty body ok
        }

        const result = await enrichVintedGoBatchImpl(batchSize, "cron");
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
