import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { postaDurumu } from "@/lib/posta-hesabi";
import { postaAramaDeseni } from "@/lib/posta-ayristirma";
import { postaGovdesindeAra } from "@/lib/posta-esitleme";
import { istanbulTarihSaat } from "./bicim";
import { SatirTiklama } from "../crm/satir-tiklama";
import { konusmayiGeriAl, postaImzasi, taslakSil, topluGeriAl, topluOkundu } from "./actions";
import { TopluIslem } from "./toplu-islem";
import { OtomatikSecim } from "../crm/otomatik-secim";
import "../crm/kayit-detay/kayit-detay.css";
import "./posta.css";

/*
  ORTAK GELEN KUTUSU — konuşma listesi.

  Liste veritabanından okunuyor, Gmail'den değil: her sayfa açılışında
  Gmail'e gitmek hem yavaş hem kota yakıyor, üstelik ekibin ortak durumu
  (ilgilenen, yanıtlandı) zaten bizde. Gmail'e yalnızca bir konuşma
  AÇILDIĞINDA gidiliyor, gövdeyi okumak için.
*/

export const dynamic = "force-dynamic";

type Konusma = {
  thread_id: string;
  konu: string | null;
  son_gonderen_ad: string | null;
  son_gonderen_adres: string | null;
  son_mesaj_at: string | null;
  ozet: string | null;
  mesaj_sayisi: number;
  okunmamis: boolean;
  durum: string;
  ilgilenen_user_id: string | null;
  opportunity_id: string | null;
  silindi_at: string | null;
  silen_user_id: string | null;
  etiketler: string[] | null;
  /* Gömülü ilişki: PostgREST tek kayıtta nesne, bazı sürümlerde dizi
     döndürüyor — ikisini de karşılayan tip. */
  crm_opportunities: { customer_name: string | null } | { customer_name: string | null }[] | null;
};

/** Bağlı CRM kaydının müşteri adı; yoksa null. */
function musteriAdi(konusma: Konusma): string | null {
  const bag = konusma.crm_opportunities;
  const kayit = Array.isArray(bag) ? bag[0] : bag;
  return kayit?.customer_name ?? null;
}

/*
  KUTULAR. Bir konuşma ikisinde birden görünebilir: müşteri yazmış, biz
  cevaplamışsak o yazışma hem gelen hem gönderilen kutusuna aittir.
  Gmail de böyle davranıyor; "gönderilenler" ayrı bir yığın değil, bir
  süzgeç.
*/
const KUTULAR = [
  { anahtar: "gelen", ad: "Gelen kutusu", sutun: "gelen_var" as const },
  { anahtar: "giden", ad: "Gönderilenler", sutun: "giden_var" as const },
];

/* Sayfa başına kayıt. Elli satır bir ekranı kaydırmadan taramaya yakın
   ve toplu işlem sınırıyla (50) aynı: bir sayfanın tamamı tek seferde
   işlenebiliyor. */
const SAYFA_BOYU = 50;

const DURUM_ETIKETI: Record<string, { ad: string; ton: string }> = {
  acik: { ad: "Açık", ton: "warning" },
  yanitlandi: { ad: "Yanıtlandı", ton: "success" },
  kapali: { ad: "Kapalı", ton: "neutral" },
};

export default async function PostaPage({ searchParams }: { searchParams: Promise<{ durum?: string; q?: string; kutu?: string; okunmamis?: string; sayfa?: string; etiket?: string; kapsam?: string; ilgilenen?: string }> }) {
  const { durum: suzgec, q: aranan, kutu, okunmamis: yalnizOkunmamis, sayfa, etiket: secilenEtiket, kapsam, ilgilenen: ilgilenenSuzgeci } = await searchParams;
  const { supabase, membership, userId, izin } = await getPanelContext();
  const hesap = await postaDurumu(membership.organization_id);

  /* Çöp kutusu kendi görünümü: silinen yazışma öteki kutuların
     hiçbirinde çıkmamalı, yalnızca burada. */
  const copGorunumu = kutu === "cop";

  /*
    SAYFALAMA. Liste 100 kayıtla kesiliyordu ve sonrasını görmenin yolu
    yoktu: altı ay önceki bir yazışmaya ancak arama ile ulaşılıyordu,
    aranacak kelimeyi hatırlamak gerekiyordu. Sayfa adreste (?sayfa=2),
    böylece geri tuşu ve paylaşılabilir adres çalışıyor.

    Toplam AYRI sayılıyor (count: "exact"): sayfadaki satırları saymak
    sayfa boyunu toplam sanmak olurdu.
  */
  const sayfaNo = Math.max(1, Number.parseInt(sayfa ?? "1", 10) || 1);

  let sorgu = supabase
    .from("mail_threads")
    .select("thread_id,konu,son_gonderen_ad,son_gonderen_adres,son_mesaj_at,ozet,mesaj_sayisi,okunmamis,durum,ilgilenen_user_id,opportunity_id,silindi_at,silen_user_id,etiketler,crm_opportunities(customer_name)", { count: "exact" })
    .eq("organization_id", membership.organization_id)
    .order(copGorunumu ? "silindi_at" : "son_mesaj_at", { ascending: false })
    .range((sayfaNo - 1) * SAYFA_BOYU, sayfaNo * SAYFA_BOYU - 1);
  sorgu = copGorunumu ? sorgu.not("silindi_at", "is", null) : sorgu.is("silindi_at", null);
  if (suzgec && DURUM_ETIKETI[suzgec]) sorgu = sorgu.eq("durum", suzgec);
  /* Okunmamışlar süzgeci: şeritteki sayı artık tıklanıyor. Rakamı
     görüp "hangileri" diye sorana cevap yoktu; 100 satırlık listede
     okunmamışı gözle aramak gerekiyordu. */
  if (yalnizOkunmamis === "1") sorgu = sorgu.eq("okunmamis", true);
  /* Etiket süzgeci dizi üyeliğiyle (GIN indeksi migration'da). Gmail'in
     etiket KİMLİĞİ sorgulanıyor, adı değil: kurum etiketi yeniden
     adlandırınca kayıtlı bağlantı bozulmasın. */
  if (secilenEtiket) sorgu = sorgu.contains("etiketler", [secilenEtiket]);
  /*
    İLGİLENEN SÜZGECİ. Ortak kutuda günde en çok sorulan iki soru:
    "benim üstlendiklerim hangileri" ve "kimsenin almadığı var mı".
    Sütun zaten vardı ama yalnızca satırda gösteriliyordu; süzgeç yoktu
    ve yüz satırlık listede gözle aranıyordu.
  */
  if (ilgilenenSuzgeci === "ben") sorgu = sorgu.eq("ilgilenen_user_id", userId);
  else if (ilgilenenSuzgeci === "yok") sorgu = sorgu.is("ilgilenen_user_id", null);

  const secilenKutu = KUTULAR.find((aday) => aday.anahtar === kutu);
  if (secilenKutu) sorgu = sorgu.eq(secilenKutu.sutun, true);

  /*
    ARAMA. Binlerce konuşmanın biriktiği bir kutuda liste tek başına
    kullanılamaz hâle geliyor; "geçen ay şu müşteri ne yazmıştı" sorusunun
    cevabı yoktu.

    Gmail'in arama ucuna değil KENDİ üst verimize soruluyor: liste zaten
    buradan çiziliyor, Gmail'e gitmek her tuşta bir ağ turu ve kota
    demekti. Karşılığında arama gövdede değil konu, gönderen ve özette.
  */
  const desen = postaAramaDeseni(aranan ?? "");

  /*
    GÖVDEDE ARAMA. Kullanıcı üst verideki aramada bulamayınca açıkça
    istiyor; yalnızca o zaman tek bir Gmail çağrısı yapılıyor. Sonuç
    yine KENDİ tablomuzdan çiziliyor: ekibin ortak durumu (ilgilenen,
    etiket, müşteri bağı) orada.
  */
  const govdedeAra = kapsam === "govde" && Boolean(desen) && !copGorunumu;
  const gmailSonucu = govdedeAra ? await postaGovdesindeAra(membership.organization_id, desen as string) : null;
  const gmailHatasi = gmailSonucu && "hata" in gmailSonucu ? gmailSonucu.hata : null;
  if (gmailSonucu && "threadIdleri" in gmailSonucu) {
    /* Boş sonucu da uygulamak gerekiyor: eşleşme yoksa liste boş
       kalmalı, süzgeçsiz kutuya düşmemeli. */
    sorgu = sorgu.in("thread_id", gmailSonucu.threadIdleri.length ? gmailSonucu.threadIdleri : ["-"]);
  }

  /* Gmail çağrısı düşerse üst veri aramasına DÖNÜLÜYOR: süzgeçsiz bir
     liste göstermek, hata satırını okumayan kullanıcıya aramanın
     "her şeyi bulduğu" izlenimini verirdi. */
  if (desen && (!govdedeAra || gmailHatasi)) {
    sorgu = sorgu.or(
      `konu.ilike.*${desen}*,son_gonderen_ad.ilike.*${desen}*,son_gonderen_adres.ilike.*${desen}*,ozet.ilike.*${desen}*`,
    );
  }

  const { data, error, count: suzgecSayisi } = await sorgu;
  if (error) throw new Error("Konuşmalar okunamadı: " + error.message);
  const konusmalar = (data ?? []) as Konusma[];
  const sonSayfa = typeof suzgecSayisi === "number"
    ? Math.max(1, Math.ceil(suzgecSayisi / SAYFA_BOYU))
    : konusmalar.length === SAYFA_BOYU ? sayfaNo + 1 : sayfaNo;

  /* Etiket kataloğu: Gmail'den eşitlenen kurum etiketleri. Süzgeç
     satırında ad gösteriliyor, adreste kimlik taşınıyor. */
  const { data: etiketVerisi } = await supabase
    .from("mail_labels")
    .select("label_id,ad")
    .eq("organization_id", membership.organization_id)
    .order("ad");
  const etiketler = (etiketVerisi ?? []) as { label_id: string; ad: string }[];
  const etiketAdi = new Map(etiketler.map((etiket) => [etiket.label_id, etiket.ad]));

  /* Taslaklar ayrı bir kutu: yarım kalmış cevaplar yazışma listesine
     karışmamalı ama kaybolmamalı da. */
  const { data: taslakVerisi } = await supabase
    .from("mail_drafts")
    .select("id,thread_id,alici,konu,govde,updated_at,olusturan")
    .eq("organization_id", membership.organization_id)
    .order("updated_at", { ascending: false })
    .limit(50);
  const taslaklar = (taslakVerisi ?? []) as { id: string; thread_id: string | null; alici: string | null; konu: string | null; govde: string; updated_at: string; olusturan: string | null }[];

  // Ekip adları: "ilgilenen" ve "silen" sütunları kullanıcı kimliği tutuyor, ekranda ad gerekiyor.
  const ilgilenenler = [...new Set([
    ...konusmalar.map((satir) => satir.ilgilenen_user_id),
    ...konusmalar.map((satir) => satir.silen_user_id),
    ...taslaklar.map((satir) => satir.olusturan),
  ].filter(Boolean))] as string[];
  const { data: personeller } = ilgilenenler.length
    ? await supabase.from("hr_employees").select("user_id,full_name")
        .eq("organization_id", membership.organization_id).in("user_id", ilgilenenler)
    : { data: [] };
  const adlar = new Map(((personeller ?? []) as { user_id: string; full_name: string }[]).map((satir) => [satir.user_id, satir.full_name]));


  /* Süzgeçler birbirini silmesin: biri değişirken diğer ikisi korunuyor.
     Elle dizilen adreslerde bu üç kez unutulmuştu. */
  const adresEki = (degisen: { durum?: string; q?: string; kutu?: string; okunmamis?: string; sayfa?: string; etiket?: string; kapsam?: string; ilgilenen?: string }) => {
    const p = new URLSearchParams();
    const al = (ad: "durum" | "q" | "kutu" | "okunmamis" | "etiket" | "kapsam" | "ilgilenen", simdiki: string | undefined) =>
      (ad in degisen ? degisen[ad] : simdiki) || "";
    const d = al("durum", suzgec), a = al("q", desen ?? undefined), k = al("kutu", kutu);
    const o = al("okunmamis", yalnizOkunmamis), e = al("etiket", secilenEtiket);
    const kap = al("kapsam", kapsam), ilg = al("ilgilenen", ilgilenenSuzgeci);
    if (d) p.set("durum", d);
    if (a) p.set("q", a);
    if (k) p.set("kutu", k);
    if (o) p.set("okunmamis", o);
    if (e) p.set("etiket", e);
    if (kap) p.set("kapsam", kap);
    if (ilg) p.set("ilgilenen", ilg);
    /* Sayfa yalnızca açıkça isteniyorsa korunuyor: süzgeç değişince
       üçüncü sayfada kalmak, çoğu zaman boş bir liste gösterirdi. */
    if (degisen.sayfa) p.set("sayfa", degisen.sayfa);
    return p.size ? `?${p}` : "";
  };

  /*
    SAYILAR veritabanında sayılıyor, listeden değil. Eskiden hepsi
    süzülmüş ve 100 kayıtla sınırlı listeden çıkıyordu: "Gönderilenler"
    Tümü'nün sayısını, "Gelen kutusu" açık + yanıtlanmışı gösteriyordu;
    bir kutu seçilince "Tümü" o kutunun sayısına iniyor, hiçbiri 100'ü
    geçemiyordu. Sayılar kurumun bütün kutusu içindir; süzgeçten bağımsız.
  */
  /* İlgilenen sayaçları ayrı: ana sayım yardımcısı sütun/durum alıyor,
     bu ikisi kişiye ve "boş" durumuna bakıyor. */
  const ilgilenenSay = (kim: "ben" | "yok") => {
    const q = supabase.from("mail_threads").select("thread_id", { count: "exact", head: true })
      .eq("organization_id", membership.organization_id).is("silindi_at", null);
    return kim === "ben" ? q.eq("ilgilenen_user_id", userId) : q.is("ilgilenen_user_id", null);
  };

  const say = async (sutun?: "gelen_var" | "giden_var" | "okunmamis", durum?: string) => {
    let q = supabase.from("mail_threads").select("thread_id", { count: "exact", head: true })
      .eq("organization_id", membership.organization_id)
      /* Çöptekiler hiçbir sayıya girmiyor: silinen yazışmanın okunmamışı
         kapatılamaz bir rakam bırakıyordu. Çöp kutusunun kendi sayacı
         aşağıda, ters süzgeçle. */
      .is("silindi_at", null);
    if (sutun) q = q.eq(sutun, true);
    if (durum) q = q.eq("durum", durum);
    return (await q).count ?? 0;
  };
  const [tumu, gelen, giden, okunmamis, acik, yanitlandi, { count: taslakSayisi }, { count: copSayisi }, { count: bendeSayisi }, { count: sahipsizSayisi }] = await Promise.all([
    say(), say("gelen_var"), say("giden_var"), say("okunmamis"), say(undefined, "acik"), say(undefined, "yanitlandi"),
    supabase.from("mail_drafts").select("id", { count: "exact", head: true }).eq("organization_id", membership.organization_id),
    supabase.from("mail_threads").select("thread_id", { count: "exact", head: true })
      .eq("organization_id", membership.organization_id).not("silindi_at", "is", null),
    ilgilenenSay("ben"),
    ilgilenenSay("yok"),
  ]);
  const sayi = {
    tumu, gelen, giden, okunmamis, acik, yanitlandi,
    taslak: taslakSayisi ?? 0, cop: copSayisi ?? 0,
    bende: bendeSayisi ?? 0, sahipsiz: sahipsizSayisi ?? 0,
    listelenen: suzgecSayisi ?? konusmalar.length,
  };

  return <main className="talep cari ekip talepler liste-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">ORTAK POSTA KUTUSU</small>
        <h1>{hesap.adres ?? "Posta"}</h1>
      </div>
      <div className="talep-bas-eylem">
        {/* Hazır cevaplar ayrı sayfada: yan karttaki imza formunun
            altına bir liste daha koymak kartı okunmaz yapardı. */}
        {izin("posta.gor") ? <Link className="panel-secondary" href="/panel/posta/hazir-cevaplar">Hazır cevaplar</Link> : null}
        {izin("posta.yanitla") ? <Link className="panel-primary" href="/panel/posta/yeni">Yeni posta</Link> : null}
      </div>
    </header>

    {/* Sayaç şeridi aynı zamanda süzgeç: panelin diğer listelerinde de
        rakama tıklanıyor, posta ayrı davranmasın. */}
    <nav className="kayit-serit talep-serit" aria-label="Posta kutusu ve durum">
      <dl>
        <div className={!secilenKutu && kutu !== "taslak" && !copGorunumu ? "is-active" : undefined}>
          <dt>Tümü</dt>
          <dd><Link href={`/panel/posta${adresEki({ kutu: "" })}`}>{sayi.tumu}</Link></dd>
        </div>
        {KUTULAR.map((kutuSecenegi) => (
          <div key={kutuSecenegi.anahtar} className={secilenKutu?.anahtar === kutuSecenegi.anahtar ? "is-active" : undefined}>
            <dt>{kutuSecenegi.ad}</dt>
            <dd><Link href={`/panel/posta${adresEki({ kutu: kutuSecenegi.anahtar })}`} aria-current={secilenKutu?.anahtar === kutuSecenegi.anahtar ? "page" : undefined}>{kutuSecenegi.anahtar === "gelen" ? sayi.gelen : sayi.giden}</Link></dd>
          </div>
        ))}
        <div className={kutu === "taslak" ? "is-active" : undefined}>
          <dt>Taslaklar</dt>
          <dd><Link href={`/panel/posta${adresEki({ kutu: kutu === "taslak" ? "" : "taslak" })}`}>{sayi.taslak}</Link></dd>
        </div>
        <div className={copGorunumu ? "is-active" : undefined}>
          <dt>Çöp kutusu</dt>
          <dd><Link href={`/panel/posta${adresEki({ kutu: copGorunumu ? "" : "cop" })}`}>{sayi.cop}</Link></dd>
        </div>
        <div className={suzgec === "acik" ? "is-active" : undefined}>
          <dt>Açık</dt>
          <dd><Link href={`/panel/posta${adresEki({ durum: suzgec === "acik" ? "" : "acik" })}`}>{sayi.acik}</Link></dd>
        </div>
        <div className={yalnizOkunmamis === "1" ? "is-active" : undefined}>
          <dt>Okunmamış</dt>
          <dd className={sayi.okunmamis ? "talep-uyari" : undefined}>
            <Link href={`/panel/posta${adresEki({ okunmamis: yalnizOkunmamis === "1" ? "" : "1" })}`}>{sayi.okunmamis}</Link>
          </dd>
        </div>
      </dl>
    </nav>

    <div className="talep-izgara personel-iki ekip-izgara">
      <section className="panel-card talep-bilgi" aria-label="Posta listesi">
        <div className="ekip-suzgec talep-suzgec">
          <Link href={`/panel/posta${adresEki({ durum: "" })}`} className={!suzgec ? "is-active" : undefined}>Tümü <small>{sayi.tumu}</small></Link>
          {Object.entries(DURUM_ETIKETI).map(([anahtar, etiket]) => (
            <Link key={anahtar} href={`/panel/posta${adresEki({ durum: anahtar })}`} className={suzgec === anahtar ? "is-active" : undefined}>{etiket.ad}</Link>
          ))}
          {/* Ortak kutuda günlük iki soru: "bende olanlar" ve "kimsenin
              almadıkları". Sütun vardı, süzgeci yoktu. */}
          <Link href={`/panel/posta${adresEki({ ilgilenen: ilgilenenSuzgeci === "ben" ? "" : "ben", sayfa: "" })}`}
            className={ilgilenenSuzgeci === "ben" ? "is-active" : undefined}>
            Bende <small>{sayi.bende}</small>
          </Link>
          <Link href={`/panel/posta${adresEki({ ilgilenen: ilgilenenSuzgeci === "yok" ? "" : "yok", sayfa: "" })}`}
            className={ilgilenenSuzgeci === "yok" ? "is-active" : undefined}>
            Sahipsiz <small>{sayi.sahipsiz}</small>
          </Link>

          {/* Etiketler Gmail'den geliyor; kurum klasörünü panelde de
              süzebilsin. Hiç etiketi olmayan kurumda kutu çıkmıyor. */}
          {etiketler.length ? (
            <form className="posta-etiket-suzgec" method="get" action="/panel/posta">
              {suzgec ? <input type="hidden" name="durum" value={suzgec} /> : null}
              {kutu ? <input type="hidden" name="kutu" value={kutu} /> : null}
              {yalnizOkunmamis === "1" ? <input type="hidden" name="okunmamis" value="1" /> : null}
              {desen ? <input type="hidden" name="q" value={desen} /> : null}
              <OtomatikSecim name="etiket" defaultValue={secilenEtiket ?? ""} className="talep-temsilci-sec" label="Etiket">
                <option value="">Tüm etiketler</option>
                {etiketler.map((etiket) => <option key={etiket.label_id} value={etiket.label_id}>{etiket.ad}</option>)}
              </OtomatikSecim>
            </form>
          ) : null}

          {/* Arama sunucuda: GET formu kendi sayfasına gönderiyor, sonuç
              paylaşılabilir bir adres oluyor ve geri tuşu çalışıyor. */}
          <form className="talep-ara" method="get" action="/panel/posta" role="search">
            {suzgec ? <input type="hidden" name="durum" value={suzgec} /> : null}
            {kutu ? <input type="hidden" name="kutu" value={kutu} /> : null}
            {yalnizOkunmamis === "1" ? <input type="hidden" name="okunmamis" value="1" /> : null}
            {secilenEtiket ? <input type="hidden" name="etiket" value={secilenEtiket} /> : null}
            {ilgilenenSuzgeci ? <input type="hidden" name="ilgilenen" value={ilgilenenSuzgeci} /> : null}
            <input name="q" defaultValue={aranan ?? ""} placeholder="Konu, gönderen ara" aria-label="Postalarda ara" />
          </form>
        </div>

        {/*
          Gövdede arama bağlantısı sonucun ÜSTÜNDE: kullanıcı önce üst
          veri sonucunu görüyor, bulamazsa buradan genişletiyor. Tek
          Gmail çağrısı ve yalnızca istenince.
        */}
        {desen ? (
          <p className="posta-arama-kapsam">
            {govdedeAra ? (
              <>
                <b>Gövdede arandı</b> — Gmail&apos;de &quot;{desen}&quot; geçen yazışmalar.{" "}
                <Link href={`/panel/posta${adresEki({ kapsam: "", sayfa: "" })}`}>Yalnızca konu ve gönderende ara</Link>
              </>
            ) : (
              <>
                Konu, gönderen ve özette arandı.{" "}
                <Link href={`/panel/posta${adresEki({ kapsam: "govde", sayfa: "" })}`}>Gövdede de ara</Link>
              </>
            )}
          </p>
        ) : null}
        {gmailHatasi ? <p className="posta-uyari">Gövdede arama yapılamadı: {gmailHatasi}</p> : null}

        {kutu === "taslak" ? (
          taslaklar.length === 0 ? (
            <div className="crm-empty-state talep-bos-kutu"><p>Kayıtlı taslak yok.</p></div>
          ) : (
            <div className="talep-tablo">
              <table className="crm-data-table">
                <thead><tr><th>Alıcı</th><th>Konu</th><th>Başlangıç</th><th className="crm-col-date">Güncellendi</th><th></th></tr></thead>
                <tbody>
                  {taslaklar.map((satir) => (
                    <tr key={satir.id}>
                      <td data-label="Alıcı">
                        <Link className="crm-row-link" href={satir.thread_id ? `/panel/posta/${satir.thread_id}` : `/panel/posta/yeni?taslak=${satir.id}`}>
                          <span className="crm-table-title">{satir.alici || (satir.thread_id ? "Yanıt taslağı" : "Alıcı yazılmamış")}</span>
                          <span className="crm-table-sub">{satir.govde.slice(0, 90)}</span>
                        </Link>
                      </td>
                      <td data-label="Konu">{satir.konu || <span className="talep-bos">—</span>}</td>
                      <td data-label="Başlangıç">
                        <span className="crm-table-sub">{satir.olusturan ? adlar.get(satir.olusturan) ?? "Ekipten biri" : "—"}</span>
                      </td>
                      <td data-label="Güncellendi" className="crm-table-mono">{istanbulTarihSaat(satir.updated_at)}</td>
                      <td className="crm-table-actions">
                        <form action={taslakSil}>
                          <input type="hidden" name="taslak_id" value={satir.id} />
                          <button className="panel-secondary posta-sil" type="submit">Sil</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : konusmalar.length === 0 ? (
          <div className="crm-empty-state talep-bos-kutu">
            <p>{desen
              ? `"${desen}" için ${govdedeAra ? "gövdede de " : ""}sonuç yok.`
              : copGorunumu ? "Çöp kutusu boş."
              : yalnizOkunmamis === "1" ? "Okunmamış yazışma yok."
              : ilgilenenSuzgeci === "ben" ? "Üstlendiğiniz yazışma yok."
              : ilgilenenSuzgeci === "yok" ? "Sahipsiz yazışma yok; hepsini biri üstlenmiş."
              : "Bu süzgeçte yazışma yok."}</p>
            <small>{copGorunumu
              ? "Çöpe atılan yazışma burada durur; geri alınabilir. Gmail çöpü otuz günde kendisi boşaltır."
              : "Kutu birkaç dakikada bir eşitleniyor; yeni bağladıysanız ilk eşitlemeyi bekleyin."}</small>
          </div>
        ) : (
          /*
            Tablo bir formun içinde: seçim kutucukları (name="secili") ve
            toplu işlem düğmeleri aynı gönderime giriyor. Satırdaki tekil
            "Geri al" de bu formun düğmesi — iç içe form HTML'de geçersiz
            ve tarayıcı onu sessizce atıyordu.
          */
          <form className="posta-liste-form" action={copGorunumu ? topluGeriAl : topluOkundu}>
            <input type="hidden" name="donus" value="liste" />
            <TopluIslem copte={copGorunumu} silebilir={izin("posta.sil")} />
            <div className="talep-tablo">
            <table className="crm-data-table">
              <thead><tr>
                <th className="posta-sec-sutun">
                  <input type="checkbox" id="posta-tumunu-sec" aria-label="Listedeki yazışmaların tümünü seç" />
                </th>
                <th>Gönderen</th><th>Konu</th><th>Müşteri</th>
                {copGorunumu ? <th>Silen</th> : <><th>Durum</th><th>İlgilenen</th></>}
                <th className="crm-col-date">{copGorunumu ? "Çöpe atıldı" : "Son mesaj"}</th>
                <th></th>
              </tr></thead>
              <tbody>
                {konusmalar.map((konusma) => {
                  const etiket = DURUM_ETIKETI[konusma.durum] ?? DURUM_ETIKETI.acik;
                  const ilgilenen = konusma.ilgilenen_user_id ? adlar.get(konusma.ilgilenen_user_id) ?? "Ekipten biri" : null;
                  const gonderen = konusma.son_gonderen_ad || konusma.son_gonderen_adres || "Bilinmeyen gönderen";
                  const silen = konusma.silen_user_id
                    ? (konusma.silen_user_id === userId ? "Siz" : adlar.get(konusma.silen_user_id) ?? "Ekipten biri")
                    : null;
                  return (
                    <tr key={konusma.thread_id} data-okunmamis={konusma.okunmamis ? "evet" : undefined}>
                      <td className="posta-sec-sutun">
                        <input type="checkbox" name="secili" value={konusma.thread_id}
                          aria-label={`${konusma.konu || "konusuz"} yazışmasını seç`} />
                      </td>
                      <td data-label="Gönderen">
                        <Link className="crm-row-link" href={`/panel/posta/${konusma.thread_id}`} aria-label={`${konusma.konu || "konusuz"} yazışmasını aç`}>
                          <span className="crm-table-title" title={gonderen}>{gonderen}</span>
                          <span className="crm-table-sub">{konusma.son_gonderen_adres}</span>
                        </Link>
                      </td>
                      <td data-label="Konu">
                        <span className="crm-table-title" title={konusma.konu ?? ""}>
                          {konusma.konu || "(konu yok)"}{konusma.mesaj_sayisi > 1 ? ` (${konusma.mesaj_sayisi})` : ""}
                        </span>
                        <span className="crm-table-sub">{konusma.ozet}</span>
                        {/* Etiket rozetleri konunun altında: satırın kendi
                            sütununu açmak dar ekranda tabloyu taşırıyordu. */}
                        {konusma.etiketler?.length ? (
                          <span className="posta-etiketler">
                            {konusma.etiketler.map((kimlik) => etiketAdi.get(kimlik)).filter(Boolean)
                              .map((ad) => <i key={ad as string}>{ad}</i>)}
                          </span>
                        ) : null}
                      </td>
                      <td data-label="Müşteri">{musteriAdi(konusma) ?? <span className="talep-bos">—</span>}</td>
                      {copGorunumu ? (
                        <td data-label="Silen">
                          <span className="crm-table-sub">{silen ?? "—"}</span>
                        </td>
                      ) : (
                        <>
                          <td data-label="Durum"><span className="status-pill" data-tone={etiket.ton}>{etiket.ad}</span></td>
                          <td data-label="İlgilenen">
                            {ilgilenen
                              ? <span className="crm-table-sub">{konusma.ilgilenen_user_id === userId ? "Siz" : ilgilenen}</span>
                              : <span className="talep-bos">—</span>}
                          </td>
                        </>
                      )}
                      <td data-label={copGorunumu ? "Çöpe atıldı" : "Son mesaj"} className="crm-table-mono">
                        {istanbulTarihSaat(copGorunumu ? konusma.silindi_at : konusma.son_mesaj_at)}
                      </td>
                      <td className="crm-table-actions">
                        {/* Geri alma satırda: çöp kutusunda yapılacak tek iş bu,
                            yazışmayı açmayı şart koşmak gereksiz bir adım olurdu. */}
                        {copGorunumu && izin("posta.sil") ? (
                          /* Düğmenin kendi name/value'su gönderime giriyor;
                             konusmayiGeriAl seçimi değil bu tek yazışmayı okuyor. */
                          <button className="panel-secondary" type="submit" formAction={konusmayiGeriAl}
                            name="thread_id" value={konusma.thread_id}>Geri al</button>
                        ) : <span className="crm-row-chevron" aria-hidden="true">›</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <SatirTiklama />
            </div>
            {sonSayfa > 1 ? (
              <nav className="liste-sayfalar" aria-label="Sayfalar">
                {sayfaNo > 1
                  ? <Link href={`/panel/posta${adresEki({ sayfa: sayfaNo === 2 ? "" : String(sayfaNo - 1) })}`}>← Önceki</Link>
                  : <span aria-hidden="true">← Önceki</span>}
                <b>{sayfaNo} / {sonSayfa}{typeof suzgecSayisi === "number" ? ` · ${suzgecSayisi} yazışma` : ""}</b>
                {sayfaNo < sonSayfa
                  ? <Link href={`/panel/posta${adresEki({ sayfa: String(sayfaNo + 1) })}`}>Sonraki →</Link>
                  : <span aria-hidden="true">Sonraki →</span>}
              </nav>
            ) : null}
          </form>
        )}
      </section>

      <IstatistikKarti hesap={hesap} sayi={sayi} imzaDuzenlenebilir={izin("posta.yonet") && hesap.kayitliMi} />
    </div>
  </main>;
}

/* Kutunun durumu listenin yanında: eşitleme durduğunda liste eskiyor ve
   bunu ancak Ayarlar'a giden fark ediyordu. */
function IstatistikKarti({ hesap, sayi, imzaDuzenlenebilir }: {
  hesap: Awaited<ReturnType<typeof postaDurumu>>;
  sayi: { okunmamis: number; acik: number; yanitlandi: number; listelenen: number };
  imzaDuzenlenebilir: boolean;
}) {
  return (
    <section className="panel-card talep-musteri talep-istatistik" aria-label="Kutu durumu">
      <h2>Kutu durumu</h2>
      <dl className="istat-kutular">
        <div><dt>Açık</dt><dd>{sayi.acik}</dd></div>
        <div><dt>Yanıtlandı</dt><dd>{sayi.yanitlandi}</dd></div>
        <div><dt>Okunmamış</dt><dd>{sayi.okunmamis}</dd></div>
        <div><dt>Listelenen</dt><dd>{sayi.listelenen}</dd></div>
      </dl>
      <dl className="stg-list posta-durum-listesi">
        <div><dt>Adres</dt><dd>{hesap.adres ?? "—"}</dd></div>
        <div><dt>Son eşitleme</dt><dd>{istanbulTarihSaat(hesap.sonEsitleme)}</dd></div>
        <div><dt>Geçmiş</dt><dd>{hesap.gecmisBitti ? "tamamlandı" : `iniyor (${hesap.gecmisMesajSayisi})`}</dd></div>
      </dl>
      {hesap.sonHata ? <p className="posta-uyari">Son eşitleme hatası: {hesap.sonHata}</p> : null}

      {/*
        İmza burada, Ayarlar'da değil: orası bağlantı ayarı (Google
        anahtarları, yetkilendirme), imza ise posta yazarken düşünülen bir
        şey. İlk sürümde Ayarlar'a konmuştu ve kullanıcı bulamadı.
      */}
      {imzaDuzenlenebilir ? (
        <form className="panel-form posta-imza" action={postaImzasi}>
          <label className="wide">
            Kurum imzası
            <textarea name="imza" rows={4} maxLength={2000} defaultValue={hesap.imza ?? ""} placeholder={"Akademik Merkez\nuzman@akademikmerkez.com"} />
          </label>
          <p className="wide posta-not">
            Giden her mesajın sonuna eklenir; personelin ayrıca yazmasına gerek kalmaz. Yazdığınız kutuda görünmez.
            Boş bırakıp kaydetmek imzayı kaldırır.
          </p>
          <div className="wide panel-form-actions"><button className="panel-secondary" type="submit">İmzayı kaydet</button></div>
        </form>
      ) : hesap.imza ? (
        <p className="posta-not">Giden mesajlara kurum imzası ekleniyor.</p>
      ) : null}
    </section>
  );
}
