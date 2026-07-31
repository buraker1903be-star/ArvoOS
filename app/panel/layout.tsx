import type { Metadata } from "next";
import PanelShell from "./panel-shell";
import "./panel.css";
import "./team.css";
import "./structure.css";
import "./audit.css";
import "./crm.css";
import "./work.css";
import "./finance.css";
import "./inventory.css";
import "./shell.css";

export const metadata: Metadata = {
  title: "ArvoOS Panel",
  description: "ArvoOS kurumsal çalışma alanı",
};

export default function PanelLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="panel-root"><PanelShell>{children}</PanelShell></div>;
}
