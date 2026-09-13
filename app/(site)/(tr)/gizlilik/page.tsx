import { siteMetadata } from "@/lib/site/metadata";
import { PRIVACY_TR as c } from "../../_content/privacy";
import { PrivacyView } from "../../_views/privacy";

export const metadata = siteMetadata({ id: "privacy", locale: "tr", ...c.meta });

export default function Page() {
  return <PrivacyView locale="tr" c={c} />;
}
