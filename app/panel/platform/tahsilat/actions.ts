"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { runPanelAction } from "@/lib/panel-action";
import { kurusOku } from "@/lib/turkish-amount";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { aliciAdi, aliciOku, kalemleriOku, kdvDahilProforma, PROFORMA_URUNLERI, proformaToplami, VARSAYILAN_KDV_ORANI } from "@/lib/proforma";

/*
  PLATFORM FATURASI YÜKLEME (26.10.2026, migration 20261026191235).

  Fatura elle kesiliyor; kurucu PDF'i ilgili tahsilatın yanına yüklüyor.
  Müşteri (bireysel abone ya da kurum yöneticisi) onu ArvoLab'daki
  "Faturalar ve ödemeler" bölümünde görüyor.

  Yazma service_role ile, KURUCU denetiminden sonra: fatura müşteriye
  giden resmî belge; tablo ve depo istemciye kapalı. Yeniden yüklemek
  aynı ödemenin faturasını günceller (yanlış PDF'in düzeltilmesi); eski
  dosya silinir.
*/

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function faturaYukle__impl(formData: FormData) {
  const { isPlatformOwner, userId } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Fatura yalnızca platform kurucusu tarafından yüklenebilir.");

  const tur = String(formData.get("tur") ?? "");
  const odemeId = String(formData.get("odeme_id") ?? "");
  const faturaNo = String(formData.get("fatura_no") ?? "").trim().slice(0, 60);
  const faturaTarihi = String(formData.get("fatura_tarihi") ?? "").trim();
  const dosya = formData.get("dosya");

  if (tur !== "abone" && tur !== "kurum") throw new Error("Ödeme türü tanınmadı.");
  if (!UUID.test(odemeId)) throw new Error("Ödeme bulunamadı.");
  if (!faturaNo) throw new Error("Fatura numarasını yazın.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(faturaTarihi)) throw new Error("Fatura tarihini seçin.");
  if (!(dosya instanceof File) || dosya.size === 0) throw new Error("Fatura PDF'ini seçin.");
  if (dosya.type !== "application/pdf") throw new Error("Fatura PDF olmalıdır.");
  if (dosya.size > 10 * 1024 * 1024) throw new Error("Fatura dosyası 10 MB sınırını aşıyor.");

  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu yapılandırması eksik; fatura yüklenemedi.");

  // Ödeme gerçekten var mı ve (kurumdaysa) onaylı mı: onaylanmamış havaleye fatura kesilmez.
  const alan = tur === "abone" ? "subscriber_payment_id" : "payment_request_id";
  if (tur === "abone") {
    const { data, error } = await admin.from("subscriber_payments").select("id").eq("id", odemeId).maybeSingle();
    if (error || !data) throw new Error("Ödeme kaydı bulunamadı.");
  } else {
    const { data, error } = await admin.from("organization_payment_requests").select("id,status").eq("id", odemeId).maybeSingle();
    if (error || !data) throw new Error("Ödeme kaydı bulunamadı.");
    if (data.status !== "approved") throw new Error("Yalnızca onaylanmış ödemeye fatura yüklenebilir.");
  }

  const { data: onceki } = await admin.from("platform_faturalari").select("id,dosya_yolu").eq(alan, odemeId).maybeSingle();

  const yol = `${tur}/${odemeId}/${Date.now()}.pdf`;
  const { error: yuklemeHatasi } = await admin.storage.from("platform-faturalari").upload(yol, dosya, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (yuklemeHatasi) throw new Error(`Fatura yüklenemedi: ${yuklemeHatasi.message}`);

  const satir = {
    fatura_no: faturaNo,
    fatura_tarihi: faturaTarihi,
    dosya_yolu: yol,
    yukleyen: userId,
    updated_at: new Date().toISOString(),
  };
  const { error } = onceki
    ? await admin.from("platform_faturalari").update(satir).eq("id", onceki.id)
    : await admin.from("platform_faturalari").insert({ ...satir, [alan]: odemeId });
  if (error) {
    await admin.storage.from("platform-faturalari").remove([yol]);
    throw new Error(`Fatura kaydedilemedi: ${error.message}`);
  }
  // Eski PDF ancak yeni kayıt yazıldıktan sonra siliniyor: arada müşteri faturasız kalmasın.
  if (onceki?.dosya_yolu) await admin.storage.from("platform-faturalari").remove([onceki.dosya_yolu]);

  revalidatePath("/panel/platform/tahsilat");
}

export async function faturaYukle(...args: Parameters<typeof faturaYukle__impl>) {
  return runPanelAction(() => faturaYukle__impl(...args), "Fatura yüklendi; müşteri kendi panelinde (ArvoOS ya da ArvoLab) görebilir.");
}

/*
  PLATFORM PROFORMASI (27.10.2026, migration 20261027174258).

  Sıra: proforma → müşteri öder → tahsilat makbuzu → fatura. Proformayı
  kurucu burada hazırlıyor; müşteri ArvoLab'daki "Faturalar ve ödemeler"
  bölümünde görüp yazdırıyor. Ödeme bugünkü kanallardan (kart, havale)
  geliyor ve kurucu proformayı o ödemeyle EŞLİYOR. Eşleştirme ödeme
  kanallarının içine konmadı: PayTR bildirimi ve havale onayı lisans
  dönemini uzatıyor, proformayı oraya bağlamak aynı ödemenin dönemi iki
  kez uzatma riskini doğururdu.

  Toplamlar formdan alınmıyor, kalemlerden hesaplanıyor (lib/proforma).
*/

async function kurucuYoneticisi() {
  const { isPlatformOwner, userId } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Proforma yalnızca platform kurucusu tarafından düzenlenebilir.");
  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu yapılandırması eksik; proforma kaydedilemedi.");
  return { admin, userId };
}

async function proformaOlustur__impl(formData: FormData) {
  const { admin, userId } = await kurucuYoneticisi();

  // Müşteri "kurum:<id>" ya da "abone:<id>" olarak geliyor; tek seçim kutusu iki türü de taşıyor.
  const [tur, musteriId] = String(formData.get("musteri") ?? "").split(":");
  if ((tur !== "kurum" && tur !== "abone") || !UUID.test(musteriId ?? "")) throw new Error("Müşteriyi seçin.");

  /*
    ÜRÜN (28.10.2026). Eskiden sabit 'arvolab'tı: bir ArvoOS kurumuna
    kesilen proforma ArvoLab ürününe yazılıyor ve kurumun ArvoOS
    panelinde hiç görünmüyordu. Bireysel abone yalnızca ArvoLab'da var.
  */
  const urun = String(formData.get("urun") ?? "");
  if (!PROFORMA_URUNLERI.includes(urun as (typeof PROFORMA_URUNLERI)[number])) throw new Error("Ürünü seçin.");
  if (tur === "abone" && urun !== "arvolab") throw new Error("Bireysel aboneye yalnızca ArvoLab proforması kesilebilir.");

  if (tur === "kurum") {
    const { data, error } = await admin.from("organizations").select("id").eq("id", musteriId).maybeSingle();
    if (error || !data) throw new Error("Kurum bulunamadı.");
  } else {
    const { data, error } = await admin.from("product_subscribers").select("product").eq("id", musteriId).maybeSingle();
    if (error || !data) throw new Error("Abone bulunamadı.");
    if (data.product !== "arvolab") throw new Error("Proforma şimdilik yalnızca ArvoLab aboneleri için düzenlenebilir.");
  }

  const alici = aliciOku({
    adSoyad: String(formData.get("alici_ad_soyad") ?? ""),
    unvan: String(formData.get("alici_unvan") ?? ""),
    vergiDairesi: String(formData.get("alici_vergi_dairesi") ?? ""),
    vergiNo: String(formData.get("alici_vergi_no") ?? ""),
    adres: String(formData.get("alici_adres") ?? ""),
    eposta: String(formData.get("alici_eposta") ?? ""),
  }, tur);

  const satirlar = [0, 1, 2].map((i) => ({
    aciklama: String(formData.get(`aciklama_${i}`) ?? ""),
    miktar: String(formData.get(`miktar_${i}`) ?? ""),
    birimFiyat: String(formData.get(`birim_fiyat_${i}`) ?? ""),
  }));
  const okunan = kalemleriOku(satirlar, (d) => kurusOku(d));
  const kdvMetni = String(formData.get("kdv_orani") ?? "").trim();
  const kdvOrani = kdvMetni ? Number(kdvMetni.replace(",", ".")) : VARSAYILAN_KDV_ORANI;
  if (!Number.isFinite(kdvOrani) || kdvOrani < 0 || kdvOrani > 100) throw new Error("KDV oranı 0 ile 100 arasında olmalı.");
  // Liste fiyatları KDV dahil (lib/site/pricing.ts): kutuya yazılan tutar toplamın kendisi olabiliyor.
  const { kalemler, araToplam, kdv, toplam } = formData.get("kdv_dahil") === "1"
    ? kdvDahilProforma(okunan, kdvOrani)
    : { kalemler: okunan, ...proformaToplami(okunan, kdvOrani) };

  const bugun = todayInIstanbul();
  const gecerlilik = String(formData.get("gecerlilik_tarihi") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(gecerlilik)) throw new Error("Geçerlilik tarihini seçin.");
  if (gecerlilik < bugun) throw new Error("Geçerlilik tarihi bugünden önce olamaz.");
  const notlar = String(formData.get("notlar") ?? "").trim().slice(0, 1000) || null;

  const { error } = await admin.from("platform_proformalari").insert({
    product: urun,
    organization_id: tur === "kurum" ? musteriId : null,
    subscriber_id: tur === "abone" ? musteriId : null,
    musteri_adi: aliciAdi(alici).slice(0, 200),
    alici,
    kalemler,
    ara_toplam: araToplam,
    kdv_orani: kdvOrani,
    kdv,
    toplam,
    // Düzenleme günü Türkiye takvimiyle: veritabanının current_date'i UTC, gece 00–03 arası dünü yazardı.
    duzenleme_tarihi: bugun,
    gecerlilik_tarihi: gecerlilik,
    notlar,
    olusturan: userId,
  });
  if (error) throw new Error(`Proforma kaydedilemedi: ${error.message}`);

  /* Abonenin adı ArvoLab profilinde boşsa abone kaydı e-postayla kalıyordu
     ve konsolun her listesinde yalnızca e-posta görünüyordu. Proformada
     yazılan ad, boş olan yeri doldurur; dolu bir adın üstüne yazılmaz. */
  if (tur === "abone" && alici.adSoyad) {
    await admin.from("product_subscribers").update({ full_name: alici.adSoyad }).eq("id", musteriId).is("full_name", null);
  }
  revalidatePath("/panel/platform/tahsilat");
}

export async function proformaOlustur(...args: Parameters<typeof proformaOlustur__impl>) {
  return runPanelAction(() => proformaOlustur__impl(...args), "Proforma oluşturuldu; müşteri kendi panelinde görüp yazdırabilir.");
}

async function proformaIptal__impl(formData: FormData) {
  const { admin } = await kurucuYoneticisi();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) throw new Error("Proforma bulunamadı.");
  // Yalnızca bekleyen proforma iptal edilir: ödenmiş olanın ödemesi ve faturası ona bağlı.
  const { data, error } = await admin.from("platform_proformalari")
    .update({ durum: "iptal", updated_at: new Date().toISOString() })
    .eq("id", id).eq("durum", "bekliyor").select("id");
  if (error) throw new Error(`Proforma iptal edilemedi: ${error.message}`);
  if (!data?.length) throw new Error("Proforma bulunamadı ya da artık beklemede değil.");
  revalidatePath("/panel/platform/tahsilat");
}

export async function proformaIptal(...args: Parameters<typeof proformaIptal__impl>) {
  return runPanelAction(() => proformaIptal__impl(...args), "Proforma iptal edildi.");
}

async function proformaEsle__impl(formData: FormData) {
  const { admin } = await kurucuYoneticisi();
  const id = String(formData.get("id") ?? "");
  const odemeId = String(formData.get("odeme_id") ?? "");
  if (!UUID.test(id)) throw new Error("Proforma bulunamadı.");
  if (!UUID.test(odemeId)) throw new Error("Eşlenecek ödemeyi seçin.");

  const { data: proforma, error: okumaHatasi } = await admin.from("platform_proformalari")
    .select("id,durum,organization_id,subscriber_id,product").eq("id", id).maybeSingle();
  if (okumaHatasi || !proforma) throw new Error("Proforma bulunamadı.");
  if (proforma.durum !== "bekliyor") throw new Error("Yalnızca ödeme bekleyen proforma eşlenebilir.");

  /*
    Ödeme AYNI MÜŞTERİNİN olmalı: seçim kutusu yalnızca onları listeliyor
    ama form değeri istemciden geliyor. Kurumun ödemesi ayrıca onaylı ve
    proformanın ürününde olmalı (onaylanmamış havale tahsilat değil).
  */
  if (proforma.organization_id) {
    const { data, error } = await admin.from("organization_payment_requests").select("organization_id,status,product").eq("id", odemeId).maybeSingle();
    if (error || !data || data.organization_id !== proforma.organization_id) throw new Error("Ödeme bu kurumun değil.");
    if (data.status !== "approved") throw new Error("Yalnızca onaylanmış ödeme eşlenebilir.");
    if (data.product !== proforma.product) throw new Error("Ödeme başka bir ürün için yapılmış.");
  } else {
    const { data, error } = await admin.from("subscriber_payments").select("subscriber_id").eq("id", odemeId).maybeSingle();
    if (error || !data || data.subscriber_id !== proforma.subscriber_id) throw new Error("Ödeme bu abonenin değil.");
  }

  const alan = proforma.organization_id ? "payment_request_id" : "subscriber_payment_id";
  const { data, error } = await admin.from("platform_proformalari")
    .update({ durum: "odendi", [alan]: odemeId, odendi_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id).eq("durum", "bekliyor").select("id");
  if (error) {
    // Benzersizlik: bir ödeme yalnızca bir proformayı kapatır.
    if (/duplicate key|unique/i.test(error.message)) throw new Error("Bu ödeme zaten başka bir proformayla eşlenmiş.");
    throw new Error(`Proforma eşlenemedi: ${error.message}`);
  }
  if (!data?.length) throw new Error("Proforma artık beklemede değil.");
  revalidatePath("/panel/platform/tahsilat");
}

export async function proformaEsle(...args: Parameters<typeof proformaEsle__impl>) {
  return runPanelAction(() => proformaEsle__impl(...args), "Proforma ödemeyle eşlendi; müşteri ödendi olarak görür.");
}
