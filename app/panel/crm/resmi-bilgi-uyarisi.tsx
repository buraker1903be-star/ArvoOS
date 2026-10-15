import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { eksikResmiAlanlar, legalDetailsFrom, LEGAL_FIELDS } from "../settings/legal-details";

/*
  RESMİ BİLGİ EKSİKSE MÜŞTERİYE GİDEN BELGEDE YER TUTUCU YAZIYOR.

  Adres, il, vergi dairesi, vergi/TC numarası ve IBAN belgeye basılıyor.
  Boş bırakıldığında belge hata vermiyor: taraf kartı ve Ön
  Bilgilendirme Formu "Ticaret siciline kayıtlı merkez adresi" gibi bir
  AÇIKLAMA yazıyor, vergi satırı ve banka bilgisi hiç çıkmıyor. Deneme
  kurumunda imzalanmış bir sözleşmede tam olarak bu görüldü
  (15.10.2026): sözleşme imzalandı, hizmet sağlayıcının adresi yok.

  Kurulum adımı ana ekranda bunu zaten söylüyor ama orası kurulum anı;
  eksikliğin bedeli belge müşteriye giderken ödeniyor. Uyarı bu yüzden
  gönderme düğmesinin yanında duruyor.

  ENGEL DEĞİL, uyarı: şahıs işletmesi vergi dairesi yerine TC kimlik
  numarası kullanıyor, kimi kurum IBAN'ı sonradan giriyor. Hangi alanın
  gerçekten gerektiğini yalnızca kurum bilir; panel yalnızca belgede ne
  görüneceğini söylüyor.
*/
export async function ResmiBilgiUyarisi({
  organizationId,
  belge,
}: {
  organizationId: string;
  /** Uyarı metninde geçen belge adı. */
  belge: "teklif" | "sözleşme";
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select(LEGAL_FIELDS.join(","))
    .eq("id", organizationId)
    .maybeSingle();
  /*
    Okunamazsa uyarı çizilmiyor: eksik olduğunu bilmiyoruz ve "eksik"
    demek, dolu bir kuruma yanlış uyarı göstermek olurdu. İz bırakıyor.
  */
  if (error) {
    console.error("[resmi-bilgi] kurum alanları okunamadı", { organizationId, hata: error.message });
    return null;
  }
  const eksikler = eksikResmiAlanlar(legalDetailsFrom(data as Record<string, unknown> | null));
  if (!eksikler.length) return null;

  return (
    <p className="crm-resmi-uyari">
      <b>Resmi bilgileriniz eksik:</b> {eksikler.map((e) => e.ad).join(", ")}. Bu alanlar müşteriye giden{" "}
      {belge} belgesine basılıyor; boşken belgede yer tutucu görünür.{" "}
      <Link href="/panel/settings?bolum=resmi-bilgiler">Ayarlar → Resmi bilgiler</Link>
    </p>
  );
}
