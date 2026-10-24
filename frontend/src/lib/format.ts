import { ApiError } from "./api";
import type { ComponentStatus, CostCategory, LifeStatus } from "./types";

const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const fmtH = (v: number | null | undefined) => (v == null ? "—" : `${nf0.format(v)} h`);
export const fmtN = (v: number | null | undefined) => (v == null ? "—" : nf1.format(v));
export const fmtBRL = (v: number | null | undefined) => (v == null ? "Não informado" : brl.format(v));
export const fmtPct = (v: number | null | undefined) => (v == null ? "—" : `${nf1.format(v)}%`);
export function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  return d ? `${d}/${m}/${y}` : s;
}
export function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? s : dt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
export function todayLocal(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) {
    const b = e.body as { detail?: unknown } | null;
    if (typeof b?.detail === "string") return b.detail;
    if (Array.isArray(b?.detail)) {
      return (b.detail as { loc?: unknown[]; msg?: string }[])
        .map((d) => `${String(d.loc?.slice(-1)[0] ?? "campo")}: ${d.msg ?? "inválido"}`)
        .join(" · ");
    }
    if (e.status === 403) return "Sem permissão para esta operação";
    return `Erro ${e.status}`;
  }
  return "Falha de comunicação com o servidor";
}

export const STATUS_LABEL: Record<ComponentStatus, string> = {
  LIBERADO: "Liberado p/ instalação",
  INSTALADO: "Instalado",
  REMOVIDO: "Removido",
  AGUARDANDO_REFORMA: "Aguardando reforma",
  REFORMA_INTERNA: "Em reforma interna",
  REFORMA_EXTERNA: "Em reforma externa",
  SUCATEADO: "Substituído / baixado",
};
export const LIFE_LABEL: Record<LifeStatus, string> = {
  NORMAL: "Normal",
  ATENCAO: "Atenção",
  ACIMA_META: "Acima da meta",
  META_NAO_DEFINIDA: "Meta não definida",
};
export const LIFE_STATUS_LABEL: Record<string, string> = {
  EM_ANDAMENTO: "Em andamento",
  ENCERRADA: "Encerrada",
  ENCERRADA_ANTECIPADA: "Encerrada antecipadamente",
  SUBSTITUIDO: "Encerrada — substituição",
};
export const REFORM_STATUS_LABEL: Record<string, string> = {
  AGUARDANDO_ENVIO: "Aguardando envio",
  EM_EXECUCAO: "Em execução",
  RETORNADO: "Retornado — aguardando inspeção",
  CONCLUIDO: "Concluída e liberada",
  REPROVADO: "Reprovada",
};
export const COST_LABEL: Record<CostCategory, string> = {
  AQUISICAO: "Aquisição",
  REFORMA_INTERNA: "Reforma interna (serviço)",
  REFORMA_EXTERNA: "Reforma externa (serviço)",
  MATERIAIS: "Materiais e peças",
  MAO_DE_OBRA: "Mão de obra",
  TRANSPORTE: "Transporte",
  INSPECAO: "Inspeção e testes",
  OUTROS: "Outros custos diretos",
  SUBSTITUICAO: "Substituição",
};
export const EQ_STATUS_LABEL: Record<string, string> = {
  OPERANDO: "Operando",
  MANUTENCAO: "Em manutenção",
  PARADO: "Parado",
  INATIVO: "Inativo",
};
export const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  pcm: "PCM",
  engenharia: "Engenharia / Confiabilidade",
  oficina: "Oficina",
  consulta: "Usuário de consulta",
  gestor: "Gestor",
};

/** Build a query string from a filter object, skipping empty values. */
export function qs(f: Record<string, string | number | null | undefined>): string {
  const p = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : "";
}
