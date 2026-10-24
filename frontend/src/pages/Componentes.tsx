import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import { useCan, useMe } from "@/lib/auth";
import { STATUS_LABEL, errMsg, qs } from "@/lib/format";
import { useFamilies, useManufacturers, useRefreshAll } from "@/lib/queries";
import type { Component, ComponentIn, ComponentView } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ComponentStatusBadge, EmptyState, ExportButtons, Field, LifeProgress, LifeStatusBadge, NSelect, PageHeader, Panel, Pill, SapCode, SourceBadge, TagCmp, TagEq } from "@/components/common";

export function blankComponent(responsible: string): ComponentIn {
  return { tag: "", description: "", sap_code: "", pn: "", serial: "", manufacturer: "", model: "", family_id: "", compatible_equipment: "", location: "Almoxarifado", acquisition_cost: null, acquisition_date: null, responsible, notes: "" };
}

export function ComponentForm({ form, setForm }: { form: ComponentIn; setForm: (f: ComponentIn) => void }) {
  const { data: fams } = useFamilies();
  const { data: mans } = useManufacturers();
  const set = (k: keyof ComponentIn) => (v: string) => setForm({ ...form, [k]: k === "acquisition_cost" ? (v === "" ? null : Number(v)) : v });
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="TAG do componente" required hint="Identificação física do componente"><Input data-testid="component-form-tag" value={form.tag} onChange={(e) => set("tag")(e.target.value)} className="font-mono" placeholder="CMP-MOT-3516E-012" /></Field>
      <Field label="Código SAP (material)" hint="Número do material no SAP"><Input data-testid="component-form-sap" value={form.sap_code ?? ""} onChange={(e) => set("sap_code")(e.target.value)} className="font-mono" /></Field>
      <Field label="Part Number (PN)"><Input data-testid="component-form-pn" value={form.pn ?? ""} onChange={(e) => set("pn")(e.target.value)} className="font-mono" /></Field>
      <Field label="Descrição" required className="sm:col-span-2"><Input data-testid="component-form-description" value={form.description} onChange={(e) => set("description")(e.target.value)} /></Field>
      <Field label="Nº de série"><Input data-testid="component-form-serial" value={form.serial ?? ""} onChange={(e) => set("serial")(e.target.value)} className="font-mono" /></Field>
      <Field label="Fabricante" required><NSelect testid="component-form-manufacturer" value={form.manufacturer} onChange={set("manufacturer")}><option value="">Selecione…</option>{mans?.map((m) => <option key={m.id}>{m.name}</option>)}</NSelect></Field>
      <Field label="Modelo" required><Input data-testid="component-form-model" value={form.model} onChange={(e) => set("model")(e.target.value)} /></Field>
      <Field label="Família (metas de vida)"><NSelect testid="component-form-family" value={form.family_id ?? ""} onChange={set("family_id")}><option value="">Selecione…</option>{fams?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</NSelect></Field>
      <Field label="Equipamento compatível"><Input data-testid="component-form-compatible" value={form.compatible_equipment ?? ""} onChange={(e) => set("compatible_equipment")(e.target.value)} placeholder="CAT 793F" /></Field>
      <Field label="Custo de aquisição (R$)"><Input data-testid="component-form-acq-cost" type="number" min={0} value={form.acquisition_cost ?? ""} onChange={(e) => set("acquisition_cost")(e.target.value)} className="font-mono" /></Field>
      <Field label="Data de aquisição"><Input data-testid="component-form-acq-date" type="date" value={form.acquisition_date ?? ""} onChange={(e) => set("acquisition_date")(e.target.value)} /></Field>
      <Field label="Responsável pelo registro" required><Input data-testid="component-form-responsible" value={form.responsible} onChange={(e) => set("responsible")(e.target.value)} /></Field>
      <Field label="Observações técnicas" className="sm:col-span-3"><Textarea data-testid="component-form-notes" value={form.notes ?? ""} onChange={(e) => set("notes")(e.target.value)} rows={2} /></Field>
    </div>
  );
}

export function cleanComponent(f: ComponentIn): ComponentIn {
  const n = (v: string | null) => (v && v.trim() ? v.trim() : null);
  return { ...f, sap_code: n(f.sap_code), pn: n(f.pn), serial: n(f.serial), family_id: n(f.family_id), compatible_equipment: n(f.compatible_equipment), acquisition_date: n(f.acquisition_date), notes: n(f.notes) };
}

export default function Componentes() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const can = useCan();
  const { data: me } = useMe();
  const refresh = useRefreshAll();
  const { data: fams } = useFamilies();
  const [f, setF] = useState({ q: "", status: sp.get("status") ?? "", family_id: "", life: "", equipment: "" });
  const { data, isError } = useQuery({ queryKey: ["components", qs(f)], queryFn: () => apiGet<ComponentView[]>(`/components${qs(f)}`) });
  const [form, setForm] = useState<ComponentIn | null>(null);
  const save = useMutation({
    mutationFn: () => apiPost<Component>("/components", cleanComponent(form!)),
    onSuccess: (c) => { toast.success(`Componente ${c.tag} cadastrado`); setForm(null); refresh(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const rows = isError ? [] : data ?? [];
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div>
      <PageHeader eyebrow="Cadastro centralizado" title="Componentes" subtitle="TAG do componente, código SAP/PN e TAG do equipamento são identificações distintas e exibidas separadamente."
        actions={<>
          <ExportButtons reportKey="historico" params={{ q: f.q, status: f.status, family_id: f.family_id }} testidPrefix="components" />
          {can("cadastro") && <Button data-testid="component-new-button" onClick={() => setForm(blankComponent(me?.name ?? ""))} className="bg-hydro text-white hover:bg-hydro-dark"><Plus className="size-4" />Novo componente</Button>}
        </>} />
      <Panel>
        <div className="mb-4 grid gap-3 md:grid-cols-5">
          <Input data-testid="components-search-input" value={f.q} onChange={(e) => set("q")(e.target.value)} placeholder="TAG, SAP, PN, descrição, série, modelo…" className="h-9 md:col-span-2" />
          <NSelect testid="components-filter-status" value={f.status} onChange={set("status")}><option value="">Todos os status</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NSelect>
          <NSelect testid="components-filter-family" value={f.family_id} onChange={set("family_id")}><option value="">Todas as famílias</option>{fams?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</NSelect>
          <Input data-testid="components-filter-equipment" value={f.equipment} onChange={(e) => set("equipment")(e.target.value)} placeholder="Equipamento (TAG)" className="h-9" />
        </div>
        {rows.length === 0 ? <EmptyState>Nenhum componente encontrado.</EmptyState> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>TAG componente</TableHead><TableHead>Material SAP / PN</TableHead><TableHead>Descrição</TableHead><TableHead>Equipamento atual</TableHead>
              <TableHead>Status</TableHead><TableHead>Vida</TableHead><TableHead className="min-w-[180px]">Horas na vida atual</TableHead><TableHead>Situação</TableHead><TableHead>Dados</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id} data-testid={`component-row-${c.tag}`} onClick={() => nav(`/componentes/${c.id}`)} className="cursor-pointer transition-colors hover:bg-mist/70">
                  <TableCell><TagCmp tag={c.tag} /><div className="mt-1 font-mono text-[11px] text-steel">Série {c.serial || "—"}</div></TableCell>
                  <TableCell><SapCode code={c.sap_code} pn={c.pn} /></TableCell>
                  <TableCell className="max-w-[220px]"><div className="truncate text-[13px]">{c.description}</div><div className="text-[11.5px] text-steel">{c.manufacturer} · {c.model} · {c.family_name ?? "sem família"}</div></TableCell>
                  <TableCell>{c.current_equipment_tag ? <TagEq tag={c.current_equipment_tag} /> : <span className="text-[12px] text-steel">{c.location}</span>}</TableCell>
                  <TableCell><ComponentStatusBadge status={c.status} testid={`component-status-${c.tag}`} /></TableCell>
                  <TableCell className="font-mono">{c.current_life}ª</TableCell>
                  <TableCell><LifeProgress hours={c.life_hours} target={c.life_target} status={c.life_status} /></TableCell>
                  <TableCell><div className="flex flex-col items-start gap-1"><LifeStatusBadge status={c.life_status} />{c.current_life === 4 && c.status !== "SUCATEADO" && <Pill tone="atraso">4ª vida</Pill>}{c.validation_pending && <Pill tone="atencao">Validar vida</Pill>}</div></TableCell>
                  <TableCell><div className="flex flex-col items-start gap-1"><SourceBadge source={c.source} />{c.incomplete.length > 0 && <Pill tone="inconsistencia">{c.incomplete.length} pendência(s)</Pill>}</div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader><DialogTitle>Novo componente</DialogTitle></DialogHeader>
          {form && <ComponentForm form={form} setForm={setForm} />}
          <DialogFooter><Button data-testid="component-form-submit" disabled={save.isPending} onClick={() => save.mutate()} className="bg-hydro text-white hover:bg-hydro-dark">Cadastrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
