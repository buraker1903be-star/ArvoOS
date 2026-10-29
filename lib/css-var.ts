import type { CSSProperties } from "react";

/*
  Ölçüyü CSS değişkeniyle vermek için. TSX'te satır içi stil yasak
  (AGENTS.md "Stil"); genişlik/yükseklik gibi hesaplanan tek değer
  bir değişkene yazılıyor, görünümün kalanı CSS'te kalıyor.

  BURADA, rapor modülünde DEĞİL. Önce app/panel/finance/raporlar/
  rapor-parcalari.tsx içindeydi; oradan import eden her sayfa o
  dosyanın BÜTÜN sınıflarını kendi rota grafiğine sokuyordu ve
  `npm run check:css` "rotaya yüklenmeyen stiller" diye otuz beş
  sınıf sayıyordu (29.10.2026, hedefler sayfası). Tek satırlık bir
  yardımcı için bir rapor modülünü bağlamak gerekmiyor.
*/
export const cssVar = (name: string, value: string) => ({ [name]: value }) as CSSProperties;
