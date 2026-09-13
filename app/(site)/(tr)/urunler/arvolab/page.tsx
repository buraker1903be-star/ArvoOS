import { siteMetadata } from "@/lib/site/metadata";
import { ARVOLAB_TR as c } from "../../../_content/arvolab";
import { ProductView } from "../../../_views/product";

export const metadata = siteMetadata({ id: "arvolab", locale: "tr", ...c.meta });

export default function Page() {
  return <ProductView locale="tr" c={c} />;
}
