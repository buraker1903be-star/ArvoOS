import { GRAPH_VERSION, whatsappErrorMessage } from "@/lib/whatsapp-cloud";

/*
  WhatsApp medyası: Meta'dan indirme ve Meta'ya yükleme.

  Meta dosyanın kendisini bildirimle yollamıyor, yalnızca bir medya kimliği
  veriyor. Dosyaya ulaşmak iki adım:
    1. GET /<medya kimliği>        → geçici bir indirme adresi
    2. GET <o adres>               → dosyanın kendisi (Bearer başlığıyla)

  İkinci adres lookaside.fb.com'a bakıyor ve anahtar olmadan 401 veriyor;
  bu yüzden tarayıcıya verilemez, sunucunun indirmesi gerekir.

  KOPYA ŞART: Meta medyayı yaklaşık 30 gün sonra siliyor. Yalnızca kimliği
  saklamak, bir ay sonra açılmayan her dosyanın kaybolması demekti.
*/

/** Meta'nın kendi sınırları; aşan dosyayı ağa çıkmadan reddediyoruz. */
export const MEDYA_SINIRI: Record<string, number> = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
  sticker: 512 * 1024,
};

/**
 * Sunucunun tek seferde işleyeceği en büyük dosya.
 *
 * Meta belgede 100 MB'a izin veriyor ama dosya sunucu belleğinden geçiyor;
 * sınırsız bırakmak tek bir büyük belgede işlemi düşürürdü. Aşan dosya
 * kaybolmuyor: kaydı 'pending' kalıyor ve Meta'daki aslı 30 gün duruyor.
 */
export const INDIRME_SINIRI = 25 * 1024 * 1024;

const MIME_UZANTI: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "video/3gpp": "3gp",
  "audio/aac": "aac", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/amr": "amr", "audio/ogg": "ogg",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "txt", "text/csv": "csv",
};

/** Dosya adı üretmek için; tanınmayan türde "bin" — ad hiç olmamasından iyi. */
export function uzanti(mime: string | null | undefined, dosyaAdi?: string | null): string {
  const adUzantisi = (dosyaAdi ?? "").match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase();
  return MIME_UZANTI[(mime ?? "").toLowerCase()] ?? adUzantisi ?? "bin";
}

/** Ses ve görselde Meta ad vermiyor; kullanıcıya "dosya" demektense tür yazıyoruz. */
export function gorunenDosyaAdi(tur: string, mime: string | null, dosyaAdi: string | null): string {
  if (dosyaAdi?.trim()) return dosyaAdi.trim();
  const etiket: Record<string, string> = {
    image: "gorsel", video: "video", audio: "ses", voice: "sesli-mesaj",
    document: "belge", sticker: "cikartma",
  };
  return `${etiket[tur] ?? "dosya"}.${uzanti(mime)}`;
}

export type IndirilenMedya = {
  govde: Buffer;
  mime: string;
  boyut: number;
};

type Getir = typeof fetch;

/**
 * Meta'dan medyayı indirir.
 *
 * Hata fırlatmıyor, sebebi döndürüyor: gelen mesajın kendisi her hâlükârda
 * kaydedilmeli. Dosya inmese bile "müşteri bir görsel gönderdi" bilgisi
 * kaybolursa, karşı tarafta kimse bir şey olduğunu bilmez.
 */
export async function medyayiIndir(
  mediaId: string,
  token: string,
  getir: Getir = fetch,
): Promise<{ ok: true; medya: IndirilenMedya } | { ok: false; hata: string }> {
  let adres: string;
  let mime: string;
  let boyut: number;

  try {
    const yanit = await getir(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(mediaId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    const govde = (await yanit.json().catch(() => ({}))) as {
      url?: string; mime_type?: string; file_size?: number; error?: { code?: number; message?: string };
    };
    if (!yanit.ok || !govde.url) {
      return { ok: false, hata: whatsappErrorMessage(govde.error, yanit.status) };
    }
    adres = govde.url;
    mime = (govde.mime_type ?? "").split(";")[0].trim() || "application/octet-stream";
    boyut = Number(govde.file_size ?? 0);
  } catch {
    return { ok: false, hata: "Meta'nın medya adresine ulaşılamadı (zaman aşımı)." };
  }

  // Boyutu indirmeden önce biliyoruz; büyük dosyayı belleğe almıyoruz.
  if (boyut > INDIRME_SINIRI) {
    return { ok: false, hata: `Dosya çok büyük (${Math.round(boyut / 1024 / 1024)} MB); panelde gösterilemiyor.` };
  }

  try {
    /*
      İkinci istek lookaside.fb.com'a gidiyor ve Bearer başlığı olmadan 401
      veriyor — bu yüzden adres tarayıcıya verilemez, sunucu indirmeli.
    */
    const dosya = await getir(adres, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!dosya.ok) return { ok: false, hata: `Dosya indirilemedi (HTTP ${dosya.status}).` };

    const buffer = Buffer.from(await dosya.arrayBuffer());
    if (buffer.length > INDIRME_SINIRI) {
      // file_size yanlış bildirilmiş olabilir; ikinci kapı.
      return { ok: false, hata: "Dosya çok büyük; panelde gösterilemiyor." };
    }
    return { ok: true, medya: { govde: buffer, mime, boyut: buffer.length } };
  } catch {
    return { ok: false, hata: "Dosya indirilemedi (zaman aşımı)." };
  }
}

/**
 * Dosyayı Meta'ya yükler ve medya kimliğini döndürür.
 *
 * Gönderimde iki yol vardı: dosyanın genel adresini vermek ya da önce
 * yüklemek. Adres vermek, dosyanın internete açık olmasını gerektirirdi;
 * bizim kovamız özel ve öyle kalmalı.
 */
export async function medyayiYukle(
  phoneNumberId: string,
  token: string,
  dosya: { govde: Buffer; mime: string; ad: string },
  getir: Getir = fetch,
): Promise<{ ok: true; mediaId: string } | { ok: false; hata: string }> {
  const form = new FormData();
  form.set("messaging_product", "whatsapp");
  form.set("type", dosya.mime);
  form.set("file", new Blob([new Uint8Array(dosya.govde)], { type: dosya.mime }), dosya.ad);

  try {
    const yanit = await getir(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    const govde = (await yanit.json().catch(() => ({}))) as { id?: string; error?: { code?: number; message?: string } };
    if (!yanit.ok || !govde.id) return { ok: false, hata: whatsappErrorMessage(govde.error, yanit.status) };
    return { ok: true, mediaId: govde.id };
  } catch {
    return { ok: false, hata: "Dosya Meta'ya yüklenemedi (zaman aşımı)." };
  }
}
