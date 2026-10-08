"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/*
  Hesap menüsü (os-user-menu.tsx) sunucuda çizilen bir <details>. Tarayıcı
  onu yalnızca başlığına basınca kapatıyor; eskiden menünün dışına
  tıklamak, Esc ya da menüden bir sayfaya gitmek menüyü açık bırakıyordu.

  Bu bileşen yalnızca kapatma davranışını ekler: dışarıya basınca, Esc'e
  basınca (odak düğmeye döner) ve sayfa değişince.
*/
const SECICI = "details.os-user[open]";

export function OsMenuKapat() {
  const yol = usePathname();

  useEffect(() => {
    document.querySelectorAll<HTMLDetailsElement>(SECICI).forEach((menu) => { menu.open = false; });
  }, [yol]);

  useEffect(() => {
    const disari = (olay: PointerEvent) => {
      document.querySelectorAll<HTMLDetailsElement>(SECICI).forEach((menu) => {
        if (!menu.contains(olay.target as Node)) menu.open = false;
      });
    };
    const tus = (olay: KeyboardEvent) => {
      if (olay.key !== "Escape") return;
      document.querySelectorAll<HTMLDetailsElement>(SECICI).forEach((menu) => {
        menu.open = false;
        menu.querySelector("summary")?.focus();
      });
    };
    document.addEventListener("pointerdown", disari);
    document.addEventListener("keydown", tus);
    return () => {
      document.removeEventListener("pointerdown", disari);
      document.removeEventListener("keydown", tus);
    };
  }, []);

  return null;
}
