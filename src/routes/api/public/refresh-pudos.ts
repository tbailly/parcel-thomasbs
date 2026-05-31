import { createFileRoute } from "@tanstack/react-router";

// Phase 2 stub. Sera connecté aux APIs des providers via pg_cron toutes les 48h.
// Pour activer, vérifier la clé `apikey` et brancher la logique d'import.
export const Route = createFileRoute("/api/public/refresh-pudos")({
  server: {
    handlers: {
      POST: async () => {
        return Response.json(
          {
            status: "not_implemented",
            message:
              "Provider integrations (Mondial Relay, Vinted Go, Chronopost, Shop2Shop) not connected yet.",
          },
          { status: 501 },
        );
      },
    },
  },
});
