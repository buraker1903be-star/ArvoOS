import { getPanelContext } from "@/lib/panel-context";
import { postaEkiniGetir } from "@/lib/posta-esitleme";
import { guvenliDosyaAdi } from "@/lib/posta-ayristirma";

/*
  EKLİ DOSYA İNDİRME.

  Üç kapı sırayla ve üçü de gerekli:

   1. Yetki — posta.gor. Sayfada kontrol etmek yetmez, bu yol adresi
      bilinerek de çağrılabilir.
   2. Mesaj BU KURUMUN mu. Gmail erişim belirteci kurumun kendi
      kutusuna ait, ama mesaj kimliği adresten geliyor: kontrol
      olmasaydı başka bir kurumun panelinden kopyalanan kimlikle
      kendi kutusundan dosya indirilemezdi — ama kendi kurumunun
      kutusunda OLMAYAN bir mesaj da indirilebilirdi. Satır
      mail_messages'ta yoksa indirilmez.
   3. Dosya adı ve türü GMAIL'den okunuyor, adresten değil.

  Ek saklanmıyor: istek anında Gmail'den geçiyor. Kurumun bütün
  eklerini ikinci bir yerde çoğaltmak, sakladığımız kişisel veriyi
  gereksiz büyütürdü (gövdelerde olduğu gibi).
*/

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ messageId: string; ekId: string }> }) {
  const { messageId, ekId } = await params;
  const { supabase, membership, izin } = await getPanelContext();

  if (!izin("posta.gor")) return new Response("Bu dosyayı indirme yetkiniz yok.", { status: 403 });

  const { data: mesaj } = await supabase
    .from("mail_messages")
    .select("message_id")
    .eq("organization_id", membership.organization_id)
    .eq("message_id", messageId)
    .maybeSingle();
  if (!mesaj) return new Response("Mesaj bulunamadı.", { status: 404 });

  const sonuc = await postaEkiniGetir(membership.organization_id, messageId, ekId);
  if ("hata" in sonuc) return new Response(sonuc.hata, { status: 502 });

  return new Response(new Uint8Array(sonuc.veri), {
    headers: {
      "content-type": sonuc.tur,
      /* filename* (RFC 5987) Türkçe harfleri taşıyor; yanındaki sade
         filename eski istemciler için. Ad gönderenden geldiği için
         başlığa girmeden temizleniyor. */
      "content-disposition": `attachment; filename="${guvenliDosyaAdi(sonuc.dosyaAdi)}"; filename*=UTF-8''${encodeURIComponent(sonuc.dosyaAdi)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
