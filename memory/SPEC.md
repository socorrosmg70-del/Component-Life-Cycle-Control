# Component Life Cycle Control — SPEC

Industrial app (pt-BR, BRL, hours) to control the life cycle of heavy-machinery components: equipment, components,
install/remove movements, up to 4 lives, internal/external reforms, LCC, SAP file integration, dashboard, reports, roles, audit.
Hydro brand palette (#444D55 / #768692 / #F4F4F4), fonts Outfit + IBM Plex Sans/Mono.

## Architecture
FastAPI (/api, backend/routers/*) + MongoDB (motor) + React/Vite. Business writes in `backend/lib/services.py`
(install, remove, validate_life, create/update/conclude reform), read computations in `backend/lib/domain.py`
(summarize, lives_of, lcc_of). Pydantic models `backend/models/schemas.py` ↔ TS `frontend/src/lib/types.ts`.
Auth: JWT httpOnly cookie, `lib/auth.py` PERMS matrix (read open to all logged roles).

## Data model (collections)
users, manufacturers, families (targets[4], 4th may be null = "não definida", attention_pct 85), equipment (tag unique,
hourmeter, hourmeter_updated_at), components (tag unique, serial unique, sap_code, pn, current_life 1..4, status
LIBERADO|INSTALADO|REMOVIDO|AGUARDANDO_REFORMA|REFORMA_INTERNA|REFORMA_EXTERNA|SUCATEADO, acquisition_cost, source),
movements (one doc per installation, ABERTA→ENCERRADA, hours_worked, early_removal, inconsistencies, revisions[]),
lives (closed-life validation records), reforms (INTERNA/EXTERNA, AGUARDANDO_ENVIO→EM_EXECUCAO→RETORNADO→CONCLUIDO|REPROVADO),
cost_entries (category, life_number, source MANUAL|SAP), sap_batches, sap_keys (dedupe), sap_materials, audit_log.

## Business rules
- hours = removal hourmeter − install hourmeter (same equipment). Blocks: removal hm < install hm, removal date < install
  date, future dates, install hm < equipment current hm (when date ≥ last reading), component already installed / in reform,
  duplicate OM per component, duplicate TAG/serial, component TAG equal to an equipment TAG.
- Flag (not block): hours > calendar hours → "divergência de horímetro".
- Removal with reform_type ≠ SEM_REFORMA auto-opens a reform; life does NOT advance on removal.
- Life validation (engenharia/admin): requires not installed, no open reform, closed install in the life; below target →
  ENCERRADA_ANTECIPADA + mandatory reason; life 4 → only SUBSTITUIR (status SUCATEADO).
- Reform conclusion requires sent_date + return_date (ext) / service_end (int); approved → LIBERADO, rejected → AGUARDANDO_REFORMA.
- LCC: acquisition (life 1) + reform costs (attributed to life_number+1) + cost entries. cost/h total and without acquisition.
  partial flags: missing acquisition, open reform, reform without cost, life in progress.
- Corrections: POST /movements/{id}/correct keeps revisions; no hard deletes anywhere.

## Seed (python seed.py — resets data; relative to today)
11 components, 6 equipment. Key: CMP-MOT-3516E-001 = 4 lives (transfers 793F-014↔015, 3rd life early, 4th life in progress,
no target); CMP-TRN-793F-002 Atenção; CMP-DIF-793F-003 2nd life above target; CMP-CIL-R9200-004 external reform overdue;
CMP-CIL-R9200-005 internal reform in execution; CMP-CFN-SY750-006 awaiting reform; CMP-MOT-DC13-007 normal;
CMP-TRN-850K-008 new, no serial / no acquisition cost; CMP-MOT-D9512-009 LIBERADO, validation pending, reform without cost;
CMP-CFN-850K-010 hourmeter inconsistency, REMOVIDO; CMP-DIF-G500-011 reform REJECTED. SAP batches: PARCIAL horímetros,
PARCIAL custos (rejections + duplicate), SUCESSO materiais. Credentials: memory/test_credentials.md.

## Pages
/login, / (dashboard+filters+charts), /equipamentos, /componentes, /componentes/:id, /instalacao-remocao, /controle-vidas,
/reformas, /lcc-custos, /integracao-sap, /relatorios (12 reports, xlsx/pdf via /api/reports/{key}?format=), /administracao.
