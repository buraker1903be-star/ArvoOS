import { siteMetadata } from "@/lib/site/metadata";
import { REFUND_TR as c } from "../../_content/legal";
import { LegalView } from "../../_views/legal";

export const metadata = siteMetadata({ id: "refund", locale: "tr", ...c.meta });

export default function Page() {
  return <LegalView locale="tr" id="refund" c={c} />;
}
