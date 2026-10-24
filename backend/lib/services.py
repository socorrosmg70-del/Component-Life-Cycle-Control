"""Write-side business operations (install, remove, life validation, reforms). Used by routers and seed.py."""

import uuid
from datetime import date
from typing import Optional

from fastapi import HTTPException

from lib.audit import audit, now_iso
from lib.dates import today_iso
from lib.db import db
from lib.domain import REFORM_OPEN, life_hours, load_context, parse_date, target_for

ACTIVE_REFORM_STATUS = {"INTERNA": "REFORMA_INTERNA", "EXTERNA": "REFORMA_EXTERNA"}


def _date(s: str, field: str, today: Optional[str] = None) -> date:
    d = parse_date(s)
    if not d:
        raise HTTPException(422, f"{field}: data inválida (use AAAA-MM-DD)")
    if today and d > date.fromisoformat(today):
        raise HTTPException(422, f"{field}: data futura não permitida")
    return d


async def _comp(cid: str) -> dict:
    c = await db.components.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Componente não encontrado")
    return c


async def install(p: dict, user: dict, today: Optional[str] = None) -> dict:
    today = today or today_iso()
    comp = await _comp(p["component_id"])
    eq = await db.equipment.find_one({"id": p["equipment_id"]}, {"_id": 0})
    if not eq:
        raise HTTPException(404, "Equipamento não encontrado")
    if eq["status"] == "INATIVO":
        raise HTTPException(409, f"Equipamento {eq['tag']} está inativo")
    open_mov = await db.movements.find_one({"component_id": comp["id"], "status": "ABERTA"}, {"_id": 0})
    if comp["status"] == "INSTALADO" or open_mov:
        tag = open_mov["equipment_tag"] if open_mov else "?"
        raise HTTPException(409, f"Componente {comp['tag']} já está instalado em {tag}. Registre a remoção antes de nova instalação.")
    if comp["status"] in ("AGUARDANDO_REFORMA", "REFORMA_INTERNA", "REFORMA_EXTERNA"):
        raise HTTPException(409, f"Componente {comp['tag']} está em processo de reforma — conclua e libere antes de instalar.")
    if comp["status"] == "SUCATEADO":
        raise HTTPException(409, f"Componente {comp['tag']} encerrou o ciclo de vida (substituído/sucateado).")
    d = _date(p["install_date"], "Data de instalação", today)
    last = await db.movements.find({"component_id": comp["id"], "status": "ENCERRADA"}, {"_id": 0}).sort("removal_date", -1).to_list(1)
    if last and d < date.fromisoformat(last[0]["removal_date"]):
        raise HTTPException(422, f"Data de instalação anterior à última remoção ({last[0]['removal_date']})")
    hm = float(p["install_hourmeter"])
    upd = parse_date(eq.get("hourmeter_updated_at"))
    if upd and d >= upd and hm < float(eq["hourmeter"]):
        raise HTTPException(422, f"Horímetro de instalação ({hm:,.0f} h) inferior ao horímetro atual do equipamento {eq['tag']} ({eq['hourmeter']:,.0f} h)".replace(",", "."))
    if p.get("install_om"):
        dup = await db.movements.find_one({"component_id": comp["id"], "install_om": p["install_om"]})
        if dup:
            raise HTTPException(409, f"Movimentação duplicada: OM {p['install_om']} já registrada para este componente")
    mov = {
        "id": str(uuid.uuid4()), "component_id": comp["id"], "component_tag": comp["tag"],
        "component_serial": comp.get("serial"), "equipment_id": eq["id"], "equipment_tag": eq["tag"],
        "life_number": int(comp["current_life"]), "status": "ABERTA",
        "install_date": d.isoformat(), "install_hourmeter": hm, "install_om": p.get("install_om"),
        "install_responsible": p["responsible"], "install_notes": p.get("notes"),
        "early_removal": False, "inconsistencies": [], "revisions": [], "source": p.get("source", "MANUAL"),
        "created_at": now_iso(), "created_by": user["name"],
    }
    await db.movements.insert_one(dict(mov))
    if hm > float(eq["hourmeter"]):
        await db.equipment.update_one({"id": eq["id"]}, {"$set": {"hourmeter": hm, "hourmeter_updated_at": d.isoformat()}})
    await db.components.update_one({"id": comp["id"]}, {"$set": {"status": "INSTALADO", "location": eq["tag"], "updated_at": now_iso()}})
    await audit(user, "INSTALACAO", "movimentacao", mov["id"],
                f"{comp['tag']} instalado em {eq['tag']} (vida {mov['life_number']}, horímetro {hm:.0f} h)", after=mov)
    return mov


async def remove(mov_id: str, p: dict, user: dict, today: Optional[str] = None) -> dict:
    today = today or today_iso()
    mov = await db.movements.find_one({"id": mov_id}, {"_id": 0})
    if not mov:
        raise HTTPException(404, "Movimentação não encontrada")
    if mov["status"] != "ABERTA":
        raise HTTPException(409, "Esta instalação já foi encerrada (remoção já registrada)")
    d_rem = _date(p["removal_date"], "Data de remoção", today)
    d_ins = date.fromisoformat(mov["install_date"])
    if d_rem < d_ins:
        raise HTTPException(422, f"Data de remoção ({d_rem.isoformat()}) anterior à data de instalação ({mov['install_date']})")
    hm = float(p["removal_hourmeter"])
    if hm < float(mov["install_hourmeter"]):
        raise HTTPException(422, f"Horímetro de remoção ({hm:.0f} h) inferior ao horímetro de instalação ({mov['install_hourmeter']:.0f} h)")
    if p["reform_type"] == "EXTERNA" and not (p.get("reform_company") or "").strip():
        raise HTTPException(422, "Reforma externa: informe a empresa responsável")
    hours = hm - float(mov["install_hourmeter"])
    inconsistencies: list[str] = []
    calendar_h = ((d_rem - d_ins).days + 1) * 24
    if hours > calendar_h:
        inconsistencies.append(f"Horas trabalhadas ({hours:.0f} h) superiores ao tempo de calendário ({calendar_h} h)")
    comp = await _comp(mov["component_id"])
    ctx = await load_context()
    closed, _ = life_hours(comp, mov["life_number"], ctx)
    fam = ctx["families"].get(comp.get("family_id"))
    target = target_for(fam, mov["life_number"])
    early = bool(target and closed + hours < target)
    upd = {
        "status": "ENCERRADA", "removal_date": d_rem.isoformat(), "removal_hourmeter": hm,
        "removal_reason": p["removal_reason"], "removal_om": p.get("removal_om"), "condition": p["condition"],
        "destination": p["destination"], "reform_type": p["reform_type"], "reform_company": p.get("reform_company"),
        "reform_cost": p.get("reform_cost"), "removal_responsible": p["responsible"], "removal_notes": p.get("notes"),
        "hours_worked": hours, "early_removal": early, "inconsistencies": inconsistencies,
        "closed_at": now_iso(), "closed_by": user["name"],
    }
    await db.movements.update_one({"id": mov_id}, {"$set": upd})
    eq = await db.equipment.find_one({"id": mov["equipment_id"]}, {"_id": 0})
    if eq and hm > float(eq["hourmeter"]):
        await db.equipment.update_one({"id": eq["id"]}, {"$set": {"hourmeter": hm, "hourmeter_updated_at": d_rem.isoformat()}})
    new_status = "REMOVIDO"
    if p["reform_type"] != "SEM_REFORMA":
        new_status = "AGUARDANDO_REFORMA"
        await create_reform({"component_id": comp["id"], "type": p["reform_type"], "supplier": p.get("reform_company"),
                             "cost_service": p.get("reform_cost"), "movement_id": mov_id}, user, skip_checks=True)
    await db.components.update_one({"id": comp["id"]}, {"$set": {"status": new_status, "location": p["destination"], "updated_at": now_iso()}})
    note = " — REMOÇÃO ANTECIPADA (abaixo da meta)" if early else ""
    await audit(user, "REMOCAO", "movimentacao", mov_id,
                f"{mov['component_tag']} removido de {mov['equipment_tag']}: {hours:.0f} h trabalhadas{note}", before=mov, after=upd)
    return {**mov, **upd}


async def validate_life(cid: str, p: dict, user: dict) -> dict:
    comp = await _comp(cid)
    if comp["status"] == "INSTALADO":
        raise HTTPException(409, "Remova o componente antes de validar o encerramento da vida")
    if comp["status"] == "SUCATEADO":
        raise HTTPException(409, "Ciclo de vida já encerrado")
    if await db.reforms.find_one({"component_id": cid, "status": {"$in": list(REFORM_OPEN)}}):
        raise HTTPException(409, "Existe reforma em andamento — a vida só avança após retorno, inspeção e liberação")
    life = int(comp["current_life"])
    if await db.lives.find_one({"component_id": cid, "life_number": life}):
        raise HTTPException(409, f"Vida {life} já validada")
    ctx = await load_context()
    closed, _ = life_hours(comp, life, ctx)
    has_closed = any(m["life_number"] == life and m["status"] == "ENCERRADA" for m in ctx["movs"][cid])
    if not has_closed:
        raise HTTPException(409, "Não há instalação encerrada nesta vida para validar")
    if p["decision"] == "AVANCAR" and not p["condition_ok"]:
        raise HTTPException(422, "Condição do componente não confirmada — vida não pode avançar")
    if p["decision"] == "AVANCAR" and life >= 4:
        raise HTTPException(409, "A 4ª vida é a última — registre a decisão de substituição")
    fam = ctx["families"].get(comp.get("family_id"))
    target = target_for(fam, life)
    early = bool(target and closed < target)
    if early and not (p.get("early_reason") or "").strip():
        raise HTTPException(422, f"Vida encerrada antes da meta ({closed:.0f} h de {target:.0f} h): informe o motivo do encerramento antecipado")
    doc = {
        "id": str(uuid.uuid4()), "component_id": cid, "life_number": life,
        "status": "ENCERRADA_ANTECIPADA" if early else "ENCERRADA", "hours": closed, "target": target,
        "early": early, "early_reason": p.get("early_reason"), "decision": p["decision"], "notes": p.get("notes"),
        "validated_by": user["name"], "validated_at": now_iso(),
    }
    await db.lives.insert_one(dict(doc))
    if p["decision"] == "AVANCAR":
        await db.components.update_one({"id": cid}, {"$set": {"current_life": life + 1, "updated_at": now_iso()}})
        msg = f"Vida {life} validada ({closed:.0f} h). Componente avança para vida {life + 1}"
    else:
        await db.components.update_one({"id": cid}, {"$set": {"status": "SUCATEADO", "location": "Baixado / substituído", "updated_at": now_iso()}})
        msg = f"Vida {life} encerrada ({closed:.0f} h). Decisão: substituição do componente"
    await audit(user, "VALIDACAO_VIDA", "componente", cid, f"{comp['tag']}: {msg}", after=doc)
    return doc


async def create_reform(p: dict, user: dict, skip_checks: bool = False) -> dict:
    comp = await _comp(p["component_id"])
    if not skip_checks:
        if comp["status"] not in ("REMOVIDO", "AGUARDANDO_REFORMA", "LIBERADO"):
            raise HTTPException(409, f"Componente com status {comp['status']} não pode ser enviado para reforma")
        if await db.reforms.find_one({"component_id": comp["id"], "status": {"$in": list(REFORM_OPEN)}}):
            raise HTTPException(409, "Já existe reforma em aberto para este componente")
    if p["type"] == "EXTERNA" and not (p.get("supplier") or "").strip():
        raise HTTPException(422, "Reforma externa: informe o fornecedor")
    doc = {
        "id": str(uuid.uuid4()), "component_id": comp["id"], "component_tag": comp["tag"],
        "movement_id": p.get("movement_id"), "life_number": int(comp["current_life"]), "type": p["type"],
        "status": "AGUARDANDO_ENVIO", "supplier": p.get("supplier"), "cost_service": p.get("cost_service"),
        "notes": p.get("notes"), "created_at": now_iso(), "created_by": user["name"],
    }
    await db.reforms.insert_one(dict(doc))
    if not skip_checks:
        await db.components.update_one({"id": comp["id"]}, {"$set": {"status": "AGUARDANDO_REFORMA", "updated_at": now_iso()}})
    await audit(user, "REFORMA_ABERTA", "reforma", doc["id"], f"Reforma {p['type'].lower()} aberta para {comp['tag']}", after=doc)
    return doc


async def update_reform(rid: str, p: dict, user: dict) -> dict:
    r = await db.reforms.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Reforma não encontrada")
    if r["status"] in ("CONCLUIDO", "REPROVADO"):
        raise HTTPException(409, "Reforma encerrada não pode ser alterada")
    merged = {**r, **p}
    for f in ("sent_date", "workshop_entry_date", "service_start", "service_end", "return_date"):
        if merged.get(f):
            _date(merged[f], f, today_iso())
    sd = parse_date(merged.get("sent_date"))
    for f in ("workshop_entry_date", "service_start", "service_end", "return_date"):
        d = parse_date(merged.get(f))
        if d and sd and d < sd:
            raise HTTPException(422, f"Data inconsistente: {f} anterior à data de envio")
    if parse_date(merged.get("service_end")) and parse_date(merged.get("service_start")) and \
            parse_date(merged["service_end"]) < parse_date(merged["service_start"]):
        raise HTTPException(422, "Término do serviço anterior ao início")
    status = "AGUARDANDO_ENVIO"
    if merged.get("sent_date"):
        status = "EM_EXECUCAO"
    if (r["type"] == "EXTERNA" and merged.get("return_date")) or (r["type"] == "INTERNA" and merged.get("service_end")):
        status = "RETORNADO"
    p["status"] = status
    await db.reforms.update_one({"id": rid}, {"$set": p})
    if status in ("EM_EXECUCAO", "RETORNADO"):
        await db.components.update_one({"id": r["component_id"]}, {"$set": {
            "status": ACTIVE_REFORM_STATUS[r["type"]],
            "location": (merged.get("supplier") if r["type"] == "EXTERNA" else "Oficina interna") or "Reforma"}})
    await audit(user, "REFORMA_ATUALIZADA", "reforma", rid, f"Reforma {r['component_tag']} → {status}", before=r, after=p)
    return {**r, **p}


async def conclude_reform(rid: str, p: dict, user: dict) -> dict:
    r = await db.reforms.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Reforma não encontrada")
    if r["status"] in ("CONCLUIDO", "REPROVADO"):
        raise HTTPException(409, "Reforma já encerrada")
    missing = []
    if r["type"] == "EXTERNA":
        if not r.get("return_date"):
            missing.append("data de retorno")
    else:
        if not r.get("service_end"):
            missing.append("término do serviço")
    if not r.get("sent_date"):
        missing.append("data de envio")
    if missing:
        raise HTTPException(422, "Reforma não pode ser concluída sem confirmação: " + ", ".join(missing))
    rel = _date(p["release_date"], "Data de liberação", today_iso())
    base = parse_date(r.get("return_date") or r.get("service_end"))
    if base and rel < base:
        raise HTTPException(422, "Data de liberação anterior ao retorno/término do serviço")
    upd = {"status": "CONCLUIDO" if p["approved"] else "REPROVADO", "approved": p["approved"],
           "inspection_result": p["inspection_result"], "release_date": rel.isoformat(),
           "new_condition": p["new_condition"], "concluded_at": now_iso(), "concluded_by": user["name"]}
    await db.reforms.update_one({"id": rid}, {"$set": upd})
    comp_upd = ({"status": "LIBERADO", "location": "Almoxarifado — liberado para instalação"} if p["approved"]
                else {"status": "AGUARDANDO_REFORMA", "location": "Aguardando nova reforma (serviço reprovado)"})
    await db.components.update_one({"id": r["component_id"]}, {"$set": {**comp_upd, "updated_at": now_iso()}})
    verdict = "APROVADA e componente liberado" if p["approved"] else "REPROVADA — componente aguarda nova reforma"
    await audit(user, "REFORMA_CONCLUIDA", "reforma", rid, f"Reforma {r['component_tag']} {verdict}", before=r, after=upd)
    return {**r, **upd}
