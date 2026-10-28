"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SITE_DIL_COOKIE } from "@/lib/site/dil-secimi";
import { LOCALES, LOCALE_NAMES, LOCALE_TAGS, ROUTES, resolvePath, type Locale } from "@/lib/site/routes";

/*
  Aynı sayfanın başka dildeki karşılığına bağlantılar (ROUTES üzerinden).

  Tıklanınca seçim çereze yazılır: kök adres tarayıcı dilinden önce bu
  seçime bakıyor (lib/site/dil-secimi.ts). Yazılmasaydı Türkçe tarayıcıyla
  İngilizce'yi seçen ziyaretçi ana sayfaya her dönüşünde Türkçe'ye atılırdı.
  prefetch kapalı: önceden yüklenen kök adres henüz eski çerezle /tr'ye
  yönleniyor ve tıklama boşa çıkıyordu (28.10.2026).

  Eskiden tek bir bağlantıydı ("EN" ↔ "TR"); beş dil gelince liste oldu.
  Her dil KENDİ adıyla yazılır (Deutsch, Español): ziyaretçi kendi dilini
  arıyor, bulunduğu sayfanın dilinde yazılmış adını değil.
*/
/*
  hepsi: bulunulan dil de listede, işaretli (aria-current) ve tıklanamaz.
  Başlıktaki menü böyle (28.10.2026): altı dilin tamamını görmek, "bu site
  hangi dillerde var" sorusuna tek bakışta cevap veriyor.
*/
export function DilBaglantilari({ locale, className, onNavigate, hepsi = false }: { locale: Locale; className?: string; onNavigate?: () => void; hepsi?: boolean }) {
  const pathname = usePathname() ?? "/";
  const match = resolvePath(pathname);
  return LOCALES.filter((l) => hepsi || l !== locale).map((l) => {
    if (l === locale) {
      return <span key={l} className={`${className ?? ""} on`.trim()} lang={l} aria-current="true">{LOCALE_NAMES[l]}</span>;
    }
    const href = match ? ROUTES[match.id][l] : ROUTES.home[l];
    const sec = () => {
      document.cookie = `${SITE_DIL_COOKIE}=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      onNavigate?.();
    };
    return (
      <Link key={l} className={className} href={href} hrefLang={LOCALE_TAGS[l]} lang={l} onClick={sec} prefetch={false}>
        {LOCALE_NAMES[l]}
      </Link>
    );
  });
}
