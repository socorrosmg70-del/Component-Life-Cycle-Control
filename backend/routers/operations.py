from fastapi import APIRouter, Depends, HTTPException

from lib.audit import audit, now_iso
from lib.auth import current_user, require
from lib.db import db
from lib.domain import life_hours, load_context, parse_date, reform_total, running_hours, turnaround_days
from lib.services import conclude_reform, create_reform, install, remove, update_reform
from models.schemas import InstallIn, Movement, MovementCorrectIn, Reform, ReformConcludeIn, ReformCreateIn, ReformPatch, RemoveIn

router = APIRouter()


async def _mov_view(m: dict, ctx: dict | None = None) -> dict:
    ctx = ctx or await load_context()
    return {**m, "running_hours": running_hours(m, ctx) if m["status"] == "ABERTA" else None}


@router.get("/movements", response_model=list[Movement])
async def list_movements(component_id: str | None = None, equipment_id: str | None = None, status: str | None = None,
                         q: str | None = None, _: dict = Depends(current_user)):
    flt: dict = {}
    if component_id:
        flt["component_id"] = component_id
    if equipment_id:
        flt["equipment_id"] = equipment_id
    if status:
        flt["status"] = status
    if q:
        rx = {"$regex": q, "$options": "i"}
        flt["$or"] = [{"component_tag": rx}, {"equipment_tag": rx}, {"install_om": rx}, {"removal_om": rx}, {"component_serial": rx}]
    ctx = await load_context()
    movs = await db.movements.find(flt, {"_id": 0}).sort("install_date", -1).to_list(5000)
    return [{**m, "running_hours": running_hours(m, ctx) if m["status"] == "ABERTA" else None} for m in movs]


@router.post("/movements/install", response_model=Movement)
async def do_install(body: InstallIn, user: dict = Depends(require("movimentacao"))):
    return await _mov_view(await install(body.model_dump(), user))


@router.post("/movements/{mid}/remove", response_model=Movement)
async def do_remove(mid: str, body: RemoveIn, user: dict = Depends(require("movimentacao"))):
    return await _mov_view(await remove(mid, body.model_dump(), user))


@router.post("/movements/{mid}/correct", response_model=Movement)
async def correct(mid: str, body: MovementCorrectIn, user: dict = Depends(require("correcao"))):
    """Traceable correction: previous values are kept in `revisions`; nothing is deleted."""
    m = await db.movements.find_one({"id": mid}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Movimentação não encontrada")
    upd = body.model_dump(exclude_none=True, exclude={"reason"})
    if not upd:
        raise HTTPException(422, "Nenhum campo para corrigir")
    merged = {**m, **upd}
    for f in ("install_date", "removal_date"):
        if merged.get(f) and not parse_date(merged[f]):
            raise HTTPException(422, f"{f}: data inválida")
    if merged["status"] == "ENCERRADA":
        if parse_date(merged["removal_date"]) < parse_date(merged["install_date"]):
            raise HTTPException(422, "Data de remoção anterior à instalação")
        if merged["removal_hourmeter"] < merged["install_hourmeter"]:
            raise HTTPException(422, "Horímetro de remoção inferior ao de instalação")
        upd["hours_worked"] = merged["removal_hourmeter"] - merged["install_hourmeter"]
        days = (parse_date(merged["removal_date"]) - parse_date(merged["install_date"])).days + 1
        upd["inconsistencies"] = ([f"Horas trabalhadas ({upd['hours_worked']:.0f} h) superiores ao tempo de calendário ({days * 24} h)"]
                                  if upd["hours_worked"] > days * 24 else [])
    elif "removal_date" in upd or "removal_hourmeter" in upd:
        raise HTTPException(422, "Instalação aberta: use a remoção para informar dados de remoção")
    rev = {"at": now_iso(), "by": user["name"], "reason": body.reason, "before": {k: m.get(k) for k in upd}}
    await db.movements.update_one({"id": mid}, {"$set": upd, "$push": {"revisions": rev}})
    await audit(user, "CORRECAO", "movimentacao", mid, f"Correção em {m['component_tag']}/{m['equipment_tag']}: {body.reason}",
                before=rev["before"], after=upd)
    return await _mov_view({**m, **upd, "revisions": m.get("revisions", []) + [rev]})


# ---------- reforms ----------
def _reform_view(r: dict, ctx: dict) -> dict:
    comp = next((c for c in ctx["components"] if c["id"] == r["component_id"]), None)
    nxt = None
    if comp and r["status"] == "CONCLUIDO" and int(comp["current_life"]) > int(r["life_number"]):
        closed, running = life_hours(comp, int(r["life_number"]) + 1, ctx)
        nxt = round(closed + running, 1)
    return {**r, "total_cost": reform_total(r), "turnaround_days": turnaround_days(r), "next_life_hours": nxt}


@router.get("/reforms", response_model=list[Reform])
async def list_reforms(type: str | None = None, status: str | None = None, component_id: str | None = None,
                       _: dict = Depends(current_user)):
    ctx = await load_context()
    out = []
    for r in reversed(ctx["all_reforms"]):
        if (type and r["type"] != type) or (status and r["status"] != status) or (component_id and r["component_id"] != component_id):
            continue
        out.append(_reform_view(r, ctx))
    return out


@router.post("/reforms", response_model=Reform)
async def new_reform(body: ReformCreateIn, user: dict = Depends(require("reforma"))):
    r = await create_reform(body.model_dump(), user)
    return _reform_view(r, await load_context())


@router.patch("/reforms/{rid}", response_model=Reform)
async def patch_reform(rid: str, body: ReformPatch, user: dict = Depends(require("reforma"))):
    r = await update_reform(rid, body.model_dump(exclude_none=True), user)
    return _reform_view(r, await load_context())


@router.post("/reforms/{rid}/conclude", response_model=Reform)
async def finish_reform(rid: str, body: ReformConcludeIn, user: dict = Depends(require("concluir_reforma"))):
    r = await conclude_reform(rid, body.model_dump(), user)
    return _reform_view(r, await load_context())
