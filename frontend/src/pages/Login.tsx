import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Eye, Lock, Wrench } from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import { errMsg } from "@/lib/format";
import type { UserOut } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";

export default function Login() {
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const enter = (u: UserOut) => { beginSession(); toast.success(`Bem-vindo(a), ${u.name}`); nav("/"); };
  const ctrl = useMutation({ mutationFn: () => apiPost<UserOut>("/auth/login", { password }), onSuccess: enter, onError: (e) => toast.error(errMsg(e)) });
  const visitor = useMutation({ mutationFn: () => apiPost<UserOut>("/auth/visitor"), onSuccess: enter, onError: (e) => toast.error(errMsg(e)) });
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.15fr_1fr]">
      <section className="relative hidden min-h-screen overflow-hidden bg-hydro text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "repeating-linear-gradient(135deg,#fff 0 1px,transparent 1px 22px)" }} />
        <div className="relative">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#BCC3CA]">Manutenção · PCM · Confiabilidade</div>
          <h1 className="mt-4 max-w-lg text-[44px] font-semibold leading-[1.05]">Component Life Cycle Control</h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[#D2D7DC]">
            Rastreabilidade de instalações e remoções, controle de até quatro vidas, reformas internas e externas e
            custo do ciclo de vida (LCC) de componentes de máquinas pesadas.
          </p>
        </div>
        <div className="relative grid max-w-xl grid-cols-3 gap-px overflow-hidden rounded-md border border-white/15 bg-white/15">
          {[["Horas trabalhadas", "Remoção − Instalação"], ["Vidas", "1ª 12.000 h · 2ª 10.000 h · 3ª 8.000 h"], ["TAG da máquina", "TE-8015 · CA-8014 · ES-8003"]].map(([a, b]) => (
            <div key={a} className="bg-hydro px-4 py-4">
              <div className="text-[12px] uppercase tracking-wide text-[#BCC3CA]">{a}</div>
              <div className="mt-1 font-mono text-[13px]">{b}</div>
            </div>
          ))}
        </div>
      </section>
      <section className="flex items-center justify-center bg-mist px-6 py-12">
        <div className="w-full max-w-sm animate-rise">
          <div className="mb-8 font-mono text-[11px] uppercase tracking-[0.2em] text-steel lg:hidden">Component Life Cycle Control</div>
          <h2 className="text-[26px] font-semibold text-ink">Acesso ao sistema</h2>
          <p className="mt-1 text-sm text-steel">Escolha como deseja entrar.</p>

          <form data-testid="login-controller-card" className="mt-6 rounded-md border border-line bg-white p-5" onSubmit={(e) => { e.preventDefault(); ctrl.mutate(); }}>
            <div className="flex items-center gap-2 font-heading text-[17px] font-semibold text-ink"><Wrench className="size-5 text-hydro" />Controlador de componentes</div>
            <p className="mt-1 text-[12.5px] text-steel">Acesso completo: cadastro, instalação/remoção, vidas, reformas, custos e SAP.</p>
            <label className="mt-4 flex flex-col gap-1.5 text-[13px]">
              <span className="font-medium text-ink">Senha</span>
              <Input data-testid="login-password-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus className="h-10 bg-white" />
            </label>
            <Button data-testid="login-submit-button" type="submit" disabled={ctrl.isPending || !password} className="mt-3 h-10 w-full bg-hydro text-white hover:bg-hydro-dark active:scale-[0.98]">
              <Lock className="size-4" /> {ctrl.isPending ? "Entrando…" : "Entrar como Controlador"}
            </Button>
          </form>

          <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-wide text-steel"><span className="h-px flex-1 bg-line" />ou<span className="h-px flex-1 bg-line" /></div>

          <button type="button" data-testid="login-visitor-button" onClick={() => visitor.mutate()} disabled={visitor.isPending}
            className="flex w-full items-center gap-3 rounded-md border border-line bg-white p-4 text-left transition-[border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-hydro-light disabled:opacity-60">
            <Eye className="size-5 shrink-0 text-hydro-light" />
            <span>
              <span className="block font-heading text-[16px] font-semibold text-ink">Entrar como Visitante</span>
              <span className="block text-[12.5px] text-steel">Sem senha · somente consulta, sem edição</span>
            </span>
          </button>
        </div>
      </section>
      <Toaster richColors position="bottom-right" />
    </div>
  );
}
