import { DilHatirla } from "../_components/dil-hatirla";
import { SiteFooter } from "../_components/footer";
import { SiteHeader } from "../_components/header";

// İspanyolca sayfalar (/es, 28.10.2026). Kök <html lang="tr"> panel için
// statik kalsın diye içerik dili bu sarmalayıcıyla belirtilir.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="es">
      <a className="skip" href="#main">Saltar al contenido</a>
      <SiteHeader locale="es" />
      <main id="main">{children}</main>
      <SiteFooter locale="es" />
      <DilHatirla locale="es" />
    </div>
  );
}
