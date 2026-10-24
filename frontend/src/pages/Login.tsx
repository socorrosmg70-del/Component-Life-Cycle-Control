import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import { errMsg } from "@/lib/format";
import type { UserOut } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { Field } from "@/components/common";

const DEMO = [
  ["admin@hydro.com", "Administrador"], ["pcm@hydro.com", "PCM"], ["engenharia@hydro.com", "Engenharia"],
  ["oficina@hydro.com", "Oficina"], ["gestor@hydro.com", "Gestor"], ["consulta@hydro.com", "Consulta"],
];

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const m = useMutation({
    mutationFn: () => apiPost<UserOut>("/auth/login", { email, password }),
    onSuccess: (u) => { beginSession(); toast.success(`Bem-vindo(a), ${u.name}`); nav("/"); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.15fr_1fr]">
      <section className="relative hidden overflow-hidden bg-hydro text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
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
          {[["Horas trabalhadas", "Remoção − Instalação"], ["Vidas", "1ª 12.000 h · 2ª 10.000 h · 3ª 8.000 h"], ["LCC", "R$/h por vida e ciclo"]].map(([a, b]) => (
            <div key={a} className="bg-hydro px-4 py-4">
              <div className="text-[12px] uppercase tracking-wide text-[#BCC3CA]">{a}</div>
              <div className="mt-1 font-mono text-[13px]">{b}</div>
            </div>
          ))}
        </div>
      </section>
      <section className="flex items-center justify-center bg-mist px-6 py-12">
        <div className="w-full max-w-sm animate-rise">
          <div className="mb-8 lg:hidden">
            <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-steel">Component Life Cycle Control</div>
          </div>
          <h2 className="text-[26px] font-semibold text-ink">Acesso ao sistema</h2>
          <p className="mt-1 text-sm text-steel">Entre com seu usuário corporativo. As permissões seguem seu perfil.</p>
          <form className="mt-6 flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
            <Field label="E-mail"><Input data-testid="login-email-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-10 bg-white" /></Field>
            <Field label="Senha"><Input data-testid="login-password-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-10 bg-white" /></Field>
            <Button data-testid="login-submit-button" type="submit" disabled={m.isPending} className="h-10 bg-hydro text-white hover:bg-hydro-dark active:scale-[0.98]">
              <Lock className="size-4" /> {m.isPending ? "Entrando…" : "Entrar"}
            </Button>
          </form>
          <div className="mt-8 rounded-md border border-line bg-white p-4">
            <div className="text-[12px] font-medium uppercase tracking-wide text-steel">Contas de demonstração · senha Hydro@2026</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {DEMO.map(([em, label]) => (
                <button key={em} type="button" data-testid={`demo-login-${label.toLowerCase()}`}
                  onClick={() => { setEmail(em); setPassword("Hydro@2026"); }}
                  className="rounded border border-line px-2 py-1.5 text-left text-[12.5px] text-ink transition-colors hover:border-hydro-light hover:bg-mist">
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
      <Toaster richColors position="bottom-right" />
    </div>
  );
}
