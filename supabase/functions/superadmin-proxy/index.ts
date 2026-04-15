import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPERADMIN_EMAILS = ["demo@vigia.co", "admin@enara.co"];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ALLOWED_TABLES = [
  "organizations","user_org_map","instruments","obligations",
  "documents","org_profile","bot_queries","oversight_log",
  "regulatory_alerts","normative_sources"
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }
    const userToken = authHeader.replace("Bearer ", "");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${userToken}` } } }
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    if (!SUPERADMIN_EMAILS.includes(user.email ?? "")) {
      return new Response(JSON.stringify({ error: "Acceso denegado: no es SuperAdmin" }), {
        status: 403, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { operation, table, query, payload, userId } = body;

    if (table && !ALLOWED_TABLES.includes(table)) {
      return new Response(JSON.stringify({ error: `Tabla no permitida: ${table}` }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    let result: unknown;
    switch (operation) {
      case "select": {
        let q = adminClient.from(table).select((query?.select as string) ?? "*");
        if (query?.filter) for (const [k, v] of Object.entries(query.filter)) q = q.eq(k, v as string);
        if (query?.ilike) for (const [k, v] of Object.entries(query.ilike)) q = q.ilike(k, v as string);
        if (query?.or) q = q.or(query.or as string);
        if (query?.order) {
          const o = query.order as { col: string; asc?: boolean };
          q = q.order(o.col, { ascending: o.asc ?? true });
        }
        if (query?.limit) q = q.limit(query.limit as number);
        const { data, error } = await q;
        if (error) throw error;
        result = data;
        break;
      }
      case "insert": {
        const { data, error } = await adminClient.from(table).insert(payload).select();
        if (error) throw error;
        result = data;
        break;
      }
      case "update": {
        let q = adminClient.from(table).update(payload);
        if (query?.filter) for (const [k, v] of Object.entries(query.filter)) q = q.eq(k, v as string);
        const { data, error } = await q.select();
        if (error) throw error;
        result = data;
        break;
      }
      case "delete": {
        if (!query?.filter || Object.keys(query.filter as object).length === 0) {
          return new Response(JSON.stringify({ error: "DELETE requiere filtro explícito" }), {
            status: 400, headers: { ...CORS, "Content-Type": "application/json" }
          });
        }
        let q = adminClient.from(table).delete();
        for (const [k, v] of Object.entries(query.filter as Record<string, string>)) q = q.eq(k, v);
        const { error } = await q;
        if (error) throw error;
        result = { deleted: true };
        break;
      }
      case "auth_create_user": {
        const { email, password } = payload as { email: string; password: string };
        const { data, error } = await adminClient.auth.admin.createUser({
          email, password, email_confirm: true
        });
        if (error) throw error;
        result = { id: data.user?.id, email: data.user?.email };
        break;
      }
      case "auth_delete_user": {
        if (!userId) throw new Error("userId requerido");
        const { error } = await adminClient.auth.admin.deleteUser(userId as string);
        if (error) throw error;
        result = { deleted: true };
        break;
      }
      case "auth_find_user": {
        const email = (query as { email: string }).email;
        if (!email) throw new Error("email requerido");
        const { data, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (error) throw error;
        result = data.users
          .filter((u: { email?: string }) => u.email === email)
          .map((u: { id: string; email?: string }) => ({ id: u.id, email: u.email }));
        break;
      }
      default:
        return new Response(JSON.stringify({ error: `Operación desconocida: ${operation}` }), {
          status: 400, headers: { ...CORS, "Content-Type": "application/json" }
        });
    }

    return new Response(JSON.stringify({ data: result }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("superadmin-proxy error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
});
