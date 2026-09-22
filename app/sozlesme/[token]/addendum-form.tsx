import type { ContractAddendum } from "@/lib/work-plan";
import { respondToAddendum } from "./actions";

/**
 * Müşterinin ek protokol kararı. İmza çizdirilmez (müşteriyi yormamak için);
 * ad soyad + onay beyanı yeterli. Değişiklik talebinde gerekçe istenir.
 * Onay kutusu yalnızca onayda zorunlu olduğundan sunucuda denetlenir.
 */
export function AddendumDecisionForm({ token, addendum }: { token: string; addendum: ContractAddendum }) {
  return <form className="doc-form print-hide" action={respondToAddendum.bind(null, token)}>
    <input type="hidden" name="addendum_id" value={addendum.id} />
    <div className="doc-form-head">
      <div className="doc-kicker">Ek protokol onayı</div>
      <h3>Ek Protokol {addendum.addendum_no}’i onaylayın</h3>
      <p>Takvimi uygun buluyorsanız ad soyadınızı yazıp onaylayın. Değişiklik istiyorsanız talebinizi aşağıya yazın; ekibimiz takvimi güncelleyip size yeniden sunar.</p>
    </div>
    <label className="doc-field">Ad Soyad<input type="text" name="responder_name" required minLength={2} maxLength={180} autoComplete="name" /></label>
    <label className="doc-check"><input type="checkbox" name="consent" /><span><b>Ek protokolü okudum ve onaylıyorum.</b> Ara teslim takvimini ve ödeme vadelerini kabul ediyorum; Sözleşme’nin diğer hükümleri aynen geçerlidir.</span></label>
    <label className="doc-field">Değişiklik talebiniz <small>(yalnızca değişiklik istiyorsanız)</small><textarea name="note" maxLength={2000} placeholder="Ör. 2. ara teslimin bir hafta sonraya alınmasını rica ediyorum." /></label>
    <div className="doc-actions">
      <div className="doc-actions-row">
        <button className="doc-accept" name="decision" value="accept">EK PROTOKOLÜ ONAYLIYORUM</button>
        <button className="doc-reject" name="decision" value="reject">DEĞİŞİKLİK İSTİYORUM</button>
      </div>
      <p>Kararınız ad soyadınız, tarih-saat, IP adresi ve cihaz bilgisiyle kayıt altına alınır.</p>
    </div>
  </form>;
}
