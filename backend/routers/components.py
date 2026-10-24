import re

from fastapi import APIRouter, Depends, HTTPException

from lib.audit import audit, now_iso
from lib.auth import current_user, require
from lib.db import db
from lib.domain import lcc_of, lives_of, load_context, summarize
from lib.services import validate_life
from models.schemas import (Component, ComponentIn, ComponentView, CostEntry, CostIn, LccView, LifeValidateIn, LifeView,
                            new_id)
from routers.catalog import _uniq

router = APIRouter()


def match(v: dict, q: str | None, status: str | None, family_id: str | None, life: int | None,
          manufacturer: str | None, equipment: str | None, model: str | None) -> bool:
    if q:
        ql = q.lower()
        fields = [v.get(k) or "" for k in ("tag", "sap_code", "pn", "description", "serial", "model", "current_equipment_tag", "location")]
        if not any(ql in str(f).lower() for f in fields):
            return False
    if status and v["status"] != status:
        return False
    if family_id and v.get("family_id") != family_id:
        return False
    if life and int(v["current_life"]) != life:
        return False
    if manufacturer and v["manufacturer"] != manufacturer:
        return False
    if model and model.lower() not in (v.get("model") or "").lower():
        return False
    if equipment and equipment.lower() not in (v.get("current_equipment_tag") or "").lower() \
            and equipment.lower() not in (v.get("compatible_equipment") or "").lower():
        return False
    return True


@router.get("/components", response_model=list[ComponentView])
async def list_components(q: str | None = None, status: str | None = None, family_id: str | None = None,
                          life: int | None = None, manufacturer: str | None = None, equipment: str | None = None,
                          model: str | None = None, life_status: str | None = None, _: dict = Depends(current_user)):
    ctx = await load_context()
    out = []
    for c in sorted(ctx["components"], key=lambda x: x["tag"]):
        v = summarize(c, ctx)
        if match(v, q, status, family_id, life, manufacturer, equipment, model) and (not life_status or v["life_status"] == life_status):
            out.append(v)
    return out


@router.get("/components/{cid}", response_model=ComponentView)
async def get_component(cid: str, _: dict = Depends(current_user)):
    ctx = await load_context()
    c = next((x for x in ctx["components"] if x["id"] == cid), None)
    if not c:
        raise HTTPException(404, "Componente não encontrado")
    return summarize(c, ctx)


@router.post("/components", response_model=Component)
async def create_component(body: ComponentIn, user: dict = Depends(require("cadastro"))):
    await _uniq("components", "tag", body.tag, label="TAG de componente")
    await _uniq("components", "serial", body.serial, label="Nº de série de componente")
    if await db.equipment.find_one({"tag": {"$regex": f"^{re.escape(body.tag)}$", "$options": "i"}}):
        raise HTTPException(409, "TAG informada pertence a um EQUIPAMENTO — a TAG do componente deve ser distinta")
    if body.sap_code and body.sap_code.strip().lower() == body.tag.strip().lower():
        raise HTTPException(422, "Código SAP (material) não pode ser igual à TAG do componente")
    if body.family_id and not await db.families.find_one({"id": body.family_id}):
        raise HTTPException(422, "Família não encontrada")
    c = Component(**body.model_dump(), created_at=now_iso(), created_by=user["name"], updated_at=now_iso())
    await db.components.insert_one(c.model_dump())
    await audit(user, "INCLUSAO", "componente", c.id, f"Componente {c.tag} (SAP {c.sap_code or '—'}) cadastrado")
    return c


@router.put("/components/{cid}", response_model=Component)
async def update_component(cid: str, body: ComponentIn, user: dict = Depends(require("cadastro"))):
    old = await db.components.find_one({"id": cid}, {"_id": 0})
    if not old:
        raise HTTPException(404, "Componente não encontrado")
    await _uniq("components", "tag", body.tag, cid, "TAG de componente")
    await _uniq("components", "serial", body.serial, cid, "Nº de série de componente")
    upd = body.model_dump()
    upd["location"] = old["location"]  # location is driven by movements/reforms
    upd["updated_at"] = now_iso()
    await db.components.update_one({"id": cid}, {"$set": upd})
    if body.tag != old["tag"]:
        await db.movements.update_many({"component_id": cid}, {"$set": {"component_tag": body.tag}})
        await db.reforms.update_many({"component_id": cid}, {"$set": {"component_tag": body.tag}})
    changed = {k: v for k, v in upd.items() if old.get(k) != v and k != "updated_at"}
    await audit(user, "ALTERACAO", "componente", cid, f"Componente {body.tag} alterado: {', '.join(changed) or 'sem mudanças'}",
                before={k: old.get(k) for k in changed}, after=changed)
    return Component(**{**old, **upd})


@router.get("/components/{cid}/lives", response_model=list[LifeView])
async def component_lives(cid: str, _: dict = Depends(current_user)):
    ctx = await load_context()
    c = next((x for x in ctx["components"] if x["id"] == cid), None)
    if not c:
        raise HTTPException(404, "Componente não encontrado")
    return lives_of(c, ctx)


@router.post("/components/{cid}/lives/validate", response_model=LifeView)
async def validate(cid: str, body: LifeValidateIn, user: dict = Depends(require("validar_vida"))):
    doc = await validate_life(cid, body.model_dump(), user)
    ctx = await load_context()
    c = next(x for x in ctx["components"] if x["id"] == cid)
    return next(lv for lv in lives_of(c, ctx) if lv["life_number"] == doc["life_number"])


@router.get("/components/{cid}/history")
async def component_history(cid: str, _: dict = Depends(current_user)) -> list[dict]:
    """Chronological event timeline of one physical component."""
    c = await db.components.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Componente não encontrado")
    return await build_history(c)


async def build_history(c: dict) -> list[dict]:
    ev: list[dict] = [{"date": (c.get("created_at") or "")[:10], "life": 1, "type": "CADASTRO",
                       "text": f"Cadastro do componente (origem {c.get('source', 'MANUAL')})", "by": c.get("created_by")}]
    for m in await db.movements.find({"component_id": c["id"]}, {"_id": 0}).to_list(1000):
        ev.append({"date": m["install_date"], "life": m["life_number"], "type": "INSTALACAO",
                   "text": f"Instalado em {m['equipment_tag']} · horímetro {m['install_hourmeter']:.0f} h · OM {m.get('install_om') or '—'}",
                   "by": m["install_responsible"]})
        if m["status"] == "ENCERRADA":
            extra = " · REMOÇÃO ANTECIPADA" if m.get("early_removal") else ""
            ev.append({"date": m["removal_date"], "life": m["life_number"], "type": "REMOCAO",
                       "text": f"Removido de {m['equipment_tag']} · horímetro {m['removal_hourmeter']:.0f} h · {m['hours_worked']:.0f} h trabalhadas · motivo: {m['removal_reason']}{extra}",
                       "by": m.get("removal_responsible")})
    for r in await db.reforms.find({"component_id": c["id"]}, {"_id": 0}).to_list(1000):
        if r.get("sent_date"):
            ev.append({"date": r["sent_date"], "life": r["life_number"], "type": "REFORMA_ENVIO",
                       "text": f"Enviado para reforma {r['type'].lower()} {r.get('supplier') or ''}".strip(), "by": r.get("created_by")})
        if r.get("release_date") and r["status"] in ("CONCLUIDO", "REPROVADO"):
            ev.append({"date": r["release_date"], "life": r["life_number"], "type": "REFORMA_CONCLUSAO",
                       "text": f"Reforma {r['status'].lower()} · inspeção: {r.get('inspection_result')}", "by": r.get("concluded_by")})
    for lv in await db.lives.find({"component_id": c["id"]}, {"_id": 0}).to_list(10):
        dec = "avanço para próxima vida" if lv["decision"] == "AVANCAR" else "substituição do componente"
        early = f" · antecipada: {lv['early_reason']}" if lv.get("early") else ""
        ev.append({"date": lv["validated_at"][:10], "life": lv["life_number"], "type": "VALIDACAO_VIDA",
                   "text": f"Vida {lv['life_number']} encerrada com {lv['hours']:.0f} h (meta {lv['target'] or 'não definida'}) — {dec}{early}",
                   "by": lv["validated_by"]})
    order = {"CADASTRO": 0, "REMOCAO": 1, "VALIDACAO_VIDA": 2, "REFORMA_ENVIO": 3, "REFORMA_CONCLUSAO": 4, "INSTALACAO": 5}
    ev.sort(key=lambda e: (e["date"] or "", order[e["type"]]))
    return ev


# ---------- LCC / costs ----------
@router.get("/lcc", response_model=list[LccView])
async def lcc_all(family_id: str | None = None, model: str | None = None, q: str | None = None, _: dict = Depends(current_user)):
    ctx = await load_context()
    out = []
    for c in ctx["components"]:
        if family_id and c.get("family_id") != family_id:
            continue
        if model and model.lower() not in c["model"].lower():
            continue
        if q and q.lower() not in f"{c['tag']} {c.get('sap_code')} {c.get('pn')} {c.get('serial')}".lower():
            continue
        out.append(_lcc_view(c, ctx))
    return sorted(out, key=lambda x: x["component_tag"])


def _lcc_view(c: dict, ctx: dict) -> dict:
    fam = ctx["families"].get(c.get("family_id")) or {}
    return {**lcc_of(c, ctx), "component_tag": c["tag"], "description": c["description"], "family_name": fam.get("name"),
            "model": c["model"], "current_life": c["current_life"]}


@router.get("/components/{cid}/lcc", response_model=LccView)
async def lcc_one(cid: str, _: dict = Depends(current_user)):
    ctx = await load_context()
    c = next((x for x in ctx["components"] if x["id"] == cid), None)
    if not c:
        raise HTTPException(404, "Componente não encontrado")
    return _lcc_view(c, ctx)


@router.get("/costs", response_model=list[CostEntry])
async def list_costs(component_id: str | None = None, _: dict = Depends(current_user)):
    flt = {"component_id": component_id} if component_id else {}
    return await db.cost_entries.find(flt, {"_id": 0}).sort("date", -1).to_list(5000)


@router.post("/costs", response_model=CostEntry)
async def create_cost(body: CostIn, user: dict = Depends(require("custos"))):
    c = await db.components.find_one({"id": body.component_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Componente não encontrado")
    if body.life_number > int(c["current_life"]):
        raise HTTPException(422, f"Vida {body.life_number} ainda não iniciada (vida atual {c['current_life']})")
    if body.category == "AQUISICAO":
        raise HTTPException(422, "Custo de aquisição é registrado no cadastro do componente")
    if body.sap_document and await db.cost_entries.find_one({"sap_document": body.sap_document, "component_id": body.component_id, "category": body.category}):
        raise HTTPException(409, "Duplicidade: documento já lançado para este componente e categoria")
    e = CostEntry(**body.model_dump(), id=new_id(), source="MANUAL", created_at=now_iso(), created_by=user["name"])
    await db.cost_entries.insert_one(e.model_dump())
    await audit(user, "INCLUSAO", "custo", e.id, f"Custo {body.category} R$ {body.amount:.2f} em {c['tag']} (vida {body.life_number})")
    return e
