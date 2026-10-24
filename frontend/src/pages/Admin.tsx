import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { ROLE_LABEL, errMsg, fmtDateTime, qs } from "@/lib/format";
import { useFamilies, useManufacturers, useRefreshAll } from "@/lib/queries";
import type { AuditEntry, Family, FamilyIn, Manufacturer, Role, UserCreate, UserOut } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, Field, NSelect, PageHeader, Panel, Pill } from "@/components/common";

const PERM_LABEL: [string, string][] = [["cadastro", "Cadastro de equipamentos e componentes"], ["movimentacao", "Instalação, remoção e horímetro"], ["validar_vida", "Validação de vidas"], ["reforma", "Abertura/atualização de reformas"],
  ["concluir_reforma", "Inspeção e liberação de reformas"], ["custos", "Lançamento de custos"], ["sap", "Importação e reprocessamento SAP"], ["metas", "Fabricantes e metas por família"],
  ["correcao", "Correções rastreáveis"], ["usuarios", "Gestão de usuários"], ["auditoria", "Trilha de auditoria"]];
const MATRIX: Record<string, Role[]> = {
  cadastro: ["admin", "pcm"], movimentacao: ["admin", "pcm", "oficina"], validar_vida: ["admin", "engenharia"], reforma: ["admin", "pcm", "oficina"],
  concluir_reforma: ["admin", "oficina", "engenharia"], custos: ["admin", "pcm", "engenharia"], sap: ["admin", "pcm"], metas: ["admin"], correcao: ["admin", "pcm"],
  usuarios: ["admin"], auditoria: ["admin", "gestor", "engenharia"],
};
const ROLES: Role[] = ["admin", "pcm", "engenharia", "oficina", "gestor", "consulta"];

function FamilyRow({ f, editable }: { f: Family; editable: boolean }) {
  const refresh = useRefreshAll();
  const [t, setT] = useState(f.targets.map((x) => (x == null ? "" : String(x))));
  const [att, setAtt] = useState(String(f.attention_pct));
  const save = useMutation({
    mutationFn: () => apiPut<Family>(`/families/${f.id}`, { name: f.name, component_type: f.component_type, notes: f.notes, attention_pct: Number(att), targets: t.map((x) => (x === "" ? null : Number(x))) } satisfies FamilyIn),
    onSuccess: () => { toast.success(`Metas de ${f.name} atualizadas (auditado)`); refresh(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <TableRow data-testid={`family-row-${f.component_type}`}>
      <TableCell><div className="font-medium">{f.name}</div><div className="font-mono text-[11px] text-steel">{f.component_type}</div></TableCell>
      {t.map((v, i) => (
        <TableCell key={i}><Input data-testid={`family-${f.component_type}-target-${i + 1}`} disabled={!editable} type="number" min={0} value={v} placeholder="não definida" onChange={(e) => setT(t.map((x, j) => (j === i ? e.target.value : x)))} className="h-8 w-28 font-mono" /></TableCell>
      ))}
      <TableCell><Input data-testid={`family-${f.component_type}-attention`} disabled={!editable} type="number" value={att} onChange={(e) => setAtt(e.target.value)} className="h-8 w-20 font-mono" /></TableCell>
      <TableCell className="text-[11.5px] text-steel">{f.updated_by}<br />{fmtDateTime(f.updated_at)}</TableCell>
      <TableCell>{editable && <Button data-testid={`family-${f.component_type}-save`} size="icon-sm" variant="outline" onClick={() => save.mutate()} title="Salvar"><Save className="size-4" /></Button>}</TableCell>
    </TableRow>
  );
}

export default function Admin() {
  const can = useCan();
  const refresh = useRefreshAll();
  const { data: mans } = useManufacturers();
  const { data: fams } = useFamilies();
  const [mName, setMName] = useState("");
  const [fam, setFam] = useState({ name: "", component_type: "" });
  const [nu, setNu] = useState<UserCreate>({ name: "", email: "", password: "", role: "consulta" });
  const [aq, setAq] = useState({ q: "", entity: "" });
  const users = useQuery({ queryKey: ["users"], enabled: can("usuarios"), queryFn: () => apiGet<UserOut[]>("/users") });
  const audit = useQuery({ queryKey: ["audit", qs(aq)], enabled: can("auditoria"), queryFn: () => apiGet<AuditEntry[]>(`/audit${qs(aq)}`) });
  const addM = useMutation({ mutationFn: () => apiPost<Manufacturer>("/manufacturers", { name: mName }), onSuccess: (m) => { toast.success(`Fabricante ${m.name} cadastrado`); setMName(""); refresh(); }, onError: (e) => toast.error(errMsg(e)) });
  const addF = useMutation({ mutationFn: () => apiPost<Family>("/families", { ...fam, targets: [12000, 10000, 8000, null], attention_pct: 85, notes: null }), onSuccess: () => { toast.success("Família criada com metas de referência"); setFam({ name: "", component_type: "" }); refresh(); }, onError: (e) => toast.error(errMsg(e)) });
  const addU = useMutation({ mutationFn: () => apiPost<UserOut>("/users", nu), onSuccess: (u) => { toast.success(`Usuário ${u.email} criado`); setNu({ name: "", email: "", password: "", role: "consulta" }); refresh(); }, onError: (e) => toast.error(errMsg(e)) });
  const patchU = useMutation({ mutationFn: (p: { id: string; body: { role?: Role; active?: boolean } }) => apiPatch<UserOut>(`/users/${p.id}`, p.body), onSuccess: () => { toast.success("Usuário atualizado"); refresh(); }, onError: (e) => toast.error(errMsg(e)) });

  return (
    <div>
      <PageHeader eyebrow="Governança" title="Administração" subtitle="Fabricantes, famílias e metas de vida, perfis de acesso e trilha de auditoria. Registros históricos não são excluídos — correções são rastreáveis." />
      <Tabs defaultValue="metas">
        <TabsList variant="line" className="mb-4">
          <TabsTrigger value="metas" data-testid="admin-tab-families">Famílias e metas</TabsTrigger>
          <TabsTrigger value="fabricantes" data-testid="admin-tab-manufacturers">Fabricantes</TabsTrigger>
          <TabsTrigger value="perfis" data-testid="admin-tab-roles">Perfis e usuários</TabsTrigger>
          <TabsTrigger value="auditoria" data-testid="admin-tab-audit">Trilha de auditoria</TabsTrigger>
        </TabsList>
        <TabsContent value="metas">
          <Panel title="Metas de vida por família (horas)" actions={!can("metas") && <Pill tone="neutral">Somente leitura</Pill>}>
            <Table>
              <TableHeader><TableRow><TableHead>Família</TableHead><TableHead>1ª vida</TableHead><TableHead>2ª vida</TableHead><TableHead>3ª vida</TableHead><TableHead>4ª vida</TableHead><TableHead>Atenção (%)</TableHead><TableHead>Última alteração</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{fams?.map((f) => <FamilyRow key={f.id + f.updated_at} f={f} editable={can("metas")} />)}</TableBody>
            </Table>
            <p className="mt-2 text-[12px] text-steel">Campo vazio = meta “não definida”. A 4ª vida não recebe meta automática: defina somente a meta aprovada pela engenharia.</p>
            {can("metas") && (
              <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-end">
                <Field label="Nova família"><Input data-testid="family-new-name" value={fam.name} onChange={(e) => setFam({ ...fam, name: e.target.value })} placeholder="Ex.: Bomba hidráulica" /></Field>
                <Field label="Código"><Input data-testid="family-new-code" value={fam.component_type} onChange={(e) => setFam({ ...fam, component_type: e.target.value.toUpperCase() })} placeholder="BHD" className="font-mono" /></Field>
                <Button data-testid="family-new-submit" onClick={() => addF.mutate()} disabled={addF.isPending} className="bg-hydro text-white hover:bg-hydro-dark"><Plus className="size-4" />Adicionar</Button>
              </div>
            )}
          </Panel>
        </TabsContent>
        <TabsContent value="fabricantes">
          <Panel title="Fabricantes cadastrados">
            <div className="flex flex-wrap gap-2" data-testid="manufacturer-list">{mans?.map((m) => <span key={m.id} className="rounded border border-line bg-mist px-2.5 py-1 text-[13px]">{m.name}</span>)}</div>
            {can("metas") && (
              <div className="mt-4 flex gap-2">
                <Input data-testid="manufacturer-new-name" value={mName} onChange={(e) => setMName(e.target.value)} placeholder="Novo fabricante" className="h-9 max-w-xs" />
                <Button data-testid="manufacturer-new-submit" onClick={() => addM.mutate()} disabled={addM.isPending || mName.length < 2} className="bg-hydro text-white hover:bg-hydro-dark"><Plus className="size-4" />Cadastrar</Button>
              </div>
            )}
          </Panel>
        </TabsContent>
        <TabsContent value="perfis">
          <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <Panel title="Matriz de permissões">
              <Table>
                <TableHeader><TableRow><TableHead>Operação</TableHead>{ROLES.map((r) => <TableHead key={r} className="text-center text-[11px]">{ROLE_LABEL[r]}</TableHead>)}</TableRow></TableHeader>
                <TableBody>{PERM_LABEL.map(([k, l]) => <TableRow key={k}><TableCell className="text-[12.5px]">{l}</TableCell>{ROLES.map((r) => <TableCell key={r} className="text-center text-[12px]">{MATRIX[k].includes(r) ? <span className="font-medium text-[#15803D]">Sim</span> : <span className="text-steel">—</span>}</TableCell>)}</TableRow>)}
                  <TableRow><TableCell className="text-[12.5px]">Consulta de dados, dashboard e relatórios</TableCell>{ROLES.map((r) => <TableCell key={r} className="text-center text-[12px] font-medium text-[#15803D]">Sim</TableCell>)}</TableRow>
                </TableBody>
              </Table>
            </Panel>
            <Panel title="Usuários">
              {!can("usuarios") ? <EmptyState>Gestão de usuários restrita ao Administrador.</EmptyState> : (
                <>
                  <Table>
                    <TableBody>{users.data?.map((u) => (
                      <TableRow key={u.id} data-testid={`user-row-${u.email}`}>
                        <TableCell><div className="text-[13px] font-medium">{u.name}</div><div className="font-mono text-[11px] text-steel">{u.email}</div></TableCell>
                        <TableCell><NSelect testid={`user-role-${u.email}`} value={u.role} onChange={(v) => patchU.mutate({ id: u.id, body: { role: v as Role } })} className="h-8 w-44 text-[12px]">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</NSelect></TableCell>
                        <TableCell><button type="button" data-testid={`user-active-${u.email}`} onClick={() => patchU.mutate({ id: u.id, body: { active: !u.active } })}><Pill tone={u.active ? "normal" : "neutral"}>{u.active ? "Ativo" : "Inativo"}</Pill></button></TableCell>
                      </TableRow>
                    ))}</TableBody>
                  </Table>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <Input data-testid="user-new-name" placeholder="Nome" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} className="h-9" />
                    <Input data-testid="user-new-email" placeholder="E-mail" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} className="h-9" />
                    <Input data-testid="user-new-password" type="password" placeholder="Senha (mín. 6)" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} className="h-9" />
                    <NSelect testid="user-new-role" value={nu.role} onChange={(v) => setNu({ ...nu, role: v as Role })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</NSelect>
                    <Button data-testid="user-new-submit" onClick={() => addU.mutate()} disabled={addU.isPending} className="bg-hydro text-white hover:bg-hydro-dark sm:col-span-2"><Plus className="size-4" />Criar usuário</Button>
                  </div>
                </>
              )}
            </Panel>
          </div>
        </TabsContent>
        <TabsContent value="auditoria">
          <Panel title="Trilha de auditoria (inclusões, alterações, validações e encerramentos)">
            {!can("auditoria") ? <EmptyState>Seu perfil não tem acesso à trilha de auditoria.</EmptyState> : (
              <>
                <div className="mb-3 flex flex-col gap-2 md:flex-row">
                  <Input data-testid="audit-search-input" value={aq.q} onChange={(e) => setAq({ ...aq, q: e.target.value })} placeholder="Buscar por usuário ou descrição" className="h-9 md:max-w-sm" />
                  <NSelect testid="audit-filter-entity" value={aq.entity} onChange={(v) => setAq({ ...aq, entity: v })} className="md:w-56">
                    <option value="">Todas as entidades</option>{["movimentacao", "componente", "equipamento", "reforma", "custo", "familia", "fabricante", "sap", "usuario"].map((x) => <option key={x}>{x}</option>)}
                  </NSelect>
                </div>
                <Table data-testid="audit-table">
                  <TableHeader><TableRow><TableHead>Data/hora</TableHead><TableHead>Responsável</TableHead><TableHead>Ação</TableHead><TableHead>Entidade</TableHead><TableHead>Descrição</TableHead></TableRow></TableHeader>
                  <TableBody>{audit.data?.map((a) => (
                    <TableRow key={a.id}><TableCell className="font-mono text-[11.5px] whitespace-nowrap">{fmtDateTime(a.at)}</TableCell><TableCell className="text-[12.5px]">{a.user_name}<div className="text-[11px] text-steel">{ROLE_LABEL[a.user_role] ?? a.user_role}</div></TableCell>
                      <TableCell><Pill tone="info">{a.action}</Pill></TableCell><TableCell className="font-mono text-[11.5px]">{a.entity}</TableCell><TableCell className="text-[12.5px] whitespace-normal">{a.summary}</TableCell></TableRow>
                  ))}</TableBody>
                </Table>
              </>
            )}
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
