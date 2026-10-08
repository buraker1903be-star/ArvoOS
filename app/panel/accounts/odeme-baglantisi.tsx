import { odemeTutari } from "@/lib/odeme-baglantisi";
import { cancelPaymentLink, createPaymentLink, sendPaymentLink } from "./actions";
import { KopyalaDugmesi } from "./kopyala-dugmesi";

/*
  CARİ ÖDEME BAĞLANTISI ekranı (2026-10): Finans → PAYTR Tahsilatları
  sekmesinin yerini alıyor. Form cari listesinin satırında ve cari
  detayında aynı; bağlantılar cari detayında listeleniyor.

  Gönderim düğmeleri telefon/e-posta yoksa kapalı ve sebebini yazıyor:
  alıcı caride kayıtlı bilgiden okunuyor, formdan değil.
*/

export type OdemeBaglantisiSatiri = {
  id: string;
  url: string;
  amount: number;
  note: string | null;
  status: string;
  created_at: string;
  paid_at: string | null;
};

const DURUM: Record<string, { ad: string; ton: string }> = {
  active: { ad: "Bekliyor", ton: "info" },
  paid: { ad: "Ödendi", ton: "success" },
  cancelled: { ad: "İptal", ton: "neutral" },
};

const tarih = (iso: string) =>
  new Date(iso).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short" });

export function OdemeBaglantisiFormu({ partyId, acikBakiye, telefonVar, epostaVar, hazir }: {
  partyId: string;
  acikBakiye: number;
  telefonVar: boolean;
  epostaVar: boolean;
  /** PayTR bağlı ve açık mı; değilse form kapalı ve sebebi yazılı. */
  hazir: boolean;
}) {
  if (!hazir) {
    return <p className="fin-form-note">PayTR bağlı değil. Ayarlar → Ödeme sağlayıcısı bölümünden mağaza bilgilerini girin.</p>;
  }
  return (
    <form className="panel-form fin-form cari-link-form" action={createPaymentLink}>
      <input type="hidden" name="party_id" value={partyId} />
      <label>
        Müşterinin ödeyeceği tutar (₺)
        <input name="amount" inputMode="decimal" placeholder="5.000" autoComplete="off" required />
      </label>
      <label>
        Açıklama
        <input name="note" maxLength={200} placeholder="Örn. Kalan ödeme" />
      </label>
      <p className="fin-form-note">
        Açık bakiye {odemeTutari(acikBakiye)}; tutar bunu aşamaz. Bağlantı 30 gün geçerli, tek kullanımlık. Ödeme gelince cariye
        tahsilat olarak kendiliğinden işlenir.
        {!telefonVar ? " WhatsApp için caride cep telefonu yok." : ""}
        {!epostaVar ? " E-posta için caride adres yok." : ""}
      </p>
      <div className="panel-form-actions wide">
        <button className="panel-primary" name="gonder" value="whatsapp" disabled={!telefonVar}>Oluştur, WhatsApp&apos;tan gönder</button>
        <button className="panel-secondary" name="gonder" value="eposta" disabled={!epostaVar}>Oluştur, e-postayla gönder</button>
        <button className="panel-secondary" name="gonder" value="yok">Yalnızca oluştur</button>
      </div>
    </form>
  );
}

export function OdemeBaglantilari({ linkler, telefonVar, epostaVar }: { linkler: OdemeBaglantisiSatiri[]; telefonVar: boolean; epostaVar: boolean }) {
  return (
    <ul className="cari-hareketler cari-odeme-linkleri">
      {linkler.map((l) => {
        const durum = DURUM[l.status] ?? DURUM.cancelled;
        return (
          <li key={l.id}>
            <span className="status-pill" data-tone={durum.ton}>{durum.ad}</span>
            <span className="cari-hareket-metin">
              <b>{l.note || "Ödeme bağlantısı"}</b>
              <small>{tarih(l.created_at)}{l.paid_at ? ` · ${tarih(l.paid_at)} ödendi` : ""}</small>
            </span>
            <strong>{odemeTutari(Number(l.amount))}</strong>
            {l.status === "active" ? (
              <span className="cari-link-eylem">
                <KopyalaDugmesi metin={l.url} />
                <form action={sendPaymentLink}>
                  <input type="hidden" name="link_id" value={l.id} />
                  <button className="panel-secondary" name="kanal" value="whatsapp" disabled={!telefonVar} title={telefonVar ? "WhatsApp'tan gönder" : "Caride cep telefonu yok"}>WhatsApp</button>
                  <button className="panel-secondary" name="kanal" value="eposta" disabled={!epostaVar} title={epostaVar ? "E-postayla gönder" : "Caride e-posta yok"}>E-posta</button>
                </form>
                <form action={cancelPaymentLink}>
                  <input type="hidden" name="link_id" value={l.id} />
                  <button className="panel-secondary is-danger">İptal</button>
                </form>
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
