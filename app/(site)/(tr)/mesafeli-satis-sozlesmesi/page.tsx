import { siteMetadata } from "@/lib/site/metadata";
import { DISTANCE_SALES_TR as c } from "../../_content/legal";
import { LegalView } from "../../_views/legal";

export const metadata = siteMetadata({ id: "distance-sales", locale: "tr", ...c.meta });

export default function Page() {
  return <LegalView locale="tr" id="distance-sales" c={c} />;
}
