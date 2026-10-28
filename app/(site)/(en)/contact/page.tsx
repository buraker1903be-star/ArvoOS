import { siteMetadata } from "@/lib/site/metadata";
import { CONTACT_EN as c } from "../../_content/contact-en";
import { ContactView, toInterest } from "../../_views/contact";

export const metadata = siteMetadata({ id: "contact", locale: "en", ...c.meta });

// ?interest=arvoos|arvolab|arc|services|other preselects the form interest.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return <ContactView locale="en" c={c} interest={toInterest(sp.interest ?? sp.ilgi)} />;
}
