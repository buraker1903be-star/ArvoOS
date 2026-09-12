import { FinanceAccessGate } from "../components/finance-access-gate";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  return <FinanceAccessGate pathname="/panel/finance">{children}</FinanceAccessGate>;
}
