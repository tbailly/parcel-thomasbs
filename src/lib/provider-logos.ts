import mondialRelay from "@/assets/providers/mondial-relay.png";
import chronopost from "@/assets/providers/chronopost.png";
import vintedGo from "@/assets/providers/vinted-go.png";

// Keyed by provider.id (db slug)
const LOGOS: Record<string, string> = {
  mondial_relay: mondialRelay,
  chronopost,
  vinted_go: vintedGo,
};

export function getProviderLogo(provider: { id: string; logo_url?: string }): string {
  return LOGOS[provider.id] ?? provider.logo_url ?? "";
}
