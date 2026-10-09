import { redirect } from "next/navigation";

/*
  ESKİ İŞ MALİYETİ ADRESİ. Maliyet detayı artık İş Maliyetleri listesinde
  ortada açılan bir pencere (../maliyet-detayi.tsx); bu adres oraya
  yönleniyor ki paylaşılmış bağlantılar çalışmaya devam etsin.
*/
export default async function EskiMaliyetAdresi({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/panel/finance?gorunum=maliyet&maliyet=${encodeURIComponent(id)}`);
}
