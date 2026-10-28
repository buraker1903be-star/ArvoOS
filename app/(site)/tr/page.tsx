import { siteMetadata } from "@/lib/site/metadata";
import { HOME_TR } from "../_content/home";
import { HomeView } from "../_views/home";

export const metadata = siteMetadata({ id: "home", locale: "tr", title: HOME_TR.meta.title, description: HOME_TR.meta.description, absoluteTitle: true });

export default function HomePage() {
  return <HomeView locale="tr" c={HOME_TR} />;
}
