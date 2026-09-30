import { siteMetadata } from "@/lib/site/metadata";
import { PRICING_EN as c } from "../../_content/pricing-en";
import { PricingView } from "../../_views/pricing";

export const metadata = siteMetadata({ id: c.id, locale: "en", ...c.meta });

export default function Page() {
  return <PricingView locale="en" c={c} />;
}
