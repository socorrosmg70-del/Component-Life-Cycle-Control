import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Gauge, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { EQ_STATUS_LABEL, errMsg, fmtDate, fmtH, qs, todayLocal } from "@/lib/format";
import { useManufacturers, useRefreshAll } from "@/lib/queries";
import type { Equipment, EquipmentIn } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, Field, NSelect, PageHeader, Panel, Pill, SourceBadge, TagEq } from "@/components/common";

const BLANK: EquipmentIn = { tag: "", manufacturer: "", model: "", serial: null, equipment_type: "", area: "", hourmeter: 0, status: "OPERANDO", cost_center: null };
const TONE = { OPERANDO: "normal", MANUTENCAO: "atencao", PARADO: "atraso", INATIVO: "neutral" } as const;

export default function Equipamentos() {
  const [sp] = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [mf, setMf] = useState("");
  const can = useCan();
  const refresh = useRefreshAll();
  const { data: mans } = useManufacturers();
  const { data, isError } = useQuery({ queryKey: ["equipment", q, mf], queryFn: () => apiGet<Equipment[]>(`/equipment${qs({ q, manufacturer: mf })}`) });
  const [edit, setEdit] = useState<{ id: string | null; form: EquipmentIn } | null>(null);
  const [hm, setHm] = useState<{ eq: Equipment; value: string; date: string } | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const body = { ...edit!.form, serial: edit!.form.serial || null, cost_center: edit!.form.cost_center || null };
      return edit!.id ? apiPut<Equipment>(`/equipment/${edit!.id}`, body) : apiPost<Equipment>("/equipment", body);
    },
    onSuccess: (e) => { toast.success(`Equipamento ${e.tag} salvo`); setEdit(null); refresh(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const saveHm = useMutation({
    mutationFn: () => apiPost<Equipment>(`/equipment/${hm!.eq.id}/hourmeter`, { hourmeter: Number(hm!.value), date: hm!.date }),
    onSuccess: (e) => { toast.success(`Horímetro de ${e.tag} atualizado`); setHm(null); refresh(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const upd = (k: keyof EquipmentIn) => (v: string) => setEdit((p) => p && { ...p, form: { ...p.form, [k]: k === "hourmeter" ? Number(v) : v } });
  const rows = isError ? [] : data ?? [];

  return (
    <div>
      <PageHeader eyebrow="Cadastro" title="Equipamentos" subtitle="Máquinas pesadas por fabricante e modelo. A TAG do equipamento é distinta da TAG do componente e do código SAP do material."
        actions={can("cadastro") && <Button data-testid="equipment-new-button" onClick={() => setEdit({ id: null, form: BLANK })} className="bg-hydro text-white hover:bg-hydro-dark"><Plus className="size-4" />Novo equipamento</Button>} />
      <Panel>
        <div className="mb-4 flex flex-col gap-3 md:flex-row">
          <Input data-testid="equipment-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por TAG, modelo, série, área…" className="h-9 md:max-w-sm" />
          <NSelect testid="equipment-filter-manufacturer" value={mf} onChange={setMf} className="md:w-56"><option value="">Todos os fabricantes</option>{mans?.map((m) => <option key={m.id}>{m.name}</option>)}</NSelect>
        </div>
        {rows.length === 0 ? <EmptyState>Nenhum equipamento encontrado.</EmptyState> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>TAG equipamento</TableHead><TableHead>Fabricante / modelo</TableHead><TableHead>Nº série</TableHead><TableHead>Tipo</TableHead><TableHead>Área</TableHead>
              <TableHead className="text-right">Horímetro atual</TableHead><TableHead>Últ. atualização</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Comp. instalados</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id} data-testid={`equipment-row-${e.tag}`}>
                  <TableCell><TagEq tag={e.tag} /><div className="mt-1"><SourceBadge source={e.source} /></div></TableCell>
                  <TableCell><div className="font-medium">{e.manufacturer}</div><div className="text-[12px] text-steel">{e.model}</div></TableCell>
                  <TableCell className="font-mono text-[12px]">{e.serial || "—"}</TableCell>
                  <TableCell className="text-[13px]">{e.equipment_type}</TableCell>
                  <TableCell className="text-[13px]">{e.area}</TableCell>
                  <TableCell data-testid={`equipment-hourmeter-${e.tag}`} className="text-right font-mono">{fmtH(e.hourmeter)}</TableCell>
                  <TableCell className="font-mono text-[12px]">{fmtDate(e.hourmeter_updated_at)}</TableCell>
                  <TableCell><Pill tone={TONE[e.status]}>{EQ_STATUS_LABEL[e.status]}</Pill></TableCell>
                  <TableCell className="text-right font-mono">{e.installed_components}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {can("movimentacao") && <Button data-testid={`equipment-hourmeter-button-${e.tag}`} variant="ghost" size="icon-sm" title="Atualizar horímetro" onClick={() => setHm({ eq: e, value: String(e.hourmeter), date: todayLocal() })}><Gauge className="size-4" /></Button>}
                    {can("cadastro") && <Button data-testid={`equipment-edit-button-${e.tag}`} variant="ghost" size="icon-sm" title="Editar" onClick={() => { const { id, ...rest } = e; setEdit({ id, form: { tag: rest.tag, manufacturer: rest.manufacturer, model: rest.model, serial: rest.serial, equipment_type: rest.equipment_type, area: rest.area, hourmeter: rest.hourmeter, status: rest.status, cost_center: rest.cost_center } }); }}><Pencil className="size-4" /></Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{edit?.id ? "Editar equipamento" : "Novo equipamento"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="TAG da máquina" required hint="Padrão PREFIXO-NÚMERO: TE trator de esteira · CA caminhão · ES escavadeira · CR rodoviário"><Input data-testid="equipment-form-tag" value={edit.form.tag} onChange={(e) => upd("tag")(e.target.value)} placeholder="TE-8015" className="font-mono uppercase" /></Field>
              <Field label="Fabricante" required hint="Novos fabricantes: Administração"><NSelect testid="equipment-form-manufacturer" value={edit.form.manufacturer} onChange={upd("manufacturer")}><option value="">Selecione…</option>{mans?.map((m) => <option key={m.id}>{m.name}</option>)}</NSelect></Field>
              <Field label="Modelo" required><Input data-testid="equipment-form-model" value={edit.form.model} onChange={(e) => upd("model")(e.target.value)} /></Field>
              <Field label="Nº de série"><Input data-testid="equipment-form-serial" value={edit.form.serial ?? ""} onChange={(e) => upd("serial")(e.target.value)} className="font-mono" /></Field>
              <Field label="Tipo de equipamento" required><Input data-testid="equipment-form-type" value={edit.form.equipment_type} onChange={(e) => upd("equipment_type")(e.target.value)} placeholder="Caminhão fora de estrada" /></Field>
              <Field label="Unidade / área" required><Input data-testid="equipment-form-area" value={edit.form.area} onChange={(e) => upd("area")(e.target.value)} /></Field>
              <Field label="Horímetro atual (h)" required hint={edit.id ? "Não pode ser reduzido" : undefined}><Input data-testid="equipment-form-hourmeter" type="number" min={0} value={edit.form.hourmeter} onChange={(e) => upd("hourmeter")(e.target.value)} className="font-mono" /></Field>
              <Field label="Status operacional"><NSelect testid="equipment-form-status" value={edit.form.status} onChange={upd("status")}>{Object.entries(EQ_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NSelect></Field>
              <Field label="Centro de custo"><Input data-testid="equipment-form-cost-center" value={edit.form.cost_center ?? ""} onChange={(e) => upd("cost_center")(e.target.value)} className="font-mono" /></Field>
            </div>
          )}
          <DialogFooter><Button data-testid="equipment-form-submit" onClick={() => save.mutate()} disabled={save.isPending} className="bg-hydro text-white hover:bg-hydro-dark">Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!hm} onOpenChange={(o) => !o && setHm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Atualizar horímetro — {hm?.eq.tag}</DialogTitle></DialogHeader>
          {hm && (
            <div className="grid gap-3">
              <p className="text-sm text-steel">Atual: <span className="font-mono text-ink">{fmtH(hm.eq.hourmeter)}</span>. Leituras inferiores são bloqueadas.</p>
              <Field label="Nova leitura (h)" required><Input data-testid="hourmeter-form-value" type="number" value={hm.value} onChange={(e) => setHm({ ...hm, value: e.target.value })} className="font-mono" /></Field>
              <Field label="Data da leitura" required><Input data-testid="hourmeter-form-date" type="date" value={hm.date} onChange={(e) => setHm({ ...hm, date: e.target.value })} /></Field>
            </div>
          )}
          <DialogFooter><Button data-testid="hourmeter-form-submit" onClick={() => saveHm.mutate()} disabled={saveHm.isPending} className="bg-hydro text-white hover:bg-hydro-dark">Registrar leitura</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
