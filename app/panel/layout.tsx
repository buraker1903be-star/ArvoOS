import type { Metadata } from "next";
import "./panel.css";

export const metadata: Metadata = {
  title: "ArvoOS Panel",
  description: "İşletmenizin operasyon merkezi",
};

export default function PanelLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="panel-root">{children}</div>;
}
