"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { flashError, flashSuccess, runPanelAction } from "@/lib/panel-action";
import { assertYetki } from "@/lib/yetkiler";
import { gonderenPersonelAdi } from "@/lib/posta-gonderen";
import { postaDurumu, postaImzasiniKaydet } from "@/lib/posta-hesabi";
import { konusmaEtiketiniDegistir, konusmayiOkunduYap, konusmayiOkunmadiIsaretle, kurumPostasiniEsitle, postaEkiniGetir, postaGovdesiniGetir, postaYanitiGonder, postaYeniGonder, postaKonusmasiniCopeAt, postaKonusmasiniGeriAl } from "@/lib/posta-esitleme";
import { aliciListesi, ekBoyutuEngeli, yanitAlicisi, type EkDosya } from "@/lib/posta-gonderim";
import { topluSecim, topluSonucMetni } from "@/lib/posta-toplu";

/*
  ORTAK KUTUNUN ORTAK DURUMU.

  Gmail'in etiketleri "bu konuşmayla kim ilgileniyor" sorusunu
  modellemiyor; ortak kutuda ekibin asıl ihtiyacı bu. İki alan var:
  ilgilenen kişi ve durum (açık / yanıtlandı / kapalı).

  Yazma kullanıcının KENDİ oturumuyla yapılıyor (service_role değil):
  RLS konuşmanın kurumunu, tetikleyici de hangi sütunlara
  dokunulabileceğini denetlesin diye. Posta alanları (konu, gönderen,
  tarih) Gmail'den geliyor ve panelden değiştirilemiyor.
*/

const DURUMLAR = new Set(["acik", "yanitlandi", "kapali"]);

/** Formdaki Cc alanı. Boşsa boş dizi; geçersiz adres hata olarak döner. */
function ccListesi(formData: FormData): string[] {
  const metin = String(formData.get("cc") ?? "").trim();
  if (!metin) return [];
  const sonuc = aliciListesi(metin);
  if ("hata" in sonuc) throw new Error("Bilgi (Cc) alanı: " + sonuc.hata);
  return sonuc.adresler;
}

/*
  Formdan gelen dosyalar.

  Boyut sınırı gönderimden ÖNCE kontrol ediliyor: Gmail'in reddi
  kullanıcıya "Posta gönderilemedi: Request entity too large" diye
  dönüyor ve neyin büyük olduğunu söylemiyor. Burada hangi sınırın
  aşıldığı Türkçe yazılıyor.

  Boş dosya girişleri atılıyor: tarayıcı dosya seçilmemiş bir
  <input type="file"> için de boyutu sıfır bir File gönderiyor ve o,
  adsız boş bir ek olarak mesaja giriyordu.
*/
async function formdanEkler(formData: FormData): Promise<EkDosya[]> {
  const dosyalar = formData.getAll("ekler").filter((aday): aday is File => aday instanceof File && aday.size > 0);
  if (!dosyalar.length) return [];

  const engel = ekBoyutuEngeli(dosyalar.map((dosya) => ({ ad: dosya.name, boyut: dosya.size })));
  if (engel) throw new Error(engel);

  return Promise.all(dosyalar.map(async (dosya) => ({
    ad: dosya.name,
    tur: dosya.type || "application/octet-stream",
    veri: Buffer.from(await dosya.arrayBuffer()),
  })));
}

/*
  YÖNLENDİRİLEN MESAJIN EKLERİ.

  Ekler forma konmuyor, gönderimde Gmail'den yeniden çekiliyor: özgün
  dosyayı tarayıcıya indirip geri yüklemek birkaç megabaytı iki kez
  taşımak ve dosyanın içeriği için istemciye güvenmek olurdu.

  Mesajın bu kuruma ait olduğu önce KENDİ oturumuyla doğrulanıyor;
  ekleri çeken yol service_role ile çalışıyor ve RLS'i atlıyor.
*/
async function yonlendirilenEkler(
  supabase: Awaited<ReturnType<typeof getPanelContext>>["supabase"],
  organizationId: string,
  messageId: string,
): Promise<EkDosya[]> {
  const { data: mesaj, error } = await supabase
    .from("mail_messages").select("message_id")
    .eq("organization_id", organizationId).eq("message_id", messageId).maybeSingle();
  if (error) throw new Error("Yönlendirilen mesaj okunamadı: " + error.message);
  if (!mesaj) throw new Error("Yönlendirilen mesaj bulunamadı veya bu kayda erişiminiz yok.");

  const ozgun = await postaGovdesiniGetir(organizationId, messageId);
  if ("hata" in ozgun) throw new Error("Yönlendirilen mesaj Gmail'den okunamadı: " + ozgun.hata);
  if (!ozgun.ekler.length) return [];

  const engel = ekBoyutuEngeli(ozgun.ekler.map((ek) => ({ ad: ek.dosyaAdi, boyut: ek.boyut })));
  if (engel) throw new Error(`Özgün mesajın ekleri yönlendirilemiyor. ${engel}`);

  return Promise.all(ozgun.ekler.map(async (ek) => {
    const icerik = await postaEkiniGetir(organizationId, messageId, ek.ekId);
    if ("hata" in icerik) throw new Error(`"${ek.dosyaAdi}" eki alınamadı: ${icerik.hata}`);
    return { ad: icerik.dosyaAdi, tur: icerik.tur, veri: icerik.veri };
  }));
}

async function postaContext() {
  const context = await getPanelContext();
  assertYetki(context.yetkiler, "posta.yonet");
  return context;
}

async function konusmayiUstlen__impl(formData: FormData) {
  const { supabase, membership, userId } = await postaContext();
  const threadId = String(formData.get("thread_id") ?? "").trim();
  if (!threadId) throw new Error("Konuşma seçilmedi.");
  // "bosalt" = kimse ilgilenmiyor; konuşmayı havuza geri bırakmanın yolu.
  const hedef = String(formData.get("kime") ?? "") === "bosalt" ? null : userId;

  const { data, error } = await supabase.from("mail_threads")
    .update({ ilgilenen_user_id: hedef })
    .eq("organization_id", membership.organization_id)
    .eq("thread_id", threadId)
    .select("thread_id");
  if (error) throw new Error("Konuşma güncellenemedi: " + error.message);
  if (!data?.length) throw new Error("Konuşma bulunamadı veya bu kayda erişiminiz yok.");

  revalidatePath("/panel/posta");
  revalidatePath(`/panel/posta/${threadId}`);
}

async function konusmaDurumu__impl(formData: FormData) {
  const { supabase, membership } = await postaContext();
  const threadId = String(formData.get("thread_id") ?? "").trim();
  const durum = String(formData.get("durum") ?? "");
  if (!threadId) throw new Error("Konuşma seçilmedi.");
  if (!DURUMLAR.has(durum)) throw new Error("Geçersiz durum.");

  const { data, error } = await supabase.from("mail_threads")
    .update({ durum })
    .eq("organization_id", membership.organization_id)
    .eq("thread_id", threadId)
    .select("thread_id");
  if (error) throw new Error("Durum güncellenemedi: " + error.message);
  if (!data?.length) throw new Error("Konuşma bulunamadı veya bu kayda erişiminiz yok.");

  revalidatePath("/panel/posta");
  revalidatePath(`/panel/posta/${threadId}`);
}

export async function konusmayiUstlen(...args: Parameters<typeof konusmayiUstlen__impl>) {
  return runPanelAction(() => konusmayiUstlen__impl(...args), "Konuşma güncellendi");
}

export async function konusmaDurumu(...args: Parameters<typeof konusmaDurumu__impl>) {
  return runPanelAction(() => konusmaDurumu__impl(...args), "Durum güncellendi");
}

/*
  YANIT.

  Kutudan çıkan mesaj kurumun kimliğiyle gidiyor; bu yüzden gönderme
  yetkisi ayrı bir anahtar (posta.yanitla). Varsayılanı herkes: ortak
  kutunun amacı zaten ekibin cevap vermesi, dar varsayılan özelliği
  kullanılamaz yapardı. Kısıtlamak isteyen kurum rol ya da kişi düzeyinde
  kapatır.
*/
async function konusmayaYanitla__impl(formData: FormData) {
  const context = await getPanelContext();
  assertYetki(context.yetkiler, "posta.yanitla");
  const { supabase, membership, organization } = context;

  const threadId = String(formData.get("thread_id") ?? "").trim();
  const govde = String(formData.get("govde") ?? "").trim();
  if (!threadId) throw new Error("Konuşma seçilmedi.");
  if (govde.length < 2) throw new Error("Yanıt metni boş olamaz.");
  if (govde.length > 20000) throw new Error("Yanıt metni çok uzun (en fazla 20.000 karakter).");

  const { data: mesajVerisi, error } = await supabase
    .from("mail_messages")
    .select("message_id,gonderen_ad,gonderen_adres,alici,konu,tarih,yon")
    .eq("organization_id", membership.organization_id)
    .eq("thread_id", threadId)
    .order("tarih", { ascending: true });
  if (error) throw new Error("Konuşma okunamadı: " + error.message);
  const mesajlar = (mesajVerisi ?? []) as { message_id: string; gonderen_ad: string | null; gonderen_adres: string | null; alici: string | null; konu: string | null; tarih: string | null; yon: string }[];
  if (!mesajlar.length) throw new Error("Konuşma bulunamadı veya bu kayda erişiminiz yok.");

  const alici = yanitAlicisi(mesajlar.map((mesaj) => ({
    gonderenAdres: mesaj.gonderen_adres,
    yon: mesaj.yon,
    tarih: mesaj.tarih ? new Date(mesaj.tarih) : null,
  })));
  if (!alici) throw new Error("Bu konuşmada yanıtlanacak bir gönderen yok.");

  const hesap = await postaDurumu(membership.organization_id);
  if (hesap.durum !== "bagli" || !hesap.adres) throw new Error("Ortak posta kutusu bağlı değil.");

  const ekler = await formdanEkler(formData);

  /* Cc isteğe bağlı; boşsa hiç başlık yazılmıyor. Geçersiz adres sessizce
     atılmıyor — kullanıcı gittiğini sanır. */
  const ccMetni = String(formData.get("cc") ?? "").trim();
  let cc: string[] = [];
  if (ccMetni) {
    const ccSonucu = aliciListesi(ccMetni);
    if ("hata" in ccSonucu) throw new Error("Bilgi (Cc) alanı: " + ccSonucu.hata);
    cc = ccSonucu.adresler;
  }

  /* Alıntı varsayılan AÇIK (kutucuk işaretli gelir): yanıt tek başına
     gidince müşteri neye cevap verildiğini çoğu zaman anlamıyor.

     İşaretsiz kutucuk formda HİÇ gönderilmiyor. Eskiden yokluk "on"
     sayılıyordu (?? "on") ve kutucuğu kaldırmak alıntıyı kapatmıyordu.

     Alıntılanan, müşterinin son mesajı; gövdesi de ONDAN okunuyor
     (mesajId), zincirin son mesajından değil. */
  const sonGelen = [...mesajlar].reverse().find((mesaj) => mesaj.yon === "gelen");
  const alinti = formData.get("alinti") === "on" && sonGelen
    ? { mesajId: sonGelen.message_id, gonderenAd: sonGelen.gonderen_ad ?? null, gonderenAdres: sonGelen.gonderen_adres ?? "", tarih: sonGelen.tarih ? new Date(sonGelen.tarih) : null }
    : null;

  const sonuc = await postaYanitiGonder({
    organizationId: membership.organization_id,
    kutuAdresi: hesap.adres,
    // Alıcının gördüğü ad kurumun adı: ortak kutudan çıkan mesaj kurumun adına gidiyor.
    gonderenAd: organization.display_name || organization.name,
    threadId,
    sonMesajId: mesajlar[mesajlar.length - 1].message_id,
    alici,
    konu: mesajlar.find((mesaj) => mesaj.konu)?.konu ?? "",
    govde,
    ekler,
    imza: hesap.imza,
    gonderenPersonel: await gonderenPersonelAdi(context.supabase, membership.organization_id, context.userId),
    /* HTML imza: kurumun logosu ve marka rengi. Logoyu gönderim anında
       sunucu indirip mesajın içine gömüyor. */
    logoAdresi: organization.logo_url,
    markaRengi: organization.brand_color,
    cc,
    alinti,
  });
  if ("hata" in sonuc) throw new Error(sonuc.hata);

  /*
    Yanıt gidince konuşma "yanıtlandı" oluyor. Elle işaretlemeyi beklemek,
    ortak kutuda aynı müşteriye iki kişinin cevap yazmasına yol açıyor —
    listede hâlâ "Açık" görünüyor.
  */
  await supabase.from("mail_threads")
    .update({ durum: "yanitlandi" })
    .eq("organization_id", membership.organization_id)
    .eq("thread_id", threadId);

  /* Gönderilen taslak duruyorsa listede yarım bir cevap gibi görünür ve
     biri onu yeniden gönderir. */
  await supabase.from("mail_drafts").delete()
    .eq("organization_id", membership.organization_id).eq("thread_id", threadId);

  revalidatePath("/panel/posta");
  revalidatePath(`/panel/posta/${threadId}`);
}

export async function konusmayaYanitla(...args: Parameters<typeof konusmayaYanitla__impl>) {
  return runPanelAction(() => konusmayaYanitla__impl(...args), "Yanıt gönderildi");
}

/*
  CRM BAĞI.

  Ortak kutuya gelen posta çoğu zaman var olan bir müşteriye ait ama
  panelde iki ayrı yerde duruyordu: yazışma postada, kayıt CRM'de.
  Eşitleme gönderen adresi fırsatın iletişim adresiyle eşleşirse bağı
  kendiliğinden kuruyor; burası elle düzeltme yolu — eşleşmeyen ya da
  yanlış eşleşen konuşmalar için.
*/
async function konusmayiKayitBagla__impl(formData: FormData) {
  const { supabase, membership } = await postaContext();
  const threadId = String(formData.get("thread_id") ?? "").trim();
  const firsat = String(formData.get("opportunity_id") ?? "").trim();
  if (!threadId) throw new Error("Konuşma seçilmedi.");

  const { data, error } = await supabase.from("mail_threads")
    .update({ opportunity_id: firsat || null })
    .eq("organization_id", membership.organization_id)
    .eq("thread_id", threadId)
    .select("thread_id");
  if (error) throw new Error("Müşteri bağı güncellenemedi: " + error.message);
  if (!data?.length) throw new Error("Konuşma bulunamadı veya bu kayda erişiminiz yok.");

  revalidatePath("/panel/posta");
  revalidatePath(`/panel/posta/${threadId}`);
}

export async function konusmayiKayitBagla(...args: Parameters<typeof konusmayiKayitBagla__impl>) {
  return runPanelAction(() => konusmayiKayitBagla__impl(...args), "Müşteri bağı güncellendi");
}

/*
  OKUNDU İŞARETLEME.

  Kutuyu GÖREBİLEN herkes okundu yapabilir: okumak zaten yetkisi
  dahilinde ve "okundu" o okumanın kaydı. posta.yonet istemek,
  konuşmayı okuyan ama üstlenemeyen personelde sayacı kalıcı olarak
  şişik bırakırdı.

  Konuşma kullanıcının KENDİ oturumuyla okunuyor: kurum kapısını RLS
  tutsun, "başka kurumun konuşmasını okundu yap" denemesi veritabanında
  elensin.
*/
async function konusmayiOkundu__impl(formData: FormData) {
  const context = await getPanelContext();
  assertYetki(context.yetkiler, "posta.gor");
  const threadId = String(formData.get("thread_id") ?? "").trim();
  if (!threadId) throw new Error("Konuşma seçilmedi.");

  const { data: konusma, error } = await context.supabase.from("mail_threads")
    .select("thread_id,okunmamis")
    .eq("organization_id", context.membership.organization_id)
    .eq("thread_id", threadId)
    .maybeSingle();
  if (error) throw new Error("Konuşma okunamadı: " + error.message);
  if (!konusma) throw new Error("Konuşma bulunamadı veya bu kayda erişiminiz yok.");
  // Zaten okunmuşsa Gmail'e gitmiyoruz: her açılışta bir API çağrısı
  // demek olurdu ve hiçbir şeyi değiştirmezdi.
  if (!konusma.okunmamis) return;

  const hata = await konusmayiOkunduYap(context.membership.organization_id, threadId);
  if (hata) throw new Error(hata);

  /*
    Kabuk da yenileniyor ("layout"): okunmamış rozeti panel yerleşiminde,
    yani /panel/* sayfalarının tamamında duruyor. Yalnızca posta yollarını
    yenilemek, kişi başka bir modüle geçtiğinde eski sayıyı gösterirdi.
  */
  revalidatePath("/panel", "layout");
  revalidatePath(`/panel/posta/${threadId}`);
}

export async function konusmayiOkundu(...args: Parameters<typeof konusmayiOkundu__impl>) {
  return runPanelAction(() => konusmayiOkundu__impl(...args));
}

/*
  AÇIK SEKME KENDİ TURUNU TETİKLİYOR.

  Zamanlayıcı iki dakikada bir koşuyor, ama kutuya BAKAN kişi için iki
  dakika uzun: yanıt beklediği postanın geldiğini görmek için sayfayı
  elle yeniliyordu. Sekme açıkken dakikada bir bu eylem çağrılıyor
  (app/panel/posta/canli-yenileme.tsx).

  İKİ SINIR, ikisi de "açık sekme Gmail'i dövmesin" diye:

   - ALT SINIR: son eşitlemenin üstünden ASGARI_ARALIK geçmediyse tur
     atlanıyor. Sınır olmasaydı beş açık sekme beş ayrı tur demekti;
     kişi başına değil KURUM başına sayıyoruz, çünkü kutu ortak.
   - KİLİT: eşzamanlı çağrılar kurumPostasiniEsitle içinde eleniyor.

  Hata YUTULUYOR. Bu eylem kimsenin istediği bir iş değil, arka planda
  dönen bir tazeleme; Gmail bir turda erişilemezse ekrana hata atmak,
  kişinin yaptığı işin ortasına alakasız bir uyarı düşürürdü. Kalıcı
  hata zaten ayarlar ekranında ve bir sonraki zamanlayıcı turunda
  görünüyor.
*/
const ASGARI_ARALIK_MS = 30 * 1000;

async function kutuyuYenile__impl(): Promise<void> {
  const context = await getPanelContext();
  assertYetki(context.yetkiler, "posta.gor");

  const durum = await postaDurumu(context.membership.organization_id);
  if (durum.durum !== "bagli") return;
  if (durum.sonEsitleme && Date.now() - new Date(durum.sonEsitleme).getTime() < ASGARI_ARALIK_MS) return;
  if (!durum.adres) return;

  await kurumPostasiniEsitle(context.membership.organization_id, durum.adres);
  revalidatePath("/panel", "layout");
  revalidatePath("/panel/posta");
}

export async function kutuyuYenile() {
  try {
    await kutuyuYenile__impl();
  } catch {
    /* Bkz. yukarısı: arka plan tazelemesi ekrana hata düşürmemeli. */
  }
}

/*
  YENİ POSTA.

  Yanıtla aynı yetkiyi istiyor (posta.yanitla): ikisinde de kutudan
  kurumun kimliğiyle mesaj çıkıyor, aradaki fark yalnızca bir zincire
  bağlı olup olmaması. Ayrı bir anahtar, kuruma aynı kararı iki kez
  sordururdu.

  Gönderim BAŞARILIYSA konuşmaya yönlendiriliyor: yazdığı postayı
  listede arayan biri, gittiğinden emin olmak için kutuyu tarıyordu.
*/
async function yeniPostaGonder__impl(formData: FormData): Promise<string> {
  const context = await getPanelContext();
  assertYetki(context.yetkiler, "posta.yanitla");
  const { membership, organization } = context;

  const aliciSonucu = aliciListesi(String(formData.get("alici") ?? ""));
  if ("hata" in aliciSonucu) throw new Error(aliciSonucu.hata);

  const konu = String(formData.get("konu") ?? "").trim();
  const govde = String(formData.get("govde") ?? "").trim();
  if (konu.length < 2) throw new Error("Konu yazın.");
  if (konu.length > 300) throw new Error("Konu çok uzun (en fazla 300 karakter).");
  if (govde.length < 2) throw new Error("Mesaj metni boş olamaz.");
  if (govde.length > 20000) throw new Error("Mesaj metni çok uzun (en fazla 20.000 karakter).");

  const hesap = await postaDurumu(membership.organization_id);
  if (hesap.durum !== "bagli" || !hesap.adres) throw new Error("Ortak posta kutusu bağlı değil.");

  const firsat = String(formData.get("opportunity_id") ?? "").trim() || null;

  /* Yönlendirmede özgün ekler de gidiyor; sınır ikisinin TOPLAMINA
     bakıyor, yoksa 3 MB'lık bir eki 3 MB'lık bir yönlendirmeye
     ekleyince Gmail isteği reddederdi. */
  const yonlendirilenId = String(formData.get("yonlendir") ?? "").trim();
  const kullaniciEkleri = await formdanEkler(formData);
  const ozgunEkler = yonlendirilenId
    ? await yonlendirilenEkler(context.supabase, membership.organization_id, yonlendirilenId)
    : [];
  const ekler = [...ozgunEkler, ...kullaniciEkleri];
  const toplamEngel = ekBoyutuEngeli(ekler.map((ek) => ({ ad: ek.ad, boyut: ek.veri.length })));
  if (toplamEngel) throw new Error(toplamEngel);

  const sonuc = await postaYeniGonder({
    organizationId: membership.organization_id,
    kutuAdresi: hesap.adres,
    // Alıcının gördüğü ad kurumun adı: kutudan çıkan mesaj kurum adına gidiyor.
    gonderenAd: organization.display_name || organization.name,
    alicilar: aliciSonucu.adresler,
    konu,
    govde,
    opportunityId: firsat,
    ekler,
    imza: hesap.imza,
    gonderenPersonel: await gonderenPersonelAdi(context.supabase, membership.organization_id, context.userId),
    /* HTML imza: kurumun logosu ve marka rengi. Logoyu gönderim anında
       sunucu indirip mesajın içine gömüyor. */
    logoAdresi: organization.logo_url,
    markaRengi: organization.brand_color,
    cc: ccListesi(formData),
  });
  if ("hata" in sonuc) throw new Error(sonuc.hata);

  const taslakId = String(formData.get("taslak_id") ?? "").trim();
  if (taslakId) {
    await context.supabase.from("mail_drafts").delete()
      .eq("organization_id", membership.organization_id).eq("id", taslakId);
  }

  revalidatePath("/panel/posta");
  if (firsat) revalidatePath(`/panel/crm/requests/${firsat}`);
  return `/panel/posta/${sonuc.threadId}`;
}

export async function yeniPostaGonder(formData: FormData) {
  const hedef = await runPanelAction(() => yeniPostaGonder__impl(formData), "Posta gönderildi");
  /* Yönlendirme runPanelAction'ın DIŞINDA: redirect bir istisna
     fırlatarak çalışıyor ve sarmalayıcının içinde atılırsa hata gibi
     yakalanıp kullanıcıya "gönderilemedi" diye gösterilirdi. */
  if (typeof hedef === "string") redirect(hedef);
}

/*
  TOPLU İŞLEM.

  Ortak kutuda yığılan onlarca yazışmayı tek tek açıp işaretlemek
  kutunun kullanılmaz hâle geldiği noktaydı: "bunların hepsi reklam"
  demek için otuz kez tıklamak gerekiyordu.

  Her yazışma için AYRI bir Gmail çağrısı var (toplu uç yok), o yüzden
  sınır var ve kümeler hâlinde gidiliyor. Sınır söylenerek kesiliyor —
  sessizce ilk ellisini işlemek, kullanıcının işlendiğini sandığı
  yazışmaları geride bırakırdı.
*/
const TOPLU_KUME = 5;

/** Formdaki seçili yazışmalar; sınır ve tekilleştirme lib/posta-toplu.ts'te. */
function topluKimlikler(formData: FormData): string[] {
  return topluSecim(formData.getAll("secili").map((deger) => String(deger)));
}

/**
 * Seçilenlerin bu kuruma ait olduğunu KENDİ oturumuyla doğrular ve çöp
 * durumlarını döndürür. İşlemlerin kendisi service_role ile yapılıyor ve
 * o RLS'i atlıyor; sahiplik burada denetlenmezse adresten gelen kimlikle
 * başka kurumun yazışmasına dokunulabilirdi.
 */
async function topluKonusmalar(
  supabase: Awaited<ReturnType<typeof getPanelContext>>["supabase"],
  organizationId: string,
  kimlikler: readonly string[],
): Promise<{ thread_id: string; silindi_at: string | null; okunmamis: boolean }[]> {
  const { data, error } = await supabase.from("mail_threads")
    .select("thread_id,silindi_at,okunmamis")
    .eq("organization_id", organizationId)
    .in("thread_id", kimlikler);
  if (error) throw new Error("Yazışmalar okunamadı: " + error.message);
  const satirlar = (data ?? []) as { thread_id: string; silindi_at: string | null; okunmamis: boolean }[];
  if (satirlar.length !== kimlikler.length) {
    throw new Error("Seçilen yazışmalardan bazıları bulunamadı veya bu kayda erişiminiz yok.");
  }
  return satirlar;
}

/*
  Kümeler hâlinde yürütür ve SONUCU SÖYLER: bir yazışmada Gmail hata
  verince ötekiler yarıda kalmıyor, sonunda kaçının olduğu ve kaçının
  olmadığı yazılıyor. Eskiden tek tek işlemlerde ilk hata her şeyi
  durduruyordu; toplu işlemde bu, yarısı işlenmiş bir seçimi "başarısız"
  diye göstermek olurdu.
*/
async function topluYurut(
  kimlikler: readonly string[],
  isle: (threadId: string) => Promise<string | null>,
  basarili: (adet: number) => string,
): Promise<void> {
  const hatalar: string[] = [];
  let olan = 0;
  for (let i = 0; i < kimlikler.length; i += TOPLU_KUME) {
    const kume = kimlikler.slice(i, i + TOPLU_KUME);
    const sonuclar = await Promise.all(kume.map(async (threadId) => isle(threadId)));
    for (const sonuc of sonuclar) {
      if (sonuc) hatalar.push(sonuc);
      else olan += 1;
    }
  }

  revalidatePath("/panel/posta");
  revalidatePath("/panel", "layout");

  if (!olan) throw new Error(hatalar[0] ?? "Hiçbir yazışma işlenemedi.");
  const sonuc = topluSonucMetni({ toplam: kimlikler.length, olan, hatalar, basarili });
  if (sonuc.tur === "uyari") await flashError(sonuc.metin);
  else await flashSuccess(sonuc.metin);
}

async function topluOkundu__impl(formData: FormData) {
  const context = await getPanelContext();
  assertYetki(context.yetkiler, "posta.gor");
  const kimlikler = topluKimlikler(formData);
  const satirlar = await topluKonusmalar(context.supabase, context.membership.organization_id, kimlikler);
  /* Zaten okunmuş olana Gmail'e gitmiyoruz: elli yazışmalık bir seçimde
     hiçbir şeyi değiştirmeyen elli çağrı demekti. */
  const isaretlenecek = satirlar.filter((satir) => satir.okunmamis).map((satir) => satir.thread_id);
  if (!isaretlenecek.length) throw new Error("Seçilen yazışmaların hepsi zaten okundu.");
  await topluYurut(
    isaretlenecek,
    (threadId) => konusmayiOkunduYap(context.membership.organization_id, threadId),
    (adet) => `${adet} yazışma okundu olarak işaretlendi`,
  );
}

export async function topluOkundu(formData: FormData) {
  await runPanelAction(() => topluOkundu__impl(formData));
}

async function topluOkunmadi__impl(formData: FormData) {
  const context = await getPanelContext();
  assertYetki(context.yetkiler, "posta.gor");
  const kimlikler = topluKimlikler(formData);
  const satirlar = await topluKonusmalar(context.supabase, context.membership.organization_id, kimlikler);
  const isaretlenecek = satirlar.filter((satir) => !satir.okunmamis).map((satir) => satir.thread_id);
  if (!isaretlenecek.length) throw new Error("Seçilen yazışmaların hepsi zaten okunmamış.");
  await topluYurut(
    isaretlenecek,
    async (threadId) => (await konusmayiOkunmadiIsaretle(context.membership.organization_id, threadId))?.hata ?? null,
    (adet) => `${adet} yazışma okunmadı olarak işaretlendi`,
  );
}

export async function topluOkunmadi(formData: FormData) {
  await runPanelAction(() => topluOkunmadi__impl(formData));
}

async function topluCopeAt__impl(formData: FormData) {
  const context = await getPanelContext();
  assertYetki(context.yetkiler, "posta.sil");
  const kimlikler = topluKimlikler(formData);
  const satirlar = await topluKonusmalar(context.supabase, context.membership.organization_id, kimlikler);
  // Zaten çöpte olanı yeniden çöpe atmak Gmail'e boşuna gitmek olurdu.
  const atilacak = satirlar.filter((satir) => !satir.silindi_at).map((satir) => satir.thread_id);
  if (!atilacak.length) throw new Error("Seçilen yazışmalar zaten çöp kutusunda.");
  await topluYurut(
    atilacak,
    async (threadId) => (await postaKonusmasiniCopeAt(context.membership.organization_id, threadId, context.userId))?.hata ?? null,
    (adet) => `${adet} yazışma çöp kutusuna taşındı`,
  );
}

export async function topluCopeAt(formData: FormData) {
  await runPanelAction(() => topluCopeAt__impl(formData));
}

async function topluGeriAl__impl(formData: FormData) {
  const context = await getPanelContext();
  assertYetki(context.yetkiler, "posta.sil");
  const kimlikler = topluKimlikler(formData);
  const satirlar = await topluKonusmalar(context.supabase, context.membership.organization_id, kimlikler);
  const alinacak = satirlar.filter((satir) => satir.silindi_at).map((satir) => satir.thread_id);
  if (!alinacak.length) throw new Error("Seçilen yazışmalar zaten kutuda.");
  await topluYurut(
    alinacak,
    async (threadId) => (await postaKonusmasiniGeriAl(context.membership.organization_id, threadId))?.hata ?? null,
    (adet) => `${adet} yazışma gelen kutusuna geri alındı`,
  );
}

export async function topluGeriAl(formData: FormData) {
  await runPanelAction(() => topluGeriAl__impl(formData));
}

/*
  ETİKETLEME.

  Etiketler Gmail'de açılıyor, panelde yalnızca uygulanıyor: panelden
  etiket açmak iki tarafı hemen ayrıştırırdı (bizde olan, kutuda olmayan
  bir klasör). Yetki yanıtlamayla aynı (posta.yanitla): yazışmayı
  düzenleyebilen onu sınıflandırabilmeli de; ayrı bir yetenek anahtarı,
  kutuyu düzenleyen kişiye yarım bir yetki bırakırdı.
*/
async function konusmaEtiketi__impl(formData: FormData) {
  const context = await getPanelContext();
  assertYetki(context.yetkiler, "posta.yanitla");
  const { supabase, membership } = context;

  const threadId = String(formData.get("thread_id") ?? "").trim();
  const labelId = String(formData.get("etiket") ?? "").trim();
  const uygula = String(formData.get("uygula") ?? "") === "1";
  if (!threadId) throw new Error("Konuşma seçilmedi.");
  if (!labelId) throw new Error("Etiket seçilmedi.");

  /* Hem konuşmanın hem etiketin bu kuruma ait olduğu KENDİ oturumuyla
     doğrulanıyor; değiştirme service_role ile yapılıyor ve o RLS'i
     atlıyor. */
  const [{ data: konusma, error: konusmaHatasi }, { data: etiket, error: etiketHatasi }] = await Promise.all([
    supabase.from("mail_threads").select("thread_id,silindi_at")
      .eq("organization_id", membership.organization_id).eq("thread_id", threadId).maybeSingle(),
    supabase.from("mail_labels").select("label_id,ad")
      .eq("organization_id", membership.organization_id).eq("label_id", labelId).maybeSingle(),
  ]);
  if (konusmaHatasi) throw new Error("Konuşma okunamadı: " + konusmaHatasi.message);
  if (etiketHatasi) throw new Error("Etiket okunamadı: " + etiketHatasi.message);
  if (!konusma) throw new Error("Konuşma bulunamadı veya bu kayda erişiminiz yok.");
  if (!etiket) throw new Error("Etiket bulunamadı. Gmail'de silinmiş olabilir; kutu eşitlenince listeden düşer.");
  if (konusma.silindi_at) throw new Error("Çöpteki yazışma etiketlenemiyor; önce geri alın.");

  const sonuc = await konusmaEtiketiniDegistir(membership.organization_id, threadId, labelId, uygula);
  if (sonuc) throw new Error(sonuc.hata);

  await flashSuccess(uygula ? `"${etiket.ad}" etiketi eklendi` : `"${etiket.ad}" etiketi kaldırıldı`);
  revalidatePath("/panel/posta");
  revalidatePath(`/panel/posta/${threadId}`);
}

export async function konusmaEtiketi(formData: FormData) {
  await runPanelAction(() => konusmaEtiketi__impl(formData));
}

/*
  YAZIŞMAYI SİLME.

  Ayrı bir yetki (posta.sil) ve varsayılanı dar: okuma ve yanıtlama
  ekibin tamamında, silme yöneticide. Ortak kutuda bir yazışmayı silmek
  herkesi etkiliyor ve geri alma yolu panelde değil Gmail'de.

  Silinen yazışma Gmail'in ÇÖP KUTUSUNA gidiyor, kalıcı olarak
  silinmiyor: yanlışlıkla silinen bir müşteri yazışması geri
  alınabilmeli.
*/
async function konusmayiSil__impl(formData: FormData) {
  const context = await getPanelContext();
  assertYetki(context.yetkiler, "posta.sil");
  const { supabase, membership } = context;

  const threadId = String(formData.get("thread_id") ?? "").trim();
  if (!threadId) throw new Error("Konuşma seçilmedi.");

  /* Konuşmanın bu kuruma ait olduğu KENDİ oturumuyla doğrulanıyor; silme
     service_role ile yapılıyor ve o RLS'i atlıyor. */
  const { data: konusma, error } = await supabase
    .from("mail_threads")
    .select("thread_id,silindi_at")
    .eq("organization_id", membership.organization_id)
    .eq("thread_id", threadId)
    .maybeSingle();
  if (error) throw new Error("Konuşma okunamadı: " + error.message);
  if (!konusma) throw new Error("Konuşma bulunamadı veya bu kayda erişiminiz yok.");
  if (konusma.silindi_at) throw new Error("Bu yazışma zaten çöp kutusunda.");

  const sonuc = await postaKonusmasiniCopeAt(membership.organization_id, threadId, context.userId);
  if (sonuc) throw new Error(sonuc.hata);

  revalidatePath("/panel/posta");
  revalidatePath("/panel", "layout");
}

export async function konusmayiSil(formData: FormData) {
  await runPanelAction(() => konusmayiSil__impl(formData), "Yazışma çöp kutusuna taşındı");
  redirect("/panel/posta");
}

/*
  ÇÖPTEN GERİ ALMA.

  Silmeyle aynı yetki: yazışmayı çöpe atabilen geri de alabilmeli.
  Ayrı bir yetenek anahtarı, "sildim ama geri alamıyorum" durumunu
  üretirdi.
*/
async function konusmayiGeriAl__impl(formData: FormData) {
  const context = await getPanelContext();
  assertYetki(context.yetkiler, "posta.sil");
  const { supabase, membership } = context;

  const threadId = String(formData.get("thread_id") ?? "").trim();
  if (!threadId) throw new Error("Konuşma seçilmedi.");

  const { data: konusma, error } = await supabase
    .from("mail_threads")
    .select("thread_id,silindi_at")
    .eq("organization_id", membership.organization_id)
    .eq("thread_id", threadId)
    .maybeSingle();
  if (error) throw new Error("Konuşma okunamadı: " + error.message);
  if (!konusma) throw new Error("Konuşma bulunamadı veya bu kayda erişiminiz yok.");
  if (!konusma.silindi_at) throw new Error("Bu yazışma çöp kutusunda değil.");

  const sonuc = await postaKonusmasiniGeriAl(membership.organization_id, threadId);
  if (sonuc) throw new Error(sonuc.hata);

  revalidatePath("/panel/posta");
  revalidatePath("/panel", "layout");
}

export async function konusmayiGeriAl(formData: FormData) {
  /* Çöp listesinden geri alınca listeye, yazışmanın içinden geri alınca
     yazışmaya dönülüyor: ikisinde de kullanıcı baktığı yerde kalıyor. */
  const threadId = String(formData.get("thread_id") ?? "").trim();
  const listeden = String(formData.get("donus") ?? "") === "liste";
  await runPanelAction(() => konusmayiGeriAl__impl(formData), "Yazışma gelen kutusuna geri alındı");
  redirect(!listeden && threadId ? `/panel/posta/${threadId}` : "/panel/posta");
}

/*
  TASLAKLAR.

  Ortak kutuda yarım kalmış bir cevap, başlatanın değil EKİBİN: taslağı
  kim açarsa sürdürebiliyor. Kimin başlattığı yazılıyor ama erişimi
  kısıtlamıyor.

  Yanıt taslağında konuşma başına tek taslak var (veritabanında benzersiz
  indeks): aynı yazışmaya iki kişinin iki ayrı yarım cevap bırakması,
  ortak kutuda çakışmanın en sık biçimi.
*/
async function taslakKaydet__impl(formData: FormData): Promise<string> {
  const context = await getPanelContext();
  assertYetki(context.yetkiler, "posta.yanitla");
  const { supabase, membership, userId } = context;

  const threadId = String(formData.get("thread_id") ?? "").trim() || null;
  const govde = String(formData.get("govde") ?? "").trim();
  if (!govde) throw new Error("Taslak metni boş olamaz.");

  const satir = {
    organization_id: membership.organization_id,
    thread_id: threadId,
    alici: String(formData.get("alici") ?? "").trim() || null,
    /* Cc de saklanıyor; eskiden taslakta yalnızca alıcı/konu/metin vardı
       ve yazılan Cc taslak kaydedilince sessizce kayboluyordu. */
    cc: String(formData.get("cc") ?? "").trim().slice(0, 2000) || null,
    konu: String(formData.get("konu") ?? "").trim() || null,
    govde: govde.slice(0, 20000),
    opportunity_id: String(formData.get("opportunity_id") ?? "").trim() || null,
    olusturan: userId,
    updated_at: new Date().toISOString(),
  };

  if (threadId) {
    /* Konuşma taslağı: aynı konuşmanın taslağı varsa üzerine yazılıyor.
       onConflict yerine güncelle-yoksa-ekle, çünkü benzersiz indeks kısmi
       (thread_id dolu olanlar) ve upsert kısmi indeksi kullanamıyor.

       İki kişi aynı konuşmanın İLK taslağını aynı anda kaydederse ikisi
       de "yok" görüp ekliyor; ikincinin eklemesi benzersiz indekse
       çarpıyor (23505). Eskiden bu hata olarak dönüyor ve yazılan metin
       kayboluyordu; artık o durumda güncellemeye dönülüyor. */
    const guncelle = () => supabase.from("mail_drafts").update(satir)
      .eq("organization_id", membership.organization_id).eq("thread_id", threadId).select("id");
    let { data: guncellenen, error } = await guncelle();
    if (!error && !guncellenen?.length) {
      ({ error } = await supabase.from("mail_drafts").insert(satir));
      if (error?.code === "23505") ({ data: guncellenen, error } = await guncelle());
    }
    if (error) throw new Error("Taslak kaydedilemedi: " + error.message);
    revalidatePath(`/panel/posta/${threadId}`);
    revalidatePath("/panel/posta");
    return `/panel/posta/${threadId}`;
  }

  const kimlik = String(formData.get("taslak_id") ?? "").trim();
  if (kimlik) {
    const { error } = await supabase.from("mail_drafts").update(satir)
      .eq("organization_id", membership.organization_id).eq("id", kimlik);
    if (error) throw new Error("Taslak kaydedilemedi: " + error.message);
    return threadId ? `/panel/posta/${threadId}` : `/panel/posta/yeni?taslak=${kimlik}`;
  }

  const { data, error } = await supabase.from("mail_drafts").insert(satir).select("id").single();
  if (error) throw new Error("Taslak kaydedilemedi: " + error.message);
  revalidatePath("/panel/posta");
  return threadId ? `/panel/posta/${threadId}` : `/panel/posta/yeni?taslak=${data.id}`;
}

export async function taslakKaydet(formData: FormData) {
  /* Ekler taslakta saklanmıyor (dosya deposu yok). Eskiden seçilen
     dosyalar sessizce düşüyordu; artık bildirimde yazıyor. */
  const ekVar = formData.getAll("ekler").some((aday) => aday instanceof File && aday.size > 0);
  const hedef = await runPanelAction(() => taslakKaydet__impl(formData));
  if (typeof hedef === "string") await flashSuccess(ekVar ? "Taslak kaydedildi. Ekler taslakta saklanmaz; gönderirken yeniden ekleyin." : "Taslak kaydedildi");
  if (typeof hedef === "string") redirect(hedef);
}

async function taslakSil__impl(formData: FormData) {
  const context = await getPanelContext();
  assertYetki(context.yetkiler, "posta.yanitla");
  const kimlik = String(formData.get("taslak_id") ?? "").trim();
  if (!kimlik) throw new Error("Taslak seçilmedi.");
  const { error } = await context.supabase.from("mail_drafts").delete()
    .eq("organization_id", context.membership.organization_id).eq("id", kimlik);
  if (error) throw new Error("Taslak silinemedi: " + error.message);
  revalidatePath("/panel/posta");
}

export async function taslakSil(formData: FormData) {
  await runPanelAction(() => taslakSil__impl(formData), "Taslak silindi");
  redirect("/panel/posta?kutu=taslak");
}

/*
  KURUM İMZASI.

  İmza önce Ayarlar → Bağlantılar'daki posta kartındaydı ve kullanıcı onu
  bulamadı (08.10.2026). Haklı bir kaybolma: orası BAĞLANTI ayarı — Google
  anahtarları, yetkilendirme. İmza ise postayı yazarken düşünülen bir şey,
  yeri posta ekranı.

  Yetki posta.yonet: imza kurumun bütün giden postasını etkiliyor, yanıt
  yazabilen herkesin değiştirebilmesi gereken bir şey değil.
*/
async function postaImzasi__impl(formData: FormData) {
  const context = await getPanelContext();
  assertYetki(context.yetkiler, "posta.yonet");
  await postaImzasiniKaydet(context.membership.organization_id, String(formData.get("imza") ?? ""));
  revalidatePath("/panel/posta");
  revalidatePath("/panel/settings");
}

export async function postaImzasi(...args: Parameters<typeof postaImzasi__impl>) {
  return runPanelAction(() => postaImzasi__impl(...args), "İmza kaydedildi");
}

/*
  OKUNMADI OLARAK İŞARETLEME.

  Ortak kutuda sık istenen şey: açtım ama ben halledemiyorum, listede
  yeni gibi dursun ki biri görsün. Gmail'de de aynı kural — işaret
  Gmail'in UNREAD etiketine yazılıyor, yoksa bir sonraki eşitleme
  bizim satırı geri "okundu" yapardı.
*/
async function konusmayiOkunmadiYap__impl(formData: FormData) {
  const context = await getPanelContext();
  assertYetki(context.yetkiler, "posta.gor");
  const threadId = String(formData.get("thread_id") ?? "").trim();
  if (!threadId) throw new Error("Konuşma seçilmedi.");

  const { data: konusma, error } = await context.supabase
    .from("mail_threads").select("thread_id")
    .eq("organization_id", context.membership.organization_id).eq("thread_id", threadId).maybeSingle();
  if (error) throw new Error("Konuşma okunamadı: " + error.message);
  if (!konusma) throw new Error("Konuşma bulunamadı veya bu kayda erişiminiz yok.");

  const sonuc = await konusmayiOkunmadiIsaretle(context.membership.organization_id, threadId);
  if (sonuc) throw new Error(sonuc.hata);

  revalidatePath("/panel/posta");
  revalidatePath("/panel", "layout");
}

export async function konusmayiOkunmadiYap(formData: FormData) {
  await runPanelAction(() => konusmayiOkunmadiYap__impl(formData), "Okunmadı olarak işaretlendi");
  redirect("/panel/posta");
}
