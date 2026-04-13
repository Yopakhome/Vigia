-- =======================================================================
-- VIGÍA — Seed de Datos Demo v1
-- =======================================================================
-- 8 instrumentos (4 por org), 24 obligaciones, 4 alertas.
-- Idempotente: puede correrse N veces sin errores.
-- =======================================================================

BEGIN;

-- Asegurar columnas necesarias
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS project_name    TEXT;
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS location_dept   TEXT;
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS location_mun    TEXT;
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS authority_level TEXT;

-- Alinear schema con decisión arquitectónica Sprint 1 (BUG-02):
-- project_id quedó como residuo del JOIN eliminado; el frontend ya no lo setea.
ALTER TABLE instruments ALTER COLUMN project_id DROP NOT NULL;

-- Normalizar status de obligaciones: el constraint original usa valores acentuados
-- ('al_día', 'próximo') pero el frontend usa sin acento. Alineamos el DB al código.
UPDATE obligations SET status = 'al_dia'   WHERE status = 'al_día';
UPDATE obligations SET status = 'proximo'  WHERE status = 'próximo';
ALTER TABLE obligations DROP CONSTRAINT IF EXISTS obligations_status_check;
ALTER TABLE obligations ADD CONSTRAINT obligations_status_check
  CHECK (status = ANY (ARRAY['al_dia'::text, 'proximo'::text, 'vencido'::text, 'cumplido'::text, 'suspendido'::text, 'no_aplica'::text, 'pendiente'::text]));

-- Mismo problema en regulatory_alerts.urgency: constraint usa 'crítica', frontend usa 'critica'.
UPDATE regulatory_alerts SET urgency = 'critica' WHERE urgency = 'crítica';
ALTER TABLE regulatory_alerts DROP CONSTRAINT IF EXISTS regulatory_alerts_urgency_check;
ALTER TABLE regulatory_alerts ADD CONSTRAINT regulatory_alerts_urgency_check
  CHECK (urgency = ANY (ARRAY['critica'::text, 'moderada'::text, 'informativa'::text]));

-- Limpiar demos anteriores
DELETE FROM obligations WHERE org_id IN ('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000002');
DELETE FROM documents   WHERE org_id IN ('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000002');
DELETE FROM instruments WHERE org_id IN ('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000002');
DELETE FROM regulatory_alerts WHERE id::text LIKE 'f1000000-%';

-- Instrumentos: Energía Renovable Demo
INSERT INTO instruments (id, org_id, instrument_type, number, issue_date, authority_name, authority_level, project_name, location_dept, location_mun, domain, edi_status, completeness_pct, has_confidential_sections, ingested_at) VALUES
('d1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','licencia_ambiental','Res 1245/2023','2023-08-14','ANLA - Autoridad Nacional de Licencias Ambientales','nacional','Parque Solar El Tesoro 120 MW','Cundinamarca','Guaduas','ambiental','activo',85,false,NOW()),
('d1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001','permiso_vertimientos','Res 0892/2024','2024-03-22','CAR - Corporación Autónoma Regional de Cundinamarca','regional','Planta de Lavado Paneles - Parque Solar El Tesoro','Cundinamarca','Guaduas','ambiental','activo',70,false,NOW()),
('d1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000001','plan_manejo_ambiental','Res 2156/2022','2022-11-05','ANLA - Autoridad Nacional de Licencias Ambientales','nacional','Línea de Transmisión 230 kV El Tesoro - Guavio','Cundinamarca','Gachalá','ambiental','activo',92,false,NOW()),
('d1000000-0000-0000-0000-000000000004','b1000000-0000-0000-0000-000000000001','concesion_aguas','Res 1478/2023','2023-06-18','CAR - Corporación Autónoma Regional de Cundinamarca','regional','Concesión de Aguas Superficiales Río Negro','Cundinamarca','Guaduas','ambiental','activo',60,false,NOW());

-- Instrumentos: Minería Verde Demo
INSERT INTO instruments (id, org_id, instrument_type, number, issue_date, authority_name, authority_level, project_name, location_dept, location_mun, domain, edi_status, completeness_pct, has_confidential_sections, ingested_at) VALUES
('d2000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000002','licencia_ambiental','Res 0234/2021','2021-02-11','ANLA - Autoridad Nacional de Licencias Ambientales','nacional','Mina La Esperanza - Extracción de Oro Aluvial','Antioquia','Segovia','ambiental','activo',88,true,NOW()),
('d2000000-0000-0000-0000-000000000002','b2000000-0000-0000-0000-000000000002','plan_gestion_residuos','Res 3421/2023','2023-09-30','Corantioquia','regional','Plan de Manejo de Residuos Peligrosos - Planta Beneficio','Antioquia','Segovia','ambiental','activo',75,false,NOW()),
('d2000000-0000-0000-0000-000000000003','b2000000-0000-0000-0000-000000000002','permiso_emisiones','Res 2891/2024','2024-01-15','Corantioquia','regional','Permiso de Emisiones Atmosféricas - Planta de Beneficio','Antioquia','Segovia','ambiental','activo',65,false,NOW()),
('d2000000-0000-0000-0000-000000000004','b2000000-0000-0000-0000-000000000002','concesion_aguas','Res 4127/2022','2022-07-08','Corantioquia','regional','Concesión de Aguas Subterráneas Pozo Profundo 1','Antioquia','Remedios','ambiental','activo',80,false,NOW());

-- Obligaciones: Energía Renovable (12)
INSERT INTO obligations (id, org_id, instrument_id, obligation_num, name, description, obligation_type, frequency, due_date, status, confidence_level, ai_interpretation, requires_human_validation, has_regulatory_update) VALUES
('e1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','OBL-001','Reporte de monitoreo de avifauna - Trimestre 1','Informe trimestral de monitoreo de aves y fauna asociada en el área de influencia del parque solar.','seguimiento','trimestral','2026-03-15','vencido','alta','Art. 12 Res 1245/2023. Vencida hace 28 días.',false,false),
('e1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','OBL-002','Actualización del plan de compensación biótica','Actualizar y radicar ante ANLA el plan de compensación biótica con indicadores del año anterior.','reporte','anual','2026-05-02','proximo','alta','Art. 18 Res 1245/2023. Vence en 20 días.',false,false),
('e1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','OBL-003','Informe de Cumplimiento Ambiental (ICA) - 2026','Radicación del ICA anual consolidado ante ANLA.','reporte','anual','2026-09-30','al_dia','alta','Seguimiento anual. Faltan 171 días.',false,false),
('e1000000-0000-0000-0000-000000000004','b1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000002','OBL-004','Caracterización fisicoquímica de vertimientos','Caracterización trimestral con laboratorio acreditado IDEAM.','seguimiento','trimestral','2026-03-25','vencido','alta','Art. 8 Res 0892/2024. Vencida hace 18 días.',false,false),
('e1000000-0000-0000-0000-000000000005','b1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000002','OBL-005','Mantenimiento preventivo del sistema de tratamiento','Mantenimiento semestral del sistema de sedimentación y filtración.','operativa','semestral','2026-04-28','proximo','alta','Vence en 16 días.',false,false),
('e1000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000002','OBL-006','Pago de tasa retributiva por vertimientos','Liquidación y pago semestral ante CAR.','financiera','semestral','2026-07-15','al_dia','alta','Vence en 94 días.',false,false),
('e1000000-0000-0000-0000-000000000007','b1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000003','OBL-007','Inspección de servidumbre y derecho de vía','Recorrido de la línea con registro fotográfico.','operativa','semestral','2026-03-08','vencido','media','Vencida hace 35 días.',true,false),
('e1000000-0000-0000-0000-000000000008','b1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000003','OBL-008','Reporte de mantenimiento de franjas de seguridad','Informe trimestral sobre mantenimiento de franjas contra incendios forestales.','reporte','trimestral','2026-04-30','proximo','alta','PMA Res 2156/2022. Vence en 18 días.',false,false),
('e1000000-0000-0000-0000-000000000009','b1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000003','OBL-009','Monitoreo de campos electromagnéticos','Medición anual en puntos definidos del trazado.','seguimiento','anual','2026-11-15','al_dia','alta','Vence en 217 días.',false,false),
('e1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000004','OBL-010','Reporte mensual de caudal captado','Reporte del caudal captado del Río Negro.','reporte','mensual','2026-04-05','vencido','alta','Vencida hace 7 días.',false,false),
('e1000000-0000-0000-0000-000000000011','b1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000004','OBL-011','Calibración de macromedidor de caudal','Calibración anual certificada.','operativa','anual','2026-05-10','proximo','alta','Vence en 28 días.',false,false),
('e1000000-0000-0000-0000-000000000012','b1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000004','OBL-012','Pago de tasa por uso del agua (TUA)','Liquidación y pago anual ante CAR.','financiera','anual','2026-06-30','al_dia','alta','Vence en 79 días.',false,false);

-- Obligaciones: Minería Verde (12)
INSERT INTO obligations (id, org_id, instrument_id, obligation_num, name, description, obligation_type, frequency, due_date, status, confidence_level, ai_interpretation, requires_human_validation, has_regulatory_update) VALUES
('e2000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000001','OBL-001','Informe de Cumplimiento Ambiental (ICA) semestral','Radicación ante ANLA del ICA con avances del PMA.','reporte','semestral','2026-02-28','vencido','alta','Vencida hace 43 días — CRÍTICA.',true,false),
('e2000000-0000-0000-0000-000000000002','b2000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000001','OBL-002','Monitoreo de calidad del agua en cuerpos receptores','Caracterización trimestral aguas arriba y abajo del punto de descarga.','seguimiento','trimestral','2026-05-08','proximo','alta','Vence en 26 días.',false,false),
('e2000000-0000-0000-0000-000000000003','b2000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000001','OBL-003','Reforestación compensatoria 12 hectáreas','Establecimiento y mantenimiento de 12 ha de compensación biótica.','operativa','anual','2026-10-15','al_dia','alta','Vence en 186 días.',false,false),
('e2000000-0000-0000-0000-000000000004','b2000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000002','OBL-004','Reporte IDEAM de residuos peligrosos','Cargue anual al aplicativo IDEAM del inventario respel.','reporte','anual','2026-03-31','vencido','alta','Dec 4741/2005. Vencida hace 12 días.',true,false),
('e2000000-0000-0000-0000-000000000005','b2000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000002','OBL-005','Capacitación anual en manejo de respel','Jornada certificada al 100% del personal que manipula respel.','operativa','anual','2026-04-25','proximo','alta','Vence en 13 días.',false,false),
('e2000000-0000-0000-0000-000000000006','b2000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000002','OBL-006','Auditoría a gestor externo de disposición final','Visita técnica y verificación documental al gestor.','auditoria','anual','2026-08-20','al_dia','media','Vence en 130 días.',false,false),
('e2000000-0000-0000-0000-000000000007','b2000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000003','OBL-007','Estudio isocinético de emisiones','Medición isocinética semestral en chimenea principal.','seguimiento','semestral','2026-03-20','vencido','alta','Vencida hace 23 días.',true,false),
('e2000000-0000-0000-0000-000000000008','b2000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000003','OBL-008','Mantenimiento de filtros de mangas','Cambio y mantenimiento trimestral del sistema de control.','operativa','trimestral','2026-05-05','proximo','alta','Vence en 23 días.',false,false),
('e2000000-0000-0000-0000-000000000009','b2000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000003','OBL-009','Inventario de fuentes fijas de emisión','Actualización anual según Resolución 909/2008.','reporte','anual','2026-12-01','al_dia','alta','Vence en 233 días.',false,false),
('e2000000-0000-0000-0000-000000000010','b2000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000004','OBL-010','Reporte trimestral de volumen extraído','Lectura y reporte a Corantioquia del pozo profundo.','reporte','trimestral','2026-04-02','vencido','alta','Vencida hace 10 días.',false,false),
('e2000000-0000-0000-0000-000000000011','b2000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000004','OBL-011','Monitoreo de nivel freático','Mediciones mensuales en pozos de observación.','seguimiento','mensual','2026-04-30','proximo','alta','Vence en 18 días.',false,false),
('e2000000-0000-0000-0000-000000000012','b2000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000004','OBL-012','Pago de tasa por uso del agua (TUA)','Pago anual de TUA correspondiente al pozo profundo.','financiera','anual','2026-07-08','al_dia','alta','Vence en 87 días.',false,false);

-- Alertas regulatorias (4 generales)
INSERT INTO regulatory_alerts (id, norm_title, norm_type, norm_date, issuing_authority, impact_type, urgency, summary, detailed_analysis, suggested_action, confidence_pct, human_validated) VALUES
('f1000000-0000-0000-0000-000000000001','Resolución 0456 de 2026 - Nuevos lineamientos para ICA en proyectos de generación eléctrica','resolucion','2026-04-08','Ministerio de Ambiente y Desarrollo Sostenible','derogatoria','critica','Se modifican plazos y formato del ICA para proyectos de generación eléctrica >1 MW. Plazo se reduce de 60 a 45 días.','Entra en vigencia 1 junio 2026. Aplica a todos los proyectos con licencia ANLA que incluyan obligación de ICA. Nuevo formato con 3 secciones adicionales: indicadores climáticos, huella hídrica, participación comunitaria.','Actualizar calendario de la obligación ICA con el nuevo plazo y descargar formato actualizado del SILA-ANLA antes del 1 de junio.',94,false),
('f1000000-0000-0000-0000-000000000002','Proyecto de decreto - Nuevos coeficientes de compensación biótica','proyecto_normativo','2026-04-02','Ministerio de Ambiente y Desarrollo Sostenible','prospectiva','moderada','De aprobarse, modificaría los coeficientes de compensación para proyectos con afectación vegetal >5 ha.','Propone incrementar coeficiente de 1:1 a 1:1.5 para bosque seco tropical y 1:1 a 1:2 para páramo. Consulta pública hasta 30 abril 2026.','Revisar planes de compensación vigentes y presentar comentarios antes del cierre.',78,false),
('f1000000-0000-0000-0000-000000000003','Sentencia Tribunal Contencioso - Alcance de obligaciones de monitoreo sin parámetro expreso','sentencia_tribunal','2026-03-28','Tribunal Contencioso Administrativo de Cundinamarca','interpretativa','informativa','Cuando el instrumento no especifica el parámetro, aplican los estándares del Decreto 1076/2015 por interpretación extensiva.','Los parámetros mínimos del Decreto 1076/2015 son exigibles aunque el acto no los mencione. Sienta precedente para licencias antiguas.','Verificar que las obligaciones de monitoreo incluyan los mínimos del Decreto 1076/2015.',89,true),
('f1000000-0000-0000-0000-000000000004','Circular externa 0012-2026 - Actualización de tarifas de tasa retributiva por vertimientos','circular','2026-04-10','Corporaciones Autónomas Regionales','procedimental','moderada','Las CAR actualizan tarifas con incremento promedio 8.2% frente a 2025.','Aplica desde 1 mayo 2026. CAR Cundinamarca +8.5%, Corantioquia +7.9%, CVC +8.1%.','Ajustar proyecciones financieras del semestre y revisar liquidaciones próximas.',96,false);

-- Verificación
DO $$
DECLARE v_inst INT; v_obl INT; v_alr INT;
BEGIN
  SELECT COUNT(*) INTO v_inst FROM instruments WHERE org_id IN ('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000002');
  SELECT COUNT(*) INTO v_obl FROM obligations WHERE org_id IN ('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000002');
  SELECT COUNT(*) INTO v_alr FROM regulatory_alerts WHERE id::text LIKE 'f1000000-%';
  RAISE NOTICE 'Seed completo. Instrumentos: %, Obligaciones: %, Alertas: %', v_inst, v_obl, v_alr;
  RAISE NOTICE 'Esperado: 8 instrumentos, 24 obligaciones, 4 alertas';
END $$;

COMMIT;
