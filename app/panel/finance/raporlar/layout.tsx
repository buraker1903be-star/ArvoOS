import { FinanceAccessGate } from "../../components/finance-access-gate";

// Raporlar, Yetkilendirme'de finanstan AYRI bir kutucuk ("reports"). Üstteki
// finans düzeni yolu sabit "/panel/finance" olarak verdiği için bu alt yol hiç
// değerlendirilmiyordu: Raporlar kutucuğu kapatılmış bir rol, sayfayı adresi
// yazarak açabiliyordu — kutucuğun kapattığı tek şey paneldeki kısayoldu.
//
// Kapı buraya gerçek yolla konuyor; assertModuleAccess artık yolun dokunduğu
// bütün modülleri denetlediği için hem finansın hem raporların açık olması
// gerekiyor (paneldeki kısayol da zaten ikisini birden arıyor).
export default async function RaporlarLayout({ children }: { children: React.ReactNode }) {
  return <FinanceAccessGate pathname="/panel/finance/raporlar">{children}</FinanceAccessGate>;
}
