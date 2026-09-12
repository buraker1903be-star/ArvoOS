import { FinanceAccessGate } from "../components/finance-access-gate";

export default async function BankingLayout({ children }: { children: React.ReactNode }) {
  return <FinanceAccessGate pathname="/panel/banking">{children}</FinanceAccessGate>;
}
