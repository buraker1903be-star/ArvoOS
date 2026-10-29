/*
  JSX'ten SINIF ADI, şablon dizgisinden GÖMÜLÜ CSS ayıklama.

  Ayrı dosyada çünkü `check-css-import.mjs`'in tanımsız sınıf denetimi
  bütün depoyu okuyarak çalışıyor ve örnek ağaçla sınanamıyor; asıl
  karar burada ve doğrudan sınanıyor
  (tests/unit/stil-sinif-ayikla.test.ts). Kör kalan bir denetim,
  denetlediği hatadan farksızdır.
*/

/** Sınıf adı mı, şablondan artakalan bir değişken mi. */
export const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * `className` içinde YAZILI olan sınıf adları.
 *
 * `${...}` parçaları okunmadan atılıyor: `${dragging ? "is-dragging"
 * : ""}` yazımında değişken adı (`dragging`) sınıf sanılıyordu ve
 * denetim onlarca yanlış alarm veriyordu. Bunun bedeli, koşullu
 * sınıfların denetlenmemesi — yanlış alarm veren bir denetimden
 * kaçınmak, eksik denetime katlanmaktan daha önemli.
 */
export function siniflar(metin) {
  const bulunan = new Set();
  for (const [, duz, sablon] of metin.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const ham = duz !== undefined ? duz : (sablon ?? "").replace(/\$\{[^}]*\}/g, " ");
    for (const ad of ham.split(/\s+/).filter(Boolean)) if (KEBAB.test(ad)) bulunan.add(ad);
  }
  return bulunan;
}

/**
 * Şablon dizgisine gömülü CSS'teki sınıf adları.
 *
 * Teklif ve sözleşme belgeleri stillerini kendi `<style>` şablonunda
 * taşıyor (.doc-*); onlar da TANIM sayılmazsa denetim otuzdan fazla
 * yanlış alarm veriyor. Dizginin CSS olduğuna iki işaretle karar
 * veriliyor: süslü parantez içinde `:` ve `;`/`}`, bir de en az bir
 * `.sinif` seçicisi.
 */
export function gomuluCss(metin) {
  const bulunan = new Set();
  for (const [, govde] of metin.matchAll(/`([^`]*)`/g)) {
    if (!/\{[^}]*:[^}]*(;|\})/.test(govde)) continue;
    if (!/\.[a-zA-Z][\w-]*\s*[,{:>\s]/.test(govde)) continue;
    for (const [, ad] of govde.matchAll(/\.([a-zA-Z][\w-]*)/g)) bulunan.add(ad);
  }
  return bulunan;
}
