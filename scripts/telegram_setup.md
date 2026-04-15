# VIGÍA — Setup del Bot de Telegram

**Tiempo estimado:** 15 minutos  
**Prerrequisitos:** Tener Telegram instalado

---

## Paso 1 — Crear el bot en BotFather

1. Abrir Telegram y buscar `@BotFather`
2. Enviar `/newbot`
3. Nombre del bot: `VIGÍA Ambiental` (o el que prefieras)
4. Username del bot: `vigia_ambiental_bot` (debe terminar en `bot`)
5. BotFather responde con el **token** — guardarlo:
   ```
   1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ
   ```

### Configuración recomendada en BotFather:
```
/setdescription → "Asistente de normativa ambiental colombiana — ENARA Consulting"
/setabouttext   → "Inteligencia regulatoria con corpus de 14.200+ artículos y jurisprudencia"
/setcommands    →
ayuda - Comandos disponibles
nuevo - Nueva conversación
estado - Tu cuenta y cuota del día
fuentes - Fuentes de la última respuesta
cliente - [Interno] Setear empresa en consulta
sin_cliente - [Interno] Limpiar contexto de cliente
```

---

## Paso 2 — Agregar el token como secret en Supabase

Dos opciones:

### Opción A — Dashboard Supabase (más fácil)
1. Ir a https://supabase.com/dashboard/project/itkbujkqjesuntgdkubt/settings/functions
2. Sección **Secrets**
3. Agregar: `TELEGRAM_BOT_TOKEN` = `{tu token de BotFather}`

### Opción B — Supabase CLI
```bash
supabase secrets set TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ \
  --project-ref itkbujkqjesuntgdkubt
```

---

## Paso 3 — Ejecutar la migración SQL

1. Ir a Supabase SQL Editor: https://supabase.com/dashboard/project/itkbujkqjesuntgdkubt/sql
2. Copiar y ejecutar el contenido de:
   `supabase/migrations/20260415120000_telegram_bot.sql`

---

## Paso 4 — Deploy de la edge function

```bash
cd /ruta/al/repo/Vigia

# Deploy
supabase functions deploy vigia-telegram --no-verify-jwt \
  --project-ref itkbujkqjesuntgdkubt

# Verificar que está activa
curl https://itkbujkqjesuntgdkubt.supabase.co/functions/v1/vigia-telegram
# Debe retornar: {"status":"VIGÍA Telegram Bot activo","ok":true}
```

---

## Paso 5 — Registrar el webhook con Telegram

```bash
# Reemplazar TOKEN con tu token real de BotFather
TOKEN="1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ"

curl "https://api.telegram.org/bot${TOKEN}/setWebhook" \
  -d "url=https://itkbujkqjesuntgdkubt.supabase.co/functions/v1/vigia-telegram"
```

Debe responder:
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

**Verificar:**
```bash
curl "https://api.telegram.org/bot${TOKEN}/getWebhookInfo"
```

---

## Paso 6 — Obtener tu Telegram ID y registrarte

1. Ir al bot en Telegram y enviar `/start`
2. El bot responderá con tu Telegram ID (ej: `123456789`)
3. Ejecutar en Supabase SQL Editor:

```sql
-- Agregar cada miembro del equipo ENARA
-- (ejecutar después del /start para obtener el telegram_user_id)

INSERT INTO telegram_users (
  telegram_user_id,
  telegram_first_name,
  telegram_username,
  mode,
  tier,
  daily_query_limit,
  notes
)
VALUES
  -- Reemplazar con los datos reales:
  (123456789, 'Tu Nombre', '@tu_username', 'enara_internal', 'pro', 150, 'Socio ENARA'),
  (987654321, 'Colega',    '@colega',      'enara_internal', 'pro', 150, 'Consultora senior');
```

4. Enviar `/start` de nuevo — ahora el bot te reconocerá
5. Probar con `/ayuda`

---

## Primer uso

```
/cliente Cementos Boyacá S.A., sector cementero, Boyacá, con licencia ambiental vigente

¿Cuáles son las obligaciones de monitoreo de calidad de aire para una cementera 
con licencia ambiental en zona de páramo?
```

---

## Limites de cuota (configurables por usuario)

| Modo | Consultas/día | Configurable |
|------|--------------|--------------|
| enara_internal | 150 | Sí, por fila en telegram_users |
| client free | 10 | Futuro |
| client pro | 50 | Futuro |
| client enterprise | 200 | Futuro |

Para cambiar el límite de un usuario:
```sql
UPDATE telegram_users 
SET daily_query_limit = 300 
WHERE telegram_user_id = 123456789;
```

---

## Monitoreo

```sql
-- Ver uso del bot
SELECT * FROM telegram_usage_summary;

-- Conversaciones recientes
SELECT 
  u.telegram_first_name,
  c.role,
  LEFT(c.content, 100) as resumen,
  c.rag_results_count,
  c.tokens_in + COALESCE(c.tokens_out, 0) as tokens,
  c.client_context,
  c.created_at
FROM telegram_conversations c
JOIN telegram_users u ON u.telegram_user_id = c.telegram_user_id
ORDER BY c.created_at DESC
LIMIT 20;
```

---

## Troubleshooting

**"No tenés acceso"** → Verificar que el `telegram_user_id` está en la tabla `telegram_users` y `is_active = true`

**Sin respuesta del bot** → Verificar webhook con `getWebhookInfo`. Si hay error, re-setear con `setWebhook`.

**Respuesta vacía de RAG** → Verificar que `norm-search` está deployed y funcionando.

**Token expirado** → El token de BotFather no expira. Si el bot deja de responder, verificar el secret en Supabase Functions.

---

## Roadmap — Modo cliente (futuro)

Cuando se quiera habilitar clientes por tier:

1. Crear usuario en `telegram_users` con `mode='client'`, `org_id`, `tier`
2. El bot automáticamente usa el system prompt de cliente (sin contexto interno ENARA)
3. Ajustar `daily_query_limit` según tier
4. Considerar restricción de acceso al corpus (futuro: `org_profile` limita sectores visibles)

No se requieren cambios de código — la arquitectura ya lo soporta.
