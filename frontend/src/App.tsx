import { Routes, Route, Navigate } from "react-router-dom";
import AppShell from "@/components/AppShell";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Equipamentos from "@/pages/Equipamentos";
import Componentes from "@/pages/Componentes";
import ComponenteDetalhe from "@/pages/ComponenteDetalhe";
import Movimentacoes from "@/pages/Movimentacoes";
import Vidas from "@/pages/Vidas";
import Reformas from "@/pages/Reformas";
import Lcc from "@/pages/Lcc";
import Sap from "@/pages/Sap";
import Relatorios from "@/pages/Relatorios";
import Admin from "@/pages/Admin";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/equipamentos" element={<Equipamentos />} />
        <Route path="/componentes" element={<Componentes />} />
        <Route path="/componentes/:id" element={<ComponenteDetalhe />} />
        <Route path="/instalacao-remocao" element={<Movimentacoes />} />
        <Route path="/controle-vidas" element={<Vidas />} />
        <Route path="/reformas" element={<Reformas />} />
        <Route path="/lcc-custos" element={<Lcc />} />
        <Route path="/integracao-sap" element={<Sap />} />
        <Route path="/relatorios" element={<Relatorios />} />
        <Route path="/administracao" element={<Admin />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
