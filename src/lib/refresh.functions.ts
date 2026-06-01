import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getRefreshProviders = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data, error } = await supabaseAdmin
      .from("providers")
      .select("id, name, color, refresh_url, refresh_script")
      .not("refresh_url", "is", null)
      .not("refresh_script", "is", null)
      .order("name", { ascending: true });

    if (error) throw new Error(error.message);

    return {
      providers: (data ?? []).map((p) => ({
        id: p.id as string,
        name: p.name as string,
        color: p.color as string,
        refresh_url: p.refresh_url as string,
        refresh_script: p.refresh_script as string,
      })),
    };
  },
);
