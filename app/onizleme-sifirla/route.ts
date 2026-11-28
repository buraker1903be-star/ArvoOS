import { notFound } from "next/navigation";

/*
  ÖNİZLEME VERİSİNİ SIFIRLAR (28.11.2026).

  İşlem kabulü ödemeyi onaylıyor, talebi yanıtlıyor ve fiyatı
  yayımlıyor; ikinci koşuda o kayıtlar artık "bekleyen" olmadığı için
  betik hiçbir şey bulamıyordu. Bu uç akışı baştan koşturuyor.

  YALNIZCA ÖNİZLEMENİN VERİTABANI KİPİNDE. Bayraklar yoksa 404:
  üretim derlemesinde bu rota erişilebilir bir şey yapmıyor, zaten
  önizleme bayrağı üretim derlemesini de durduruyor.
*/
export const dynamic = "force-dynamic";

export async function POST() {
  if (process.env.ARVOOS_ONIZLEME !== "1" || process.env.ARVOOS_ONIZLEME_DB !== "1") notFound();
  const { sifirla } = await import("@/scripts/onizleme/pglite");
  await sifirla();
  return Response.json({ durum: "sıfırlandı" });
}
