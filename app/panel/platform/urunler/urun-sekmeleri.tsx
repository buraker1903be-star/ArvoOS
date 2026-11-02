import Link from "next/link";

/*
  ÜRÜNLER SAYFASININ SEKMELERİ (02.11.2026). Modül matrisi ayrı bir
  sayfaydı (/panel/platform/moduller); kurum sahibinin isteğiyle Ürünler'in
  sekmesi oldu. Sekme adreste (?gorunum=moduller): sorgular sunucuda,
  geri tuşu çalışıyor.
*/
export function UrunSekmeleri({ aktif }: { aktif: "ozet" | "moduller" }) {
  return (
    <div className="ek-arac">
      <nav className="ek-segment" aria-label="Ürün görünümü">
        <Link href="/panel/platform/urunler" className={aktif === "ozet" ? "is-active" : undefined} aria-current={aktif === "ozet" ? "page" : undefined}>Ürünler</Link>
        <Link href="/panel/platform/urunler?gorunum=moduller" className={aktif === "moduller" ? "is-active" : undefined} aria-current={aktif === "moduller" ? "page" : undefined}>Modül matrisi</Link>
      </nav>
    </div>
  );
}
