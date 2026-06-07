import { createFileRoute, Outlet, redirect, Link } from "@tanstack/react-router";
import { adminMe, adminLogout } from "@/lib/admin-auth.functions";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_admin")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { authenticated } = await adminMe();
    if (!authenticated) {
      throw redirect({
        to: "/admin/login",
        search: { redirect: location.href },
      });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  const router = useRouter();
  const handleLogout = async () => {
    await adminLogout();
    await router.invalidate();
    router.navigate({ to: "/admin/login" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/_admin/dashboard" className="font-semibold hover:underline">
              Dashboard
            </Link>
            <Link to="/_admin/refresh-chronopost" className="text-muted-foreground hover:underline">
              Chronopost
            </Link>
            <Link to="/_admin/refresh-mondialrelay" className="text-muted-foreground hover:underline">
              Mondial Relay
            </Link>
            <Link to="/_admin/refresh-vinted" className="text-muted-foreground hover:underline">
              Vinted Go
            </Link>
          </nav>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            Se déconnecter
          </Button>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
