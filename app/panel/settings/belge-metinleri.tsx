import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { etkinSira, kurumMetniCoz, type BelgeTuru } from "@/lib/belge-metni";
import { PanelDrawer } from "../components/panel-drawer";
import { ConfirmDeleteButton } from "../accounts/confirm-delete-button";
import { StgIcon, StgReadOnly, StgSection } from "./settings-ui";
import { belgeVarsayilanlari } from "./belge-metni-varsayilan";
import {
  belgeMaddesiEkle, belgeMaddesiGeriEkle, belgeMaddesiKaldir, belgeMaddesiKaydet, belgeMaddesiSifirla, belgeMaddesiTasi, belgeMetniniSifirla,
} from "./belge-metni-actions";
import "../components/kayit-formu.css";
import "./belge-metinleri.css";

/*
  AYARLAR → BELGE METİNLERİ (12.10.2026). Kurum sözleşme ve teklifteki
  her maddeyi değiştirir, madde ekler, çıkarır, sıralar. Değiştirilmeyen
  madde Arvo'nun metni olarak kalır ve Arvo onu güncellediğinde kuruma
  da gelir. Kural lib/belge-metni'de; imzalı belge onaylandığı metinle
  kalır (veritabanı imza anında kopyalıyor, 20261012083920).
*/

const req = <b className="req" aria-hidden="true">*</b>;

function Yardim({ tur, yardim }: { tur: BelgeTuru; yardim: ReturnType<typeof belgeVarsayilanlari>["yardim"] }) {
  return <details className="bm-yardim">
    <summary>Yazım kuralları ve yer tutucular</summary>
    <ul>
      <li>Boş satır paragrafları ayırır. <code>- </code> ile başlayan satırlar madde işaretli listedir; <code>## </code> alt başlıktır; <code>**kalın**</code> kalın yazar.</li>
      {tur === "contract" ? <li>Paragrafın ya da liste satırının başına <code>[tüketici]</code> ya da <code>[tacir]</code> yazarsanız o satır yalnızca o müşteri türünde görünür. Tüketiciye özgü hükümler (cayma, Ön Bilgilendirme) yasal zorunluluktur.</li> : null}
      <li><code>{"{yer_tutucu}"}</code> belgenin verisiyle doldurulur{tur === "contract" ? <>; <code>{"{madde:odeme}"}</code> o maddenin numarasını yazar (madde sırası değişse de doğru kalır)</> : null}.</li>
      <li>Tek başına bir satırdaki <code>[[blok]]</code>, veriden çizilen parçadır (tablo, kart); metin olarak yazılmaz.</li>
    </ul>
    <div className="bm-yardim-izgara">
      <div><h4>Yer tutucular</h4><dl>{yardim.yerTutucular.map((x) => <div key={x.ad}><dt><code>{`{${x.ad}}`}</code></dt><dd>{x.aciklama}</dd></div>)}</dl></div>
      <div><h4>Bloklar</h4><dl>{yardim.bloklar.map((x) => <div key={x.ad}><dt><code>{`[[${x.ad}]]`}</code></dt><dd>{x.aciklama}</dd></div>)}</dl></div>
    </div>
  </details>;
}

function MaddeFormu({ tur, anahtar, baslik, metin, eylem, dugme }: { tur: BelgeTuru; anahtar?: string; baslik: string; metin: string; eylem: (formData: FormData) => Promise<void>; dugme: string }) {
  return <form className="panel-form kayit-formu" action={eylem}>
    <input type="hidden" name="tur" value={tur} />
    {anahtar ? <input type="hidden" name="anahtar" value={anahtar} /> : null}
    <label className="wide"><span>Başlık{req}</span><input name="baslik" required maxLength={160} defaultValue={baslik} /></label>
    <label className="wide"><span>Metin{req}</span><textarea name="metin" required className="bm-metin" rows={18} defaultValue={metin} spellCheck /></label>
    <p className="wide kayit-formu-not">Yer tutucular ve <code>[[blok]]</code> satırları belgede veriyle dolar. Kaydederken tanınmayan bir yer tutucu varsa uyarılırsınız.</p>
    <div className="wide panel-form-actions kayit-formu-eylem">
      <p>{req} işaretli alanlar zorunlu.</p>
      <button className="panel-primary" type="submit">{dugme}</button>
    </div>
  </form>;
}

export async function BelgeMetinleri({ tur }: { tur: BelgeTuru }) {
  const { supabase, membership, organization, izin } = await getPanelContext();
  const duzenler = izin("settings.belge_metni.yonet");
  const varsayilan = belgeVarsayilanlari(tur, organization.slug);

  const [{ data: kayit, error }, { data: ornek }] = await Promise.all([
    supabase.from("organization_document_texts").select("content,updated_at").eq("organization_id", membership.organization_id).eq("document_type", tur).maybeSingle(),
    supabase.from(tur === "contract" ? "crm_contracts" : "crm_proposals").select("id").eq("organization_id", membership.organization_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const kurum = kurumMetniCoz(kayit?.content);
  const sira = etkinSira(varsayilan.sira, kurum, varsayilan.zorunlu, varsayilan.son);
  const varsayilanMadde = (anahtar: string) => varsayilan.maddeler.find((madde) => madde.anahtar === anahtar);
  const kaldirilan = varsayilan.sira.filter((anahtar) => !sira.includes(anahtar));
  const degisen = Object.keys(kurum.maddeler ?? {}).length + kaldirilan.length + (kurum.sira ? 1 : 0);
  const belge = tur === "contract" ? "Sözleşme" : "Teklif";
  // Teklifte 01 kapsam ve 02 fiyat sabit; düzenlenen bölümler 03'ten başlar.
  const numara = (sira0: number) => (tur === "contract" ? `Madde ${sira0 + 1}` : String(sira0 + 3).padStart(2, "0"));
  const satirlar = [
    ...(tur === "proposal" ? [{ anahtar: "giris", numara: "Giriş" }] : []),
    ...sira.map((anahtar, sira0) => ({ anahtar, numara: numara(sira0) })),
  ];

  return <StgSection
    id="belge-metinleri" wide icon="doc" tone="gold"
    kicker="BELGE METİNLERİ" title={`${belge} metni`}
    description={tur === "contract"
      ? "Müşteriye giden sözleşmenin maddeleri. Değiştirmediğiniz madde Arvo’nun güncel hukuki metniyle kalır."
      : "Teklifin giriş cümlesi, ödeme notları, kabul koşulları ve kendi ekleyeceğiniz bölümler. Kapsam, fiyat ve ödeme tablosu kayıttan gelir."}
    aside={duzenler ? <span className="status-pill" data-tone={degisen ? "gold" : "neutral"}>{degisen ? "Kuruma özel" : "Arvo metni"}</span> : <StgReadOnly />}
  >
    <nav className="bm-sekme" aria-label="Belge türü">
      <Link href="/panel/settings?bolum=belge-metinleri" className={tur === "contract" ? "is-active" : undefined} aria-current={tur === "contract" ? "page" : undefined}>Sözleşme</Link>
      <Link href="/panel/settings?bolum=belge-metinleri&belge=teklif" className={tur === "proposal" ? "is-active" : undefined} aria-current={tur === "proposal" ? "page" : undefined}>Teklif</Link>
    </nav>

    {error ? <p className="stg-muted"><StgIcon name="lock" size={16} />Belge metinleri için veritabanı güncellemesi (20261012083920_belge_metinleri) henüz uygulanmadı. Uygulanınca bu bölüm açılır.</p> : <>
      <p className="bm-not">
        Değişiklik, henüz imzalanmamış {tur === "contract" ? "sözleşmelerde" : "tekliflerde"} hemen görünür. {tur === "contract" ? "İmzalanmış sözleşme" : "Kabul ya da ret edilmiş teklif"} onaylandığı metinle kalır.
        {ornek?.id ? <> <Link href={`/panel/documents/${tur}/${ornek.id}/preview`} target="_blank">Son {belge.toLocaleLowerCase("tr")} üzerinde gör →</Link></> : null}
      </p>

      <ol className="bm-liste">
        {satirlar.map(({ anahtar, numara: no }, i) => {
          const arvo = varsayilanMadde(anahtar);
          const kurumun = kurum.maddeler?.[anahtar];
          const madde = kurumun ?? arvo;
          if (!madde) return null;
          const zorunlu = varsayilan.zorunlu.includes(anahtar);
          /* Bu maddeye BELGEDE duran başka maddeler numarayla atıf
             yapıyorsa çıkarılamaz: atıf "0. madde" olurdu. Sunucu da
             aynı kuralı uyguluyor (belge-metni-actions). */
          const atfedenler = (varsayilan.atiflar[anahtar] ?? []).filter((kaynak) => sira.includes(kaynak));
          const atifAdlari = atfedenler.map((kaynak) => kurum.maddeler?.[kaynak]?.baslik ?? varsayilanMadde(kaynak)?.baslik ?? kaynak);
          const sabit = anahtar === "giris" || anahtar === varsayilan.son;
          const ilk = i === (tur === "proposal" ? 1 : 0);
          const son = i === satirlar.length - 1 || satirlar[i + 1]?.anahtar === varsayilan.son;
          return <li key={anahtar} className="bm-madde">
            <span className="bm-no">{no}</span>
            <div className="bm-govde">
              <b>{madde.baslik}</b>
              <small>
                <span className="status-pill" data-tone={!arvo ? "info" : kurumun ? "gold" : "neutral"}>{!arvo ? "Kurum maddesi" : kurumun ? "Değiştirildi" : "Arvo metni"}</span>
                {zorunlu ? <span className="bm-zorunlu">Zorunlu</span> : null}
              </small>
            </div>
            {duzenler ? <div className="bm-eylem">
              {!sabit ? <>
                <form action={belgeMaddesiTasi}><input type="hidden" name="tur" value={tur} /><input type="hidden" name="anahtar" value={anahtar} /><input type="hidden" name="yon" value="yukari" /><button className="panel-secondary bm-ok" type="submit" disabled={ilk} aria-label={`${madde.baslik}: yukarı taşı`}>↑</button></form>
                <form action={belgeMaddesiTasi}><input type="hidden" name="tur" value={tur} /><input type="hidden" name="anahtar" value={anahtar} /><input type="hidden" name="yon" value="asagi" /><button className="panel-secondary bm-ok" type="submit" disabled={son} aria-label={`${madde.baslik}: aşağı taşı`}>↓</button></form>
              </> : null}
              <PanelDrawer triggerLabel="Düzenle" triggerClassName="panel-secondary" kicker={`${belge.toLocaleUpperCase("tr")} · ${no}`} title={madde.baslik} description={arvo ? "Arvo’nun metninden başlayın; değiştirmeden kaydederseniz madde Arvo metni olarak kalır." : "Kurumunuzun eklediği madde."}>
                <MaddeFormu tur={tur} anahtar={anahtar} baslik={madde.baslik} metin={madde.metin} eylem={belgeMaddesiKaydet} dugme="Maddeyi kaydet" />
              </PanelDrawer>
              {arvo && kurumun ? <form action={belgeMaddesiSifirla}><input type="hidden" name="tur" value={tur} /><input type="hidden" name="anahtar" value={anahtar} /><button className="panel-secondary" type="submit">Arvo metnine dön</button></form> : null}
              {!zorunlu && !sabit && !atifAdlari.length ? <form action={belgeMaddesiKaldir}><input type="hidden" name="tur" value={tur} /><input type="hidden" name="anahtar" value={anahtar} /><button className="panel-secondary bm-cikar" type="submit">{arvo ? "Çıkar" : "Sil"}</button></form> : null}
              {!zorunlu && !sabit && atifAdlari.length ? <span className="bm-atif">{atifAdlari.join(", ")} maddesi bu maddeye numarayla atıf yapıyor; çıkarmak için önce o atıfı kaldırın.</span> : null}
            </div> : null}
          </li>;
        })}
      </ol>

      {duzenler && kaldirilan.length ? <div className="bm-kaldirilan">
        <h4>Çıkarılan Arvo maddeleri</h4>
        <ul>{kaldirilan.map((anahtar) => <li key={anahtar}>
          <span>{varsayilanMadde(anahtar)?.baslik}</span>
          <form action={belgeMaddesiGeriEkle}><input type="hidden" name="tur" value={tur} /><input type="hidden" name="anahtar" value={anahtar} /><button className="panel-secondary" type="submit">Geri ekle</button></form>
        </li>)}</ul>
      </div> : null}

      {duzenler ? <div className="bm-alt">
        <PanelDrawer triggerLabel={tur === "contract" ? "+ Madde ekle" : "+ Bölüm ekle"} triggerClassName="panel-primary" kicker={belge.toLocaleUpperCase("tr")} title={tur === "contract" ? "Yeni madde" : "Yeni bölüm"} description={tur === "contract" ? "Yürürlük maddesinin önüne eklenir; sırasını sonra değiştirebilirsiniz." : "Gizlilik bölümünden sonra, karar alanından önce yer alır."}>
          <MaddeFormu tur={tur} baslik="" metin="" eylem={belgeMaddesiEkle} dugme={tur === "contract" ? "Maddeyi ekle" : "Bölümü ekle"} />
        </PanelDrawer>
        {degisen ? <form action={belgeMetniniSifirla} className="bm-sifirla">
          <input type="hidden" name="tur" value={tur} />
          <ConfirmDeleteButton label="Tümünü Arvo metnine döndür" confirmMessage={`Kurumunuzun bütün ${belge.toLocaleLowerCase("tr")} değişiklikleri silinsin mi? İmzalı belgeler etkilenmez.`} />
        </form> : null}
      </div> : null}

      <Yardim tur={tur} yardim={varsayilan.yardim} />
    </>}
  </StgSection>;
}
