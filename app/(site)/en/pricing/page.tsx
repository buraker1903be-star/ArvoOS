import { siteMetadata } from "@/lib/site/metadata";
import { PRICING_EN as c } from "../../_content/pricing-en";
import { yayimlananFiyatlar } from "@/lib/site/fiyat-oku";
import { PricingView } from "../../_views/pricing";

export const metadata = siteMetadata({ id: c.id, locale: "en", ...c.meta });

/* Tutarlar konsoldan yayımlanmış olabilir; okunamazsa koddaki değerler
   geçerli (lib/site/fiyat-kaynagi). Sayfa statik üretiliyor ve yayımlama
   işlemi revalidatePath ile onu tazeliyor. */
export default async function Page() {
  const fiyatlar = await yayimlananFiyatlar();
  return <PricingView locale="en" c={c} fiyatlar={fiyatlar} />;
}
