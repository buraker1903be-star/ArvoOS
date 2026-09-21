import { NextResponse } from "next/server";
import { getPanelContext } from "@/lib/panel-context";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { medyayiSakla } from "@/lib/whatsapp-inbox";

/*
  WhatsApp dosyasını gösteren/indiren tek kapı.

  Kova özel ve storage.objects üzerinde authenticated politikası yok: dosya
  yalnızca buradan alınabiliyor. Yetki burada bir kez doğrulanıyor —
  mesajın çağıranın kurumuna ait olması. Kovaya doğrudan okuma açsaydık,
  yolu tahmin edebilen bir kurum üyesi başka kurumun dosyasını açabilirdi.

  Dosya henüz inmemişse (webhook sırasında Meta'ya ulaşılamamış olabilir)
  burada bir kez daha deneniyor: Meta'daki aslı yaklaşık 30 gün duruyor ve
  kullanıcının dosyayı açtığı an, yeniden denemek için en doğru an.
*/
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const context = await getPanelContext();
  assertModuleKeyAccess(context.membership.role, "crm", context.hiddenModuleKeys);

  const admin = createAdminClient();
  if (!admin) return new NextResponse("Sunucu anahtarı tanımlı değil.", { status: 503 });

  const { data: mesaj } = await admin
    .from("whatsapp_messages")
    .select("id,organization_id,phone_number_id,message_type,media_id,media_mime,media_filename,media_path,media_status")
    .eq("id", id)
    // Kurum kısıtı: mesaj kimliği bilinse bile başka kurumun satırı gelmez.
    .eq("organization_id", context.membership.organization_id)
    .maybeSingle();

  if (!mesaj) return new NextResponse("Dosya bulunamadı.", { status: 404 });

  let yol = mesaj.media_path as string | null;

  if (!yol && mesaj.media_id) {
    // İlk denemede inmemiş; kullanıcı açmak istediğine göre şimdi deneyelim.
    const oldu = await medyayiSakla(admin, {
      mesajId: mesaj.id as string,
      organizationId: mesaj.organization_id as string,
      phoneNumberId: (mesaj.phone_number_id as string) ?? "",
      tur: (mesaj.message_type as string) ?? "document",
      mediaId: mesaj.media_id as string,
      mime: (mesaj.media_mime as string | null) ?? null,
      dosyaAdi: (mesaj.media_filename as string | null) ?? null,
    });
    if (!oldu) return new NextResponse("Dosya indirilemedi. Meta'daki kopyası silinmiş olabilir.", { status: 502 });

    const { data: tazelenmis } = await admin
      .from("whatsapp_messages")
      .select("media_path")
      .eq("id", id)
      .maybeSingle();
    yol = (tazelenmis?.media_path as string | null) ?? null;
  }

  if (!yol) return new NextResponse("Bu mesajda dosya yok.", { status: 404 });

  // 60 saniyelik imzalı bağlantı: adres paylaşılsa bile kısa sürede ölür.
  const { data: imzali, error } = await admin.storage.from("whatsapp-media").createSignedUrl(yol, 60);
  if (error || !imzali?.signedUrl) return new NextResponse("Dosya açılamadı.", { status: 502 });

  return NextResponse.redirect(imzali.signedUrl, 307);
}
