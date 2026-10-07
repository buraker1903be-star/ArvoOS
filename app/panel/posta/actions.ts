"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { runPanelAction } from "@/lib/panel-action";
import { assertYetki } from "@/lib/yetkiler";
import { postaDurumu } from "@/lib/posta-hesabi";
import { konusmayiOkunduYap, kurumPostasiniEsitle, postaYanitiGonder, postaYeniGonder } from "@/lib/posta-esitleme";
import { aliciListesi, ekBoyutuEngeli, yanitAlicisi, type EkDosya } from "@/lib/posta-gonderim";

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
    .select("message_id,gonderen_adres,konu,tarih,yon")
    .eq("organization_id", membership.organization_id)
    .eq("thread_id", threadId)
    .order("tarih", { ascending: true });
  if (error) throw new Error("Konuşma okunamadı: " + error.message);
  const mesajlar = (mesajVerisi ?? []) as { message_id: string; gonderen_adres: string | null; konu: string | null; tarih: string | null; yon: string }[];
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

  const sonuc = await postaYeniGonder({
    organizationId: membership.organization_id,
    kutuAdresi: hesap.adres,
    // Alıcının gördüğü ad kurumun adı: kutudan çıkan mesaj kurum adına gidiyor.
    gonderenAd: organization.display_name || organization.name,
    alicilar: aliciSonucu.adresler,
    konu,
    govde,
    opportunityId: firsat,
    ekler: await formdanEkler(formData),
  });
  if ("hata" in sonuc) throw new Error(sonuc.hata);

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
