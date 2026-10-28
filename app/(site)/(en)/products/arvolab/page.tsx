import { siteMetadata } from "@/lib/site/metadata";
import { ARVOLAB_EN as c } from "../../../_content/arvolab-en";
import { ProductView } from "../../../_views/product";

export const metadata = siteMetadata({ id: "arvolab", locale: "en", ...c.meta });

export default function Page() {
  return <ProductView locale="en" c={c} />;
}
