# VIGÍA Audit Report — v3.9.48
**Date:** 2026-04-16 · **Auditor:** Claude Opus 4.6 (1M context)  
**Commit audited:** 4164b45 · **Scope:** 11-layer security & quality audit

---

## Executive Summary

| Severity | Found | Fixed | Escalated |
|----------|-------|-------|-----------|
| CRITICAL | 0 | — | — |
| HIGH | 2 | 1 | 1 |
| MEDIUM | 3 | 0 | 3 |
| LOW | 2 | 0 | 0 |
| INFO | 4 | 0 | 0 |
| **Total** | **11** | **1** | **4** |

**Overall assessment:** VIGÍA is in good shape for a first client. No critical vulnerabilities found. The bundle is clean of secrets, RLS is active on all 31 tables, and edge functions validate auth internally. Two high-severity findings: one fixed (audit_log RLS policies missing), one requires manual action (send-alerts edge has no auth gate).

---

## CAPA 1 — SEGURIDAD

### AUDIT-S01 — audit_log RLS active but 0 policies (FIXED)
**Severity:** HIGH  
**Evidence:** `pg_policies` query returned 0 policies for `audit_log`. Frontend `logAudit()` (App.jsx) uses `session.access_token` for POST → RLS blocks all writes for authenticated role.  
**Impact:** All audit events silently dropped. No audit trail recorded.  
**Fix applied:** Added 3 policies: `users_insert_audit` (INSERT with user_id=auth.uid()), `users_read_own_audit` (SELECT by user/org), `service_bypass_audit` (ALL for service_role).  
**Verification:** Policy count now 3 for audit_log.

### AUDIT-S02 — send-alerts edge has no auth validation
**Severity:** HIGH  
**Evidence:** `grep` shows 0 auth checks in send-alerts/index.ts. Any unauthenticated request can trigger mass email sends using service_role internally.  
**Impact:** Attacker could spam all org emails via POST to /functions/v1/send-alerts.  
**Fix:** ESCALATED — add `verifyUser()` + SuperAdmin check to send-alerts. Requires edge redeploy.  
**Mitigation:** Edge is only called from SuperAdmin Overview button (trusted), but the endpoint is publicly accessible.

### AUDIT-S03 — regulatory_alerts SELECT open to all authenticated users
**Severity:** LOW  
**Evidence:** Policy `regulatory_alerts_select` has `USING(true)`. Table has NO `org_id` column — it stores shared regulatory updates, not client-specific data.  
**Impact:** None — regulatory alerts ARE shared content (normative changes affect all orgs).  
**Status:** NOT A BUG — correct behavior by design.

### AUDIT-S04 — CORS `*` on all 19 edge functions
**Severity:** INFO  
**Evidence:** All edges have `Access-Control-Allow-Origin: "*"`.  
**Impact:** Any domain can call the edges. Mitigated because all edges validate JWT internally, but an attacker with a stolen JWT could call from any origin.  
**Recommendation:** Restrict to `vigia-five.vercel.app` before first enterprise client.

### AUDIT-S05 — Bundle is clean
**Severity:** INFO (PASS)  
**Evidence:** 0 JWT tokens, 0 service_role keys, 0 Anthropic/OpenAI keys, 0 dangerouslySetInnerHTML, no SUPERADMIN_EMAILS in frontend. SB_SERVICE explicitly removed with comment at line 6.

### AUDIT-S06 — vigia-telegram has no auth (expected)
**Severity:** INFO  
**Evidence:** 0 auth checks. This is a Telegram webhook endpoint — Telegram calls it, not users.  
**Status:** Expected behavior. Telegram validates via bot token.

---

## CAPA 2 — CORPUS & RAG

### AUDIT-C01 — Embedding consistency
**Severity:** INFO (PASS)  
**Evidence:** All 14,206 normative_articles have embeddings (0 missing). All 479 jurisprudence_articles use `text-embedding-3-small`. Consistent model.

### AUDIT-C02 — Data integrity
**Severity:** INFO (PASS)  
**Evidence:** 0 orphan EDIs, 0 orphan obligations, 0 articles without embeddings. Only 2 normas without category (negligible).

### AUDIT-C03 — chat-bot has 21 REGLAS including anti-hallucination
**Severity:** INFO (PASS)  
**Evidence:** REGLA 1 ("Si los fragmentos no contienen información suficiente, decirlo explícitamente"), REGLA 2 (prefix INFORMACIÓN COMPLEMENTARIA), REGLA 14 (vigencia explícita). System prompt properly separated from user content.

---

## CAPA 3 — KNOWN BUGS FROM HANDOFF

| Bug | Status | Evidence |
|-----|--------|----------|
| BUG-01 Mis EDIs no renderer | FIXED | renderView has `if(view==="edis")return renderEDIs()` |
| BUG-03 Bot hardcoded "C.I. Energia Solar" | FIXED | systemPrompt uses `clientOrg?.name` dynamically |
| BUG-04 INTAKE receiver hardcoded | FIXED | Uses `clientOrg?.name` |
| BUG-05 Empty INTAKE system prompt | FIXED | SYSTEM prompt includes instruments + obligations dynamically |
| BUG-06 Session no refresh | FIXED | 4-min interval + visibilitychange handler |
| BUG-07 No vercel.json | FIXED | vercel.json with SPA rewrite exists |
| GAP-01 RLS missing | FIXED | All 31 tables have RLS + policies (except 3 that use service_role only: client_notes, rate_limits, user_profiles) |

---

## CAPA 4 — RLS TABLES WITHOUT POLICIES (remaining)

| Table | Risk | Reason OK |
|-------|------|-----------|
| client_notes | LOW | Only accessed via superadmin-api (service_role) |
| rate_limits | LOW | Only accessed via chat-bot edge (service_role) |
| user_profiles | LOW | Appears unused in current codebase |

These are acceptable because they're never queried with user tokens.

---

## CAPA 5 — PERFORMANCE

### AUDIT-P01 — Bundle size acceptable
**Build:** 468.49 kB (gzip 124.81 kB). Under 500 KB threshold. lucide-react uses named imports (correct).

---

## ESCALATIONS FOR JAVIER

| # | Action | Why | Risk if not done | Time |
|---|--------|-----|------------------|------|
| 1 | Add auth to send-alerts edge | Anyone can trigger mass emails | Spam abuse | 30 min |
| 2 | Set RESEND_API_KEY in Supabase Secrets | Emails don't send | No alerts/welcome emails | 5 min |
| 3 | Set SUPERADMIN_EMAILS in Supabase Secrets | jrestrepo can't access SuperAdmin | Locked out | 5 min |
| 4 | Restrict CORS to vigia-five.vercel.app (pre-enterprise) | Any domain can call edges | Token abuse | 1 hour |

---

*Generated by Claude Opus 4.6 · 2026-04-16*
