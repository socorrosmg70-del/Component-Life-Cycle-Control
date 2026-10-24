import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { History, LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { errMsg, fmtDate, fmtH, qs } from "@/lib/format";
import { useComponents, useRefreshAll } from "@/lib/queries";
import type { Movement, MovementCorrectIn } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ExportButtons, Field, NSelect, PageHeader, Panel, Pill, SourceBadge, TagCmp, TagEq } from "@/components/common";
import { InstallDialog, RemoveDialog } from "@/components/dialogs";

export default function Movimentacoes() {
  const can = useCan();
  const refresh = useRefreshAll();
  const [f, setF] = useState({ q: "", status: "" });
  const { data, isError } = useQuery({ queryKey: ["movements", qs(f)], queryFn: () => apiGet<Movement[]>(`/movements${qs(f)}`) });
  const { data: comps } = useComponents();
  const [install, setInstall] = useState(false);
  const [rem, setRem] = useState<Movement | null>(null);
  const [cor, setCor] = useState<{ m: Movement; v: { install_date: string; install_hourmeter: string; removal_date: string; removal_hourmeter: string; reason: string } } | null>(null);
  const correct = useMutation({
    mutationFn: () => {
      const m = cor!.m, v = cor!.v;
      const body: MovementCorrectIn = { reason: v.reason };
      if (v.install_date !== m.install_date) body.install_date = v.install_date;
      if (Number(v.install_hourmeter) !== m.install_hourmeter) body.install_hourmeter = Number(v.install_hourmeter);
      if (m.status === "ENCERRADA" && v.removal_date !== m.removal_date) body.removal_date = v.removal_date;
      if (m.status === "ENCERRADA" && Number(v.removal_hourmeter) !== m.removal_hourmeter) body.removal_hourmeter = Number(v.removal_hourmeter);
      return apiPost<Movement>(`/movements/${m.id}/correct`, body);
    },
    onSuccess: () => { toast.success("Correção registrada com rastreabilidade"); setCor(null); refresh(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const rows = isError ? [] : data ?? [];
  return (
    <div>
      <PageHeader eyebrow="Movimentação" title="Instalação e remoção"
        subtitle="Cada instalação e remoção é um evento separado. Horas trabalhadas = horímetro de remoção − horímetro de instalação, sempre na mesma máquina. Histórico nunca é sobrescrito."
        actions={<>
          <ExportButtons reportKey="instalacoes_equipamento" testidPrefix="movements" />
          {can("movimentacao") && <Button data-testid="movement-install-button" onClick={() => setInstall(true)} className="bg-hydro text-white hover:bg-hydro-dark"><LogIn className="size-4" />Nova instalação</Button>}
        </>} />
      <Panel>
        <div className="mb-4 flex flex-col gap-3 md:flex-row">
          <Input data-testid="movements-search-input" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="TAG componente, TAG equipamento, série ou OM" className="h-9 md:max-w-sm" />
          <NSelect testid="movements-filter-status" value={f.status} onChange={(v) => setF({ ...f, status: v })} className="md:w-56"><option value="">Todas</option><option value="ABERTA">Abertas (instalado)</option><option value="ENCERRADA">Encerradas</option></NSelect>
        </div>
        {rows.length === 0 ? <EmptyState>Nenhuma movimentação.</EmptyState> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Componente</TableHead><TableHead>Equipamento</TableHead><TableHead>Vida</TableHead><TableHead>Instalação</TableHead><TableHead>Remoção</TableHead>
              <TableHead className="text-right">Horas trabalhadas</TableHead><TableHead>Motivo / destino</TableHead><TableHead>Sinalização</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id} data-testid={`movement-row-${m.component_tag}-${m.install_date}`}>
                  <TableCell><TagCmp tag={m.component_tag} /><div className="mt-1"><SourceBadge source={m.source} /></div></TableCell>
                  <TableCell><TagEq tag={m.equipment_tag} /></TableCell>
                  <TableCell className="font-mono">{m.life_number}ª</TableCell>
                  <TableCell className="font-mono text-[12px]">{fmtDate(m.install_date)}<br />{fmtH(m.install_hourmeter)}<div className="text-steel">OM {m.install_om ?? "—"}</div></TableCell>
                  <TableCell className="font-mono text-[12px]">{m.removal_date ? <>{fmtDate(m.removal_date)}<br />{fmtH(m.removal_hourmeter)}</> : <Pill tone="info">Instalado</Pill>}</TableCell>
                  <TableCell className="text-right font-mono" data-testid={`movement-hours-${m.id}`}>{m.status === "ENCERRADA" ? fmtH(m.hours_worked) : <span className="text-steel">{fmtH(m.running_hours)}<div className="text-[10.5px]">parcial (horímetro atual)</div></span>}</TableCell>
                  <TableCell className="max-w-[220px] text-[12.5px]">{m.removal_reason ?? "—"}{m.destination && <div className="text-steel">→ {m.destination}</div>}</TableCell>
                  <TableCell><div className="flex flex-col items-start gap-1">
                    {m.early_removal && <Pill tone="atencao">Remoção antecipada</Pill>}
                    {m.inconsistencies.map((x) => <Pill key={x} tone="inconsistencia">Divergência de horímetro</Pill>)}
                    {m.revisions.length > 0 && <Pill tone="parcial">{m.revisions.length} correção(ões)</Pill>}
                    {!m.early_removal && !m.inconsistencies.length && m.status === "ENCERRADA" && <Pill tone="normal">Consistente</Pill>}
                  </div></TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {can("movimentacao") && m.status === "ABERTA" && <Button data-testid={`movement-remove-button-${m.component_tag}`} size="sm" variant="outline" onClick={() => setRem(m)}><LogOut className="size-4" />Remover</Button>}
                    {can("correcao") && <Button data-testid={`movement-correct-button-${m.id}`} size="icon-sm" variant="ghost" title="Correção rastreável" onClick={() => setCor({ m, v: { install_date: m.install_date, install_hourmeter: String(m.install_hourmeter), removal_date: m.removal_date ?? "", removal_hourmeter: String(m.removal_hourmeter ?? ""), reason: "" } })}><History className="size-4" /></Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
      {install && <InstallDialog open={install} onClose={() => setInstall(false)} />}
      {rem && <RemoveDialog mov={rem} comp={comps?.find((c) => c.id === rem.component_id)} onClose={() => setRem(null)} />}
      <Dialog open={!!cor} onOpenChange={(o) => !o && setCor(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Correção rastreável</DialogTitle><DialogDescription>Os valores anteriores ficam preservados no histórico de revisões e na trilha de auditoria.</DialogDescription></DialogHeader>
          {cor && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Data de instalação"><Input data-testid="correct-form-install-date" type="date" value={cor.v.install_date} onChange={(e) => setCor({ ...cor, v: { ...cor.v, install_date: e.target.value } })} /></Field>
              <Field label="Horímetro instalação"><Input data-testid="correct-form-install-hm" type="number" value={cor.v.install_hourmeter} onChange={(e) => setCor({ ...cor, v: { ...cor.v, install_hourmeter: e.target.value } })} className="font-mono" /></Field>
              {cor.m.status === "ENCERRADA" && <>
                <Field label="Data de remoção"><Input data-testid="correct-form-removal-date" type="date" value={cor.v.removal_date} onChange={(e) => setCor({ ...cor, v: { ...cor.v, removal_date: e.target.value } })} /></Field>
                <Field label="Horímetro remoção"><Input data-testid="correct-form-removal-hm" type="number" value={cor.v.removal_hourmeter} onChange={(e) => setCor({ ...cor, v: { ...cor.v, removal_hourmeter: e.target.value } })} className="font-mono" /></Field>
              </>}
              <Field label="Justificativa da correção" required className="col-span-2"><Input data-testid="correct-form-reason" value={cor.v.reason} onChange={(e) => setCor({ ...cor, v: { ...cor.v, reason: e.target.value } })} /></Field>
              {cor.m.revisions.map((r, i) => <div key={i} className="col-span-2 text-[12px] text-steel">Rev. {i + 1}: {r.by} · {r.reason} · antes {JSON.stringify(r.before)}</div>)}
            </div>
          )}
          <DialogFooter><Button data-testid="correct-form-submit" disabled={correct.isPending || (cor?.v.reason.length ?? 0) < 5} onClick={() => correct.mutate()} className="bg-hydro text-white hover:bg-hydro-dark">Registrar correção</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
