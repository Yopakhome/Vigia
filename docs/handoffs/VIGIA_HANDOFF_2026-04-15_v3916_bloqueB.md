# VIGÍA — Handoff v3.9.16 (Post-BLOQUE B + hallazgo ES256)

Archivo: `VIGIA_HANDOFF_2026-04-15_v3916_bloqueB.md` | Tmb: `VIGIA_HANDOFF_LATEST.md`
**BLOQUE B ejecutado parcialmente. Hallazgo crítico #1: ES256 JWT bloquea 8 edges.**

---

## 1. Metadatos

| Campo | Valor |
|---|---|
| Versión | **v3.9.16** |
| Commit previo | `997a796` (handoff v3.9.15) |
| Edge functions ACTIVE | **17** (nueva: `classify-item` v1) |

---

## 2. Resultados BLOQUE B

### B1 — OCR MinAmbiente (parcial)
- **Candidatos**: 19 scans pendientes
- **Recuperados**: 1 (`circular 1000/2025`, 6pp, 108.7s OCR)
- **Fallidos**: 18 con `504 IDLE_TIMEOUT`
- **Root cause**: edge `norm-extract-text` tope 150s duro; scans tardan 120–180s cada uno
- **Costo**: $0.232 Anthropic (22.418 in / 10.982 out tokens)
- **Fix pendiente**: chunking por página o llamar Anthropic directo desde script local con timeout largo

### B2 — Categorización "Otra" (pivot a SQL rule-based)
- **Plan original**: Haiku via edge `classify-item` → bloqueado por ES256 (ver §3)
- **Fallback ejecutado**: bulk `UPDATE` con patrones ILIKE expandidos
- **Resultado**: Otra **126 → 91** (35 reclasificadas)
- **Distribución final** (364 normas):
  ```
  Otra: 91                                        Régimen sancionatorio: 12
  Aguas y vertimientos: 45                        Ordenamiento territorial: 11
  Biodiversidad y fauna silvestre: 41             Minería y energía: 9
  Derecho internacional y tratados: 31            Salud ambiental y sustancias: 7
  Marco general e institucional: 27
  Política ambiental nacional: 17
  Licenciamiento ambiental: 17
  Suelos y residuos sólidos: 16
  Aire y emisiones: 14
  Cambio climático y transición energética: 14
  Consulta previa y comunidades étnicas: 13
  ```

### B3 — Auto-cat documents
- **No ejecutado** (requiere edge `classify-item` funcional)

---

## 3. 🚨 HALLAZGO CRÍTICO #1 — ES256 JWT rompe 8 edges

### Problema
Supabase actualizó el formato de tokens del `password grant` a **ES256**. Las edges configuradas con `verify_jwt=true` solo aceptan **HS256** (legacy). Todas devuelven:

```
401 UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM: Unsupported JWT algorithm ES256
```

### Edges afectadas (verify_jwt=true, **8 edges**)

| Edge | Versión | Impacto usuario |
|---|---|---|
| **chat-bot** | v11 | 🔴 **CRÍTICO** — rompe módulo Consultar para todos los usuarios finales |
| **norm-search** | v6 | 🟠 rompe búsqueda semántica (usado por chat-bot y UI) |
| **norm-ingest** | v4 | 🟡 rompe ingesta manual (admin-only) |
| **enrich-org-profile** | v1 | 🟡 rompe enriquecimiento INTAKE |
| **embed-text** | v1 | 🟡 helper embeddings (admin/scripts) |
| **multi-format-extractor** | v1 | 🟡 helper extracción (admin/scripts) |
| **superadmin-proxy** | v1 | 🟡 rompe panel SuperAdmin |
| **classify-item** | v1 | 🟡 nueva, usada por B2 (bloqueada) |

### Edges OK (verify_jwt=false, **9 edges**)
`analyze-document` v6 · `org-lookup` v3 · `storage-sign` v3 · `publish-intel` v2 · `superadmin-api` v3 · `orgadmin-users` v2 · `norm-validate` v1 · `norm-extract-text` v1 · `norm-embed` v2

### Plan de fix (Sprint próximo)

1. **Redeploy las 8 edges con `verify_jwt=false`** + validación manual de JWT dentro de cada handler:
   ```ts
   // Patrón a replicar (ya usado en analyze-document / superadmin-api):
   const auth = req.headers.get("Authorization");
   if (!auth?.startsWith("Bearer ")) return j({error:"no_auth"}, 401);
   const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
     headers: { Authorization: auth, apikey: SUPABASE_ANON_KEY }
   });
   if (!u.ok) return j({error:"invalid_token"}, 401);
   const user = await u.json();
   ```
2. **Orden de prioridad**:
   1. `chat-bot` v12 — desbloquea usuarios finales
   2. `norm-search` v7 — desbloquea RAG
   3. `superadmin-proxy` v2 — desbloquea panel admin
   4. `classify-item` v2 — desbloquea B2 real con Haiku
   5. Resto (norm-ingest, enrich-org-profile, embed-text, multi-format-extractor)
3. **Verificar** con `curl` antes y después usando un token fresco del password grant.
4. **Testing**: login como `director.ambiental@cementosandinos.com.co`, hacer consulta en /consultar, verificar respuesta.

### Notas
- El patrón `verify_jwt=false` + validación manual **no es menos seguro** que `verify_jwt=true`: la diferencia es dónde se valida. Supabase lo soporta como deployment legítimo.
- `superadmin-proxy` v1 fue deployed ayer con `verify_jwt=true` sin saber del hallazgo. Hay que duplicar la lógica de auth dentro del handler.

---

## 4. Corpus al cierre

| Métrica | Valor | Δ vs v3.9.15 |
|---|---|---|
| normative_sources | 364 | = |
| ↳ corpus_source='minambiente_normativa' | 3 | +1 (OCR B1) |
| ↳ category='Otra' | **91** | **−35** |
| normative_articles | 14.205 | = |
| jurisprudence_sources | 147 | = |
| obligations total | 88 | = |
| ↳ con `norma_fundamento` | 83 (94%) | = |
| edge functions ACTIVE | 17 | +1 (classify-item) |

---

## 5. Bloqueadores al cierre

### Técnicos
1. 🔴 **ES256 en 8 edges** — ver §3 (prioridad máxima próximo sprint)
2. 🟠 **OCR timeout** — 18 scans MinAmbiente pendientes; requiere chunking o script local con Anthropic directo

### Financieros / infra (sin cambio)
1. ✅ Anthropic $24.19 activo
2. ✅ OpenAI $9.37 activo
3. ✅ Supabase Pro activo
4. 🟡 Dominio propio pendiente
5. 🟡 Vercel Team pendiente

---

## 6. Siguiente sprint (propuesto)

### Sprint "ES256 fix" (~3h)
- Redeploy chat-bot v12 con `--no-verify-jwt` + auth manual
- Redeploy norm-search v7 idem
- Redeploy superadmin-proxy v2 idem
- Redeploy classify-item v2 idem
- Test e2e con cada cuenta demo
- Relanzar B2 Haiku sobre 91 "Otra" restantes (~$0.003)
- Relanzar B3 auto-cat documents

### Sprint "OCR recovery" (~2h)
- Script local con Anthropic directo (sin edge) para los 18 scans MinAmbiente
- O chunking por página en `norm-extract-text`

### Sprint "quick wins" (sin créditos)
- M-03 Callbacks Dashboard post-INTAKE
- M-06 Barra progreso completeness_pct
- M-07 Búsqueda en Normativa
- F-14 Historial bot_queries

---

## 7. Referencias

- Handoff anterior: `VIGIA_HANDOFF_2026-04-15_v3915_seguridad.md`
- Último commit pre-handoff: `997a796`
- Script B1 ejecutado: `scripts/eureka/retry_minambiente_ocr.py` (report en `retry_minambiente_ocr_report.json`)
- Script B2 intentado: `scripts/eureka/categorize_otra_via_edge.py` (bloqueado ES256)
- Edge nueva: `supabase/functions/classify-item/index.ts`
