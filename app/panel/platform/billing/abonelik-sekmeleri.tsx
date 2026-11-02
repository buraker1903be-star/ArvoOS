import Link from "next/link";

/*
  ABONELİKLER SAYFASININ SEKMELERİ (02.11.2026). Yenileme takvimi ayrı
  bir sayfaydı; kurum sahibinin isteğiyle Abonelikler'in sekmesi oldu.
  Sekme adreste (?gorunum=takvim): sorgular sunucuda, geri tuşu çalışıyor.
*/
export function AbonelikSekmeleri({ aktif }: { aktif: "liste" | "takvim" }) {
  return (
    <div className="ek-arac">
      <nav className="ek-segment" aria-label="Abonelik görünümü">
        <Link href="/panel/platform/billing" className={aktif === "liste" ? "is-active" : undefined} aria-current={aktif === "liste" ? "page" : undefined}>Abonelikler</Link>
        <Link href="/panel/platform/billing?gorunum=takvim" className={aktif === "takvim" ? "is-active" : undefined} aria-current={aktif === "takvim" ? "page" : undefined}>Yenileme takvimi</Link>
      </nav>
    </div>
  );
}
