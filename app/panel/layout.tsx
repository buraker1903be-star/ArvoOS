import type { Metadata } from "next";
import "./panel.css";
import "./team.css";
import "./structure.css";

export const metadata: Metadata = {
  title: "ArvoOS Panel",
  description: "ArvoOS kurumsal çalışma alanı",
};

export default function PanelLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="panel-root">{children}</div>;
}
