import { SiteFooter } from "../_components/footer";
import { SiteHeader } from "../_components/header";

// Türkçe sayfalar (kök). <html lang="tr"> kök yerleşimden gelir.
export default function TrLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a className="skip" href="#main">İçeriğe geç</a>
      <SiteHeader locale="tr" />
      <main id="main">{children}</main>
      <SiteFooter locale="tr" />
    </>
  );
}
