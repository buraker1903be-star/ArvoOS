import { createAdminClient } from "@/lib/supabase/admin";

// Karşılıksız kalan PayTR bildirimleri.
//
// arvo_record_paytr_payment bir bildirimi işleyemediğinde hata fırlatmaz;
// sebebini döndürür ve payment_provider_events.result'a yazar. Uç nokta
// PayTR'ye yine "OK" der — çünkü tekrar denemek aynı sonucu verir, yalnızca
// kuyruğu şişirir.
//
// Sorun şuydu: kayıt tutuluyordu ama hiçbir ekranda görünmüyordu. Para tahsil
// edilmiş, cariye ya da lisansa hiçbir şey yazılmamış ve kimsenin haberi yok.
// Burası o olayları kurucunun önüne çıkarır.
//
// 'recorded' işlendi, 'test' test ödemesi, 'duplicate' aynı bildirimin
// tekrarı — üçü de normal. Geri kalan her sonuç müdahale ister.

const HANDLED = ["recorded", "test", "duplicate"];

export const incidentLabels: Record<string, string> = {
  amount_mismatch: "Eksik ödeme",
  invalid_amount: "Tutar okunamadı",
  no_party: "Cari bulunamadı",
  not_found: "Bağlantı bulunamadı",
  invalid: "Geçersiz bildirim",
};

export const incidentNotes: Record<string, string> = {
  amount_mismatch: "Tahsil edilen tutar bağlantıdaki tutardan az. Lisans açılmadı, cariye yazılmadı. Farkı tahsil edip elle işleyin ya da iade edin.",
  invalid_amount: "PayTR'den gelen tutar sayıya çevrilemedi. Ödeme gerçekleşmiş olabilir; PayTR panelinden doğrulayın.",
  no_party: "Taksitin bağlı olduğu cari hesap bulunamadı. Tahsilat cariye yazılmadı; ödeme planını kontrol edin.",
  not_found: "Bildirimdeki bağlantı kaydı sistemde yok. Silinmiş bir bağlantıya ödeme yapılmış olabilir.",
  invalid: "Bildirim eksik alanlarla geldi.",
};

export interface PaymentIncident {
  id: string;
  merchantOid: string;
  result: string;
  organizationId: string | null;
  organizationName: string | null;
  totalAmount: number | null;
  paymentAmount: number | null;
  currency: string | null;
  createdAt: string;
}

/**
 * Müdahale bekleyen ödeme bildirimleri. Tablo yalnızca service_role'e açık,
 * bu yüzden sunucu anahtarıyla okunur.
 */
export async function getPaymentIncidents(limit = 50): Promise<PaymentIncident[]> {
  const admin = createAdminClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("payment_provider_events")
    .select("id,merchant_oid,result,organization_id,total_amount,payment_amount,currency,created_at,organizations(name,display_name)")
    .not("result", "in", `(${HANDLED.join(",")})`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[ödeme] karşılıksız bildirimler okunamadı", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const organization = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
    return {
      id: row.id as string,
      merchantOid: row.merchant_oid as string,
      result: row.result as string,
      organizationId: (row.organization_id as string) ?? null,
      organizationName: organization ? (organization.display_name || organization.name) : null,
      totalAmount: row.total_amount === null ? null : Number(row.total_amount),
      paymentAmount: row.payment_amount === null ? null : Number(row.payment_amount),
      currency: (row.currency as string) ?? null,
      createdAt: row.created_at as string,
    };
  });
}
