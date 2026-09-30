import { siteMetadata } from "@/lib/site/metadata";
import { RANDEVU_TR as c } from "../../../_content/randevu";
import { ProductView } from "../../../_views/product";

export const metadata = siteMetadata({ id: "randevu", locale: "tr", ...c.meta });

export default function Page() {
  return <ProductView locale="tr" c={c} />;
}
