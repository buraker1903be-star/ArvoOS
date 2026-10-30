"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { runPanelAction } from "@/lib/panel-action";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import { assertYetki } from "@/lib/yetkiler";
import { kurusOku } from "@/lib/turkish-amount";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { ayEtiketi } from "@/lib/personel-hedefi";
import { hakedisNeti, kadroluMu, odenecekTutar } from "@/lib/maas";

/*
  MAAŞ TAKİBİ VE HAKEDİŞ İŞLEMLERİ (30.10.2026). Kural lib/maas.ts'te,
  tablolar ve gizlilik gerekçesi migration 20261030065444'te.

  Yetki üç yerde (AGENTS.md): RLS (owner/admin), burada assertYetki
  ("hr.maas.yonet", varsayılanı aynı küme) ve menüde gizleme
  (os-bolumler maasGorur). Kimlikler formdan geliyor ama kişiler
  sunucudan okunuyor; tetikleyici de başka kurumun personeline yazmayı
  reddediyor.

  ÖDEME FİNANSA GİDER YAZIYOR (prim ödemesiyle aynı kalıp, kategori
  "Personel Maaşı" / "Serbest Çalışan Hakedişi"). Tutar formdan değil,
  kayıttan hesaplanıyor: ekrandaki "ödenecek" ile ödenen ayrışmasın.
  Ödenmiş satır düzenlenmiyor; yanlışsa ödeme geri alınıyor (gider de
  kalkıyor), sonra düzeltiliyor.
*/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AY = /^\d{4}-\d{2}-01$/;
const GUN = /^\d{4}-\d{2}-\d{2}$/;
const YONTEMLER = new Set(["havale", "nakit", "diger"]);
const metin = (f: FormData, k: string, max = 300) => String(f.get(k) ?? "").trim().slice(0, max);

async function baglam() {
  const context = await getPanelContext();
  if (!context.modules.some((m) => m.code === "hr")) throw new Error("İnsan Kaynakları modülüne erişiminiz yok.");
  assertYetki(context.yetkiler, "hr.maas.yonet");
  assertModuleKeyAccess(context.membership.role, "hr", context.hiddenModuleKeys);
  return context;
}

/** Boş kutu null; yazılmışsa kuruş. Geçersizse hata — sessizce sıfır yazmak maaşı silmek olurdu. */
function tutarOku(f: FormData, k: string, ad: string): number | null {
  const deger = metin(f, k, 30);
  if (!deger) return null;
  const kurus = kurusOku(deger);
  if (!Number.isFinite(kurus) || kurus < 0) throw new Error(`${ad} geçersiz: ${deger}`);
  return kurus;
}

const yenile = () => {
  revalidatePath("/panel/hr/maaslar");
  revalidatePath("/panel/hr/hakedisler");
  revalidatePath("/panel/hr/[id]", "page");
  revalidatePath("/panel/finance");
};

// ---------------------------------------------------------------- Maaş

async function maaslariKaydet__impl(f: FormData) {
  const { supabase, membership, userId } = await baglam();
  const ay = metin(f, "ay", 10);
  if (!AY.test(ay)) throw new Error("Ay okunamadı.");
  const org = membership.organization_id;

  const [{ data: kadro, error: kadroHatasi }, { data: mevcut, error: mevcutHatasi }] = await Promise.all([
    supabase.from("hr_employees").select("id,full_name,employment_type").eq("organization_id", org),
    supabase.from("hr_maaslar").select("employee_id,odendi_on").eq("organization_id", org).eq("donem", ay),
  ]);
  if (kadroHatasi) throw new Error("Personel listesi okunamadı: " + kadroHatasi.message);
  if (mevcutHatasi) throw new Error("Maaş kayıtları okunamadı: " + mevcutHatasi.message);
  const odenmis = new Set(((mevcut ?? []) as { employee_id: string; odendi_on: string | null }[]).filter((m) => m.odendi_on).map((m) => m.employee_id));
  const satiriVar = new Set(((mevcut ?? []) as { employee_id: string }[]).map((m) => m.employee_id));

  const yazilacak = [];
  const silinecek: string[] = [];
  for (const k of (kadro ?? []) as { id: string; full_name: string; employment_type: string }[]) {
    if (!kadroluMu(k.employment_type) || odenmis.has(k.id)) continue;
    if (!f.has(`anlasilan_${k.id}`)) continue;
    const satir = {
      anlasilan_net: tutarOku(f, `anlasilan_${k.id}`, `${k.full_name} için anlaşılan net`),
      resmi_net: tutarOku(f, `resmi_${k.id}`, `${k.full_name} için müşavir neti`),
      ek_odeme: tutarOku(f, `ek_${k.id}`, `${k.full_name} için ek ödeme`) ?? 0,
      avans: tutarOku(f, `avans_${k.id}`, `${k.full_name} için avans`) ?? 0,
      kesinti: tutarOku(f, `kesinti_${k.id}`, `${k.full_name} için kesinti`) ?? 0,
      notlar: metin(f, `not_${k.id}`, 500) || null,
    };
    const bos = satir.anlasilan_net === null && satir.resmi_net === null && !satir.ek_odeme && !satir.avans && !satir.kesinti && !satir.notlar;
    if (bos) { if (satiriVar.has(k.id)) silinecek.push(k.id); continue; }
    yazilacak.push({ organization_id: org, employee_id: k.id, donem: ay, ...satir, olusturan: userId });
  }

  if (yazilacak.length) {
    const { error } = await supabase.from("hr_maaslar").upsert(yazilacak, { onConflict: "organization_id,employee_id,donem" });
    if (error) throw new Error("Maaşlar kaydedilemedi: " + error.message);
  }
  if (silinecek.length) {
    const { error } = await supabase.from("hr_maaslar").delete()
      .eq("organization_id", org).eq("donem", ay).in("employee_id", silinecek).is("odendi_on", null);
    if (error) throw new Error("Boşaltılan satırlar kaldırılamadı: " + error.message);
  }
  yenile();
}

/*
  ÖNCEKİ AYDAN KOPYALAMA: anlaşılan net çoğu ay aynı. Yalnızca bu ayda
  SATIRI OLMAYAN kişiler dolduruluyor (hedeflerdeki kural): bilerek
  değiştirilmiş bir maaşı geçen aya döndürmek sessiz bir hata olurdu.
  Müşavir neti, ek ödeme, avans ve kesinti KOPYALANMIYOR: onlar o aya ait.
*/
async function maasOncekiAydanKopyala__impl(f: FormData) {
  const { supabase, membership, userId } = await baglam();
  const ay = metin(f, "ay", 10);
  const kaynak = metin(f, "kaynak", 10);
  if (!AY.test(ay) || !AY.test(kaynak)) throw new Error("Ay okunamadı.");
  const org = membership.organization_id;
  const [{ data: onceki, error: h1 }, { data: bu, error: h2 }] = await Promise.all([
    supabase.from("hr_maaslar").select("employee_id,anlasilan_net").eq("organization_id", org).eq("donem", kaynak).not("anlasilan_net", "is", null),
    supabase.from("hr_maaslar").select("employee_id").eq("organization_id", org).eq("donem", ay),
  ]);
  if (h1 || h2) throw new Error("Maaş kayıtları okunamadı: " + (h1 ?? h2)!.message);
  const dolu = new Set(((bu ?? []) as { employee_id: string }[]).map((m) => m.employee_id));
  const yeni = ((onceki ?? []) as { employee_id: string; anlasilan_net: number }[])
    .filter((m) => !dolu.has(m.employee_id))
    .map((m) => ({ organization_id: org, employee_id: m.employee_id, donem: ay, anlasilan_net: m.anlasilan_net, olusturan: userId }));
  if (!yeni.length) throw new Error("Kopyalanacak maaş yok: bu aydaki herkesin satırı zaten açık.");
  const { error } = await supabase.from("hr_maaslar").insert(yeni);
  if (error) throw new Error("Maaşlar kopyalanamadı: " + error.message);
  yenile();
}

async function maasOde__impl(f: FormData) {
  const { supabase, membership, userId } = await baglam();
  const org = membership.organization_id;
  const id = metin(f, "id", 40);
  const tarih = metin(f, "tarih", 10) || todayInIstanbul();
  const yontem = metin(f, "yontem", 10) || "havale";
  if (!UUID.test(id)) throw new Error("Maaş kaydı bulunamadı.");
  if (!GUN.test(tarih)) throw new Error("Ödeme tarihi geçersiz.");
  if (!YONTEMLER.has(yontem)) throw new Error("Ödeme yöntemi geçersiz.");

  const { data: m, error } = await supabase.from("hr_maaslar")
    .select("id,employee_id,donem,anlasilan_net,resmi_net,ek_odeme,avans,kesinti,odendi_on,hr_employees(full_name)")
    .eq("id", id).eq("organization_id", org).maybeSingle();
  if (error) throw new Error("Maaş kaydı okunamadı: " + error.message);
  if (!m) throw new Error("Maaş kaydı bulunamadı.");
  if (m.odendi_on) throw new Error("Bu ayın maaşı zaten ödenmiş.");
  const { tutar } = odenecekTutar(m as Parameters<typeof odenecekTutar>[0]);
  if (!tutar) throw new Error("Ödenecek tutar yok: önce anlaşılan ya da müşavir netini girin.");
  const ad = (Array.isArray(m.hr_employees) ? m.hr_employees[0] : m.hr_employees as { full_name: string } | null)?.full_name ?? "Personel";

  const { data: gider, error: giderHatasi } = await supabase.from("finance_transactions").insert({
    organization_id: org, transaction_type: "expense", status: "paid",
    title: `Maaş · ${ad} · ${ayEtiketi(m.donem as string)}`.slice(0, 180), counterparty: ad, category: "Personel Maaşı",
    amount: tutar, currency: "TRY", due_date: tarih, paid_at: tarih, created_by: userId,
  }).select("id").single();
  /* Gider yazılamazsa ödeme de işaretlenmiyor: maaş "ödendi" görünüp
     finansta hiç görünmezse kasa ile kayıt ayrışırdı. */
  if (giderHatasi) throw new Error("Finans gideri yazılamadı: " + giderHatasi.message);

  const { data: guncellenen, error: odemeHatasi } = await supabase.from("hr_maaslar")
    .update({ odendi_on: tarih, odenen: tutar, odeme_yontemi: yontem, finance_transaction_id: gider.id })
    .eq("id", id).eq("organization_id", org).is("odendi_on", null).select("id");
  if (odemeHatasi || !guncellenen?.length) {
    await supabase.from("finance_transactions").delete().eq("id", gider.id).eq("organization_id", org);
    throw new Error("Ödeme kaydedilemedi" + (odemeHatasi ? ": " + odemeHatasi.message : "; kayıt az önce değişmiş olabilir."));
  }
  yenile();
}

async function maasOdemesiGeriAl__impl(f: FormData) {
  const { supabase, membership } = await baglam();
  const org = membership.organization_id;
  const id = metin(f, "id", 40);
  if (!UUID.test(id)) throw new Error("Maaş kaydı bulunamadı.");
  const { data: m, error } = await supabase.from("hr_maaslar").select("finance_transaction_id,odendi_on").eq("id", id).eq("organization_id", org).maybeSingle();
  if (error) throw new Error("Maaş kaydı okunamadı: " + error.message);
  if (!m?.odendi_on) throw new Error("Bu maaş ödenmiş görünmüyor.");
  const { error: hata } = await supabase.from("hr_maaslar")
    .update({ odendi_on: null, odenen: null, odeme_yontemi: null, finance_transaction_id: null }).eq("id", id).eq("organization_id", org);
  if (hata) throw new Error("Ödeme geri alınamadı: " + hata.message);
  // Gider ödemeden sonra siliniyor: tersi, gider silinip ödeme kalırsa "ödendi" ama finansta yok demekti.
  if (m.finance_transaction_id) await supabase.from("finance_transactions").delete().eq("id", m.finance_transaction_id).eq("organization_id", org);
  yenile();
}

// ---------------------------------------------------------------- Hakediş

async function hakedisKaydet__impl(f: FormData) {
  const { supabase, membership, userId } = await baglam();
  const org = membership.organization_id;
  const kisi = metin(f, "employee_id", 40);
  const aciklama = metin(f, "aciklama", 200);
  const tarih = metin(f, "tarih", 10) || todayInIstanbul();
  const tutar = tutarOku(f, "tutar", "Tutar");
  const stopaj = tutarOku(f, "stopaj", "Stopaj") ?? 0;
  const belge = metin(f, "belge_turu", 10) || "yok";
  if (!UUID.test(kisi)) throw new Error("Çalışanı seçin.");
  if (aciklama.length < 2) throw new Error("Yapılan işi yazın.");
  if (!GUN.test(tarih)) throw new Error("Tarih geçersiz.");
  if (!tutar) throw new Error("Tutarı yazın (ör. 12.500).");
  if (stopaj >= tutar) throw new Error("Stopaj tutardan küçük olmalı.");
  if (!["fatura", "smm", "yok"].includes(belge)) throw new Error("Belge türü geçersiz.");
  const { data: calisan, error: kHata } = await supabase.from("hr_employees").select("id").eq("id", kisi).eq("organization_id", org).maybeSingle();
  if (kHata) throw new Error("Çalışan okunamadı: " + kHata.message);
  if (!calisan) throw new Error("Çalışan bulunamadı.");
  const { error } = await supabase.from("hr_hakedisler").insert({
    organization_id: org, employee_id: kisi, aciklama, tarih, tutar, stopaj, belge_turu: belge,
    belge_no: metin(f, "belge_no", 60) || null, notlar: metin(f, "notlar", 500) || null, olusturan: userId,
  });
  if (error) throw new Error("Hakediş kaydedilemedi: " + error.message);
  yenile();
}

async function hakedisOde__impl(f: FormData) {
  const { supabase, membership, userId } = await baglam();
  const org = membership.organization_id;
  const id = metin(f, "id", 40);
  const tarih = metin(f, "tarih", 10) || todayInIstanbul();
  const yontem = metin(f, "yontem", 10) || "havale";
  if (!UUID.test(id)) throw new Error("Hakediş bulunamadı.");
  if (!GUN.test(tarih) || !YONTEMLER.has(yontem)) throw new Error("Ödeme bilgisi geçersiz.");
  const { data: h, error } = await supabase.from("hr_hakedisler")
    .select("id,aciklama,tutar,stopaj,durum,hr_employees(full_name)").eq("id", id).eq("organization_id", org).maybeSingle();
  if (error) throw new Error("Hakediş okunamadı: " + error.message);
  if (!h) throw new Error("Hakediş bulunamadı.");
  if (h.durum !== "bekliyor") throw new Error("Yalnızca ödeme bekleyen hakediş ödenir.");
  const ad = (Array.isArray(h.hr_employees) ? h.hr_employees[0] : h.hr_employees as { full_name: string } | null)?.full_name ?? "Serbest çalışan";
  const net = hakedisNeti({ tutar: Number(h.tutar), stopaj: Number(h.stopaj) });

  const { data: gider, error: giderHatasi } = await supabase.from("finance_transactions").insert({
    organization_id: org, transaction_type: "expense", status: "paid",
    title: `Hakediş · ${ad} · ${h.aciklama}`.slice(0, 180), counterparty: ad, category: "Serbest Çalışan Hakedişi",
    amount: net, currency: "TRY", due_date: tarih, paid_at: tarih, created_by: userId,
  }).select("id").single();
  if (giderHatasi) throw new Error("Finans gideri yazılamadı: " + giderHatasi.message);
  const { data: guncellenen, error: hata } = await supabase.from("hr_hakedisler")
    .update({ durum: "odendi", odendi_on: tarih, odeme_yontemi: yontem, finance_transaction_id: gider.id })
    .eq("id", id).eq("organization_id", org).eq("durum", "bekliyor").select("id");
  if (hata || !guncellenen?.length) {
    await supabase.from("finance_transactions").delete().eq("id", gider.id).eq("organization_id", org);
    throw new Error("Ödeme kaydedilemedi" + (hata ? ": " + hata.message : "; kayıt az önce değişmiş olabilir."));
  }
  yenile();
}

async function hakedisGeriAl__impl(f: FormData) {
  const { supabase, membership } = await baglam();
  const org = membership.organization_id;
  const id = metin(f, "id", 40);
  if (!UUID.test(id)) throw new Error("Hakediş bulunamadı.");
  const { data: h, error } = await supabase.from("hr_hakedisler").select("durum,finance_transaction_id").eq("id", id).eq("organization_id", org).maybeSingle();
  if (error) throw new Error("Hakediş okunamadı: " + error.message);
  if (h?.durum !== "odendi") throw new Error("Bu hakediş ödenmiş görünmüyor.");
  const { error: hata } = await supabase.from("hr_hakedisler")
    .update({ durum: "bekliyor", odendi_on: null, odeme_yontemi: null, finance_transaction_id: null }).eq("id", id).eq("organization_id", org);
  if (hata) throw new Error("Ödeme geri alınamadı: " + hata.message);
  if (h.finance_transaction_id) await supabase.from("finance_transactions").delete().eq("id", h.finance_transaction_id).eq("organization_id", org);
  yenile();
}

async function hakedisSil__impl(f: FormData) {
  const { supabase, membership } = await baglam();
  const id = metin(f, "id", 40);
  if (!UUID.test(id)) throw new Error("Hakediş bulunamadı.");
  /* Ödenmiş hakediş silinmiyor (RLS de reddediyor): gideri ve müşavire
     bildirilen stopajı ona bağlı. Silinen satır sayısı okunuyor; RLS'in
     sessizce elediği silme "silindi" diye bildirilmesin. */
  const { data, error } = await supabase.from("hr_hakedisler").delete()
    .eq("id", id).eq("organization_id", membership.organization_id).neq("durum", "odendi").select("id");
  if (error) throw new Error("Hakediş silinemedi: " + error.message);
  if (!data?.length) throw new Error("Hakediş silinemedi: ödenmiş hakediş silinmez, önce ödemeyi geri alın.");
  yenile();
}

export async function maaslariKaydet(f: FormData) { return runPanelAction(() => maaslariKaydet__impl(f), "Maaşlar kaydedildi"); }
export async function maasOncekiAydanKopyala(f: FormData) { return runPanelAction(() => maasOncekiAydanKopyala__impl(f), "Geçen ayın anlaşılan maaşları kopyalandı"); }
export async function maasOde(f: FormData) { return runPanelAction(() => maasOde__impl(f), "Maaş ödendi olarak kaydedildi; finansa gider yazıldı"); }
export async function maasOdemesiGeriAl(f: FormData) { return runPanelAction(() => maasOdemesiGeriAl__impl(f), "Maaş ödemesi geri alındı; finanstaki gider kaldırıldı"); }
export async function hakedisKaydet(f: FormData) { return runPanelAction(() => hakedisKaydet__impl(f), "Hakediş kaydedildi"); }
export async function hakedisOde(f: FormData) { return runPanelAction(() => hakedisOde__impl(f), "Hakediş ödendi olarak kaydedildi; finansa gider yazıldı"); }
export async function hakedisGeriAl(f: FormData) { return runPanelAction(() => hakedisGeriAl__impl(f), "Hakediş ödemesi geri alındı; finanstaki gider kaldırıldı"); }
export async function hakedisSil(f: FormData) { return runPanelAction(() => hakedisSil__impl(f), "Hakediş silindi"); }
