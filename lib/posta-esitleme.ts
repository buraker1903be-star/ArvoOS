import { createAdminClient } from "@/lib/supabase/admin";
import { postaErisimBelirteci } from "@/lib/posta-hesabi";
import { konusmayiOzetle, mesajGovdesi, mesajiCoz, type CozulmusMesaj, type GmailMesaji } from "@/lib/posta-ayristirma";

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
/** Her turda bakılacak mesaj sayısı. 10 dakikalık turda fazlasıyla yeter. */
const PENCERE = 60;

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

/** Tek kurumun kutusunu eşitler. Hata metni döner, yoksa null. */
export async function kurumPostasiniEsitle(organizationId: string, kutuAdresi: string): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return "Sunucu anahtarı tanımlı değil.";

  const belirtec = await postaErisimBelirteci(organizationId);
  if (typeof belirtec !== "string") return belirtec.hata;

  const liste = await gmailGetir(`/messages?maxResults=${PENCERE}&labelIds=INBOX&labelIds=SENT`, belirtec);
  if ("hata" in liste) return liste.hata;

  const kimlikler = ((liste.govde as { messages?: { id?: string }[] }).messages ?? [])
    .map((satir) => satir.id)
    .filter((id): id is string => Boolean(id));
  if (!kimlikler.length) {
    await admin.from("mail_accounts")
      .update({ last_sync_at: new Date().toISOString(), last_error: null })
      .eq("organization_id", organizationId);
    return null;
  }

  /*
    Mesajlar tek tek okunuyor ama ÜST VERİ biçiminde (format=metadata):
    gövde indirilmiyor, yalnızca dört başlık. Gmail'in toplu ucu yok;
    60 küçük istek, kutunun tamamını gövdeleriyle çekmekten hem hızlı
    hem ucuz.
  */
  const cozulenler: CozulmusMesaj[] = [];
  for (const id of kimlikler) {
    const mesaj = await gmailGetir(
      `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject`,
      belirtec,
    );
    if ("hata" in mesaj) return mesaj.hata;
    const cozulen = mesajiCoz(mesaj.govde as GmailMesaji, kutuAdresi);
    if (cozulen) cozulenler.push(cozulen);
  }

  const { error: mesajHatasi } = await admin.from("mail_messages").upsert(
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
  if (mesajHatasi) return "Mesajlar yazılamadı: " + mesajHatasi.message;

  /*
    Konuşma satırı mesajlardan TÜRETİLİYOR, Gmail'in thread ucundan
    değil: pencerede olmayan eski mesajlar da sayıma girsin diye
    veritabanındaki tüm mesajlar okunuyor. Ortak durum (ilgilenen,
    durum) korunuyor — upsert yalnızca posta alanlarını yazıyor.
  */
  const threadIds = [...new Set(cozulenler.map((mesaj) => mesaj.threadId))];
  const { data: tumMesajlar, error: okumaHatasi } = await admin
    .from("mail_messages")
    .select("message_id,thread_id,gonderen_ad,gonderen_adres,alici,konu,ozet,tarih,yon,ekli_dosya")
    .eq("organization_id", organizationId)
    .in("thread_id", threadIds);
  if (okumaHatasi) return "Konuşmalar okunamadı: " + okumaHatasi.message;

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

  const { error: konusmaHatasi } = await admin.from("mail_threads")
    .upsert(satirlar, { onConflict: "organization_id,thread_id" });
  if (konusmaHatasi) return "Konuşmalar yazılamadı: " + konusmaHatasi.message;

  await admin.from("mail_accounts")
    .update({ last_sync_at: new Date().toISOString(), last_error: null })
    .eq("organization_id", organizationId);
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
