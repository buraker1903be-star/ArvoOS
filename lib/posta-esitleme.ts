import { createAdminClient } from "@/lib/supabase/admin";
import { postaErisimBelirteci } from "@/lib/posta-hesabi";
import { konusmayiOzetle, mesajGovdesi, mesajiCoz, type CozulmusMesaj, type GmailMesaji } from "@/lib/posta-ayristirma";
import { base64UrlKodla, yanitKonusu, yanitMesajiKur } from "@/lib/posta-gonderim";

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
/** Her turda bakılacak YENİ mesaj sayısı. 10 dakikalık turda fazlasıyla yeter. */
const PENCERE = 60;
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
): Promise<{ cozulenler: CozulmusMesaj[] } | { hata: string }> {
  const cozulenler: CozulmusMesaj[] = [];
  for (let i = 0; i < kimlikler.length; i += KUME) {
    const kume = kimlikler.slice(i, i + KUME);
    const sonuclar = await Promise.all(kume.map((id) => gmailGetir(
      `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject`,
      belirtec,
    )));
    for (const sonuc of sonuclar) {
      if ("hata" in sonuc) return { hata: sonuc.hata };
      const cozulen = mesajiCoz(sonuc.govde as GmailMesaji, kutuAdresi);
      if (cozulen) cozulenler.push(cozulen);
    }
  }
  if (!cozulenler.length) return { cozulenler };

  const admin = createAdminClient();
  if (!admin) return { hata: "Sunucu anahtarı tanımlı değil." };

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
      ekli_dosya: mesaj.ekliDosya,
    })),
    { onConflict: "organization_id,message_id" },
  );
  if (error) return { hata: "Mesajlar yazılamadı: " + error.message };
  return { cozulenler };
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
    .select("message_id,thread_id,gonderen_ad,gonderen_adres,alici,konu,ozet,tarih,yon,ekli_dosya")
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

/** Tek kurumun kutusunu eşitler. Hata metni döner, yoksa null. */
export async function kurumPostasiniEsitle(organizationId: string, kutuAdresi: string): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return "Sunucu anahtarı tanımlı değil.";

  const belirtec = await postaErisimBelirteci(organizationId);
  if (typeof belirtec !== "string") return belirtec.hata;

  // ---------- 1) Yeni mesajlar ----------
  const liste = await gmailGetir(`/messages?maxResults=${PENCERE}&labelIds=INBOX&labelIds=SENT`, belirtec);
  if ("hata" in liste) return liste.hata;
  const yeniKimlikler = ((liste.govde as { messages?: { id?: string }[] }).messages ?? [])
    .map((satir) => satir.id)
    .filter((id): id is string => Boolean(id));

  const yeniSonuc = await mesajlariIsle(organizationId, kutuAdresi, yeniKimlikler, belirtec);
  if ("hata" in yeniSonuc) return yeniSonuc.hata;
  const konusmaHatasi = await konusmalariGuncelle(organizationId, yeniSonuc.cozulenler);
  if (konusmaHatasi) return konusmaHatasi;

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
  }).eq("organization_id", organizationId);
  return null;
}

/** Bağlı bütün kurumların kutusunu eşitler (zamanlayıcı). */
export async function postalariEsitle(): Promise<EsitlemeSonucu> {
  const admin = createAdminClient();
  if (!admin) return { durum: "basarisiz", kurum: 0, mesaj: 0, hatalar: ["Sunucu anahtarı tanımlı değil."] };

  const { data: hesaplar, error } = await admin
    .from("mail_accounts")
    .select("organization_id,email")
    .eq("status", "bagli");
  if (error) return { durum: "basarisiz", kurum: 0, mesaj: 0, hatalar: ["Posta hesapları okunamadı: " + error.message] };

  const hatalar: string[] = [];
  for (const hesap of hesaplar ?? []) {
    const hata = await kurumPostasiniEsitle(hesap.organization_id as string, hesap.email as string);
    if (hata) {
      hatalar.push(`${hesap.email}: ${hata}`);
      /* Hata hesabın üstüne yazılıyor: ayarlar ekranı sebebini gösteriyor.
         Sessizce atlamak, kutusu günlerdir güncellenmeyen kurumu hiçbir
         uyarı olmadan bırakırdı. */
      await admin.from("mail_accounts")
        .update({ last_error: hata, updated_at: new Date().toISOString() })
        .eq("organization_id", hesap.organization_id as string);
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
export async function postaGovdesiniGetir(organizationId: string, messageId: string): Promise<string | { hata: string }> {
  const belirtec = await postaErisimBelirteci(organizationId);
  if (typeof belirtec !== "string") return belirtec;
  const sonuc = await gmailGetir(`/messages/${messageId}?format=full`, belirtec);
  if ("hata" in sonuc) return sonuc;
  return mesajGovdesi((sonuc.govde as { payload?: unknown }).payload);
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

  const ham = yanitMesajiKur({
    gonderenAd: girdi.gonderenAd,
    gonderenAdres: girdi.kutuAdresi,
    alici: girdi.alici,
    konu: girdi.konu,
    govde: girdi.govde,
    sonMesajId: basliktanAl("message-id"),
    referanslar: basliktanAl("references"),
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
      ekli_dosya: false,
    }, { onConflict: "organization_id,message_id" });
  }

  return { messageId };
}
