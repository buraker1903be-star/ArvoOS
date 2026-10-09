"use client";

import { useEffect, useRef, useState } from "react";
import { topluCopeAt, topluGeriAl, topluOkundu, topluOkunmadi } from "./actions";

/*
  TOPLU İŞLEM ÇUBUĞU.

  Seçim tarayıcıda, sunucuda değil: her kutucuk işaretlendiğinde sunucuya
  gitmek, otuz yazışmayı seçmeyi otuz tur yapardı. Seçilenler formun
  kendi alanları olarak (name="secili") gidiyor.

  Kutucukların kendisi tabloda, SUNUCUDA çiziliyor; burası yalnızca
  sayıyı okuyup çubuğu gösteriyor. Tabloyu istemci bileşenine çevirmek
  listenin akışlı (streaming) gelmesini bozardı.
*/
export function TopluIslem({ copte, silebilir }: { copte: boolean; silebilir: boolean }) {
  const isaret = useRef<HTMLSpanElement>(null);
  const [sayi, setSayi] = useState(0);

  useEffect(() => {
    const form = isaret.current?.closest("form");
    if (!form) return;

    const kutular = () => [...form.querySelectorAll<HTMLInputElement>('input[name="secili"]')];
    const tumu = form.querySelector<HTMLInputElement>("#posta-tumunu-sec");

    const say = () => {
      const secili = kutular().filter((kutu) => kutu.checked).length;
      setSayi(secili);
      if (tumu) {
        tumu.checked = secili > 0 && secili === kutular().length;
        /* Kısmi seçimde üçüncü durum: "tümü seçili" görünen bir kutucuk,
           basınca hepsini bırakıyormuş gibi dururdu. */
        tumu.indeterminate = secili > 0 && secili < kutular().length;
      }
    };

    const degisti = (olay: Event) => {
      const hedef = olay.target as HTMLInputElement | null;
      if (hedef === tumu) for (const kutu of kutular()) kutu.checked = tumu!.checked;
      say();
    };

    form.addEventListener("change", degisti);
    say();
    return () => form.removeEventListener("change", degisti);
  }, []);

  const birak = () => {
    const form = isaret.current?.closest("form");
    if (!form) return;
    for (const kutu of form.querySelectorAll<HTMLInputElement>('input[name="secili"], #posta-tumunu-sec')) {
      kutu.checked = false;
      kutu.indeterminate = false;
    }
    setSayi(0);
  };

  return (
    <>
      <span ref={isaret} hidden />
      {sayi ? (
        <div className="posta-toplu" role="group" aria-label="Seçilenler için işlemler">
          <b>{sayi} yazışma seçildi</b>
          {copte ? (
            silebilir ? <button className="panel-primary" type="submit" formAction={topluGeriAl}>Geri al</button> : null
          ) : (
            <>
              <button className="panel-secondary" type="submit" formAction={topluOkundu}>Okundu yap</button>
              <button className="panel-secondary" type="submit" formAction={topluOkunmadi}>Okunmadı yap</button>
              {silebilir ? <button className="panel-secondary posta-sil" type="submit" formAction={topluCopeAt}>Çöpe at</button> : null}
            </>
          )}
          <button className="posta-toplu-birak" type="button" onClick={birak}>Seçimi bırak</button>
        </div>
      ) : null}
    </>
  );
}
