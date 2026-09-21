import { siteMetadata } from "@/lib/site/metadata";
import { DELIVERY_EN as c } from "../../_content/legal";
import { LegalView } from "../../_views/legal";

export const metadata = siteMetadata({ id: "delivery", locale: "en", ...c.meta });

export default function Page() {
  return <LegalView locale="en" id="delivery" c={c} />;
}
