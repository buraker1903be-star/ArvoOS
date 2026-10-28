import { siteMetadata } from "@/lib/site/metadata";
import { ARVOOS_EN as c } from "../../../_content/arvoos-en";
import { ProductView } from "../../../_views/product";

export const metadata = siteMetadata({ id: "arvoos", locale: "en", ...c.meta });

export default function Page() {
  return <ProductView locale="en" c={c} />;
}
