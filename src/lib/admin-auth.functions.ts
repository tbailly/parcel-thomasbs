import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { z } from "zod";

// Middleware appliqué aux server fns qui mutent la DB.
// On charge les helpers serveur via dynamic import pour garantir qu'aucun
// bundle client ne tire `node:crypto`.
export const requireAdmin = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const { isAdminAuthenticated } = await import("./admin-auth.server");
    if (!isAdminAuthenticated()) {
      throw new Error("Unauthorized");
    }
    return next();
  },
);

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ password: z.string().min(1).max(256) }).parse(input))
  .handler(async ({ data }) => {
    const {
      checkRateLimit,
      noteAttempt,
      verifyPasswordConstantTime,
      issueSessionCookie,
    } = await import("./admin-auth.server");

    const rl = checkRateLimit();
    if (!rl.ok) {
      throw new Error(`Trop de tentatives. Réessaie dans ${rl.retryInSec}s.`);
    }
    const ok = verifyPasswordConstantTime(data.password);
    noteAttempt(ok);
    if (!ok) {
      throw new Error("Mot de passe incorrect");
    }
    issueSessionCookie();
    return { ok: true };
  });

export const adminLogout = createServerFn({ method: "POST" }).handler(async () => {
  const { clearSessionCookie } = await import("./admin-auth.server");
  clearSessionCookie();
  return { ok: true };
});

export const adminMe = createServerFn({ method: "GET" }).handler(async () => {
  const { isAdminAuthenticated } = await import("./admin-auth.server");
  return { authenticated: isAdminAuthenticated() };
});
