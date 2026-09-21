"use server";

import { flashSuccess, runPanelAction } from "@/lib/panel-action";
import { formatPersonName } from "@/lib/format-name";
import { resolvePublicHost } from "@/lib/public-host";
import { contractMessages, organizationBrandName, proposalMessages } from "@/lib/customer-message-templates";
import { sendThroughGateway } from "@/lib/whatsapp-gateway";
import { loadConversation } from "@/lib/whatsapp-inbox";
import { normalizePhone } from "@/lib/whatsapp-send";
import { belgeGonderimYolu } from "@/lib/belge-gonderim-yolu";
import { arvoKurumuMu } from "@/lib/arvo-kurumu";
import { getWhatsappStatus } from "@/lib/whatsapp-status";
import { getPanelContext } from "./sales-shared";
import { markDocumentShared } from "./document-share-actions";

/*
  Teklif ve sözleşmeyi müşteriye WhatsApp'tan göndermek.

  Eskiden düğme `wa.me/?text=...` açıyordu: personel WhatsApp Web'e düşüyor,
  numarayı elle seçiyor, mesajı elle yapıştırıyordu. Üç sonucu vardı —
  gönderim kaydı hiç tutulmuyordu ("gitti mi" sorusunun yanıtı yoktu),
  yanlış kişiye gitmesi çok kolaydı, ve mesaj personelin kendi telefon
  numarasından gidiyordu, kurumun numarasından değil.

  Artık mesaj kapıdan geçiyor (lib/whatsapp-gateway.ts): tek yerde anahtar,
  tek yerde kayıt. Gönderilen mesaj CRM → WhatsApp ekranında da görünüyor.

  META KURALI iki yol dayatıyor:
    - Müşteri son 24 saatte yazdıysa serbest metin gider; e-postayla aynı
      metni yolluyoruz, bağlantı içinde.
    - Yazmadıysa yalnızca ONAYLI ŞABLON gider. Şablonda bağlantı dinamik
      URL düğmesinde; oraya yalnızca paylaşım anahtarı gönderiliyor, tabanı
      Meta'da sabit (app/b/kisa-baglanti.ts bunu kurumun alan adına taşır).

  Şablon henüz onaylı değilse Meta 132001 döndürür ve kullanıcı bunu
  ekranda okur. Sessizce e-postaya ya da wa.me'ye düşmüyoruz: "gönderdim"
  sanıp beklemek, hiç göndermemekten kötü.
*/

const SABLON = {
  proposal: "teklif_hazir",
  contract: "sozlesme_imza",
} as const;

type Tur = keyof typeof SABLON;

/*
  Belgenin alıcısı ve gönderim yolu.

  Belgeyi ANAHTARDAN okuyoruz, kimlikten değil: aynı işlem hem liste hem
  detay sayfasından çağrılıyor ve liste sayfası müşteri bilgisini adres
  parametrelerinden alıyor (telefon oraya hiç taşınmıyordu). Kurum kısıtı
  da burada: başka kurumun anahtarı bilinse bile satır gelmez.
*/
async function belgeAlicisi(kind: Tur, token: string) {
  const { supabase, membership, organization } = await getPanelContext();
  const isProposal = kind === "proposal";

  const { data, error } = await supabase
    .from(isProposal ? "crm_proposals" : "crm_contracts")
    .select(
      `id,title,share_token,${isProposal ? "proposal_no" : "contract_no"},crm_opportunities!inner(customer_name,contact_phone)`,
    )
    .eq("organization_id", membership.organization_id)
    .eq("share_token", String(token ?? "").slice(0, 200))
    .maybeSingle();

  if (error) throw new Error("Belge okunamadı: " + error.message);
  if (!data) throw new Error("Belge bulunamadı.");

  const musteri = Array.isArray(data.crm_opportunities) ? data.crm_opportunities[0] : data.crm_opportunities;
  const telefon = normalizePhone(String(musteri?.contact_phone ?? ""));
  if (!telefon) {
    throw new Error(
      "Müşterinin cep telefonu kayıtlı değil ya da biçimi tanınmıyor. Fırsat kaydındaki telefonu 05XX XXX XX XX olarak girin.",
    );
  }

  /*
    Kendi numarasını bağlamamış kurum panelden göndermiyor: mesajı
    Arvo'nun ortak numarasından yollamak, müşteriye hiç tanımadığı bir
    numaradan yazmak olurdu. O kurumda eski usul (WhatsApp Web) sürüyor ve
    ekran da o düğmeyi gösteriyor; burası ikinci kapı, çünkü sunucu işlemi
    ekrandan bağımsız çağrılabilir.
  */
  const durum = await getWhatsappStatus(membership.organization_id);
  const yol = belgeGonderimYolu({
    kendiNumarasiBagli: durum.connected && durum.status !== "disabled",
    arvoKurumu: await arvoKurumuMu(supabase, membership.organization_id),
  });

  return {
    supabase,
    organizationId: membership.organization_id,
    organization,
    belgeId: data.id as string,
    belgeNo: String((data as Record<string, unknown>)[isProposal ? "proposal_no" : "contract_no"] ?? ""),
    baslik: (data.title as string | null) ?? null,
    shareToken: String(data.share_token ?? ""),
    musteriAdi: formatPersonName(musteri?.customer_name) || "",
    telefon,
    yol,
    isProposal,
  };
}

async function belgeyiWhatsappGonder__impl(kind: Tur, token: string) {
  const hedef = await belgeAlicisi(kind, token);
  if (hedef.yol !== "panel") {
    throw new Error(
      "Panelden göndermek için kendi WhatsApp Business numaranızı bağlayın (Ayarlar → Entegrasyonlar). " +
        "Bağlamadan gönderirsek müşteriniz mesajı tanımadığı bir numaradan alır.",
    );
  }

  const kurumAdi = organizationBrandName({
    slug: hedef.organization.slug,
    displayName: hedef.organization.display_name,
    legalName: hedef.organization.name,
  });

  // Serbest metin yalnızca müşterinin son mesajından sonraki 24 saat
  // içinde geçerli; Meta'ya sormadan önce kendi kaydımıza bakıyoruz.
  const { windowOpen } = await loadConversation(hedef.organizationId, hedef.telefon);

  const mesaj: Parameters<typeof sendThroughGateway>[0]["messages"][number] = { to: hedef.telefon, ref: hedef.belgeId };

  if (windowOpen) {
    const publicHost = await resolvePublicHost(hedef.supabase, hedef.organizationId);
    const url = `https://${publicHost}/${hedef.isProposal ? "teklif" : "sozlesme"}/${hedef.shareToken}`;
    const metinler = (hedef.isProposal ? proposalMessages : contractMessages)({
      organizationName: kurumAdi,
      customerName: hedef.musteriAdi,
      documentNo: hedef.belgeNo,
      title: hedef.baslik ?? undefined,
      url,
    });
    mesaj.text = metinler.whatsapp;
  } else {
    /*
      Şablon parametreleri isimli: sıra kayarsa yanlış değer yanlış yere
      gider ve bunu kimse fark etmez. Bağlantı gövdede değil düğmede,
      o yüzden yalnızca anahtar gönderiliyor.
    */
    mesaj.template = SABLON[kind];
    mesaj.params = { musteri: hedef.musteriAdi || "Yetkili", kurum: kurumAdi, belge_no: hedef.belgeNo };
    mesaj.urlButtonParam = hedef.shareToken;
    // Kayda düşecek metin: gelen kutusu müşterinin gördüğüne yakın bir şey göstersin.
    mesaj.body = hedef.isProposal
      ? `${hedef.belgeNo} numaralı teklifiniz hazır. (onaylı şablon)`
      : `${hedef.belgeNo} numaralı sözleşmeniz imzanızı bekliyor. (onaylı şablon)`;
  }

  const sonuc = await sendThroughGateway({
    product: "arvoos",
    organizationId: hedef.organizationId,
    sender: "organization",
    messages: [mesaj],
  });

  const ilk = sonuc.results[0];
  if (!ilk?.sent) {
    /*
      Hangi şablonla denendiği yazılıyor ama SEBEP olarak sunulmuyor.
      Eskiden burada "bu şablon onaylanmadan gönderilemez" yazıyordu ve
      Meta "erişim anahtarı geçersiz" (190) dediğinde bile aynı cümle
      çıkıyordu: kullanıcı onaylı bir şablonu onaysız sanıp saatlerce
      yanlış yerde arıyordu. Sebebi Meta söyler, biz bağlamı ekleriz.
    */
    const sebep = ilk?.error ?? "Mesaj gönderilemedi.";
    throw new Error(windowOpen ? sebep : `${sebep} (Şablon: ${SABLON[kind]})`);
  }

  // Yalnızca mesaj gerçekten gittiğinde taslaktan çıkar.
  await markDocumentShared(kind, token);

  await flashSuccess(
    windowOpen
      ? `WhatsApp'tan gönderildi: ${hedef.musteriAdi || hedef.telefon}`
      : `WhatsApp'tan gönderildi (onaylı şablon): ${hedef.musteriAdi || hedef.telefon}`,
  );
}

export async function belgeyiWhatsappGonder(kind: Tur, token: string): Promise<void> {
  await runPanelAction(() => belgeyiWhatsappGonder__impl(kind, token));
}


/*
  Belgeyle ilgili serbest metin gönderimi (takip kodu, ek protokol
  hatırlatması…).

  Bunlar teklif/sözleşmenin kendisi değil, onunla ilgili ikincil mesajlar
  ve her birinin ayrı bir onaylı şablonu yok. Bu yüzden yalnızca 24 saatlik
  pencere içinde gidiyorlar; pencere kapalıyken sebebini söyleyip
  duruyoruz. Sessizce wa.me'ye düşmüyoruz — kullanıcı gönderdiğini sanıp
  beklerdi.

  Metin ekrandan geliyor çünkü her çağrı yerinin kendi cümlesi var; ama
  ALICI ekrandan gelmiyor, belgeden okunuyor: numarayı istemciden almak,
  ekranı değiştirebilen birinin mesajı istediği numaraya yollaması demekti.
*/
async function belgeMetniGonder__impl(kind: Tur, token: string, metin: string) {
  const govde = String(metin ?? "").trim();
  if (!govde) throw new Error("Gönderilecek metin boş.");

  const hedef = await belgeAlicisi(kind, token);
  if (hedef.yol !== "panel") {
    throw new Error(
      "Panelden göndermek için kendi WhatsApp Business numaranızı bağlayın (Ayarlar → Entegrasyonlar).",
    );
  }

  const { windowOpen } = await loadConversation(hedef.organizationId, hedef.telefon);
  if (!windowOpen) {
    throw new Error(
      "Müşteri son 24 saatte yazmadığı için serbest metin gönderilemiyor (Meta kuralı). " +
        "Bu mesajın onaylı şablonu yok; müşteri size yazdığında gönderebilirsiniz.",
    );
  }

  const sonuc = await sendThroughGateway({
    product: "arvoos",
    organizationId: hedef.organizationId,
    sender: "organization",
    messages: [{ to: hedef.telefon, text: govde, ref: hedef.belgeId }],
  });

  const ilk = sonuc.results[0];
  if (!ilk?.sent) throw new Error(ilk?.error ?? "Mesaj gönderilemedi.");

  await flashSuccess(`WhatsApp'tan gönderildi: ${hedef.musteriAdi || hedef.telefon}`);
}

export async function belgeMetniGonder(kind: Tur, token: string, metin: string): Promise<void> {
  await runPanelAction(() => belgeMetniGonder__impl(kind, token, metin));
}
