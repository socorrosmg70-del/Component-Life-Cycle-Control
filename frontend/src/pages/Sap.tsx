import { Fragment, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, PlugZap, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, apiUpload } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { errMsg, fmtDateTime } from "@/lib/format";
import { useRefreshAll } from "@/lib/queries";
import type { SapBatch, SapStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ExportButtons, Field, KpiCard, NSelect, PageHeader, Panel, Pill } from "@/components/common";
import type { Tone } from "@/components/common";

const TEMPLATES: Record<string, string> = {
  HORIMETROS: "equipment_tag;hourmeter;date\nEQ-CAT-793F-014;61250;2026-01-15\n",
  CUSTOS_OM: "sap_om;component_tag;category;amount;date;cost_center;supplier;order_status;description\n4000801;CMP-MOT-3516E-001;MATERIAIS;1250,00;2026-01-10;CC-1101;Sotreq;ENTE;Filtros\n",
  MATERIAIS: "sap_code;description;pn\n40019283;MOTOR DIESEL CAT 3516E HD;245-1289\n",
};
const ENTITY_LABEL: Record<string, string> = { HORIMETROS: "Horímetros (IK17/IK11)", CUSTOS_OM: "Custos de OM (IW39/KOB1)", MATERIAIS: "Materiais (MM60)", CONEXAO: "Teste de conexão API" };
const MAPPING = [
  ["Código de material / PN", "MARA-MATNR / MFRPN", "components.sap_code / pn", "MATERIAIS"],
  ["Descrição do material", "MAKT-MAKTX", "sap_materials.description", "MATERIAIS"],
  ["Número de série", "EQUI-SERNR", "components.serial", "Planejado"],
  ["TAG do equipamento", "EQUI-EQUNR / IFLOT-TPLNR", "equipment.tag", "HORIMETROS"],
  ["Ordem de manutenção", "AUFK-AUFNR", "movements.install_om / cost_entries.sap_document", "CUSTOS_OM"],
  ["Datas de execução", "AFKO-GSTRI / GLTRI", "cost_entries.date", "CUSTOS_OM"],
  ["Dados de horímetro", "IMRG-READG (doc. de medição)", "equipment.hourmeter", "HORIMETROS"],
  ["Centro de custo", "AUFK-KOSTL", "cost_entries.cost_center", "CUSTOS_OM"],
  ["Custos de materiais e serviços", "COEP-WTGBTR", "cost_entries.amount / category", "CUSTOS_OM"],
  ["Fornecedor", "EKKO-LIFNR", "cost_entries.supplier", "CUSTOS_OM"],
  ["Status da ordem", "JEST-STAT (ABER/LIB/ENTE)", "cost_entries.order_status", "CUSTOS_OM"],
  ["Movimentações relevantes", "MSEG (BWART 261/262)", "movements (conciliação)", "Planejado"],
];
const BTONE: Record<string, Tone> = { SUCESSO: "normal", PARCIAL: "atencao", FALHA: "atraso" };

export default function Sap() {
  const can = useCan();
  const refresh = useRefreshAll();
  const [entity, setEntity] = useState("HORIMETROS");
  const [file, setFile] = useState<File | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const st = useQuery({ queryKey: ["sap-status"], queryFn: () => apiGet<SapStatus>("/sap/status") });
  const batches = useQuery({ queryKey: ["sap-batches"], queryFn: () => apiGet<SapBatch[]>("/sap/batches") });
  const done = (b: SapBatch) => { toast[b.status === "SUCESSO" ? "success" : b.status === "PARCIAL" ? "warning" : "error"](`Lote ${b.status}: ${b.imported} importados, ${b.rejected} rejeitados, ${b.duplicates} duplicados`); setOpen(b.id); refresh(); };
  const upload = useMutation({
    mutationFn: () => { const fd = new FormData(); fd.append("entity", entity); fd.append("file", file!); return apiUpload<SapBatch>("/sap/import", fd); },
    onSuccess: (b) => { done(b); setFile(null); if (inputRef.current) inputRef.current.value = ""; },
    onError: (e) => toast.error(errMsg(e)),
  });
  const reprocess = useMutation({ mutationFn: (id: string) => apiPost<SapBatch>(`/sap/batches/${id}/reprocess`), onSuccess: done, onError: (e) => toast.error(errMsg(e)) });
  const test = useMutation({ mutationFn: () => apiPost<SapBatch>("/sap/connection-test"), onSuccess: (b) => { toast.error(b.errors[0]?.message ?? "Falha"); refresh(); }, onError: (e) => toast.error(errMsg(e)) });
  const s = st.isError ? undefined : st.data;
  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATES[entity]], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `modelo_${entity.toLowerCase()}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader eyebrow="Integração corporativa" title="Integração SAP" subtitle="Conexão direta com o SAP não é presumida: nesta etapa os dados entram por arquivo estruturado (CSV/JSON exportado do SAP PM/MM/CO). O conector API (OData/RFC/CPI) fica preparado para quando a TI liberar."
        actions={<ExportButtons reportKey="sap_pendentes" testidPrefix="sap" />} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard testid="sap-kpi-mode" label="Modo de integração" value={<span className="text-[15px]">{s?.mode ?? "—"}</span>} tone="info" />
        <KpiCard testid="sap-kpi-api" label="Conexão API SAP" value={<span className="text-[15px]">{s ? (s.api_configured ? "Configurada" : "Não configurada") : "—"}</span>} tone={s?.api_configured ? "normal" : "atraso"} />
        <KpiCard testid="sap-kpi-last-sync" label="Última sincronização" value={<span className="text-[14px]">{fmtDateTime(s?.last_sync_at)}</span>} hint={s?.last_status ? <Pill tone={BTONE[s.last_status] ?? "neutral"}>{s.last_status}</Pill> : undefined} tone="neutral" />
        <KpiCard testid="sap-kpi-pending" label="Rejeições pendentes" value={s?.pending_rejections ?? "—"} tone="atencao" />
        <KpiCard testid="sap-kpi-sap-records" label="Registros origem SAP" value={s?.sap_records ?? "—"} tone="parcial" />
        <KpiCard testid="sap-kpi-manual-records" label="Registros manuais" value={s?.manual_records ?? "—"} tone="neutral" />
      </div>
      <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Panel title="Importar arquivo SAP">
          {can("sap") ? (
            <div className="grid gap-3">
              <Field label="Entidade"><NSelect testid="sap-import-entity" value={entity} onChange={setEntity}>{["HORIMETROS", "CUSTOS_OM", "MATERIAIS"].map((k) => <option key={k} value={k}>{ENTITY_LABEL[k]}</option>)}</NSelect></Field>
              <Field label="Arquivo (.csv com ; ou , — ou .json)">
                <input ref={inputRef} data-testid="sap-import-file" type="file" accept=".csv,.json,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm file:mr-3 file:rounded file:border file:border-line file:bg-mist file:px-3 file:py-1.5 file:text-sm" />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button data-testid="sap-import-submit" disabled={!file || upload.isPending} onClick={() => upload.mutate()} className="bg-hydro text-white hover:bg-hydro-dark"><Upload className="size-4" />{upload.isPending ? "Processando…" : "Importar"}</Button>
                <Button data-testid="sap-template-download" variant="outline" onClick={downloadTemplate}><Download className="size-4" />Modelo CSV</Button>
                <Button data-testid="sap-connection-test" variant="outline" disabled={test.isPending} onClick={() => test.mutate()}><PlugZap className="size-4" />Testar conexão API</Button>
              </div>
              <p className="text-[12px] text-steel">Cada linha é validada: cadastro existente, horímetro não regressivo, categoria e valor válidos e chave de duplicidade (OM + componente + categoria + valor).</p>
            </div>
          ) : <EmptyState>Seu perfil pode consultar o monitor, mas não importar ou reprocessar.</EmptyState>}
        </Panel>
        <Panel title="Mapeamento de campos SAP → aplicativo">
          <Table>
            <TableHeader><TableRow><TableHead>Informação</TableHead><TableHead>Origem SAP (referência)</TableHead><TableHead>Destino</TableHead><TableHead>Lote</TableHead></TableRow></TableHeader>
            <TableBody>{MAPPING.map(([a, b, c, d]) => <TableRow key={a}><TableCell className="text-[12.5px]">{a}</TableCell><TableCell className="font-mono text-[11.5px]">{b}</TableCell><TableCell className="font-mono text-[11.5px] text-steel">{c}</TableCell><TableCell><Pill tone={d === "Planejado" ? "neutral" : "parcial"}>{d}</Pill></TableCell></TableRow>)}</TableBody>
          </Table>
          <p className="mt-2 text-[11.5px] text-steel">Tabelas/campos SAP são referência para validação com a equipe SAP; dependem da versão (ECC/S/4HANA) e das permissões liberadas.</p>
        </Panel>
      </div>
      <Panel title="Monitor de sincronização">
        {(batches.data ?? []).length === 0 ? <EmptyState>Nenhum lote processado.</EmptyState> : (
          <Table>
            <TableHeader><TableRow><TableHead>Data/hora</TableHead><TableHead>Origem</TableHead><TableHead>Entidade</TableHead><TableHead>Arquivo</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Importados</TableHead><TableHead className="text-right">Rejeitados</TableHead><TableHead className="text-right">Duplicados</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {batches.data!.map((b) => (
                <Fragment key={b.id}>
                  <TableRow data-testid={`sap-batch-row-${b.id.slice(0, 8)}`} className="cursor-pointer hover:bg-mist/70" onClick={() => setOpen(open === b.id ? null : b.id)}>
                    <TableCell className="font-mono text-[12px]">{fmtDateTime(b.started_at)}<div className="text-steel">{b.user_name}</div></TableCell>
                    <TableCell className="text-[12.5px]">{b.source}</TableCell>
                    <TableCell className="text-[12.5px]">{ENTITY_LABEL[b.entity] ?? b.entity}</TableCell>
                    <TableCell className="font-mono text-[11.5px]">{b.file_name ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">{b.total}</TableCell>
                    <TableCell className="text-right font-mono">{b.imported}</TableCell>
                    <TableCell className="text-right font-mono">{b.rejected}</TableCell>
                    <TableCell className="text-right font-mono">{b.duplicates}</TableCell>
                    <TableCell><div className="flex flex-col items-start gap-1"><Pill tone={BTONE[b.status] ?? "neutral"}>{b.status}</Pill>{b.reprocessed && <Pill tone="neutral">Reprocessado</Pill>}{b.reprocess_of && <Pill tone="info">Reprocessamento</Pill>}</div></TableCell>
                    <TableCell className="text-right">{can("sap") && b.rejected > 0 && !b.reprocessed && b.entity !== "CONEXAO" && <Button data-testid={`sap-reprocess-button-${b.id.slice(0, 8)}`} size="sm" variant="outline" disabled={reprocess.isPending} onClick={(e) => { e.stopPropagation(); reprocess.mutate(b.id); }}><RefreshCw className="size-4" />Reprocessar</Button>}</TableCell>
                  </TableRow>
                  {open === b.id && b.errors.length > 0 && (
                    <TableRow><TableCell colSpan={10} className="bg-mist/60">
                      <div className="space-y-1" data-testid={`sap-batch-errors-${b.id.slice(0, 8)}`}>
                        {b.errors.map((e, i) => <div key={i} className="flex flex-wrap items-center gap-2 text-[12.5px]"><span className="font-mono text-steel">linha {e.row}</span><Pill tone={e.kind === "DUPLICIDADE" ? "atencao" : "atraso"}>{e.kind === "DUPLICIDADE" ? "Duplicidade" : e.kind === "CONEXAO" ? "Falha de conexão" : "Rejeição"}</Pill>{e.message}<span className="font-mono text-[11px] text-steel">{JSON.stringify(e.data)}</span></div>)}
                      </div>
                    </TableCell></TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
