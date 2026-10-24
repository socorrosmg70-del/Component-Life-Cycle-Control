import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCheck } from "lucide-react";
import { useCan } from "@/lib/auth";
import { fmtH } from "@/lib/format";
import { useComponents, useFamilies } from "@/lib/queries";
import type { ComponentView } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ComponentStatusBadge, EmptyState, ExportButtons, KpiCard, LifeProgress, LifeStatusBadge, NSelect, PageHeader, Panel, Pill, TagCmp, TagEq } from "@/components/common";
import { ValidateLifeDialog } from "@/components/dialogs";

export default function Vidas() {
  const can = useCan();
  const nav = useNavigate();
  const { data: fams } = useFamilies();
  const { data, isError } = useComponents();
  const [life, setLife] = useState("");
  const [fam, setFam] = useState("");
  const [situ, setSitu] = useState("");
  const [val, setVal] = useState<ComponentView | null>(null);
  const all = isError ? [] : data ?? [];
  const rows = all.filter((c) => (!life || c.current_life === Number(life)) && (!fam || c.family_id === fam) &&
    (!situ || (situ === "VALIDAR" ? c.validation_pending : situ === "QUARTA" ? c.current_life === 4 && c.status !== "SUCATEADO" : c.life_status === situ)));
  const count = (p: (c: ComponentView) => boolean) => all.filter(p).length;

  return (
    <div>
      <PageHeader eyebrow="Confiabilidade" title="Controle de vidas" subtitle="Até quatro vidas por componente, com metas por família. A vida só avança após validação do histórico e da condição do componente — nunca automaticamente na remoção."
        actions={<ExportButtons reportKey="horas_por_vida" testidPrefix="lives" />} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[1, 2, 3, 4].map((n) => <KpiCard key={n} testid={`lives-kpi-life-${n}`} label={`${n}ª vida`} value={count((c) => c.current_life === n && c.status !== "SUCATEADO")} tone={n === 4 ? "atraso" : "info"} onClick={() => setLife(String(n))} />)}
        <KpiCard testid="lives-kpi-validate" label="Aguardando validação" value={count((c) => c.validation_pending)} tone="atencao" onClick={() => setSitu("VALIDAR")} />
      </div>
      <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_2fr]">
        <Panel title="Metas por família (horas)">
          <Table>
            <TableHeader><TableRow><TableHead>Família</TableHead>{[1, 2, 3, 4].map((n) => <TableHead key={n} className="text-right">{n}ª</TableHead>)}</TableRow></TableHeader>
            <TableBody>{fams?.map((f) => (
              <TableRow key={f.id}><TableCell className="text-[13px]">{f.name}</TableCell>{f.targets.map((t, i) => <TableCell key={i} className="text-right font-mono text-[12px]">{t ? fmtH(t) : <span className="text-steel">não definida</span>}</TableCell>)}</TableRow>
            ))}</TableBody>
          </Table>
          <p className="mt-2 text-[12px] text-steel">Alerta de atenção a partir de 85% da meta. Metas editáveis pelo Administrador.</p>
        </Panel>
        <Panel title="Regras aplicadas">
          <ul className="space-y-1.5 text-[13px] text-ink">
            <li>• A vida atual é identificada pelo histórico validado (registro de validação por vida).</li>
            <li>• Horas da vida = soma das instalações encerradas na vida + instalação em andamento (parcial, pelo horímetro atual).</li>
            <li>• Encerramento abaixo da meta é registrado como <b>antecipado</b> e exige motivo.</li>
            <li>• Reforma em andamento bloqueia a validação — exige retorno, inspeção e liberação.</li>
            <li>• Na 4ª vida a decisão obrigatória é a substituição; meta pode ficar “não definida”.</li>
          </ul>
        </Panel>
      </div>
      <Panel>
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <NSelect testid="lives-filter-life" value={life} onChange={setLife}><option value="">Todas as vidas</option>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}ª vida</option>)}</NSelect>
          <NSelect testid="lives-filter-family" value={fam} onChange={setFam}><option value="">Todas as famílias</option>{fams?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</NSelect>
          <NSelect testid="lives-filter-situation" value={situ} onChange={setSitu}>
            <option value="">Todas as situações</option><option value="NORMAL">Normal</option><option value="ATENCAO">Atenção</option><option value="ACIMA_META">Acima da meta</option>
            <option value="META_NAO_DEFINIDA">Meta não definida</option><option value="QUARTA">4ª vida em andamento</option><option value="VALIDAR">Aguardando validação</option>
          </NSelect>
        </div>
        {rows.length === 0 ? <EmptyState>Nenhum componente para os filtros.</EmptyState> : (
          <Table>
            <TableHeader><TableRow><TableHead>Componente</TableHead><TableHead>Família</TableHead><TableHead>Vida</TableHead><TableHead>Status</TableHead><TableHead>Equipamento</TableHead><TableHead className="min-w-[200px]">Realizado × meta</TableHead><TableHead>Situação</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id} data-testid={`lives-row-${c.tag}`}>
                  <TableCell><button type="button" className="text-left" onClick={() => nav(`/componentes/${c.id}`)}><TagCmp tag={c.tag} /></button></TableCell>
                  <TableCell className="text-[13px]">{c.family_name ?? "—"}</TableCell>
                  <TableCell className="font-mono">{c.current_life}ª</TableCell>
                  <TableCell><ComponentStatusBadge status={c.status} /></TableCell>
                  <TableCell><TagEq tag={c.current_equipment_tag} /></TableCell>
                  <TableCell><LifeProgress hours={c.life_hours} target={c.life_target} status={c.life_status} /></TableCell>
                  <TableCell><div className="flex flex-col items-start gap-1"><LifeStatusBadge status={c.life_status} />
                    {c.current_life === 4 && c.status !== "SUCATEADO" && <Pill tone="atraso">4ª vida — decidir substituição</Pill>}
                    {c.validation_pending && <Pill tone="atencao">Aguardando validação</Pill>}</div></TableCell>
                  <TableCell className="text-right">{can("validar_vida") && c.validation_pending && <Button data-testid={`lives-validate-button-${c.tag}`} size="sm" variant="outline" onClick={() => setVal(c)}><CheckCheck className="size-4" />Validar</Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
      {val && <ValidateLifeDialog comp={val} onClose={() => setVal(null)} />}
    </div>
  );
}
