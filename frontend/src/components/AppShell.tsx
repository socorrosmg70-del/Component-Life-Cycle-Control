import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Boxes, DollarSign, Factory, FileSpreadsheet, LayoutDashboard, LogOut, Menu, RefreshCw, RotateCw, Search, ShieldCheck, Truck, Wrench } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { endSession } from "@/lib/session";
import type { SearchHit } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

const MENU = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, id: "dashboard" },
  { to: "/equipamentos", label: "Equipamentos", icon: Truck, id: "equipamentos" },
  { to: "/componentes", label: "Componentes", icon: Boxes, id: "componentes" },
  { to: "/instalacao-remocao", label: "Instalação e remoção", icon: Wrench, id: "instalacao-remocao" },
  { to: "/controle-vidas", label: "Controle de vidas", icon: RotateCw, id: "controle-vidas" },
  { to: "/reformas", label: "Reformas", icon: Factory, id: "reformas" },
  { to: "/lcc-custos", label: "LCC e custos", icon: DollarSign, id: "lcc-custos" },
  { to: "/integracao-sap", label: "Integração SAP", icon: RefreshCw, id: "integracao-sap" },
  { to: "/relatorios", label: "Relatórios", icon: FileSpreadsheet, id: "relatorios" },
  { to: "/administracao", label: "Administração", icon: ShieldCheck, id: "administracao" },
];

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5 px-3">
      {MENU.map((m) => (
        <NavLink key={m.to} to={m.to} end={m.to === "/"} onClick={onNavigate} data-testid={`nav-${m.id}`}
          className={({ isActive }) => cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-[13.5px] transition-colors duration-150",
            isActive ? "bg-hydro-dark font-medium text-white shadow-[inset_3px_0_0_#BCC3CA]" : "text-[#D2D7DC] hover:bg-[#3B434A] hover:text-white",
          )}>
          <m.icon className="size-4 shrink-0" />{m.label}
        </NavLink>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3 px-6 pb-6 pt-6">
      <div className="grid size-9 place-items-center rounded-md border border-white/25 bg-white/10 font-heading text-lg font-bold text-white">C</div>
      <div className="leading-tight">
        <div className="font-heading text-[15px] font-semibold text-white">Component Life</div>
        <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#BCC3CA]">Cycle Control</div>
      </div>
    </div>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState("");
  const [deb, setDeb] = useState("");
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => setDeb(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data } = useQuery({
    queryKey: ["search", deb], enabled: deb.length >= 2,
    queryFn: () => apiGet<SearchHit[]>(`/search?q=${encodeURIComponent(deb)}`),
  });
  const go = (h: SearchHit) => {
    setOpen(false); setQ("");
    nav(h.kind === "componente" ? `/componentes/${h.id}` : `/equipamentos?q=${encodeURIComponent(h.tag)}`);
  };
  return (
    <div className="relative w-full max-w-xl">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel" />
      <Input data-testid="global-search-input" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 180)}
        placeholder="Pesquisa rápida: TAG, código SAP / PN ou nº de série" className="h-9 border-transparent bg-mist pl-9 text-sm focus-visible:border-hydro-light" />
      {open && deb.length >= 2 && (
        <div data-testid="global-search-results" className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-line bg-white shadow-lg animate-rise">
          {(data ?? []).length === 0 && <div className="px-3 py-3 text-sm text-steel">Nenhum resultado para “{deb}”.</div>}
          {(data ?? []).map((h) => (
            <button key={h.kind + h.id} type="button" data-testid={`search-hit-${h.tag}`} onMouseDown={() => go(h)}
              className="flex w-full items-start gap-3 border-b border-[#EEF0F2] px-3 py-2 text-left last:border-0 hover:bg-mist">
              <span className={cn("mt-0.5 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-white", h.kind === "componente" ? "bg-hydro-light" : "bg-hydro")}>
                {h.kind === "componente" ? "CMP" : "EQ"}
              </span>
              <span className="min-w-0">
                <span className="block font-mono text-[13px] font-medium text-ink">{h.tag}</span>
                <span className="block truncate text-[12px] text-steel">{h.label} · {h.sub}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AppShell() {
  const { data: me, isLoading, isError } = useMe();
  const [mobile, setMobile] = useState(false);
  const loc = useLocation();
  if (isError) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-hydro lg:flex">
        <Brand />
        <Nav />
        <div className="mt-auto border-t border-[#55606A] px-6 py-4 text-[11px] leading-relaxed text-[#BCC3CA]">
          Ambiente: preparação SAP<br />Integração por arquivo (CSV/JSON)
        </div>
      </aside>
      <Sheet open={mobile} onOpenChange={setMobile}>
        <SheetContent side="left" className="w-64 border-0 bg-hydro p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <Brand />
          <Nav onNavigate={() => setMobile(false)} />
        </SheetContent>
      </Sheet>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-[#E2E6EA] bg-white/90 px-4 backdrop-blur md:px-6">
          <button type="button" data-testid="mobile-menu-button" onClick={() => setMobile(true)} className="rounded p-1.5 text-ink hover:bg-mist lg:hidden" aria-label="Abrir menu">
            <Menu className="size-5" />
          </button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-3">
            {me && (
              <div className="hidden text-right leading-tight sm:block">
                <div data-testid="current-user-name" className="text-[13px] font-medium text-ink">{me.name}</div>
                <div data-testid="current-user-role" className="font-mono text-[10.5px] uppercase tracking-wide text-steel">{me.role_label}</div>
              </div>
            )}
            <button type="button" data-testid="logout-button" onClick={() => void endSession()} title="Sair"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-[13px] text-ink transition-colors hover:bg-mist">
              <LogOut className="size-4" /><span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </header>
        <main key={loc.pathname} className="mx-auto max-w-[1440px] px-4 py-6 animate-rise md:px-8 md:py-8">
          {isLoading ? <div className="h-40 animate-pulse rounded-md bg-white" /> : <Outlet />}
        </main>
        <footer className="px-8 pb-6 text-[11.5px] text-steel">
          Component Life Cycle Control · dados com origem identificada (Manual / SAP) · <Link to="/relatorios" className="underline">relatórios</Link>
        </footer>
      </div>
      <Toaster richColors position="bottom-right" />
    </div>
  );
}
