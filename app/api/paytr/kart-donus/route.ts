import { NextResponse } from "next/server";
import { PLATFORM_HOST } from "@/lib/public-host";

// Kartla ödemeden sonra müşterinin döndüğü adres (merchant_ok_url /
// merchant_fail_url). PayTR buraya POST ile de gelebiliyor (hata
// durumunda fail_message taşıyor); bir sayfa rotası POST'u sunucu işlemi
// sanıp hata verirdi, bu yüzden araya bu rota kondu ve müşteri GET ile
// Ödeme ve Lisans ekranına iner.
//
// Burada HİÇBİR ŞEY ONAYLANMAZ: PayTR asenkron, müşteri buraya döndüğünde
// ödeme kesinleşmemiş olabilir. Sonuç bildirim adresine gelir; ekran
// "işleniyor" der ve kesin sonucu kayıttan okur. PayTR'nin hata metni
// adrese YAZILMAZ (dışarıdan sahte mesaj enjekte edilemesin, AGENTS.md);
// gerekçe bildirimle kayda düşüyor ve ekran oradan gösteriyor.

export const dynamic = "force-dynamic";

function don(request: Request) {
  const sonuc = new URL(request.url).searchParams.get("sonuc") === "tamam" ? "tamam" : "hata";
  return NextResponse.redirect(`https://${PLATFORM_HOST}/panel/billing?kart=${sonuc}`, 303);
}

export const GET = don;
export const POST = don;
