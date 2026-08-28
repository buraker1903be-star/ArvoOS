import { redirect } from "next/navigation";

export default function FinanceAccountsRedirectPage() {
  redirect("/panel/finance?tab=cari");
}
