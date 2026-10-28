import { siteMetadata } from "@/lib/site/metadata";
import { HOME_EN } from "../_content/home-en";
import { HomeView } from "../_views/home";

export const metadata = siteMetadata({ id: "home", locale: "en", title: HOME_EN.meta.title, description: HOME_EN.meta.description, absoluteTitle: true });

export default function HomePage() {
  return <HomeView locale="en" c={HOME_EN} />;
}
