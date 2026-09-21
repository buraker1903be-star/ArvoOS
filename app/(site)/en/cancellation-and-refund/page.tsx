import { siteMetadata } from "@/lib/site/metadata";
import { REFUND_EN as c } from "../../_content/legal";
import { LegalView } from "../../_views/legal";

export const metadata = siteMetadata({ id: "refund", locale: "en", ...c.meta });

export default function Page() {
  return <LegalView locale="en" id="refund" c={c} />;
}
