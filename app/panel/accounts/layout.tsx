import { FinanceAccessGate } from "../components/finance-access-gate";

export default async function AccountsLayout({ children }: { children: React.ReactNode }) {
  return <FinanceAccessGate pathname="/panel/accounts">{children}</FinanceAccessGate>;
}
