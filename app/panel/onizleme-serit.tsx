import "./onizleme-serit.css";

/*
  ÖNİZLEME ŞERİDİ (27.11.2026 ara kontrolü).

  Önizlemede Supabase sahte: okumalar örnek veriden geliyor, YAZMALAR
  hiçbir şey kaydetmeden "başarılı" dönüyor. Ekranda bunu söyleyen
  hiçbir şey yoktu; "ödemeyi onayla"ya basıp başarı bildirimi görmek,
  ödemenin gerçekten onaylandığı izlenimi veriyordu. Sessiz başarı
  kanıt değildir — şerit bunu ekranın kendisinde söylüyor.

  Yalnızca ARVOOS_ONIZLEME=1 ile çiziliyor; bayrak üretim
  derlemesinde hata veriyor (next.config.ts), yani bu şeridin canlıya
  çıkması mümkün değil.
*/
export function OnizlemeSerit() {
  if (process.env.ARVOOS_ONIZLEME !== "1") return null;
  return (
    <div className="onizleme-serit" role="status">
      <b>ÖNİZLEME</b>
      <span>
        Veriler örnek, yazma işlemleri SİMÜLASYON: onay, yayım, yanıt ve otomasyon hiçbir şey kaydetmiyor.
        Başarı bildirimi işlemin gerçekleştiği anlamına gelmez.
      </span>
    </div>
  );
}
