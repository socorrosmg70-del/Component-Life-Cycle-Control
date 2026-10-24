import type { ReactNode } from "react";
import { AlertOctagon, AlertTriangle, CheckCircle2, CircleDashed, Database, FileSpreadsheet, FileText, Info, PenLine, XOctagon } from "lucide-react";
import { cn } from "@/lib/utils";
import { COST_LABEL, LIFE_LABEL, STATUS_LABEL, fmtH, fmtPct, qs } from "@/lib/format";
import type { ComponentStatus, CostCategory, LifeStatus } from "@/lib/types";

export type Tone = "normal" | "atencao" | "atraso" | "inconsistencia" | "parcial" | "neutral" | "info";
const TONE: Record<Tone, string> = {
  normal: "bg-[#DCFCE7] text-[#14532D] border-[#86EFAC]",
  atencao: "bg-[#FEF3C7] text-[#78350F] border-[#FCD34D]",
  atraso: "bg-[#FEE2E2] text-[#7F1D1D] border-[#FCA5A5]",
  inconsistencia: "bg-[#F3E8FF] text-[#581C87] border-[#D8B4FE]",
  parcial: "bg-[#E0F2FE] text-[#0C4A6E] border-[#7DD3FC]",
  neutral: "bg-[#EEF0F2] text-[#2F363C] border-[#D2D7DC]",
  info: "bg-[#E9ECEF] text-[#24323D] border-[#BCC3CA]",
};
const ICON: Record<Tone, typeof Info> = {
  normal: CheckCircle2, atencao: AlertTriangle, atraso: XOctagon, inconsistencia: AlertOctagon,
  parcial: CircleDashed, neutral: Info, info: Info,
};

export function Pill({ tone, children, testid, className }: { tone: Tone; children: ReactNode; testid?: string; className?: string }) {
  const Icon = ICON[tone];
  return (
    <span data-testid={testid} className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11.5px] font-medium leading-tight whitespace-nowrap", TONE[tone], className)}>
      <Icon className="size-3 shrink-0" aria-hidden />
      {children}
    </span>
  );
}

const STATUS_TONE: Record<ComponentStatus, Tone> = {
  LIBERADO: "normal", INSTALADO: "info", REMOVIDO: "neutral", AGUARDANDO_REFORMA: "atencao",
  REFORMA_INTERNA: "parcial", REFORMA_EXTERNA: "parcial", SUCATEADO: "neutral",
};
export function ComponentStatusBadge({ status, testid }: { status: ComponentStatus; testid?: string }) {
  return <Pill tone={STATUS_TONE[status]} testid={testid}>{STATUS_LABEL[status]}</Pill>;
}

const LIFE_TONE: Record<LifeStatus, Tone> = { NORMAL: "normal", ATENCAO: "atencao", ACIMA_META: "atraso", META_NAO_DEFINIDA: "neutral" };
export function LifeStatusBadge({ status, testid }: { status: LifeStatus; testid?: string }) {
  return <Pill tone={LIFE_TONE[status]} testid={testid}>{LIFE_LABEL[status]}</Pill>;
}

export function TagEq({ tag }: { tag: string | null | undefined }) {
  if (!tag) return <span className="text-muted-foreground">—</span>;
  return <span title="TAG do equipamento" className="inline-flex items-center gap-1 rounded bg-hydro px-1.5 py-0.5 font-mono text-[11.5px] font-medium text-white whitespace-nowrap"><span className="opacity-70">EQ</span>{tag}</span>;
}
export function TagCmp({ tag }: { tag: string }) {
  return <span title="TAG do componente" className="inline-flex items-center gap-1 rounded bg-hydro-light px-1.5 py-0.5 font-mono text-[11.5px] font-medium text-white whitespace-nowrap"><span className="opacity-75">CMP</span>{tag}</span>;
}
export function SapCode({ code, pn }: { code: string | null | undefined; pn?: string | null }) {
  return (
    <span title="Código de material SAP / Part Number" className="inline-flex items-center gap-1 rounded border border-line bg-mist px-1.5 py-0.5 font-mono text-[11.5px] text-ink whitespace-nowrap">
      <span className="text-steel">SAP</span>{code || "—"}{pn !== undefined && <><span className="text-steel">· PN</span>{pn || "—"}</>}
    </span>
  );
}
export function SourceBadge({ source }: { source: string }) {
  const sap = source.toUpperCase().startsWith("SAP");
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide", sap ? "bg-[#DBEAFE] text-[#1E3A8A]" : "bg-[#EEF0F2] text-steel")}>
      {sap ? <Database className="size-3" /> : <PenLine className="size-3" />}{sap ? "SAP" : "Manual"}
    </span>
  );
}
export function costLabel(c: CostCategory) {
  return COST_LABEL[c] ?? c;
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: string; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-4 border-b border-line/70 pb-5 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.18em] text-steel">{eyebrow}</div>}
        <h1 data-testid="page-title" className="text-[28px] font-semibold leading-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-steel">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, children, actions, className, testid }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string; testid?: string }) {
  return (
    <section data-testid={testid} className={cn("min-w-0 rounded-md border border-[#E2E6EA] bg-white shadow-[0_1px_2px_rgba(26,33,39,0.04)]", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-[#E2E6EA] px-4 py-3">
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Field({ label, children, hint, required, className }: { label: string; children: ReactNode; hint?: ReactNode; required?: boolean; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1.5 text-[13px]", className)}>
      <span className="font-medium text-ink">{label}{required && <span className="ml-0.5 text-[#B91C1C]">*</span>}</span>
      {children}
      {hint && <span className="text-[12px] text-steel">{hint}</span>}
    </label>
  );
}

export function NSelect({ value, onChange, children, testid, className, disabled }: { value: string; onChange: (v: string) => void; children: ReactNode; testid?: string; className?: string; disabled?: boolean }) {
  return (
    <select data-testid={testid} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
      className={cn("h-9 w-full rounded-md border border-input bg-white px-2.5 text-sm text-ink outline-none transition-[border-color,box-shadow] focus:border-hydro-light focus:ring-2 focus:ring-hydro-light/30 disabled:opacity-60", className)}>
      {children}
    </select>
  );
}

export function KpiCard({ label, value, hint, tone, testid, onClick }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; testid?: string; onClick?: () => void }) {
  const bar: Record<Tone, string> = { normal: "bg-[#15803D]", atencao: "bg-[#B45309]", atraso: "bg-[#B91C1C]", inconsistencia: "bg-[#7E22CE]", parcial: "bg-[#0369A1]", neutral: "bg-hydro-light", info: "bg-hydro" };
  return (
    <button type="button" data-testid={testid} onClick={onClick} disabled={!onClick}
      className="group relative overflow-hidden rounded-md border border-[#E2E6EA] bg-white px-4 py-3 text-left transition-[transform,box-shadow] duration-150 enabled:hover:-translate-y-0.5 enabled:hover:shadow-md disabled:cursor-default">
      <span className={cn("absolute inset-y-0 left-0 w-1", bar[tone ?? "info"])} />
      <div className="text-[12px] font-medium uppercase tracking-wide text-steel">{label}</div>
      <div className="mt-1 font-mono text-[26px] font-medium leading-none text-ink">{value}</div>
      {hint && <div className="mt-1.5 text-[12px] text-steel">{hint}</div>}
    </button>
  );
}

export function LifeProgress({ hours, target, status, compact }: { hours: number; target: number | null; status: LifeStatus; compact?: boolean }) {
  const pct = target ? (hours / target) * 100 : null;
  const color = { NORMAL: "bg-[#15803D]", ATENCAO: "bg-[#D97706]", ACIMA_META: "bg-[#B91C1C]", META_NAO_DEFINIDA: "bg-hydro-light" }[status];
  return (
    <div className={cn("min-w-[140px]", compact ? "" : "w-full")}>
      <div className="mb-1 flex justify-between gap-2 font-mono text-[11.5px] text-steel">
        <span>{fmtH(hours)}</span>
        <span>{target ? `${fmtPct(pct)} de ${fmtH(target)}` : "meta não definida"}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E2E6EA]">
        <div className={cn("h-full rounded-full transition-[width] duration-500", color, !target && "opacity-50")} style={{ width: `${target ? Math.min(100, pct ?? 0) : 100}%` }} />
      </div>
    </div>
  );
}

export function ExportButtons({ reportKey, params, testidPrefix }: { reportKey: string; params?: Record<string, string | number | null | undefined>; testidPrefix?: string }) {
  const p = testidPrefix ?? reportKey;
  const href = (format: string) => `/api/reports/${reportKey}${qs({ ...(params ?? {}), format })}`;
  return (
    <div className="flex gap-2">
      <a data-testid={`${p}-export-xlsx`} href={href("xlsx")} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-3 text-[13px] font-medium text-ink transition-colors hover:bg-mist">
        <FileSpreadsheet className="size-4 text-[#15803D]" /> Excel
      </a>
      <a data-testid={`${p}-export-pdf`} href={href("pdf")} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-3 text-[13px] font-medium text-ink transition-colors hover:bg-mist">
        <FileText className="size-4 text-[#B91C1C]" /> PDF
      </a>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-line bg-white/60 px-4 py-8 text-center text-sm text-steel">{children}</div>;
}

export const inputCls = "h-9";
