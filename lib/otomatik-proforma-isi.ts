import type { createAdminClient } from "@/lib/supabase/admin";
import { satici } from "@/lib/faturalama-koprusu";
import { bireyselAylikUcret } from "@/lib/bireysel-ucret";
import { musteriMi } from "@/lib/kurum-turu";
import { paketAdi } from "@/lib/paket-adlari";
import { PLATFORM_HOST } from "@/lib/public-host";
import { PRODUCT_APPS } from "@/lib/site/routes";
import { kurucuyaBildir } from "@/lib/kurucu-bildirimi";
import { epostaGonder, type EpostaSonucu } from "@/lib/eposta-gonder";
import { arvolabClient } from "@/lib/arvolab";
import { otomatikYenilemeAcik } from "@/lib/paytr-kart-akisi";
import type { ProformaAlici } from "@/lib/proforma";
import {
  alicilariTopla, OTOMATIK_KDV_ORANI, otomatikKalemler, proformaBildirimi, proformaPostasi, proformaZamaniMi, sonrakiDonemSonu, turkiyeGunu,
  type OtomatikUrun,
} from "@/lib/otomatik-proforma";
import { EK_URUN_KODLARI } from "@/lib/products";

/*
  OTOMATİK PROFORMA İŞİ (29.10.2026). Karar ve metin saf modülde
  (lib/otomatik-proforma.ts); burada okuma, yazma ve gönderim.

  ALICI (kurum sahibinin tarifi):
   - ArvoOS ve ArvoCal: kurumun Kurum Sahibi (owner) rolündeki etkin üyeleri.
   - ArvoLab kurum lisansı: aynı, kurumun yetkilisi.
   - ArvoLab bireysel abone: abonenin kendisi.
  Aynı kişilere uygulama içi bildirim de gidiyor (proformayiUlastir →
  bildir); proformanın kendisi müşterinin Abonelik ve faturalama
  sayfasında zaten listeleniyor, çünkü o sayfa aynı tabloyu okuyor.
  Kurumda e-postası okunan sahip yoksa kurumun iletişim adresine gider:
  belge hiç gitmeyeceğine yetkili kutusuna gitsin. O da yoksa proforma
  kesilir, gönderilmez, konsol nedenini yazar.

  KAPSAM DIŞI:
   - Arvo'nun kendi kurumu ve grup markaları (ödeme yapmaz, lib/kurum-turu).
   - Otomatik yenilemesi açık abonelik: kartından çekim yapılacak birine
     ödeme belgesi göndermek "iki kez mi ödeyeceğim" sorusunu doğurur
     (abonelik hatırlatmasıyla aynı karar).
   - Aynı müşteriye aynı ürün için elle kesilmiş, süresi geçmemiş bekleyen
     proforma: kurucu zaten göndermiş.
   - Ücreti girilmemiş lisans: tutarsız proforma kesilmez; kurucuya tek
     bildirimle listelenir.
   - ArvoARC: proforma ürünleri arasında değil (lib/proforma).

  Okumalar bilerek SINIRSIZ: lisans tabloları kurum başına birkaç satır ve
  bir lisansı atlamak müşteriye belge gitmemesi demek.
*/
type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

type Aday = {
  tur: "kurum" | "abone";
  musteriId: string;
  urun: OtomatikUrun;
  donemSonu: string; // Türkiye günü
  aylikUcret: number | null;
  planCode: string | null;
  kullaniciLimiti?: number | null;
  ekKullaniciUcreti?: number | null;
};

export type OtomatikProformaSonucu = {
  aday: number;
  kesilen: string[];
  gonderilen: number;
  bildirilen: number;
  gonderilemeyen: { no: string; hata: string }[];
  atlanan: Record<string, number>;
  hatalar: string[];
};

export async function otomatikProformaKos(admin: Admin, bugun: string): Promise<OtomatikProformaSonucu> {
  const sonuc: OtomatikProformaSonucu = { aday: 0, kesilen: [], gonderilen: 0, bildirilen: 0, gonderilemeyen: [], atlanan: {}, hatalar: [] };
  const atla = (neden: string) => { sonuc.atlanan[neden] = (sonuc.atlanan[neden] ?? 0) + 1; };

  const [cekirdek, urunler, aboneler] = await Promise.all([
    admin.from("organization_licenses").select("organization_id,license_status,plan_code,monthly_fee,user_limit,extra_user_fee,current_period_end").eq("license_status", "active"),
    admin.from("organization_product_licenses").select("organization_id,product,status,plan_code,monthly_fee,current_period_end")/* Çekirdek dışı ürünlerin TAMAMI (lib/products · EK_URUN_KODLARI):
       elle yazılan liste ArvoARC'ı atlıyordu, yani o lisansın dönemi
       dolduğunda proforma hiç kesilmiyordu. */
    .eq("status", "active").in("product", [...EK_URUN_KODLARI]),
    // Kuruma geçmiş abone (kurum_id dolu) kurumun lisansıyla ödüyor; ona ayrıca bireysel proforma kesilmez (otomatik yenilemeyle aynı kural).
    admin.from("product_subscribers").select("id,product,status,current_period_end").eq("status", "active").eq("product", "arvolab").is("kurum_id", null),
  ]);
  const okumaHatasi = cekirdek.error ?? urunler.error ?? aboneler.error;
  if (okumaHatasi) throw new Error("Lisanslar okunamadı: " + okumaHatasi.message);

  const adaylar: Aday[] = [
    ...((cekirdek.data ?? []) as { organization_id: string; license_status: string; plan_code: string | null; monthly_fee: number | null; user_limit: number | null; extra_user_fee: number | null; current_period_end: string | null }[])
      .filter((l) => proformaZamaniMi({ durum: l.license_status, donemSonu: l.current_period_end }, bugun))
      .map((l) => ({ tur: "kurum" as const, musteriId: l.organization_id, urun: "arvoos" as const, donemSonu: turkiyeGunu(l.current_period_end!), aylikUcret: l.monthly_fee, planCode: l.plan_code, kullaniciLimiti: l.user_limit, ekKullaniciUcreti: l.extra_user_fee })),
    ...((urunler.data ?? []) as { organization_id: string; product: OtomatikUrun; status: string; plan_code: string | null; monthly_fee: number | null; current_period_end: string | null }[])
      .filter((l) => proformaZamaniMi({ durum: l.status, donemSonu: l.current_period_end }, bugun))
      .map((l) => ({ tur: "kurum" as const, musteriId: l.organization_id, urun: l.product, donemSonu: turkiyeGunu(l.current_period_end!), aylikUcret: l.monthly_fee, planCode: l.plan_code })),
    ...((aboneler.data ?? []) as { id: string; status: string; current_period_end: string | null }[])
      .filter((a) => proformaZamaniMi({ durum: a.status, donemSonu: a.current_period_end }, bugun))
      .map((a) => ({ tur: "abone" as const, musteriId: a.id, urun: "arvolab" as const, donemSonu: turkiyeGunu(a.current_period_end!), aylikUcret: null, planCode: null })),
  ];
  sonuc.aday = adaylar.length;

  if (adaylar.length) await adaylariKes(admin, bugun, adaylar, sonuc, atla);

  /* Bugün kesilenler ve dünden kalan gönderilmemişler (anahtar yoktu,
     sağlayıcı düştü). Süresi geçen proforma gönderilmez. */
  const { data: bekleyen, error: bekleyenHatasi } = await admin.from("platform_proformalari").select("id,proforma_no")
    .eq("otomatik", true).or("gonderildi_at.is.null,bildirildi_at.is.null").eq("durum", "bekliyor").gte("gecerlilik_tarihi", bugun)
    .order("created_at").limit(100);
  if (bekleyenHatasi) sonuc.hatalar.push("Gönderilecekler okunamadı: " + bekleyenHatasi.message);
  for (const p of (bekleyen ?? []) as { id: string; proforma_no: string }[]) {
    const u = await proformayiUlastir(admin, p.id, true);
    if (u.eposta?.ok) sonuc.gonderilen += 1;
    if (u.bildirim?.ok) sonuc.bildirilen += 1;
    const hata = [u.eposta && !u.eposta.ok ? u.eposta.hata : null, u.bildirim && !u.bildirim.ok ? u.bildirim.hata : null].filter(Boolean).join(" · ");
    if (hata) sonuc.gonderilemeyen.push({ no: p.proforma_no, hata });
  }

  if (sonuc.kesilen.length || sonuc.gonderilemeyen.length || sonuc.atlanan["ücret girilmemiş"]) {
    const parcalar = [
      sonuc.kesilen.length ? `${sonuc.kesilen.length} proforma kesildi (${sonuc.kesilen.slice(0, 5).join(", ")}${sonuc.kesilen.length > 5 ? "…" : ""})` : null,
      sonuc.gonderilen ? `${sonuc.gonderilen} e-posta gönderildi` : null,
      sonuc.bildirilen ? `${sonuc.bildirilen} müşteriye bildirim gitti` : null,
      sonuc.gonderilemeyen.length ? `${sonuc.gonderilemeyen.length} proforma gönderilemedi: ${sonuc.gonderilemeyen[0].hata}` : null,
      sonuc.atlanan["ücret girilmemiş"] ? `${sonuc.atlanan["ücret girilmemiş"]} lisansın aylık ücreti girilmemiş, proforma kesilmedi` : null,
    ].filter(Boolean);
    await kurucuyaBildir(admin, {
      kategori: "otomatik_proforma",
      anahtar: `otomatik-proforma:${bugun}`,
      baslik: sonuc.gonderilemeyen.length || sonuc.atlanan["ücret girilmemiş"] ? "Otomatik proforma: bakmanız gereken var" : "Otomatik proformalar gönderildi",
      metin: parcalar.join(" · "),
      adres: "/panel/platform/tahsilat?kanal=proforma",
      ek: { kesilen: sonuc.kesilen.length, gonderilen: sonuc.gonderilen, gonderilemeyen: sonuc.gonderilemeyen.length, uyari: Boolean(sonuc.gonderilemeyen.length || sonuc.atlanan["ücret girilmemiş"]) },
    });
  }
  return sonuc;
}

async function adaylariKes(admin: Admin, bugun: string, adaylar: Aday[], sonuc: OtomatikProformaSonucu, atla: (neden: string) => void) {
  const kurumIdleri = [...new Set(adaylar.filter((a) => a.tur === "kurum").map((a) => a.musteriId))];
  const aboneIdleri = adaylar.filter((a) => a.tur === "abone").map((a) => a.musteriId);
  const [kurumlar, sahipler, aboneler, otomatikler, elle] = await Promise.all([
    kurumIdleri.length
      ? admin.from("organizations").select("id,name,display_name,kind,grup_markasi,legal_name,legal_address,legal_district,legal_city,tax_office,tax_number,contact_email").in("id", kurumIdleri)
      : Promise.resolve({ data: [], error: null }),
    kurumIdleri.length
      ? admin.from("organization_memberships").select("organization_id,user_id").in("organization_id", kurumIdleri).eq("role", "owner").eq("is_active", true)
      : Promise.resolve({ data: [], error: null }),
    aboneIdleri.length
      ? admin.from("product_subscribers").select("id,email,full_name").in("id", aboneIdleri)
      : Promise.resolve({ data: [], error: null }),
    admin.from("paytr_otomatik_yenileme").select("organization_id,subscriber_id,product").eq("aktif", true),
    admin.from("platform_proformalari").select("organization_id,subscriber_id,product").eq("durum", "bekliyor").eq("otomatik", false).gte("gecerlilik_tarihi", bugun),
  ]);
  const hata = kurumlar.error ?? sahipler.error ?? aboneler.error ?? elle.error;
  if (hata) throw new Error("Proforma bilgileri okunamadı: " + hata.message);
  // Otomatik yenileme okunamazsa proforma yine kesilir: fazla belge, eksik belgeden iyi.
  if (otomatikler.error) sonuc.hatalar.push("Otomatik yenilemeler okunamadı: " + otomatikler.error.message);

  type Kurum = { id: string; name: string; display_name: string | null; kind: string | null; grup_markasi: boolean | null; legal_name: string | null; legal_address: string | null; legal_district: string | null; legal_city: string | null; tax_office: string | null; tax_number: string | null; contact_email: string | null };
  const kurum = new Map(((kurumlar.data ?? []) as Kurum[]).map((k) => [k.id, k]));
  const abone = new Map(((aboneler.data ?? []) as { id: string; email: string; full_name: string | null }[]).map((a) => [a.id, a]));
  const anahtar = (r: { organization_id: string | null; subscriber_id: string | null; product: string }) => `${r.organization_id ?? r.subscriber_id}:${r.product}`;
  // Otomatik yenileme kapalıyken (29.10.2026) eski bir "aktif" satır proformayı engellemez: kimsenin kartından çekilmiyor.
  const otomatikAcik = new Set(((otomatikYenilemeAcik() ? (otomatikler.data ?? []) : []) as { organization_id: string | null; subscriber_id: string | null; product: string }[]).map(anahtar));
  const elleBekleyen = new Set(((elle.data ?? []) as { organization_id: string | null; subscriber_id: string | null; product: string }[]).map(anahtar));

  // Kurum sahiplerinin adları (alıcıda muhatap); okunamazsa ad boş kalır.
  const sahipListesi = (sahipler.data ?? []) as { organization_id: string; user_id: string }[];
  const { data: profiller } = sahipListesi.length
    ? await admin.from("profiles").select("id,full_name").in("id", [...new Set(sahipListesi.map((s) => s.user_id))])
    // hata-tamam: sahip adı yalnızca belgedeki "Ad soyad"; okunamazsa boş kalır.
    : { data: [] as { id: string; full_name: string | null }[] };
  const profilAdi = new Map(((profiller ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]));
  const sahipAdi = new Map(sahipListesi.map((s) => [s.organization_id, profilAdi.get(s.user_id) ?? null]));

  let bireyselUcret: number | null | undefined;
  for (const a of adaylar) {
    const k = a.tur === "kurum" ? kurum.get(a.musteriId) : null;
    if (a.tur === "kurum" && (!k || !musteriMi(k))) { atla("kendi kurumumuz"); continue; }
    const kimlik = `${a.musteriId}:${a.urun}`;
    if (otomatikAcik.has(kimlik)) { atla("otomatik yenileme açık"); continue; }
    if (elleBekleyen.has(kimlik)) { atla("elle kesilmiş bekleyen proforma var"); continue; }

    let aylik = a.aylikUcret ? Number(a.aylikUcret) : null;
    let aktifKullanici = 0;
    if (a.tur === "abone") {
      if (bireyselUcret === undefined) bireyselUcret = (await bireyselAylikUcret(admin, "arvolab")).aylik;
      aylik = bireyselUcret;
    } else if (a.urun === "arvoos") {
      const { count, error } = await admin.from("organization_memberships").select("user_id", { count: "exact", head: true })
        .eq("organization_id", a.musteriId).eq("is_active", true);
      // Sayılamazsa kesilmiyor: eksik ek kullanıcıyla yanlış tutarlı resmî belge, hiç belgeden kötü.
      if (error) { sonuc.hatalar.push(`Kullanıcı sayısı okunamadı (${k?.display_name || k?.name}): ${error.message}`); continue; }
      aktifKullanici = count ?? 0;
    }
    if (!aylik || aylik <= 0) { atla("ücret girilmemiş"); continue; }

    const yeniSon = sonrakiDonemSonu(a.donemSonu);
    const { kalemler, araToplam, kdv, toplam } = otomatikKalemler({
      urun: a.urun, paketAdi: a.planCode ? paketAdi(a.planCode) : null, bireysel: a.tur === "abone", aylikUcret: aylik,
      donemBasi: a.donemSonu, donemSonu: yeniSon,
      aktifKullanici, kullaniciLimiti: a.kullaniciLimiti, ekKullaniciUcreti: a.ekKullaniciUcreti,
    });

    let alici: ProformaAlici;
    if (k) {
      const ilce = [k.legal_district, k.legal_city].filter(Boolean).join(" / ");
      alici = {
        unvan: k.legal_name || k.display_name || k.name, adSoyad: sahipAdi.get(k.id) ?? null, vergiDairesi: k.tax_office,
        // Elle kesilen proformadaki kuralın aynısı (lib/proforma aliciOku): rakamlar, 10 haneli VKN ya da 11 haneli TCKN.
        vergiNo: ((r) => (r.length === 10 || r.length === 11 ? r : null))((k.tax_number ?? "").replace(/\D/g, "")),
        adres: [k.legal_address, ilce].filter(Boolean).join(", ") || null, eposta: k.contact_email,
      };
    } else {
      const ab = abone.get(a.musteriId);
      if (!ab) { atla("abone bulunamadı"); continue; }
      alici = { unvan: null, adSoyad: ab.full_name, vergiDairesi: null, vergiNo: null, adres: null, eposta: ab.email };
    }

    const { data, error } = await admin.from("platform_proformalari").insert({
      product: a.urun,
      organization_id: a.tur === "kurum" ? a.musteriId : null,
      subscriber_id: a.tur === "abone" ? a.musteriId : null,
      musteri_adi: (alici.unvan || alici.adSoyad || alici.eposta || "Müşteri").slice(0, 200),
      alici,
      kalemler,
      ara_toplam: araToplam,
      kdv_orani: OTOMATIK_KDV_ORANI,
      kdv,
      toplam,
      duzenleme_tarihi: bugun,
      // Son ödeme günü dönemin bittiği gün: o güne kadar ödenirse dönem kesintisiz uzar.
      gecerlilik_tarihi: a.donemSonu,
      notlar: "Abonelik yenilemesi için otomatik düzenlendi.",
      otomatik: true,
      donem_sonu: a.donemSonu,
    }).select("proforma_no").maybeSingle();
    if (error) {
      // Aynı dönemin otomatik proforması zaten var (dünkü koşu ya da çakışan koşu): olağan.
      if (error.code === "23505") { atla("bu dönem için zaten kesilmiş"); continue; }
      sonuc.hatalar.push(`Proforma kesilemedi: ${error.message}`);
      continue;
    }
    if (data?.proforma_no) sonuc.kesilen.push(data.proforma_no as string);
  }
}

export type UlastirmaSonucu = {
  eposta: (EpostaSonucu & { alicilar: string[] }) | null;
  bildirim: { ok: true; adet: number } | { ok: false; hata: string } | null;
};

/**
 * Proformayı müşteriye ulaştırır: e-posta ve uygulama içi bildirim. Sonuç
 * proformaya yazılıyor (gonderildi_at / bildirildi_at). Otomatik iş de
 * konsoldaki "Müşteriye gönder" düğmesi de bunu çağırıyor: iki ayrı
 * gönderim kodu, iki ayrı alıcı kuralı demekti.
 *
 * `yalnizEksik`: iş yeniden denerken yalnızca henüz ulaşmamış kanalı
 * dener — e-posta gidip bildirim düştüyse müşteri e-postayı iki kez almaz.
 * Kurucunun düğmesi ikisini de yeniden gönderir.
 */
export async function proformayiUlastir(admin: Admin, id: string, yalnizEksik = false): Promise<UlastirmaSonucu> {
  const { data: p, error } = await admin.from("platform_proformalari")
    .select("id,proforma_no,product,organization_id,subscriber_id,toplam,para_birimi,gecerlilik_tarihi,durum,otomatik,gonderildi_at,bildirildi_at")
    .eq("id", id).maybeSingle();
  if (error || !p) return { eposta: { ok: false, hata: "Proforma bulunamadı.", alicilar: [] }, bildirim: null };
  if (p.durum !== "bekliyor") return { eposta: { ok: false, hata: "Yalnızca ödeme bekleyen proforma gönderilir.", alicilar: [] }, bildirim: null };

  const urun = p.product as OtomatikUrun;
  const ozet = { urun, proformaNo: p.proforma_no as string, toplam: Number(p.toplam), paraBirimi: (p.para_birimi as string) || "TRY", sonGun: p.gecerlilik_tarihi as string };

  /* Alıcılar: kurumda etkin Kurum Sahipleri (ArvoOS kimliği ve e-postası),
     bireyselde abone. */
  let sahipler: string[] = [];
  let epostalar: string[] = [];
  let muhatap: string | null = null;
  type Abone = { email: string; full_name: string | null; external_user_id: string };
  let abone: Abone | null = null;
  let okumaHatasi: string | null = null;
  if (p.organization_id) {
    const [{ data: kurum }, { data: uyeler, error: sahipHatasi }] = await Promise.all([
      // hata-tamam: kurum adı yalnızca selamlama ve yedek adres; okunamazsa "Merhaba," yazılır.
      admin.from("organizations").select("name,display_name,contact_email").eq("id", p.organization_id).maybeSingle(),
      admin.from("organization_memberships").select("user_id").eq("organization_id", p.organization_id).eq("role", "owner").eq("is_active", true),
    ]);
    if (sahipHatasi) okumaHatasi = "Kurum sahipleri okunamadı: " + sahipHatasi.message;
    sahipler = ((uyeler ?? []) as { user_id: string }[]).map((u) => u.user_id);
    epostalar = alicilariTopla(await Promise.all(sahipler.map(async (k) => (await admin.auth.admin.getUserById(k)).data.user?.email ?? null)));
    // Sahibin e-postası okunamadıysa kurumun iletişim adresi: belge hiç gitmeyeceğine yetkili kutusuna gitsin.
    if (!epostalar.length && !okumaHatasi) epostalar = alicilariTopla([kurum?.contact_email]);
    muhatap = kurum?.display_name || kurum?.name || null;
  } else if (p.subscriber_id) {
    const { data, error: aboneHatasi } = await admin.from("product_subscribers").select("email,full_name,external_user_id").eq("id", p.subscriber_id).maybeSingle();
    if (aboneHatasi) okumaHatasi = "Abone okunamadı: " + aboneHatasi.message;
    abone = (data as Abone | null) ?? null;
    epostalar = alicilariTopla([abone?.email]);
    muhatap = abone?.full_name || null;
  }

  const sonuc: UlastirmaSonucu = { eposta: null, bildirim: null };
  const guncelleme: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // ---- E-posta
  if (!yalnizEksik || !p.gonderildi_at) {
    let eposta: EpostaSonucu;
    if (okumaHatasi) eposta = { ok: false, hata: okumaHatasi };
    else {
      try {
        const s = await satici(admin);
        // hata-tamam: yanıt adresi yalnızca "Yanıtla"nın hedefi; okunamazsa noreply'a gider.
        const { data: platform } = await admin.from("organizations").select("contact_email").eq("slug", "arvo-os").maybeSingle();
        /* Kurum belgesini ArvoOS panelinde görüyor (ArvoLab kurum lisansı
           dahil: Abonelik ve faturalama bütün ürünlerin proformasını
           listeliyor); bireysel abone ArvoLab'da. */
        const adres = p.subscriber_id ? `${PRODUCT_APPS.arvolab.url}/dashboard/abonelik` : `https://${PLATFORM_HOST}/panel/billing/proforma/${p.id}`;
        const posta = proformaPostasi({ ...ozet, muhatap, adres, satici: s.unvan, otomatik: Boolean(p.otomatik), hesaplar: s.hesaplar.map((h) => ({ banka: h.banka, hesapSahibi: h.hesapSahibi, iban: h.iban })) });
        eposta = await epostaGonder({ kime: epostalar, konu: posta.konu, metin: posta.metin, html: posta.html, yanitAdresi: (platform as { contact_email?: string | null } | null)?.contact_email ?? null });
      } catch (h) {
        eposta = { ok: false, hata: h instanceof Error ? h.message : "Satıcı bilgisi okunamadı." };
      }
    }
    sonuc.eposta = { ...eposta, alicilar: epostalar };
    if (eposta.ok) Object.assign(guncelleme, { gonderildi_at: new Date().toISOString(), gonderilen: epostalar, gonderim_hatasi: null });
    else guncelleme.gonderim_hatasi = eposta.hata.slice(0, 500);
  }

  // ---- Uygulama içi bildirim
  if (!yalnizEksik || !p.bildirildi_at) {
    sonuc.bildirim = okumaHatasi ? { ok: false, hata: okumaHatasi } : await bildir(admin, p as { id: string; organization_id: string | null; product: string }, sahipler, abone, proformaBildirimi(ozet));
    if (sonuc.bildirim.ok) guncelleme.bildirildi_at = new Date().toISOString();
    else if (!sonuc.eposta || sonuc.eposta.ok) guncelleme.gonderim_hatasi = sonuc.bildirim.hata.slice(0, 500);
  }

  const { error: yazmaHatasi } = await admin.from("platform_proformalari").update(guncelleme).eq("id", id);
  if (yazmaHatasi) console.error("[proforma] ulaştırma sonucu yazılamadı", id, yazmaHatasi.message);
  return sonuc;
}

/*
  BİLDİRİM (kurum sahibinin tarifi: "bireysel abonelere ve kurumların
  kurucu owner yetkisine sahip kişilere").
   - Kurum: her etkin Kurum Sahibine ArvoOS panelinde kişiye özel satır;
     bağlantı belgenin kendi sayfası. Kişiye özel satır anlık bildirim
     tetikleyicisini de çalıştırıyor — burada istenen tam bu: ödeme
     belgesi sahibin telefonuna gitsin.
   - ArvoLab kurum lisansı: ayrıca ArvoLab'da kurumun yöneticilerine
     (academic_manager): ArvoLab'da kurumun kredi ve faturasını o rol
     yönetiyor ve ArvoOS paneline girmeyen bir kurum yöneticisi belgeyi
     yalnızca orada görüyor.
   - Bireysel abone: ArvoLab'daki kendi bildirimi (tür 'billing').
  ArvoLab yazımı köprü kapalıysa başarısız sayılıyor ve iş ertesi gün
  yeniden deniyor; ArvoOS'a yazılan satır o turda yazılmışsa yinelenmesin
  diye bildirildi_at yalnızca HER kanal yazıldığında doluyor — ArvoOS
  satırının yinelemesini metadata.anahtar engelliyor.
*/
async function bildir(
  admin: Admin,
  p: { id: string; organization_id: string | null; product: string },
  sahipler: string[],
  abone: { external_user_id: string } | null,
  metin: { baslik: string; metin: string },
): Promise<{ ok: true; adet: number } | { ok: false; hata: string }> {
  let adet = 0;
  const anahtar = `proforma:${p.id}`;
  if (p.organization_id) {
    if (!sahipler.length) return { ok: false, hata: "Bildirim gönderilemedi: kurumun etkin Kurum Sahibi yok." };
    const { data: onceki, error: oncekiHatasi } = await admin.from("notifications").select("user_id")
      .eq("organization_id", p.organization_id).eq("category", "proforma_hazir").eq("metadata->>anahtar", anahtar);
    if (oncekiHatasi) return { ok: false, hata: "Önceki bildirimler okunamadı: " + oncekiHatasi.message };
    const yazilmis = new Set(((onceki ?? []) as { user_id: string | null }[]).map((o) => o.user_id));
    const yeni = sahipler.filter((k) => !yazilmis.has(k));
    if (yeni.length) {
      const { error } = await admin.from("notifications").insert(yeni.map((kullanici) => ({
        organization_id: p.organization_id, user_id: kullanici, audience: "organization", category: "proforma_hazir",
        title: metin.baslik, message: metin.metin, action_url: `/panel/billing/proforma/${p.id}`,
        metadata: { anahtar, proforma_id: p.id, product: p.product },
      })));
      if (error) return { ok: false, hata: "Panel bildirimi yazılamadı: " + error.message };
    }
    adet += sahipler.length;
  }

  const labHedefi = p.organization_id ? (p.product === "arvolab" ? "kurum" : null) : abone ? "abone" : null;
  if (labHedefi) {
    const lab = arvolabClient();
    if (!lab) return { ok: false, hata: "ArvoLab köprüsü kapalı; ArvoLab bildirimi yazılamadı." };
    let kullanicilar: string[] = [];
    if (labHedefi === "abone") kullanicilar = [abone!.external_user_id];
    else {
      const { data, error } = await lab.from("profiles").select("id").eq("organization_id", p.organization_id!).eq("role", "academic_manager");
      if (error) return { ok: false, hata: "ArvoLab kurum yöneticileri okunamadı: " + error.message };
      kullanicilar = ((data ?? []) as { id: string }[]).map((x) => x.id);
    }
    if (kullanicilar.length) {
      const { error } = await lab.from("notifications").insert(kullanicilar.map((k) => ({
        user_id: k, kind: "billing", title: metin.baslik.slice(0, 200), body: metin.metin.slice(0, 500), link: "/dashboard/abonelik",
      })));
      if (error) return { ok: false, hata: "ArvoLab bildirimi yazılamadı: " + error.message };
      adet += kullanicilar.length;
    }
  }
  return { ok: true, adet };
}
