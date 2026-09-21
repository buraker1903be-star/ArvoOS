import type { Metadata } from "next";
import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { getWhatsappStatus } from "@/lib/whatsapp-status";
import { listConversations, listQuickReplies, loadConversation } from "@/lib/whatsapp-inbox";
import { hazirMesajListesi } from "@/lib/whatsapp-hazir-mesaj";
import { basHarfler, numaraYaz, renkTonu } from "@/lib/whatsapp-kisi-gorunumu";
import { StgIcon } from "../../settings/settings-ui";
import { CrmTabs } from "../crm-tabs";
import { sohbetMusterisi } from "./musteri-bagi";
import Sohbet from "./sohbet";
import SohbetListesi from "./sohbet-listesi";
import ArsivDugmesi from "./arsiv-dugmesi";
import "../../settings/settings.css";
import "./whatsapp-inbox.css";

export const metadata: Metadata = { title: "WhatsApp | CRM | ArvoOS" };
export const dynamic = "force-dynamic";

/*
  Müşterinin WhatsApp'tan yazdıkları (Meta webhook → whatsapp_messages) ve
  bizim gönderdiklerimiz tek akışta. Dört ürünün mesajı da burada görünür:
  müşteri için hepsi aynı sohbet, ayırmak yapay olurdu.

  Sayfa CRM modülünün altında: yazışma, müşterinin talebi ve teklifinin
  yanında durmalı. Eskiden Ayarlar → Entegrasyonlar altındaydı — orası
  yapılandırma yeri, günlük iş değil; satışçı her mesaj için ayarlara
  giriyordu. Numara bağlama ve bağlantı kontrolü ayarlarda kaldı.

  Yetki CRM modülüyle aynı: Satış Personeli de görür. Teklifini görebilen
  kişi konuşmasını da görebilmeli. Erişim /panel/crm ön ekiyle modül
  yetkilendirmesinden geçiyor (lib/role-permissions.ts), tabloda RLS de var.

  Serbest metinle yanıt yalnızca müşterinin son mesajından sonraki 24 saat
  içinde mümkün (Meta kuralı); pencere kapalıyken kutu yerine sebebi yazıyoruz.
*/

export default async function WhatsappInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ numara?: string; arsiv?: string }>;
}) {
  const { membership } = await getPanelContext();

  const baslik = (
    <div className="panel-pagehead">
      <div><small className="panel-kicker">CRM</small><h1>WhatsApp</h1></div>
      <div className="panel-page-actions">
        {/* Numara bağlama ve bağlantı kontrolü yapılandırmadır, ayarlarda kalır. */}
        <Link className="panel-secondary" href="/panel/settings#entegrasyonlar">Numara ayarları</Link>
      </div>
    </div>
  );

  const durum = await getWhatsappStatus(membership.organization_id);
  const tumSohbetler = await listConversations(membership.organization_id);
  const { numara, arsiv } = await searchParams;

  /*
    Arşiv ayrı bir liste, karışık değil: amacı kapanmış yazışmayı günlük
    listeden çıkarmak. İki liste de aynı sorgudan çıkıyor; arşiv sayısını
    göstermek için ikisi de gerekiyor.
  */
  const arsivGorunumu = arsiv === "1";
  const arsivdekiler = tumSohbetler.filter((s) => s.archived);
  const sohbetler = arsivGorunumu ? arsivdekiler : tumSohbetler.filter((s) => !s.archived);

  const secili = sohbetler.find((s) => s.phone === numara) ?? sohbetler[0] ?? null;
  const akis = secili ? await loadConversation(membership.organization_id, secili.phone) : null;
  const musteri = secili ? await sohbetMusterisi(secili.phone) : null;

  const hazir = hazirMesajListesi(await listQuickReplies(membership.organization_id));

  /*
    Dar ekranda tek seferde tek bölme görünür: sohbet seçilmemişse liste,
    seçilmişse yazışma. Eskiden ikisi alt alta duruyordu; iki ayrı kaydırma
    alanı üst üste binince sayfa uzuyor, telefonda mesajlara ulaşmak için
    önce listeyi geçmek gerekiyordu. Geniş ekranda ikisi yan yana kalır.

    Ölçüt adresteki `numara`: kullanıcının bir sohbete DOKUNMUŞ olması.
    `secili` bunu söyleyemez, çünkü hiçbir şey seçilmediğinde ilk sohbete
    düşüyor — telefonda sayfa doğrudan bir yazışmayla açılırdı.
  */
  const gorunum = numara ? "sohbet" : "liste";

  // Ad önce CRM kaydından: müşterinin WhatsApp profil adı takma ad
  // olabiliyor, kayıttaki ad ise satışçının bildiği ad.
  const gorunenAd = musteri?.name ?? secili?.name ?? null;

  return <div className="stg">
    {baslik}
    <CrmTabs active="whatsapp" />

    {!durum.connected ? (
      <p className="wa-note"><StgIcon name="plug" size={16} />
        Kendi numaranız bağlı değil. Mesajlar Arvo&apos;nun ortak numarasından gidiyor; müşterinin size yazdıkları da burada görünür.
        Kendi numaranızı <Link href="/panel/settings#entegrasyonlar">Ayarlar → Entegrasyonlar</Link> bölümünden bağlayabilirsiniz.
      </p>
    ) : null}

    {!tumSohbetler.length ? (
      <div className="stg-empty"><StgIcon name="chat" size={22} /><p>Henüz WhatsApp mesajı yok. Gönderdiğiniz ve müşterinizin yazdığı mesajlar burada birikir.</p></div>
    ) : (
      <div className="wa-inbox" data-gorunum={gorunum}>
        <SohbetListesi
          sohbetler={sohbetler}
          seciliNumara={secili?.phone ?? null}
          arsivGorunumu={arsivGorunumu}
          arsivSayisi={arsivdekiler.length}
        />

        {secili && akis ? (
          <section className="wa-thread">
            <div className="wa-thread-head">
              {/* Yalnızca dar ekranda görünür: yazışma tüm ekranı kapladığı
                  için listeye dönecek bir yol olmalı. */}
              <Link className="wa-geri" href={`/panel/crm/whatsapp${arsivGorunumu ? "?arsiv=1" : ""}`} aria-label="Sohbet listesine dön">←</Link>

              <span className="wa-avatar" style={{ "--wa-ton": renkTonu(secili.phone) } as React.CSSProperties} aria-hidden="true">
                {basHarfler(gorunenAd, secili.phone)}
              </span>

              <div>
                <h2>{gorunenAd ?? numaraYaz(secili.phone)}</h2>
                <small>
                  {numaraYaz(secili.phone)} · {akis.messages.length} mesaj
                  {musteri ? (
                    <>
                      {" · "}
                      <span className="wa-musteri">
                        {musteri.counts.requests} talep
                        {musteri.counts.proposals ? ` · ${musteri.counts.proposals} teklif` : ""}
                        {musteri.counts.contracts ? ` · ${musteri.counts.contracts} sözleşme` : ""}
                      </span>
                    </>
                  ) : null}
                </small>
              </div>

              <div className="wa-thread-araclar">
                <span className="status-pill" data-tone={akis.windowOpen ? "success" : "neutral"}>
                  {akis.windowOpen ? "Yanıt penceresi açık" : "Yanıt penceresi kapalı"}
                </span>
                <ArsivDugmesi telefon={secili.phone} arsivde={secili.archived} />
              </div>
            </div>

            <Sohbet
              key={secili.phone}
              telefon={secili.phone}
              ilkMesajlar={akis.messages}
              ilkPencere={akis.windowOpen}
              kendiNumarasi={durum.connected}
              hazirKendi={hazir.kendi}
              hazirOnerilen={hazir.onerilen}
              musteriAdi={gorunenAd}
            />
          </section>
        ) : (
          /* Arşiv sekmesi boşken sağ sütun bembeyaz kalıyordu; iki bölmeli
             kabukta bu "sayfa yarım yüklendi" gibi görünüyor. */
          <section className="wa-thread wa-thread-bos">
            <StgIcon name="chat" size={26} />
            <p>{arsivGorunumu ? "Arşivde sohbet yok." : "Soldan bir sohbet seçin."}</p>
          </section>
        )}
      </div>
    )}
  </div>;
}
