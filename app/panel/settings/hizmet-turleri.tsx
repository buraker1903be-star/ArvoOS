import { getPanelContext } from "@/lib/panel-context";
import { DIGER, HIZMET_ADI_SINIRI, HIZMET_TURU_SINIRI, varsayilanMi } from "@/lib/hizmet-turleri";
import { kurumHizmetTurleri } from "@/lib/hizmet-turleri-oku";
import { PanelDrawer } from "../components/panel-drawer";
import { ConfirmDeleteButton } from "../accounts/confirm-delete-button";
import { StgIcon, StgReadOnly, StgSection } from "./settings-ui";
import { hizmetTuruAdlandir, hizmetTuruEkle, hizmetTuruSil, hizmetTuruTasi, hizmetTurleriniSifirla } from "./hizmet-turu-actions";
import "../components/kayit-formu.css";
// Satır düzeni (bm-liste, bm-madde, bm-eylem) belge metinleriyle ortak.
import "./belge-metinleri.css";
import "./hizmet-turleri.css";

/*
  AYARLAR → HİZMET TÜRLERİ (12.10.2026). Talep formundaki "Hizmet türü"
  listesi. Kural lib/hizmet-turleri'de; kayıt yoksa eski sabit liste
  geçerli. Talep hizmetin adını tuttuğu için silmek/yeniden adlandırmak
  geçmiş kayıtları değiştirmez — ekranda bunu açıkça söylüyoruz, yoksa
  "sildim, eski taleplerim ne olacak" sorusu doğar.
*/

const req = <b className="req" aria-hidden="true">*</b>;

export async function HizmetTurleri() {
  const { supabase, membership, izin } = await getPanelContext();
  const { liste, kayitli, hata } = await kurumHizmetTurleri(supabase, membership.organization_id);
  const duzenler = izin("settings.hizmet_turu.yonet") && !hata;
  const ozel = kayitli && !varsayilanMi(liste);

  return <StgSection
    id="hizmet-turleri" wide icon="briefcase" tone="info"
    kicker="HİZMET TÜRLERİ" title="Sunduğunuz hizmetler"
    description="Talep girerken seçilen “Hizmet türü” listesi. Sıra, formdaki sıradır."
    aside={izin("settings.hizmet_turu.yonet") ? <span className="status-pill" data-tone={ozel ? "gold" : "neutral"}>{ozel ? "Kuruma özel" : "Varsayılan liste"}</span> : <StgReadOnly />}
  >
    {hata ? <p className="stg-muted"><StgIcon name="lock" size={16} />Hizmet türleri için veritabanı güncellemesi (20261012110702_hizmet_turleri) henüz uygulanmadı. Uygulanınca bu bölüm açılır; o zamana kadar talep formu varsayılan listeyi gösteriyor.</p> : <>
      <p className="bm-not">
        Değişiklik yeni talep formunda hemen görünür. Talepler hizmetin adını saklar: bir hizmeti silmek ya da adını değiştirmek eski talepleri değiştirmez, onlar yazıldıkları adla kalır.
      </p>

      {liste.length ? <ol className="bm-liste">
        {liste.map((ad, i) => {
          const gizli = <><input type="hidden" name="sira" value={i} /><input type="hidden" name="eski" value={ad} /></>;
          return <li key={ad} className="bm-madde">
            <span className="bm-no">{String(i + 1).padStart(2, "0")}</span>
            <div className="bm-govde"><b>{ad}</b></div>
            {duzenler ? <div className="bm-eylem">
              <form action={hizmetTuruTasi}>{gizli}<input type="hidden" name="yon" value="yukari" /><button className="panel-secondary bm-ok" type="submit" disabled={i === 0} aria-label={`${ad}: yukarı taşı`}>↑</button></form>
              <form action={hizmetTuruTasi}>{gizli}<input type="hidden" name="yon" value="asagi" /><button className="panel-secondary bm-ok" type="submit" disabled={i === liste.length - 1} aria-label={`${ad}: aşağı taşı`}>↓</button></form>
              <PanelDrawer triggerLabel="Düzenle" triggerClassName="panel-secondary" kicker="HİZMET TÜRÜ" title={ad} description="Yeni ad, bundan sonra girilen taleplerde görünür.">
                <form className="panel-form kayit-formu" action={hizmetTuruAdlandir}>
                  {gizli}
                  <label className="wide"><span>Hizmet adı{req}</span><input name="ad" required minLength={2} maxLength={HIZMET_ADI_SINIRI} defaultValue={ad} /></label>
                  <p className="wide kayit-formu-not">“{ad}” olarak kaydedilmiş eski talepler bu adla kalır.</p>
                  <div className="wide panel-form-actions kayit-formu-eylem">
                    <p>{req} işaretli alanlar zorunlu.</p>
                    <button className="panel-primary" type="submit">Kaydet</button>
                  </div>
                </form>
              </PanelDrawer>
              <form action={hizmetTuruSil} className="ht-sil">{gizli}<ConfirmDeleteButton label="Sil" confirmMessage={`“${ad}” listeden çıkarılsın mı? Eski talepler etkilenmez.`} /></form>
            </div> : null}
          </li>;
        })}
      </ol> : <p className="ht-bos">Listede hizmet yok. Talep formunda yalnızca “{DIGER}” görünür ve hizmet elle yazılır.</p>}

      <p className="ht-diger"><span className="bm-no">Son</span>“{DIGER}” formda her zaman en sonda yer alır; listede olmayan bir hizmet seçildiğinde adı elle yazılır.</p>

      {duzenler ? <div className="bm-alt">
        {liste.length < HIZMET_TURU_SINIRI ? <form className="ht-ekle" action={hizmetTuruEkle}>
          <input aria-label="Yeni hizmet türü" name="ad" required minLength={2} maxLength={HIZMET_ADI_SINIRI} placeholder="Yeni hizmet türü, ör. Web Tasarım" />
          <button className="panel-primary" type="submit">+ Ekle</button>
        </form> : <p className="bm-not">En fazla {HIZMET_TURU_SINIRI} hizmet türü eklenebilir.</p>}
        {kayitli ? <form action={hizmetTurleriniSifirla} className="bm-sifirla">
          <ConfirmDeleteButton label="Varsayılan listeye dön" confirmMessage="Kurumunuzun listesi silinip varsayılan liste geri gelsin mi? Eski talepler etkilenmez." />
        </form> : null}
      </div> : null}
    </>}
  </StgSection>;
}
