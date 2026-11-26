/*
  TEMA TERCİHİ: AÇIK / KOYU / SİSTEM (26.11.2026).

  Eskiden ArvoOS'ta iki durum vardı: kök yerleşimdeki küçük betik
  localStorage'daki "arvoos.theme" değerini okuyor, yoksa işletim
  sisteminin ayarını alıyordu. Kullanıcı bir kez seçince "sisteme uy"a
  dönmenin yolu kalmıyordu ve sistem teması gün içinde değişince
  (macOS/iOS otomatik koyu mod) açık sekme bunu İZLEMİYORDU.

  Şimdi üç tercih var. İki kavram bilerek ayrı tutuluyor:
  - TERCİH (light | dark | system): kullanıcının seçtiği, localStorage'da.
    <html data-theme-tercih> özniteliğinde de durur; menü onu gösterir.
  - TEMA (light | dark): ekrana uygulanan sonuç. <html data-theme>.
    Bütün CSS yalnızca bunu okur; "system" diye bir CSS teması yok,
    olmamalı da — her bileşen iki kez yazılırdı.

  Geriye dönük uyumlu: depolama anahtarı ve "light"/"dark" değerleri
  AYNI kaldı, panelin tema düğmesi de aynı anahtarı yazıyor. Kaydı
  olmayan (ya da tanınmayan değer taşıyan) kullanıcı "system" sayılır —
  bu, eskiden kayıtsız kullanıcının aldığı davranışın aynısı.

  Model ArvoLab'ın çalışan çözümünden alındı (lib/tema.ts, canlı commit
  b3fab7a4); değerler ArvoOS'un kendi zeminleri.

  Bu dosya saf: DOM'a dokunan iki yer (ön boyama betiği ve
  app/login/tema-istemci.ts) buradaki karar fonksiyonlarını kullanır,
  birim testi de onları sınar (tests/unit/konsol-giris-tema.test.ts).
*/

export const TEMA_ANAHTARI = "arvoos.theme";
export const TEMA_TERCIHLERI = ["light", "dark", "system"] as const;
export type TemaTercihi = (typeof TEMA_TERCIHLERI)[number];
export type Tema = "light" | "dark";
export const KOYU_SORGUSU = "(prefers-color-scheme: dark)";

/*
  Tarayıcı çubuğunun rengi (<meta name="theme-color">). Değerler
  panel-tokens.css'teki --bg ile aynı olmalı; CSS değişkeni ilk
  boyamadan önce okunamadığı için burada sabit ve birim testi ikisini
  karşılaştırır.
*/
export const TEMA_RENGI: Record<Tema, string> = { light: "#f6f7f9", dark: "#0c0e12" };

/** Depodan gelen ham değer → tercih. Bilinmeyen her şey "system". */
export function tercihOku(ham: unknown): TemaTercihi {
  return ham === "light" || ham === "dark" || ham === "system" ? ham : "system";
}

/** Tercih + işletim sisteminin koyu olup olmadığı → uygulanacak tema. */
export function temaCoz(tercih: TemaTercihi, sistemKoyu: boolean): Tema {
  if (tercih === "system") return sistemKoyu ? "dark" : "light";
  return tercih;
}

/*
  ÖN BOYAMA BETİĞİ. Kök yerleşim bunu <head>'e koyar: sayfa boyanmadan
  önce data-theme yazılır, koyu temada açılışta beyaz bir an ("flash")
  görünmez.

  Dinleyiciler de BURADA, bir bileşende değil: tema düğmesi her sayfada
  yok (panelin çoğu ekranı, giriş akışının adımları) ama sistem teması
  değişince her sayfa uymalı. Değişiklik anında tercih yeniden okunur:
  kullanıcı sonradan "Sistem"e geçerse dinleyici zaten kurulu. "storage"
  olayı başka bir sekmede yapılan seçimi bu sekmeye taşır.

  Betik eski tarayıcıları düşürmesin diye ES5 ve try/catch içinde:
  depolama kapalıysa (gizli sekme) tercih "system" sayılır.
*/
export const TEMA_BETIGI = `(function(){var K=${JSON.stringify(TEMA_ANAHTARI)},R=${JSON.stringify(TEMA_RENGI)},d=document.documentElement,m=null;try{m=window.matchMedia(${JSON.stringify(KOYU_SORGUSU)})}catch(e){}function oku(){var t=null;try{t=localStorage.getItem(K)}catch(e){}return t==="light"||t==="dark"||t==="system"?t:"system"}function uygula(){var p=oku(),t=p==="system"?(m&&m.matches?"dark":"light"):p;d.setAttribute("data-theme",t);d.setAttribute("data-theme-tercih",p);boya()}function boya(){try{var t=d.getAttribute("data-theme")==="dark"?"dark":"light",e=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<e.length;i++)if(e[i].getAttribute("content")!==R[t])e[i].setAttribute("content",R[t])}catch(x){}}uygula();try{new MutationObserver(boya).observe(document.head,{childList:true})}catch(x){}function sistem(){if(oku()==="system")uygula()}if(m){if(m.addEventListener)m.addEventListener("change",sistem);else if(m.addListener)m.addListener(sistem)}window.addEventListener("storage",function(o){if(o.key===K||o.key===null)uygula()})})()`;
