import { alintiMetni, alintiSatirSayisi, govdeyiBol, metinParcalari } from "@/lib/posta-okuma";

/*
  MESAJ GÖVDESİ.

  Üç parça: yeni yazılan metin, imza (soluk) ve alıntılanan geçmiş
  (katlı). Gerekçesi lib/posta-okuma.ts'in başında — özeti: müşteri
  yanıt yazdığında istemcisi bizim önceki mesajımızı da gönderiyor ve
  okunacak iki satır, yirmi turluk geçmişin üstünde kalıyordu.

  Katlama için <details>: JavaScript gerekmiyor, sunucuda çiziliyor ve
  klavyeyle açılıyor. Alıntı GİZLENMİYOR, katlanıyor — ortak kutuda
  neyin alıntılandığı da kanıt.

  HTML olarak basılmıyor (bkz. lib/posta-ayristirma.ts): gelen içeriğin
  HTML'ini panele basmak, kurumun oturumu açıkken çalışan bir betik
  demek. Bağlantılar metinden üretiliyor; şeması yalnızca http(s) ve
  mailto olabiliyor.
*/
function Metin({ deger }: { deger: string }) {
  return <>{metinParcalari(deger).map((parca, sira) => (
    parca.tip === "baglanti"
      ? <a key={sira} href={parca.adres} target="_blank" rel="noopener noreferrer nofollow">{parca.deger}</a>
      : <span key={sira}>{parca.deger}</span>
  ))}</>;
}

export function PostaGovde({ metin }: { metin: string }) {
  const { yeni, imza, alinti } = govdeyiBol(metin ?? "");
  if (!yeni && !imza && !alinti) return <p className="posta-govde posta-govde-bos">(boş mesaj)</p>;

  return (
    <div className="posta-govde">
      {yeni ? <p className="posta-govde-metin"><Metin deger={yeni} /></p> : null}
      {imza ? <p className="posta-govde-imza"><Metin deger={imza} /></p> : null}
      {alinti ? (
        <details className="posta-govde-alinti">
          <summary>Alıntılanan yazışma · {alintiSatirSayisi(alinti)} satır</summary>
          <p><Metin deger={alintiMetni(alinti)} /></p>
        </details>
      ) : null}
    </div>
  );
}
