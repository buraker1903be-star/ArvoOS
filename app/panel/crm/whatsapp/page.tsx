import type { Metadata } from "next";
import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { getWhatsappStatus } from "@/lib/whatsapp-status";
import { listConversations, loadConversation } from "@/lib/whatsapp-inbox";
import { StgIcon } from "../../settings/settings-ui";
import { CrmTabs } from "../crm-tabs";
import { sohbetMusterisi } from "./musteri-bagi";
import { replyWhatsapp } from "../../settings/whatsapp/actions";
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

const saat = (value: string) =>
  new Date(value).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const numaraYaz = (phone: string) =>
  phone.length === 12 && phone.startsWith("90")
    ? `0${phone.slice(2, 5)} ${phone.slice(5, 8)} ${phone.slice(8, 10)} ${phone.slice(10)}`
    : phone;

const DURUM: Record<string, string> = {
  queued: "sırada", sent: "gönderildi", delivered: "iletildi",
  read: "okundu", failed: "gitmedi", received: "geldi",
};

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
        <nav className="wa-list" aria-label="Sohbetler">
          {sohbetler.map((sohbet) => (
            <Link key={sohbet.phone} href={`/panel/crm/whatsapp?numara=${sohbet.phone}`} aria-current={secili?.phone === sohbet.phone}>
              <span className="wa-list-top">
                <b>{sohbet.name ?? numaraYaz(sohbet.phone)}</b>
                <time dateTime={sohbet.lastAt}>{saat(sohbet.lastAt)}</time>
              </span>
              <small>{sohbet.lastDirection === "outbound" ? "↗ " : "↙ "}{sohbet.lastBody ?? "—"}</small>
            </Link>
          ))}
        </nav>

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

            <div className="wa-flow">
              {akis.messages.map((mesaj) => (
                <div key={mesaj.id} className="wa-msg" data-yon={mesaj.direction} data-durum={mesaj.status}>
                  {mesaj.body ?? (mesaj.template ? `[şablon: ${mesaj.template}]` : "—")}
                  <span className="wa-msg-alt">
                    <time dateTime={mesaj.createdAt}>{saat(mesaj.createdAt)}</time>
                    {mesaj.direction === "outbound" ? <b>{DURUM[mesaj.status] ?? mesaj.status}</b> : null}
                    {mesaj.error ? <span>· {mesaj.error}</span> : null}
                  </span>
                </div>
              ))}
            </div>

            {akis.windowOpen ? (
              <form className="wa-reply" action={replyWhatsapp}>
                <input type="hidden" name="phone" value={secili.phone} />
                <textarea name="text" maxLength={4096} required placeholder="Yanıtınızı yazın…" aria-label="Yanıt" />
                <div className="wa-reply-foot">
                  <p className="wa-note"><StgIcon name="chat" size={16} />Yanıt {durum.connected ? "kendi numaranızdan" : "Arvo’nun ortak numarasından"} gider.</p>
                  <button className="panel-primary" type="submit">Gönder</button>
                </div>
              </form>
            ) : (
              <p className="wa-note"><StgIcon name="lock" size={16} />
                Müşteri son 24 saat içinde yazmadığı için serbest metin gönderilemiyor (Meta kuralı).
                Müşteri yeniden yazdığında pencere açılır; o zamana kadar yalnızca onaylı şablonlu mesajlar (randevu, ödeme, sipariş bildirimi) gider.
              </p>
            )}
          </section>
        ) : null}
      </div>
    )}
  </div>;
}
