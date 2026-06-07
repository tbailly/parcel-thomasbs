
## Réponse rapide à ta question

**Non, tu n'as pas besoin de créer d'utilisateur Supabase.** La sécurité DB repose déjà sur deux choses :

1. **RLS** : aucune policy `INSERT/UPDATE/DELETE` n'existe sur tes tables → ni `anon` ni `authenticated` ne peuvent écrire. Donc même si quelqu'un récupère ton anon key (elle est publique de toute façon), il ne peut rien modifier.
2. **Toutes les écritures passent par `supabaseAdmin`** (service role) dans des `createServerFn` côté serveur. La service role key ne quitte jamais le Worker.

Le seul vrai trou aujourd'hui : **n'importe qui peut appeler tes server fns** (refresh Chronopost, scrape Mondial Relay, enrich Vinted Go…) en visitant `/refresh-chronopost` etc. Il faut donc juste **gater ces appels**.

## Approche KISS proposée

**Un mot de passe admin unique stocké en secret + cookie de session signé HMAC.** Zéro dépendance tierce, zéro user Supabase, ~80 lignes de code.

### Pourquoi pas Supabase Auth ?
- Tu es seul utilisateur → pas besoin de gestion de comptes, recovery email, OAuth.
- Évite le couplage à un provider tiers comme demandé.
- Évite la complexité du gate `_authenticated`, du middleware bearer, etc.

### Pourquoi pas juste un header `x-admin-token` partagé ?
- Stocker un token long en localStorage est OK mais un cookie `HttpOnly` est strictement plus sûr (XSS ne peut pas l'exfiltrer) pour le même effort.

## Détails techniques

### 1. Nouveau secret
`ADMIN_PASSWORD` (mot de passe que tu choisis) et `ADMIN_SESSION_SECRET` (32 bytes random pour signer les cookies). Je te demanderai les deux via `add_secret`.

### 2. Helpers serveur `src/lib/admin-auth.server.ts`
- `signSession(expiresAt)` → `${expiresAt}.${hmacSHA256(expiresAt, ADMIN_SESSION_SECRET)}` (base64url). Node `crypto` natif, dispo dans le Worker.
- `verifySession(cookieValue)` → vérifie HMAC en `timingSafeEqual` + expiration. Retourne `boolean`.
- `requireAdmin()` → lit le cookie `admin_session` via `getRequestHeader('cookie')`, throw `Error('Unauthorized')` si invalide.

### 3. Middleware `requireAdmin` (TanStack)
```ts
export const requireAdmin = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  if (!verifySessionFromRequest()) throw new Error('Unauthorized');
  return next();
});
```
À ajouter sur **toutes les server fns mutantes** : `importPickupPointsJson`, `refreshChronopost`, `scrapeMondialRelay*`, `refreshVintedGoList`, `enrichVintedGoBatch`. Les `getXxxStats` / `getDashboardOverview` restent ouverts (read-only, déjà accessibles via les tables publiques).

### 4. Server fns d'auth `src/lib/admin-auth.functions.ts`
- `adminLogin({ password })` : compare `timingSafeEqual` avec `ADMIN_PASSWORD`, pose cookie `admin_session=<signed>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` (30j) via `setResponseHeader('Set-Cookie', ...)`. Petit rate-limit en mémoire (Map IP→tentatives) pour ralentir le brute-force.
- `adminLogout()` : pose le cookie expiré.
- `adminMe()` : retourne `{ authenticated: boolean }` pour que l'UI sache afficher login ou pas.

### 5. Route `/admin/login`
Page publique avec input password + bouton. Sur succès → `router.invalidate()` + redirect.

### 6. Gate UI
Les pages `/refresh-chronopost`, `/refresh-mondialrelay`, `/refresh-vinted`, `/dashboard` deviennent un layout `_admin/` :
- `src/routes/_admin/route.tsx` : `beforeLoad` appelle `adminMe()`, si non auth → `throw redirect({ to: '/admin/login' })`. `ssr: false` (cookie déjà géré côté Worker, mais on s'épargne le SSR pour ce sous-arbre).
- Déplacer les routes existantes : `_admin/refresh-chronopost.tsx`, etc.

### 7. Endpoint webhook `/api/public/hooks/enrich-vinted-go`
Déjà protégé par `apikey` = `SUPABASE_PUBLISHABLE_KEY`. **Faut changer ça** : créer `CRON_SECRET` dédié, vérifier `request.headers.get('authorization') === 'Bearer ${CRON_SECRET}'`. La publishable key n'est pas un secret.

## Modèle de menace couvert

| Risque | Mitigation |
|---|---|
| Écriture DB depuis le navigateur (anon/auth) | RLS sans policy write (déjà en place) |
| Appel direct de server fn mutante | Middleware `requireAdmin` + cookie signé |
| Vol du cookie via XSS | `HttpOnly` + `Secure` + `SameSite=Lax` |
| Brute-force password | `timingSafeEqual` + rate-limit IP + password long |
| Webhook cron appelé par un tiers | `CRON_SECRET` dédié (pas la publishable key) |
| Service role key fuite | Reste dans `client.server.ts`, jamais bundlé client |

## Plan d'exécution

1. Demander `ADMIN_PASSWORD` et `ADMIN_SESSION_SECRET` (+ `CRON_SECRET`) via `add_secret`.
2. Créer `src/lib/admin-auth.server.ts` (HMAC + cookie helpers) et `admin-auth.functions.ts` (login/logout/me + middleware).
3. Ajouter `.middleware([requireAdmin])` sur les 5–6 server fns mutantes listées.
4. Créer `src/routes/admin.login.tsx` (page de login publique).
5. Créer `src/routes/_admin/route.tsx` (gate) et déplacer `refresh-*` + `dashboard` dessous.
6. Patcher `/api/public/hooks/enrich-vinted-go` pour utiliser `CRON_SECRET`.
7. Tester : login OK, accès refresh OK, logout coupe l'accès, appel direct serverFn sans cookie → 401.

## Limites assumées (KISS)

- Pas de récupération de mot de passe : si tu l'oublies, tu modifies le secret.
- Pas de multi-user : ajout possible plus tard via Supabase Auth si besoin.
- Rate-limit en mémoire : reset à chaque redémarrage du Worker. Suffisant vu qu'un seul mot de passe long est utilisé.
