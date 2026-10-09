import { redirect } from "next/navigation";

/*
  ESKİ CARİ HESAP ADRESİ. Cari artık müşteri sayfasında ortada açılan bir
  pencere (app/panel/accounts/cari-hesap.tsx); bu adres oraya, pencere
  açık olarak yönleniyor. Paylaşılmış ve yer imine eklenmiş bağlantılar
  çalışmaya devam etsin diye duruyor.
*/
export default async function EskiCariAdresi({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/panel/finance/musteri/${id}?pencere=cari`);
}
