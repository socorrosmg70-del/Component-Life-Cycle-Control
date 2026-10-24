import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RotateCcw } from "lucide-react";
import { apiGet } from "@/lib/api";
import { fmtBRL, fmtH, fmtN, qs } from "@/lib/format";
import type { Dashboard as DashboardT } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, Field, KpiCard, LifeStatusBadge, NSelect, PageHeader, Panel, Pill, TagCmp, TagEq } from "@/components/common";

const EMPTY = { manufacturer: "", equipment: "", model: "", q: "", family_id: "", life: "", date_from: "", date_to: "", supplier: "", reform_type: "" };
type F = typeof EMPTY;

export default function Dashboard() {
  const [f, setF] = useState<F>(EMPTY);
  const nav = useNavigate();
  const set = (k: keyof F) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const { data, isError } = useQuery({ queryKey: ["dashboard", f], queryFn: () => apiGet<DashboardT>(`/dashboard${qs(f)}`) });
  const d = isError ? undefined : data;
  const k = d?.kpis;
  const o = d?.filter_options;
  const v = (n: number | undefined) => (n === undefined ? "—" : n);

  return (
    <div>
      <PageHeader eyebrow="Visão gerencial" title="Dashboard de componentes" subtitle="Indicadores calculados a partir dos registros validados de instalação, remoção, vidas, reformas e custos." />

      <Panel className="mb-6" testid="dashboard-filters">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Field label="Fabricante"><NSelect testid="filter-manufacturer" value={f.manufacturer} onChange={set("manufacturer")}><option value="">Todos</option>{o?.manufacturers.map((x) => <option key={x}>{x}</option>)}</NSelect></Field>
          <Field label="Equipamento"><NSelect testid="filter-equipment" value={f.equipment} onChange={set("equipment")}><option value="">Todos</option>{o?.equipment.map((x) => <option key={x}>{x}</option>)}</NSelect></Field>
          <Field label="Modelo"><NSelect testid="filter-model" value={f.model} onChange={set("model")}><option value="">Todos</option>{o?.models.map((x) => <option key={x}>{x}</option>)}</NSelect></Field>
          <Field label="Família"><NSelect testid="filter-family" value={f.family_id} onChange={set("family_id")}><option value="">Todas</option>{o?.families.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</NSelect></Field>
          <Field label="Vida atual"><NSelect testid="filter-life" value={f.life} onChange={set("life")}><option value="">Todas</option>{[1, 2, 3, 4].map((x) => <option key={x} value={x}>{x}ª vida</option>)}</NSelect></Field>
          <Field label="TAG / PN / SAP"><Input data-testid="filter-q" value={f.q} onChange={(e) => set("q")(e.target.value)} placeholder="CMP-… ou PN" className="h-9" /></Field>
          <Field label="Período — de"><Input data-testid="filter-date-from" type="date" value={f.date_from} onChange={(e) => set("date_from")(e.target.value)} className="h-9" /></Field>
          <Field label="Período — até"><Input data-testid="filter-date-to" type="date" value={f.date_to} onChange={(e) => set("date_to")(e.target.value)} className="h-9" /></Field>
          <Field label="Fornecedor"><NSelect testid="filter-supplier" value={f.supplier} onChange={set("supplier")}><option value="">Todos</option>{o?.suppliers.map((x) => <option key={x}>{x}</option>)}</NSelect></Field>
          <Field label="Tipo de reforma">
            <div className="flex gap-2">
              <NSelect testid="filter-reform-type" value={f.reform_type} onChange={set("reform_type")}><option value="">Todas</option><option value="INTERNA">Interna</option><option value="EXTERNA">Externa</option></NSelect>
              <Button data-testid="filter-reset" variant="outline" size="icon" onClick={() => setF(EMPTY)} title="Limpar filtros"><RotateCcw className="size-4" /></Button>
            </div>
          </Field>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" data-testid="kpi-grid">
        <KpiCard testid="kpi-total" label="Componentes cadastrados" value={v(k?.total)} tone="info" onClick={() => nav("/componentes")} />
        <KpiCard testid="kpi-installed" label="Instalados" value={v(k?.installed)} tone="info" onClick={() => nav("/componentes?status=INSTALADO")} />
        <KpiCard testid="kpi-removed" label="Removidos" value={v(k?.removed)} tone="neutral" onClick={() => nav("/componentes?status=REMOVIDO")} />
        <KpiCard testid="kpi-awaiting-reform" label="Aguardando reforma" value={v(k?.awaiting_reform)} tone="atencao" onClick={() => nav("/componentes?status=AGUARDANDO_REFORMA")} />
        <KpiCard testid="kpi-reform-internal" label="Em reforma interna" value={v(k?.reform_internal)} tone="parcial" onClick={() => nav("/reformas")} />
        <KpiCard testid="kpi-reform-external" label="Em reforma externa" value={v(k?.reform_external)} tone="parcial" onClick={() => nav("/reformas")} />
        <KpiCard testid="kpi-released" label="Liberados p/ instalação" value={v(k?.released)} tone="normal" onClick={() => nav("/componentes?status=LIBERADO")} />
        <KpiCard testid="kpi-near-target" label="Próximos da meta" value={v(k?.near_target)} tone="atencao" hint="Instalados ≥ 85% da meta" onClick={() => nav("/controle-vidas")} />
        <KpiCard testid="kpi-above-target" label="Acima da meta" value={v(k?.above_target)} tone="atraso" hint="Instalados > 100% da meta" onClick={() => nav("/controle-vidas")} />
        <KpiCard testid="kpi-fourth-life" label="Na 4ª vida" value={v(k?.fourth_life)} tone="atraso" hint="Decisão de substituição" onClick={() => nav("/controle-vidas")} />
        <KpiCard testid="kpi-reform-cost" label="Custo acumulado de reforma" value={<span className="text-[19px]">{k ? fmtBRL(k.reform_cost_total) : "—"}</span>} tone="neutral" />
        <KpiCard testid="kpi-avg-cph" label="Custo médio por hora" value={<span className="text-[19px]">{k?.avg_cost_per_hour != null ? `${fmtBRL(k.avg_cost_per_hour)}/h` : "—"}</span>}
          tone={k?.cost_partial ? "parcial" : "normal"} hint={k?.cost_partial ? <Pill tone="parcial">Resultado parcial</Pill> : "LCC total ÷ horas"} onClick={() => nav("/lcc-custos")} />
        <KpiCard testid="kpi-hours-total" label="Horas acumuladas" value={<span className="text-[19px]">{k ? fmtH(k.hours_total) : "—"}</span>} tone="info" />
        <KpiCard testid="kpi-validation-pending" label="Vidas aguardando validação" value={v(k?.validation_pending)} tone="atencao" onClick={() => nav("/controle-vidas")} />
        <KpiCard testid="kpi-incomplete" label="Dados incompletos" value={v(k?.incomplete)} tone="inconsistencia" hint="Série, SAP, custo ou horímetro" onClick={() => nav("/relatorios")} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Panel title="Horas médias trabalhadas por vida (vidas encerradas)" testid="chart-avg-hours">
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={d?.avg_hours_by_life ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E6EA" vertical={false} />
                <XAxis dataKey="life" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => fmtH(value)} />
                <Bar dataKey="avg_hours" name="Horas médias" fill="#444D55" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Custo atribuído por vida (R$)" testid="chart-cost-life">
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={d?.cost_by_life ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E6EA" vertical={false} />
                <XAxis dataKey="life" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(x: number) => `${Math.round(x / 1000)}k`} />
                <Tooltip formatter={(value: number) => fmtBRL(value)} />
                <Bar dataKey="cost" name="Custo" fill="#768692" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Tendência de horas trabalhadas (por mês de remoção)" testid="chart-hours-trend">
          <div className="h-60">
            <ResponsiveContainer>
              <LineChart data={d?.hours_trend ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E6EA" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => fmtH(value)} />
                <Line type="monotone" dataKey="hours" name="Horas" stroke="#444D55" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Custo por hora — ranking de componentes (R$/h, ciclo total)" testid="chart-cph">
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={d?.cost_per_hour_ranking ?? []} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E6EA" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="tag" tick={{ fontSize: 10 }} width={120} />
                <Tooltip formatter={(value: number) => `${fmtBRL(value)}/h (parcial)`} />
                <Bar dataKey="cost_per_hour" name="R$/h" fill="#5A656F" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Panel title="Comparativo: reforma interna × externa" testid="reform-comparison">
          <Table>
            <TableHeader><TableRow><TableHead>Indicador</TableHead>{d?.reform_comparison.map((r) => <TableHead key={r.type} className="text-right">{r.label}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {([["Reformas registradas", "count", (x: number | null) => fmtN(x)], ["Concluídas e liberadas", "concluded", fmtN], ["Em andamento", "in_progress", fmtN], ["Reprovadas", "rejected", fmtN],
                ["Custo médio (concluídas)", "avg_cost", fmtBRL], ["Prazo médio (dias)", "avg_turnaround_days", fmtN], ["Horas médias na vida seguinte", "avg_next_life_hours", fmtH]] as const).map(([label, key, fmt]) => (
                <TableRow key={key}><TableCell className="text-steel">{label}</TableCell>
                  {d?.reform_comparison.map((r) => <TableCell key={r.type} data-testid={`reform-cmp-${r.type.toLowerCase()}-${key}`} className="text-right font-mono">{fmt(r[key] as number | null)}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
        <Panel title="Comparação entre famílias equivalentes" testid="family-comparison">
          <Table>
            <TableHeader><TableRow><TableHead>Família</TableHead><TableHead className="text-right">Qtd.</TableHead><TableHead className="text-right">Horas médias</TableHead><TableHead className="text-right">R$/h médio</TableHead></TableRow></TableHeader>
            <TableBody>
              {d?.family_comparison.map((x) => (
                <TableRow key={x.family}><TableCell>{x.family}</TableCell><TableCell className="text-right font-mono">{x.components}</TableCell>
                  <TableCell className="text-right font-mono">{fmtH(x.avg_hours)}</TableCell><TableCell className="text-right font-mono">{x.avg_cost_per_hour != null ? fmtBRL(x.avg_cost_per_hour) : "—"}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-2 text-[12px] text-steel">Valores de custo/h incluem vidas em andamento — resultado parcial.</p>
        </Panel>
      </div>

      <Panel className="mt-4" title="Componentes que exigem atenção" testid="attention-list">
        {!d?.attention_list.length ? <EmptyState>Nenhum alerta para os filtros selecionados.</EmptyState> : (
          <Table>
            <TableHeader><TableRow><TableHead>Componente</TableHead><TableHead>Equipamento</TableHead><TableHead>Vida</TableHead><TableHead>Situação</TableHead><TableHead>Alertas</TableHead></TableRow></TableHeader>
            <TableBody>
              {d.attention_list.map((a) => (
                <TableRow key={a.id} data-testid={`attention-row-${a.tag}`} className="cursor-pointer hover:bg-mist/70" onClick={() => nav(`/componentes/${a.id}`)}>
                  <TableCell><TagCmp tag={a.tag} /><div className="mt-0.5 text-[12px] text-steel">{a.description}</div></TableCell>
                  <TableCell><TagEq tag={a.equipment} /></TableCell>
                  <TableCell className="font-mono">{a.life}ª</TableCell>
                  <TableCell><LifeStatusBadge status={a.life_status} /></TableCell>
                  <TableCell className="text-[12.5px]">{a.alerts.join(" · ")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
