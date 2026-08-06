import { redirect } from "next/navigation";

export default function BankingRedirectPage() {
  redirect("/panel/finance?tab=banka");
}
