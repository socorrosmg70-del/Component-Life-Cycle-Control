"""SAP integration layer — file-based import (CSV/JSON in SAP PM layout) + sync monitor.
A live connector (OData / RFC-BAPI / SAP CPI) plugs into `process_rows` once IT releases the service;
until SAP_API_URL is configured the connection test records a FAILED batch instead of pretending to sync."""

import csv
import io
import json
import os
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from lib.audit import audit, now_iso
from lib.auth import current_user, require
from lib.db import db
from lib.domain import COST_CATEGORIES, parse_date
from models.schemas import SapBatch, SapStatus

router = APIRouter()

ENTITIES = {
    "HORIMETROS": ["equipment_tag", "hourmeter", "date"],
    "CUSTOS_OM": ["sap_om", "component_tag", "category", "amount", "date"],
    "MATERIAIS": ["sap_code", "description"],
}


def parse_file(raw: bytes, name: str) -> list[dict]:
    text = raw.decode("utf-8-sig", errors="replace")
    if name.lower().endswith(".json"):
        data = json.loads(text)
        if not isinstance(data, list):
            raise HTTPException(422, "JSON deve ser uma lista de registros")
        return [{str(k).strip(): v for k, v in row.items()} for row in data]
    delim = ";" if text.count(";") > text.count(",") else ","
    return [{(k or "").strip(): (v or "").strip() for k, v in row.items()} for row in csv.DictReader(io.StringIO(text), delimiter=delim)]


def num(v) -> float:
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    return float(s)


async def process_row(entity: str, row: dict, user: dict) -> tuple[str, str | None]:
    """Returns (result, message) where result in IMPORTADO | REJEITADO | DUPLICADO."""
    missing = [f for f in ENTITIES[entity] if not str(row.get(f, "")).strip()]
    if missing:
        return "REJEITADO", f"Campos obrigatórios ausentes: {', '.join(missing)}"
    if entity == "HORIMETROS":
        eq = await db.equipment.find_one({"tag": row["equipment_tag"]}, {"_id": 0})
        if not eq:
            return "REJEITADO", f"Equipamento {row['equipment_tag']} não cadastrado"
        try:
            hm = num(row["hourmeter"])
        except ValueError:
            return "REJEITADO", "Horímetro inválido"
        if not parse_date(str(row["date"])):
            return "REJEITADO", "Data inválida"
        key = f"HM|{eq['tag']}|{hm}|{row['date']}"
        if await db.sap_keys.find_one({"key": key}):
            return "DUPLICADO", "Leitura de horímetro já importada"
        if hm < float(eq["hourmeter"]):
            return "REJEITADO", f"Divergência de horímetro: {hm:.0f} h inferior ao atual {eq['hourmeter']:.0f} h"
        await db.equipment.update_one({"id": eq["id"]}, {"$set": {"hourmeter": hm, "hourmeter_updated_at": str(row["date"])[:10]}})
        await db.sap_keys.insert_one({"key": key, "at": now_iso()})
        return "IMPORTADO", None
    if entity == "CUSTOS_OM":
        comp = await db.components.find_one({"tag": row["component_tag"]}, {"_id": 0})
        if not comp:
            return "REJEITADO", f"Componente {row['component_tag']} não cadastrado"
        cat = str(row["category"]).upper()
        if cat not in COST_CATEGORIES or cat == "AQUISICAO":
            return "REJEITADO", f"Categoria de custo inválida: {row['category']}"
        try:
            amount = num(row["amount"])
        except ValueError:
            return "REJEITADO", "Valor inválido"
        if amount <= 0:
            return "REJEITADO", "Valor deve ser positivo"
        if not parse_date(str(row["date"])):
            return "REJEITADO", "Data inválida"
        key = f"COST|{row['sap_om']}|{comp['tag']}|{cat}|{amount}"
        if await db.sap_keys.find_one({"key": key}):
            return "DUPLICADO", f"Custo da OM {row['sap_om']} já importado"
        await db.cost_entries.insert_one({
            "id": str(uuid.uuid4()), "component_id": comp["id"], "life_number": int(comp["current_life"]),
            "category": cat, "amount": amount, "date": str(row["date"])[:10],
            "description": row.get("description") or f"OM {row['sap_om']}", "sap_document": str(row["sap_om"]),
            "cost_center": row.get("cost_center"), "supplier": row.get("supplier"), "order_status": row.get("order_status"),
            "source": "SAP", "created_at": now_iso(), "created_by": f"SAP ({user['name']})"})
        await db.sap_keys.insert_one({"key": key, "at": now_iso()})
        return "IMPORTADO", None
    # MATERIAIS
    key = f"MAT|{row['sap_code']}|{row['description']}"
    if await db.sap_keys.find_one({"key": key}):
        return "DUPLICADO", "Material já sincronizado sem alterações"
    await db.sap_materials.update_one({"sap_code": str(row["sap_code"])}, {"$set": {
        "sap_code": str(row["sap_code"]), "description": row["description"], "pn": row.get("pn"), "synced_at": now_iso()}}, upsert=True)
    await db.sap_keys.insert_one({"key": key, "at": now_iso()})
    return "IMPORTADO", None


async def run_batch(entity: str, rows: list[dict], user: dict, source: str, file_name: str | None,
                    reprocess_of: str | None = None) -> dict:
    batch = {"id": str(uuid.uuid4()), "started_at": now_iso(), "source": source, "entity": entity,
             "file_name": file_name, "total": len(rows), "imported": 0, "rejected": 0, "duplicates": 0,
             "errors": [], "user_name": user["name"], "reprocess_of": reprocess_of, "reprocessed": False}
    for i, row in enumerate(rows, start=1):
        result, msg = await process_row(entity, row, user)
        if result == "IMPORTADO":
            batch["imported"] += 1
        elif result == "DUPLICADO":
            batch["duplicates"] += 1
            batch["errors"].append({"row": i, "kind": "DUPLICIDADE", "message": msg, "data": row})
        else:
            batch["rejected"] += 1
            batch["errors"].append({"row": i, "kind": "REJEICAO", "message": msg, "data": row})
    batch["status"] = "SUCESSO" if batch["rejected"] == 0 else ("FALHA" if batch["imported"] == 0 else "PARCIAL")
    batch["finished_at"] = now_iso()
    await db.sap_batches.insert_one(dict(batch))
    await audit(user, "SAP_IMPORTACAO", "sap", batch["id"],
                f"Lote {entity}: {batch['imported']} importados, {batch['rejected']} rejeitados, {batch['duplicates']} duplicados")
    return batch


@router.post("/sap/import", response_model=SapBatch)
async def sap_import(entity: str = Form(...), file: UploadFile = File(...), user: dict = Depends(require("sap"))):
    if entity not in ENTITIES:
        raise HTTPException(422, f"Entidade inválida. Use: {', '.join(ENTITIES)}")
    try:
        rows = parse_file(await file.read(), file.filename or "arquivo.csv")
    except (json.JSONDecodeError, UnicodeDecodeError, csv.Error):
        raise HTTPException(422, "Arquivo inválido — use CSV (; ou ,) ou JSON")
    if not rows:
        raise HTTPException(422, "Arquivo sem registros")
    return await run_batch(entity, rows, user, "ARQUIVO SAP (CSV/JSON)", file.filename)


@router.post("/sap/batches/{bid}/reprocess", response_model=SapBatch)
async def sap_reprocess(bid: str, user: dict = Depends(require("sap"))):
    b = await db.sap_batches.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Lote não encontrado")
    if b.get("reprocessed"):
        raise HTTPException(409, "Lote já reprocessado")
    if b["entity"] == "CONEXAO":
        raise HTTPException(409, "Falha de conexão: configure o serviço SAP antes de reprocessar")
    rows = [e["data"] for e in b["errors"] if e["kind"] == "REJEICAO"]
    if not rows:
        raise HTTPException(409, "Lote sem registros rejeitados para reprocessar")
    nb = await run_batch(b["entity"], rows, user, f"REPROCESSAMENTO de {bid[:8]}", b.get("file_name"), reprocess_of=bid)
    await db.sap_batches.update_one({"id": bid}, {"$set": {"reprocessed": True}})
    return nb


@router.post("/sap/connection-test", response_model=SapBatch)
async def sap_connection_test(user: dict = Depends(require("sap"))):
    url = os.environ.get("SAP_API_URL")
    msg = ("Conexão SAP não configurada: endpoint OData/RFC e credenciais ainda não liberados pela equipe SAP/TI"
           if not url else f"Conector para {url} ainda não homologado neste ambiente")
    batch = {"id": str(uuid.uuid4()), "started_at": now_iso(), "finished_at": now_iso(), "source": "API SAP (OData/RFC)",
             "entity": "CONEXAO", "file_name": None, "total": 0, "imported": 0, "rejected": 0, "duplicates": 0,
             "status": "FALHA", "errors": [{"row": 0, "kind": "CONEXAO", "message": msg, "data": {}}],
             "user_name": user["name"], "reprocess_of": None, "reprocessed": False}
    await db.sap_batches.insert_one(dict(batch))
    await audit(user, "SAP_CONEXAO", "sap", batch["id"], f"Teste de conexão SAP: FALHA — {msg}")
    return batch


@router.get("/sap/batches", response_model=list[SapBatch])
async def sap_batches(_: dict = Depends(current_user)):
    return await db.sap_batches.find({}, {"_id": 0}).sort("started_at", -1).to_list(200)


@router.get("/sap/status", response_model=SapStatus)
async def sap_status(_: dict = Depends(current_user)):
    last = await db.sap_batches.find({}, {"_id": 0}).sort("started_at", -1).to_list(1)
    pending = 0
    async for b in db.sap_batches.find({"reprocessed": False, "entity": {"$ne": "CONEXAO"}}, {"errors": 1}):
        pending += sum(1 for e in b["errors"] if e["kind"] == "REJEICAO")
    sap = await db.cost_entries.count_documents({"source": "SAP"}) + await db.sap_materials.count_documents({})
    manual = (await db.cost_entries.count_documents({"source": "MANUAL"}) + await db.components.count_documents({"source": "MANUAL"})
              + await db.movements.count_documents({"source": "MANUAL"}))
    return SapStatus(mode="ARQUIVO (CSV/JSON)", api_configured=bool(os.environ.get("SAP_API_URL")),
                     last_sync_at=last[0]["finished_at"] if last else None, last_status=last[0]["status"] if last else None,
                     total_batches=await db.sap_batches.count_documents({}), pending_rejections=pending,
                     sap_records=sap, manual_records=manual)
