"use server";

import { flashSuccess, runPanelAction } from "@/lib/panel-action";
import { formatPersonName } from "@/lib/format-name";
import { resolvePublicHost } from "@/lib/public-host";
import { contractMessages, organizationBrandName, proposalMessages } from "@/lib/customer-message-templates";
import { sendThroughGateway } from "@/lib/whatsapp-gateway";
import { loadConversation } from "@/lib/whatsapp-inbox";
import { normalizePhone } from "@/lib/whatsapp-send";
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

async function belgeyiWhatsappGonder__impl(kind: Tur, token: string) {
  const { supabase, membership, organization } = await getPanelContext();
  const isProposal = kind === "proposal";

  /*
    Belgeyi anahtardan okuyoruz, kimlikten değil: aynı işlem hem liste hem
    detay sayfasından çağrılıyor ve liste sayfası müşteri bilgisini adres
    parametrelerinden alıyor (telefon oraya hiç taşınmıyordu). Kurum
    kısıtı da burada: başka kurumun anahtarı bilinse bile satır gelmez.
  */
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

  const belgeNo = String((data as Record<string, unknown>)[isProposal ? "proposal_no" : "contract_no"] ?? "");
  const musteriAdi = formatPersonName(musteri?.customer_name) || "";
  const kurumAdi = organizationBrandName({
    slug: organization.slug,
    displayName: organization.display_name,
    legalName: organization.name,
  });

  // Serbest metin yalnızca müşterinin son mesajından sonraki 24 saat
  // içinde geçerli; Meta'ya sormadan önce kendi kaydımıza bakıyoruz.
  const { windowOpen } = await loadConversation(membership.organization_id, telefon);

  let govde: string;
  const mesaj: Parameters<typeof sendThroughGateway>[0]["messages"][number] = { to: telefon, ref: data.id };

  if (windowOpen) {
    const publicHost = await resolvePublicHost(supabase, membership.organization_id);
    const url = `https://${publicHost}/${isProposal ? "teklif" : "sozlesme"}/${data.share_token}`;
    const metinler = (isProposal ? proposalMessages : contractMessages)({
      organizationName: kurumAdi,
      customerName: musteriAdi,
      documentNo: belgeNo,
      title: data.title ?? undefined,
      url,
    });
    govde = metinler.whatsapp;
    mesaj.text = govde;
  } else {
    /*
      Şablon parametreleri isimli: sıra kayarsa yanlış değer yanlış yere
      gider ve bunu kimse fark etmez. Bağlantı gövdede değil düğmede,
      o yüzden yalnızca anahtar gönderiliyor.
    */
    mesaj.template = SABLON[kind];
    mesaj.params = { musteri: musteriAdi || "Yetkili", kurum: kurumAdi, belge_no: belgeNo };
    mesaj.urlButtonParam = String(data.share_token ?? "");
    // Kayda düşecek metin: gelen kutusu müşterinin gördüğüne yakın bir şey göstersin.
    govde = isProposal
      ? `${belgeNo} numaralı teklifiniz hazır. (onaylı şablon)`
      : `${belgeNo} numaralı sözleşmeniz imzanızı bekliyor. (onaylı şablon)`;
    mesaj.body = govde;
  }

  const sonuc = await sendThroughGateway({
    product: "arvoos",
    organizationId: membership.organization_id,
    sender: "organization",
    messages: [mesaj],
  });

  const ilk = sonuc.results[0];
  if (!ilk?.sent) {
    const sebep = ilk?.error ?? "Mesaj gönderilemedi.";
    throw new Error(
      windowOpen
        ? sebep
        : `${sebep} (Bu mesaj "${SABLON[kind]}" onaylı şablonuyla gidiyor; Meta'da onaylanmadan gönderilemez.)`,
    );
  }

  // Yalnızca mesaj gerçekten gittiğinde taslaktan çıkar.
  await markDocumentShared(kind, token);

  await flashSuccess(
    windowOpen
      ? `WhatsApp'tan gönderildi: ${musteriAdi || telefon}`
      : `WhatsApp'tan gönderildi (onaylı şablon): ${musteriAdi || telefon}`,
  );
}

export async function belgeyiWhatsappGonder(kind: Tur, token: string): Promise<void> {
  await runPanelAction(() => belgeyiWhatsappGonder__impl(kind, token));
}
