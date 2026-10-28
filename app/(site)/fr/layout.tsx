import { DilHatirla } from "../_components/dil-hatirla";
import { SiteFooter } from "../_components/footer";
import { SiteHeader } from "../_components/header";

// Fransızca sayfalar (/fr, 28.10.2026). Kök <html lang="tr"> panel için
// statik kalsın diye içerik dili bu sarmalayıcıyla belirtilir.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="fr">
      <a className="skip" href="#main">Aller au contenu</a>
      <SiteHeader locale="fr" />
      <main id="main">{children}</main>
      <SiteFooter locale="fr" />
      <DilHatirla locale="fr" />
    </div>
  );
}
