import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { COST_LABEL, errMsg, fmtBRL, fmtDate, fmtH, qs, todayLocal } from "@/lib/format";
import { useComponents, useFamilies, useRefreshAll } from "@/lib/queries";
import type { CostCategory, CostEntry, LccView } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ExportButtons, Field, NSelect, PageHeader, Panel, Pill, SourceBadge, TagCmp, costLabel } from "@/components/common";

export default function Lcc() {
  const can = useCan();
  const refresh = useRefreshAll();
  const { data: fams } = useFamilies();
  const { data: comps } = useComponents();
  const [f, setF] = useState({ family_id: "", q: "" });
  const [scope, setScope] = useState<"total" | "reform">("total");
  const { data, isError } = useQuery({ queryKey: ["lcc", qs(f)], queryFn: () => apiGet<LccView[]>(`/lcc${qs(f)}`) });
  const [sel, setSel] = useState<LccView | null>(null);
  const [cost, setCost] = useState<{ component_id: string; life_number: string; category: CostCategory; amount: string; date: string; description: string; sap_document: string } | null>(null);
  const add = useMutation({
    mutationFn: () => apiPost<CostEntry>("/costs", { ...cost!, life_number: Number(cost!.life_number), amount: Number(cost!.amount), description: cost!.description || null, sap_document: cost!.sap_document || null }),
    onSuccess: () => { toast.success("Custo lançado (origem manual)"); setCost(null); setSel(null); refresh(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const rows = isError ? [] : data ?? [];
  const selComp = comps?.find((c) => c.id === cost?.component_id);
  return (
    <div>
      <PageHeader eyebrow="Life Cycle Cost" title="LCC e custos" subtitle="Custo acumulado = soma dos custos vinculados ao mesmo componente físico. Custo/h = custo do escopo ÷ horas acumuladas no mesmo escopo. Parcelas identificadas por categoria e origem."
        actions={<>
          <ExportButtons reportKey="lcc_custo_hora" params={f} testidPrefix="lcc" />
          {can("custos") && <Button data-testid="cost-new-button" onClick={() => setCost({ component_id: "", life_number: "1", category: "MATERIAIS", amount: "", date: todayLocal(), description: "", sap_document: "" })} className="bg-hydro text-white hover:bg-hydro-dark"><Plus className="size-4" />Lançar custo</Button>}
        </>} />
      <Panel>
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
          <Input data-testid="lcc-search-input" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="TAG, SAP, PN ou série" className="h-9 md:max-w-xs" />
          <NSelect testid="lcc-filter-family" value={f.family_id} onChange={(v) => setF({ ...f, family_id: v })} className="md:w-56"><option value="">Todas as famílias (comparar equivalentes)</option>{fams?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</NSelect>
          <NSelect testid="lcc-scope" value={scope} onChange={(v) => setScope(v as "total" | "reform")} className="md:w-72"><option value="total">Escopo: ciclo total (com aquisição)</option><option value="reform">Escopo: reformas e outros (sem aquisição)</option></NSelect>
        </div>
        {rows.length === 0 ? <EmptyState>Nenhum componente.</EmptyState> : (
          <Table>
            <TableHeader><TableRow><TableHead>Componente</TableHead><TableHead>Família / modelo</TableHead><TableHead>Vida</TableHead><TableHead className="text-right">Aquisição</TableHead><TableHead className="text-right">Reformas + outros</TableHead>
              <TableHead className="text-right">LCC acumulado</TableHead><TableHead className="text-right">Custo vida atual</TableHead><TableHead className="text-right">Horas</TableHead><TableHead className="text-right">R$/h ({scope === "total" ? "total" : "s/ aquisição"})</TableHead><TableHead>Resultado</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((l) => {
                const cph = scope === "total" ? l.cost_per_hour_total : l.cost_per_hour_reform;
                return (
                  <TableRow key={l.component_id} data-testid={`lcc-row-${l.component_tag}`} className="cursor-pointer hover:bg-mist/70" onClick={() => setSel(l)}>
                    <TableCell><TagCmp tag={l.component_tag ?? ""} /></TableCell>
                    <TableCell className="text-[12.5px]">{l.family_name ?? "—"}<div className="text-steel">{l.model}</div></TableCell>
                    <TableCell className="font-mono">{l.current_life}ª</TableCell>
                    <TableCell className="text-right font-mono text-[12.5px]">{l.acquisition_cost ? fmtBRL(l.acquisition_cost) : <Pill tone="inconsistencia">Não informado</Pill>}</TableCell>
                    <TableCell className="text-right font-mono text-[12.5px]">{fmtBRL(l.reform_and_other_cost)}</TableCell>
                    <TableCell className="text-right font-mono text-[12.5px] font-medium">{fmtBRL(scope === "total" ? l.total_cost : l.reform_and_other_cost)}</TableCell>
                    <TableCell className="text-right font-mono text-[12.5px]">{fmtBRL(l.current_life_cost)}</TableCell>
                    <TableCell className="text-right font-mono text-[12.5px]">{fmtH(l.hours_total)}</TableCell>
                    <TableCell data-testid={`lcc-cph-${l.component_tag}`} className="text-right font-mono">{cph != null ? fmtBRL(cph) : "—"}</TableCell>
                    <TableCell>{l.partial ? <Pill tone="parcial" testid={`lcc-partial-${l.component_tag}`}>Parcial ({l.partial_reasons.length})</Pill> : <Pill tone="normal">Completo</Pill>}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <p className="mt-3 text-[12px] text-steel">Resultados marcados como parcial possuem dados ausentes ou vida em andamento — não são estimativas apresentadas como valores reais.</p>
      </Panel>

      <Sheet open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader><SheetTitle>LCC — {sel?.component_tag}</SheetTitle></SheetHeader>
          {sel && (
            <div className="space-y-4 px-4 pb-6">
              {sel.partial && <div className="rounded-md border border-[#7DD3FC] bg-[#E0F2FE] p-3 text-[12.5px] text-[#0C4A6E]"><b>Resultado parcial:</b><ul className="mt-1">{sel.partial_reasons.map((r) => <li key={r}>• {r}</li>)}</ul></div>}
              <div>
                <div className="mb-1 text-[12px] font-medium uppercase tracking-wide text-steel">Por categoria</div>
                <Table><TableBody>{sel.by_category.map((c) => <TableRow key={c.category}><TableCell>{c.label}</TableCell><TableCell className="text-right font-mono">{fmtBRL(c.amount)}</TableCell></TableRow>)}
                  <TableRow><TableCell className="font-medium">Total</TableCell><TableCell className="text-right font-mono font-medium">{fmtBRL(sel.total_cost)}</TableCell></TableRow></TableBody></Table>
              </div>
              <div>
                <div className="mb-1 text-[12px] font-medium uppercase tracking-wide text-steel">Custo por vida</div>
                <Table><TableHeader><TableRow><TableHead>Vida</TableHead><TableHead className="text-right">Horas</TableHead><TableHead className="text-right">Custo</TableHead><TableHead className="text-right">R$/h</TableHead></TableRow></TableHeader>
                  <TableBody>{sel.per_life.map((p) => <TableRow key={p.life_number}><TableCell className="font-mono">{p.life_number}ª {p.in_progress && <Pill tone="parcial">em andamento</Pill>}</TableCell><TableCell className="text-right font-mono">{fmtH(p.hours)}</TableCell><TableCell className="text-right font-mono">{fmtBRL(p.cost)}</TableCell><TableCell className="text-right font-mono">{p.cost_per_hour != null ? fmtBRL(p.cost_per_hour) : "—"}</TableCell></TableRow>)}</TableBody></Table>
                <p className="mt-1 text-[11.5px] text-steel">Custos de reforma são atribuídos à vida que a reforma prepara (vida seguinte). Aquisição pertence à 1ª vida.</p>
              </div>
              <div>
                <div className="mb-1 text-[12px] font-medium uppercase tracking-wide text-steel">Lançamentos</div>
                <Table><TableBody>{sel.items.map((it, i) => <TableRow key={i}><TableCell className="font-mono text-[11.5px]">{fmtDate(it.date)}</TableCell><TableCell className="text-[12px]">{costLabel(it.category)}<div className="text-steel">{it.description}</div></TableCell><TableCell className="font-mono">{it.life_number}ª</TableCell><TableCell><SourceBadge source={it.source} /></TableCell><TableCell className="text-right font-mono">{fmtBRL(it.amount)}</TableCell></TableRow>)}</TableBody></Table>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!cost} onOpenChange={(o) => !o && setCost(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Lançar custo</DialogTitle><DialogDescription>Custos de reforma devem ser lançados na própria reforma. Aquisição fica no cadastro do componente.</DialogDescription></DialogHeader>
          {cost && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Componente" required className="col-span-2"><NSelect testid="cost-form-component" value={cost.component_id} onChange={(v) => setCost({ ...cost, component_id: v, life_number: String(comps?.find((c) => c.id === v)?.current_life ?? 1) })}><option value="">Selecione…</option>{comps?.map((c) => <option key={c.id} value={c.id}>{c.tag}</option>)}</NSelect></Field>
              <Field label="Vida" required><NSelect testid="cost-form-life" value={cost.life_number} onChange={(v) => setCost({ ...cost, life_number: v })}>{Array.from({ length: selComp?.current_life ?? 1 }, (_, i) => <option key={i} value={i + 1}>{i + 1}ª vida</option>)}</NSelect></Field>
              <Field label="Categoria" required><NSelect testid="cost-form-category" value={cost.category} onChange={(v) => setCost({ ...cost, category: v as CostCategory })}>{(Object.keys(COST_LABEL) as CostCategory[]).filter((k) => k !== "AQUISICAO").map((k) => <option key={k} value={k}>{COST_LABEL[k]}</option>)}</NSelect></Field>
              <Field label="Valor (R$)" required><Input data-testid="cost-form-amount" type="number" min={0} value={cost.amount} onChange={(e) => setCost({ ...cost, amount: e.target.value })} className="font-mono" /></Field>
              <Field label="Data" required><Input data-testid="cost-form-date" type="date" value={cost.date} onChange={(e) => setCost({ ...cost, date: e.target.value })} /></Field>
              <Field label="Descrição"><Input data-testid="cost-form-description" value={cost.description} onChange={(e) => setCost({ ...cost, description: e.target.value })} /></Field>
              <Field label="Documento / OM SAP"><Input data-testid="cost-form-sap-doc" value={cost.sap_document} onChange={(e) => setCost({ ...cost, sap_document: e.target.value })} className="font-mono" /></Field>
            </div>
          )}
          <DialogFooter><Button data-testid="cost-form-submit" disabled={add.isPending || !cost?.component_id || !cost?.amount} onClick={() => add.mutate()} className="bg-hydro text-white hover:bg-hydro-dark">Lançar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
