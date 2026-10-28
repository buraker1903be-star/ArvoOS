import { DilHatirla } from "../_components/dil-hatirla";
import { SiteFooter } from "../_components/footer";
import { SiteHeader } from "../_components/header";

// İngilizce sayfalar (kök, 28.10.2026'dan beri varsayılan dil). Kök
// <html lang="tr"> panel için statik kalsın diye içerik dili bu
// sarmalayıcıyla belirtilir.
export default function EnLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="en">
      <a className="skip" href="#main">Skip to content</a>
      <SiteHeader locale="en" />
      <main id="main">{children}</main>
      <SiteFooter locale="en" />
      <DilHatirla locale="en" />
    </div>
  );
}
