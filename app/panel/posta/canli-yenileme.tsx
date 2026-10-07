"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/*
  AÇIK SEKMEDE CANLI TAZELEME.

  Zamanlayıcı iki dakikada bir koşuyor; kutuya BAKAN kişi için uzun.
  Sekme açık ve GÖRÜNÜR olduğu sürece dakikada bir eşitleme tetikleniyor
  ve sayfa yenileniyor.

  GÖRÜNÜRLÜK ŞART. Sayaç yalnızca sekme öndeyken işliyor; arkaya atılan
  ya da başka pencerenin altında kalan sekme Gmail'e hiç gitmiyor. Bunu
  koymayan ilk taslak, unutulup açık bırakılan bir sekmeyle kutuyu gece
  boyu yokluyordu — kimsenin bakmadığı bir ekran için.

  Öne DÖNÜNCE hemen bir tur: masaya geri gelen kişinin ilk gördüğü şey
  bir dakika önceki kutu olmasın.

  Hız sınırı sunucuda (actions.ts · ASGARI_ARALIK_MS): beş açık sekme
  beş tur açmasın. Burada ayrıca sınırlamıyoruz — sınırın iki yerde
  olması, biri değişince diğerinin sessizce yanlış kalması demek.
*/
const ARALIK_MS = 60 * 1000;

export function CanliYenileme({ yenile }: { yenile: () => Promise<void> }) {
  const router = useRouter();
  // Tur sürerken ikincisi başlamasın: yavaş bir eşitleme sayaçla yarışır.
  const suruyor = useRef(false);

  useEffect(() => {
    let kapandi = false;

    const tur = async () => {
      if (kapandi || suruyor.current) return;
      if (document.visibilityState !== "visible") return;
      suruyor.current = true;
      try {
        await yenile();
        if (!kapandi) router.refresh();
      } catch {
        /* Eylem hatayı zaten yutuyor; buradaki ağ kesintisi de sessiz
           kalmalı — arka plan tazelemesi ekrana uyarı düşürmemeli. */
      } finally {
        suruyor.current = false;
      }
    };

    const sayac = setInterval(() => void tur(), ARALIK_MS);
    const gorunurlukDegisti = () => { if (document.visibilityState === "visible") void tur(); };
    document.addEventListener("visibilitychange", gorunurlukDegisti);

    return () => {
      kapandi = true;
      clearInterval(sayac);
      document.removeEventListener("visibilitychange", gorunurlukDegisti);
    };
  }, [router, yenile]);

  return null;
}
