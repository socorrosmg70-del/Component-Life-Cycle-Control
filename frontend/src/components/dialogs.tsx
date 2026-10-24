import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiPost } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { errMsg, fmtH, todayLocal } from "@/lib/format";
import { useComponents, useEquipment, useRefreshAll } from "@/lib/queries";
import type { ComponentView, LifeValidateIn, LifeView, Movement, ReformType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, NSelect, Pill, TagCmp, TagEq } from "@/components/common";

const primary = "bg-hydro text-white hover:bg-hydro-dark active:scale-[0.98]";

export function InstallDialog({ open, onClose, componentId }: { open: boolean; onClose: () => void; componentId?: string }) {
  const { data: me } = useMe();
  const { data: comps } = useComponents();
  const { data: eqs } = useEquipment();
  const refresh = useRefreshAll();
  const [f, setF] = useState({ component_id: componentId ?? "", equipment_id: "", install_date: todayLocal(), install_hourmeter: "", install_om: "", responsible: me?.name ?? "", notes: "" });
  const available = (comps ?? []).filter((c) => c.status === "LIBERADO" || c.status === "REMOVIDO" || c.id === componentId);
  const comp = comps?.find((c) => c.id === f.component_id);
  const eq = eqs?.find((e) => e.id === f.equipment_id);
  const hm = Number(f.install_hourmeter);
  const lowHm = eq && f.install_hourmeter !== "" && hm < eq.hourmeter;
  const m = useMutation({
    mutationFn: () => apiPost<Movement>("/movements/install", { ...f, install_hourmeter: hm, install_om: f.install_om || null, notes: f.notes || null }),
    onSuccess: (mv) => { toast.success(`${mv.component_tag} instalado em ${mv.equipment_tag} (vida ${mv.life_number})`); refresh(); onClose(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Registrar instalação</DialogTitle>
          <DialogDescription>O horímetro considerado é o da máquina em que o componente está sendo instalado.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Componente (TAG / série)" required>
            <NSelect testid="install-form-component" value={f.component_id} onChange={set("component_id")} disabled={!!componentId}>
              <option value="">Selecione…</option>
              {available.map((c) => <option key={c.id} value={c.id}>{c.tag} · {c.serial || "s/ série"} · vida {c.current_life}</option>)}
            </NSelect>
          </Field>
          <Field label="Equipamento (TAG)" required>
            <NSelect testid="install-form-equipment" value={f.equipment_id} onChange={(v) => { const e = eqs?.find((x) => x.id === v); setF((p) => ({ ...p, equipment_id: v, install_hourmeter: e ? String(e.hourmeter) : p.install_hourmeter })); }}>
              <option value="">Selecione…</option>
              {eqs?.filter((e) => e.status !== "INATIVO").map((e) => <option key={e.id} value={e.id}>{e.tag} · {e.manufacturer} {e.model}</option>)}
            </NSelect>
          </Field>
          <Field label="Data de instalação" required><Input data-testid="install-form-date" type="date" value={f.install_date} max={todayLocal()} onChange={(e) => set("install_date")(e.target.value)} /></Field>
          <Field label="Horímetro do equipamento na instalação (h)" required hint={eq ? `Horímetro atual de ${eq.tag}: ${fmtH(eq.hourmeter)}` : undefined}>
            <Input data-testid="install-form-hourmeter" type="number" min={0} value={f.install_hourmeter} onChange={(e) => set("install_hourmeter")(e.target.value)} className="font-mono" />
          </Field>
          <Field label="Número da vida"><Input data-testid="install-form-life" value={comp ? `${comp.current_life}ª vida (definida pelo histórico validado)` : "—"} readOnly className="bg-mist" /></Field>
          <Field label="Ordem de manutenção SAP (OM)"><Input data-testid="install-form-om" value={f.install_om} onChange={(e) => set("install_om")(e.target.value)} className="font-mono" placeholder="OM-4000xxx" /></Field>
          <Field label="Responsável pela instalação" required><Input data-testid="install-form-responsible" value={f.responsible} onChange={(e) => set("responsible")(e.target.value)} /></Field>
          <Field label="Observações"><Input data-testid="install-form-notes" value={f.notes} onChange={(e) => set("notes")(e.target.value)} /></Field>
        </div>
        {lowHm && <Pill tone="inconsistencia" testid="install-form-hourmeter-warning">Horímetro inferior ao atual do equipamento — será bloqueado se a data for posterior à última leitura</Pill>}
        <DialogFooter><Button data-testid="install-form-submit" disabled={m.isPending || !f.component_id || !f.equipment_id || f.install_hourmeter === ""} onClick={() => m.mutate()} className={primary}>Confirmar instalação</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveDialog({ mov, onClose, comp }: { mov: Movement | null; onClose: () => void; comp?: ComponentView }) {
  const { data: me } = useMe();
  const refresh = useRefreshAll();
  const [f, setF] = useState({ removal_date: todayLocal(), removal_hourmeter: "", removal_reason: "", removal_om: "", condition: "Desgaste normal", destination: "Oficina interna", reform_type: "INTERNA" as ReformType, reform_company: "", reform_cost: "", responsible: me?.name ?? "", notes: "" });
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const inst = mov?.install_hourmeter ?? 0;
  const hours = f.removal_hourmeter === "" ? null : Number(f.removal_hourmeter) - inst;
  const invalid = hours !== null && hours < 0;
  const dateInvalid = !!mov && f.removal_date < mov.install_date;
  const projected = comp && hours !== null && !invalid ? comp.life_hours - comp.life_hours_running + hours : null;
  const early = !!(comp?.life_target && projected !== null && projected < comp.life_target);
  const m = useMutation({
    mutationFn: () => apiPost<Movement>(`/movements/${mov!.id}/remove`, {
      ...f, removal_hourmeter: Number(f.removal_hourmeter), removal_om: f.removal_om || null, reform_company: f.reform_company || null,
      reform_cost: f.reform_cost === "" ? null : Number(f.reform_cost), notes: f.notes || null,
    }),
    onSuccess: (mv) => { toast.success(`Remoção registrada: ${fmtH(mv.hours_worked)} trabalhadas${mv.early_removal ? " — remoção antecipada" : ""}`); refresh(); onClose(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Dialog open={!!mov} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader><DialogTitle>Registrar remoção</DialogTitle>
          {mov && <DialogDescription className="flex flex-wrap items-center gap-2"><TagCmp tag={mov.component_tag} /> em <TagEq tag={mov.equipment_tag} /> · instalado em {mov.install_date} com {fmtH(mov.install_hourmeter)} · vida {mov.life_number}</DialogDescription>}
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Data de remoção" required><Input data-testid="remove-form-date" type="date" value={f.removal_date} max={todayLocal()} onChange={(e) => set("removal_date")(e.target.value)} /></Field>
          <Field label="Horímetro do equipamento na remoção (h)" required><Input data-testid="remove-form-hourmeter" type="number" value={f.removal_hourmeter} onChange={(e) => set("removal_hourmeter")(e.target.value)} className="font-mono" /></Field>
          <div className="rounded-md border border-line bg-mist px-3 py-2">
            <div className="text-[11.5px] uppercase tracking-wide text-steel">Horas trabalhadas</div>
            <div data-testid="remove-form-hours-calculated" className="font-mono text-[22px] text-ink">{hours === null ? "—" : fmtH(hours)}</div>
            <div className="text-[11px] text-steel">Remoção − Instalação ({fmtH(inst)})</div>
          </div>
          <Field label="Motivo da remoção" required className="sm:col-span-2"><Input data-testid="remove-form-reason" value={f.removal_reason} onChange={(e) => set("removal_reason")(e.target.value)} placeholder={early ? "Obrigatório — remoção antes da meta" : ""} /></Field>
          <Field label="OM SAP"><Input data-testid="remove-form-om" value={f.removal_om} onChange={(e) => set("removal_om")(e.target.value)} className="font-mono" /></Field>
          <Field label="Condição do componente removido" required>
            <NSelect testid="remove-form-condition" value={f.condition} onChange={set("condition")}>
              {["Desgaste normal", "Danificado", "Falha prematura", "Bom estado (remoção preventiva)", "Irrecuperável"].map((x) => <option key={x}>{x}</option>)}
            </NSelect>
          </Field>
          <Field label="Tipo de reforma" required>
            <NSelect testid="remove-form-reform-type" value={f.reform_type} onChange={(v) => setF((p) => ({ ...p, reform_type: v as ReformType, destination: v === "INTERNA" ? "Oficina interna" : v === "EXTERNA" ? "Fornecedor externo" : "Almoxarifado — inspeção" }))}>
              <option value="INTERNA">Interna</option><option value="EXTERNA">Externa</option><option value="SEM_REFORMA">Sem reforma</option>
            </NSelect>
          </Field>
          <Field label="Destino do componente" required><Input data-testid="remove-form-destination" value={f.destination} onChange={(e) => set("destination")(e.target.value)} /></Field>
          {f.reform_type === "EXTERNA" && <Field label="Empresa responsável pela reforma" required><Input data-testid="remove-form-company" value={f.reform_company} onChange={(e) => set("reform_company")(e.target.value)} /></Field>}
          {f.reform_type !== "SEM_REFORMA" && <Field label="Custo da reforma (R$), se conhecido"><Input data-testid="remove-form-cost" type="number" min={0} value={f.reform_cost} onChange={(e) => set("reform_cost")(e.target.value)} className="font-mono" /></Field>}
          <Field label="Responsável pelo registro" required><Input data-testid="remove-form-responsible" value={f.responsible} onChange={(e) => set("responsible")(e.target.value)} /></Field>
          <Field label="Observações técnicas" className="sm:col-span-3"><Textarea data-testid="remove-form-notes" value={f.notes} onChange={(e) => set("notes")(e.target.value)} rows={2} /></Field>
        </div>
        <div className="flex flex-wrap gap-2">
          {invalid && <Pill tone="inconsistencia" testid="remove-form-hourmeter-error">Horímetro de remoção inferior ao de instalação — registro bloqueado</Pill>}
          {dateInvalid && <Pill tone="inconsistencia" testid="remove-form-date-error">Data de remoção anterior à instalação</Pill>}
          {early && <Pill tone="atencao" testid="remove-form-early-warning">Remoção antes da meta da vida ({fmtH(projected)} de {fmtH(comp?.life_target)}) — informe o motivo</Pill>}
          {f.reform_type !== "SEM_REFORMA" && <Pill tone="parcial">Uma reforma {f.reform_type.toLowerCase()} será aberta automaticamente. A vida não avança até validação.</Pill>}
        </div>
        <DialogFooter><Button data-testid="remove-form-submit" disabled={m.isPending || invalid || dateInvalid || f.removal_hourmeter === "" || f.removal_reason.trim().length < 3} onClick={() => m.mutate()} className={primary}>Confirmar remoção</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ValidateLifeDialog({ comp, onClose }: { comp: ComponentView | null; onClose: () => void }) {
  const refresh = useRefreshAll();
  const [f, setF] = useState<LifeValidateIn>({ decision: "AVANCAR", condition_ok: false, early_reason: "", notes: "" });
  const closed = comp ? comp.life_hours - comp.life_hours_running : 0;
  const early = !!(comp?.life_target && closed < comp.life_target);
  const last = comp?.current_life === 4;
  const decision = last ? "SUBSTITUIR" : f.decision;
  const m = useMutation({
    mutationFn: () => apiPost<LifeView>(`/components/${comp!.id}/lives/validate`, { ...f, decision, early_reason: f.early_reason || null, notes: f.notes || null }),
    onSuccess: (lv) => { toast.success(`Vida ${lv.life_number} validada — ${lv.status === "ENCERRADA_ANTECIPADA" ? "encerrada antecipadamente" : "encerrada"}`); refresh(); onClose(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Dialog open={!!comp} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Validar encerramento da {comp?.current_life}ª vida</DialogTitle>
          <DialogDescription>A vida só muda após validação do histórico e da condição do componente.</DialogDescription></DialogHeader>
        {comp && (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2"><TagCmp tag={comp.tag} /><span className="font-mono text-sm">{fmtH(closed)} trabalhadas · meta {comp.life_target ? fmtH(comp.life_target) : "não definida"}</span></div>
            <Field label="Decisão">
              <NSelect testid="validate-form-decision" value={decision} onChange={(v) => setF({ ...f, decision: v as LifeValidateIn["decision"] })} disabled={last}>
                {!last && <option value="AVANCAR">Avançar para {comp.current_life + 1}ª vida</option>}
                <option value="SUBSTITUIR">Encerrar ciclo — substituição do componente</option>
              </NSelect>
            </Field>
            {last && <Pill tone="atraso">4ª vida é a última — decisão de substituição obrigatória</Pill>}
            <label className="flex items-center gap-2 text-sm"><Checkbox data-testid="validate-form-condition" checked={f.condition_ok} onCheckedChange={(v) => setF({ ...f, condition_ok: !!v })} />Histórico e condição do componente verificados</label>
            {early && <Field label="Motivo do encerramento antecipado" required hint="Horas abaixo da meta da vida"><Input data-testid="validate-form-early-reason" value={f.early_reason ?? ""} onChange={(e) => setF({ ...f, early_reason: e.target.value })} /></Field>}
            <Field label="Observações"><Textarea data-testid="validate-form-notes" value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} /></Field>
          </div>
        )}
        <DialogFooter><Button data-testid="validate-form-submit" disabled={m.isPending} onClick={() => m.mutate()} className={primary}>Validar vida</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
