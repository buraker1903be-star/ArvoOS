import { siteMetadata } from "@/lib/site/metadata";
import { arcPage } from "../../../_content/arc";
import { ProductView } from "../../../_views/product";

const c = arcPage("en");
export const metadata = siteMetadata({ id: "arc", locale: "en", ...c.meta });

export default function Page() {
  return <ProductView locale="en" c={c} />;
}
