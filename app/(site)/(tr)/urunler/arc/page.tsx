import { siteMetadata } from "@/lib/site/metadata";
import { arcPage } from "../../../_content/arc";
import { ProductView } from "../../../_views/product";

const c = arcPage("tr");
export const metadata = siteMetadata({ id: "arc", locale: "tr", ...c.meta });

export default function Page() {
  return <ProductView locale="tr" c={c} />;
}
