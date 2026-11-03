import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { etkinSira, kurumMetniCoz, type MaddeMetni } from "@/lib/belge-metni";
import { belgeVarsayilanlari } from "../../../settings/belge-metni-varsayilan";
import { sozlesmeMaddesiKaydet, sozlesmeMaddesiSifirla } from "../../contract-actions";

/*
  SÖZLEŞME MADDELERİ PENCERESİ (03.11.2026, 20261103144006).

  Sözleşmede yer alan maddelerin listesi; her madde açılıp YALNIZCA bu
  sözleşme için değiştirilebilir. Kurumun bütün sözleşmeleri için metin
  Ayarlar → Belge metinleri'nde (madde ekleme, çıkarma ve sıra da orada).
  Bir maddenin kaynağı üç katmanlı: Arvo metni → kurumun metni → bu
  sözleşmeye özel metin; rozet hangisinin geçerli olduğunu söyler.

  İmzalanan sözleşmede düzenleme yok: metin imza anında dondu
  (document_text), değişiklik ancak ek protokolle.
*/
export async function SozlesmeMaddeleri({ contractId, duzenlenebilir }: { contractId: string; duzenlenebilir: boolean }) {
  const { supabase, membership, organization } = await getPanelContext();
  const [{ data: kurumKaydi, error: kurumHatasi }, { data: ozelKaydi, error: ozelHatasi }] = await Promise.all([
    supabase.from("organization_document_texts").select("content").eq("organization_id", membership.organization_id).eq("document_type", "contract").maybeSingle(),
    supabase.from("crm_contracts").select("ozel_maddeler").eq("id", contractId).eq("organization_id", membership.organization_id).maybeSingle(),
  ]);
  if (ozelHatasi) {
    return <p className="talep-bos">Sözleşmeye özel maddeler için veritabanı güncellemesi (20261103144006_sozlesmeye_ozel_maddeler) henüz uygulanmadı. Uygulanınca bu bölüm açılır.</p>;
  }
  if (kurumHatasi) {
    return <p className="talep-bos">Kurumun sözleşme metni okunamadı; maddeler şu an gösterilemiyor. Sayfayı yenileyin, sorun sürerse destek ekibine yazın.</p>;
  }
  const varsayilan = belgeVarsayilanlari("contract", organization.slug);
  const kurum = kurumMetniCoz(kurumKaydi?.content);
  const ozel = ((ozelKaydi as { ozel_maddeler?: Record<string, MaddeMetni> | null } | null)?.ozel_maddeler ?? {}) as Record<string, MaddeMetni>;
  const sira = etkinSira(varsayilan.sira, kurum, varsayilan.zorunlu, varsayilan.son);
  const ozelSayisi = sira.filter((anahtar) => ozel[anahtar]).length;

  return (
    <div className="sm-maddeler">
      <p className="sm-not">
        {sira.length} madde. Burada yaptığınız değişiklik <b>yalnızca bu sözleşmeye</b> yazılır; kurumunuzun bütün sözleşmeleri için metin{" "}
        <Link href="/panel/settings?bolum=belge-metinleri">Ayarlar → Belge metinleri</Link>’nde.
        {ozelSayisi ? <> Bu sözleşmede <b>{ozelSayisi}</b> madde özel.</> : null}
      </p>
      <ol className="sm-liste">
        {sira.map((anahtar, i) => {
          const arvo = varsayilan.maddeler.find((m) => m.anahtar === anahtar);
          const kurumun = kurum.maddeler?.[anahtar];
          const bunun = ozel[anahtar];
          const madde = bunun ?? kurumun ?? arvo;
          if (!madde) return null;
          const kaynak = bunun ? { ad: "Bu sözleşmeye özel", ton: "gold" } : kurumun ? { ad: arvo ? "Kurum metni" : "Kurum maddesi", ton: "info" } : { ad: "Arvo metni", ton: "neutral" };
          return (
            <li key={anahtar}>
              <details className="sm-madde">
                <summary>
                  <span className="sm-no">Madde {i + 1}</span>
                  <b>{madde.baslik}</b>
                  <span className="status-pill" data-tone={kaynak.ton}>{kaynak.ad}</span>
                </summary>
                {duzenlenebilir ? (
                  <div className="sm-govde">
                    <form className="panel-form kayit-formu" action={sozlesmeMaddesiKaydet}>
                      <input type="hidden" name="contract_id" value={contractId} />
                      <input type="hidden" name="anahtar" value={anahtar} />
                      <label className="wide"><span>Başlık<b className="req" aria-hidden="true">*</b></span><input name="baslik" required maxLength={160} defaultValue={madde.baslik} /></label>
                      <label className="wide"><span>Metin<b className="req" aria-hidden="true">*</b></span><textarea name="metin" required rows={12} className="sm-metin" defaultValue={madde.metin} spellCheck /></label>
                      <div className="wide panel-form-actions kayit-formu-eylem">
                        <p><code>{"{yer_tutucu}"}</code> ve <code>[[blok]]</code> satırları belgede veriyle dolar; kuralları Ayarlar → Belge metinleri’nde.</p>
                        <button className="panel-primary" type="submit">Bu sözleşme için kaydet</button>
                      </div>
                    </form>
                    {bunun ? (
                      <form action={sozlesmeMaddesiSifirla} className="sm-sifirla">
                        <input type="hidden" name="contract_id" value={contractId} />
                        <input type="hidden" name="anahtar" value={anahtar} />
                        <button className="panel-secondary" type="submit">{kurumun ? "Kurum metnine dön" : "Arvo metnine dön"}</button>
                      </form>
                    ) : null}
                  </div>
                ) : (
                  <pre className="sm-salt">{madde.metin}</pre>
                )}
              </details>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
