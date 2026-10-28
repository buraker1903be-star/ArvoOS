import { siteMetadata } from "@/lib/site/metadata";
import { PRIVACY_EN as c } from "../../_content/privacy-en";
import { PrivacyView } from "../../_views/privacy";

export const metadata = siteMetadata({ id: "privacy", locale: "en", ...c.meta });

export default function Page() {
  return <PrivacyView locale="en" c={c} />;
}
