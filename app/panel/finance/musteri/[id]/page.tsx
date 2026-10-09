import { MusteriDetayi } from "../../../musteri/musteri-detayi";

/*
  FİNANS → MÜŞTERİLER DETAYI (2026-10), cariden açılan adres. İçerik CRM'in
  müşteri sayfasıyla ortak (app/panel/musteri/musteri-detayi.tsx). Cari
  hesap burada ortada açılan bir pencere; ?pencere=cari açık başlatır.
*/
export default async function FinansMusteriPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pencere?: string }> }) {
  const { id } = await params;
  const { pencere } = await searchParams;
  return <MusteriDetayi cariId={id} pencere={pencere} adres={`/panel/finance/musteri/${id}`} />;
}
