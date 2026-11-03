import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { ConfirmDeleteButton } from "../accounts/confirm-delete-button";
import { postaDurumu } from "@/lib/posta-hesabi";
import { htmlVarliklariniCoz, postaAramaDeseni } from "@/lib/posta-ayristirma";
import { postaGovdesindeAra } from "@/lib/posta-esitleme";
import { imzaHtml } from "@/lib/posta-imza";
import { redirect } from "next/navigation";
import { aralikDisiMi, sayfaAraligi, sayfaNumarasi, sayfasizAdres, sonSayfaNo } from "@/lib/liste-sayfalama";
import { istanbulTarihSaat } from "./bicim";
import { konusmayiGeriAl, postaImzasi, taslakSil, topluGeriAl, topluOkundu } from "./actions";
import { TopluIslem } from "./toplu-islem";
import { KonusmaGorunumu } from "./konusma-gorunumu";
import { PanelModal } from "../components/panel-modal";
import "../crm/kayit-detay/kayit-detay.css";
import "./posta.css";
// Ortak kayıt formu düzeni (zorunlu alan işareti, kaydet çubuğu).
import "../components/kayit-formu.css";

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

/* Sayfa boyu, aralık ve son sayfa hesabı ORTAK modülde
   (lib/liste-sayfalama): posta boyu kendi sabitinde tutuyor ve aralığı
   elle çarpıyordu. Kopya hesap, boy bir listede değişince ötekilerde
   sessizce eski kalması demek — yardımcı tam bunun için var. Bir
   sayfanın tamamı tek seferde toplu işlenebiliyor; boy büyürse o da
   birlikte büyür. */

const DURUM_ETIKETI: Record<string, { ad: string; ton: string }> = {
  acik: { ad: "Açık", ton: "warning" },
  yanitlandi: { ad: "Yanıtlandı", ton: "success" },
  kapali: { ad: "Kapalı", ton: "neutral" },
};

export default async function PostaPage({ searchParams }: { searchParams: Promise<{ durum?: string; q?: string; kutu?: string; okunmamis?: string; sayfa?: string; etiket?: string; kapsam?: string; ilgilenen?: string; k?: string }> }) {
  const parametreler = await searchParams;
  const { durum: suzgec, q: aranan, kutu, okunmamis: yalnizOkunmamis, sayfa, etiket: secilenEtiket, kapsam, ilgilenen: ilgilenenSuzgeci } = parametreler;
  /* Okuma bölmesinde açık yazışma (Gmail'deki gibi; 04.11.2026). */
  const acikKonusma = typeof parametreler.k === "string" && parametreler.k.trim() ? parametreler.k.trim().slice(0, 200) : null;
  const { supabase, membership, userId, izin, organization } = await getPanelContext();
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
  const sayfaNo = sayfaNumarasi(sayfa);

  let sorgu = supabase
    .from("mail_threads")
    .select("thread_id,konu,son_gonderen_ad,son_gonderen_adres,son_mesaj_at,ozet,mesaj_sayisi,okunmamis,durum,ilgilenen_user_id,opportunity_id,silindi_at,silen_user_id,etiketler,crm_opportunities(customer_name)", { count: "exact" })
    .eq("organization_id", membership.organization_id)
    .order(copGorunumu ? "silindi_at" : "son_mesaj_at", { ascending: false })
    .range(...sayfaAraligi(sayfaNo));
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

  /*
    LİSTEYİ BESLEYEN OKUMALAR TEK TURDA.

    Kutu durumu, etiket kataloğu, taslaklar ve (istendiyse) Gmail'deki
    gövde araması birbirine bağlı değil; sırayla beklendiğinde listenin
    açılması dört ayrı gidiş dönüş sürüyordu. Konuşma sorgusu bunlardan
    SONRA kalıyor: gövde aramasının sonucu süzgecine giriyor.
  */
  // hata-tamam: etiketler yalnızca süzgeç çipleri; düşerse çipler çıkmaz,
  // konuşma listesi ve sayıları etkilenmez.
  const [hesap, gmailSonucu, { data: etiketVerisi }, { data: taslakVerisi, error: taslakHatasi }] = await Promise.all([
    postaDurumu(membership.organization_id),
    govdedeAra ? postaGovdesindeAra(membership.organization_id, desen as string) : Promise.resolve(null),
    /* Etiket kataloğu: Gmail'den eşitlenen kurum etiketleri. Süzgeç
       satırında ad gösteriliyor, adreste kimlik taşınıyor. */
    supabase.from("mail_labels").select("label_id,ad")
      .eq("organization_id", membership.organization_id).order("ad"),
    /* Taslaklar ayrı bir kutu: yarım kalmış cevaplar yazışma listesine
       karışmamalı ama kaybolmamalı da.

       Hata OKUNUYOR: şeritteki sayaç ayrı bir sorgudan geliyor, liste
       sessizce boş dönünce "Taslaklar 3" yazarken kutu "kayıtlı taslak
       yok" diyordu — kendi kendiyle çelişen bir ekran. */
    supabase.from("mail_drafts")
      .select("id,thread_id,alici,konu,govde,updated_at,olusturan")
      .eq("organization_id", membership.organization_id)
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);
  if (taslakHatasi) throw new Error("Taslaklar okunamadı: " + taslakHatasi.message);
  const etiketler = (etiketVerisi ?? []) as { label_id: string; ad: string }[];
  const etiketAdi = new Map(etiketler.map((etiket) => [etiket.label_id, etiket.ad]));
  const taslaklar = (taslakVerisi ?? []) as { id: string; thread_id: string | null; alici: string | null; konu: string | null; govde: string; updated_at: string; olusturan: string | null }[];

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
  /* Aralık dışı sayfa çökme değil: süzgeçler korunur, ilk sayfaya döner. */
  if (aralikDisiMi(error)) redirect(sayfasizAdres("/panel/posta", parametreler));
  if (error) throw new Error("Konuşmalar okunamadı: " + error.message);
  const konusmalar = (data ?? []) as Konusma[];
  const sonSayfa = sonSayfaNo(suzgecSayisi, konusmalar.length, sayfaNo);

  // Ekip adları: "ilgilenen" ve "silen" sütunları kullanıcı kimliği tutuyor, ekranda ad gerekiyor.
  const ilgilenenler = [...new Set([
    ...konusmalar.map((satir) => satir.ilgilenen_user_id),
    ...konusmalar.map((satir) => satir.silen_user_id),
    ...taslaklar.map((satir) => satir.olusturan),
  ].filter(Boolean))] as string[];
  // hata-tamam: yalnızca ilgilenen/silen kişinin ADI; düşerse ad yerine
  // kimlik görünür, konuşmanın durumu değişmez.
  const { data: personeller } = ilgilenenler.length
    ? await supabase.from("hr_employees").select("user_id,full_name")
        .eq("organization_id", membership.organization_id).in("user_id", ilgilenenler)
    : { data: [] };
  const adlar = new Map(((personeller ?? []) as { user_id: string; full_name: string }[]).map((satir) => [satir.user_id, satir.full_name]));


  /* Süzgeçler birbirini silmesin: biri değişirken diğer ikisi korunuyor.
     Elle dizilen adreslerde bu üç kez unutulmuştu. */
  const adresEki = (degisen: { durum?: string; q?: string; kutu?: string; okunmamis?: string; sayfa?: string; etiket?: string; kapsam?: string; ilgilenen?: string; k?: string }) => {
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
    /* Açık yazışma yalnızca açıkça veriliyorsa: klasör ya da süzgeç
       değişince okuma bölmesi boşalır (Gmail de öyle). */
    if (degisen.k) p.set("k", degisen.k);
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

  /*
    ÜÇ BÖLME (04.11.2026, kurum sahibinin isteği: "tam bir Gmail gibi").
    Solda klasörler ve süzgeçler, ortada yazışma listesi, sağda açık
    yazışma. Eskiden liste tam genişlik bir tabloydu ve yazışmaya
    tıklamak ayrı bir sayfa açıyordu; listeye dönmek süzgeci ve kaydırma
    yerini kaybettiriyordu. Açık yazışma adreste (?k=…): geri tuşu ve
    paylaşılan bağlantı çalışıyor. Sayaç şeridi klasör sütununa geçti;
    kutu durumu ve imza başlıktaki "Kutu ayarları" penceresinde.
  */
  const sayfaKoru = sayfaNo > 1 ? String(sayfaNo) : "";
  const satirAdresi = (threadId: string) => `/panel/posta${adresEki({ k: threadId, sayfa: sayfaKoru })}`;
  const listeAdresi = `/panel/posta${adresEki({ sayfa: sayfaKoru })}`;
  const klasor = (etkin: boolean, href: string, ad: string, sayac?: number, vurgu?: boolean) => (
    <Link href={href} className={etkin ? "is-active" : undefined} aria-current={etkin ? "page" : undefined} scroll={false}>
      <span>{ad}</span>
      {sayac ? <small className={vurgu ? "is-vurgu" : undefined}>{sayac}</small> : null}
    </Link>
  );
  const tumKutular = !secilenKutu && kutu !== "taslak" && !copGorunumu;

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
        <PanelModal triggerLabel="Kutu ayarları" triggerClassName="panel-secondary" kicker="ORTAK POSTA KUTUSU" title="Kutu durumu ve imza" description={hesap.adres ?? undefined} boy="genis">
          <IstatistikKarti hesap={hesap} sayi={sayi} imzaDuzenlenebilir={izin("posta.yonet") && hesap.kayitliMi}
            kurum={{ ad: organization.display_name || organization.name, logo: organization.logo_url, renk: organization.brand_color }} />
        </PanelModal>
        {izin("posta.yanitla") ? <Link className="panel-primary" href="/panel/posta/yeni">Yeni posta</Link> : null}
      </div>
    </header>

    <div className="posta-uc posta-uc-kok" data-acik={acikKonusma ? "evet" : undefined}>
      {/* KLASÖRLER: sayılar kurumun bütün kutusu için, süzgeçten bağımsız (yukarıda). */}
      <nav className="panel-card posta-klasorler" aria-label="Klasörler ve süzgeçler">
        {klasor(secilenKutu?.anahtar === "gelen", `/panel/posta${adresEki({ kutu: "gelen" })}`, "Gelen kutusu", sayi.gelen)}
        {klasor(secilenKutu?.anahtar === "giden", `/panel/posta${adresEki({ kutu: "giden" })}`, "Gönderilenler", sayi.giden)}
        {klasor(tumKutular, `/panel/posta${adresEki({ kutu: "" })}`, "Tüm postalar", sayi.tumu)}
        {klasor(kutu === "taslak", `/panel/posta${adresEki({ kutu: "taslak" })}`, "Taslaklar", sayi.taslak)}
        {klasor(copGorunumu, `/panel/posta${adresEki({ kutu: "cop" })}`, "Çöp kutusu", sayi.cop)}
        <small className="posta-klasor-baslik">Süzgeçler</small>
        {klasor(yalnizOkunmamis === "1", `/panel/posta${adresEki({ okunmamis: yalnizOkunmamis === "1" ? "" : "1" })}`, "Okunmamış", sayi.okunmamis, true)}
        {Object.entries(DURUM_ETIKETI).map(([anahtar, etiket]) => (
          <span key={anahtar} className="posta-klasor-sar">
            {klasor(suzgec === anahtar, `/panel/posta${adresEki({ durum: suzgec === anahtar ? "" : anahtar })}`, etiket.ad, anahtar === "acik" ? sayi.acik : anahtar === "yanitlandi" ? sayi.yanitlandi : undefined)}
          </span>
        ))}
        {/* Ortak kutuda günlük iki soru: "bende olanlar" ve "kimsenin almadıkları". */}
        {klasor(ilgilenenSuzgeci === "ben", `/panel/posta${adresEki({ ilgilenen: ilgilenenSuzgeci === "ben" ? "" : "ben", sayfa: "" })}`, "Bende", sayi.bende)}
        {klasor(ilgilenenSuzgeci === "yok", `/panel/posta${adresEki({ ilgilenen: ilgilenenSuzgeci === "yok" ? "" : "yok", sayfa: "" })}`, "Sahipsiz", sayi.sahipsiz)}
        {/* Etiketler Gmail'den geliyor; hiç etiketi olmayan kurumda başlık çıkmıyor. */}
        {etiketler.length ? <small className="posta-klasor-baslik">Etiketler</small> : null}
        {etiketler.map((etiket) => (
          <span key={etiket.label_id} className="posta-klasor-sar">
            {klasor(secilenEtiket === etiket.label_id, `/panel/posta${adresEki({ etiket: secilenEtiket === etiket.label_id ? "" : etiket.label_id, sayfa: "" })}`, etiket.ad)}
          </span>
        ))}
      </nav>

      <section className="panel-card posta-liste-bolme" aria-label="Posta listesi">
        {/* Arama sunucuda: GET formu kendi sayfasına gönderiyor, sonuç
            paylaşılabilir bir adres oluyor ve geri tuşu çalışıyor. */}
        <form className="talep-ara posta-ara" method="get" action="/panel/posta" role="search">
          {suzgec ? <input type="hidden" name="durum" value={suzgec} /> : null}
          {kutu ? <input type="hidden" name="kutu" value={kutu} /> : null}
          {yalnizOkunmamis === "1" ? <input type="hidden" name="okunmamis" value="1" /> : null}
          {secilenEtiket ? <input type="hidden" name="etiket" value={secilenEtiket} /> : null}
          {ilgilenenSuzgeci ? <input type="hidden" name="ilgilenen" value={ilgilenenSuzgeci} /> : null}
          <input name="q" defaultValue={aranan ?? ""} placeholder="Postalarda ara: konu, gönderen" aria-label="Postalarda ara" />
        </form>

        {/* Gövdede arama bağlantısı sonucun ÜSTÜNDE: önce üst veri sonucu,
            bulunamazsa buradan genişletiliyor. Tek Gmail çağrısı ve yalnızca istenince. */}
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
            <ul className="posta-satirlar">
              {taslaklar.map((satir) => (
                <li key={satir.id}>
                  <Link className="posta-satir" href={satir.thread_id ? satirAdresi(satir.thread_id) : `/panel/posta/yeni?taslak=${satir.id}`} scroll={false}>
                    <span className="posta-satir-ust">
                      <b>{satir.alici || (satir.thread_id ? "Yanıt taslağı" : "Alıcı yazılmamış")}</b>
                      <time>{istanbulTarihSaat(satir.updated_at)}</time>
                    </span>
                    <span className="posta-satir-konu">{satir.konu || "Konusuz"}</span>
                    <span className="posta-satir-ozet">{satir.govde.slice(0, 140)}</span>
                    <span className="posta-satir-alt"><i>{satir.olusturan ? adlar.get(satir.olusturan) ?? "Ekipten biri" : "—"}</i></span>
                  </Link>
                  {/* Yazılmış taslak: silinince geri gelmiyor. */}
                  <form action={taslakSil} className="posta-satir-eylem">
                    <input type="hidden" name="taslak_id" value={satir.id} />
                    <ConfirmDeleteButton label="Sil" confirmMessage="Bu taslağı silmek istediğinize emin misiniz?" />
                  </form>
                </li>
              ))}
              {/* Liste 50 ile sınırlı; sayaç daha büyükse eksiğin farkında olunsun. */}
              {sayi.taslak > taslaklar.length ? (
                <li className="posta-not">En son güncellenen {taslaklar.length} taslak gösteriliyor ({sayi.taslak} taslak var).</li>
              ) : null}
            </ul>
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
            Liste bir formun içinde: seçim kutucukları (name="secili") ve
            toplu işlem düğmeleri aynı gönderime giriyor. Satırdaki tekil
            "Geri al" de bu formun düğmesi — iç içe form HTML'de geçersiz.
          */
          <form className="posta-liste-form" action={copGorunumu ? topluGeriAl : topluOkundu}>
            <input type="hidden" name="donus" value="liste" />
            <div className="posta-liste-ust">
              <label className="posta-tumu-sec">
                <input type="checkbox" id="posta-tumunu-sec" aria-label="Listedeki yazışmaların tümünü seç" />
              </label>
              <TopluIslem copte={copGorunumu} silebilir={izin("posta.sil")} />
              <small className="posta-liste-sayi">{typeof suzgecSayisi === "number" ? `${suzgecSayisi} yazışma` : ""}</small>
            </div>
            <ul className="posta-satirlar">
              {konusmalar.map((konusma) => {
                const etiket = DURUM_ETIKETI[konusma.durum] ?? DURUM_ETIKETI.acik;
                const ilgilenen = konusma.ilgilenen_user_id ? (konusma.ilgilenen_user_id === userId ? "Siz" : adlar.get(konusma.ilgilenen_user_id) ?? "Ekipten biri") : null;
                const gonderen = konusma.son_gonderen_ad || konusma.son_gonderen_adres || "Bilinmeyen gönderen";
                const silen = konusma.silen_user_id
                  ? (konusma.silen_user_id === userId ? "Siz" : adlar.get(konusma.silen_user_id) ?? "Ekipten biri")
                  : null;
                const musteri = musteriAdi(konusma);
                return (
                  <li key={konusma.thread_id} data-okunmamis={konusma.okunmamis ? "evet" : undefined} data-acik={acikKonusma === konusma.thread_id ? "evet" : undefined}>
                    <input type="checkbox" name="secili" value={konusma.thread_id} className="posta-satir-sec"
                      aria-label={`${konusma.konu || "konusuz"} yazışmasını seç`} />
                    <Link className="posta-satir" href={satirAdresi(konusma.thread_id)} scroll={false}
                      aria-current={acikKonusma === konusma.thread_id ? "true" : undefined}>
                      <span className="posta-satir-ust">
                        <b title={konusma.son_gonderen_adres ?? gonderen}>{gonderen}</b>
                        <time>{istanbulTarihSaat(copGorunumu ? konusma.silindi_at : konusma.son_mesaj_at)}</time>
                      </span>
                      <span className="posta-satir-konu">{konusma.konu || "(konu yok)"}{konusma.mesaj_sayisi > 1 ? <small> {konusma.mesaj_sayisi}</small> : null}</span>
                      {/* Özet eşitleme anında yazılıyor; eski satırlarda ham varlık kalmış olabilir, okurken çözülüyor. */}
                      <span className="posta-satir-ozet">{htmlVarliklariniCoz(konusma.ozet ?? "")}</span>
                      <span className="posta-satir-alt">
                        {copGorunumu ? <i>{silen ? `Silen: ${silen}` : "Çöpte"}</i> : <span className="status-pill" data-tone={etiket.ton}>{etiket.ad}</span>}
                        {musteri ? <i>{musteri}</i> : null}
                        {!copGorunumu && ilgilenen ? <i>{ilgilenen === "Siz" ? "Siz ilgileniyorsunuz" : ilgilenen}</i> : null}
                        {konusma.etiketler?.map((kimlik) => etiketAdi.get(kimlik)).filter(Boolean).map((ad) => <em key={ad as string}>{ad}</em>)}
                      </span>
                    </Link>
                    {/* Çöp kutusunda yapılacak tek iş geri almak; yazışmayı açmayı şart koşmak gereksiz bir adım olurdu. */}
                    {copGorunumu && izin("posta.sil") ? (
                      <button className="panel-secondary posta-satir-eylem" type="submit" formAction={konusmayiGeriAl}
                        name="thread_id" value={konusma.thread_id}>Geri al</button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {sonSayfa > 1 ? (
              <nav className="liste-sayfalar" aria-label="Sayfalar">
                {sayfaNo > 1
                  ? <Link href={`/panel/posta${adresEki({ sayfa: sayfaNo === 2 ? "" : String(sayfaNo - 1) })}`}>← Önceki</Link>
                  : <span aria-hidden="true">← Önceki</span>}
                <b>{sayfaNo} / {sonSayfa}</b>
                {sayfaNo < sonSayfa
                  ? <Link href={`/panel/posta${adresEki({ sayfa: String(sayfaNo + 1) })}`}>Sonraki →</Link>
                  : <span aria-hidden="true">Sonraki →</span>}
              </nav>
            ) : null}
          </form>
        )}
      </section>

      <section className="panel-card posta-okuma" aria-label="Açık yazışma">
        {acikKonusma ? (
          <KonusmaGorunumu threadId={acikKonusma} bolme={{ listeAdresi, kendiAdresi: satirAdresi(acikKonusma) }} />
        ) : (
          <div className="posta-bolme-bos">
            <b>Bir yazışma seçin</b>
            <p>Listeden bir yazışmaya tıklayınca burada açılır; liste ve süzgeçler yerinde kalır.</p>
          </div>
        )}
      </section>
    </div>
  </main>;
}

/* Kutunun durumu listenin yanında: eşitleme durduğunda liste eskiyor ve
   bunu ancak Ayarlar'a giden fark ediyordu. */
function IstatistikKarti({ hesap, sayi, imzaDuzenlenebilir, kurum }: {
  hesap: Awaited<ReturnType<typeof postaDurumu>>;
  sayi: { okunmamis: number; acik: number; yanitlandi: number; listelenen: number };
  imzaDuzenlenebilir: boolean;
  kurum: { ad: string; logo: string | null; renk: string | null };
}) {
  /*
    Önizleme GÖNDERİMİN KENDİ işleviyle çiziliyor (imzaHtml), elle
    yazılmış bir taklitle değil: iki yerde ayrı biçim, imzayı ekranda
    düzgün gösterip müşteriye bozuk göndermenin en kolay yoluydu.
    Gönderimde logo mesajın içinden (cid:) gelir, burada genel adresten.

    HTML doğrudan basılıyor: içindeki kurum metni ve ad imzaHtml'de
    kaçırılıyor (tests/unit/posta-imza.test.ts).
  */
  const onizleme = imzaHtml({
    gonderenAdi: "Yanıtı yazan personelin adı",
    imza: hesap.etkinImza,
    logoSrc: kurum.logo,
    logoAlt: kurum.ad,
    renk: kurum.renk,
  });
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
        <form className="panel-form posta-imza kayit-formu" action={postaImzasi}>
          <label className="wide">
            Kurum imzası
            <textarea name="imza" rows={4} maxLength={2000} defaultValue={hesap.imza ?? ""} placeholder={"Akademik Merkez\nuzman@akademikmerkez.com"} />
          </label>
          <p className="wide kayit-formu-not">
            Giden her mesajın sonuna eklenir; personelin ayrıca yazmasına gerek kalmaz. Yazdığınız kutuda görünmez.
            İlk satır yanıtı yazan personelin adı olur, yanında kurum logonuz gider. Boş bırakırsanız
            kurumun Ayarlar&apos;daki bilgileri (ad, e-posta, telefon, site) yazılır — aşağıdaki önizleme
            giden imzanın kendisidir.
          </p>
          {onizleme ? (
            <div className="wide posta-imza-onizleme">
              <small>Müşteriye böyle görünür</small>
              <div dangerouslySetInnerHTML={{ __html: onizleme }} />
            </div>
          ) : null}
          <div className="wide panel-form-actions kayit-formu-eylem"><p>Boş bırakılırsa Ayarlar&apos;daki kurum bilgileri kullanılır.</p><button className="panel-primary" type="submit">İmzayı kaydet</button></div>
        </form>
      ) : onizleme ? (
        <div className="posta-imza-onizleme">
          <small>Giden mesajlara eklenen imza</small>
          <div dangerouslySetInnerHTML={{ __html: onizleme }} />
        </div>
      ) : null}
    </section>
  );
}
