// Hand-written mirrors of backend/models/schemas.py — keep in sync.

export type Role = "admin" | "pcm" | "engenharia" | "oficina" | "consulta" | "gestor";
export type Perm =
  | "cadastro" | "movimentacao" | "validar_vida" | "reforma" | "concluir_reforma" | "custos"
  | "sap" | "metas" | "correcao" | "usuarios" | "auditoria";

export interface UserOut {
  id: string; name: string; email: string; role: Role; role_label: string; active: boolean; permissions: Perm[];
}
export interface UserCreate { name: string; email: string; password: string; role: Role }

export interface Manufacturer { id: string; name: string; active: boolean; created_at: string | null }
export interface FamilyIn {
  name: string; component_type: string; targets: (number | null)[]; attention_pct: number; notes: string | null;
}
export interface Family extends FamilyIn { id: string; updated_at: string | null; updated_by: string | null }

export type EquipmentStatus = "OPERANDO" | "MANUTENCAO" | "PARADO" | "INATIVO";
export interface EquipmentIn {
  tag: string; manufacturer: string; model: string; serial: string | null; equipment_type: string; area: string;
  hourmeter: number; status: EquipmentStatus; cost_center: string | null;
}
export interface Equipment extends EquipmentIn {
  id: string; hourmeter_updated_at: string | null; source: string; created_at: string | null; created_by: string | null;
  installed_components: number;
}

export type ComponentStatus =
  | "LIBERADO" | "INSTALADO" | "REMOVIDO" | "AGUARDANDO_REFORMA" | "REFORMA_INTERNA" | "REFORMA_EXTERNA" | "SUCATEADO";
export type LifeStatus = "NORMAL" | "ATENCAO" | "ACIMA_META" | "META_NAO_DEFINIDA";

export interface ComponentIn {
  tag: string; description: string; sap_code: string | null; pn: string | null; serial: string | null;
  manufacturer: string; model: string; family_id: string | null; compatible_equipment: string | null; location: string;
  acquisition_cost: number | null; acquisition_date: string | null; responsible: string; notes: string | null;
}
export interface Component extends ComponentIn {
  id: string; status: ComponentStatus; current_life: number; source: string; created_at: string | null;
  created_by: string | null; updated_at: string | null;
}
export interface ComponentView extends Component {
  family_name: string | null; current_equipment_tag: string | null; current_movement_id: string | null;
  life_hours: number; life_hours_running: number; life_target: number | null; life_pct: number | null;
  life_status: LifeStatus; total_hours: number; last_install_date: string | null; last_install_hourmeter: number | null;
  last_removal_date: string | null; last_removal_hourmeter: number | null; alerts: string[]; incomplete: string[];
  validation_pending: boolean;
}

export interface InstallIn {
  component_id: string; equipment_id: string; install_date: string; install_hourmeter: number;
  install_om: string | null; responsible: string; notes: string | null;
}
export type ReformType = "INTERNA" | "EXTERNA" | "SEM_REFORMA";
export interface RemoveIn {
  removal_date: string; removal_hourmeter: number; removal_reason: string; removal_om: string | null; condition: string;
  destination: string; reform_type: ReformType; reform_company: string | null; reform_cost: number | null;
  responsible: string; notes: string | null;
}
export interface MovementCorrectIn {
  install_date?: string; install_hourmeter?: number; removal_date?: string; removal_hourmeter?: number; reason: string;
}
export interface Revision { at: string; by: string; reason: string; before: Record<string, unknown> }
export interface Movement {
  id: string; component_id: string; component_tag: string; component_serial: string | null; equipment_id: string;
  equipment_tag: string; life_number: number; status: "ABERTA" | "ENCERRADA"; install_date: string;
  install_hourmeter: number; install_om: string | null; install_responsible: string; install_notes: string | null;
  removal_date: string | null; removal_hourmeter: number | null; removal_reason: string | null; removal_om: string | null;
  condition: string | null; destination: string | null; reform_type: string | null; reform_company: string | null;
  reform_cost: number | null; removal_responsible: string | null; removal_notes: string | null;
  hours_worked: number | null; running_hours: number | null; early_removal: boolean; inconsistencies: string[];
  revisions: Revision[]; source: string; created_at: string; created_by: string; closed_at: string | null;
  closed_by: string | null;
}

export interface LifeValidateIn {
  decision: "AVANCAR" | "SUBSTITUIR"; condition_ok: boolean; early_reason: string | null; notes: string | null;
}
export interface LifeView {
  life_number: number; status: string; hours: number; hours_running: number; target: number | null; pct: number | null;
  life_status: LifeStatus; early: boolean; early_reason: string | null; decision: string | null;
  started_at: string | null; ended_at: string | null; validated_by: string | null; validated_at: string | null;
  notes: string | null; movements_count: number; reforms_after: { id: string; type: string; status: string }[];
  cost: number; cost_per_hour: number | null;
}

export interface ReformCreateIn { component_id: string; type: "INTERNA" | "EXTERNA"; supplier: string | null; notes: string | null }
export interface ReformPatch {
  supplier?: string | null; sap_reference?: string | null; shipping_doc?: string | null; sent_date?: string | null;
  workshop_entry_date?: string | null; service_start?: string | null; service_end?: string | null;
  return_date?: string | null; deadline_days?: number | null; service_type?: string | null; materials?: string | null;
  labor_hours?: number | null; technician?: string | null; warranty?: string | null; supplier_report?: string | null;
  inspection_result?: string | null; cost_service?: number | null; cost_materials?: number | null;
  cost_labor?: number | null; cost_transport?: number | null; cost_inspection?: number | null;
  cost_other?: number | null; notes?: string | null;
}
export interface ReformConcludeIn { approved: boolean; inspection_result: string; release_date: string; new_condition: string }
export interface Reform extends ReformPatch {
  id: string; component_id: string; component_tag: string; movement_id: string | null; life_number: number;
  type: "INTERNA" | "EXTERNA"; status: string; approved: boolean | null; release_date: string | null;
  new_condition: string | null; total_cost: number | null; turnaround_days: number | null;
  next_life_hours: number | null; created_at: string; created_by: string; concluded_at: string | null;
  concluded_by: string | null;
}

export type CostCategory =
  | "AQUISICAO" | "REFORMA_INTERNA" | "REFORMA_EXTERNA" | "MATERIAIS" | "MAO_DE_OBRA" | "TRANSPORTE" | "INSPECAO"
  | "OUTROS" | "SUBSTITUICAO";
export interface CostIn {
  component_id: string; life_number: number; category: CostCategory; amount: number; date: string;
  description: string | null; sap_document: string | null;
}
export interface CostEntry extends CostIn { id: string; source: string; created_at: string; created_by: string }
export interface CostItem {
  category: CostCategory; life_number: number; amount: number; date: string | null; description: string;
  source: string; ref: string;
}
export interface PerLife { life_number: number; hours: number; cost: number; cost_per_hour: number | null; in_progress: boolean }
export interface LccView {
  component_id: string; component_tag: string | null; description: string | null; family_name: string | null;
  model: string | null; current_life: number | null;
  by_category: { category: CostCategory; label: string; amount: number }[];
  acquisition_cost: number; reform_and_other_cost: number; total_cost: number; hours_total: number;
  cost_per_hour_total: number | null; cost_per_hour_reform: number | null; current_life_cost: number;
  per_life: PerLife[]; items: CostItem[]; partial: boolean; partial_reasons: string[];
}

export interface SapError { row: number; kind: string; message: string; data: Record<string, unknown> }
export interface SapBatch {
  id: string; started_at: string; finished_at: string | null; source: string; entity: string; file_name: string | null;
  total: number; imported: number; rejected: number; duplicates: number; status: string; errors: SapError[];
  user_name: string; reprocess_of: string | null; reprocessed: boolean;
}
export interface SapStatus {
  mode: string; api_configured: boolean; last_sync_at: string | null; last_status: string | null; total_batches: number;
  pending_rejections: number; sap_records: number; manual_records: number;
}

export interface AuditEntry {
  id: string; at: string; user_name: string; user_role: string; action: string; entity: string; entity_id: string;
  summary: string; before: unknown; after: unknown;
}
export interface SearchHit { kind: "equipamento" | "componente"; id: string; tag: string; label: string; sub: string }
export interface HistoryEvent { date: string; life: number; type: string; text: string; by: string | null }

export interface DashboardKpis {
  total: number; installed: number; removed: number; awaiting_reform: number; reform_internal: number;
  reform_external: number; released: number; scrapped: number; near_target: number; above_target: number;
  fourth_life: number; incomplete: number; validation_pending: number; reform_cost_total: number; lcc_total: number;
  avg_cost_per_hour: number | null; cost_partial: boolean; hours_total: number;
}
export interface ReformComparison {
  type: string; label: string; count: number; concluded: number; in_progress: number; rejected: number;
  avg_cost: number | null; avg_turnaround_days: number | null; avg_next_life_hours: number | null;
}
export interface Dashboard {
  kpis: DashboardKpis;
  avg_hours_by_life: { life: string; avg_hours: number | null; closed: number }[];
  cost_by_life: { life: string; cost: number }[];
  hours_trend: { month: string; hours: number }[];
  cost_per_hour_ranking: { tag: string; family: string; cost_per_hour: number; partial: boolean }[];
  family_comparison: { family: string; components: number; avg_cost_per_hour: number | null; avg_hours: number | null }[];
  reform_comparison: ReformComparison[];
  attention_list: { id: string; tag: string; description: string; life: number; life_pct: number | null; life_status: LifeStatus; alerts: string[]; equipment: string | null }[];
  filter_options: { manufacturers: string[]; models: string[]; equipment: string[]; families: { id: string; name: string }[]; suppliers: string[] };
}
export interface ReportData {
  key: string; title: string; columns: { key: string; label: string }[]; rows: Record<string, unknown>[]; generated_at: string;
}
