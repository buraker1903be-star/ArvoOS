import { siteMetadata } from "@/lib/site/metadata";
import { DISTANCE_SALES_EN as c } from "../../_content/legal";
import { LegalView } from "../../_views/legal";

export const metadata = siteMetadata({ id: "distance-sales", locale: "en", ...c.meta });

export default function Page() {
  return <LegalView locale="en" id="distance-sales" c={c} />;
}
