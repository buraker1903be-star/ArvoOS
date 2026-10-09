import { MusteriDetayi } from "../../../musteri/musteri-detayi";

/*
  MÜŞTERİ SAYFASI, talepten açılan adres. İçerik Finans → Müşteriler
  detayıyla ortak (app/panel/musteri/musteri-detayi.tsx); iki adres modül
  kapısı yüzünden var (bkz. oradaki açıklama).
*/
export default async function MusteriPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pencere?: string }> }) {
  const { id } = await params;
  const { pencere } = await searchParams;
  return <MusteriDetayi talepId={id} pencere={pencere} adres={`/panel/crm/musteri/${id}`} />;
}
