import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCheck, LogIn, LogOut, Pencil } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPut } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { LIFE_STATUS_LABEL, REFORM_STATUS_LABEL, errMsg, fmtBRL, fmtDate, fmtDateTime, fmtH } from "@/lib/format";
import { useRefreshAll } from "@/lib/queries";
import type { Component, ComponentIn, ComponentView, HistoryEvent, LccView, LifeView, Movement, Reform } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ComponentStatusBadge, EmptyState, ExportButtons, LifeProgress, LifeStatusBadge, PageHeader, Panel, Pill, SapCode, SourceBadge, TagCmp, TagEq, costLabel } from "@/components/common";
import { InstallDialog, RemoveDialog, ValidateLifeDialog } from "@/components/dialogs";
import { ComponentForm, cleanComponent } from "@/pages/Componentes";

const EV_LABEL: Record<string, string> = { CADASTRO: "Cadastro", INSTALACAO: "Instalação", REMOCAO: "Remoção", REFORMA_ENVIO: "Envio p/ reforma", REFORMA_CONCLUSAO: "Conclusão de reforma", VALIDACAO_VIDA: "Validação de vida" };

export function LifeCards({ lives }: { lives: LifeView[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" data-testid="life-cards">
      {[1, 2, 3, 4].map((n) => {
        const lv = lives.find((l) => l.life_number === n);
        return (
          <div key={n} data-testid={`life-card-${n}`} className={`rounded-md border p-4 ${lv ? "border-[#E2E6EA] bg-white" : "border-dashed border-line bg-white/50"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-heading text-[17px] font-semibold whitespace-nowrap">{n}ª vida</div>
              {lv ? <Pill tone={lv.status === "EM_ANDAMENTO" ? "info" : lv.status === "ENCERRADA_ANTECIPADA" ? "atencao" : "neutral"}>{LIFE_STATUS_LABEL[lv.status] ?? lv.status}</Pill> : <Pill tone="neutral">Não iniciada</Pill>}
            </div>
            {lv ? (
              <div className="mt-3 space-y-2 text-[13px]">
                <LifeProgress hours={lv.hours} target={lv.target} status={lv.life_status} />
                {lv.status !== "EM_ANDAMENTO" && lv.target && lv.hours < lv.target
                  ? <Pill tone="atencao">Abaixo da meta</Pill>
                  : <LifeStatusBadge status={lv.life_status} />}
                <div className="grid grid-cols-2 gap-1 font-mono text-[12px] text-steel">
                  <span>Início</span><span className="text-ink">{fmtDate(lv.started_at)}</span>
                  <span>Instalações</span><span className="text-ink">{lv.movements_count}</span>
                  <span>Custo da vida</span><span className="text-ink">{fmtBRL(lv.cost)}</span>
                  <span>R$/h</span><span className="text-ink">{lv.cost_per_hour != null ? fmtBRL(lv.cost_per_hour) : "—"}</span>
                </div>
                {lv.hours_running > 0 && <div className="text-[11.5px] text-steel">Inclui {fmtH(lv.hours_running)} em andamento (parcial, pelo horímetro atual)</div>}
                {lv.early_reason && <div className="rounded bg-[#FEF3C7] px-2 py-1 text-[12px] text-[#78350F]">Antecipada: {lv.early_reason}</div>}
                {lv.validated_by && <div className="text-[11.5px] text-steel">Validada por {lv.validated_by} em {fmtDateTime(lv.validated_at)}</div>}
                {lv.reforms_after.map((r) => <div key={r.id} className="text-[11.5px] text-steel">→ Reforma {r.type.toLowerCase()}: {REFORM_STATUS_LABEL[r.status]}</div>)}
              </div>
            ) : <div className="mt-3 text-[12.5px] text-steel">Meta conforme família. Inicia após validação da vida anterior.</div>}
          </div>
        );
      })}
    </div>
  );
}

export default function ComponenteDetalhe() {
  const { id = "" } = useParams();
  const can = useCan();
  const refresh = useRefreshAll();
  const c = useQuery({ queryKey: ["component", id], queryFn: () => apiGet<ComponentView>(`/components/${id}`) });
  const lives = useQuery({ queryKey: ["lives", id], queryFn: () => apiGet<LifeView[]>(`/components/${id}/lives`) });
  const hist = useQuery({ queryKey: ["history", id], queryFn: () => apiGet<HistoryEvent[]>(`/components/${id}/history`) });
  const movs = useQuery({ queryKey: ["movements", id], queryFn: () => apiGet<Movement[]>(`/movements?component_id=${id}`) });
  const refs = useQuery({ queryKey: ["reforms", id], queryFn: () => apiGet<Reform[]>(`/reforms?component_id=${id}`) });
  const lcc = useQuery({ queryKey: ["lcc", id], queryFn: () => apiGet<LccView>(`/components/${id}/lcc`) });
  const [install, setInstall] = useState(false);
  const [removeMov, setRemoveMov] = useState<Movement | null>(null);
  const [validate, setValidate] = useState<ComponentView | null>(null);
  const [edit, setEdit] = useState<ComponentIn | null>(null);
  const save = useMutation({
    mutationFn: () => apiPut<Component>(`/components/${id}`, cleanComponent(edit!)),
    onSuccess: () => { toast.success("Componente atualizado (alteração auditada)"); setEdit(null); refresh(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const comp = c.isError ? undefined : c.data;
  const openMov = movs.data?.find((m) => m.status === "ABERTA") ?? null;

  return (
    <div>
      <Link to="/componentes" data-testid="back-to-components" className="mb-3 inline-flex items-center gap-1 text-[13px] text-steel hover:text-ink"><ArrowLeft className="size-4" />Componentes</Link>
      <PageHeader eyebrow="Ficha do componente" title={comp?.description ?? "Componente"}
        subtitle={comp ? `${comp.manufacturer} · ${comp.model} · família ${comp.family_name ?? "não vinculada"} · compatível com ${comp.compatible_equipment ?? "—"}` : undefined}
        actions={comp && <>
          {can("movimentacao") && (comp.status === "LIBERADO" || comp.status === "REMOVIDO") && <Button data-testid="detail-install-button" onClick={() => setInstall(true)} className="bg-hydro text-white hover:bg-hydro-dark"><LogIn className="size-4" />Instalar</Button>}
          {can("movimentacao") && openMov && <Button data-testid="detail-remove-button" variant="outline" onClick={() => setRemoveMov(openMov)}><LogOut className="size-4" />Remover</Button>}
          {can("validar_vida") && comp.validation_pending && <Button data-testid="detail-validate-button" variant="outline" onClick={() => setValidate(comp)}><CheckCheck className="size-4" />Validar vida</Button>}
          {can("cadastro") && <Button data-testid="detail-edit-button" variant="ghost" onClick={() => setEdit({ tag: comp.tag, description: comp.description, sap_code: comp.sap_code, pn: comp.pn, serial: comp.serial, manufacturer: comp.manufacturer, model: comp.model, family_id: comp.family_id, compatible_equipment: comp.compatible_equipment, location: comp.location, acquisition_cost: comp.acquisition_cost, acquisition_date: comp.acquisition_date, responsible: comp.responsible, notes: comp.notes })}><Pencil className="size-4" />Editar</Button>}
        </>} />
      {comp && (
        <div className="mb-5 grid gap-3 md:grid-cols-[1.3fr_1fr]">
          <Panel>
            <div className="flex flex-wrap items-center gap-2" data-testid="detail-identifiers">
              <TagCmp tag={comp.tag} /><SapCode code={comp.sap_code} pn={comp.pn} /><span className="font-mono text-[12px] text-steel">Série {comp.serial || "—"}</span>
              <ComponentStatusBadge status={comp.status} testid="detail-status" /><SourceBadge source={comp.source} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] md:grid-cols-3">
              <div><div className="text-steel">Equipamento atual</div><TagEq tag={comp.current_equipment_tag} /></div>
              <div><div className="text-steel">Localização</div><div>{comp.location}</div></div>
              <div><div className="text-steel">Vida atual</div><div data-testid="detail-current-life" className="font-mono">{comp.current_life}ª vida</div></div>
              <div><div className="text-steel">Última instalação</div><div className="font-mono">{fmtDate(comp.last_install_date)} · {fmtH(comp.last_install_hourmeter)}</div></div>
              <div><div className="text-steel">Última remoção</div><div className="font-mono">{fmtDate(comp.last_removal_date)} · {fmtH(comp.last_removal_hourmeter)}</div></div>
              <div><div className="text-steel">Horas acumuladas (ciclo)</div><div className="font-mono">{fmtH(comp.total_hours)}</div></div>
              <div><div className="text-steel">Responsável</div><div>{comp.responsible}</div></div>
              <div className="col-span-2"><div className="text-steel">Observações técnicas</div><div>{comp.notes || "—"}</div></div>
            </div>
          </Panel>
          <Panel title="Vida atual">
            <LifeProgress hours={comp.life_hours} target={comp.life_target} status={comp.life_status} />
            <div className="mt-3 flex flex-wrap gap-1.5"><LifeStatusBadge status={comp.life_status} testid="detail-life-status" />
              {comp.alerts.map((a) => <Pill key={a} tone={a.includes("4ª") ? "atraso" : "atencao"}>{a}</Pill>)}
              {comp.validation_pending && <Pill tone="atencao" testid="detail-validation-pending">Aguardando validação da vida</Pill>}
              {comp.incomplete.map((a) => <Pill key={a} tone="inconsistencia">{a}</Pill>)}
            </div>
          </Panel>
        </div>
      )}
      <Tabs defaultValue="vidas">
        <TabsList variant="line" className="mb-4">
          <TabsTrigger value="vidas" data-testid="tab-lives">Vidas</TabsTrigger>
          <TabsTrigger value="historico" data-testid="tab-history">Histórico cronológico</TabsTrigger>
          <TabsTrigger value="movimentos" data-testid="tab-movements">Movimentações</TabsTrigger>
          <TabsTrigger value="reformas" data-testid="tab-reforms">Reformas</TabsTrigger>
          <TabsTrigger value="lcc" data-testid="tab-lcc">LCC</TabsTrigger>
        </TabsList>
        <TabsContent value="vidas"><LifeCards lives={lives.data ?? []} /></TabsContent>
        <TabsContent value="historico">
          <Panel title="Linha do tempo" actions={<ExportButtons reportKey="historico" params={{ component_id: id }} testidPrefix="history" />}>
            <ol className="relative ml-2 border-l border-line" data-testid="history-timeline">
              {(hist.data ?? []).map((e, i) => (
                <li key={i} className="mb-4 ml-5">
                  <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full border-2 border-white bg-hydro" />
                  <div className="flex flex-wrap items-center gap-2 text-[12px]"><span className="font-mono text-steel">{fmtDate(e.date)}</span><Pill tone="info">{EV_LABEL[e.type] ?? e.type}</Pill><span className="font-mono text-steel">vida {e.life}</span></div>
                  <div className="mt-0.5 text-[13.5px]">{e.text}</div>
                  {e.by && <div className="text-[11.5px] text-steel">Responsável: {e.by}</div>}
                </li>
              ))}
            </ol>
          </Panel>
        </TabsContent>
        <TabsContent value="movimentos">
          <Panel>
            <Table>
              <TableHeader><TableRow><TableHead>Equipamento</TableHead><TableHead>Vida</TableHead><TableHead>Instalação</TableHead><TableHead>Remoção</TableHead><TableHead className="text-right">Horas</TableHead><TableHead>Motivo / destino</TableHead><TableHead>Sinalização</TableHead></TableRow></TableHeader>
              <TableBody>
                {(movs.data ?? []).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell><TagEq tag={m.equipment_tag} /></TableCell><TableCell className="font-mono">{m.life_number}ª</TableCell>
                    <TableCell className="font-mono text-[12px]">{fmtDate(m.install_date)}<br />{fmtH(m.install_hourmeter)}</TableCell>
                    <TableCell className="font-mono text-[12px]">{m.removal_date ? <>{fmtDate(m.removal_date)}<br />{fmtH(m.removal_hourmeter)}</> : "Instalado"}</TableCell>
                    <TableCell className="text-right font-mono">{m.status === "ENCERRADA" ? fmtH(m.hours_worked) : <span className="text-steel">{fmtH(m.running_hours)} (parcial)</span>}</TableCell>
                    <TableCell className="text-[12.5px]">{m.removal_reason ?? "—"}{m.destination && <div className="text-steel">→ {m.destination}</div>}</TableCell>
                    <TableCell><div className="flex flex-col items-start gap-1">{m.early_removal && <Pill tone="atencao">Remoção antecipada</Pill>}{m.inconsistencies.map((x) => <Pill key={x} tone="inconsistencia">{x}</Pill>)}{m.revisions.length > 0 && <Pill tone="parcial">{m.revisions.length} correção(ões)</Pill>}</div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </TabsContent>
        <TabsContent value="reformas">
          <Panel>
            {(refs.data ?? []).length === 0 ? <EmptyState>Sem reformas registradas.</EmptyState> : (
              <Table>
                <TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Após vida</TableHead><TableHead>Fornecedor / oficina</TableHead><TableHead>Envio</TableHead><TableHead>Liberação</TableHead><TableHead className="text-right">Prazo</TableHead><TableHead className="text-right">Custo</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>{refs.data!.map((r) => (
                  <TableRow key={r.id}><TableCell>{r.type === "INTERNA" ? "Interna" : "Externa"}</TableCell><TableCell className="font-mono">{r.life_number}ª</TableCell><TableCell>{r.supplier ?? (r.type === "INTERNA" ? "Oficina interna" : "—")}</TableCell>
                    <TableCell className="font-mono text-[12px]">{fmtDate(r.sent_date)}</TableCell><TableCell className="font-mono text-[12px]">{fmtDate(r.release_date)}</TableCell>
                    <TableCell className="text-right font-mono">{r.turnaround_days != null ? `${r.turnaround_days} d` : "—"}</TableCell><TableCell className="text-right font-mono">{fmtBRL(r.total_cost)}</TableCell>
                    <TableCell><Pill tone={r.status === "CONCLUIDO" ? "normal" : r.status === "REPROVADO" ? "atraso" : "parcial"}>{REFORM_STATUS_LABEL[r.status]}</Pill></TableCell></TableRow>
                ))}</TableBody>
              </Table>
            )}
          </Panel>
        </TabsContent>
        <TabsContent value="lcc">
          {lcc.data && (
            <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
              <Panel title="Resumo do ciclo de vida">
                <dl className="grid grid-cols-2 gap-y-2 text-[13px]">
                  <dt className="text-steel">Custo de aquisição</dt><dd className="text-right font-mono">{fmtBRL(lcc.data.acquisition_cost)}</dd>
                  <dt className="text-steel">Reformas e outros</dt><dd className="text-right font-mono">{fmtBRL(lcc.data.reform_and_other_cost)}</dd>
                  <dt className="font-medium">LCC acumulado</dt><dd data-testid="detail-lcc-total" className="text-right font-mono font-medium">{fmtBRL(lcc.data.total_cost)}</dd>
                  <dt className="text-steel">Custo da vida atual</dt><dd className="text-right font-mono">{fmtBRL(lcc.data.current_life_cost)}</dd>
                  <dt className="text-steel">Horas acumuladas</dt><dd className="text-right font-mono">{fmtH(lcc.data.hours_total)}</dd>
                  <dt className="text-steel">R$/h (com aquisição)</dt><dd className="text-right font-mono">{lcc.data.cost_per_hour_total != null ? fmtBRL(lcc.data.cost_per_hour_total) : "—"}</dd>
                  <dt className="text-steel">R$/h (sem aquisição)</dt><dd className="text-right font-mono">{lcc.data.cost_per_hour_reform != null ? fmtBRL(lcc.data.cost_per_hour_reform) : "—"}</dd>
                </dl>
                {lcc.data.partial && <div className="mt-3 flex flex-col items-start gap-1"><Pill tone="parcial">Resultado parcial</Pill>{lcc.data.partial_reasons.map((r) => <span key={r} className="text-[12px] text-steel">• {r}</span>)}</div>}
              </Panel>
              <Panel title="Lançamentos considerados">
                <Table>
                  <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Categoria</TableHead><TableHead>Vida</TableHead><TableHead>Descrição</TableHead><TableHead>Origem</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
                  <TableBody>{lcc.data.items.map((it, i) => (
                    <TableRow key={i}><TableCell className="font-mono text-[12px]">{fmtDate(it.date)}</TableCell><TableCell className="text-[12.5px]">{costLabel(it.category)}</TableCell><TableCell className="font-mono">{it.life_number}ª</TableCell>
                      <TableCell className="text-[12.5px]">{it.description}</TableCell><TableCell><SourceBadge source={it.source} /></TableCell><TableCell className="text-right font-mono">{fmtBRL(it.amount)}</TableCell></TableRow>
                  ))}</TableBody>
                </Table>
              </Panel>
            </div>
          )}
        </TabsContent>
      </Tabs>
      {install && <InstallDialog open={install} onClose={() => setInstall(false)} componentId={id} />}
      {removeMov && <RemoveDialog mov={removeMov} comp={comp} onClose={() => setRemoveMov(null)} />}
      {validate && <ValidateLifeDialog comp={validate} onClose={() => setValidate(null)} />}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader><DialogTitle>Editar componente</DialogTitle></DialogHeader>
          {edit && <ComponentForm form={edit} setForm={setEdit} />}
          <DialogFooter><Button data-testid="component-edit-submit" disabled={save.isPending} onClick={() => save.mutate()} className="bg-hydro text-white hover:bg-hydro-dark">Salvar alterações</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
