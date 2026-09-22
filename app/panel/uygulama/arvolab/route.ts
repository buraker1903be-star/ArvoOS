import { NextResponse } from "next/server";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { arvolabGirisBaglantisi } from "@/lib/arvolab";
import { flashError } from "@/lib/panel-action";

/*
  ArvoOS panelinden ArvoLab'a tek tıkla geçiş.

  Kurumun personeli ArvoLab'a geçmek için ikinci kez giriş yapmak zorundaydı:
  ayrı proje, ayrı auth, ayrı parola. Çoğu kişi ArvoLab'da bir hesabı
  olduğunu bile bilmiyordu ve "giriş yapamıyorum" diye kuruma dönüyordu.

  Burada üç şey sırayla doğrulanıyor ve üçü de GEREKLİ:

    1. Oturum — getPanelContext yoksa zaten fırlatıyor.
    2. Kurumun ArvoLab lisansı açık mı. Kapalıysa geçiş yok: ArvoLab kendi
       kapısını da kapatıyor ama kişiyi oraya gönderip "erişiminiz yok"
       ekranıyla karşılaştırmak, buradan hiç göndermemekten kötü.
    3. Kişinin e-postası. Oturumdaki kullanıcıdan okunuyor; adresi
       dışarıdan almıyoruz, yoksa bu yol "istediğim e-postayla ArvoLab'a
       gir" düğmesine dönüşürdü.

  Üretilen bağlantı TEK KULLANIMLIK ve yalnızca yönlendirme olarak
  kullanılıyor; ekrana yazılmıyor, log'a düşmüyor.
*/

export const dynamic = "force-dynamic";

const ACIK_LISANSLAR = new Set(["active", "trialing", "past_due"]);

export async function GET(request: Request) {
  const { membership, organization, userId } = await getPanelContext();

  const admin = createAdminClient();
  if (!admin) {
    await flashError("ArvoLab geçişi şu an kullanılamıyor.");
    return NextResponse.redirect(new URL("/panel", request.url));
  }

  const { data: lisans } = await admin
    .from("organization_product_licenses")
    .select("status")
    .eq("organization_id", membership.organization_id)
    .eq("product", "arvolab")
    .maybeSingle();

  if (!ACIK_LISANSLAR.has(lisans?.status ?? "inactive")) {
    await flashError(`${organization.display_name || organization.name} için ArvoLab aboneliği açık değil.`);
    return NextResponse.redirect(new URL("/panel", request.url));
  }

  const { data: kullanici } = await admin.auth.admin.getUserById(userId);
  const email = kullanici.user?.email ?? null;
  if (!email) {
    await flashError("Hesabınızda e-posta adresi olmadığı için ArvoLab'a geçilemiyor.");
    return NextResponse.redirect(new URL("/panel", request.url));
  }

  const sonuc = await arvolabGirisBaglantisi(email);
  if ("hata" in sonuc) {
    await flashError(sonuc.hata);
    return NextResponse.redirect(new URL("/panel", request.url));
  }

  /*
    no-store: tek kullanımlık bağlantı ara bir önbelleğe düşerse ikinci
    kişi aynı adrese gittiğinde tüketilmiş bir belirteçle karşılaşır — ya
    da daha kötüsü, düşmemesi gereken yerde durur.
  */
  return NextResponse.redirect(sonuc.url, { headers: { "Cache-Control": "no-store" } });
}
