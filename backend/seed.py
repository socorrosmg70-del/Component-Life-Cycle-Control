"""Idempotent demo seed: wipes app collections and rebuilds a consistent history through the real service layer.
Run: cd /app/backend && python seed.py"""

import asyncio
import uuid
from datetime import date, timedelta

from lib.audit import now_iso
from lib.auth import hash_pw
from lib.dates import today_iso
from lib.db import db, ensure_indexes
from lib.services import conclude_reform, install, remove, update_reform, validate_life
from routers.sap import run_batch

PASSWORD = "Hydro@2026"
USERS = [("Administrador do Sistema", "admin@hydro.com", "admin"), ("Paula PCM", "pcm@hydro.com", "pcm"),
         ("Eduardo Confiabilidade", "engenharia@hydro.com", "engenharia"), ("Oscar Oficina", "oficina@hydro.com", "oficina"),
         ("Carla Consulta", "consulta@hydro.com", "consulta"), ("Gustavo Gestor", "gestor@hydro.com", "gestor")]
EPOCH = date(2017, 1, 1)
TODAY = date.fromisoformat(today_iso())
EQUIP = {  # tag: (manufacturer, model, serial, type, area, base hourmeter, h/day, cost center)
    "EQ-CAT-793F-014": ("Caterpillar", "793F", "CAT0793FXRBT00614", "Caminhão fora de estrada", "Mina Norte — Lavra", 0, 15, "CC-1101"),
    "EQ-CAT-793F-015": ("Caterpillar", "793F", "CAT0793FXRBT00615", "Caminhão fora de estrada", "Mina Norte — Lavra", 2000, 15, "CC-1101"),
    "EQ-LBH-R9200-03": ("Liebherr", "R 9200", "LH9200-1188", "Escavadeira hidráulica", "Mina Norte — Carregamento", 0, 18, "CC-1102"),
    "EQ-SANY-SY750-07": ("SANY", "SY750H", "SY750H-77821", "Escavadeira hidráulica", "Mina Sul — Decapeamento", 5000, 16, "CC-1201"),
    "EQ-SCN-G500-21": ("Scania", "G500 8x4", "9BSG8X40003321", "Caminhão rodoviário pesado", "Logística — Transporte de minério", 0, 14, "CC-1301"),
    "EQ-JD-850K-02": ("John Deere", "850K", "1T0850KXCJF27711", "Trator de esteiras", "Mina Sul — Infraestrutura", 1000, 12, "CC-1202"),
}
FAMILIES = [("Motor diesel", "MOT", [12000, 10000, 8000, None]), ("Transmissão", "TRN", [12000, 10000, 8000, None]),
            ("Diferencial", "DIF", [12000, 10000, 8000, 6000]), ("Cilindro hidráulico", "CIL", [12000, 10000, 8000, None]),
            ("Comando final", "CFN", [12000, 10000, 8000, None])]


def ago(n: int) -> str:
    return (TODAY - timedelta(days=n)).isoformat()


def hm(tag: str, d: str) -> float:
    e = EQUIP[tag]
    return float(e[5] + e[6] * (date.fromisoformat(d) - EPOCH).days)


async def main() -> None:
    for c in ("users", "manufacturers", "families", "equipment", "components", "movements", "lives", "reforms",
              "cost_entries", "sap_batches", "sap_keys", "sap_materials", "audit_log"):
        await db[c].drop()
    await ensure_indexes()
    users = {}
    for name, email, role in USERS:
        u = {"id": str(uuid.uuid4()), "name": name, "email": email, "role": role, "active": True,
             "password_hash": hash_pw(PASSWORD), "created_at": now_iso()}
        await db.users.insert_one(dict(u))
        users[role] = u
    adm, ofi, eng = users["admin"], users["oficina"], users["engenharia"]
    for n in ("Caterpillar", "SANY", "Scania", "Liebherr", "John Deere", "Komatsu"):
        await db.manufacturers.insert_one({"id": str(uuid.uuid4()), "name": n, "active": True, "created_at": now_iso()})
    fam = {}
    for name, code, targets in FAMILIES:
        f = {"id": str(uuid.uuid4()), "name": name, "component_type": code, "targets": targets, "attention_pct": 85,
             "notes": "Metas de referência iniciais (1ª 12.000 h · 2ª 10.000 h · 3ª 8.000 h)" +
                      (" · 4ª vida aprovada pela engenharia" if targets[3] else " · 4ª vida: meta não definida"),
             "updated_at": now_iso(), "updated_by": adm["name"]}
        await db.families.insert_one(dict(f))
        fam[code] = f["id"]
    eq = {}
    for tag, (mf, model, serial, typ, area, base, _, cc) in EQUIP.items():
        e = {"id": str(uuid.uuid4()), "tag": tag, "manufacturer": mf, "model": model, "serial": serial, "equipment_type": typ,
             "area": area, "hourmeter": float(base), "status": "OPERANDO", "cost_center": cc, "hourmeter_updated_at": "2017-01-01",
             "source": "MANUAL", "created_at": now_iso(), "created_by": adm["name"]}
        await db.equipment.insert_one(dict(e))
        eq[tag] = e["id"]

    comps = {}

    async def comp(tag, desc, sap, pn, serial, mf, model, famc, compat, acq, acq_date, notes=""):
        c = {"id": str(uuid.uuid4()), "tag": tag, "description": desc, "sap_code": sap, "pn": pn, "serial": serial,
             "manufacturer": mf, "model": model, "family_id": fam[famc], "compatible_equipment": compat, "location": "Almoxarifado",
             "acquisition_cost": acq, "acquisition_date": acq_date, "responsible": "Paula PCM", "notes": notes,
             "status": "LIBERADO", "current_life": 1, "source": "MANUAL", "created_at": now_iso(), "created_by": "Paula PCM",
             "updated_at": now_iso()}
        await db.components.insert_one(dict(c))
        comps[tag] = c["id"]
        return c["id"]

    async def inst(cid, tag, d, om=None):
        m = await install({"component_id": cid, "equipment_id": eq[tag], "install_date": d, "install_hourmeter": hm(tag, d),
                           "install_om": om, "responsible": "Oscar Oficina", "notes": None}, ofi, today=TODAY.isoformat())
        return m["id"]

    async def rem(mid, tag, d, reason, rtype, company=None, cost=None, dest=None, cond="Desgaste normal", extra_h=0.0):
        return await remove(mid, {"removal_date": d, "removal_hourmeter": hm(tag, d) + extra_h, "removal_reason": reason,
                                  "removal_om": f"OM-{d.replace('-', '')[2:]}", "condition": cond,
                                  "destination": dest or ("Fornecedor externo — " + company if rtype == "EXTERNA" else
                                                          "Oficina interna" if rtype == "INTERNA" else "Almoxarifado — inspeção"),
                                  "reform_type": rtype, "reform_company": company, "reform_cost": cost,
                                  "responsible": "Oscar Oficina", "notes": None}, ofi, today=TODAY.isoformat())

    async def reform_of(cid):
        return (await db.reforms.find({"component_id": cid}).sort("created_at", -1).to_list(1))[0]["id"]

    # 1) Motor CAT 3516E — 4 lives, transfers between trucks, early 3rd-life removal, 4th life without target
    c1 = await comp("CMP-MOT-3516E-001", "Motor diesel CAT 3516E HD", "40019283", "245-1289", "S2K01188", "Caterpillar", "3516E",
                    "MOT", "CAT 793F", 1850000.0, "2016-12-20", "Motor principal de caminhão fora de estrada")
    m = await inst(c1, "EQ-CAT-793F-014", "2017-01-10", "OM-4000101")
    await rem(m, "EQ-CAT-793F-014", "2019-04-20", "Fim de vida programado (meta atingida)", "EXTERNA", "Sotreq", 420000.0)
    r = await reform_of(c1)
    await update_reform(r, {"sent_date": "2019-04-25", "sap_reference": "OM-4000188", "shipping_doc": "NF 55120", "deadline_days": 60,
                            "return_date": "2019-06-20", "cost_transport": 18000.0, "cost_inspection": 4500.0,
                            "warranty": "12 meses ou 10.000 h", "supplier_report": "Retífica completa, troca de camisas e pistões"}, ofi)
    await conclude_reform(r, {"approved": True, "inspection_result": "Aprovado em dinamômetro", "release_date": "2019-06-25",
                              "new_condition": "Reformado — padrão fábrica"}, ofi)
    await validate_life(c1, {"decision": "AVANCAR", "condition_ok": True, "notes": "Histórico validado"}, eng)
    m = await inst(c1, "EQ-CAT-793F-015", "2019-07-01", "OM-4000231")
    await rem(m, "EQ-CAT-793F-015", "2021-05-01", "Fim de vida programado", "INTERNA", None, None)
    r = await reform_of(c1)
    await update_reform(r, {"sent_date": "2021-05-03", "workshop_entry_date": "2021-05-04", "service_start": "2021-05-06",
                            "service_end": "2021-06-20", "service_type": "Recondicionamento geral",
                            "materials": "Kit juntas, pistões, camisas, bronzinas", "labor_hours": 420, "technician": "Carlos Souza",
                            "cost_materials": 95000.0, "cost_labor": 52000.0, "cost_inspection": 3800.0}, ofi)
    await conclude_reform(r, {"approved": True, "inspection_result": "Teste de bancada aprovado", "release_date": "2021-06-25",
                              "new_condition": "Recondicionado"}, ofi)
    await validate_life(c1, {"decision": "AVANCAR", "condition_ok": True}, eng)
    m = await inst(c1, "EQ-CAT-793F-014", "2021-07-05", "OM-4000377")
    await rem(m, "EQ-CAT-793F-014", "2022-08-10", "Falha prematura — contaminação do óleo lubrificante", "EXTERNA", "Sotreq",
              380000.0, cond="Danificado")
    r = await reform_of(c1)
    await update_reform(r, {"sent_date": "2022-08-15", "sap_reference": "OM-4000466", "shipping_doc": "NF 61877", "deadline_days": 50,
                            "return_date": "2022-10-10", "cost_transport": 17000.0, "warranty": "6 meses",
                            "supplier_report": "Substituição de virabrequim e bloco usinado"}, ofi)
    await conclude_reform(r, {"approved": True, "inspection_result": "Aprovado com ressalvas", "release_date": "2022-10-15",
                              "new_condition": "Reformado — última vida"}, ofi)
    await validate_life(c1, {"decision": "AVANCAR", "condition_ok": True,
                             "early_reason": "Contaminação por água no óleo — falha de vedação do arrefecedor"}, eng)
    await inst(c1, "EQ-CAT-793F-015", ago(500), "OM-4000590")

    # 2) Transmissão — life 1 close to target (Atenção)
    c2 = await comp("CMP-TRN-793F-002", "Transmissão planetária 793F", "40021877", "380-4422", "TRN79300452", "Caterpillar", "793F",
                    "TRN", "CAT 793F", 980000.0, "2023-11-10")
    await inst(c2, "EQ-CAT-793F-014", ago(740), "OM-4000611")

    # 3) Diferencial — life 1 above target, internal reform, life 2 above target
    c3 = await comp("CMP-DIF-793F-003", "Diferencial traseiro 793F", "40022510", "412-7781", "DIF7930099", "Caterpillar", "793F",
                    "DIF", "CAT 793F", 640000.0, "2018-01-15")
    m = await inst(c3, "EQ-CAT-793F-015", "2018-02-01", "OM-4000140")
    await rem(m, "EQ-CAT-793F-015", "2020-11-10", "Ruído anormal e limalha no bujão", "INTERNA")
    r = await reform_of(c3)
    await update_reform(r, {"sent_date": "2020-11-12", "workshop_entry_date": "2020-11-12", "service_start": "2020-11-16",
                            "service_end": "2020-12-20", "service_type": "Troca de coroa e pinhão", "materials": "Coroa, pinhão, rolamentos",
                            "labor_hours": 160, "technician": "Marcos Lima", "cost_materials": 48000.0, "cost_labor": 21000.0}, ofi)
    await conclude_reform(r, {"approved": True, "inspection_result": "Folga e contato dentro do padrão", "release_date": "2020-12-22",
                              "new_condition": "Recondicionado"}, ofi)
    await validate_life(c3, {"decision": "AVANCAR", "condition_ok": True}, eng)
    await inst(c3, "EQ-CAT-793F-015", ago(760), "OM-4000615")

    # 4) Cilindro — external reform in execution, overdue
    c4 = await comp("CMP-CIL-R9200-004", "Cilindro hidráulico da lança R 9200", "40030455", "LH-11027745", "CIL92000311", "Liebherr",
                    "R 9200", "CIL", "Liebherr R 9200", 210000.0, "2023-06-01")
    m = await inst(c4, "EQ-LBH-R9200-03", ago(970), "OM-4000520")
    await rem(m, "EQ-LBH-R9200-03", ago(70), "Vazamento interno — perda de força", "EXTERNA", "Hidráulica Minas Ltda", 65000.0)
    await update_reform(await reform_of(c4), {"sent_date": ago(60), "sap_reference": "OM-4000702", "shipping_doc": "NF 70211",
                                              "deadline_days": 45, "warranty": "6 meses"}, ofi)

    # 5) Cilindro — internal reform in execution
    c5 = await comp("CMP-CIL-R9200-005", "Cilindro hidráulico do braço R 9200", "40030456", "LH-11027746", "CIL92000312", "Liebherr",
                    "R 9200", "CIL", "Liebherr R 9200", 205000.0, "2023-06-01")
    m = await inst(c5, "EQ-LBH-R9200-03", ago(1000), "OM-4000521")
    await rem(m, "EQ-LBH-R9200-03", ago(40), "Haste riscada", "INTERNA")
    await update_reform(await reform_of(c5), {"sent_date": ago(35), "workshop_entry_date": ago(34), "service_start": ago(30),
                                              "service_type": "Cromagem e retífica de haste", "technician": "Marcos Lima"}, ofi)

    # 6) Comando final SANY — awaiting reform
    c6 = await comp("CMP-CFN-SY750-006", "Comando final SY750H", "40041209", "SY-60157733", "CFN750-0821", "SANY", "SY750H",
                    "CFN", "SANY SY750H", 330000.0, "2022-12-01")
    m = await inst(c6, "EQ-SANY-SY750-07", ago(900), "OM-4000533")
    await rem(m, "EQ-SANY-SY750-07", ago(12), "Fim de vida programado", "INTERNA")

    # 7) Motor Scania — life 1 normal
    c7 = await comp("CMP-MOT-DC13-007", "Motor Scania DC13 500 cv", "40050123", "DC13-148", "DC13-7781452", "Scania", "DC13",
                    "MOT", "Scania G500", 410000.0, "2025-01-10")

    # 11) Diferencial Scania — external reform REJECTED
    c11 = await comp("CMP-DIF-G500-011", "Diferencial traseiro Scania R780", "40050990", "R780-2210", "R780-55102", "Scania", "R780",
                     "DIF", "Scania G500", 98000.0, "2022-08-01")
    m = await inst(c11, "EQ-SCN-G500-21", ago(1200), "OM-4000480")
    await rem(m, "EQ-SCN-G500-21", ago(150), "Desgaste de engrenagens", "EXTERNA", "Retífica Alfa", 21000.0)
    r = await reform_of(c11)
    await update_reform(r, {"sent_date": ago(145), "shipping_doc": "NF 69002", "deadline_days": 30, "return_date": ago(100),
                            "cost_transport": 2400.0}, ofi)
    await conclude_reform(r, {"approved": False, "inspection_result": "Reprovado: folga axial fora de especificação",
                              "release_date": ago(98), "new_condition": "Não conforme — retrabalho necessário"}, ofi)
    await inst(c7, "EQ-SCN-G500-21", ago(200), "OM-4000650")

    # 8) Transmissão John Deere — new in stock, incomplete data
    await comp("CMP-TRN-850K-008", "Transmissão powershift 850K", "40060077", "AT-451120", None, "John Deere", "850K", "TRN",
               "John Deere 850K", None, None, "Aguardando nota fiscal de aquisição")

    # 9) Motor Liebherr — reform done, released, life validation pending; reform without costs
    c9 = await comp("CMP-MOT-D9512-009", "Motor Liebherr D9512", "40030001", "LH-10118845", "D9512-10077", "Liebherr", "D9512",
                    "MOT", "Liebherr R 9200", 2100000.0, "2023-08-01")
    m = await inst(c9, "EQ-LBH-R9200-03", ago(800), "OM-4000540")
    await rem(m, "EQ-LBH-R9200-03", ago(90), "Fim de vida programado (meta atingida)", "INTERNA")
    r = await reform_of(c9)
    await update_reform(r, {"sent_date": ago(85), "workshop_entry_date": ago(85), "service_start": ago(80), "service_end": ago(30),
                            "service_type": "Overhaul completo", "technician": "Carlos Souza"}, ofi)
    await conclude_reform(r, {"approved": True, "inspection_result": "Aprovado em dinamômetro", "release_date": ago(25),
                              "new_condition": "Reformado"}, ofi)

    # 10) Comando final JD — hourmeter inconsistency (hours > calendar time)
    c10 = await comp("CMP-CFN-850K-010", "Comando final 850K LD", "40060120", "AT-399812", "CFN850-3321", "John Deere", "850K",
                     "CFN", "John Deere 850K", 145000.0, "2024-10-01")
    m = await inst(c10, "EQ-JD-850K-02", ago(300), "OM-4000660")
    await rem(m, "EQ-JD-850K-02", ago(296), "Vazamento no retentor", "SEM_REFORMA", extra_h=1500.0)

    # current hourmeters
    for tag, eid in eq.items():
        e = await db.equipment.find_one({"id": eid})
        await db.equipment.update_one({"id": eid}, {"$set": {"hourmeter": max(e["hourmeter"], hm(tag, TODAY.isoformat())),
                                                              "hourmeter_updated_at": TODAY.isoformat()}})
    # SAP demo batches
    pcm = users["pcm"]
    h14 = (await db.equipment.find_one({"id": eq["EQ-CAT-793F-014"]}))["hourmeter"]
    await run_batch("HORIMETROS", [{"equipment_tag": "EQ-CAT-793F-014", "hourmeter": h14 + 14, "date": TODAY.isoformat()},
                                   {"equipment_tag": "EQ-SANY-SY750-07", "hourmeter": 100, "date": TODAY.isoformat()},
                                   {"equipment_tag": "EQ-XYZ-999", "hourmeter": 5000, "date": TODAY.isoformat()}],
                    pcm, "ARQUIVO SAP (CSV/JSON)", "horimetros_IK17.csv")
    await run_batch("CUSTOS_OM", [
        {"sap_om": "4000590", "component_tag": "CMP-MOT-3516E-001", "category": "MATERIAIS", "amount": "12500,00", "date": ago(300),
         "cost_center": "CC-1101", "supplier": "Sotreq", "order_status": "ENTE", "description": "Filtros e mangueiras"},
        {"sap_om": "4000590", "component_tag": "CMP-MOT-3516E-001", "category": "MATERIAIS", "amount": "12500,00", "date": ago(300)},
        {"sap_om": "4000611", "component_tag": "CMP-TRN-793F-002", "category": "INSPECAO", "amount": "3200", "date": ago(200),
         "cost_center": "CC-1101", "order_status": "ENTE"},
        {"sap_om": "4000777", "component_tag": "CMP-NAO-EXISTE-99", "category": "MATERIAIS", "amount": "800", "date": ago(10)},
        {"sap_om": "4000778", "component_tag": "CMP-MOT-DC13-007", "category": "COMBUSTIVEL", "amount": "950", "date": ago(9)},
    ], pcm, "ARQUIVO SAP (CSV/JSON)", "custos_IW39.csv")
    await run_batch("MATERIAIS", [{"sap_code": "40019283", "description": "MOTOR DIESEL CAT 3516E HD REMAN", "pn": "245-1289"},
                                  {"sap_code": "40021877", "description": "TRANSMISSAO PLANETARIA 793F", "pn": "380-4422"}],
                    pcm, "ARQUIVO SAP (CSV/JSON)", "materiais_MM60.csv")
    print(f"Seed OK — {len(comps)} componentes, {len(eq)} equipamentos, usuários senha {PASSWORD}")


if __name__ == "__main__":
    asyncio.run(main())
