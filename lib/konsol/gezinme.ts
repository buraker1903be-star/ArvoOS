/*
  KONSOL YAN MENÜSÜ: DAR / AÇIK TERCİHİ (26.11.2026).

  Kurucu konsolu 10.11.2026'dan beri altta yüzen etiketli bir dock
  kullanıyordu. Onaylı mockup ile birlikte masaüstü ve tablet ArvoLab'ın
  kabuğuna geçti: masaüstünde 240 px sol menü (daraltılabilir),
  tablette 64 px ikon rayı, TELEFONDA alt çubuk aynen duruyor.

  İki kavram ayrı:
  - TERCİH (acik | dar): kullanıcının seçtiği, localStorage'da ve
    <html data-konsol-menu> özniteliğinde.
  - GÖRÜNÜM: CSS'in kararı. Tercih yalnızca MASAÜSTÜNDE (≥1200 px) bir
    şey değiştirir; tablet her zaman ray, telefon alt çubuktur.

  Neden <html> özniteliği ve ön boyama betiği: tercih tarayıcıda, sunucu
  onu bilmiyor. React çizdikten sonra uygulansaydı dar tercihli kullanıcı
  her sayfa açılışında 240 px'lik menünün 64 px'e kaydığını görürdü.
  Tema aynı sorunu yaşadı ve çözümü aynı (lib/konsol-giris/tema.ts):
  <head>'de satır içi betik, ilk boyamadan önce özniteliği yazar.
  Görünüm yalnızca CSS'te olduğu için React ağacı iki durumda da AYNI
  çizilir; <html> zaten suppressHydrationWarning taşıyor.

  Model ArvoLab'ın çalışan çözümünden (lib/os5/gezinme.ts +
  app/_components/gezinme.ts, canlı commit b3fab7a4); anahtar ve
  öznitelik ArvoOS'un kendi adlarıyla.

  Saf modül: DOM'a dokunmaz, birim testi tests/unit/konsol-gezinme.test.ts.
*/

export const YANMENU_ANAHTARI = "arvoos.konsol.yanmenu";
export const YANMENU_OZNITELIGI = "data-konsol-menu";
export const YANMENU_DAR = "dar";

/** Masaüstü sınırı; CSS'te aynı sayı elle yazılı (os-yanmenu.css). */
export const MASAUSTU_EN_AZ = 1200;
/** Telefon sınırı; bu genişliğe kadar alt çubuk (os-navigasyon.css ile aynı). */
export const TELEFON_EN_FAZLA = 760;

/** Depodan gelen ham değer → dar mı. Bilinmeyen her şey "açık". */
export function darMi(ham: unknown): boolean {
  return ham === YANMENU_DAR;
}

/** Depoya yazılacak değer. */
export function darDegeri(dar: boolean): string {
  return dar ? YANMENU_DAR : "acik";
}

/*
  ÖN BOYAMA BETİĞİ. Kök yerleşim bunu <head>'e koyar; tema betiğinin
  yanında ve ondan bağımsız çalışır. "storage" olayı başka bir sekmede
  yapılan seçimi bu sekmeye taşır.

  ES5 ve try/catch: depolama kapalıysa (gizli sekme) tercih "açık"
  sayılır — kullanıcı menüyü görmeden kalmaz.
*/
export const YANMENU_BETIGI = `(function(){var K=${JSON.stringify(YANMENU_ANAHTARI)},O=${JSON.stringify(YANMENU_OZNITELIGI)},D=${JSON.stringify(YANMENU_DAR)},d=document.documentElement;function uygula(){var v=null;try{v=localStorage.getItem(K)}catch(e){}if(v===D)d.setAttribute(O,D);else d.removeAttribute(O)}uygula();window.addEventListener("storage",function(o){if(o.key===K||o.key===null)uygula()})})()`;
