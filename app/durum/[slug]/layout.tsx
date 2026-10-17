import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { slugMarkasi } from "@/lib/takip-markasi";

/*
  KURUM DENETİMİ BURADA, SAYFADA DEĞİL — YUMUŞAK 404 YÜZÜNDEN
  (17.10.2026).

  Olmayan bir kurum adresi (/durum/yok-boyle-kurum) 404 SAYFASINI
  gösteriyor ama yanıt kodu 200 dönüyordu. Sebebi `loading.tsx`:
  bir Suspense sınırı kuruyor, yanıt iskeletle birlikte hemen
  akmaya başlıyor ve sayfa sonradan `notFound()` çağırdığında
  durum kodu çoktan gönderilmiş oluyor.

  Yumuşak 404'ün bedeli görünmez ama gerçek: arama motoru sayfayı
  var sayıp dizine alır, izleme araçları kırık bağlantıyı
  yakalayamaz, bir bağlantıyı yanlış yazan müşteri "sayfa var ama
  boş" izlenimi alır.

  Yerleşim (layout) Suspense sınırının ÜSTÜNDE çalışıyor, yani
  buradaki `notFound()` gerçek 404 üretiyor. İskelet de yerinde
  kalıyor: sayfanın kendi işi hâlâ sınırın içinde.

  Marka okuması `lib/takip-markasi` üzerinden ve 60 saniye
  önbellekli; bu yüzden yerleşim, başlık ve sayfa aynı istekte tek
  sorgu yapıyor (eskiden başlık ve sayfa ayrı ayrı soruyordu).
*/
export default async function TakipYerlesimi({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  if (!(await slugMarkasi(supabase, slug))) notFound();
  return children;
}
