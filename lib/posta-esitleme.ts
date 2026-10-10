import { createAdminClient } from "@/lib/supabase/admin";
import { postaErisimBelirteci } from "@/lib/posta-hesabi";
import { degisimleriTopla, gmailAramaSorgusu, konusmayiOzetle, kutudaGorunurMu, mesajEkleri, mesajGovdesi, mesajiCoz, type CozulmusMesaj, type DegisimSayfasi, type GmailMesaji, type MesajEki } from "@/lib/posta-ayristirma";
import { yeniPostaBildirimleri } from "./posta-bildirim";
import { alintiliGovde, base64UrlKodla, imzaliGovde, yanitKonusu, yanitMesajiKur, yeniMesajiKur, type EkDosya, type GomuluGorsel } from "@/lib/posta-gonderim";
import { LOGO_CID, gorselOlculeri, htmlGovdesi, logoAdresiUygunMu } from "@/lib/posta-imza";
import { randomBytes } from "node:crypto";

/*
  ORTAK POSTA KUTUSU — Gmail'den eşitleme.

  Zamanlayıcı (vercel.json) çağırıyor. Her eşitlemede kutunun SON
  mesajları okunuyor ve üst verileri tabloya yazılıyor; gövdeler
  saklanmıyor (bkz. 20261006190207 migration'ının başlığı).

  Neden tam liste değil de son N mesaj: Gmail'in artımlı ucu (history)
  yalnızca son bir haftayı tutuyor ve ilk kurulumda zaten boş. Sabit bir
  pencere hem ilk eşitlemeyi hem sonrakileri tek kodla çözüyor; kaçan bir
  şey olursa bir sonraki turda yakalanıyor. Kutunun tamamını geriye doğru
  taramak, okunmayacak on yıllık yazışmayı kopyalamak demekti.
*/

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

/*
  Her ekli mesaj için yeni bir parça sınırı. Sabit bir sınır, içerikte
  aynı dizgi geçen bir ekte mesajı alıcıda parçalanmış gösterirdi.
*/
const mesajSiniri = () => `arvo-${randomBytes(16).toString("hex")}`;
/** Artımlı imleç yokken bakılacak son mesaj sayısı (ilk tur ve imleç düşünce). */
const PENCERE = 60;
/* Bir turda okunacak en fazla değişiklik sayfası. Çok birikmişse kalanı
   bir sonraki tur alır; imleç ancak okunan yere kadar ilerliyor. */
const DEGISIM_SAYFASI = 5;
/* Tur kilidinin ömrü. Sunucu tur ortasında düşerse kilit asılı kalır;
   bu süreden eskisi düşmüş sayılıyor, yoksa kutu bir daha hiç
   eşitlenmezdi. 300 saniyelik işlev sınırının biraz üstü. */
const KILIT_OMRU_MS = 6 * 60 * 1000;
/* Geçmiş taramada tur başına bir sayfa. 100 mesaj onarlı kümelerle
   ~10 turda iniyor; daha büyüğü sunucunun zaman sınırını zorluyor. */
const GECMIS_SAYFA = 100;

export type EsitlemeSonucu = {
  durum: "tamam" | "kismi" | "basarisiz";
  kurum: number;
  mesaj: number;
  hatalar: string[];
};

type GmailCevabi = { govde: unknown } | { hata: string };

async function gmailGetir(yol: string, belirtec: string): Promise<GmailCevabi> {
  const yanit = await fetch(`${GMAIL}${yol}`, { headers: { authorization: `Bearer ${belirtec}` } }).catch(() => null);
  if (!yanit) return { hata: "Gmail'e ulaşılamadı." };
  const govde: unknown = await yanit.json().catch(() => ({}));
  if (!yanit.ok) {
    const sebep = (govde as { error?: { message?: string } })?.error?.message ?? `HTTP ${yanit.status}`;
    return { hata: sebep };
  }
  return { govde };
}

/*
  Mesaj kimliklerinden tabloya yazma. Üst veri biçiminde okunuyor
  (format=metadata): gövde indirilmiyor, yalnızca üç başlık.

  İstekler ONARLI KÜMELER hâlinde paralel. Tek tek beklendiğinde 100
  mesajlık bir geçmiş sayfası sunucunun zaman sınırını zorluyordu;
  sınırsız paralellik ise Gmail'in hız sınırına çarpıyor.
*/
const KUME = 10;

async function mesajlariIsle(
  organizationId: string,
  kutuAdresi: string,
  kimlikler: readonly string[],
  belirtec: string,
): Promise<{ cozulenler: CozulmusMesaj[]; yeniler: CozulmusMesaj[] } | { hata: string }> {
  const cozulenler: CozulmusMesaj[] = [];
  for (let i = 0; i < kimlikler.length; i += KUME) {
    const kume = kimlikler.slice(i, i + KUME);
    const sonuclar = await Promise.all(kume.map((id) => gmailGetir(
      `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject`,
      belirtec,
    )));
    for (const sonuc of sonuclar) {
      if ("hata" in sonuc) return { hata: sonuc.hata };
      const ham = sonuc.govde as GmailMesaji;
      // Taslak/spam/çöp elenir (lib/posta-ayristirma.ts · kutudaGorunurMu).
      if (!kutudaGorunurMu(ham.labelIds)) continue;
      const cozulen = mesajiCoz(ham, kutuAdresi);
      if (cozulen) cozulenler.push(cozulen);
    }
  }
  if (!cozulenler.length) return { cozulenler, yeniler: [] };

  const admin = createAdminClient();
  if (!admin) return { hata: "Sunucu anahtarı tanımlı değil." };

  /*
    Hangi mesajın BİZDE YENİ olduğu upsert'ten önce öğreniliyor: upsert
    "eklendi mi güncellendi mi" demiyor, bildirim de ancak gerçekten yeni
    gelen posta için atılabilir. Eskiden her tur aynı mesajı yeniden
    yazıyordu; bildirim buna bakılsaydı kutu her on dakikada bir aynı
    postayı yeniden duyururdu.
  */
  const { data: bilinenler } = await admin.from("mail_messages")
    .select("message_id")
    .eq("organization_id", organizationId)
    .in("message_id", cozulenler.map((mesaj) => mesaj.messageId));
  const bilinen = new Set(((bilinenler ?? []) as { message_id: string }[]).map((satir) => satir.message_id));
  const yeniler = cozulenler.filter((mesaj) => !bilinen.has(mesaj.messageId));

  const { error } = await admin.from("mail_messages").upsert(
    cozulenler.map((mesaj) => ({
      organization_id: organizationId,
      message_id: mesaj.messageId,
      thread_id: mesaj.threadId,
      gonderen_ad: mesaj.gonderenAd,
      gonderen_adres: mesaj.gonderenAdres,
      alici: mesaj.alici,
      konu: mesaj.konu,
      ozet: mesaj.ozet,
      tarih: mesaj.tarih?.toISOString() ?? null,
      yon: mesaj.yon,
      etiketler: mesaj.etiketler,
      ekli_dosya: mesaj.ekliDosya,
    })),
    { onConflict: "organization_id,message_id" },
  );
  if (error) return { hata: "Mesajlar yazılamadı: " + error.message };
  return { cozulenler, yeniler };
}

/*
  Konuşma satırları mesajlardan TÜRETİLİYOR, Gmail'in thread ucundan
  değil: pencerede olmayan eski mesajlar da sayıma girsin diye
  veritabanındaki tüm mesajlar okunuyor. Ortak durum (ilgilenen, durum,
  müşteri bağı) korunuyor — upsert yalnızca posta alanlarını yazıyor.
*/
async function konusmalariGuncelle(
  organizationId: string,
  cozulenler: readonly CozulmusMesaj[],
): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return "Sunucu anahtarı tanımlı değil.";
  const threadIds = [...new Set(cozulenler.map((mesaj) => mesaj.threadId))];
  if (!threadIds.length) return null;

  const { data: tumMesajlar, error } = await admin
    .from("mail_messages")
    .select("message_id,thread_id,gonderen_ad,gonderen_adres,alici,konu,ozet,tarih,yon,etiketler,ekli_dosya")
    .eq("organization_id", organizationId)
    .in("thread_id", threadIds);
  if (error) return "Konuşmalar okunamadı: " + error.message;

  const okunmamisKonusmalar = new Set(cozulenler.filter((mesaj) => mesaj.okunmamis).map((mesaj) => mesaj.threadId));
  const satirlar = threadIds.map((threadId) => {
    const konusmaninMesajlari = (tumMesajlar ?? [])
      .filter((satir) => satir.thread_id === threadId)
      .map((satir) => ({
        messageId: satir.message_id as string,
        threadId: satir.thread_id as string,
        gonderenAd: satir.gonderen_ad as string | null,
        gonderenAdres: (satir.gonderen_adres as string) ?? "",
        alici: (satir.alici as string) ?? "",
        konu: (satir.konu as string) ?? "",
        ozet: (satir.ozet as string) ?? "",
        tarih: satir.tarih ? new Date(satir.tarih as string) : null,
        yon: satir.yon as "gelen" | "giden",
        okunmamis: false,
        etiketler: (satir.etiketler as string[] | null) ?? [],
        ekliDosya: Boolean(satir.ekli_dosya),
      }));
    const ozet = konusmayiOzetle(konusmaninMesajlari);
    return ozet ? {
      organization_id: organizationId,
      thread_id: ozet.threadId,
      konu: ozet.konu,
      son_gonderen_ad: ozet.sonGonderenAd,
      son_gonderen_adres: ozet.sonGonderenAdres,
      son_mesaj_at: ozet.sonMesajAt?.toISOString() ?? null,
      ozet: ozet.ozet,
      mesaj_sayisi: ozet.mesajSayisi,
      okunmamis: okunmamisKonusmalar.has(ozet.threadId),
      /* Gelen/gönderilen kutusu süzgeci bu iki bayrağı okuyor. Listeyi
         çizerken mesajlara bakmak yüz satırda yüz alt sorgu demekti;
         burada zaten elimizdeki mesajlardan bedava çıkıyor. Bir konuşma
         ikisinde birden görünebilir — müşteri yazmış, biz cevaplamışsak
         o yazışma iki kutuya da aittir. */
      gelen_var: konusmaninMesajlari.some((mesaj) => mesaj.yon === "gelen"),
      giden_var: konusmaninMesajlari.some((mesaj) => mesaj.yon === "giden"),
      /* Konuşmanın etiketleri mesajlarının BİRLEŞİMİ: Gmail etiketi
         mesaja uyguluyor, kullanıcı ise yazışmayı etiketlediğini
         düşünüyor. Tek mesaja bakmak, zincirin ortasına uygulanmış bir
         etiketi listede kaybederdi. */
      etiketler: [...new Set(konusmaninMesajlari.flatMap((mesaj) => mesaj.etiketler))].sort(),
      /* Buraya gelen konuşmanın çöpte OLMAYAN en az bir mesajı var
         (çöp/spam mesajlar mesajlariIsle'de eleniyor). Yazışma Gmail'de
         çöpten çıkarıldıysa ya da çöpe atılmış bir yazışmaya müşteri
         yeniden yazdıysa panelde de kutuya dönmeli. */
      silindi_at: null,
      silen_user_id: null,
      updated_at: new Date().toISOString(),
    } : null;
  }).filter((satir): satir is NonNullable<typeof satir> => satir !== null);

  const { error: yazmaHatasi } = await admin.from("mail_threads")
    .upsert(satirlar, { onConflict: "organization_id,thread_id" });
  if (yazmaHatasi) return "Konuşmalar yazılamadı: " + yazmaHatasi.message;

  await firsatlaraBagla(organizationId, threadIds);
  return null;
}

/*
  KENDİLİĞİNDEN CRM BAĞI.

  Gelen postanın göndereni zaten bir fırsatın iletişim adresiyse konuşma
  o kayda bağlanıyor. Elle bağlamayı beklemek, ortak kutudaki yazışmanın
  müşteri kaydına hiç ulaşmaması demekti — kimse her konuşmayı tek tek
  bağlamıyor.

  İki sınır: (1) yalnızca TEK bir fırsat eşleşiyorsa bağlanıyor, birden
  çoksa karar insanın; (2) bağı olan konuşmaya dokunulmuyor, personelin
  elle kurduğu doğru bağ bir sonraki eşitlemede ezilmemeli.
*/
async function firsatlaraBagla(organizationId: string, threadIds: readonly string[]) {
  const admin = createAdminClient();
  if (!admin) return;

  const { data: bagsizlar } = await admin
    .from("mail_threads")
    .select("thread_id,son_gonderen_adres")
    .eq("organization_id", organizationId)
    .in("thread_id", threadIds)
    .is("opportunity_id", null);
  const adresler = [...new Set((bagsizlar ?? [])
    .map((satir) => (satir.son_gonderen_adres as string | null)?.toLowerCase())
    .filter((adres): adres is string => Boolean(adres)))];
  if (!adresler.length) return;

  const { data: firsatlar } = await admin
    .from("crm_opportunities")
    .select("id,contact_email")
    .eq("organization_id", organizationId)
    .in("contact_email", adresler);

  const adreseGore = new Map<string, string[]>();
  for (const firsat of firsatlar ?? []) {
    const adres = (firsat.contact_email as string | null)?.toLowerCase();
    if (!adres) continue;
    adreseGore.set(adres, [...(adreseGore.get(adres) ?? []), firsat.id as string]);
  }

  for (const satir of bagsizlar ?? []) {
    const adres = (satir.son_gonderen_adres as string | null)?.toLowerCase();
    const eslesen = adres ? adreseGore.get(adres) : undefined;
    if (!eslesen || eslesen.length !== 1) continue;
    await admin.from("mail_threads")
      .update({ opportunity_id: eslesen[0] })
      .eq("organization_id", organizationId)
      .eq("thread_id", satir.thread_id as string)
      .is("opportunity_id", null);
  }
}

/*
  ARTIMLI TUR — Gmail'in history ucu.

  Sıklık arttığında asıl maliyet listeleme değil, listedeki HER mesajın
  ayrı ayrı çekilmesi: pencere 60 mesajsa her tur 61 istek, hiçbir şey
  değişmemiş olsa bile. 2 dakikada bir bu, günde 44 bin istek.

  history ucu "şu imleçten beri ne değişti" diye soruyor: değişiklik
  yoksa cevap TEK istek ve boş. Yalnızca eklenen/etiketi değişen mesajlar
  çekiliyor — okundu işareti de etiket değişikliği olarak geliyor, yani
  biri Gmail'den bir postayı okuduğunda panel de görüyor.

  İmleç yoksa ya da Gmail "çok eski" diyorsa (404) null dönüyor ve
  çağıran tam pencereye düşüyor. Gmail history kayıtlarını sınırlı süre
  tutuyor; tek güvencemiz buysa, bir hafta kapalı kalan kutu sessizce
  eksik eşitlenirdi.
*/
async function degisenMesajlar(
  belirtec: string,
  imlec: string,
): Promise<{ kimlikler: string[]; yeniImlec: string | null } | null | { hata: string }> {
  const sayfalar: DegisimSayfasi[] = [];
  let sayfaBelirteci: string | null = null;

  for (let sayac = 0; sayac < DEGISIM_SAYFASI; sayac += 1) {
    const yanit = await gmailGetir(
      `/history?startHistoryId=${encodeURIComponent(imlec)}`
      + `&historyTypes=messageAdded&historyTypes=labelAdded&historyTypes=labelRemoved`
      + (sayfaBelirteci ? `&pageToken=${encodeURIComponent(sayfaBelirteci)}` : ""),
      belirtec,
    );
    if ("hata" in yanit) {
      /* İmleç çok eskiyse Gmail 404 veriyor. Hata değil: tam pencereye
         dönülecek, bu yüzden null. */
      if (/not found|404/i.test(yanit.hata)) return null;
      return { hata: yanit.hata };
    }
    const govde = yanit.govde as DegisimSayfasi;
    sayfalar.push(govde);
    sayfaBelirteci = govde.nextPageToken ?? null;
    if (!sayfaBelirteci) break;
  }

  // İmleci ilerletme kararı dahil: lib/posta-ayristirma.ts · degisimleriTopla
  return degisimleriTopla(sayfalar);
}

/** Kutunun o anki history imleci (artımlı turun başlangıç noktası). */
async function guncelImlec(belirtec: string): Promise<string | null> {
  const yanit = await gmailGetir("/profile", belirtec);
  if ("hata" in yanit) return null;
  const kimlik = (yanit.govde as { historyId?: string }).historyId;
  return kimlik ? String(kimlik) : null;
}

/*
  TUR KİLİDİ.

  10 dakikalık turda bir eşitlemenin bir sonrakine yetişmesi mümkün
  değildi. 2 dakikada ve üstüne açık sekmenin tetiklemesiyle mümkün:
  geçmiş taraması süren bir kurumda tur uzuyor, ikinci tur aynı
  mesajları yeniden çekip aynı satırlara yazıyor — Gmail kotası boşa
  gidiyor ve iki tur aynı history imlecini farklı yerlere taşıyor.

  Kilit, satırın kendi koşuluyla alınıyor (tek update, şartı WHERE'de):
  iki tur aynı anda denerse biri satırı günceller, diğerinin güncellemesi
  hiçbir satıra denk gelmez. Önce okuyup sonra yazmak, tam da engellemek
  istediğimiz yarışı bırakırdı (AGENTS.md: "önce kontrol et sonra yaz"
  yeterli sayılmaz).

  Kilit ZAMAN AŞIMLI: sunucu tur ortasında düşerse kilit asılı kalır ve
  kutu bir daha hiç eşitlenmezdi. Sessizce duran bir kutu, hata veren
  kutudan beterdir — en azından hata ekranda görünüyor.
*/
async function kilidiAl(organizationId: string): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const simdi = new Date();
  const eskiSayilir = new Date(simdi.getTime() - KILIT_OMRU_MS).toISOString();
  const { data } = await admin.from("mail_accounts")
    .update({ esitleniyor_at: simdi.toISOString() })
    .eq("organization_id", organizationId)
    .or(`esitleniyor_at.is.null,esitleniyor_at.lt.${eskiSayilir}`)
    .select("organization_id");
  return Boolean(data?.length);
}

async function kilidiBirak(organizationId: string) {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("mail_accounts")
    .update({ esitleniyor_at: null })
    .eq("organization_id", organizationId);
}

/**
 * Tek kurumun kutusunu eşitler. Hata metni döner, yoksa null.
 *
 * Başka bir tur sürüyorsa hiçbir şey yapmadan null döner: "şu an
 * eşitleniyor" bir hata değil, çağıran taraf için de sonuç aynı.
 */
export async function kurumPostasiniEsitle(organizationId: string, kutuAdresi: string): Promise<string | null> {
  if (!(await kilidiAl(organizationId))) return null;
  try {
    return await turuKos(organizationId, kutuAdresi);
  } finally {
    /* finally: hata da atılsa kilit kalkıyor. Kalkmazsa kutu altı dakika
       boyunca eşitlenmez. */
    await kilidiBirak(organizationId);
  }
}

/*
  Yeni gelen posta için panelin bildirim çekmecesine satır bırakır.

  Yalnızca CANLI pencereden çağrılıyor, geçmiş taramasından değil: ilk
  eşitlemede yıllık kutunun tamamı "yeni" sayılır ve kurum binlerce
  bildirimle karşılaşırdı.

  Bildirim kuruma (audience: organization) bırakılıyor, kişiye değil:
  kutu ortak, hangi personelin ilgileneceği baştan belli değil.

  Hata yutuluyor: bildirim yazılamadı diye eşitlemeyi düşürmek, asıl işi
  (postanın kutuya inmesi) ikincil bir yüzünden feda etmek olurdu.
*/
/*
  ETİKET KATALOĞU.

  Konuşmada Gmail'in etiket KİMLİĞİ duruyor ("Label_12"); ekranda ad
  gerekiyor. Katalog her turda tazeleniyor: tek bir istek, ve kurum
  Gmail'de etiketi yeniden adlandırdığında panel bir sonraki turda
  doğruyu gösteriyor. Adı saklamak yerine her listede Gmail'e sormak,
  her sayfa açılışında bir ağ turu demekti.

  Sistem etiketleri (INBOX, SENT, UNREAD…) katalogda yok: panelde
  gösterilen tek şey kurumun kendi etiketleri, ötekiler kendi
  sütunlarında modellenmiş durumda.

  Silinen etiket katalogdan da düşüyor: Gmail'de kaldırılmış bir
  etiketin süzgeçte durması, tıklayana boş liste gösterirdi.
*/
async function etiketKatalogunuTazele(organizationId: string, belirtec: string): Promise<void> {
  const sonuc = await gmailGetir("/labels", belirtec);
  if ("hata" in sonuc) return;
  const etiketler = ((sonuc.govde as { labels?: { id?: string; name?: string; type?: string }[] }).labels ?? [])
    .filter((etiket) => etiket.id && etiket.name && etiket.type === "user")
    .map((etiket) => ({ label_id: etiket.id as string, ad: etiket.name as string }));

  const admin = createAdminClient();
  if (!admin) return;
  if (etiketler.length) {
    const { error } = await admin.from("mail_labels").upsert(
      etiketler.map((etiket) => ({
        organization_id: organizationId,
        label_id: etiket.label_id,
        ad: etiket.ad,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "organization_id,label_id" },
    );
    if (error) {
      console.error("[posta] etiket kataloğu yazılamadı:", error.message);
      return;
    }
  }
  /* Gmail'de kalmayanları sil. Liste boşsa da çalışıyor: kurum bütün
     etiketlerini silmiş olabilir. */
  const kalanlar = etiketler.map((etiket) => etiket.label_id);
  let silme = admin.from("mail_labels").delete().eq("organization_id", organizationId);
  if (kalanlar.length) silme = silme.not("label_id", "in", `(${kalanlar.map((id) => `"${id}"`).join(",")})`);
  await silme;
}

async function yeniPostayiDuyur(organizationId: string, yeniler: readonly CozulmusMesaj[]) {
  const bildirimler = yeniPostaBildirimleri(yeniler.map((mesaj) => ({
    threadId: mesaj.threadId,
    gonderenAd: mesaj.gonderenAd,
    gonderenAdres: mesaj.gonderenAdres,
    konu: mesaj.konu,
    tarih: mesaj.tarih,
    yon: mesaj.yon,
  })));
  if (!bildirimler.length) return;

  const admin = createAdminClient();
  if (!admin) return;
  const { error } = await admin.from("notifications").insert(bildirimler.map((bildirim) => ({
    organization_id: organizationId,
    audience: "organization",
    category: "posta_gelen",
    title: bildirim.baslik,
    message: bildirim.mesaj,
    action_url: bildirim.threadId ? `/panel/posta/${bildirim.threadId}` : "/panel/posta",
    metadata: bildirim.threadId ? { thread_id: bildirim.threadId } : {},
  })));
  if (error) console.error("[posta] bildirim yazılamadı:", error.message);
}

async function turuKos(organizationId: string, kutuAdresi: string): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return "Sunucu anahtarı tanımlı değil.";

  const belirtec = await postaErisimBelirteci(organizationId);
  if (typeof belirtec !== "string") return belirtec.hata;

  const { data: oncekiDurum } = await admin
    .from("mail_accounts").select("last_history_id").eq("organization_id", organizationId).maybeSingle();
  const imlec = (oncekiDurum?.last_history_id as string | null) ?? null;

  // ---------- 1) Yeni ve değişen mesajlar ----------
  let yeniKimlikler: string[];
  let yeniImlec: string | null = null;

  const artimli = imlec ? await degisenMesajlar(belirtec, imlec) : null;
  if (artimli && "hata" in artimli) return artimli.hata;

  if (artimli) {
    yeniKimlikler = artimli.kimlikler;
    yeniImlec = artimli.yeniImlec;
  } else {
    /* İmleç yok ya da düştü: son N mesaja bak ve imleci yeniden kur.
       İmleç ÖNCE alınıyor — tarama sırasında gelen bir posta, imleç
       sonra alınsaydı iki turda da atlanırdı. */
    yeniImlec = await guncelImlec(belirtec);
    /*
      İKİ AYRI SORGU, çünkü Gmail'de labelIds VE anlamına geliyor:
      "Only return messages with labels that match ALL of the specified
      label IDs". Tek sorguda labelIds=INBOX&labelIds=SENT yazmak "hem
      gelen kutusunda hem gönderilmişlerde olan mesajlar" demekti —
      pratikte yalnızca kişinin kendine attığı postalar. Gelen postanın
      hiçbiri bu pencereden geçmiyordu; kutuyu dolduran şey geçmiş
      taramasıydı ve o bitince yeni posta hiç görünmeyecekti.
    */
    const kimlikKumesi = new Set<string>();
    for (const etiket of ["INBOX", "SENT"]) {
      const liste = await gmailGetir(`/messages?maxResults=${PENCERE}&labelIds=${etiket}`, belirtec);
      if ("hata" in liste) return liste.hata;
      for (const satir of (liste.govde as { messages?: { id?: string }[] }).messages ?? []) {
        if (satir.id) kimlikKumesi.add(satir.id);
      }
    }
    yeniKimlikler = [...kimlikKumesi];
  }

  /* Katalog mesajlardan ÖNCE: etiket kimliği konuşmaya yazıldığında
     adının da elimizde olması gerekiyor, yoksa yeni bir etiket ilk
     turda süzgeçte adsız görünürdü. */
  await etiketKatalogunuTazele(organizationId, belirtec);

  const yeniSonuc = await mesajlariIsle(organizationId, kutuAdresi, yeniKimlikler, belirtec);
  if ("hata" in yeniSonuc) return yeniSonuc.hata;
  const konusmaHatasi = await konusmalariGuncelle(organizationId, yeniSonuc.cozulenler);
  if (konusmaHatasi) return konusmaHatasi;
  await yeniPostayiDuyur(organizationId, yeniSonuc.yeniler);

  // ---------- 2) Geçmişten bir sayfa ----------
  const { data: hesap } = await admin
    .from("mail_accounts")
    .select("gecmis_belirteci,gecmis_bitti,gecmis_mesaj_sayisi")
    .eq("organization_id", organizationId)
    .maybeSingle();

  let gecmisBelirteci = (hesap?.gecmis_belirteci as string | null) ?? null;
  let gecmisBitti = Boolean(hesap?.gecmis_bitti);
  let gecmisSayac = (hesap?.gecmis_mesaj_sayisi as number | null) ?? 0;

  if (!gecmisBitti) {
    /*
      Kutunun tamamı tek turda indirilmiyor: her mesaj ayrı istek ve
      yıllık bir kutuda bu, sunucunun zaman sınırını aşıyor. Tur başına
      bir sayfa ilerliyoruz; 10 dakikada bir çalışan zamanlayıcıyla
      günde on binlerce mesaj taranabiliyor ve ilk eşitleme kimseyi
      bekletmiyor.
    */
    const sayfa = await gmailGetir(
      `/messages?maxResults=${GECMIS_SAYFA}${gecmisBelirteci ? `&pageToken=${encodeURIComponent(gecmisBelirteci)}` : ""}`,
      belirtec,
    );
    if ("hata" in sayfa) return sayfa.hata;
    const govde = sayfa.govde as { messages?: { id?: string }[]; nextPageToken?: string };
    const kimlikler = (govde.messages ?? []).map((satir) => satir.id).filter((id): id is string => Boolean(id));

    const gecmisSonuc = await mesajlariIsle(organizationId, kutuAdresi, kimlikler, belirtec);
    if ("hata" in gecmisSonuc) return gecmisSonuc.hata;
    const gecmisKonusma = await konusmalariGuncelle(organizationId, gecmisSonuc.cozulenler);
    if (gecmisKonusma) return gecmisKonusma;

    gecmisSayac += gecmisSonuc.cozulenler.length;
    gecmisBelirteci = govde.nextPageToken ?? null;
    // Sayfa belirteci gelmediyse kutunun sonuna gelinmiştir.
    gecmisBitti = !govde.nextPageToken;
  }

  await admin.from("mail_accounts").update({
    last_sync_at: new Date().toISOString(),
    last_error: null,
    gecmis_belirteci: gecmisBelirteci,
    gecmis_bitti: gecmisBitti,
    gecmis_mesaj_sayisi: gecmisSayac,
    /* İmleç yalnızca BAŞARILI turun sonunda ilerliyor: arada bir hata
       olsa yukarıda çıkılmış olurdu ve bir sonraki tur aynı
       değişiklikleri yeniden ister. */
    ...(yeniImlec ? { last_history_id: yeniImlec } : {}),
  }).eq("organization_id", organizationId);
  return null;
}

/*
  EŞİTLEME DURUMU BİLDİRİMİ.

  Hata şimdiye kadar yalnızca hesabın üstüne yazılıyordu: posta
  sayfasının yan kartında ve Ayarlar'da görünüyor ama oraya her gün
  kimse bakmıyor. Kutu sessizce bayatlıyor ve bunu çoğu zaman müşteri
  "cevap vermediniz" dediğinde öğreniliyor.

  Bildirim kuruma bırakılıyor (kişiye değil): kutu ortak ve kimin
  ilgileneceği baştan belli değil. Yazma hatası yutuluyor — bildirim
  yüzünden eşitleme turunu düşürmek, asıl işi ikincil bir yüzünden
  feda etmek olurdu.
*/
async function esitlemeDurumunuDuyur(
  organizationId: string,
  durum: "durdu" | "duzeldi",
  sebep: string | null,
) {
  const admin = createAdminClient();
  if (!admin) return;
  const { error } = await admin.from("notifications").insert({
    organization_id: organizationId,
    audience: "organization",
    category: "posta_esitleme",
    title: durum === "durdu" ? "Posta eşitlemesi durdu" : "Posta eşitlemesi düzeldi",
    message: durum === "durdu"
      ? `Ortak kutu güncellenemiyor: ${(sebep ?? "").slice(0, 160)}`
      : "Ortak kutu yeniden güncelleniyor.",
    action_url: "/panel/posta",
    metadata: { durum },
  });
  if (error) console.error("[posta] eşitleme bildirimi yazılamadı:", error.message);
}

/** Bağlı bütün kurumların kutusunu eşitler (zamanlayıcı). */
export async function postalariEsitle(): Promise<EsitlemeSonucu> {
  const admin = createAdminClient();
  if (!admin) return { durum: "basarisiz", kurum: 0, mesaj: 0, hatalar: ["Sunucu anahtarı tanımlı değil."] };

  const { data: hesaplar, error } = await admin
    .from("mail_accounts")
    .select("organization_id,email,last_error")
    .eq("status", "bagli");
  if (error) return { durum: "basarisiz", kurum: 0, mesaj: 0, hatalar: ["Posta hesapları okunamadı: " + error.message] };

  const hatalar: string[] = [];
  for (const hesap of hesaplar ?? []) {
    const organizationId = hesap.organization_id as string;
    const oncedenHataliydi = Boolean(hesap.last_error);
    const hata = await kurumPostasiniEsitle(organizationId, hesap.email as string);
    if (hata) {
      hatalar.push(`${hesap.email}: ${hata}`);
      /* Hata hesabın üstüne yazılıyor: ayarlar ekranı sebebini gösteriyor.
         Sessizce atlamak, kutusu günlerdir güncellenmeyen kurumu hiçbir
         uyarı olmadan bırakırdı. */
      await admin.from("mail_accounts")
        .update({ last_error: hata, updated_at: new Date().toISOString() })
        .eq("organization_id", organizationId);
      /* Yalnızca DURUM DEĞİŞİNCE haber veriliyor: zamanlayıcı on dakikada
         bir koşuyor, her turda bildirim bırakmak çekmeceyi aynı satırla
         doldururdu. */
      if (!oncedenHataliydi) {
        await esitlemeDurumunuDuyur(organizationId, "durdu", hata);
      }
    } else if (oncedenHataliydi) {
      /* Düzeldiğini de söylemek gerekiyor: "durdu" bildirimi çekmecede
         dururken kutu yeniden akmaya başlarsa, kullanıcı hâlâ bozuk
         sanır. Başarılı tur last_error'ı zaten temizliyor. */
      await esitlemeDurumunuDuyur(organizationId, "duzeldi", null);
    }
  }

  const kurum = (hesaplar ?? []).length;
  return {
    durum: hatalar.length === 0 ? "tamam" : hatalar.length < kurum ? "kismi" : "basarisiz",
    kurum,
    mesaj: 0,
    hatalar,
  };
}

/**
 * Tek bir mesajın okunabilir gövdesi — konuşma AÇILDIĞINDA Gmail'den.
 *
 * Saklamıyoruz (bkz. migration başlığı): liste ekranı gövdeyi
 * göstermiyor, saklamak kurumun yazışmasını ikinci bir veritabanında
 * çoğaltmak olurdu.
 */
export async function postaGovdesiniGetir(
  organizationId: string,
  messageId: string,
): Promise<{ govde: string; ekler: MesajEki[] } | { hata: string }> {
  const belirtec = await postaErisimBelirteci(organizationId);
  if (typeof belirtec !== "string") return belirtec;
  const sonuc = await gmailGetir(`/messages/${messageId}?format=full`, belirtec);
  if ("hata" in sonuc) return sonuc;
  /* Gövde ve ekler AYNI çağrıdan: ikisi için ayrı ayrı mesajı çekmek,
     on mesajlık bir konuşmada yirmi istek demekti. */
  const payload = (sonuc.govde as { payload?: unknown }).payload;
  return { govde: mesajGovdesi(payload), ekler: mesajEkleri(payload) };
}

/**
 * Tek bir ekin içeriği. İndirme yolundan çağrılıyor.
 *
 * Dosya adı ve türü URL'den DEĞİL, Gmail'den okunuyor: adresteki değere
 * güvenmek, indirilen dosyanın adını ve türünü dışarıdan yazdırmaya
 * açık bırakırdı.
 */
export async function postaEkiniGetir(
  organizationId: string,
  messageId: string,
  ekId: string,
): Promise<{ veri: Buffer; dosyaAdi: string; tur: string } | { hata: string }> {
  const belirtec = await postaErisimBelirteci(organizationId);
  if (typeof belirtec !== "string") return belirtec;

  const mesaj = await gmailGetir(`/messages/${messageId}?format=full`, belirtec);
  if ("hata" in mesaj) return mesaj;
  const ek = mesajEkleri((mesaj.govde as { payload?: unknown }).payload).find((aday) => aday.ekId === ekId);
  if (!ek) return { hata: "Ek bu mesajda bulunamadı." };

  const icerik = await gmailGetir(`/messages/${messageId}/attachments/${ekId}`, belirtec);
  if ("hata" in icerik) return icerik;
  const veri = (icerik.govde as { data?: string }).data;
  if (!veri) return { hata: "Ekin içeriği okunamadı." };

  return {
    veri: Buffer.from(veri.replace(/-/g, "+").replace(/_/g, "/"), "base64"),
    dosyaAdi: ek.dosyaAdi,
    tur: ek.tur,
  };
}

/*
  İMZA LOGOSU.

  Kurumun logosu genel bir adreste duruyor (organizations.logo_url —
  kendi storage'ımız ya da kurumun sitesi). Gönderim anında indirilip
  mesajın İÇİNE gömülüyor: HTML'de uzak adresi göstermek, Gmail ve
  Outlook uzak görselleri engellediği için imzayı kırık bir kare
  yapıyordu.

  Hiçbir hata gönderimi durdurmuyor: logo inmezse imza logosuz gidiyor.
  Postanın gitmemesi, logosuz gitmesinden çok daha pahalı.

  SINIRLAR: yalnızca https ve genel adlar (logoAdresiUygunMu — sunucuyu
  iç ağa sürmenin yolu kapanıyor), yalnızca bilinen görsel türleri, en
  çok 300 KB (her postaya ekleniyor; büyük logo her yazışmayı şişirir)
  ve 5 saniye. Yönlendirme ELLE izleniyor, tek adım: "follow" deseydik
  iç ağa yönlendiren bir adres kuralı delerdi.
*/
const LOGO_EN_COK_BAYT = 300 * 1024;
const LOGO_TURLERI: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp",
};

type ImzaLogosu = { gomulu: GomuluGorsel; olculeri: { en: number; boy: number } | null };

/* Aynı adres aynı sunucu örneğinde yeniden inmiyor: adres logo
   değiştiğinde "?v=<damga>" ile değişiyor, yani önbellek eskimiyor.
   Birkaç kurumla sınırlı — sınırsız bir harita sızıntı olurdu. */
const logoOnbellegi = new Map<string, ImzaLogosu | null>();
const LOGO_ONBELLEK_SINIRI = 8;

async function imzaLogosu(adres: string | null | undefined): Promise<ImzaLogosu | null> {
  if (!logoAdresiUygunMu(adres)) return null;
  const anahtar = String(adres);
  if (logoOnbellegi.has(anahtar)) return logoOnbellegi.get(anahtar) ?? null;

  const sonuc = await logoyuIndir(anahtar);
  if (logoOnbellegi.size >= LOGO_ONBELLEK_SINIRI) logoOnbellegi.clear();
  logoOnbellegi.set(anahtar, sonuc);
  return sonuc;
}

async function logoyuIndir(adres: string): Promise<ImzaLogosu | null> {
  let yanit = await logoIstegi(adres);
  if (yanit && yanit.status >= 300 && yanit.status < 400) {
    const hedef = yanit.headers.get("location");
    const mutlak = hedef ? new URL(hedef, adres).toString() : null;
    yanit = logoAdresiUygunMu(mutlak) ? await logoIstegi(String(mutlak)) : null;
  }
  if (!yanit || !yanit.ok) return null;

  const tur = (yanit.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const uzanti = LOGO_TURLERI[tur];
  if (!uzanti) return null;
  if (Number(yanit.headers.get("content-length") ?? 0) > LOGO_EN_COK_BAYT) return null;

  const veri = Buffer.from(await yanit.arrayBuffer().catch(() => new ArrayBuffer(0)));
  if (!veri.length || veri.length > LOGO_EN_COK_BAYT) return null;

  return {
    gomulu: { kimlik: LOGO_CID, ad: `logo.${uzanti}`, tur, veri },
    olculeri: gorselOlculeri(veri),
  };
}

function logoIstegi(adres: string) {
  return fetch(adres, { redirect: "manual", signal: AbortSignal.timeout(5000) }).catch(() => null);
}

/**
 * Konuşmaya yanıt gönderir ve giden mesajı tabloya yazar.
 *
 * Zincir başlıkları (In-Reply-To / References) için son mesajın
 * Message-ID'si Gmail'den okunuyor; o başlığı saklamıyoruz ve
 * olmadan yanıt alıcının kutusunda AYRI bir konuşma olarak açılıyor —
 * Gmail'in threadId'si yalnızca bizim tarafımızı birleştiriyor.
 */
export async function postaYanitiGonder(girdi: {
  organizationId: string;
  kutuAdresi: string;
  gonderenAd: string;
  threadId: string;
  sonMesajId: string;
  alici: string;
  konu: string;
  govde: string;
  ekler?: readonly EkDosya[];
  imza?: string | null;
  /* İmzanın ilk satırı: yanıtı yazan personelin adı. */
  gonderenPersonel?: string | null;
  /* HTML imza için kurumun logosu ve marka rengi (panel bağlamından). */
  logoAdresi?: string | null;
  markaRengi?: string | null;
  cc?: readonly string[];
  /* Yanıtlanan mesaj: alıntı için. Gövdesi gönderim anında Gmail'den
     okunuyor; saklamıyoruz (bkz. migration başlığı). mesajId alıntılanan
     GELEN mesajın kimliği — zincirin son mesajı değil (bkz. aşağısı). */
  alinti?: { mesajId: string; gonderenAd: string | null; gonderenAdres: string; tarih: Date | null } | null;
}): Promise<{ messageId: string } | { hata: string }> {
  const belirtec = await postaErisimBelirteci(girdi.organizationId);
  if (typeof belirtec !== "string") return belirtec;

  const basliklar = await gmailGetir(
    `/messages/${girdi.sonMesajId}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`,
    belirtec,
  );
  if ("hata" in basliklar) return basliklar;
  const satirlar = (basliklar.govde as { payload?: { headers?: { name?: string; value?: string }[] } }).payload?.headers;
  const basliktanAl = (ad: string) =>
    satirlar?.find((satir) => (satir.name ?? "").toLowerCase() === ad)?.value ?? null;

  /* Alıntılanan mesajın gövdesi, başlığı yazılan mesajdan okunuyor.
     Eskiden zincirin son mesajından (sonMesajId) okunuyordu; o bizim
     önceki cevabımızsa müşteri "<müşteri> şöyle yazdı:" altında kendi
     mesajı yerine bizim cevabımızı, imzası ve eski alıntılarıyla
     görüyordu.

     Bir kez okunuyor, iki biçimde kullanılıyor: düz metin alıntısı ve
     HTML blockquote aynı metni göstermeli. */
  let alinti: { gonderenAd: string | null; gonderenAdres: string; tarih: Date | null; metin: string } | null = null;
  if (girdi.alinti) {
    const alintiGovdesi = await postaGovdesiniGetir(girdi.organizationId, girdi.alinti.mesajId);
    if (!("hata" in alintiGovdesi)) alinti = { ...girdi.alinti, metin: alintiGovdesi.govde };
  }

  /*
    Sıra: yanıt → imza → alıntı. İmza alıntının İÇİNDE kalırsa her turda
    bir kopya daha birikiyor ve yazışmanın yarısı imza oluyor. Aynı sıra
    HTML tarafında da (htmlGovdesi).
  */
  const gonderilecek = alintiliGovde(
    imzaliGovde(girdi.govde, girdi.imza, girdi.gonderenPersonel),
    alinti,
  );

  /* Logo gönderim anında iniyor; inmezse imza logosuz gidiyor. */
  const logo = await imzaLogosu(girdi.logoAdresi);
  const html = htmlGovdesi({
    govde: girdi.govde,
    gonderenAdi: girdi.gonderenPersonel,
    imza: girdi.imza,
    logoSrc: logo ? `cid:${logo.gomulu.kimlik}` : null,
    logoAlt: girdi.gonderenAd,
    logoOlculeri: logo?.olculeri ?? null,
    renk: girdi.markaRengi,
    alinti,
  });

  const ham = yanitMesajiKur({
    gonderenAd: girdi.gonderenAd,
    gonderenAdres: girdi.kutuAdresi,
    alici: girdi.alici,
    cc: girdi.cc,
    konu: girdi.konu,
    govde: gonderilecek,
    html,
    sonMesajId: basliktanAl("message-id"),
    referanslar: basliktanAl("references"),
    ekler: girdi.ekler,
    gomulu: logo ? [logo.gomulu] : undefined,
    sinir: mesajSiniri(),
  });

  const yanit = await fetch(`${GMAIL}/messages/send`, {
    method: "POST",
    headers: { authorization: `Bearer ${belirtec}`, "content-type": "application/json" },
    body: JSON.stringify({ raw: base64UrlKodla(ham), threadId: girdi.threadId }),
  }).catch(() => null);
  if (!yanit) return { hata: "Gmail'e ulaşılamadı; yanıt gönderilemedi." };

  const govde = await yanit.json().catch(() => ({}));
  if (!yanit.ok) {
    const sebep = (govde as { error?: { message?: string } })?.error?.message ?? `HTTP ${yanit.status}`;
    return { hata: `Yanıt gönderilemedi: ${sebep}` };
  }
  const messageId = (govde as { id?: string }).id;
  if (!messageId) return { hata: "Gmail yanıtı kabul etti ama mesaj kimliği dönmedi." };

  /*
    Giden mesaj hemen tabloya yazılıyor; eşitlemeyi beklemek, personelin
    gönderdiği yanıtı on dakika boyunca ekranda görmemesi demekti ve
    "gitti mi?" diye ikinci kez gönderilmesine yol açardı.
  */
  const admin = createAdminClient();
  if (admin) {
    await admin.from("mail_messages").upsert({
      organization_id: girdi.organizationId,
      message_id: messageId,
      thread_id: girdi.threadId,
      gonderen_ad: girdi.gonderenAd,
      gonderen_adres: girdi.kutuAdresi,
      alici: girdi.alici,
      konu: yanitKonusu(girdi.konu),
      ozet: girdi.govde.slice(0, 200),
      tarih: new Date().toISOString(),
      yon: "giden",
      ekli_dosya: Boolean(girdi.ekler?.length),
    }, { onConflict: "organization_id,message_id" });
    /* Yanıtlanan yazışma artık Gönderilenler'de de. Eskiden bayrak bir
       sonraki eşitlemeye kadar yanlış kalıyordu. */
    await admin.from("mail_threads").update({ giden_var: true })
      .eq("organization_id", girdi.organizationId).eq("thread_id", girdi.threadId);
  }

  return { messageId };
}

/**
 * Konuşmayı OKUNDU yapar: önce Gmail'de UNREAD etiketini kaldırır,
 * sonra yereldeki kopyayı günceller.
 *
 * SIRA ÖNEMLİ VE YEREL TEK BAŞINA YETMEZ. Eşitleme her turda
 * mail_threads.okunmamis'i Gmail'in UNREAD etiketinden yeniden yazıyor
 * (bkz. konusmalariGuncelle). Yalnızca yereli işaretleseydik posta,
 * personel okuduktan en geç on dakika sonra yeniden okunmamış görünürdü
 * — düzeltilmiş gibi duran, kendini geri alan bir hata.
 *
 * Gmail reddederse yerel kopyaya da dokunulmuyor: ekranda okundu görünüp
 * bir sonraki turda geri dönmesindense hiç değişmemesi dürüst.
 *
 * Yerel yazma service_role ile: mail_threads tetikleyicisi okunmamis
 * sütununu oturumdan değiştirmeyi bilerek yasaklıyor, çünkü o bilgi
 * Gmail'den gelir.
 */
export async function konusmayiOkunduYap(
  organizationId: string,
  threadId: string,
): Promise<string | null> {
  const belirtec = await postaErisimBelirteci(organizationId);
  if (typeof belirtec !== "string") return belirtec.hata;

  const yanit = await fetch(`${GMAIL}/threads/${encodeURIComponent(threadId)}/modify`, {
    method: "POST",
    headers: { authorization: `Bearer ${belirtec}`, "content-type": "application/json" },
    body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
  }).catch(() => null);
  if (!yanit) return "Gmail'e ulaşılamadı; konuşma okundu olarak işaretlenemedi.";
  if (!yanit.ok) {
    const govde = await yanit.json().catch(() => ({}));
    const sebep = (govde as { error?: { message?: string } })?.error?.message ?? `HTTP ${yanit.status}`;
    return `Konuşma okundu olarak işaretlenemedi: ${sebep}`;
  }

  const admin = createAdminClient();
  if (!admin) return "Sunucu anahtarı tanımlı değil.";
  const { error } = await admin.from("mail_threads")
    .update({ okunmamis: false, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("thread_id", threadId);
  return error ? "Konuşma Gmail'de okundu yapıldı ama kayda yazılamadı: " + error.message : null;
}

/**
 * Sıfırdan posta gönderir ve konuşmayı tabloya yazar.
 *
 * Yanıttan ayrı bir yol: zincir başlığı yok (var olmayan bir mesaja
 * atıf, alıcının istemcisinde konuşmayı boş bir dala asıyor) ve
 * konuşma satırı Gmail'in döndürdüğü threadId ile SIFIRDAN kuruluyor.
 *
 * Durum "yanıtlandı" olarak açılıyor. Ortak kutuda durum "ekibin ne
 * yapması gerektiği" demek; biz başlattığımız ve cevabını beklediğimiz
 * bir konuşmada yapılacak bir şey yok. "Açık" bırakmak listeyi, kimsenin
 * dokunması gerekmeyen satırlarla doldururdu.
 */
export async function postaYeniGonder(girdi: {
  organizationId: string;
  kutuAdresi: string;
  gonderenAd: string;
  alicilar: readonly string[];
  konu: string;
  govde: string;
  opportunityId?: string | null;
  ekler?: readonly EkDosya[];
  imza?: string | null;
  /* İmzanın ilk satırı: yanıtı yazan personelin adı. */
  gonderenPersonel?: string | null;
  /* HTML imza için kurumun logosu ve marka rengi (panel bağlamından). */
  logoAdresi?: string | null;
  markaRengi?: string | null;
  cc?: readonly string[];
}): Promise<{ threadId: string } | { hata: string }> {
  const belirtec = await postaErisimBelirteci(girdi.organizationId);
  if (typeof belirtec !== "string") return belirtec;

  const logo = await imzaLogosu(girdi.logoAdresi);
  const ham = yeniMesajiKur({
    gonderenAd: girdi.gonderenAd,
    gonderenAdres: girdi.kutuAdresi,
    alicilar: girdi.alicilar,
    cc: girdi.cc,
    konu: girdi.konu,
    govde: imzaliGovde(girdi.govde, girdi.imza, girdi.gonderenPersonel),
    html: htmlGovdesi({
      govde: girdi.govde,
      gonderenAdi: girdi.gonderenPersonel,
      imza: girdi.imza,
      logoSrc: logo ? `cid:${logo.gomulu.kimlik}` : null,
      logoAlt: girdi.gonderenAd,
      logoOlculeri: logo?.olculeri ?? null,
      renk: girdi.markaRengi,
    }),
    ekler: girdi.ekler,
    gomulu: logo ? [logo.gomulu] : undefined,
    sinir: mesajSiniri(),
  });

  const yanit = await fetch(`${GMAIL}/messages/send`, {
    method: "POST",
    headers: { authorization: `Bearer ${belirtec}`, "content-type": "application/json" },
    body: JSON.stringify({ raw: base64UrlKodla(ham) }),
  }).catch(() => null);
  if (!yanit) return { hata: "Gmail'e ulaşılamadı; posta gönderilemedi." };

  const govde = await yanit.json().catch(() => ({}));
  if (!yanit.ok) {
    const sebep = (govde as { error?: { message?: string } })?.error?.message ?? `HTTP ${yanit.status}`;
    return { hata: `Posta gönderilemedi: ${sebep}` };
  }
  const { id: messageId, threadId } = govde as { id?: string; threadId?: string };
  if (!messageId || !threadId) return { hata: "Gmail postayı kabul etti ama mesaj kimliği dönmedi." };

  const admin = createAdminClient();
  if (!admin) return { hata: "Sunucu anahtarı tanımlı değil; gönderildi ama kaydedilemedi." };

  const simdi = new Date().toISOString();
  const alici = [...girdi.alicilar, ...(girdi.cc ?? [])].join(", ");
  /*
    Gönderilen mesaj HEMEN yazılıyor; eşitlemeyi beklemek, personelin
    az önce yazdığı postayı listede görememesi ve "gitti mi?" diye
    ikinci kez göndermesi demekti.
  */
  const { error: mesajHatasi } = await admin.from("mail_messages").upsert({
    organization_id: girdi.organizationId,
    message_id: messageId,
    thread_id: threadId,
    gonderen_ad: girdi.gonderenAd,
    gonderen_adres: girdi.kutuAdresi,
    alici,
    konu: girdi.konu,
    ozet: girdi.govde.slice(0, 200),
    tarih: simdi,
    yon: "giden",
    ekli_dosya: Boolean(girdi.ekler?.length),
  }, { onConflict: "organization_id,message_id" });
  if (mesajHatasi) return { hata: "Posta gönderildi ama kaydedilemedi: " + mesajHatasi.message };

  const { error: konusmaHatasi } = await admin.from("mail_threads").upsert({
    organization_id: girdi.organizationId,
    thread_id: threadId,
    konu: girdi.konu,
    son_gonderen_ad: girdi.gonderenAd,
    son_gonderen_adres: girdi.kutuAdresi,
    son_mesaj_at: simdi,
    ozet: girdi.govde.slice(0, 200),
    mesaj_sayisi: 1,
    okunmamis: false,
    durum: "yanitlandi",
    /* Bizim başlattığımız yazışma: yalnızca Gönderilenler'de. Sütunun
       varsayılanı gelen_var=true olduğu için eskiden yeni posta "Gelen
       kutusu"nda görünüyor, Gönderilenler'de görünmüyordu. */
    gelen_var: false,
    giden_var: true,
    opportunity_id: girdi.opportunityId ?? null,
    updated_at: simdi,
  }, { onConflict: "organization_id,thread_id" });
  if (konusmaHatasi) return { hata: "Posta gönderildi ama konuşma kaydedilemedi: " + konusmaHatasi.message };

  return { threadId };
}

/**
 * Konuşmayı Gmail'in ÇÖP KUTUSUNA taşır ve bizde ÇÖPTE işaretler.
 *
 * Kalıcı silme bilerek yok: yanlışlıkla silinen bir müşteri yazışması
 * geri alınabilmeli. Eşitleme çöptekini kendiliğinden geri getirmiyor —
 * Gmail'in liste ucu çöp ve spam'i varsayılan olarak dışarıda bırakıyor,
 * mesajlar da etiketlerine bakılarak eleniyor.
 *
 * Eskiden satırlar siliniyordu; panelde Çöp kutusu da geri alma da yoktu,
 * kullanıcı Gmail'e geçmek zorundaydı. Satır artık duruyor, yalnızca
 * işaretleniyor: mesaj gövdeleri de yerinde kalıyor, çöpteki yazışma
 * okunabiliyor.
 *
 * Önce Gmail, sonra bizim satır: ters sırada olsaydı Gmail çağrısı
 * düştüğünde konuşma panelden kaybolur ama kutuda durmaya devam ederdi —
 * kullanıcı "sildim, geri geldi" ile kalırdı.
 */
export async function postaKonusmasiniCopeAt(
  organizationId: string,
  threadId: string,
  silenUserId: string | null,
): Promise<{ hata: string } | null> {
  const belirtec = await postaErisimBelirteci(organizationId);
  if (typeof belirtec !== "string") return belirtec;

  const yanit = await fetch(`${GMAIL}/threads/${encodeURIComponent(threadId)}/trash`, {
    method: "POST",
    headers: { authorization: `Bearer ${belirtec}`, "content-length": "0" },
  }).catch(() => null);
  if (!yanit) return { hata: "Gmail'e ulaşılamadı; yazışma silinmedi." };
  if (!yanit.ok) {
    const govde = await yanit.json().catch(() => ({}));
    const sebep = (govde as { error?: { message?: string } })?.error?.message ?? `HTTP ${yanit.status}`;
    return { hata: `Yazışma Gmail'de silinemedi: ${sebep}` };
  }

  const admin = createAdminClient();
  if (!admin) return { hata: "Sunucu anahtarı tanımlı değil." };
  /* Konuşma satırı duruyor, yalnızca işaretleniyor (çöp kutusu). Yarım
     kalmış cevap siliniyor: çöpe atılan yazışmaya yazılmış bir taslak
     Taslaklar'da yanıtlanamayan bir konuşmaya bağlantı olarak kalıyordu.

     Hatalar okunuyor. Eskiden sonuç bakılmadan "çöp kutusuna taşındı"
     deniyordu; bizim yazma düşerse yazışma kutuda duruyormuş gibi
     görünüyor ama Gmail'de çöpte oluyordu. */
  const { error: taslakHatasi } = await admin.from("mail_drafts").delete()
    .eq("organization_id", organizationId).eq("thread_id", threadId);
  if (taslakHatasi) return { hata: "Yazışma Gmail'de çöpe gitti ama taslağı silinemedi: " + taslakHatasi.message };
  const { error } = await admin.from("mail_threads")
    .update({ silindi_at: new Date().toISOString(), silen_user_id: silenUserId, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId).eq("thread_id", threadId);
  if (error) return { hata: "Yazışma Gmail'de çöpe gitti ama panelde işaretlenemedi: " + error.message };
  return null;
}

/**
 * Çöpteki konuşmayı geri alır: Gmail'de çöpten çıkarır, bizdeki işareti
 * kaldırır.
 *
 * Gmail'de de geri alınıyor çünkü yalnızca bizim işareti kaldırmak,
 * panelde duran ama kutuda çöpte olan bir yazışma bırakırdı: bir sonraki
 * eşitleme mesajlarını eleyip konuşmayı yine geride bırakırdı.
 */
export async function postaKonusmasiniGeriAl(
  organizationId: string,
  threadId: string,
): Promise<{ hata: string } | null> {
  const belirtec = await postaErisimBelirteci(organizationId);
  if (typeof belirtec !== "string") return belirtec;

  const yanit = await fetch(`${GMAIL}/threads/${threadId}/untrash`, {
    method: "POST",
    headers: { authorization: `Bearer ${belirtec}`, "content-length": "0" },
  }).catch(() => null);
  if (!yanit) return { hata: "Gmail'e ulaşılamadı; yazışma geri alınmadı." };
  if (!yanit.ok) {
    const govde = await yanit.json().catch(() => ({}));
    const sebep = (govde as { error?: { message?: string } })?.error?.message ?? `HTTP ${yanit.status}`;
    return { hata: `Yazışma Gmail'de geri alınamadı: ${sebep}` };
  }

  const admin = createAdminClient();
  if (!admin) return { hata: "Sunucu anahtarı tanımlı değil." };
  const { error } = await admin.from("mail_threads")
    .update({ silindi_at: null, silen_user_id: null, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId).eq("thread_id", threadId);
  if (error) return { hata: "Yazışma Gmail'de geri alındı ama panelde işaret kalktı sayılmadı: " + error.message };
  return null;
}

/*
  GÖVDEDE ARAMA — Gmail'in kendi arama ucu.

  Panelin araması kendi üst verimize bakıyor (konu, gönderen, özet):
  liste zaten oradan çiziliyor ve her tuşta Gmail'e gitmek bir ağ turu
  ve kota demekti. Ama "geçen ay şu müşteri şunu yazmıştı" sorusunun
  cevabı çoğu zaman GÖVDEDE ve özet ilk 100 karakteri geçmiyor.

  Çözüm, aramayı taşımak değil: kullanıcı sonuçları görüp bulamadığında
  AÇIKÇA "gövdede de ara" diyor ve yalnızca o zaman tek bir Gmail
  çağrısı yapılıyor. Dönen şey mesaj kimlikleri; listeyi yine kendi
  tablomuzdan çiziyoruz, çünkü ekibin ortak durumu (ilgilenen, durum,
  etiket, müşteri bağı) yalnızca bizde.

  Çöp ve spam dışarıda: panelin çöp kutusu kendi görünümü, arama
  sonucuna karışması silinmiş yazışmayı geri gelmiş gibi gösterirdi.
*/
export async function postaGovdesindeAra(
  organizationId: string,
  sorgu: string,
  sinir = 50,
): Promise<{ threadIdleri: string[] } | { hata: string }> {
  const belirtec = await postaErisimBelirteci(organizationId);
  if (typeof belirtec !== "string") return belirtec;

  const q = encodeURIComponent(gmailAramaSorgusu(sorgu));
  const sonuc = await gmailGetir(`/messages?q=${q}&maxResults=${sinir}`, belirtec);
  if ("hata" in sonuc) return sonuc;

  const mesajlar = (sonuc.govde as { messages?: { threadId?: string }[] }).messages ?? [];
  /* Sıra Gmail'in verdiği sıra (yeniden eskiye): aynı konuşmanın birden
     çok mesajı dönebiliyor, ilk görülen tutuluyor. */
  return { threadIdleri: [...new Set(mesajlar.map((mesaj) => mesaj.threadId).filter((id): id is string => Boolean(id)))] };
}

/**
 * Konuşmaya etiket uygular ya da kaldırır: önce Gmail, sonra bizdeki
 * kopya.
 *
 * Sıra önemli: bizden başlasaydık Gmail çağrısı düştüğünde panelde olan
 * ama kutuda olmayan bir etiket kalır ve bir sonraki eşitleme onu
 * sessizce silerdi — kullanıcı "etiketledim, kayboldu" ile kalırdı.
 *
 * Etiket mesaj değil KONUŞMA düzeyinde uygulanıyor (threads/modify):
 * kullanıcı yazışmayı etiketlediğini düşünüyor, zincirin tek mesajını
 * değil.
 */
export async function konusmaEtiketiniDegistir(
  organizationId: string,
  threadId: string,
  labelId: string,
  uygula: boolean,
): Promise<{ hata: string } | null> {
  const belirtec = await postaErisimBelirteci(organizationId);
  if (typeof belirtec !== "string") return belirtec;

  const yanit = await fetch(`${GMAIL}/threads/${threadId}/modify`, {
    method: "POST",
    headers: { authorization: `Bearer ${belirtec}`, "content-type": "application/json" },
    body: JSON.stringify(uygula ? { addLabelIds: [labelId] } : { removeLabelIds: [labelId] }),
  }).catch(() => null);
  if (!yanit) return { hata: "Gmail'e ulaşılamadı; etiket değişmedi." };
  if (!yanit.ok) {
    const govde = await yanit.json().catch(() => ({}));
    const sebep = (govde as { error?: { message?: string } })?.error?.message ?? `HTTP ${yanit.status}`;
    return { hata: `Etiket Gmail'de değiştirilemedi: ${sebep}` };
  }

  const admin = createAdminClient();
  if (!admin) return { hata: "Sunucu anahtarı tanımlı değil." };

  /* Mesaj satırları da güncelleniyor: konuşmanın etiketleri bir sonraki
     eşitlemede onların BİRLEŞİMİNDEN yeniden türetiliyor, yalnızca
     konuşmayı yazmak değişikliği ilk turda geri alırdı. */
  const { data: mesajlar } = await admin.from("mail_messages")
    .select("message_id,etiketler")
    .eq("organization_id", organizationId).eq("thread_id", threadId);
  for (const mesaj of (mesajlar ?? []) as { message_id: string; etiketler: string[] | null }[]) {
    const mevcut = new Set(mesaj.etiketler ?? []);
    if (uygula) mevcut.add(labelId);
    else mevcut.delete(labelId);
    await admin.from("mail_messages")
      .update({ etiketler: [...mevcut].sort() })
      .eq("organization_id", organizationId).eq("message_id", mesaj.message_id);
  }

  const { data: konusma } = await admin.from("mail_threads")
    .select("etiketler").eq("organization_id", organizationId).eq("thread_id", threadId).maybeSingle();
  const konusmaEtiketleri = new Set(((konusma?.etiketler as string[] | null) ?? []));
  if (uygula) konusmaEtiketleri.add(labelId);
  else konusmaEtiketleri.delete(labelId);
  const { error } = await admin.from("mail_threads")
    .update({ etiketler: [...konusmaEtiketleri].sort(), updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId).eq("thread_id", threadId);
  if (error) return { hata: "Etiket Gmail'de değişti ama panele yazılamadı: " + error.message };
  return null;
}

/**
 * Konuşmayı okunmadı yapar (Gmail'in UNREAD etiketi + yerel kopya).
 *
 * Ortak kutuda sık istenen şey: açtım ama ben halledemiyorum, listede
 * yeni gibi dursun ki biri görsün. İşaret önce GMAIL'e yazılıyor; yerel
 * kopyayla yetinmek, bir sonraki eşitlemede geri "okundu" olurdu —
 * kendini geri alan bir değişiklik.
 */
export async function konusmayiOkunmadiIsaretle(
  organizationId: string,
  threadId: string,
): Promise<{ hata: string } | null> {
  const belirtec = await postaErisimBelirteci(organizationId);
  if (typeof belirtec !== "string") return belirtec;

  const yanit = await fetch(`${GMAIL}/threads/${encodeURIComponent(threadId)}/modify`, {
    method: "POST",
    headers: { authorization: `Bearer ${belirtec}`, "content-type": "application/json" },
    body: JSON.stringify({ addLabelIds: ["UNREAD"] }),
  }).catch(() => null);
  if (!yanit) return { hata: "Gmail'e ulaşılamadı; işaretlenemedi." };
  if (!yanit.ok) {
    const govde = await yanit.json().catch(() => ({}));
    const sebep = (govde as { error?: { message?: string } })?.error?.message ?? `HTTP ${yanit.status}`;
    return { hata: `Okunmadı olarak işaretlenemedi: ${sebep}` };
  }

  const admin = createAdminClient();
  if (!admin) return { hata: "Sunucu anahtarı tanımlı değil." };
  const { error } = await admin.from("mail_threads")
    .update({ okunmamis: true, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("thread_id", threadId);
  return error ? { hata: "Gmail'de işaretlendi ama kayda yazılamadı: " + error.message } : null;
}
