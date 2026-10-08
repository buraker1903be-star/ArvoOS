import Link from "next/link";
import type { Bolum } from "./os-bolumler";

/* Sayfa içindeki sekme çubuğu. Bölümler os-bolumler.ts'ten: dock'un
   ikinci katı ve Ctrl+K aynı listeyi kullanır. */
export function ModulSekmeleri({ bolumler, aktif, etiket }: { bolumler: Bolum[]; aktif: string; etiket: string }) {
  return (
    <nav className="module-tabs" aria-label={etiket}>
      {bolumler.map((bolum) => (
        <Link key={bolum.key} href={bolum.href} className={bolum.key === aktif ? "active" : ""} aria-current={bolum.key === aktif ? "page" : undefined}>{bolum.label}</Link>
      ))}
    </nav>
  );
}
