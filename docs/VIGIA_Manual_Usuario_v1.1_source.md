<!-- meta version=1.1 date=Abril 2026 -->

# VIGÍA

## Manual del Usuario Final
### Versión 1.1 · Abril 2026
### ENARA Consulting S.A.S.
### Barranquilla, Atlántico, Colombia

---

[[TOC]]

---

## section:navy num=1 title="¿Qué es VIGÍA?"

VIGÍA es la plataforma de inteligencia regulatoria ambiental de ENARA Consulting. Permite a empresas obligadas ambientalmente gestionar sus instrumentos ambientales (licencias, permisos, concesiones), monitorear obligaciones de cumplimiento con fecha límite, y consultar el corpus normativo ambiental colombiano con inteligencia artificial.

En términos simples: VIGÍA es el asistente digital que le ayuda a nunca perderse una fecha límite ambiental y a encontrar en segundos lo que dice cualquier norma colombiana sobre su actividad.

| Característica | Detalle |
|---|---|
| Corpus normativo | 365 normas ambientales · 147 sentencias judiciales · 14.206 artículos vectorizados |
| Tecnología IA | Claude Sonnet (Anthropic) + RAG semántico con text-embedding-3-small (OpenAI) |
| Sectores target | Minería, energía, manufactura, construcción, agroindustria, servicios |
| Autoridades cubiertas | ANLA, 32 CARs regionales, alcaldías, MADS, Procuraduría Ambiental |
| Acceso | Plataforma web + móvil (responsive). Chrome recomendado. |

## section:navy num=2 title="Inicio de sesión y primeros pasos"

### Cómo iniciar sesión

1. Abrir Chrome (recomendado) o navegador compatible
2. Ir a la URL de su organización (enviada por ENARA al activar su cuenta)
3. Ingresar el correo electrónico corporativo exactamente como fue registrado
4. Ingresar la contraseña (en primer acceso, la contraseña temporal de ENARA)
5. Clic en **Iniciar sesión**

> tip: Si olvidó su contraseña: en el login haga clic en '¿Olvidaste tu contraseña?' e ingrese su correo. Recibirá un enlace válido por 24 horas.

> warn: La sesión expira automáticamente. Si la plataforma no responde, recargue la página (F5).

### Módulos disponibles según rol

| Módulo | Descripción |
|---|---|
| Dashboard | Panel de cumplimiento con métricas en tiempo real |
| Mis EDIs | Expedientes Digitales Inteligentes de su organización |
| Inteligencia | Alertas regulatorias y monitoreo de cambios normativos |
| Consultar | Motor de IA para consultas normativas (RAG) |
| Normativa | Catálogo de 365 normas ambientales colombianas |
| Jurisprudencia | 147 sentencias del Consejo de Estado y Corte Constitucional |
| Conceptos & Guías | Circulares, guías técnicas y conceptos jurídicos |
| Oversight | Registro de visitas e inspecciones de autoridades |
| INTAKE | Análisis inteligente de documentos con IA |
| Radar Normativo | Detección automática de normas aplicables (nuevo en v3.15.x) |
| Mi Equipo | Gestión de usuarios (solo rol admin) |
| Mi Organización | Perfil y plan de suscripción (solo rol admin) |
| Soporte | Asistente VIGÍA 24/7 + tickets de soporte técnico |

## section:teal num=3 title="Dashboard" subtitle="Panel de cumplimiento ambiental en tiempo real"

El Dashboard es la pantalla principal al iniciar sesión. Muestra el estado de cumplimiento ambiental de su organización con métricas claras y actualizadas en tiempo real.

### Métricas principales

| Métrica | Descripción |
|---|---|
| EDIs activos | Expedientes Digitales registrados y activos |
| Obligaciones vencidas | Obligaciones cuya fecha límite ya pasó — requieren atención inmediata |
| Próximas 30 días | Obligaciones que vencen en el próximo mes — planificar acción |
| Al día | Obligaciones cumplidas o sin alerta activa |
| Tasa de cumplimiento | (Obligaciones al día / Total obligaciones) × 100. ≥80%=verde, 50-79%=amarillo, <50%=rojo |

### Tres vistas del Dashboard

- **Resumen** (por defecto): métricas + tabla de obligaciones ordenadas por urgencia
- **Línea de tiempo**: obligaciones agrupadas por mes cronológicamente. El mes actual marcado 'HOY'. Rojo=vencidas, Amarillo=próximas, Verde=al día
- **Histórico**: gráfico de barras con tasa de cumplimiento de los últimos 6 meses. Permite ver tendencia y evaluar si la organización mejora o empeora

> tip: Botón PDF (esquina superior derecha del Dashboard): genera informe completo de cumplimiento con métricas, lista de EDIs y tabla de obligaciones. Use Imprimir → Guardar como PDF en el navegador.

## section:navy num=4 title="Mis EDIs" subtitle="Expedientes Digitales Inteligentes"

¿Qué es un EDI? Un Expediente Digital Inteligente representa un instrumento ambiental de su organización: licencia ambiental, permiso de vertimiento, concesión de aguas, permiso de emisiones atmosféricas, permiso forestal, u otro acto administrativo ambiental.

| Campo | Descripción |
|---|---|
| Título / Nombre | Nombre descriptivo del expediente |
| Tipo de instrumento | Licencia, permiso de vertimiento, concesión, etc. |
| Número de radicado | Número de la resolución o acto administrativo |
| Autoridad emisora | ANLA, CAR, CRA, CORNARE, Alcaldía, etc. |
| Fechas | Expedición y vencimiento del instrumento |
| Estado | Activo=verde · Vencido=rojo · Próximo a vencer=amarillo · Cerrado=gris |
| % Completitud | Qué tan completo está el expediente digital en VIGÍA |
| Ubicación | Departamento y municipio de la actividad autorizada |
| Sector | Energía, minería, manufactura, construcción, agroindustria |
| Obligaciones | Lista de obligaciones extraídas del documento por la IA |
| Documentos | Archivos cargados asociados a este EDI |

> warn: Los EDIs se crean ÚNICAMENTE a través del módulo INTAKE. No existe creación manual. Suba el documento al INTAKE y la IA generará el EDI automáticamente.

## section:blue num=5 title="INTAKE" subtitle="Análisis inteligente de documentos con IA"

El INTAKE es el módulo donde se suben los documentos ambientales para que la inteligencia artificial los analice y extraiga automáticamente toda la información relevante. Es el punto de entrada para crear EDIs y registrar obligaciones en VIGÍA.

| Parámetro | Valor |
|---|---|
| Formatos aceptados | PDF, JPG, PNG, JPEG |
| Formatos NO aceptados | Word (.docx), Excel (.xlsx), archivos con contraseña |
| Tamaño máximo | 10 MB por archivo |
| Tiempo de análisis | 20-60 segundos según tamaño y complejidad del documento |
| Documentos por vez | Uno a la vez — cada documento genera un EDI independiente |

### ¿Qué extrae la IA automáticamente?

- Tipo de instrumento ambiental
- Número de radicado o resolución
- Nombre de la autoridad emisora
- Fecha de expedición y fecha de vencimiento
- Sector o actividad económica
- Ubicación geográfica (departamento y municipio)
- Obligaciones: descripción, plazo, frecuencia y norma fundamento de cada una

### Paso a paso para usar el INTAKE

1. Ir al módulo INTAKE en el menú lateral
2. Hacer clic en 'Subir documento' o arrastrar el archivo al área
3. Esperar el análisis de la IA (20-60 segundos). No cierre la ventana durante el análisis.
4. Revisar los resultados detalladamente. Todos los campos son editables antes de confirmar.
5. Corregir cualquier dato incorrecto. Si la IA interpretó mal una fecha o nombre, puede corregirlo.
6. Hacer clic en 'Confirmar y guardar'
7. Verificar en el Dashboard y Mis EDIs. El EDI y las obligaciones aparecen inmediatamente.

> warn: El INTAKE es un asistente de IA, no un proceso automático sin supervisión. Siempre revise y confirme los resultados antes de guardar para garantizar la exactitud del expediente.

### ¿Qué hacer si el INTAKE falla?

| Acción | Detalle |
|---|---|
| Verificar formato | Solo PDF o imagen. No Word, no Excel, no archivos con contraseña. |
| Verificar integridad | Abra el archivo en otro programa para confirmar que no está dañado. |
| Reducir tamaño | Si supera 10 MB, comprimalo o divida el PDF en partes. |
| Cambiar navegador | Intente desde Chrome si usa otro navegador. |
| Crear ticket | Si persiste: Soporte → Mis tickets → 'Expedientes (EDIs)' → 'Análisis del documento falló'. |

## section:purple num=6 title="Consultar" subtitle="Motor de inteligencia regulatoria ambiental"

El módulo Consultar es el más potente de VIGÍA. Es un asistente de IA que responde preguntas sobre la normativa ambiental colombiana usando un corpus de 365 normas + 147 sentencias con búsqueda semántica vectorial (RAG).

### Tipos de preguntas que puede responder

| Tipo de consulta | Ejemplo |
|---|---|
| Normas específicas | ¿Qué dice el artículo 2.2.3.3.1.5 del Decreto 1076 de 2015? |
| Aplicación práctica | ¿Qué permisos necesito para verter aguas residuales al río Chicamocha? |
| Comparaciones | ¿Diferencia entre licencia ambiental y permiso de vertimiento? |
| Plazos y trámites | ¿Cuánto tiempo tiene la ANLA para resolver una licencia ambiental? |
| Vigencia de normas | ¿Está vigente la Resolución 631 de 2015 sobre vertimientos? |
| Jurisprudencia | ¿Qué ha dicho el Consejo de Estado sobre el principio de precaución? |
| Situación específica | Tenemos un permiso de vertimiento vencido. ¿Qué debemos hacer? |

### Capas de búsqueda (activables independientemente)

- **Capa 1 — Mis documentos**: documentos propios de su organización subidos via INTAKE. Prioridad máxima.
- **Capa 2a — Normativa vigente**: 365 normas con información de vigencia artículo por artículo.
- **Capa 2b — Jurisprudencia**: 147 sentencias del Consejo de Estado y Corte Constitucional.
- **Capa 2c — Circulares y guías**: guías técnicas MADS/ANLA. Marcadas como no vinculantes.

### Paso a paso para usar el motor de consulta

1. Ir al módulo Consultar en el menú lateral
2. Verificar que las capas deseadas estén activas (todas activas por defecto)
3. Escribir la pregunta en lenguaje natural (no es necesario usar terminología técnica exacta)
4. Presionar Enter o clic en el botón de enviar
5. Leer la respuesta con citas exactas de norma + artículo
6. Clic en una fuente citada para ver el artículo completo en Normativa

### Indicadores de vigencia en las respuestas

| Indicador | Significado y acción recomendada |
|---|---|
| DEROGADO | La norma o artículo fue derogado y ya no aplica. No usar como fundamento actual. |
| MODIFICADO | El artículo fue modificado por norma posterior. Consultar la norma modificadora. |
| Sin badge | Vigente y aplicable. Puede citarse con seguridad. |

### Funciones adicionales

- **Copiar respuesta**: botón clipboard en cada respuesta. Copia texto con citas formateadas.
- **Exportar**: botón de descarga. Formatos: Markdown, texto plano, PDF, Word (.doc).
- **Historial**: sección 'Consultas recientes' plegable. Clic para recargar una anterior.
- **Límite**: 20 consultas por hora por usuario. Se resetea al inicio de cada hora.

> tip: Para mejores resultados, sea específico. En lugar de '¿qué dice la norma de vertimientos?' pregunte '¿cuáles son los límites de DBO5 para vertimientos de industria láctea según la Resolución 631?' Incluya contexto: sector, actividad, región.

## section:teal num=7 title="Normativa" subtitle="Catálogo de 365 normas ambientales colombianas"

Catálogo completo de normas con exploración artículo por artículo y estado de vigencia actualizado. Funciona como la biblioteca legal de VIGÍA.

| Función | Descripción |
|---|---|
| Búsqueda | Por nombre de la norma, número o tipo |
| Filtros | Ley, decreto, resolución, acuerdo, etc. |
| Vista de artículos | Texto completo de cada artículo en orden |
| Vigencia | Badge por artículo: sin badge=vigente, amarillo=modificado, rojo=derogado |
| Integración | Las citas del motor de consulta enlazan directamente al artículo aquí |

### Normas principales del corpus

| Norma | Descripción |
|---|---|
| Ley 99 de 1993 | Crea el SINA, el MADS y la política ambiental colombiana |
| Decreto 1076 de 2015 | Decreto Único Reglamentario del sector ambiental — norma más consultada |
| Resolución 631 de 2015 | Parámetros y valores límite de vertimientos industriales |
| Resolución 2254 de 2017 | Norma de calidad del aire — contaminantes y límites |
| Ley 1333 de 2009 | Régimen sancionatorio ambiental — infracciones y sanciones |
| Ley 1523 de 2012 | Política nacional de gestión del riesgo de desastres |
| + 359 normas más | Leyes, decretos, resoluciones, acuerdos — ámbito ambiental colombiano |

## section:navy num=8 title="Jurisprudencia" subtitle="147 sentencias y decisiones judiciales"

Catálogo de sentencias judiciales en materia ambiental incluidas en el corpus de VIGÍA. Las sentencias del Consejo de Estado y la Corte Constitucional son clave para interpretar correctamente el alcance de las normas ambientales.

| Tribunal | Tipo de decisiones |
|---|---|
| Corte Constitucional | Sentencias sobre derechos ambientales, acciones populares, tutela ambiental |
| Consejo de Estado | Fallos sobre licencias, sanciones, procesos administrativos ambientales |
| Tribunales | Decisiones regionales relevantes para sectores específicos |

> tip: Cuando el motor de consulta cita una sentencia del Consejo de Estado, significa que ese tribunal ya se pronunció sobre una situación similar. Puede usar ese precedente como argumento ante la autoridad ambiental.

## section:orange num=9 title="Conceptos & Guías" subtitle="Circulares, guías técnicas y conceptos jurídicos"

Material de apoyo orientador emitido por autoridades ambientales colombianas. Este material no es vinculante — no crea obligaciones jurídicas directas, pero orienta cómo interpretar y aplicar correctamente las normas ambientales.

| Categoría | Descripción |
|---|---|
| Circulares | Instrucciones internas de MADS, ANLA y CARs sobre interpretación de normas |
| Guías técnicas | Metodologías y procedimientos para cumplir requisitos ambientales |
| Conceptos jurídicos | Pronunciamientos de la Procuraduría, MADS y otras entidades |
| Manuales | Documentos de procedimiento para trámites ante autoridades ambientales |

> warn: Todo el material de este módulo está marcado 'No vinculante'. Para demostrar cumplimiento ante la autoridad, funde sus obligaciones en las normas del módulo Normativa.

## section:darkslate num=10 title="Oversight" subtitle="Registro de visitas e inspecciones de autoridades"

Módulo para registrar y documentar las visitas de control e inspecciones de las autoridades ambientales. Este registro es evidencia clave en procesos sancionatorios y auditorías.

### ¿Qué registrar?

- Visitas de inspección de CARs, ANLA, alcaldías y entes de control
- Auditorías ambientales internas y externas
- Requerimientos de información de la autoridad
- Notificaciones de procesos sancionatorios
- Seguimiento a planes de manejo ambiental (PMA)

> tip: Registre cada visita el mismo día que ocurre. Un registro contemporáneo al hecho tiene mayor valor probatorio ante la autoridad ambiental.

## section:teal num=11 title="Mi Organización" subtitle="Perfil organizacional y suscripción"

Disponible solo para usuarios con rol admin. Permite gestionar el perfil de la empresa y consultar los detalles del plan de suscripción.

| Campo | Descripción |
|---|---|
| Datos básicos | Razón social, NIT, representante legal, código CIIU |
| Contacto | Email corporativo, teléfono, dirección |
| Ubicación | Departamento y ciudad principal de operación |
| Responsable VIGÍA | Nombre y cargo del líder ambiental en la empresa |
| Plan actual | Tipo de plan, límites de EDIs, usuarios y análisis por mes |
| Comparativa planes | Tabla con Gratuito, Profesional y Enterprise |
| Solicitar upgrade | Botón que abre email pre-redactado a ENARA Consulting |

## section:navy num=12 title="Mi Equipo" subtitle="Gestión de usuarios de la organización"

Disponible solo para usuarios con rol admin. Permite ver y gestionar los usuarios de su organización dentro de VIGÍA.

| Acción | Descripción |
|---|---|
| Ver usuarios | Lista completa con nombre, email y rol asignado |
| Cambiar rol | Puede cambiar entre Viewer y Editor para usuarios existentes |
| Ver límites | Cuántos usuarios tiene vs el límite del plan contratado |
| Agregar usuarios | Solo ENARA puede crear nuevos usuarios |

> warn: Para agregar nuevos usuarios, contacte a info@enaraconsulting.com.co indicando nombre completo, correo electrónico y rol deseado (Viewer, Editor o Admin).

## section:blue num=13 title="Soporte" subtitle="Asistente VIGÍA 24/7 + tickets de soporte técnico"

El módulo Soporte ofrece dos herramientas complementarias: el Asistente VIGÍA (IA disponible 24/7) y el sistema de tickets para problemas que requieren intervención humana de ENARA.

### Pestaña: Asistente VIGÍA

Chatbot de IA que conoce en detalle todos los módulos, flujos y limitaciones de VIGÍA. Responde en segundos sobre cómo usar la plataforma.

- ¿Cómo subo un documento al INTAKE?
- ¿Por qué no veo mis obligaciones en el Dashboard?
- ¿Cómo hago una consulta al corpus normativo?
- ¿Cuántas consultas puedo hacer por hora?
- ¿Cómo descargo el informe PDF de cumplimiento?
- ¿Cómo agrego un usuario a mi equipo?

### Pestaña: Mis tickets

Wizard guiado de 3 pasos para reportar problemas técnicos que requieren intervención de ENARA.

| Paso | Detalle |
|---|---|
| Paso 1: Categoría | 8 categorías: Acceso, EDIs, Motor de consulta, Datos, Alertas, Rendimiento, Plan, Otro |
| Paso 2: Subcategoría | 4-7 opciones específicas por categoría (~40 opciones en total) |
| Paso 3: Prioridad + descripción | Baja / Media / Alta / Crítica. Descripción opcional pero recomendada. |

### ¿Asistente o Ticket? Guía rápida

| Asistente VIGÍA | Mis tickets |
|---|---|
| ¿Cómo funciona el INTAKE? | El INTAKE falló hace 2 días con este documento |
| ¿Qué significa badge DEROGADO? | No puedo iniciar sesión desde esta mañana |
| ¿Cómo exporto el informe? | Mis obligaciones desaparecieron del Dashboard |
| Disponible 24/7, respuesta inmediata | ENARA responde en horario hábil (L-V 8am-6pm) |

## section:teal num=14 title="Radar Normativo" subtitle="Detección automática de normas aplicables a su empresa"

El Radar Normativo es el módulo que monitorea diariamente las fuentes oficiales colombianas (Diario Oficial, MinAmbiente, ANLA, Consejo de Estado, Corte Constitucional) y detecta automáticamente normas nuevas que pueden afectar a su empresa. Cuando encuentra una norma que aplica a su sector o actividad, aparece en el Radar con un indicador de urgencia y la razón por la cual se priorizó.

### ¿Cómo acceder al Radar?

Menú lateral → **Radar Normativo**. El icono con contador indica cuántas normas nuevas aplicables aún no ha revisado.

### ¿Qué muestra el Radar?

| Campo | Descripción |
|---|---|
| Título de la norma | Tipo (Decreto/Resolución/Ley), número, año y resumen corto |
| Autoridad emisora | ANLA, MinAmbiente, Consejo de Estado, etc. |
| Fecha de publicación | Cuándo fue emitida oficialmente |
| Urgencia | Alta (rojo), Media (amarillo), Baja (verde) |
| Razón de aplicabilidad | Por qué el sistema consideró que aplica a su empresa |
| Fuente oficial | Enlace al texto original (ANLA Eureka, Senado, SUIN-Juriscol o Google como fallback) |
| Estado | Nueva · Revisada · Archivada |

### ¿Cómo sabe el Radar qué aplica a mi empresa?

El sistema usa el perfil regulatorio de su organización (completado en Mi Organización con enriquecimiento automático por IA) para decidir. Los criterios:

- **Sector económico**: si el perfil indica 'minería' o 'agroindustria', las normas generales del sector se marcan como aplicables.
- **Actividades autorizadas**: si tiene un permiso de vertimiento activo, las normas sobre vertimientos se priorizan.
- **Jurisdicción territorial**: si opera en el Atlántico, las resoluciones de la CRA tienen prioridad sobre las de CORNARE.
- **Materias de interés declaradas**: si marcó 'residuos peligrosos' en su perfil, normas sobre residuos aparecen con urgencia alta.

### Filtros disponibles

| Filtro | Opciones |
|---|---|
| Urgencia | Todas · Alta · Media · Baja |
| Estado | Nuevas sin revisar · Revisadas · Archivadas · Todas |
| Fuente | ANLA · MinAmbiente · Senado · Otros |
| Fecha | Últimos 7 días · 30 días · 90 días · Todo el histórico |
| Tipo de norma | Decreto · Resolución · Ley · Circular |

### Acciones disponibles sobre cada ítem

- **Abrir norma oficial**: botón 'Ver norma oficial' — abre el texto completo en la fuente oficial.
- **Marcar como revisada**: pasa el ítem al estado 'Revisada' para quitarlo del contador de pendientes.
- **Archivar**: si considera que la norma no aplica, la archiva (el sistema aprende del feedback).
- **Agregar como EDI**: si la norma requiere un expediente digital, dispara el flujo de INTAKE.

### Frecuencia de actualización

Todos los días a las 5:30 AM (hora Colombia) el sistema revisa las fuentes oficiales. Si alguna norma nueva tiene urgencia Alta, recibirá notificación por email el mismo día. Las de urgencia Media/Baja se acumulan en un digest semanal los lunes.

### Ejemplo de uso (demo)

La organización demo hidrorverde.com.co tiene permiso de vertimiento activo y opera en el Atlántico. Al entrar al Radar:

- Aparece Resolución 0126 de 2024 del MADS (especies silvestres amenazadas) con urgencia Media por relación con su actividad.
- Los filtros permiten aislar solo las normas de vertimientos para la auditoría mensual.

> warn: El Radar es un apoyo a la vigilancia regulatoria, no reemplaza la revisión jurídica. Antes de tomar decisiones vinculantes basadas en una norma detectada, valide el texto oficial y contacte a ENARA Consulting si tiene dudas.

## section:orange num=15 title="Onboarding" subtitle="Primeros pasos guiados — wizard de 3 pasos"

La primera vez que un usuario inicia sesión en VIGÍA, aparece un asistente de configuración inicial que lo guía para que la plataforma funcione correctamente con sus datos. El proceso dura aproximadamente 5 minutos y se puede reanudar si se cierra a mitad.

### ¿Cuándo aparece el Onboarding?

- Primer login después de que ENARA activó su cuenta.
- Primer ingreso de cada usuario nuevo agregado por el Admin de su organización.
- No aparece para usuarios SuperAdmin de ENARA (ellos tienen otro flujo).

### Paso 1 — Confirmación del perfil

El sistema muestra los datos que ENARA cargó al activar su organización: razón social, NIT, sector, ubicación principal, representante legal. Usted debe verificar que todo esté correcto. Si algo es incorrecto, puede corregirlo en el momento o enviar una solicitud de cambio al SuperAdmin.

| Dato | ¿Quién lo completa? |
|---|---|
| Razón social, NIT, código CIIU | ENARA al crear la org (usted solo verifica) |
| Sector principal | Sugerido por IA a partir del CIIU, editable |
| Ubicación (departamento, municipio) | Usted ingresa |
| Responsable VIGÍA de la empresa | Usted ingresa (nombre y cargo) |

### Paso 2 — Materias ambientales de interés

El sistema muestra 8 categorías principales (agua, aire, residuos, biodiversidad, sancionatorio, cambio climático, licenciamiento, otros) y usted marca las que aplican a su operación. Esta información alimenta el motor de aplicabilidad del Radar Normativo.

> tip: Marque al menos 2-3 categorías aunque no esté 100% seguro. El Radar usa esto solo como pista — la aplicabilidad final se confirma con el texto específico de cada norma.

### Paso 3 — Primer EDI opcional

El wizard le ofrece subir su primer documento ambiental al INTAKE (una licencia, un permiso, una resolución). Si tiene el PDF a mano, súbalo ahora para que VIGÍA extraiga automáticamente el EDI y sus obligaciones. Si prefiere hacerlo después, puede omitir este paso.

### ¿Qué pasa al terminar el Onboarding?

- El Dashboard queda configurado con sus datos reales.
- El Radar Normativo empieza a priorizar normas según el sector y materias que marcó.
- Si subió un documento en el Paso 3, verá su primer EDI en Mis EDIs.
- El asistente no vuelve a aparecer en ingresos posteriores.

### ¿Cómo reanudar un onboarding que se abandonó?

Si cerró el wizard sin terminar, la próxima vez que inicie sesión aparecerá en el mismo paso donde lo dejó. Los datos que ya había guardado se conservan.

Si necesita rehacer el onboarding desde cero: Mi Organización → Editar perfil → botón 'Reiniciar configuración'. Solo usuarios con rol Admin pueden reiniciarlo.

### Ejemplo de uso (demo)

Al ingresar por primera vez con director.ambiental@cementosandinos.com.co:

- **Paso 1**: wizard muestra 'Cementos Andinos S.A.S., NIT 900.XXX, sector cemento'. Agrega que el responsable es 'Ing. Juan Pérez, Director Ambiental'.
- **Paso 2**: marca 'aire' (emisiones atmosféricas), 'licenciamiento' (licencia ambiental vigente) y 'residuos' (residuos industriales).
- **Paso 3**: sube el PDF de la licencia. VIGÍA extrae el EDI en 30 segundos con 6 obligaciones identificadas.

Al terminar, el Dashboard muestra 1 EDI activo y 6 obligaciones en seguimiento. El Radar empieza a priorizar normas sobre aire, residuos y licenciamiento al día siguiente.

## section:navy num=16 title="Roles y permisos"

VIGÍA implementa un sistema de control de acceso basado en roles (RBAC). Cada usuario tiene un rol que determina qué puede ver y hacer en la plataforma.

| Permiso | Viewer | Editor | Admin |
|---|---|---|---|
| Ver Dashboard, Mis EDIs, métricas | ✓ | ✓ | ✓ |
| Usar motor de consulta (Consultar) | ✓ | ✓ | ✓ |
| Ver Normativa, Jurisprudencia, Guías | ✓ | ✓ | ✓ |
| Ver Oversight | ✓ | ✓ | ✓ |
| Ver Radar Normativo | ✓ | ✓ | ✓ |
| Usar módulo Soporte (bot + tickets) | ✓ | ✓ | ✓ |
| Subir documentos al INTAKE | ✗ | ✓ | ✓ |
| Crear y editar EDIs | ✗ | ✓ | ✓ |
| Registrar visitas en Oversight | ✗ | ✓ | ✓ |
| Archivar items del Radar | ✗ | ✓ | ✓ |
| Gestionar usuarios (Mi Equipo) | ✗ | ✗ | ✓ |
| Ver Mi Organización y plan | ✗ | ✗ | ✓ |
| Cambiar roles de otros usuarios | ✗ | ✗ | ✓ |
| Solicitar upgrade de plan | ✗ | ✗ | ✓ |
| Reiniciar Onboarding | ✗ | ✗ | ✓ |

## section:navy num=17 title="Planes y suscripción"

| | Gratuito | Profesional | Enterprise |
|---|---|---|---|
| Precio mensual | $0 COP | $3.000.000 COP | $6.000.000 COP |
| EDIs permitidos | 5 | 25 | Ilimitados |
| Usuarios | 2 | 5 | Ilimitados |
| Análisis INTAKE/mes | 10 | 50 | Ilimitados |
| Soporte | Email | Email + tickets | Atención dedicada ENARA |
| Ideal para | Evaluación del producto | Empresas medianas obligadas | Grupos o grandes empresas |

Para solicitar un cambio de plan: Mi Organización → Plan y suscripción → Solicitar upgrade. Se abre su cliente de correo con un email pre-redactado para ENARA.

## section:navy num=18 title="Errores comunes y soluciones"

### No puedo iniciar sesión — 'credenciales incorrectas'

Posibles causas: correo con espacios · Bloq Mayúsculas activo · contraseña temporal expirada

- Verificar que el correo sea exactamente el registrado (sin espacios al inicio o final)
- Desactivar Bloq Mayúsculas y reintentar
- Usar '¿Olvidaste tu contraseña?' — el enlace expira en 24 horas
- Si persiste: crear ticket categoría 'Acceso y autenticación'

### El INTAKE falla o muestra error al analizar

Posibles causas: formato incorrecto · PDF con contraseña · archivo dañado · tamaño excesivo

- Usar solo PDF, JPG, PNG o JPEG (no Word ni Excel)
- Quitar la contraseña del PDF antes de subirlo
- Verificar que el archivo no está dañado abriéndolo en otro programa
- Si supera 10 MB: comprimir o dividir el PDF
- Intentar desde Chrome si usa otro navegador
- Si persiste: ticket → 'Expedientes (EDIs)' → 'Análisis del documento falló'

### No veo mis EDIs o el Dashboard está vacío

Posibles causas: la pantalla no se actualizó · no se completó el INTAKE

- Recargar la página (F5 o Ctrl+R) si acaba de crear un EDI
- Verificar en el historial del INTAKE que se confirmó el análisis
- Si es usuario nuevo: el Dashboard estará vacío hasta crear el primer EDI con el INTAKE

### El motor de consulta no responde o dice 'límite alcanzado'

Posibles causas: se superaron las 20 consultas/hora · problema de conexión temporal

- Si es límite de consultas: esperar al inicio de la próxima hora (reseteo automático)
- Si es conexión: recargar la página y reintentar
- Si persiste más de 5 minutos: ticket → 'Motor de consulta'

### No recibo alertas o notificaciones de vencimiento por email

Posibles causas: email incorrecto registrado · emails en spam · obligaciones sin fecha

- Verificar el email registrado en Mi Organización
- Revisar carpeta de spam / correo no deseado
- Las alertas se envían solo cuando hay obligaciones entre -7 y +30 días del vencimiento
- Si persiste: ticket → 'Alertas y notificaciones'

### El Radar Normativo no muestra items o muestra items que no aplican

Posibles causas: perfil de organización incompleto · materias de interés no marcadas · filtros activos muy restrictivos

- Verificar en Mi Organización que sector, ubicación y actividades estén completos
- Rehacer el Onboarding desde Mi Organización → 'Reiniciar configuración'
- Revisar que los filtros del Radar no estén excluyendo items (estado, fecha, fuente)
- Si items irrelevantes aparecen: archivarlos — el sistema aprende del feedback

## section:navy num=19 title="Preguntas frecuentes"

**P: ¿Puedo usar VIGÍA en mi celular?**

R: Sí. VIGÍA tiene diseño responsive y funciona en navegadores móviles. La experiencia óptima es en escritorio.

**P: ¿Qué navegadores funcionan?**

R: Chrome (recomendado), Firefox, Safari y Edge actualizados. Para el INTAKE use Chrome.

**P: ¿Cómo descargo el informe de cumplimiento en PDF?**

R: Dashboard → botón 'PDF' (esquina superior derecha) → nueva ventana → Imprimir → 'Guardar como PDF'.

**P: ¿Puedo confiar en las respuestas del motor de consulta?**

R: Las respuestas se basan en texto exacto de normas con citas verificables. Para decisiones jurídicas vinculantes, consulte con ENARA Consulting.

**P: ¿Cómo sé qué plan tiene mi organización?**

R: Mi Organización → sección 'Plan y suscripción' al final de la página.

**P: ¿Puedo ver los documentos que subí al INTAKE?**

R: Sí. Mis EDIs → clic en un EDI → documentos asociados al final del detalle.

**P: ¿Qué pasa si el INTAKE detecta obligaciones incorrectas?**

R: Antes de confirmar puede editar o eliminar obligaciones. Si ya confirmó con errores, cree un ticket.

**P: ¿Mis datos están seguros?**

R: Sí. VIGÍA usa cifrado HTTPS/TLS + AES-256 en reposo, Row Level Security por organización, y tokens JWT.

**P: ¿El motor de consulta reemplaza al asesor ambiental?**

R: No. VIGÍA es una herramienta de apoyo. Para estrategia y decisiones complejas, ENARA Consulting está disponible.

**P: ¿La jurisprudencia citada es vinculante?**

R: Las sentencias del Consejo de Estado tienen valor de precedente en vía gubernativa. La Corte Constitucional tiene efectos erga omnes. Consulte con ENARA para casos específicos.

**P: ¿Cada cuánto se actualiza el Radar Normativo?**

R: Diariamente a las 5:30 AM (hora Colombia). Si hay una norma con urgencia Alta aplicable, recibirá email el mismo día. Las de urgencia Media/Baja van en un digest semanal los lunes.

**P: ¿Puedo saltarme el Onboarding?**

R: El Paso 3 (subir un EDI) es opcional. Pasos 1 y 2 son necesarios para que el Radar funcione correctamente. Puede completarlos en menos de 3 minutos.

## section:navy num=20 title="Glosario técnico y ambiental"

| Término | Definición |
|---|---|
| ANLA | Autoridad Nacional de Licencias Ambientales. Expide licencias para proyectos de impacto nacional. |
| CAR | Corporación Autónoma Regional. Autoridad ambiental regional. Ejemplos: CRA (Atlántico), CORNARE (NE Antioquia), CAR (Cundinamarca). |
| Corpus | Colección de normas y sentencias en la base de conocimiento de VIGÍA (365 normas + 147 sentencias). |
| EDI | Expediente Digital Inteligente. Representación digital de un instrumento ambiental en VIGÍA. |
| Estándar de emisión | Valor máximo permitido de contaminante que puede emitirse al aire, agua o suelo. |
| INTAKE | Módulo de ingesta documental con IA. Analiza PDF/imagen y extrae información del instrumento ambiental. |
| MADS | Ministerio de Ambiente y Desarrollo Sostenible. Rector de la política ambiental colombiana. |
| Onboarding | Wizard de 3 pasos que aparece en el primer ingreso de cada usuario. Configura el perfil y las materias de interés. |
| PMA | Plan de Manejo Ambiental. Conjunto de medidas para manejar los impactos de una actividad. |
| PTO | Plan de Trabajos y Obras. Describe las obras en el marco de un instrumento ambiental. |
| Radar Normativo | Módulo que detecta automáticamente normas nuevas aplicables a la organización. Revisa fuentes oficiales diariamente. |
| RAG | Retrieval-Augmented Generation. Tecnología del motor de consulta: busca en el corpus y genera respuestas basadas en normas reales. |
| RBAC | Role-Based Access Control. Sistema de permisos por roles: Viewer, Editor, Admin. |
| RLS | Row Level Security. Política de BD que garantiza aislamiento de datos entre organizaciones. |
| Tasa retributiva | Cobro por usar el recurso hídrico para verter contaminantes. Regulada por el Decreto 1076/2015. |
| Urgencia (Radar) | Prioridad asignada a una norma detectada: Alta (rojo), Media (amarillo), Baja (verde). |
| Vertimiento | Descarga directa o indirecta de aguas residuales a un cuerpo de agua, al suelo o al subsuelo. |
| Vigencia normativa | Estado jurídico de una norma: vigente, derogada o modificada. VIGÍA lo muestra con badges de color. |

## section:navy num=21 title="Contacto ENARA Consulting"

ENARA Consulting S.A.S. es la empresa desarrolladora de VIGÍA y prestadora de servicios de consultoría ambiental en Colombia. Nuestro equipo está disponible para soporte técnico, onboarding de nuevos usuarios y asesoría ambiental especializada.

| Canal | Información |
|---|---|
| Email principal | info@enaraconsulting.com.co |
| Teléfonos | +57 314 330 4008 · +57 320 277 3972 |
| Sitio web | www.enaraconsulting.com.co |
| Ciudad | Barranquilla, Atlántico, Colombia |
| Horario de atención | Lunes a viernes, 8:00 AM – 6:00 PM (COT) |
| Política de privacidad | Disponible en la plataforma — enlace en la pantalla de login |

> tip: Recuerde que el Asistente VIGÍA (Soporte → pestaña del bot) está disponible 24/7 para cualquier duda sobre el uso de la plataforma. Para problemas técnicos, cree un ticket desde Soporte → pestaña de tickets. El equipo de ENARA responde en horario hábil.

---

VIGÍA by ENARA Consulting S.A.S. · Versión 1.1 · Abril 2026

Documento confidencial de uso exclusivo de clientes de ENARA Consulting.
