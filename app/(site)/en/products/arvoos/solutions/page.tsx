import { siteMetadata } from "@/lib/site/metadata";
import { SOLUTIONS_EN as c } from "../../../../_content/arvoos-more-en";
import { SubView } from "../../../../_views/sub";

export const metadata = siteMetadata({ id: c.id, locale: "en", ...c.meta });

export default function Page() {
  return <SubView locale="en" c={c} />;
}
