import { createAdminClient } from "@/lib/supabase/admin";
import { KOPRU_URUNLERI, kopruYetkili, type KopruUrunu } from "@/lib/kopru-yetki";

/*
  ÜRÜNLERİN PANEL BİLDİRİMİ KAPISI.

  ArvoARC'a sipariş düştüğünde kurum sahibi onu ArvoARC panelinde
  görüyordu ama ArvoOS panelinde görmüyordu — iki ürünü birlikte
  kullanan kiracı (ArvoCulture) iki ayrı yere bakmak zorundaydı.
  Ürünler kendi olaylarını buraya bildiriyor, bildirim ArvoOS'un
  bildirim çekmecesine düşüyor.

  WhatsApp kapısıyla aynı kalıp ve aynı anahtar: ürün Meta'ya ya da
  ArvoOS'un veritabanına DOĞRUDAN değil kapıdan geçiyor. Kapının
  kazancı aynı: tek yerde yetki, tek yerde biçim denetimi, tek yerde
  hata haritası.

  AUDIENCE "organization", user_id YOK. Kuruma yazılan satır bildirim
  çekmecesinde görünüyor ama telefon çaldırmıyor: anlık bildirim
  tetikleyicisi yalnızca KİŞİYE ÖZEL satırlarda çalışıyor
  (app/api/push/gonder). Siparişin herkesin telefonunu çaldırması
  istenen bir şey değil; isteyen panelden kendi bildirim tercihini
  kurar.
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/*
  Kategori ÜRÜN ÖNEKİYLE yazılıyor (arc_siparis gibi): bildirim
  çekmecesi kategoriye göre simge ve süzgeç veriyor, ArvoOS'un kendi
  kategorileriyle çakışan bir ad ikisini birbirine karıştırırdı.
*/
const KATEGORI = /^[a-z][a-z0-9_]{2,40}$/;

const kirp = (metin: unknown, sinir: number) => String(metin ?? "").trim().slice(0, sinir);

export async function POST(istek: Request) {
  const govde = (await istek.json().catch(() => null)) as {
    product?: string;
    organizationId?: string;
    category?: string;
    title?: string;
    message?: string;
    actionUrl?: string;
    /** Aynı olayın iki kez bildirilmemesi için; genelde sipariş kimliği. */
    dedupeKey?: string;
    metadata?: Record<string, unknown>;
  } | null;
  if (!govde) return json(400, { error: "Geçersiz istek gövdesi." });

  const product = govde.product as KopruUrunu;
  if (!KOPRU_URUNLERI.includes(product)) return json(400, { error: "Geçersiz ürün." });
  if (!kopruYetkili(istek, product)) return json(401, { error: "Yetkisiz." });

  const organizationId = kirp(govde.organizationId, 64);
  if (!UUID.test(organizationId)) return json(400, { error: "organizationId geçersiz." });

  const category = kirp(govde.category, 48);
  if (!KATEGORI.test(category)) return json(400, { error: "category geçersiz." });

  const title = kirp(govde.title, 120);
  const message = kirp(govde.message, 400);
  if (!title || !message) return json(400, { error: "title ve message zorunlu." });

  /*
    ADRES YALNIZCA PANEL İÇİ BİR YOL olabilir. Dışarıya götüren bir
    bildirim, sahte bildirimin ilk adımı; aynı kural anlık bildirim
    yükünde de yazılı (lib/anlik-bildirim).
  */
  const actionUrl = kirp(govde.actionUrl, 300);
  if (actionUrl && !/^\/[A-Za-z0-9/_\-?=&.%]*$/.test(actionUrl)) {
    return json(400, { error: "actionUrl yalnızca panel içi bir yol olabilir." });
  }

  const admin = createAdminClient();
  if (!admin) return json(503, { error: "Sunucu anahtarı tanımlı değil." });

  /*
    KURUM GERÇEKTEN VAR MI. Olmayan kuruma yazılan bildirim hiçbir
    ekranda görünmez ve sessizce birikir; ürünün yanlış kimlik
    göndermesi sessiz kalmamalı.
  */
  const { data: kurum, error: kurumHatasi } = await admin
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();
  if (kurumHatasi) {
    console.error("[bildirim] kurum okunamadı", kurumHatasi.message);
    return json(500, { error: "Kurum doğrulanamadı." });
  }
  if (!kurum) return json(404, { error: "Kurum bulunamadı." });

  const dedupeKey = kirp(govde.dedupeKey, 120);
  if (dedupeKey) {
    /*
      AYNI OLAY İKİ KEZ BİLDİRİLMESİN. PayTR ödeme bildirimini
      yanıt alana kadar TEKRARLIYOR ve ArvoARC her tekrarda sipariş
      onay akışını yeniden çalıştırabiliyor; anahtarsız bırakılsa
      kurum sahibi aynı sipariş için üç bildirim görürdü.
    */
    const { data: var_mi, error: okumaHatasi } = await admin
      .from("notifications")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("category", category)
      .eq("metadata->>dedupe_key", dedupeKey)
      .limit(1)
      .maybeSingle();
    /* Okunamazsa yazmaya devam: eksik bildirimdense yinelenen bildirim. */
    if (okumaHatasi) console.error("[bildirim] yineleme denetimi düştü", okumaHatasi.message);
    if (var_mi) return json(200, { yazildi: false, sebep: "zaten var" });
  }

  const { data: satir, error } = await admin
    .from("notifications")
    .insert({
      organization_id: organizationId,
      user_id: null,
      audience: "organization",
      category,
      title,
      message,
      action_url: actionUrl || null,
      metadata: { ...(govde.metadata ?? {}), kaynak: product, ...(dedupeKey ? { dedupe_key: dedupeKey } : {}) },
    })
    .select("id")
    .single();

  if (error) {
    console.error("[bildirim] yazılamadı", error.message);
    return json(500, { error: "Bildirim yazılamadı." });
  }

  return json(200, { yazildi: true, id: satir.id });
}
