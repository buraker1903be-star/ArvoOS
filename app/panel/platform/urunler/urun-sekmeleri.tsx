import Link from "next/link";

/*
  ÜRÜNLER SAYFASININ SEKMELERİ (02.11.2026). Modül matrisi ayrı bir
  sayfaydı (/panel/platform/moduller); kurum sahibinin isteğiyle Ürünler'in
  sekmesi oldu. Sekme adreste (?gorunum=moduller): sorgular sunucuda,
  geri tuşu çalışıyor.
*/
export function UrunSekmeleri({ aktif, ek }: {
  aktif: "ozet" | "moduller";
  /* Sekmelerin sağındaki ikincil eylemler ("⋯" menüsü). Ürünler listesi
     27.11.2026'da tek tabloya indi; başlık satırında yalnızca dönem
     seçicisi kaldı, öteki ekranların yolları buraya taşındı. */
  ek?: React.ReactNode;
}) {
  return (
    <div className="ek-arac urun-arac">
      <nav className="ek-segment" aria-label="Ürün görünümü">
        <Link href="/panel/platform/urunler" className={aktif === "ozet" ? "is-active" : undefined} aria-current={aktif === "ozet" ? "page" : undefined}>Ürünler</Link>
        <Link href="/panel/platform/urunler?gorunum=moduller" className={aktif === "moduller" ? "is-active" : undefined} aria-current={aktif === "moduller" ? "page" : undefined}>Modül matrisi</Link>
      </nav>
      {ek}
    </div>
  );
}
