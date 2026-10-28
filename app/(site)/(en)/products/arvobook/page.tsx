import { siteMetadata } from "@/lib/site/metadata";
import { RANDEVU_EN as c } from "../../../_content/randevu-en";
import { ProductView } from "../../../_views/product";

export const metadata = siteMetadata({ id: "randevu", locale: "en", ...c.meta });

export default function Page() {
  return <ProductView locale="en" c={c} />;
}
