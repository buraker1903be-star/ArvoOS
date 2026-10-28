import { DilHatirla } from "../_components/dil-hatirla";
import { SiteFooter } from "../_components/footer";
import { SiteHeader } from "../_components/header";

// Almanca sayfalar (/de, 28.10.2026). Kök <html lang="tr"> panel için
// statik kalsın diye içerik dili bu sarmalayıcıyla belirtilir.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="de">
      <a className="skip" href="#main">Zum Inhalt springen</a>
      <SiteHeader locale="de" />
      <main id="main">{children}</main>
      <SiteFooter locale="de" />
      <DilHatirla locale="de" />
    </div>
  );
}
