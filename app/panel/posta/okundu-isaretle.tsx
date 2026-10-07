"use client";

import { useEffect, useRef } from "react";

/*
  KONUŞMA AÇILINCA OKUNDU.

  Neden sunucu bileşeninde değil de burada: Next, listedeki bağlantıları
  görünür olduklarında ÖNDEN YÜKLÜYOR ve bu sunucu bileşenini
  çalıştırıyor. İşaretlemeyi render sırasında yapsaydık, kutuda aşağı
  kaydıran personel hiç açmadığı postaları okundu yapmış olurdu —
  sessizce ve geri alınamaz biçimde.

  Etki yalnızca tarayıcıda, gerçekten açıldığında çalışıyor.

  Bir kez: React 19 geliştirme kipinde etkiyi iki kez çalıştırıyor ve
  sunucu eylemi her seferinde Gmail'e giderdi. Ref, aynı sayfada ikinci
  çağrıyı engelliyor; eylem de zaten okunmuş konuşmada erken dönüyor.
*/
export function OkunduIsaretle({
  threadId,
  okunmamis,
  isaretle,
}: {
  threadId: string;
  okunmamis: boolean;
  isaretle: (formData: FormData) => Promise<void>;
}) {
  const gonderildi = useRef(false);

  useEffect(() => {
    if (!okunmamis || gonderildi.current) return;
    gonderildi.current = true;
    const veri = new FormData();
    veri.set("thread_id", threadId);
    /*
      Hata sessizce yutuluyor: okundu işaretleme okumanın yan etkisi,
      asıl iş değil. Gmail ulaşılamazsa konuşma okunmamış kalır ve bir
      sonraki açılışta yeniden denenir; kullanıcıya okuduğu her postada
      hata kutusu göstermek, işe yaramayan bir gürültü olurdu. Sunucu
      tarafında iz zaten kalıyor (runPanelAction günlüğü).
    */
    void isaretle(veri).catch(() => {});
  }, [threadId, okunmamis, isaretle]);

  return null;
}
