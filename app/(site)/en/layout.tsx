import { SiteFooter } from "../_components/footer";
import { SiteHeader } from "../_components/header";

// İngilizce sayfalar (/en). Kök <html lang="tr"> statik kalsın diye içerik
// dili bu sarmalayıcıyla belirtilir.
export default function EnLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="en">
      <a className="skip" href="#main">Skip to content</a>
      <SiteHeader locale="en" />
      <main id="main">{children}</main>
      <SiteFooter locale="en" />
    </div>
  );
}
