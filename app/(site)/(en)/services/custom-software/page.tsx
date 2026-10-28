import { siteMetadata } from "@/lib/site/metadata";
import { CUSTOM_SOFTWARE_EN as c } from "../../../_content/custom-software-en";
import { SubView } from "../../../_views/sub";

export const metadata = siteMetadata({ id: c.id, locale: "en", ...c.meta });

export default function Page() {
  return <SubView locale="en" c={c} />;
}
