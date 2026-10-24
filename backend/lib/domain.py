"""Pure business computations: life status, component summary, LCC. All read from a preloaded context."""

from collections import defaultdict
from datetime import date
from typing import Any, Optional

from lib.db import db

REFORM_OPEN = {"AGUARDANDO_ENVIO", "EM_EXECUCAO", "RETORNADO"}
COST_CATEGORIES = {
    "AQUISICAO": "Aquisição",
    "REFORMA_INTERNA": "Reforma interna (serviço)",
    "REFORMA_EXTERNA": "Reforma externa (serviço)",
    "MATERIAIS": "Materiais e peças",
    "MAO_DE_OBRA": "Mão de obra",
    "TRANSPORTE": "Transporte",
    "INSPECAO": "Inspeção e testes",
    "OUTROS": "Outros custos diretos",
    "SUBSTITUICAO": "Substituição",
}
REFORM_COST_FIELDS = [
    ("cost_service", None),  # category depends on reform type
    ("cost_materials", "MATERIAIS"),
    ("cost_labor", "MAO_DE_OBRA"),
    ("cost_transport", "TRANSPORTE"),
    ("cost_inspection", "INSPECAO"),
    ("cost_other", "OUTROS"),
]


def parse_date(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        return None


async def load_context() -> dict[str, Any]:
    fams = await db.families.find({}, {"_id": 0}).to_list(2000)
    eqs = await db.equipment.find({}, {"_id": 0}).to_list(5000)
    comps = await db.components.find({}, {"_id": 0}).to_list(10000)
    movs = await db.movements.find({}, {"_id": 0}).sort("install_date", 1).to_list(50000)
    lives = await db.lives.find({}, {"_id": 0}).to_list(50000)
    reforms = await db.reforms.find({}, {"_id": 0}).sort("created_at", 1).to_list(50000)
    costs = await db.cost_entries.find({}, {"_id": 0}).to_list(100000)
    ctx: dict[str, Any] = {
        "families": {f["id"]: f for f in fams},
        "equipment": {e["id"]: e for e in eqs},
        "components": comps,
        "movs": defaultdict(list),
        "lives": defaultdict(list),
        "reforms": defaultdict(list),
        "costs": defaultdict(list),
        "all_movs": movs,
        "all_reforms": reforms,
    }
    for m in movs:
        ctx["movs"][m["component_id"]].append(m)
    for lv in lives:
        ctx["lives"][lv["component_id"]].append(lv)
    for r in reforms:
        ctx["reforms"][r["component_id"]].append(r)
    for c in costs:
        ctx["costs"][c["component_id"]].append(c)
    return ctx


def target_for(family: Optional[dict], life: int) -> Optional[float]:
    if not family:
        return None
    t = (family.get("targets") or [None] * 4)
    return t[life - 1] if 0 < life <= len(t) else None


def life_status(hours: float, target: Optional[float], attention_pct: float) -> str:
    if target is None or target <= 0:
        return "META_NAO_DEFINIDA"
    pct = hours / target * 100
    if pct >= 100:
        return "ACIMA_META"
    if pct >= attention_pct:
        return "ATENCAO"
    return "NORMAL"


def running_hours(mov: dict, ctx: dict) -> float:
    eq = ctx["equipment"].get(mov["equipment_id"])
    if not eq:
        return 0.0
    return max(0.0, float(eq.get("hourmeter", 0)) - float(mov["install_hourmeter"]))


def life_hours(comp: dict, life: int, ctx: dict) -> tuple[float, float]:
    """(closed hours, running hours) for a given life."""
    closed = running = 0.0
    for m in ctx["movs"][comp["id"]]:
        if m["life_number"] != life:
            continue
        if m["status"] == "ENCERRADA":
            closed += float(m.get("hours_worked") or 0)
        else:
            running += running_hours(m, ctx)
    return closed, running


def reform_total(r: dict) -> Optional[float]:
    vals = [r.get(f) for f, _ in REFORM_COST_FIELDS if r.get(f) is not None]
    return sum(vals) if vals else None


def turnaround_days(r: dict) -> Optional[int]:
    start = parse_date(r.get("sent_date"))
    end = parse_date(r.get("return_date") if r["type"] == "EXTERNA" else (r.get("release_date") or r.get("service_end")))
    if start and end:
        return (end - start).days
    return None


def summarize(comp: dict, ctx: dict) -> dict:
    fam = ctx["families"].get(comp.get("family_id"))
    life = int(comp.get("current_life", 1))
    movs = ctx["movs"][comp["id"]]
    open_mov = next((m for m in movs if m["status"] == "ABERTA"), None)
    closed_movs = [m for m in movs if m["status"] == "ENCERRADA"]
    closed, running = life_hours(comp, life, ctx)
    hours = closed + running
    target = target_for(fam, life)
    att = float((fam or {}).get("attention_pct", 85))
    status = life_status(hours, target, att)
    pct = round(hours / target * 100, 1) if target else None
    total_hours = sum(float(m.get("hours_worked") or 0) for m in closed_movs) + (running_hours(open_mov, ctx) if open_mov else 0)

    alerts: list[str] = []
    if comp["status"] != "SUCATEADO":
        if life == 4:
            alerts.append("4ª vida em andamento — avaliar decisão de substituição")
        if comp["status"] != "INSTALADO":
            pass
        elif status == "ACIMA_META":
            alerts.append("Horas acima da meta da vida atual")
        elif status == "ATENCAO":
            alerts.append("Próximo da meta da vida atual")
    incomplete: list[str] = []
    if not comp.get("sap_code"):
        incomplete.append("Código SAP ausente")
    if not comp.get("serial"):
        incomplete.append("Número de série ausente")
    if comp.get("acquisition_cost") is None:
        incomplete.append("Custo de aquisição não informado")
    if not fam:
        incomplete.append("Família/meta não vinculada")
    if any(m.get("inconsistencies") for m in movs):
        incomplete.append("Movimentação com divergência de horímetro")

    validation_pending = (
        comp["status"] not in ("INSTALADO", "SUCATEADO")
        and any(m["life_number"] == life for m in closed_movs)
        and not any(lv["life_number"] == life for lv in ctx["lives"][comp["id"]])
    )
    last_rem = closed_movs[-1] if closed_movs else None
    last_inst = movs[-1] if movs else None
    return {
        **comp,
        "family_name": (fam or {}).get("name"),
        "current_equipment_tag": open_mov["equipment_tag"] if open_mov else None,
        "current_movement_id": open_mov["id"] if open_mov else None,
        "life_hours": round(hours, 1),
        "life_hours_running": round(running, 1),
        "life_target": target,
        "life_pct": pct,
        "life_status": status,
        "total_hours": round(total_hours, 1),
        "last_install_date": last_inst["install_date"] if last_inst else None,
        "last_install_hourmeter": last_inst["install_hourmeter"] if last_inst else None,
        "last_removal_date": last_rem["removal_date"] if last_rem else None,
        "last_removal_hourmeter": last_rem["removal_hourmeter"] if last_rem else None,
        "alerts": alerts,
        "incomplete": incomplete,
        "validation_pending": validation_pending,
    }


def lives_of(comp: dict, ctx: dict) -> list[dict]:
    fam = ctx["families"].get(comp.get("family_id"))
    att = float((fam or {}).get("attention_pct", 85))
    docs = {lv["life_number"]: lv for lv in ctx["lives"][comp["id"]]}
    lcc = lcc_of(comp, ctx)
    out = []
    for n in range(1, int(comp.get("current_life", 1)) + 1):
        closed, running = life_hours(comp, n, ctx)
        hours = closed + running
        doc = docs.get(n)
        target = doc["target"] if doc else target_for(fam, n)
        movs = [m for m in ctx["movs"][comp["id"]] if m["life_number"] == n]
        reforms = [r for r in ctx["reforms"][comp["id"]] if r["life_number"] == n]
        per = next((p for p in lcc["per_life"] if p["life_number"] == n), None)
        out.append({
            "life_number": n,
            "status": doc["status"] if doc else ("SUBSTITUIDO" if comp["status"] == "SUCATEADO" else "EM_ANDAMENTO"),
            "hours": round(hours, 1),
            "hours_running": round(running, 1),
            "target": target,
            "pct": round(hours / target * 100, 1) if target else None,
            "life_status": life_status(hours, target, att),
            "early": bool(doc and doc.get("early")),
            "early_reason": doc.get("early_reason") if doc else None,
            "decision": doc.get("decision") if doc else None,
            "started_at": movs[0]["install_date"] if movs else None,
            "ended_at": (doc or {}).get("validated_at", "")[:10] or None if doc else None,
            "validated_by": doc.get("validated_by") if doc else None,
            "validated_at": doc.get("validated_at") if doc else None,
            "notes": doc.get("notes") if doc else None,
            "movements_count": len(movs),
            "reforms_after": [{"id": r["id"], "type": r["type"], "status": r["status"]} for r in reforms],
            "cost": per["cost"] if per else 0,
            "cost_per_hour": per["cost_per_hour"] if per else None,
        })
    return out


def cost_items(comp: dict, ctx: dict) -> list[dict]:
    """Every registered cost tied to this physical component, with category, life and origin."""
    items: list[dict] = []
    if comp.get("acquisition_cost") is not None:
        items.append({"category": "AQUISICAO", "life_number": 1, "amount": float(comp["acquisition_cost"]),
                      "date": comp.get("acquisition_date"), "description": "Custo de aquisição",
                      "source": comp.get("source", "MANUAL"), "ref": comp["tag"]})
    for r in ctx["reforms"][comp["id"]]:
        target_life = min(4, int(r["life_number"]) + 1)  # reform cost belongs to the life it prepares
        for field, cat in REFORM_COST_FIELDS:
            v = r.get(field)
            if v is None:
                continue
            category = cat or ("REFORMA_INTERNA" if r["type"] == "INTERNA" else "REFORMA_EXTERNA")
            items.append({"category": category, "life_number": target_life, "amount": float(v),
                          "date": r.get("sent_date"), "description": f"Reforma {r['type'].lower()} {r.get('supplier') or ''}".strip(),
                          "source": "MANUAL", "ref": r["id"][:8]})
    for c in ctx["costs"][comp["id"]]:
        items.append({"category": c["category"], "life_number": int(c["life_number"]), "amount": float(c["amount"]),
                      "date": c.get("date"), "description": c.get("description") or "",
                      "source": c.get("source", "MANUAL"), "ref": c.get("sap_document") or c["id"][:8]})
    return items


def lcc_of(comp: dict, ctx: dict) -> dict:
    items = cost_items(comp, ctx)
    by_cat: dict[str, float] = defaultdict(float)
    for it in items:
        by_cat[it["category"]] += it["amount"]
    acquisition = by_cat.get("AQUISICAO", 0.0)
    total = sum(by_cat.values())
    reform_scope = total - acquisition
    hours_total = 0.0
    per_life = []
    life_n = int(comp.get("current_life", 1))
    for n in range(1, life_n + 1):
        closed, running = life_hours(comp, n, ctx)
        h = closed + running
        hours_total += h
        cost = sum(it["amount"] for it in items if it["life_number"] == n)
        per_life.append({"life_number": n, "hours": round(h, 1), "cost": round(cost, 2),
                         "cost_per_hour": round(cost / h, 2) if h > 0 else None,
                         "in_progress": n == life_n and comp["status"] != "SUCATEADO"})
    flags: list[str] = []
    if comp.get("acquisition_cost") is None:
        flags.append("Custo de aquisição não informado")
    for r in ctx["reforms"][comp["id"]]:
        if r["status"] in REFORM_OPEN:
            flags.append(f"Reforma {r['type'].lower()} em andamento — custos podem não estar completos")
        elif reform_total(r) is None:
            flags.append(f"Reforma {r['type'].lower()} concluída sem custo registrado")
    if comp["status"] != "SUCATEADO":
        flags.append("Vida atual em andamento — horas e custos parciais")
    return {
        "component_id": comp["id"],
        "by_category": [{"category": k, "label": COST_CATEGORIES.get(k, k), "amount": round(v, 2)} for k, v in by_cat.items()],
        "acquisition_cost": round(acquisition, 2),
        "reform_and_other_cost": round(reform_scope, 2),
        "total_cost": round(total, 2),
        "hours_total": round(hours_total, 1),
        "cost_per_hour_total": round(total / hours_total, 2) if hours_total > 0 else None,
        "cost_per_hour_reform": round(reform_scope / hours_total, 2) if hours_total > 0 else None,
        "current_life_cost": per_life[-1]["cost"] if per_life else 0,
        "per_life": per_life,
        "items": items,
        "partial": bool(flags),
        "partial_reasons": flags,
    }
