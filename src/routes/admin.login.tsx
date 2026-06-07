import { createFileRoute, useRouter, useSearch, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminLogin, adminMe } from "@/lib/admin-auth.functions";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/admin/login")({
  ssr: false,
  validateSearch: searchSchema,
  beforeLoad: async ({ search }) => {
    const { authenticated } = await adminMe();
    if (authenticated) {
      const to =
        search.redirect && search.redirect.startsWith("/")
          ? search.redirect
          : "/dashboard";
      throw redirect({ href: to });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const search = useSearch({ from: "/admin/login" });
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await adminLogin({ data: { password } });
      toast.success("Connecté");
      await router.invalidate();
      const target =
        search.redirect && search.redirect.startsWith("/")
          ? search.redirect
          : "/dashboard";
      window.location.href = target;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6 shadow-sm"
      >
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Admin</h1>
          <p className="text-sm text-muted-foreground">
            Saisis le mot de passe administrateur.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={busy || !password}>
          {busy ? "Connexion…" : "Se connecter"}
        </Button>
      </form>
    </main>
  );
}
