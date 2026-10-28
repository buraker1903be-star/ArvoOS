import { siteMetadata } from "@/lib/site/metadata";
import { SEO_GEO_TR as c } from "../../../_content/seo-geo";
import { SubView } from "../../../_views/sub";

export const metadata = siteMetadata({ id: c.id, locale: "tr", ...c.meta });

export default function Page() {
  return <SubView locale="tr" c={c} />;
}
