import { PanelModal } from "../../components/panel-modal";
import { KUNYE_ALANLARI, KUNYE_EN_UZUN, doluAlanlar, type Kunye } from "@/lib/musteri-kunyesi";
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
  opportunityId,
  workflowId,
  duzenlenebilir,
}: {
  kunye: Kunye | null;
  opportunityId: string | null;
  workflowId: string;
  /** Fırsat bağlı değilse düzenlenecek kayıt da yok. */
  duzenlenebilir: boolean;
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
            title="Müşteri künyesi"
            description="Operasyonun müşteri hakkında gördüğü bilgiler. Boş bıraktığınız alan künyeden kalkar."
            kicker="OPERASYON"
            boy="dar"
          >
            <form action={updateCustomerProfile} className="opd-kunye-form">
              <input type="hidden" name="opportunity_id" value={opportunityId} />
              <input type="hidden" name="workflow_id" value={workflowId} />
              {KUNYE_ALANLARI.map((alan) => (
                <label key={alan.anahtar}>
                  <span>{alan.etiket}</span>
                  <input
                    name={alan.anahtar}
                    defaultValue={String(kunye?.[alan.anahtar] ?? "")}
                    placeholder={alan.ornek}
                    maxLength={KUNYE_EN_UZUN}
                    className="panel-input"
                  />
                </label>
              ))}
              <button type="submit" className="panel-primary">Kaydet</button>
            </form>
          </PanelModal>
        ) : null}
      </div>

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
            ? "Henüz bilgi girilmemiş. “Düzenle” ile üniversite, fakülte ve bölümü yazabilirsiniz."
            : "Bu iş bir fırsata bağlı değil; künye tutulamıyor."}
        </p>
      )}
    </section>
  );
}
