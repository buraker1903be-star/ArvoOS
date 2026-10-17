import { createAdminClient } from "@/lib/supabase/admin";
import { KOPRU_URUNLERI, kopruYetkili, type KopruUrunu } from "@/lib/kopru-yetki";
import { kurumVarMi, panelBildirimiYaz } from "@/lib/panel-bildirimi";

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
  const kurum = await kurumVarMi(admin, organizationId);
  if (kurum === null) return json(500, { error: "Kurum doğrulanamadı." });
  if (!kurum) return json(404, { error: "Kurum bulunamadı." });

  const sonuc = await panelBildirimiYaz(admin, {
    organizationId,
    category,
    title,
    message,
    actionUrl,
    dedupeKey: kirp(govde.dedupeKey, 120),
    metadata: govde.metadata,
    kaynak: product,
  });

  if (!sonuc.yazildi && sonuc.sebep === "hata") return json(500, { error: "Bildirim yazılamadı." });
  if (!sonuc.yazildi) return json(200, { yazildi: false, sebep: sonuc.sebep });
  return json(200, { yazildi: true, id: sonuc.id });
}
