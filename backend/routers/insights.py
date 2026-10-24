import io
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from lib.auth import current_user
from lib.db import db
from lib.domain import REFORM_OPEN, lcc_of, life_hours, lives_of, load_context, reform_total, summarize, turnaround_days
from models.schemas import Dashboard, ReportData
from routers.components import build_history, match

router = APIRouter()

STATUS_LABEL = {"LIBERADO": "Liberado p/ instalação", "INSTALADO": "Instalado", "REMOVIDO": "Removido",
                "AGUARDANDO_REFORMA": "Aguardando reforma", "REFORMA_INTERNA": "Em reforma interna",
                "REFORMA_EXTERNA": "Em reforma externa", "SUCATEADO": "Substituído / baixado"}
LIFE_LABEL = {"NORMAL": "Normal", "ATENCAO": "Atenção (próximo da meta)", "ACIMA_META": "Acima da meta",
              "META_NAO_DEFINIDA": "Meta não definida"}


def _in_period(d: str | None, df: str | None, dt: str | None) -> bool:
    if not d:
        return not (df or dt)
    return (not df or d >= df) and (not dt or d <= dt)


def _filtered(ctx: dict, f: dict) -> list[dict]:
    out = []
    for c in ctx["components"]:
        v = summarize(c, ctx)
        if not match(v, f.get("q"), f.get("status"), f.get("family_id"), f.get("life"), f.get("manufacturer"),
                     f.get("equipment"), f.get("model")):
            continue
        if f.get("supplier") or f.get("reform_type"):
            rs = ctx["reforms"][c["id"]]
            if f.get("supplier") and not any((r.get("supplier") or "").lower() == f["supplier"].lower() for r in rs):
                continue
            if f.get("reform_type") and not any(r["type"] == f["reform_type"] for r in rs):
                continue
        out.append(v)
    return out


def _reform_rows(ctx: dict, comps: list[dict], f: dict) -> list[dict]:
    ids = {c["id"] for c in comps}
    rows = []
    for r in ctx["all_reforms"]:
        if r["component_id"] not in ids or (f.get("reform_type") and r["type"] != f["reform_type"]):
            continue
        if f.get("supplier") and (r.get("supplier") or "").lower() != f["supplier"].lower():
            continue
        if not _in_period(r.get("sent_date") or r["created_at"][:10], f.get("date_from"), f.get("date_to")):
            continue
        comp = next(c for c in comps if c["id"] == r["component_id"])
        nxt = None
        if r["status"] == "CONCLUIDO" and int(comp["current_life"]) > int(r["life_number"]):
            a, b = life_hours(comp, int(r["life_number"]) + 1, ctx)
            nxt = a + b
        rows.append({**r, "total_cost": reform_total(r), "turnaround_days": turnaround_days(r), "next_life_hours": nxt})
    return rows


def _avg(vals: list) -> float | None:
    vals = [v for v in vals if v is not None]
    return round(sum(vals) / len(vals), 1) if vals else None


def _filters(manufacturer=None, equipment=None, model=None, q=None, family_id=None, life=None, date_from=None,
             date_to=None, supplier=None, reform_type=None, status=None, component_id=None) -> dict:
    return {k: v for k, v in locals().items() if v not in (None, "")}


@router.get("/dashboard", response_model=Dashboard)
async def dashboard(manufacturer: str | None = None, equipment: str | None = None, model: str | None = None,
                    q: str | None = None, family_id: str | None = None, life: int | None = None,
                    date_from: str | None = None, date_to: str | None = None, supplier: str | None = None,
                    reform_type: str | None = None, _: dict = Depends(current_user)):
    f = _filters(manufacturer, equipment, model, q, family_id, life, date_from, date_to, supplier, reform_type)
    ctx = await load_context()
    comps = _filtered(ctx, f)
    st = defaultdict(int)
    for c in comps:
        st[c["status"]] += 1
    reforms = _reform_rows(ctx, comps, f)
    lccs = [lcc_of(c, ctx) for c in comps]
    tot_cost = sum(x["total_cost"] for x in lccs)
    tot_hours = sum(x["hours_total"] for x in lccs)
    reform_cost = sum(r["total_cost"] or 0 for r in reforms)

    life_hours_map: dict[int, list[float]] = defaultdict(list)
    cost_life: dict[int, float] = defaultdict(float)
    for c, lc in zip(comps, lccs):
        for lv in lives_of(c, ctx):
            if lv["status"] != "EM_ANDAMENTO":
                life_hours_map[lv["life_number"]].append(lv["hours"])
        for pl in lc["per_life"]:
            cost_life[pl["life_number"]] += pl["cost"]
    ids = {c["id"] for c in comps}
    trend: dict[str, float] = defaultdict(float)
    for m in ctx["all_movs"]:
        if m["component_id"] in ids and m["status"] == "ENCERRADA" and _in_period(m["removal_date"], date_from, date_to):
            trend[m["removal_date"][:7]] += float(m["hours_worked"] or 0)
    ranking = sorted(
        [{"tag": c["tag"], "family": c.get("family_name") or "—", "cost_per_hour": lc["cost_per_hour_total"],
          "partial": lc["partial"]} for c, lc in zip(comps, lccs) if lc["cost_per_hour_total"] is not None],
        key=lambda x: -x["cost_per_hour"])[:12]
    fam_cmp: dict[str, list] = defaultdict(list)
    for c, lc in zip(comps, lccs):
        fam_cmp[c.get("family_name") or "Sem família"].append(lc)
    family_comparison = [{"family": k, "components": len(v), "avg_cost_per_hour": _avg([x["cost_per_hour_total"] for x in v]),
                          "avg_hours": _avg([x["hours_total"] for x in v])} for k, v in fam_cmp.items()]
    reform_comparison = []
    for t in ("INTERNA", "EXTERNA"):
        rs = [r for r in reforms if r["type"] == t]
        done = [r for r in rs if r["status"] == "CONCLUIDO"]
        reform_comparison.append({
            "type": t, "label": "Interna" if t == "INTERNA" else "Externa", "count": len(rs), "concluded": len(done),
            "in_progress": sum(1 for r in rs if r["status"] in REFORM_OPEN),
            "rejected": sum(1 for r in rs if r["status"] == "REPROVADO"),
            "avg_cost": _avg([r["total_cost"] for r in done]), "avg_turnaround_days": _avg([r["turnaround_days"] for r in done]),
            "avg_next_life_hours": _avg([r["next_life_hours"] for r in done]),
        })
    attention = [{"id": c["id"], "tag": c["tag"], "description": c["description"], "life": c["current_life"],
                  "life_pct": c["life_pct"], "life_status": c["life_status"], "alerts": c["alerts"],
                  "equipment": c["current_equipment_tag"]} for c in comps if c["alerts"]]
    attention.sort(key=lambda x: -(x["life_pct"] or 0))
    kpis = {
        "total": len(comps), "installed": st["INSTALADO"], "removed": st["REMOVIDO"],
        "awaiting_reform": st["AGUARDANDO_REFORMA"], "reform_internal": st["REFORMA_INTERNA"],
        "reform_external": st["REFORMA_EXTERNA"], "released": st["LIBERADO"], "scrapped": st["SUCATEADO"],
        "near_target": sum(1 for c in comps if c["life_status"] == "ATENCAO" and c["status"] == "INSTALADO"),
        "above_target": sum(1 for c in comps if c["life_status"] == "ACIMA_META" and c["status"] == "INSTALADO"),
        "fourth_life": sum(1 for c in comps if c["current_life"] == 4 and c["status"] != "SUCATEADO"),
        "incomplete": sum(1 for c in comps if c["incomplete"]),
        "validation_pending": sum(1 for c in comps if c["validation_pending"]),
        "reform_cost_total": round(reform_cost, 2), "lcc_total": round(tot_cost, 2),
        "avg_cost_per_hour": round(tot_cost / tot_hours, 2) if tot_hours else None,
        "cost_partial": any(x["partial"] for x in lccs), "hours_total": round(tot_hours, 1),
    }
    return Dashboard(
        kpis=kpis,
        avg_hours_by_life=[{"life": f"{n}ª vida", "avg_hours": _avg(life_hours_map.get(n, [])), "closed": len(life_hours_map.get(n, [])),
                            "target": None} for n in range(1, 5)],
        cost_by_life=[{"life": f"{n}ª vida", "cost": round(cost_life.get(n, 0), 2)} for n in range(1, 5)],
        hours_trend=[{"month": k, "hours": round(v, 1)} for k, v in sorted(trend.items())],
        cost_per_hour_ranking=ranking, family_comparison=family_comparison, reform_comparison=reform_comparison,
        attention_list=attention[:15],
        filter_options={
            "manufacturers": sorted({c["manufacturer"] for c in ctx["components"]} | {e["manufacturer"] for e in ctx["equipment"].values()}),
            "models": sorted({c["model"] for c in ctx["components"]}),
            "equipment": sorted(e["tag"] for e in ctx["equipment"].values()),
            "families": [{"id": x["id"], "name": x["name"]} for x in ctx["families"].values()],
            "suppliers": sorted({r["supplier"] for r in ctx["all_reforms"] if r.get("supplier")}),
        },
    )


# ---------------- reports ----------------
REPORTS = {
    "historico": "Histórico completo de componentes",
    "instalacoes_equipamento": "Instalações e remoções por equipamento",
    "horas_por_vida": "Horas trabalhadas por vida",
    "fabricante_modelo": "Componentes por fabricante e modelo",
    "quarta_vida": "Componentes na 4ª vida",
    "abaixo_meta": "Componentes com desempenho abaixo da meta",
    "reformas_int_ext": "Reformas internas x externas",
    "custo_componente_vida": "Custo por componente e por vida",
    "lcc_custo_hora": "LCC e custo por hora",
    "aguardando_reforma": "Componentes aguardando reforma",
    "divergencias_horimetro": "Registros com divergência de horímetro",
    "sap_pendentes": "Dados SAP pendentes de sincronização",
}


def _cols(*pairs: str) -> list[dict]:
    return [{"key": p.split(":")[0], "label": p.split(":")[1]} for p in pairs]


async def build_report(key: str, f: dict) -> ReportData:
    if key not in REPORTS:
        raise HTTPException(404, "Relatório não encontrado")
    ctx = await load_context()
    comps = _filtered(ctx, f)
    ids = {c["id"] for c in comps}
    rows: list[dict] = []
    df, dt = f.get("date_from"), f.get("date_to")
    if key == "historico":
        cols = _cols("component:Componente (TAG)", "date:Data", "life:Vida", "type:Evento", "text:Detalhe", "by:Responsável")
        for c in comps:
            if f.get("component_id") and c["id"] != f["component_id"]:
                continue
            for e in await build_history(c):
                if _in_period(e["date"], df, dt):
                    rows.append({"component": c["tag"], **e})
    elif key == "instalacoes_equipamento":
        cols = _cols("equipment_tag:TAG equipamento", "component_tag:TAG componente", "life_number:Vida", "install_date:Instalação",
                     "install_hourmeter:Horím. inst. (h)", "removal_date:Remoção", "removal_hourmeter:Horím. rem. (h)",
                     "hours_worked:Horas trabalhadas", "removal_reason:Motivo", "install_om:OM", "status:Situação")
        for m in sorted(ctx["all_movs"], key=lambda m: (m["equipment_tag"], m["install_date"])):
            if m["component_id"] in ids and _in_period(m["install_date"], df, dt):
                rows.append({**m, "status": "Aberta (instalado)" if m["status"] == "ABERTA" else "Encerrada"})
    elif key in ("horas_por_vida", "abaixo_meta", "custo_componente_vida"):
        cols = _cols("tag:TAG componente", "family:Família", "life_number:Vida", "status:Situação da vida", "hours:Horas",
                     "target:Meta (h)", "pct:% meta", "early_reason:Motivo encerramento antecipado")
        if key == "custo_componente_vida":
            cols = _cols("tag:TAG componente", "family:Família", "life_number:Vida", "hours:Horas", "cost:Custo da vida (R$)",
                         "cost_per_hour:Custo/h (R$/h)", "status:Situação da vida")
        for c in comps:
            for lv in lives_of(c, ctx):
                if key == "abaixo_meta" and not (lv["status"] != "EM_ANDAMENTO" and lv["target"] and lv["hours"] < lv["target"]):
                    continue
                rows.append({"tag": c["tag"], "family": c.get("family_name"), **lv,
                             "target": lv["target"] if lv["target"] else "Não definida"})
    elif key == "fabricante_modelo":
        cols = _cols("manufacturer:Fabricante", "model:Modelo", "family:Família", "count:Qtd.", "installed:Instalados",
                     "avg_hours:Horas médias acumuladas")
        grp: dict[tuple, list] = defaultdict(list)
        for c in comps:
            grp[(c["manufacturer"], c["model"], c.get("family_name") or "—")].append(c)
        for (mf, md, fm), cs in sorted(grp.items()):
            rows.append({"manufacturer": mf, "model": md, "family": fm, "count": len(cs),
                         "installed": sum(1 for c in cs if c["status"] == "INSTALADO"), "avg_hours": _avg([c["total_hours"] for c in cs])})
    elif key in ("quarta_vida", "aguardando_reforma"):
        cols = _cols("tag:TAG componente", "description:Descrição", "sap_code:Código SAP", "serial:Nº série", "status:Status",
                     "location:Localização", "life_hours:Horas vida atual", "life_target:Meta (h)", "alerts:Alertas")
        for c in comps:
            if (key == "quarta_vida" and c["current_life"] == 4) or (key == "aguardando_reforma" and c["status"] == "AGUARDANDO_REFORMA"):
                rows.append({**c, "status": STATUS_LABEL[c["status"]], "life_target": c["life_target"] or "Não definida",
                             "alerts": "; ".join(c["alerts"])})
    elif key == "reformas_int_ext":
        cols = _cols("component_tag:TAG componente", "type:Tipo", "supplier:Fornecedor/Oficina", "status:Status", "sent_date:Envio",
                     "release_date:Liberação", "turnaround_days:Prazo (dias)", "total_cost:Custo total (R$)",
                     "next_life_hours:Horas vida seguinte", "approved:Aprovada")
        for r in _reform_rows(ctx, comps, f):
            rows.append({**r, "approved": {True: "Sim", False: "Não"}.get(r.get("approved"), "Pendente"),
                         "total_cost": r["total_cost"] if r["total_cost"] is not None else "Não informado"})
    elif key == "lcc_custo_hora":
        cols = _cols("tag:TAG componente", "family:Família", "life:Vida atual", "acq:Aquisição (R$)", "reform:Reformas+outros (R$)",
                     "total:LCC total (R$)", "hours:Horas acumuladas", "cph:Custo/h total (R$/h)", "cph_r:Custo/h s/ aquisição (R$/h)",
                     "partial:Resultado")
        for c in comps:
            lc = lcc_of(c, ctx)
            rows.append({"tag": c["tag"], "family": c.get("family_name"), "life": c["current_life"], "acq": lc["acquisition_cost"],
                         "reform": lc["reform_and_other_cost"], "total": lc["total_cost"], "hours": lc["hours_total"],
                         "cph": lc["cost_per_hour_total"], "cph_r": lc["cost_per_hour_reform"],
                         "partial": "PARCIAL: " + "; ".join(lc["partial_reasons"]) if lc["partial"] else "Completo"})
    elif key == "divergencias_horimetro":
        cols = _cols("origin:Origem", "ref:Referência", "date:Data", "message:Divergência")
        for m in ctx["all_movs"]:
            if m["component_id"] in ids:
                for inc in m.get("inconsistencies") or []:
                    rows.append({"origin": "Movimentação (manual)", "ref": f"{m['component_tag']} / {m['equipment_tag']}",
                                 "date": m.get("removal_date"), "message": inc})
        async for b in db.sap_batches.find({"entity": "HORIMETROS"}, {"_id": 0}):
            for e in b["errors"]:
                if "horímetro" in (e["message"] or "").lower():
                    rows.append({"origin": "SAP (arquivo)", "ref": e["data"].get("equipment_tag"), "date": e["data"].get("date"),
                                 "message": e["message"]})
    else:  # sap_pendentes
        cols = _cols("batch:Lote", "entity:Entidade", "at:Data/hora", "row:Linha", "kind:Tipo", "message:Mensagem")
        async for b in db.sap_batches.find({"reprocessed": False}, {"_id": 0}).sort("started_at", -1):
            for e in b["errors"]:
                if e["kind"] != "DUPLICIDADE":
                    rows.append({"batch": b["id"][:8], "entity": b["entity"], "at": b["started_at"][:16].replace("T", " "),
                                 "row": e["row"], "kind": e["kind"], "message": e["message"]})
    clean = [{c["key"]: r.get(c["key"]) for c in cols} for r in rows]
    return ReportData(key=key, title=REPORTS[key], columns=cols, rows=clean,
                      generated_at=datetime.now(timezone.utc).isoformat())


def _fmt(v) -> str:
    if v is None:
        return "—"
    if isinstance(v, float):
        return f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return str(v)


def to_xlsx(rep: ReportData) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    wb = Workbook()
    ws = wb.active
    ws.title = rep.key[:30]
    ws.append([rep.title])
    ws["A1"].font = Font(bold=True, size=13)
    ws.append([f"Gerado em {rep.generated_at[:16].replace('T', ' ')} UTC — Component Life Cycle Control"])
    ws.append([c["label"] for c in rep.columns])
    for cell in ws[3]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="444D55")
    for r in rep.rows:
        ws.append([r.get(c["key"]) if not isinstance(r.get(c["key"]), (list, dict)) else str(r.get(c["key"])) for c in rep.columns])
    for i, _ in enumerate(rep.columns, start=1):
        ws.column_dimensions[ws.cell(row=3, column=i).column_letter].width = 20
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def to_pdf(rep: ReportData) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=24, rightMargin=24, topMargin=24, bottomMargin=24)
    ss = getSampleStyleSheet()
    cell = ss["BodyText"].clone("c", fontSize=7, leading=9)
    head = ss["BodyText"].clone("h", fontSize=7, leading=9, textColor=colors.white, fontName="Helvetica-Bold")
    data = [[Paragraph(c["label"], head) for c in rep.columns]]
    for r in rep.rows:
        data.append([Paragraph(_fmt(r.get(c["key"])), cell) for c in rep.columns])
    if len(data) == 1:
        data.append([Paragraph("Nenhum registro para os filtros selecionados", cell)] + [""] * (len(rep.columns) - 1))
    t = Table(data, repeatRows=1, colWidths=[(landscape(A4)[0] - 48) / len(rep.columns)] * len(rep.columns))
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#444D55")),
                           ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#D2D7DC")),
                           ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F4F4F4")]),
                           ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    doc.build([Paragraph(f"<b>{rep.title}</b>", ss["Title"]),
               Paragraph(f"Component Life Cycle Control · gerado em {rep.generated_at[:16].replace('T', ' ')} UTC · {len(rep.rows)} registros", ss["Normal"]),
               Spacer(1, 10), t])
    return buf.getvalue()


@router.get("/reports", response_model=list[dict])
async def list_reports(_: dict = Depends(current_user)):
    return [{"key": k, "title": v} for k, v in REPORTS.items()]


@router.get("/reports/{key}", response_model=None)
async def get_report(key: str, format: str = "json", manufacturer: str | None = None, equipment: str | None = None,
                     model: str | None = None, q: str | None = None, family_id: str | None = None, life: int | None = None,
                     date_from: str | None = None, date_to: str | None = None, supplier: str | None = None,
                     reform_type: str | None = None, status: str | None = None, component_id: str | None = None,
                     _: dict = Depends(current_user)):
    f = _filters(manufacturer, equipment, model, q, family_id, life, date_from, date_to, supplier, reform_type, status, component_id)
    rep = await build_report(key, f)
    if format == "xlsx":
        return StreamingResponse(io.BytesIO(to_xlsx(rep)), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                 headers={"Content-Disposition": f'attachment; filename="{key}.xlsx"'})
    if format == "pdf":
        return StreamingResponse(io.BytesIO(to_pdf(rep)), media_type="application/pdf",
                                 headers={"Content-Disposition": f'attachment; filename="{key}.pdf"'})
    return rep
