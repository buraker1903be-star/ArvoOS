import type { Metadata } from "next";
import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { getWhatsappStatus } from "@/lib/whatsapp-status";
import { listConversations, loadConversation } from "@/lib/whatsapp-inbox";
import { StgIcon } from "../../settings/settings-ui";
import { CrmTabs } from "../crm-tabs";
import { sohbetMusterisi } from "./musteri-bagi";
import Sohbet from "./sohbet";
import SohbetListesi from "./sohbet-listesi";
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

const numaraYaz = (phone: string) =>
  phone.length === 12 && phone.startsWith("90")
    ? `0${phone.slice(2, 5)} ${phone.slice(5, 8)} ${phone.slice(8, 10)} ${phone.slice(10)}`
    : phone;

export default async function WhatsappInboxPage({ searchParams }: { searchParams: Promise<{ numara?: string }> }) {
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
  const sohbetler = await listConversations(membership.organization_id);
  const { numara } = await searchParams;
  const secili = sohbetler.find((s) => s.phone === numara) ?? sohbetler[0] ?? null;
  const akis = secili ? await loadConversation(membership.organization_id, secili.phone) : null;

  const musteri = secili ? await sohbetMusterisi(secili.phone) : null;

  return <div className="stg">
    {baslik}
    <CrmTabs active="whatsapp" />

    {!durum.connected ? (
      <p className="wa-note"><StgIcon name="plug" size={16} />
        Kendi numaranız bağlı değil. Mesajlar Arvo&apos;nun ortak numarasından gidiyor; müşterinin size yazdıkları da burada görünür.
        Kendi numaranızı <Link href="/panel/settings#entegrasyonlar">Ayarlar → Entegrasyonlar</Link> bölümünden bağlayabilirsiniz.
      </p>
    ) : null}

    {!sohbetler.length ? (
      <div className="stg-empty"><StgIcon name="chat" size={22} /><p>Henüz WhatsApp mesajı yok. Gönderdiğiniz ve müşterinizin yazdığı mesajlar burada birikir.</p></div>
    ) : (
      <div className="wa-inbox">
        <SohbetListesi sohbetler={sohbetler} seciliNumara={secili?.phone ?? null} />

        {secili && akis ? (
          <section className="wa-thread">
            <div className="wa-thread-head">
              <div>
                {/* Ad önce CRM kaydından: müşterinin WhatsApp profil adı
                    takma ad olabiliyor, kayıttaki ad ise satışçının bildiği ad. */}
                <h2>{musteri?.name ?? secili.name ?? numaraYaz(secili.phone)}</h2>
                <small>{numaraYaz(secili.phone)} · {akis.messages.length} mesaj</small>
                {musteri ? (
                  <small className="wa-musteri">
                    CRM kaydı: {musteri.counts.requests} talep
                    {musteri.counts.proposals ? ` · ${musteri.counts.proposals} teklif` : ""}
                    {musteri.counts.contracts ? ` · ${musteri.counts.contracts} sözleşme` : ""}
                    {musteri.lastContactLabel ? ` · son temas ${musteri.lastContactLabel}` : ""}
                  </small>
                ) : null}
              </div>
              <span className="status-pill" data-tone={akis.windowOpen ? "success" : "neutral"}>
                {akis.windowOpen ? "Yanıt penceresi açık" : "Yanıt penceresi kapalı"}
              </span>
            </div>

            <Sohbet
              key={secili.phone}
              telefon={secili.phone}
              ilkMesajlar={akis.messages}
              ilkPencere={akis.windowOpen}
              kendiNumarasi={durum.connected}
            />
          </section>
        ) : null}
      </div>
    )}
  </div>;
}
