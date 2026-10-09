import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { postaGovdesiniGetir } from "@/lib/posta-esitleme";
import { konusmaDurumu, konusmaEtiketi, konusmayaYanitla, konusmayiGeriAl, konusmayiKayitBagla, konusmayiOkundu, konusmayiOkunmadiYap, konusmayiSil, konusmayiUstlen, taslakKaydet } from "../actions";
import { OkunduIsaretle } from "../okundu-isaretle";
import { dosyaBoyutu, istanbulTarihSaat } from "../bicim";
import { ccAdaylari, yanitAlicisi } from "@/lib/posta-gonderim";
import { postaDurumu } from "@/lib/posta-hesabi";
import "../posta.css";

/*
  KONUŞMA EKRANI.

  Üst veri veritabanından, gövdeler Gmail'den. Gövde HTML olarak
  basılmıyor: gelen kutusu dışarıdan gelen içerik ve gönderenin HTML'ini
  olduğu gibi göstermek, kurumun oturumu açıkken çalışan bir betik
  demek. lib/posta-ayristirma.ts düz metne indiriyor.
*/

export const dynamic = "force-dynamic";

type Mesaj = {
  message_id: string;
  gonderen_ad: string | null;
  gonderen_adres: string | null;
  alici: string | null;
  konu: string | null;
  tarih: string | null;
  yon: string;
  ekli_dosya: boolean;
};

export default async function KonusmaPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const { supabase, membership, userId, izin } = await getPanelContext();

  const [{ data: konusma, error: konusmaHatasi }, { data: mesajVerisi, error: mesajHatasi }] = await Promise.all([
    supabase.from("mail_threads")
      .select("thread_id,konu,durum,ilgilenen_user_id,mesaj_sayisi,opportunity_id,okunmamis,silindi_at,silen_user_id,etiketler")
      .eq("organization_id", membership.organization_id).eq("thread_id", threadId).maybeSingle(),
    supabase.from("mail_messages")
      .select("message_id,gonderen_ad,gonderen_adres,alici,konu,tarih,yon,ekli_dosya")
      .eq("organization_id", membership.organization_id).eq("thread_id", threadId)
      .order("tarih", { ascending: true }),
  ]);
  if (konusmaHatasi) throw new Error("Konuşma okunamadı: " + konusmaHatasi.message);
  if (mesajHatasi) throw new Error("Mesajlar okunamadı: " + mesajHatasi.message);
  if (!konusma) notFound();
  const hesap = await postaDurumu(membership.organization_id);
  const kutuAdi = hesap.adres ?? "ortak kutu";

  /* Yarım kalmış cevap: ekipten biri başlatmış olabilir, metin kutuda
     hazır gelsin. Konuşma başına tek taslak (veritabanında benzersiz
     indeks) — iki kişinin iki ayrı yarım cevabı en sık çakışma biçimi. */
  const { data: taslak } = await supabase
    .from("mail_drafts")
    .select("id,govde,cc,olusturan,updated_at")
    .eq("organization_id", membership.organization_id)
    .eq("thread_id", threadId)
    .maybeSingle();

  /*
    Bağlanabilecek kayıtlar: en son dokunulan 100 fırsat. Kurumun bütün
    geçmişini açılır listeye koymak, listeyi kullanılamaz yapardı; elle
    bağlama zaten istisna, asıl bağ eşleşmeyle kuruluyor.
  */
  const { data: firsatVerisi } = izin("posta.yonet")
    ? await supabase.from("crm_opportunities")
        .select("id,customer_name,title,contact_email")
        .eq("organization_id", membership.organization_id)
        .order("updated_at", { ascending: false }).limit(100)
    : { data: [] };
  const firsatlar = (firsatVerisi ?? []) as { id: string; customer_name: string | null; title: string | null; contact_email: string | null }[];
  const bagliFirsat = firsatlar.find((firsat) => firsat.id === konusma.opportunity_id) ?? null;

  const mesajlar = (mesajVerisi ?? []) as Mesaj[];

  /*
    Gövdeler paralel çekiliyor. Tek tek beklemek, on mesajlık bir
    konuşmada ekranı on ağ turu kadar geciktiriyordu. Biri düşerse
    yalnızca o mesaj sebebini yazar; konuşmanın tamamı kaybolmaz.
  */
  const icerikler = new Map(await Promise.all(mesajlar.map(async (mesaj) => {
    const sonuc = await postaGovdesiniGetir(membership.organization_id, mesaj.message_id);
    return [mesaj.message_id, "hata" in sonuc
      ? { govde: `(Mesaj gövdesi okunamadı: ${sonuc.hata})`, ekler: [] }
      : sonuc] as const;
  })));

  const yonetebilir = izin("posta.yonet");
  /* Etiket kataloğu Gmail'den eşitleniyor; panelde yalnızca uygulanıyor.
     Yetki yanıtlamayla aynı: yazışmayı düzenleyebilen sınıflandırabilsin. */
  const { data: etiketVerisi } = izin("posta.yanitla")
    ? await supabase.from("mail_labels").select("label_id,ad")
        .eq("organization_id", membership.organization_id).order("ad")
    : { data: [] };
  const etiketler = (etiketVerisi ?? []) as { label_id: string; ad: string }[];
  const konusmaEtiketleri = ((konusma.etiketler as string[] | null) ?? []);
  const etiketAdi = new Map(etiketler.map((etiket) => [etiket.label_id, etiket.ad]));
  const eklenebilir = etiketler.filter((etiket) => !konusmaEtiketleri.includes(etiket.label_id));
  /* Çöpteki yazışma okunur ama üzerinde iş yapılmaz: yanıt, durum ve
     müşteri bağı kapalı. Önce geri alınır. */
  const copte = Boolean(konusma.silindi_at);
  /* "Bunu kim sildi" ortak kutuda sorulan ilk soru; kimlik yerine ad. */
  const { data: silenKayit } = copte && konusma.silen_user_id
    ? await supabase.from("hr_employees").select("full_name")
        .eq("organization_id", membership.organization_id).eq("user_id", konusma.silen_user_id).maybeSingle()
    : { data: null };
  const silenAd = konusma.silen_user_id === userId ? "Siz" : (silenKayit?.full_name as string | undefined) ?? "ekipten biri";
  /* Yanıt son GELEN mesajın göndereneine gider; son giden mesaja bakmak
     kendi adresimize cevap yazdırırdı. */
  const sonGelen = [...mesajlar].reverse().find((mesaj) => mesaj.yon === "gelen");
  const yanitlanacakAdres = yanitAlicisi(mesajlar.map((mesaj) => ({
    gonderenAdres: mesaj.gonderen_adres,
    yon: mesaj.yon,
    tarih: mesaj.tarih ? new Date(mesaj.tarih) : null,
  })));
  /* "Tümünü yanıtla": özgün mesajın diğer alıcıları Cc'ye hazır gelir.
     Kutunun kendi adresi ve asıl alıcı çıkarılıyor — biri kendi
     yanıtımızın kopyasını gelen kutumuza düşürür, öteki alıcıya iki
     kopya gönderir. */
  const ccHazir = ccAdaylari(sonGelen?.alici ?? null, kutuAdi, yanitlanacakAdres ?? "");
  const bendeMi = konusma.ilgilenen_user_id === userId;

  return <main className="talep cari posta-konusma">
    {/*
      Konuşma açılınca okundu olur. Sunucuda değil tarayıcıda: Next
      listedeki bağlantıları önden yüklüyor ve bu sayfayı çalıştırıyor;
      render sırasında işaretleseydik kutuda kaydıran personel hiç
      açmadığı postaları okundu yapardı.
    */}
    <OkunduIsaretle threadId={threadId} okunmamis={Boolean(konusma.okunmamis) && !copte} isaretle={konusmayiOkundu} />

    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">ORTAK POSTA KUTUSU</small>
        <h1>{konusma.konu || "(konu yok)"}</h1>
        <p>{mesajlar.length} mesaj · {kutuAdi}</p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href={copte ? "/panel/posta?kutu=cop" : "/panel/posta"}>← {copte ? "Çöp kutusu" : "Gelen kutusu"}</Link>
        {/* Silme burada, listede değil: liste satırındaki bir silme düğmesi
            yanlış satıra basmayı kolaylaştırır. Çöpteki yazışmada yerini
            geri alma düğmesi tutuyor. */}
        {copte ? null : (
          <form action={konusmayiOkunmadiYap}>
            <input type="hidden" name="thread_id" value={threadId} />
            <button className="panel-secondary" type="submit">Okunmadı yap</button>
          </form>
        )}
        {izin("posta.sil") ? (
          copte ? (
            <form action={konusmayiGeriAl}>
              <input type="hidden" name="thread_id" value={threadId} />
              <button className="panel-primary" type="submit">Çöpten geri al</button>
            </form>
          ) : (
            <form action={konusmayiSil}>
              <input type="hidden" name="thread_id" value={threadId} />
              <button className="panel-secondary posta-sil" type="submit">Çöp kutusuna taşı</button>
            </form>
          )
        ) : null}
      </div>
    </header>

    {copte ? (
      <p className="posta-uyari posta-cop-uyari">
        Bu yazışma çöp kutusunda ({silenAd}, {istanbulTarihSaat(konusma.silindi_at as string)}). Okunabilir ama
        yanıtlanamaz; önce geri alın. Gmail çöpü otuz günde kendisi boşaltır.
      </p>
    ) : null}

    {/*
      İki sütun: solda yazışma, sağda yazışmanın DURUMU. Eskiden durum
      düğmeleri ve müşteri bağı mesaj akışının üstüne serpilmişti ve
      okumayı bölüyordu; panelin kayıt detayı düzeni de bu ayrımı
      kullanıyor.
    */}
    <div className="talep-izgara posta-izgara">
      <section className="panel-card talep-bilgi posta-akis" aria-label="Mesajlar">
        <ol className="posta-mesajlar">
          {mesajlar.map((mesaj) => (
            <li key={mesaj.message_id} data-yon={mesaj.yon}>
              <header>
                <span>
                  <b>{mesaj.gonderen_ad || mesaj.gonderen_adres || "Bilinmeyen gönderen"}</b>
                  <small>{mesaj.gonderen_adres}{mesaj.alici ? ` → ${mesaj.alici}` : ""}</small>
                </span>
                <span className="posta-mesaj-yan">
                  <small>{istanbulTarihSaat(mesaj.tarih)}</small>
                  {/* Yönlendirme mesaj başına: ortak kutuda iletilen şey
                      yazışmanın tamamı değil, çoğu zaman tek bir mesaj
                      (ve ekleri). */}
                  {!copte && izin("posta.yanitla") ? (
                    <Link className="posta-ilet" href={`/panel/posta/yeni?yonlendir=${encodeURIComponent(mesaj.message_id)}`}>
                      Yönlendir
                    </Link>
                  ) : null}
                </span>
              </header>
              {/* Düz metin: gönderenin HTML'i panelde çalıştırılmıyor. */}
              <p className="posta-govde">{icerikler.get(mesaj.message_id)?.govde || "(boş mesaj)"}</p>
              {/*
                Ekler panelden iniyor. Eskiden yalnızca "ekli dosya var"
                yazıyordu ve dosyayı almak için Gmail'e geçmek gerekiyordu —
                ortak kutunun amacı tam da bunu gerektirmemekti.
              */}
              {icerikler.get(mesaj.message_id)?.ekler.length ? (
                <ul className="posta-ekler">
                  {icerikler.get(mesaj.message_id)!.ekler.map((ek) => (
                    <li key={ek.ekId}>
                      <a href={`/panel/posta/ek/${encodeURIComponent(mesaj.message_id)}/${encodeURIComponent(ek.ekId)}`}>
                        {ek.dosyaAdi}
                      </a>
                      <small>{dosyaBoyutu(ek.boyut)}</small>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>

        {copte ? null : izin("posta.yanitla") && yanitlanacakAdres ? (
          <form className="posta-yanit" action={konusmayaYanitla}>
            <input type="hidden" name="thread_id" value={threadId} />
            <label htmlFor="posta-yanit-metni">
              <b>Yanıt yaz</b>
              <small>{yanitlanacakAdres} adresine, {kutuAdi} adına gidecek.</small>
            </label>
            <label className="posta-cc">
              <span>Bilgi (Cc)<small> — isteğe bağlı, virgülle ayırın</small></span>
              <input name="cc" type="text" autoComplete="off" defaultValue={taslak?.cc ?? ccHazir.join(", ")} placeholder="bilgi@ornek.com" />
            </label>
            <textarea id="posta-yanit-metni" name="govde" rows={6} required maxLength={20000} defaultValue={taslak?.govde ?? ""} placeholder="Yanıtınızı yazın…" />
            {/* Alıntı varsayılan açık: yanıt tek başına gidince müşteri neye
                cevap verildiğini çoğu zaman anlamıyor. */}
            {sonGelen ? (
              <label className="posta-alinti-sec">
                <input type="checkbox" name="alinti" defaultChecked />
                <span>Özgün mesajı yanıtın altına alıntıla</span>
              </label>
            ) : null}
            <label className="posta-ek-sec">
              <span>Ek dosya</span>
              <input type="file" name="ekler" multiple />
            </label>
            <div className="posta-yanit-alt">
              <small>
                Düz metin olarak gönderilir. Ekler toplam en fazla 3 MB.
                {hesap.imza ? " Kurum imzası sonuna eklenir." : ""}
                {taslak ? ` Kayıtlı taslaktan devam ediyorsunuz (${istanbulTarihSaat(taslak.updated_at)}).` : ""}
              </small>
              {/* Taslak aynı formdan, formAction ile: metni ikinci bir kutuya
                  kopyalamak ya da iki ayrı form kurmak yazılanı kaybetme yollarıydı. */}
              <span className="posta-yanit-dugmeler">
                <button className="panel-secondary" type="submit" formAction={taslakKaydet} formNoValidate>Taslak kaydet</button>
                <button className="panel-primary" type="submit">Yanıtı gönder</button>
              </span>
            </div>
          </form>
        ) : (
          <p className="posta-not">
            {yanitlanacakAdres
              ? "Bu kutudan yanıt yazma yetkiniz yok."
              : "Bu konuşmada yanıtlanacak bir gönderen yok (yalnızca giden mesajlar var)."}
          </p>
        )}
      </section>

      <aside className="panel-card talep-musteri posta-yan" aria-label="Yazışma bilgileri">
        {yonetebilir && !copte ? (
          <div className="posta-durum-cubugu">
            <form action={konusmayiUstlen}>
              <input type="hidden" name="thread_id" value={threadId} />
              <input type="hidden" name="kime" value={bendeMi ? "bosalt" : "ben"} />
              <button className="panel-secondary" type="submit">{bendeMi ? "İlgilenmeyi bırak" : "Ben ilgileniyorum"}</button>
            </form>
            {(["acik", "yanitlandi", "kapali"] as const).map((durum) => (
              <form key={durum} action={konusmaDurumu}>
                <input type="hidden" name="thread_id" value={threadId} />
                <input type="hidden" name="durum" value={durum} />
                <button className={konusma.durum === durum ? "panel-primary" : "panel-secondary"} type="submit">
                  {durum === "acik" ? "Açık" : durum === "yanitlandi" ? "Yanıtlandı" : "Kapalı"}
                </button>
              </form>
            ))}
          </div>
        ) : null}

        {/*
          ETİKETLER. Gmail'de açılıyor, panelde uygulanıyor: panelden
          etiket açmak iki tarafı hemen ayrıştırırdı (bizde olan, kutuda
          olmayan bir klasör). Katalog boşsa kutu hiç çıkmıyor —
          kullanılamayacak bir seçim göstermek soru doğuruyordu.
        */}
        {izin("posta.yanitla") && !copte && etiketler.length ? (
          <div className="posta-etiket-kutusu">
            <b>Etiketler</b>
            {konusmaEtiketleri.length ? (
              <div className="posta-etiket-liste">
                {konusmaEtiketleri.map((kimlik) => (
                  <form key={kimlik} action={konusmaEtiketi}>
                    <input type="hidden" name="thread_id" value={threadId} />
                    <input type="hidden" name="etiket" value={kimlik} />
                    <input type="hidden" name="uygula" value="0" />
                    <button type="submit" title="Etiketi kaldır">
                      {etiketAdi.get(kimlik) ?? kimlik}<i aria-hidden="true">×</i>
                    </button>
                  </form>
                ))}
              </div>
            ) : <p className="posta-not">Bu yazışmada etiket yok.</p>}
            {eklenebilir.length ? (
              <form className="posta-etiket-ekle" action={konusmaEtiketi}>
                <input type="hidden" name="thread_id" value={threadId} />
                <input type="hidden" name="uygula" value="1" />
                <select name="etiket" aria-label="Eklenecek etiket" defaultValue="">
                  <option value="" disabled>Etiket ekle…</option>
                  {eklenebilir.map((etiket) => <option key={etiket.label_id} value={etiket.label_id}>{etiket.ad}</option>)}
                </select>
                <button className="panel-secondary" type="submit">Ekle</button>
              </form>
            ) : null}
          </div>
        ) : null}

        {yonetebilir && !copte ? (
          <form className="posta-bag" action={konusmayiKayitBagla}>
            <input type="hidden" name="thread_id" value={threadId} />
            <label htmlFor="posta-firsat">
              <b>Müşteri kaydı</b>
              <small>{konusma.opportunity_id
                ? (bagliFirsat
                    ? `Bağlı: ${bagliFirsat.customer_name ?? "adsız"}${bagliFirsat.title ? ` · ${bagliFirsat.title}` : ""}`
                    : "Bağlı kayıt bu listede değil (eski kayıt olabilir)")
                : "Bağlı kayıt yok. Gönderen adresi bir fırsatın iletişim adresiyle eşleşirse bağ kendiliğinden kurulur."}</small>
            </label>
            <div className="posta-bag-alt">
              <select id="posta-firsat" name="opportunity_id" defaultValue={konusma.opportunity_id ?? ""}>
                <option value="">— Bağ yok —</option>
                {firsatlar.map((firsat) => (
                  <option key={firsat.id} value={firsat.id}>
                    {firsat.customer_name ?? "Adsız müşteri"}{firsat.title ? ` · ${firsat.title}` : ""}
                  </option>
                ))}
              </select>
              <button className="panel-secondary" type="submit">Kaydet</button>
              {konusma.opportunity_id ? <Link className="panel-secondary" href={`/panel/crm/requests/${konusma.opportunity_id}`}>Kaydı aç</Link> : null}
            </div>
          </form>
        ) : null}

        <p className="posta-not">
          Ekli dosyalar Gmail&apos;de kalıyor; panelde yalnızca varlığı gösteriliyor.
          {izin("posta.sil") ? " Çöpe atılan yazışma Gmail'in çöp kutusuna gider ve panelden geri alınabilir; kalıcı olarak silinmez." : ""}
        </p>
      </aside>
    </div>
  </main>;
}
