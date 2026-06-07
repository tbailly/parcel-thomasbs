import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { enrichVintedGoBatchImpl } from "@/lib/vinted-go.functions";

const BodySchema = z
  .object({
    batchSize: z.number().int().min(1).max(20).optional(),
  })
  .strict();

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export const Route = createFileRoute("/api/public/hooks/enrich-vinted-go")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CRON_SECRET;
        if (!expected) {
          return new Response(JSON.stringify({ error: "server misconfigured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const auth = request.headers.get("authorization") ?? "";
        const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!provided || !safeEqual(provided, expected)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let batchSize = 5;
        try {
          const raw = await request.json().catch(() => ({}));
          const parsed = BodySchema.safeParse(raw ?? {});
          if (!parsed.success) {
            return new Response(
              JSON.stringify({ error: "invalid body", details: parsed.error.flatten() }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }
          if (typeof parsed.data.batchSize === "number") {
            batchSize = parsed.data.batchSize;
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
