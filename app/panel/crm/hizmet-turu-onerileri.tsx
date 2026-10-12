/*
  Düzenleme formlarındaki "Hizmet türü" alanı serbest metin kalıyor
  (eski kayıtta listede artık olmayan bir ad olabilir); kurumun listesi
  (Ayarlar → Hizmet türleri) yalnızca öneri olarak çıkıyor.
*/
export function HizmetTuruOnerileri({ liste }: { liste: string[] }) {
  return <datalist id="hizmet-turu-onerileri">{liste.map((ad) => <option key={ad} value={ad} />)}</datalist>;
}
