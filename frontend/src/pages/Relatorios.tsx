import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { fmtN, qs } from "@/lib/format";
import { useComponents, useFamilies } from "@/lib/queries";
import type { ReportData } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ExportButtons, Field, NSelect, PageHeader, Panel } from "@/components/common";
import { cn } from "@/lib/utils";

export default function Relatorios() {
  const { data: list } = useQuery({ queryKey: ["reports"], queryFn: () => apiGet<{ key: string; title: string }[]>("/reports") });
  const { data: fams } = useFamilies();
  const { data: comps } = useComponents();
  const [key, setKey] = useState("historico");
  const [f, setF] = useState({ q: "", family_id: "", component_id: "", date_from: "", date_to: "", reform_type: "" });
  const rep = useQuery({ queryKey: ["report", key, qs(f)], queryFn: () => apiGet<ReportData>(`/reports/${key}${qs(f)}`) });
  const r = rep.isError ? undefined : rep.data;
  const cell = (v: unknown) => (v == null || v === "" ? "—" : typeof v === "number" ? fmtN(v) : String(v));
  return (
    <div>
      <PageHeader eyebrow="Relatórios gerenciais" title="Relatórios e exportações" subtitle="Selecione o relatório, aplique filtros e exporte para Excel (.xlsx) ou PDF. A exportação usa exatamente os filtros aplicados." />
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Panel title="Relatórios">
          <ol className="flex flex-col gap-0.5" data-testid="report-list">
            {list?.map((x, i) => (
              <li key={x.key}>
                <button type="button" data-testid={`report-item-${x.key}`} onClick={() => setKey(x.key)}
                  className={cn("flex w-full gap-2 rounded px-2 py-1.5 text-left text-[13px] transition-colors", key === x.key ? "bg-hydro text-white" : "hover:bg-mist")}>
                  <span className="font-mono opacity-70">{String(i + 1).padStart(2, "0")}</span>{x.title}
                </button>
              </li>
            ))}
          </ol>
        </Panel>
        <div className="min-w-0 space-y-4">
          <Panel title={r?.title ?? "Relatório"} actions={<ExportButtons reportKey={key} params={f} testidPrefix="report" />}>
            <div className="mb-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Field label="TAG / PN / SAP"><Input data-testid="report-filter-q" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} className="h-9" /></Field>
              <Field label="Componente"><NSelect testid="report-filter-component" value={f.component_id} onChange={(v) => setF({ ...f, component_id: v })}><option value="">Todos</option>{comps?.map((c) => <option key={c.id} value={c.id}>{c.tag}</option>)}</NSelect></Field>
              <Field label="Família"><NSelect testid="report-filter-family" value={f.family_id} onChange={(v) => setF({ ...f, family_id: v })}><option value="">Todas</option>{fams?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</NSelect></Field>
              <Field label="Tipo de reforma"><NSelect testid="report-filter-reform-type" value={f.reform_type} onChange={(v) => setF({ ...f, reform_type: v })}><option value="">Todas</option><option value="INTERNA">Interna</option><option value="EXTERNA">Externa</option></NSelect></Field>
              <Field label="De"><Input data-testid="report-filter-from" type="date" value={f.date_from} onChange={(e) => setF({ ...f, date_from: e.target.value })} className="h-9" /></Field>
              <Field label="Até"><Input data-testid="report-filter-to" type="date" value={f.date_to} onChange={(e) => setF({ ...f, date_to: e.target.value })} className="h-9" /></Field>
            </div>
            <div className="mb-2 text-[12px] text-steel" data-testid="report-count">{r ? `${r.rows.length} registro(s)` : "Carregando…"}</div>
            {r && r.rows.length === 0 ? <EmptyState>Nenhum registro para os filtros selecionados.</EmptyState> : (
              <Table data-testid="report-table">
                <TableHeader><TableRow>{r?.columns.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}</TableRow></TableHeader>
                <TableBody>{r?.rows.map((row, i) => <TableRow key={i}>{r.columns.map((c) => <TableCell key={c.key} className="max-w-[320px] text-[12.5px] whitespace-normal">{cell(row[c.key])}</TableCell>)}</TableRow>)}</TableBody>
              </Table>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
