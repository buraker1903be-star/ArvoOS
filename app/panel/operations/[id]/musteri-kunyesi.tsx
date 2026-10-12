import { PanelModal } from "../../components/panel-modal";
// Ortak form düzeni; bileşen stilini kendisi alıyor (AGENTS.md).
import "../../components/kayit-formu.css";
import { ILETISIM_ALANLARI, KUNYE_ALANLARI, KUNYE_EN_UZUN, doluAlanlar, type Kunye } from "@/lib/musteri-kunyesi";
import { formatPhone } from "@/lib/format-phone";
import { updateCustomerProfile } from "../actions";

/*
  MÜŞTERİ KÜNYESİ KARTI.

  Operasyon personeli sözleşmeyi ve teklifi göremiyor — tutar orada
  duruyor ve satır erişimi bilerek daraltıldı (20261001143617). Oysa işi
  yapan kişi müşterinin üniversitesini, fakültesini ve bölümünü bilmek
  zorunda; bu bilgi fırsat kaydında duruyordu ve operasyonun hiçbir
  ekranında yoktu.

  Düzenleme ayrı bir sayfaya gitmiyor: iş detayı zaten uzun, oradan
  çıkıp geri dönmek işin bağlamını kaybettiriyor. Panelin ortada açılan
  penceresi (PanelModal) kullanılıyor, çevredeki diğer kartlarla aynı.

  Çalışma türü kartta var ama formda yok: görev şablonunu o seçiyor ve
  fırsatta belirleniyor (veritabanı fonksiyonu da kabul etmiyor).
*/
export function MusteriKunyesi({
  kunye,
  iletisim,
  sozlesmeImzali,
  opportunityId,
  workflowId,
  duzenlenebilir,
  iletisimGoster = true,
}: {
  kunye: Kunye | null;
  /** Fırsat kaydının kendi sütunları: ad, e-posta, telefon. */
  iletisim: { customer_name?: string | null; contact_email?: string | null; contact_phone?: string | null } | null;
  /** İmzalı sözleşmede ad ve e-posta belgede de değişiyor; uyarı için. */
  sozlesmeImzali: boolean;
  opportunityId: string | null;
  workflowId: string;
  /** Fırsat bağlı değilse düzenlenecek kayıt da yok. */
  duzenlenebilir: boolean;
  /** Ad, e-posta, telefon satırları; iletişim sayfada başka yerde yazıyorsa kapatılır. */
  iletisimGoster?: boolean;
}) {
  const satirlar = doluAlanlar(kunye);
  const calismaTuru = String(kunye?.service_type ?? "").trim();

  return (
    <section className="opd-card opd-kunye">
      <div className="opd-card-head">
        <div>
          <h2>Müşteri künyesi</h2>
          <p>{calismaTuru ? `Çalışma türü: ${calismaTuru}` : "Akademik bilgiler"}</p>
        </div>
        {duzenlenebilir && opportunityId ? (
          <PanelModal
            triggerClassName="panel-secondary opd-kunye-duzenle"
            triggerLabel="Düzenle"
            title="Müşteri künyesini düzenle"
            description="Operasyonun müşteri hakkında gördüğü bilgiler. Boş bıraktığınız alan künyeden kalkar."
            kicker="İŞ · MÜŞTERİ"
            boy="dar"
            /* Tek seferlik form: kaydedince kapanmalı. Sohbet ve dosya
               pencereleri bunu bilerek istemiyor. */
            basaridaKapan
          >
            {/* DÜZEN (2026-10): talep, teklif ve müşteri sayfasıyla aynı ortak
                form (components/kayit-formu.css), iki bölüm. Eskiden kendi
                tek sütunlu stiliyle (opd-kunye-form) ve düz bir çizgiyle
                ayrılıyordu; kaydet düğmesi formun ortasında kalıyordu. */}
            <form action={updateCustomerProfile} className="panel-form kayit-formu">
              <input type="hidden" name="opportunity_id" value={opportunityId} />
              <input type="hidden" name="workflow_id" value={workflowId} />
              <p className="wide kayit-formu-bolum">İletişim</p>
              {ILETISIM_ALANLARI.map((alan) => (
                <label key={alan.anahtar} className={alan.anahtar === "customer_name" ? "wide" : undefined}>
                  <span>{alan.etiket}{alan.zorunlu ? <b className="req" aria-hidden="true">*</b> : null}</span>
                  <input
                    name={alan.anahtar}
                    type={alan.tur ?? "text"}
                    required={alan.zorunlu}
                    defaultValue={String(iletisim?.[alan.anahtar as keyof typeof iletisim] ?? "")}
                    placeholder={alan.ornek}
                    maxLength={KUNYE_EN_UZUN}
                  />
                </label>
              ))}

              {/* İmzalı sözleşmede ad ve e-posta BELGEDE de değişiyor:
                  sözleşme bu bilgileri kendi kopyasında tutmuyor, fırsattan
                  okuyor. İmza kanıtı (signed_name) yerinde kalıyor ama
                  düzeltmenin nereye kadar gittiği görünmeli. */}
              {sozlesmeImzali ? (
                <p className="wide opd-kunye-uyari" role="status">
                  Bu iş imzalı bir sözleşmeye bağlı. Ad ve e-posta sözleşme belgesinde de
                  değişir; imza kaydı olduğu gibi kalır.
                </p>
              ) : null}

              <p className="wide kayit-formu-bolum">Künye</p>

              {KUNYE_ALANLARI.map((alan) => (
                <label key={alan.anahtar}>
                  <span>{alan.etiket}</span>
                  <input
                    name={alan.anahtar}
                    defaultValue={String(kunye?.[alan.anahtar] ?? "")}
                    placeholder={alan.ornek}
                    maxLength={KUNYE_EN_UZUN}
                  />
                </label>
              ))}
              <div className="wide panel-form-actions kayit-formu-eylem">
                <p><b className="req" aria-hidden="true">*</b> işaretli alanlar zorunlu.</p>
                <button type="submit" className="panel-primary">Değişiklikleri kaydet</button>
              </div>
            </form>
          </PanelModal>
        ) : null}
      </div>

      {iletisimGoster ? (
        <dl className="opd-list">
          <div><dt>Ad soyad</dt><dd>{iletisim?.customer_name || "—"}</dd></div>
          <div><dt>E-posta</dt><dd>{iletisim?.contact_email || "—"}</dd></div>
          <div><dt>Telefon</dt><dd>{formatPhone(iletisim?.contact_phone) || "—"}</dd></div>
        </dl>
      ) : null}

      {satirlar.length ? (
        <dl className="opd-list">
          {satirlar.map((alan) => (
            <div key={alan.anahtar}>
              <dt>{alan.etiket}</dt>
              <dd>{alan.deger}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="opd-empty">
          {duzenlenebilir && opportunityId
            ? "Akademik bilgi girilmemiş. “Düzenle” ile üniversite, fakülte ve bölümü yazabilirsiniz."
            : "Bu iş bir fırsata bağlı değil; künye tutulamıyor."}
        </p>
      )}
    </section>
  );
}
