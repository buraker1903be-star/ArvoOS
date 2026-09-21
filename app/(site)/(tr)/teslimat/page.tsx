import { siteMetadata } from "@/lib/site/metadata";
import { DELIVERY_TR as c } from "../../_content/legal";
import { LegalView } from "../../_views/legal";

export const metadata = siteMetadata({ id: "delivery", locale: "tr", ...c.meta });

export default function Page() {
  return <LegalView locale="tr" id="delivery" c={c} />;
}
