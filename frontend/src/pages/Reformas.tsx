import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BadgeCheck, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { REFORM_STATUS_LABEL, errMsg, fmtBRL, fmtDate, fmtH, qs, todayLocal } from "@/lib/format";
import { useComponents, useRefreshAll } from "@/lib/queries";
import type { Reform, ReformPatch } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ExportButtons, Field, NSelect, PageHeader, Panel, Pill, TagCmp } from "@/components/common";
import type { Tone } from "@/components/common";

const DATE_FIELDS_INT: [keyof ReformPatch, string][] = [["sent_date", "Envio para reforma"], ["workshop_entry_date", "Entrada na oficina"], ["service_start", "Início do serviço"], ["service_end", "Término do serviço"]];
const DATE_FIELDS_EXT: [keyof ReformPatch, string][] = [["sent_date", "Data de envio"], ["return_date", "Data de retorno"]];
const TEXT_INT: [keyof ReformPatch, string][] = [["service_type", "Tipo de serviço executado"], ["materials", "Materiais utilizados"], ["technician", "Responsável técnico"]];
const TEXT_EXT: [keyof ReformPatch, string][] = [["supplier", "Fornecedor / empresa contratada"], ["sap_reference", "OM / referência SAP"], ["shipping_doc", "Documento de envio"], ["warranty", "Garantia"], ["supplier_report", "Relatório técnico do fornecedor"]];
const COSTS: [keyof ReformPatch, string][] = [["cost_service", "Serviço de reforma"], ["cost_materials", "Materiais e peças"], ["cost_labor", "Mão de obra"], ["cost_transport", "Transporte"], ["cost_inspection", "Inspeção e testes"], ["cost_other", "Outros"]];

function overdue(r: Reform): boolean {
  if (r.status !== "EM_EXECUCAO" || !r.sent_date || r.deadline_days == null) return false;
  const due = new Date(r.sent_date); due.setDate(due.getDate() + r.deadline_days);
  return due.toISOString().slice(0, 10) < todayLocal();
}
function tone(r: Reform): Tone {
  if (overdue(r)) return "atraso";
  return ({ CONCLUIDO: "normal", REPROVADO: "atraso", AGUARDANDO_ENVIO: "atencao" } as Record<string, Tone>)[r.status] ?? "parcial";
}

export default function Reformas() {
  const can = useCan();
  const refresh = useRefreshAll();
  const [f, setF] = useState({ type: "", status: "" });
  const { data, isError } = useQuery({ queryKey: ["reforms", qs(f)], queryFn: () => apiGet<Reform[]>(`/reforms${qs(f)}`) });
  const { data: comps } = useComponents();
  const [edit, setEdit] = useState<{ r: Reform; p: ReformPatch } | null>(null);
  const [concl, setConcl] = useState<{ r: Reform; approved: string; inspection_result: string; release_date: string; new_condition: string } | null>(null);
  const [nova, setNova] = useState<{ component_id: string; type: "INTERNA" | "EXTERNA"; supplier: string } | null>(null);
  const save = useMutation({
    mutationFn: () => apiPatch<Reform>(`/reforms/${edit!.r.id}`, edit!.p),
    onSuccess: (r) => { toast.success(`Reforma atualizada — ${REFORM_STATUS_LABEL[r.status]}`); setEdit(null); refresh(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const conclude = useMutation({
    mutationFn: () => apiPost<Reform>(`/reforms/${concl!.r.id}/conclude`, { approved: concl!.approved === "sim", inspection_result: concl!.inspection_result, release_date: concl!.release_date, new_condition: concl!.new_condition }),
    onSuccess: (r) => { toast.success(r.status === "CONCLUIDO" ? "Reforma aprovada — componente liberado para instalação" : "Reforma reprovada — componente aguarda nova reforma"); setConcl(null); refresh(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const create = useMutation({
    mutationFn: () => apiPost<Reform>("/reforms", { ...nova!, supplier: nova!.supplier || null, notes: null }),
    onSuccess: () => { toast.success("Reforma aberta"); setNova(null); refresh(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const rows = isError ? [] : data ?? [];
  const eligible = (comps ?? []).filter((c) => (c.status === "AGUARDANDO_REFORMA" || c.status === "REMOVIDO") && !rows.some((r) => r.component_id === c.id && ["AGUARDANDO_ENVIO", "EM_EXECUCAO", "RETORNADO"].includes(r.status)));
  const setP = (k: keyof ReformPatch, num?: boolean) => (v: string) => setEdit((e) => e && { ...e, p: { ...e.p, [k]: v === "" ? null : num ? Number(v) : v } });

  return (
    <div>
      <PageHeader eyebrow="Recuperação" title="Reformas internas e externas" subtitle="Uma reforma só é concluída após confirmação do retorno, inspeção e liberação do componente."
        actions={<>
          <ExportButtons reportKey="reformas_int_ext" testidPrefix="reforms" />
          {can("reforma") && <Button data-testid="reform-new-button" onClick={() => setNova({ component_id: "", type: "INTERNA", supplier: "" })} className="bg-hydro text-white hover:bg-hydro-dark"><Plus className="size-4" />Abrir reforma</Button>}
        </>} />
      <Panel>
        <div className="mb-4 flex flex-col gap-3 md:flex-row">
          <NSelect testid="reforms-filter-type" value={f.type} onChange={(v) => setF({ ...f, type: v })} className="md:w-48"><option value="">Interna e externa</option><option value="INTERNA">Interna</option><option value="EXTERNA">Externa</option></NSelect>
          <NSelect testid="reforms-filter-status" value={f.status} onChange={(v) => setF({ ...f, status: v })} className="md:w-64"><option value="">Todos os status</option>{Object.entries(REFORM_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NSelect>
        </div>
        {rows.length === 0 ? <EmptyState>Nenhuma reforma.</EmptyState> : (
          <Table>
            <TableHeader><TableRow><TableHead>Componente</TableHead><TableHead>Tipo</TableHead><TableHead>Após vida</TableHead><TableHead>Fornecedor / oficina</TableHead><TableHead>Envio</TableHead><TableHead>Retorno / término</TableHead>
              <TableHead className="text-right">Prazo</TableHead><TableHead className="text-right">Custo total</TableHead><TableHead className="text-right">Horas vida seguinte</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} data-testid={`reform-row-${r.component_tag}`}>
                  <TableCell><TagCmp tag={r.component_tag} /></TableCell>
                  <TableCell>{r.type === "INTERNA" ? "Interna" : "Externa"}</TableCell>
                  <TableCell className="font-mono">{r.life_number}ª</TableCell>
                  <TableCell className="text-[13px]">{r.supplier ?? (r.type === "INTERNA" ? "Oficina interna" : "—")}</TableCell>
                  <TableCell className="font-mono text-[12px]">{fmtDate(r.sent_date)}</TableCell>
                  <TableCell className="font-mono text-[12px]">{fmtDate(r.type === "EXTERNA" ? r.return_date : r.service_end)}</TableCell>
                  <TableCell className="text-right font-mono text-[12px]">{r.turnaround_days != null ? `${r.turnaround_days} d` : r.deadline_days != null ? `meta ${r.deadline_days} d` : "—"}</TableCell>
                  <TableCell className="text-right font-mono">{r.total_cost != null ? fmtBRL(r.total_cost) : <Pill tone="parcial">Não informado</Pill>}</TableCell>
                  <TableCell className="text-right font-mono">{fmtH(r.next_life_hours)}</TableCell>
                  <TableCell><Pill tone={tone(r)} testid={`reform-status-${r.component_tag}`}>{overdue(r) ? "Em atraso" : REFORM_STATUS_LABEL[r.status]}</Pill></TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {can("reforma") && !["CONCLUIDO", "REPROVADO"].includes(r.status) && <Button data-testid={`reform-edit-button-${r.component_tag}`} size="icon-sm" variant="ghost" title="Atualizar etapas e custos" onClick={() => setEdit({ r, p: {} })}><Pencil className="size-4" /></Button>}
                    {can("concluir_reforma") && r.status === "RETORNADO" && <Button data-testid={`reform-conclude-button-${r.component_tag}`} size="sm" variant="outline" onClick={() => setConcl({ r, approved: "sim", inspection_result: "", release_date: todayLocal(), new_condition: "Reformado" })}><BadgeCheck className="size-4" />Inspecionar e liberar</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader><DialogTitle>Reforma {edit?.r.type === "INTERNA" ? "interna" : "externa"} — {edit?.r.component_tag}</DialogTitle>
            <DialogDescription>Preencha as etapas conforme ocorrem. O status avança automaticamente (envio → execução → retorno).</DialogDescription></DialogHeader>
          {edit && (() => {
            const v = (k: keyof ReformPatch) => String((edit.p[k] !== undefined ? edit.p[k] : edit.r[k]) ?? "");
            const int = edit.r.type === "INTERNA";
            return (
              <div className="grid gap-3 sm:grid-cols-3">
                {(int ? DATE_FIELDS_INT : DATE_FIELDS_EXT).map(([k, l]) => <Field key={k} label={l}><Input data-testid={`reform-form-${k}`} type="date" max={todayLocal()} value={v(k)} onChange={(e) => setP(k)(e.target.value)} /></Field>)}
                {!int && <Field label="Prazo de atendimento (dias)"><Input data-testid="reform-form-deadline_days" type="number" min={0} value={v("deadline_days")} onChange={(e) => setP("deadline_days", true)(e.target.value)} /></Field>}
                {int && <Field label="Mão de obra (h)"><Input data-testid="reform-form-labor_hours" type="number" min={0} value={v("labor_hours")} onChange={(e) => setP("labor_hours", true)(e.target.value)} /></Field>}
                {(int ? TEXT_INT : TEXT_EXT).map(([k, l]) => <Field key={k} label={l}><Input data-testid={`reform-form-${k}`} value={v(k)} onChange={(e) => setP(k)(e.target.value)} /></Field>)}
                <div className="sm:col-span-3 mt-1 text-[12px] font-medium uppercase tracking-wide text-steel">Custos (R$) — deixe em branco se não conhecido</div>
                {COSTS.map(([k, l]) => <Field key={k} label={l}><Input data-testid={`reform-form-${k}`} type="number" min={0} value={v(k)} onChange={(e) => setP(k, true)(e.target.value)} className="font-mono" /></Field>)}
                <Field label="Observações" className="sm:col-span-3"><Textarea data-testid="reform-form-notes" value={v("notes")} onChange={(e) => setP("notes")(e.target.value)} rows={2} /></Field>
              </div>
            );
          })()}
          <DialogFooter><Button data-testid="reform-form-submit" disabled={save.isPending} onClick={() => save.mutate()} className="bg-hydro text-white hover:bg-hydro-dark">Salvar etapa</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!concl} onOpenChange={(o) => !o && setConcl(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Inspeção de recebimento e liberação</DialogTitle><DialogDescription>{concl?.r.component_tag} · reforma {concl?.r.type.toLowerCase()}</DialogDescription></DialogHeader>
          {concl && (
            <div className="grid gap-3">
              <Field label="Resultado do serviço" required><NSelect testid="conclude-form-approved" value={concl.approved} onChange={(v) => setConcl({ ...concl, approved: v })}><option value="sim">Aprovado — liberar para instalação</option><option value="nao">Reprovado — retrabalho necessário</option></NSelect></Field>
              <Field label="Resultado da inspeção" required><Input data-testid="conclude-form-inspection" value={concl.inspection_result} onChange={(e) => setConcl({ ...concl, inspection_result: e.target.value })} /></Field>
              <Field label="Data de liberação" required><Input data-testid="conclude-form-release-date" type="date" max={todayLocal()} value={concl.release_date} onChange={(e) => setConcl({ ...concl, release_date: e.target.value })} /></Field>
              <Field label="Nova condição do componente" required><Input data-testid="conclude-form-condition" value={concl.new_condition} onChange={(e) => setConcl({ ...concl, new_condition: e.target.value })} /></Field>
            </div>
          )}
          <DialogFooter><Button data-testid="conclude-form-submit" disabled={conclude.isPending} onClick={() => conclude.mutate()} className="bg-hydro text-white hover:bg-hydro-dark">Confirmar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!nova} onOpenChange={(o) => !o && setNova(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Abrir reforma</DialogTitle><DialogDescription>Para componentes removidos ou com reforma anterior reprovada.</DialogDescription></DialogHeader>
          {nova && (
            <div className="grid gap-3">
              <Field label="Componente" required><NSelect testid="new-reform-component" value={nova.component_id} onChange={(v) => setNova({ ...nova, component_id: v })}><option value="">Selecione…</option>{eligible.map((c) => <option key={c.id} value={c.id}>{c.tag} · {c.description}</option>)}</NSelect></Field>
              <Field label="Tipo" required><NSelect testid="new-reform-type" value={nova.type} onChange={(v) => setNova({ ...nova, type: v as "INTERNA" | "EXTERNA" })}><option value="INTERNA">Interna</option><option value="EXTERNA">Externa</option></NSelect></Field>
              {nova.type === "EXTERNA" && <Field label="Fornecedor" required><Input data-testid="new-reform-supplier" value={nova.supplier} onChange={(e) => setNova({ ...nova, supplier: e.target.value })} /></Field>}
            </div>
          )}
          <DialogFooter><Button data-testid="new-reform-submit" disabled={create.isPending || !nova?.component_id} onClick={() => create.mutate()} className="bg-hydro text-white hover:bg-hydro-dark">Abrir</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
