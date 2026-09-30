import { siteMetadata } from "@/lib/site/metadata";
import { PRICING_TR as c } from "../../_content/pricing";
import { PricingView } from "../../_views/pricing";

export const metadata = siteMetadata({ id: c.id, locale: "tr", ...c.meta });

export default function Page() {
  return <PricingView locale="tr" c={c} />;
}
