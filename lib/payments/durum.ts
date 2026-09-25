import { createAdminClient } from "@/lib/supabase/admin";
import { paymentCredentialsConfigured } from "@/lib/payment-credentials";
import { kurumSaglayicilari, type ProviderRecord } from "./kimlik";
import { PROVIDERS, tahsilatSaglayicisi, type ProviderCode, type ProviderSpec } from "./saglayicilar";

// Ayarlar ekranının gördüğü sağlayıcı durumu. Sır DÖNDÜRMEZ; yalnızca hangi
// alanların kayıtlı olduğunu ve mağaza kimliğinin son 4 hanesini verir.
//
// "use server" değil: tarayıcıdan çağrılabilir bir uç olmasın.

export interface ProviderStatus {
  spec: ProviderSpec;
  /** Sunucu anahtarları (service role + PAYMENT_CREDENTIALS_KEY) tanımlı mı */
  available: boolean;
  /** Kayıt okunamadı: "bağlı değil" ile karıştırılmamalı */
  readFailed: boolean;
  connected: boolean;
  enabled: boolean;
  /** Zorunlu alanların hepsi kayıtlı mı */
  complete: boolean;
  /** Bu sağlayıcıyla gerçekten tahsilat yapılıyor mu */
  active: boolean;
  merchantId: string | null;
  merchantHint: string | null;
  mode: "test" | "production";
  storedKeys: string[];
  lastTestPaymentAt: string | null;
  lastPaymentAt: string | null;
  updatedAt: string | null;
}

const bos = (spec: ProviderSpec, available: boolean, readFailed = false): ProviderStatus => ({
  spec, available, readFailed, connected: false, enabled: false, complete: false, active: false,
  merchantId: null, merchantHint: null, mode: "production", storedKeys: [],
  lastTestPaymentAt: null, lastPaymentAt: null, updatedAt: null,
});

const doldur = (spec: ProviderSpec, kayit: ProviderRecord, available: boolean, secilen: ProviderCode | null): ProviderStatus => ({
  spec,
  available,
  readFailed: false,
  connected: true,
  enabled: kayit.enabled,
  complete: kayit.complete,
  active: secilen === spec.code,
  merchantId: kayit.merchantId,
  merchantHint: `••••${kayit.merchantId.slice(-4)}`,
  mode: kayit.mode,
  storedKeys: kayit.storedKeys,
  lastTestPaymentAt: kayit.lastTestPaymentAt,
  lastPaymentAt: kayit.lastPaymentAt,
  updatedAt: kayit.updatedAt,
});

/** Bütün sağlayıcıların durumu; kayıtlı olmayanlar da "bağlı değil" olarak döner. */
export async function saglayiciDurumlari(organizationId: string): Promise<ProviderStatus[]> {
  const admin = createAdminClient();
  const available = Boolean(admin) && paymentCredentialsConfigured();
  if (!admin) return PROVIDERS.map((spec) => bos(spec, available));

  /*
    Okuma başarısız olursa sayfa DÜŞMÜYOR ama "bağlı değil" de DEMİYOR.
    İkisi de yanlış olurdu: ayarlar sayfasının tamamını tek bir sorgu
    yüzünden kapatmak orantısız, bağlı bir sağlayıcıyı "bağlı değil"
    göstermek ise kullanıcıya anahtarlarını yeniden girdirir.
  */
  let kayitlar;
  try {
    kayitlar = await kurumSaglayicilari(admin, organizationId);
  } catch (error) {
    console.error("[ödeme] sağlayıcı durumu okunamadı", error instanceof Error ? error.message : error);
    return PROVIDERS.map((spec) => bos(spec, available, true));
  }
  const secilen = tahsilatSaglayicisi(
    kayitlar.map((kayit) => ({ provider: kayit.provider, enabled: kayit.enabled, complete: kayit.complete })),
  );
  return PROVIDERS.map((spec) => {
    const kayit = kayitlar.find((row) => row.provider === spec.code);
    return kayit ? doldur(spec, kayit, available, secilen) : bos(spec, available);
  });
}
