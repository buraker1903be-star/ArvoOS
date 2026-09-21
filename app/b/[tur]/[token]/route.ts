import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLATFORM_HOST, resolvePublicHost } from "@/lib/public-host";

/*
  Kısa bağlantı: /b/teklif/<anahtar> → https://<kurumun alan adı>/teklif/<anahtar>

  Neden var: WhatsApp şablonlarındaki bağlantı düğmesinin tabanı Meta'da
  SABİT yazılır ve yalnızca sonuna tek bir değişken eklenir. Oysa müşteriye
  giden adres kurumdan kuruma değişiyor — kendi alan adını doğrulatmış kurum
  kendi adresini kullanıyor (lib/public-host.ts). İkisini uzlaştıran yer
  burası: düğme hep bu adrese gider, buradan doğru alan adına yönlendirilir.

  Bağlantıyı şablonun gövdesine yazmak alternatifti; Meta gövde değişkeni
  içindeki adresleri sık reddediyor ve müşteri dokunulabilir bir düğme
  yerine düz metin görüyordu.

  Anahtar burada doğrulanmıyor: geçersiz anahtarın "yok" olduğunu söylemek,
  hangi anahtarların var olduğunu deneyerek öğrenmeye kapı açardı. Hedef
  sayfa zaten geçersiz anahtarı kendi işliyor.
*/

const TURLER: Record<string, { tablo: "crm_proposals" | "crm_contracts"; yol: string }> = {
  teklif: { tablo: "crm_proposals", yol: "teklif" },
  sozlesme: { tablo: "crm_contracts", yol: "sozlesme" },
};

export async function GET(_request: Request, { params }: { params: Promise<{ tur: string; token: string }> }) {
  const { tur, token } = await params;
  const hedef = TURLER[tur];
  // Tanınmayan tür: uydurma bir adrese yönlendirmek yerine ana sayfa.
  if (!hedef) return NextResponse.redirect(`https://${PLATFORM_HOST}/`, 307);

  let host = PLATFORM_HOST;
  const admin = createAdminClient();
  if (admin) {
    const { data } = await admin
      .from(hedef.tablo)
      .select("organization_id")
      .eq("share_token", token)
      .maybeSingle();
    /*
      Kurum bulunamazsa ya da sorgu düşerse platform alan adına gidilir:
      yönlendirmenin başarısız olması, müşterinin elindeki bağlantının hiç
      açılmaması demek olurdu. Platform adresi her kurumun belgesini
      açabiliyor, yalnızca marka kurumun kendi alan adı kadar olmuyor.
    */
    if (data?.organization_id) host = await resolvePublicHost(admin, data.organization_id);
  }

  // 307: adres kalıcı değil (kurum alan adını sonra doğrulatabilir).
  return NextResponse.redirect(`https://${host}/${hedef.yol}/${encodeURIComponent(token)}`, 307);
}
