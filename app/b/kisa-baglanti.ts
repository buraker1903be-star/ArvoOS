import { createAdminClient } from "@/lib/supabase/admin";
import { PLATFORM_HOST, resolvePublicHost } from "@/lib/public-host";

/*
  Kısa bağlantının hedefi: /b/<tur>/<anahtar> → kurumun kendi alan adındaki
  belge sayfası.

  Neden var: WhatsApp şablonlarındaki bağlantı düğmesinin tabanı Meta'da
  SABİT yazılır ve yalnızca sonuna tek bir değişken eklenir. Oysa müşteriye
  giden adres kurumdan kuruma değişiyor — kendi alan adını doğrulatmış kurum
  kendi adresini kullanıyor (lib/public-host.ts).

  İki adres biçimi de destekleniyor:
    /b/teklif/<anahtar>     (değişken yol sonunda)
    /b/teklif?t=<anahtar>   (değişken sorgu parametresinde)
  Meta'nın şablon düzenleyicisi tabanı hangi biçimde kabul ederse etsin
  bağlantı çalışsın diye; şablon onaylandıktan sonra biçimi değiştirmek
  yeni bir onay turu demek.
*/

const TURLER: Record<string, { tablo: "crm_proposals" | "crm_contracts"; yol: string }> = {
  teklif: { tablo: "crm_proposals", yol: "teklif" },
  sozlesme: { tablo: "crm_contracts", yol: "sozlesme" },
};

/**
 * Yönlendirilecek tam adres.
 *
 * Anahtar burada doğrulanmıyor: geçersiz anahtarın "yok" olduğunu söylemek,
 * hangi anahtarların var olduğunu deneyerek öğrenmeye kapı açardı. Hedef
 * sayfa zaten geçersiz anahtarı kendi işliyor.
 */
export async function hedefAdres(tur: string, token: string): Promise<string> {
  const hedef = TURLER[tur];
  // Tanınmayan tür ya da boş anahtar: uydurma bir adres yerine ana sayfa.
  if (!hedef || !token) return `https://${PLATFORM_HOST}/`;

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

  return `https://${host}/${hedef.yol}/${encodeURIComponent(token)}`;
}
