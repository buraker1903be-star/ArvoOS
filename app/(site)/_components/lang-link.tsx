"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SITE_DIL_COOKIE } from "@/lib/site/dil-secimi";
import { LOCALE_TAGS, ROUTES, resolvePath, type Locale } from "@/lib/site/routes";

/*
  Aynı sayfanın diğer dildeki karşılığına bağlantı (ROUTES üzerinden).
  Tıklanınca seçim çereze yazılır: kök adres tarayıcı dilinden önce bu
  seçime bakıyor (lib/site/dil-secimi.ts). Yazılmasaydı Türkçe tarayıcıyla
  İngilizce'yi seçen ziyaretçi ana sayfaya her dönüşünde Türkçe'ye atılırdı.
*/
export function LangLink({ locale, className, label, short }: { locale: Locale; className?: string; label: string; short?: string }) {
  const pathname = usePathname() ?? "/";
  const other: Locale = locale === "tr" ? "en" : "tr";
  const match = resolvePath(pathname);
  const href = match ? ROUTES[match.id][other] : ROUTES.home[other];
  const sec = () => {
    document.cookie = `${SITE_DIL_COOKIE}=${other}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  };
  return (
    <Link className={className} href={href} hrefLang={LOCALE_TAGS[other]} lang={other} aria-label={label} title={label} onClick={sec} prefetch={false}>
      {short ?? label}
    </Link>
  );
}
