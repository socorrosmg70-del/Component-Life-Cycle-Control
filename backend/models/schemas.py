"""Pydantic v2 request/response models. Mirrored by hand in frontend/src/lib/types.ts."""

import uuid
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


def new_id() -> str:
    return str(uuid.uuid4())


# ---------- auth / users ----------
class LoginIn(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: str
    role_label: str
    active: bool = True
    permissions: list[str] = []


class UserCreate(BaseModel):
    name: str = Field(min_length=2)
    email: str = Field(min_length=5)
    password: str = Field(min_length=6)
    role: Literal["admin", "pcm", "engenharia", "oficina", "consulta", "gestor"]


class UserPatch(BaseModel):
    role: Optional[Literal["admin", "pcm", "engenharia", "oficina", "consulta", "gestor"]] = None
    active: Optional[bool] = None


# ---------- catalog ----------
class ManufacturerIn(BaseModel):
    name: str = Field(min_length=2)


class Manufacturer(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    active: bool = True
    created_at: Optional[str] = None


class FamilyIn(BaseModel):
    name: str = Field(min_length=2)
    component_type: str = Field(min_length=2)
    targets: list[Optional[float]] = Field(min_length=4, max_length=4)
    attention_pct: float = Field(default=85, ge=50, le=100)
    notes: Optional[str] = None


class Family(FamilyIn):
    id: str = Field(default_factory=new_id)
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None


EquipmentStatus = Literal["OPERANDO", "MANUTENCAO", "PARADO", "INATIVO"]


class EquipmentIn(BaseModel):
    tag: str = Field(min_length=2)
    manufacturer: str = Field(min_length=2)
    model: str = Field(min_length=1)
    serial: Optional[str] = None
    equipment_type: str = Field(min_length=2)
    area: str = Field(min_length=2)
    hourmeter: float = Field(ge=0)
    status: EquipmentStatus = "OPERANDO"
    cost_center: Optional[str] = None


class Equipment(EquipmentIn):
    id: str = Field(default_factory=new_id)
    hourmeter_updated_at: Optional[str] = None
    source: str = "MANUAL"
    created_at: Optional[str] = None
    created_by: Optional[str] = None
    installed_components: int = 0


class HourmeterIn(BaseModel):
    hourmeter: float = Field(ge=0)
    date: str
    notes: Optional[str] = None


# ---------- components ----------
ComponentStatus = Literal[
    "LIBERADO", "INSTALADO", "REMOVIDO", "AGUARDANDO_REFORMA", "REFORMA_INTERNA", "REFORMA_EXTERNA", "SUCATEADO"
]


class ComponentIn(BaseModel):
    tag: str = Field(min_length=2)
    description: str = Field(min_length=2)
    sap_code: Optional[str] = None
    pn: Optional[str] = None
    serial: Optional[str] = None
    manufacturer: str = Field(min_length=2)
    model: str = Field(min_length=1)
    family_id: Optional[str] = None
    compatible_equipment: Optional[str] = None
    location: str = "Almoxarifado"
    acquisition_cost: Optional[float] = Field(default=None, ge=0)
    acquisition_date: Optional[str] = None
    responsible: str = Field(min_length=2)
    notes: Optional[str] = None


class Component(ComponentIn):
    id: str = Field(default_factory=new_id)
    status: ComponentStatus = "LIBERADO"
    current_life: int = 1
    source: str = "MANUAL"
    created_at: Optional[str] = None
    created_by: Optional[str] = None
    updated_at: Optional[str] = None


class ComponentView(Component):
    family_name: Optional[str] = None
    current_equipment_tag: Optional[str] = None
    current_movement_id: Optional[str] = None
    life_hours: float = 0
    life_hours_running: float = 0
    life_target: Optional[float] = None
    life_pct: Optional[float] = None
    life_status: str = "NORMAL"
    total_hours: float = 0
    last_install_date: Optional[str] = None
    last_install_hourmeter: Optional[float] = None
    last_removal_date: Optional[str] = None
    last_removal_hourmeter: Optional[float] = None
    alerts: list[str] = []
    incomplete: list[str] = []
    validation_pending: bool = False


# ---------- movements ----------
class InstallIn(BaseModel):
    component_id: str
    equipment_id: str
    install_date: str
    install_hourmeter: float = Field(ge=0)
    install_om: Optional[str] = None
    responsible: str = Field(min_length=2)
    notes: Optional[str] = None


class RemoveIn(BaseModel):
    removal_date: str
    removal_hourmeter: float = Field(ge=0)
    removal_reason: str = Field(min_length=3)
    removal_om: Optional[str] = None
    condition: str = Field(min_length=2)
    destination: str = Field(min_length=2)
    reform_type: Literal["INTERNA", "EXTERNA", "SEM_REFORMA"]
    reform_company: Optional[str] = None
    reform_cost: Optional[float] = Field(default=None, ge=0)
    responsible: str = Field(min_length=2)
    notes: Optional[str] = None


class MovementCorrectIn(BaseModel):
    install_date: Optional[str] = None
    install_hourmeter: Optional[float] = Field(default=None, ge=0)
    removal_date: Optional[str] = None
    removal_hourmeter: Optional[float] = Field(default=None, ge=0)
    reason: str = Field(min_length=5)


class Movement(BaseModel):
    id: str
    component_id: str
    component_tag: str
    component_serial: Optional[str] = None
    equipment_id: str
    equipment_tag: str
    life_number: int
    status: Literal["ABERTA", "ENCERRADA"]
    install_date: str
    install_hourmeter: float
    install_om: Optional[str] = None
    install_responsible: str
    install_notes: Optional[str] = None
    removal_date: Optional[str] = None
    removal_hourmeter: Optional[float] = None
    removal_reason: Optional[str] = None
    removal_om: Optional[str] = None
    condition: Optional[str] = None
    destination: Optional[str] = None
    reform_type: Optional[str] = None
    reform_company: Optional[str] = None
    reform_cost: Optional[float] = None
    removal_responsible: Optional[str] = None
    removal_notes: Optional[str] = None
    hours_worked: Optional[float] = None
    running_hours: Optional[float] = None
    early_removal: bool = False
    inconsistencies: list[str] = []
    revisions: list[dict[str, Any]] = []
    source: str = "MANUAL"
    created_at: str
    created_by: str
    closed_at: Optional[str] = None
    closed_by: Optional[str] = None


# ---------- lives ----------
class LifeValidateIn(BaseModel):
    decision: Literal["AVANCAR", "SUBSTITUIR"]
    condition_ok: bool
    early_reason: Optional[str] = None
    notes: Optional[str] = None


class LifeView(BaseModel):
    life_number: int
    status: str
    hours: float
    hours_running: float
    target: Optional[float] = None
    pct: Optional[float] = None
    life_status: str
    early: bool = False
    early_reason: Optional[str] = None
    decision: Optional[str] = None
    started_at: Optional[str] = None
    ended_at: Optional[str] = None
    validated_by: Optional[str] = None
    validated_at: Optional[str] = None
    notes: Optional[str] = None
    movements_count: int = 0
    reforms_after: list[dict[str, Any]] = []
    cost: float = 0
    cost_per_hour: Optional[float] = None


# ---------- reforms ----------
class ReformCreateIn(BaseModel):
    component_id: str
    type: Literal["INTERNA", "EXTERNA"]
    supplier: Optional[str] = None
    notes: Optional[str] = None


class ReformPatch(BaseModel):
    supplier: Optional[str] = None
    sap_reference: Optional[str] = None
    shipping_doc: Optional[str] = None
    sent_date: Optional[str] = None
    workshop_entry_date: Optional[str] = None
    service_start: Optional[str] = None
    service_end: Optional[str] = None
    return_date: Optional[str] = None
    deadline_days: Optional[int] = Field(default=None, ge=0)
    service_type: Optional[str] = None
    materials: Optional[str] = None
    labor_hours: Optional[float] = Field(default=None, ge=0)
    technician: Optional[str] = None
    warranty: Optional[str] = None
    supplier_report: Optional[str] = None
    inspection_result: Optional[str] = None
    cost_service: Optional[float] = Field(default=None, ge=0)
    cost_materials: Optional[float] = Field(default=None, ge=0)
    cost_labor: Optional[float] = Field(default=None, ge=0)
    cost_transport: Optional[float] = Field(default=None, ge=0)
    cost_inspection: Optional[float] = Field(default=None, ge=0)
    cost_other: Optional[float] = Field(default=None, ge=0)
    notes: Optional[str] = None


class ReformConcludeIn(BaseModel):
    approved: bool
    inspection_result: str = Field(min_length=3)
    release_date: str
    new_condition: str = Field(min_length=2)


class Reform(ReformPatch):
    id: str
    component_id: str
    component_tag: str
    movement_id: Optional[str] = None
    life_number: int
    type: Literal["INTERNA", "EXTERNA"]
    status: str
    approved: Optional[bool] = None
    release_date: Optional[str] = None
    new_condition: Optional[str] = None
    total_cost: Optional[float] = None
    turnaround_days: Optional[int] = None
    next_life_hours: Optional[float] = None
    created_at: str
    created_by: str
    concluded_at: Optional[str] = None
    concluded_by: Optional[str] = None


# ---------- costs / LCC ----------
CostCategory = Literal[
    "AQUISICAO", "REFORMA_INTERNA", "REFORMA_EXTERNA", "MATERIAIS", "MAO_DE_OBRA", "TRANSPORTE", "INSPECAO", "OUTROS",
    "SUBSTITUICAO",
]


class CostIn(BaseModel):
    component_id: str
    life_number: int = Field(ge=1, le=4)
    category: CostCategory
    amount: float = Field(gt=0)
    date: str
    description: Optional[str] = None
    sap_document: Optional[str] = None


class CostEntry(CostIn):
    id: str
    source: str = "MANUAL"
    created_at: str
    created_by: str


class LccView(BaseModel):
    component_id: str
    component_tag: Optional[str] = None
    description: Optional[str] = None
    family_name: Optional[str] = None
    model: Optional[str] = None
    current_life: Optional[int] = None
    by_category: list[dict[str, Any]]
    acquisition_cost: float
    reform_and_other_cost: float
    total_cost: float
    hours_total: float
    cost_per_hour_total: Optional[float] = None
    cost_per_hour_reform: Optional[float] = None
    current_life_cost: float
    per_life: list[dict[str, Any]]
    items: list[dict[str, Any]]
    partial: bool
    partial_reasons: list[str]


# ---------- SAP ----------
class SapBatch(BaseModel):
    id: str
    started_at: str
    finished_at: Optional[str] = None
    source: str
    entity: str
    file_name: Optional[str] = None
    total: int = 0
    imported: int = 0
    rejected: int = 0
    duplicates: int = 0
    status: str
    errors: list[dict[str, Any]] = []
    user_name: str
    reprocess_of: Optional[str] = None
    reprocessed: bool = False


class SapStatus(BaseModel):
    mode: str
    api_configured: bool
    last_sync_at: Optional[str] = None
    last_status: Optional[str] = None
    total_batches: int
    pending_rejections: int
    sap_records: int
    manual_records: int


# ---------- misc ----------
class AuditEntry(BaseModel):
    id: str
    at: str
    user_name: str
    user_role: str
    action: str
    entity: str
    entity_id: str
    summary: str
    before: Any = None
    after: Any = None


class SearchHit(BaseModel):
    kind: Literal["equipamento", "componente"]
    id: str
    tag: str
    label: str
    sub: str


class Dashboard(BaseModel):
    kpis: dict[str, Any]
    avg_hours_by_life: list[dict[str, Any]]
    cost_by_life: list[dict[str, Any]]
    hours_trend: list[dict[str, Any]]
    cost_per_hour_ranking: list[dict[str, Any]]
    family_comparison: list[dict[str, Any]]
    reform_comparison: list[dict[str, Any]]
    attention_list: list[dict[str, Any]]
    filter_options: dict[str, Any]


class ReportData(BaseModel):
    key: str
    title: str
    columns: list[dict[str, str]]
    rows: list[dict[str, Any]]
    generated_at: str
