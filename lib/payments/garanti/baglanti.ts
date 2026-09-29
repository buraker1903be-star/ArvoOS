import "server-only";
import { randomUUID } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { sirlariCoz } from "@/lib/payments/kimlik";
import { siparisNumarasi } from "./form";

/*
  GARANTİ TAKSİT ÖDEME BAĞLANTISI.

  PayTR'ın ikizi (app/panel/finance/paytr-actions.ts) ama bir yerde
  ondan ayrılıyor: PayTR bir bağlantı API'si, sunucusuna çağrı atıp
  haftalarca yaşayan bir URL alıyorsun. GARANTİ'DE BU MÜMKÜN DEĞİL —
  banka aynı orderid'yi ikinci kez kabul etmiyor ve imza orderid'ye
  bağlı, yani bugün hesaplanan bir imza tek denemeden sonra ölü.

  Bu yüzden müşteriye giden URL BİZİM SAYFAMIZ: /odeme/<bağlantı id>.
  Müşteri açtığında o an yeni bir orderid üretiliyor, tutar
  VERİTABANINDAN okunuyor ve imza taze hesaplanıyor. Bankanın kendi
  tavsiyesi de bu: "siteden posta edilen tutar, müşterinin gördüğü
  değil veritabanından çekilen tutar olmalı."

  Yan fayda: StoreKey ve provizyon şifresi sunucudan hiç çıkmıyor.
*/

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

export class BaglantiHatasi extends Error {
  constructor(readonly kod: "bulunamadi" | "kapali" | "suresi_gecti" | "cok_deneme" | "kimlik_yok", mesaj: string) {
    super(mesaj);
    this.name = "BaglantiHatasi";
  }
}

/*
  Bir bağlantı için üst sınır. Sayfayı yenileyip duran bir müşteri
  tabloyu doldurmasın; gerçek bir ödemede iki üç deneme yeter.
  Sınıra takılan bağlantı kapanmıyor, yalnızca yeni deneme açmıyor —
  kullanıcıya yeni bağlantı gönderilir.
*/
export const EN_FAZLA_DENEME = 25;

export interface BaglantiGirdisi {
  organizationId: string;
  installmentId: string;
  /** Kuruş; taksit kaydından okunur, formdan DEĞİL. */
  amount: number;
  /** Kurumun kalıcı alan adı; bağlantı aylarca açık kalabiliyor. */
  host: string;
  actorId: string;
}

/** Taksit için yeni bir Garanti ödeme bağlantısı açar; öncekini kapatır. */
export async function garantiBaglantisiAc(admin: Admin, girdi: BaglantiGirdisi): Promise<{ id: string; url: string }> {
  if (!Number.isInteger(girdi.amount) || girdi.amount <= 0) {
    throw new BaglantiHatasi("bulunamadi", "Taksit tutarı geçersiz.");
  }
  /*
    Kimlik burada, bağlantı açılırken de bir kez okunuyor: bilgileri
    eksik bir kurumda müşteriye ölü bir bağlantı göndermeyelim.
    Sırların kendisi kullanılmıyor, yalnızca varlıkları sınanıyor.
  */
  try {
    await sirlariCoz(admin, girdi.organizationId, "garanti");
  } catch (hata) {
    throw new BaglantiHatasi("kimlik_yok", hata instanceof Error ? hata.message : "Garanti bilgileri eksik.");
  }

  await garantiBaglantisiIptal(admin, girdi.installmentId);

  const id = randomUUID();
  const url = `https://${girdi.host}/odeme/${id}`;
  const { error } = await admin.from("payment_links").insert({
    id,
    organization_id: girdi.organizationId,
    installment_id: girdi.installmentId,
    provider: "garanti",
    /*
      Bankada bir "bağlantı kimliği" yok; sütun NOT NULL olduğu için
      kendi kimliğimizi yazıyoruz. Bankaya giden orderid'ler denemede
      duruyor (garanti_payment_attempts).
    */
    provider_link_id: id,
    url,
    amount: girdi.amount,
    purpose: "installment",
    created_by: girdi.actorId,
  });
  if (error) throw new BaglantiHatasi("bulunamadi", "Ödeme bağlantısı kaydedilemedi: " + error.message);

  const { error: taksitHatasi } = await admin.from("payment_installments")
    .update({ payment_url: url, payment_link_source: "garanti" })
    .eq("id", girdi.installmentId).eq("organization_id", girdi.organizationId);
  if (taksitHatasi) {
    /* Taksite işlenemediyse bağlantı ortada kalmasın. */
    await admin.from("payment_links").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", id);
    throw new BaglantiHatasi("bulunamadi", "Bağlantı taksite işlenemedi: " + taksitHatasi.message);
  }
  return { id, url };
}

/** Taksitteki açık bağlantıyı kapatır. Bankada yapılacak bir şey yok. */
export async function garantiBaglantisiIptal(admin: Admin, installmentId: string): Promise<void> {
  const { data: onceki } = await admin.from("payment_links").select("id")
    .eq("installment_id", installmentId).eq("provider", "garanti").eq("status", "active").maybeSingle();
  if (!onceki) return;
  await admin.from("payment_links").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", onceki.id);
}

export interface DenemeBilgisi {
  attemptId: string;
  orderId: string;
  organizationId: string;
  /** Kuruş; bağlantı kaydından, sayfadan DEĞİL. */
  amount: number;
  terminalId: string;
  provizyonSifresi: string;
  storeKey: string;
  terminalMerchantId: string;
  terminalProvUserId: string;
}

/**
 * Müşteri ödeme sayfasını açtığında yeni bir deneme başlatır.
 *
 * Tutar ve kurum BAĞLANTI KAYDINDAN okunuyor; sayfaya gelen hiçbir
 * parametreye güvenilmiyor. Bankaya gidecek sırlar da burada, sunucuda
 * çözülüyor ve tarayıcıya hiç ulaşmıyor.
 */
export async function denemeBaslat(admin: Admin, baglantiId: string): Promise<DenemeBilgisi> {
  const { data: baglanti } = await admin.from("payment_links")
    .select("id,organization_id,amount,status,expires_at,provider")
    .eq("id", baglantiId).maybeSingle();
  if (!baglanti || baglanti.provider !== "garanti") throw new BaglantiHatasi("bulunamadi", "Ödeme bağlantısı bulunamadı.");
  if (baglanti.status !== "active") {
    throw new BaglantiHatasi("kapali", baglanti.status === "paid" ? "Bu ödeme zaten tamamlanmış." : "Bu ödeme bağlantısı kapatılmış.");
  }
  if (baglanti.expires_at && new Date(baglanti.expires_at).getTime() < Date.now()) {
    throw new BaglantiHatasi("suresi_gecti", "Ödeme bağlantısının süresi geçmiş. Yeni bağlantı isteyin.");
  }

  const { count } = await admin.from("garanti_payment_attempts")
    .select("id", { count: "exact", head: true }).eq("payment_link_id", baglantiId);
  if ((count ?? 0) >= EN_FAZLA_DENEME) {
    throw new BaglantiHatasi("cok_deneme", "Bu bağlantıda çok fazla deneme yapıldı. Yeni bağlantı isteyin.");
  }

  const sirlar = await sirlariCoz(admin, baglanti.organization_id, "garanti");
  const { data: kayit } = await admin.from("organization_payment_providers")
    .select("merchant_id").eq("organization_id", baglanti.organization_id).eq("provider", "garanti").maybeSingle();
  if (!kayit?.merchant_id) throw new BaglantiHatasi("kimlik_yok", "Üye işyeri numarası bulunamadı.");

  const orderId = siparisNumarasi(randomUUID());
  const { data: deneme, error } = await admin.from("garanti_payment_attempts").insert({
    organization_id: baglanti.organization_id,
    payment_link_id: baglantiId,
    order_id: orderId,
    amount: Number(baglanti.amount),
    terminal_id: sirlar.terminal_id,
  }).select("id").single();
  if (error || !deneme) throw new BaglantiHatasi("bulunamadi", "Ödeme denemesi açılamadı: " + (error?.message ?? ""));

  return {
    attemptId: deneme.id,
    orderId,
    organizationId: baglanti.organization_id,
    amount: Number(baglanti.amount),
    terminalId: sirlar.terminal_id,
    provizyonSifresi: sirlar.prov_password,
    storeKey: sirlar.store_key,
    terminalMerchantId: kayit.merchant_id,
    terminalProvUserId: sirlar.prov_user,
  };
}

export type DenemeSonucu =
  | { durum: "paid"; mdStatus?: string; procReturnCode?: string; bankaMesaji?: string }
  | { durum: "failed"; mdStatus?: string; procReturnCode?: string; bankaMesaji?: string }
  | { durum: "rejected"; sebep: string; mdStatus?: string; procReturnCode?: string };

/**
 * Banka dönüşünü denemeye işler.
 *
 * "rejected", doğrulamanın tutmadığı hâl: para hareket etmiş bile olsa
 * kabul etmiyoruz ve SEBEBİ yazıyoruz — sessizce kaybolursa sahte bir
 * POST ile gerçek bir arıza arasındaki farkı kimse göremez.
 *
 * Yalnızca 'started' durumundaki deneme sonuçlanır: bankanın aynı
 * dönüşü ikinci kez göndermesi (ya da birinin tekrar oynatması) ödemeyi
 * iki kez işlememeli.
 */
export async function denemeSonucla(admin: Admin, orderId: string, sonuc: DenemeSonucu): Promise<{ islendi: boolean; attemptId: string | null; paymentLinkId: string | null }> {
  const { data: deneme } = await admin.from("garanti_payment_attempts")
    .select("id,payment_link_id,status").eq("order_id", orderId).maybeSingle();
  if (!deneme) return { islendi: false, attemptId: null, paymentLinkId: null };
  if (deneme.status !== "started") return { islendi: false, attemptId: deneme.id, paymentLinkId: deneme.payment_link_id };

  const { error } = await admin.from("garanti_payment_attempts").update({
    status: sonuc.durum,
    md_status: sonuc.mdStatus ?? null,
    proc_return_code: sonuc.procReturnCode ?? null,
    bank_message: sonuc.durum === "rejected" ? null : sonuc.bankaMesaji ?? null,
    reject_reason: sonuc.durum === "rejected" ? sonuc.sebep : null,
    finished_at: new Date().toISOString(),
  }).eq("id", deneme.id).eq("status", "started");
  if (error) return { islendi: false, attemptId: deneme.id, paymentLinkId: deneme.payment_link_id };

  return { islendi: true, attemptId: deneme.id, paymentLinkId: deneme.payment_link_id };
}
