import { siteMetadata } from "@/lib/site/metadata";
import { WEB_DESIGN_TR as c } from "../../../_content/services";
import { SubView } from "../../../_views/sub";

export const metadata = siteMetadata({ id: c.id, locale: "tr", ...c.meta });

export default function Page() {
  return <SubView locale="tr" c={c} />;
}
