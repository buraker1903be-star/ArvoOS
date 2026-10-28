import { siteMetadata } from "@/lib/site/metadata";
import { ARVOOS_TR as c } from "../../../_content/arvoos";
import { ProductView } from "../../../_views/product";

export const metadata = siteMetadata({ id: "arvoos", locale: "tr", ...c.meta });

export default function Page() {
  return <ProductView locale="tr" c={c} />;
}
