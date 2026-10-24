import re

from fastapi import APIRouter, Depends, HTTPException

from lib.audit import audit, now_iso
from lib.auth import current_user, require
from lib.db import db
from lib.domain import parse_date
from models.schemas import Equipment, EquipmentIn, HourmeterIn, SearchHit

router = APIRouter()


async def _uniq(coll: str, field: str, value: str | None, exclude_id: str | None = None, label: str = "") -> None:
    if not value:
        return
    flt: dict = {field: {"$regex": f"^{re.escape(value.strip())}$", "$options": "i"}}
    if exclude_id:
        flt["id"] = {"$ne": exclude_id}
    if await db[coll].find_one(flt):
        raise HTTPException(409, f"Duplicidade: {label} '{value}' já cadastrado")


@router.get("/equipment", response_model=list[Equipment])
async def list_equipment(q: str | None = None, manufacturer: str | None = None, status: str | None = None,
                         _: dict = Depends(current_user)):
    flt: dict = {}
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        flt["$or"] = [{"tag": rx}, {"model": rx}, {"serial": rx}, {"area": rx}, {"equipment_type": rx}]
    if manufacturer:
        flt["manufacturer"] = manufacturer
    if status:
        flt["status"] = status
    eqs = await db.equipment.find(flt, {"_id": 0}).sort("tag", 1).to_list(5000)
    counts: dict[str, int] = {}
    async for m in db.movements.find({"status": "ABERTA"}, {"equipment_id": 1}):
        counts[m["equipment_id"]] = counts.get(m["equipment_id"], 0) + 1
    return [Equipment(**e, installed_components=counts.get(e["id"], 0)) for e in eqs]


@router.post("/equipment", response_model=Equipment)
async def create_equipment(body: EquipmentIn, user: dict = Depends(require("cadastro"))):
    await _uniq("equipment", "tag", body.tag, label="TAG de equipamento")
    await _uniq("equipment", "serial", body.serial, label="Nº de série de equipamento")
    if not await db.manufacturers.find_one({"name": body.manufacturer}):
        raise HTTPException(422, "Fabricante não cadastrado — cadastre em Administração")
    eq = Equipment(**body.model_dump(), hourmeter_updated_at=now_iso()[:10], created_at=now_iso(), created_by=user["name"])
    await db.equipment.insert_one(eq.model_dump(exclude={"installed_components"}))
    await audit(user, "INCLUSAO", "equipamento", eq.id, f"Equipamento {eq.tag} ({eq.manufacturer} {eq.model}) cadastrado")
    return eq


@router.put("/equipment/{eid}", response_model=Equipment)
async def update_equipment(eid: str, body: EquipmentIn, user: dict = Depends(require("cadastro"))):
    old = await db.equipment.find_one({"id": eid}, {"_id": 0})
    if not old:
        raise HTTPException(404, "Equipamento não encontrado")
    await _uniq("equipment", "tag", body.tag, eid, "TAG de equipamento")
    await _uniq("equipment", "serial", body.serial, eid, "Nº de série de equipamento")
    if body.hourmeter < float(old["hourmeter"]):
        raise HTTPException(422, "Horímetro não pode ser reduzido — use correção auditada")
    upd = body.model_dump()
    if body.hourmeter != old["hourmeter"]:
        upd["hourmeter_updated_at"] = now_iso()[:10]
    await db.equipment.update_one({"id": eid}, {"$set": upd})
    if body.tag != old["tag"]:
        await db.movements.update_many({"equipment_id": eid}, {"$set": {"equipment_tag": body.tag}})
    await audit(user, "ALTERACAO", "equipamento", eid, f"Equipamento {body.tag} alterado", before=old, after=upd)
    return Equipment(**{**old, **upd})


@router.post("/equipment/{eid}/hourmeter", response_model=Equipment)
async def update_hourmeter(eid: str, body: HourmeterIn, user: dict = Depends(require("movimentacao"))):
    old = await db.equipment.find_one({"id": eid}, {"_id": 0})
    if not old:
        raise HTTPException(404, "Equipamento não encontrado")
    if not parse_date(body.date):
        raise HTTPException(422, "Data inválida")
    if body.hourmeter < float(old["hourmeter"]):
        raise HTTPException(422, f"Horímetro informado ({body.hourmeter:.0f} h) inferior ao atual ({old['hourmeter']:.0f} h)")
    upd = {"hourmeter": body.hourmeter, "hourmeter_updated_at": body.date[:10]}
    await db.equipment.update_one({"id": eid}, {"$set": upd})
    await audit(user, "HORIMETRO", "equipamento", eid, f"{old['tag']}: horímetro {old['hourmeter']:.0f} → {body.hourmeter:.0f} h",
                before={"hourmeter": old["hourmeter"]}, after=upd)
    return Equipment(**{**old, **upd})


@router.get("/search", response_model=list[SearchHit])
async def search(q: str, _: dict = Depends(current_user)):
    if len(q.strip()) < 2:
        return []
    rx = {"$regex": re.escape(q.strip()), "$options": "i"}
    hits: list[SearchHit] = []
    for e in await db.equipment.find({"$or": [{"tag": rx}, {"serial": rx}, {"model": rx}]}, {"_id": 0}).to_list(8):
        hits.append(SearchHit(kind="equipamento", id=e["id"], tag=e["tag"], label=f"{e['manufacturer']} {e['model']}",
                              sub=f"Série {e.get('serial') or '—'} · {e['area']}"))
    for c in await db.components.find({"$or": [{"tag": rx}, {"sap_code": rx}, {"pn": rx}, {"serial": rx}]}, {"_id": 0}).to_list(12):
        hits.append(SearchHit(kind="componente", id=c["id"], tag=c["tag"], label=c["description"],
                              sub=f"SAP {c.get('sap_code') or '—'} · PN {c.get('pn') or '—'} · Série {c.get('serial') or '—'}"))
    return hits
