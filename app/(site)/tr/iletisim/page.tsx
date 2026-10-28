import { siteMetadata } from "@/lib/site/metadata";
import { CONTACT_TR as c } from "../../_content/contact";
import { ContactView, toInterest } from "../../_views/contact";

export const metadata = siteMetadata({ id: "contact", locale: "tr", ...c.meta });

// ?ilgi=arvoos|arvolab|arc|services|other formda ilgi alanını önceden seçer.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return <ContactView locale="tr" c={c} interest={toInterest(sp.ilgi ?? sp.interest)} />;
}
