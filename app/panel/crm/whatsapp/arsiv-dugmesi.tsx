"use client";

import { useTransition } from "react";
import { sohbetiArsivle } from "../../settings/whatsapp/actions";

/*
  Açık yazışmanın başlığındaki arşiv düğmesi.

  Listedeki satır düğmesi (sohbet-listesi.tsx) kaydırırken hızlı temizlik
  için; bu düğme okuduktan sonra kapatmak için. Aynı yazışmayı kapatmaya
  karar veren kişi genelde onu okuyan kişidir ve o sırada listeye dönüp
  satırı aramak gereksiz bir adımdı.
*/
export default function ArsivDugmesi({ telefon, arsivde }: { telefon: string; arsivde: boolean }) {
  const [calisiyor, basla] = useTransition();

  return (
    <button
      type="button"
      className="wa-arac"
      disabled={calisiyor}
      onClick={() => basla(async () => { await sohbetiArsivle(telefon, !arsivde); })}
      title={arsivde ? "Arşivden çıkar" : "Sohbeti arşivle"}
      aria-label={arsivde ? "Arşivden çıkar" : "Sohbeti arşivle"}
    >
      {arsivde ? "↩" : "⌵"}
    </button>
  );
}
