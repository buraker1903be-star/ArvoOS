"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LOCALE_TAGS, ROUTES, resolvePath, type Locale } from "@/lib/site/routes";

/** Aynı sayfanın diğer dildeki karşılığına bağlantı (ROUTES üzerinden). */
export function LangLink({ locale, className, label, short }: { locale: Locale; className?: string; label: string; short?: string }) {
  const pathname = usePathname() ?? "/";
  const other: Locale = locale === "tr" ? "en" : "tr";
  const match = resolvePath(pathname);
  const href = match ? ROUTES[match.id][other] : ROUTES.home[other];
  return (
    <Link className={className} href={href} hrefLang={LOCALE_TAGS[other]} lang={other} aria-label={label} title={label}>
      {short ?? label}
    </Link>
  );
}
