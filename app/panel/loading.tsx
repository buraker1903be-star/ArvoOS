/*
  PANEL YÜKLEME İSKELETİ — ANA EKRANIN ŞEKLİ (10.11.2026).

  Eskiden iskelet dört eşit ölçü kutusu + iki büyük blok çiziyordu; ana
  ekranda o kutular 2026-10'da kalktı (selamlama · talep grafiği · liste
  kartları) ve PR #314'te liste kartları esnek ızgaraya geçti. Yüklenirken
  dört kutu, yüklenince bambaşka bir düzen: her açılışta göz kayması.

  Şimdi aynı ölçüler ve aynı SABİT düzen (dashboard.css · .dash-sabit):
  sayfa kaymaz, liste kartları kalan yüksekliği paylaşır; telefonda
  görünüm seçici + tek panel. Sol menü ve
  çalışma alanı boşlukları yerleşimde (layout.tsx) olduğu için iskelet
  zaten aynı kutunun içinde çiziliyor; menü yüklenirken yeniden kurulmuyor.

  Tek iskelet bütün panel sayfaları için (app/panel/loading.tsx tek sınır):
  genel bakış şablonunu (os/genel-bakis.tsx) kullanan modül sayfalarına da
  benziyor. Liste sayfaları kendi düzeninde; orada iskelet yaklaşık kalır.
*/
import { PanelIskeleti } from "./panel-iskeleti";

export default function PanelLoading() {
  return <PanelIskeleti />;
}
