# CLAUDE.md — VIGÍA

Context and rules for Claude Code when working on this project.

## Regla permanente: Edge Functions

**Deployar SIEMPRE con `verify_jwt=false`** (equivalente a `--no-verify-jwt` en CLI).

Supabase migró el password grant a ES256. Las edges con `verify_jwt=true`
solo aceptan HS256 y devuelven 401 `UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM`
con tokens ES256 de usuarios reales.

### Comando correcto (CLI)
```bash
supabase functions deploy NOMBRE --no-verify-jwt
```

### MCP deploy
```
mcp__supabase__deploy_edge_function con verify_jwt: false
```

### Auth manual obligatoria
Las edges que requieren autenticación deben validar el JWT internamente
via `fetch(${SUPABASE_URL}/auth/v1/user)` con el anon key. El endpoint
de `auth.getUser()` sí acepta ES256.

Patrón estándar (usado en chat-bot, norm-search, etc):
```ts
async function verifyUser(auth: string | null) {
  if (!auth?.startsWith("Bearer ")) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: SUPABASE_ANON_KEY }
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? u : null;
}
```

## Versionado

- Formato `vX.Y.Z` en `src/App.jsx` (`EXPORT_VIGIA_VERSION` y sidebar).
- Build local (`npm run build`) antes de cada push.
- Verificar `grep "eyJhbGciOi" dist/assets/*.js` retorna 0 antes de commitear.

## Handoffs

- Crear `docs/handoffs/VIGIA_HANDOFF_YYYY-MM-DD_vXYZ_tema.md` al cierre de sprint
- Copia sincronizada: `docs/handoffs/VIGIA_HANDOFF_LATEST.md`

## Credenciales demo

Password universal: `Vigia2026!`

- SuperAdmin: `demo@vigia.co`, `admin@enara.co`
- Demo empresa: `ambiental@hidrorverde.com.co`, `director.ambiental@cementosandinos.com.co`
