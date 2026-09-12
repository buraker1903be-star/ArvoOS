"use client";

import { useEffect, useRef, useState } from "react";
import { signContract } from "./actions";

export function ContractSignatureForm({ token, consumer }: { token: string; consumer: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);
  const [signatureData, setSignatureData] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = 2.4;
      context.strokeStyle = "#1a3f8f";
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    hasInkRef.current = true;
    const current = point(event);
    context.beginPath();
    context.moveTo(current.x, current.y);
    setMessage("");
  };

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const current = point(event);
    context.lineTo(current.x, current.y);
    context.stroke();
  };

  const finish = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    canvasRef.current?.releasePointerCapture(event.pointerId);
    setSignatureData(canvasRef.current?.toDataURL("image/png") || "");
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    hasInkRef.current = false;
    setSignatureData("");
    setMessage("");
  };

  const validate = (event: React.FormEvent<HTMLFormElement>) => {
    if (!hasInkRef.current || !signatureData) {
      event.preventDefault();
      setMessage("Lütfen imza alanına imzanızı çiziniz.");
    }
  };

  return <form id="imza" className="ad-form print-hide" action={signContract.bind(null, token)} onSubmit={validate}>
    <div className="ad-form-head">
      <div className="ad-kicker">Elektronik imza alanı</div>
      <h3>Sözleşmeyi onaylayın</h3>
      <p>Sözleşmenin tamamını okuduktan sonra ad soyadınızı yazın, imzanızı çizin ve onay beyanlarını işaretleyin.</p>
    </div>
    <label className="ad-field">{consumer ? "Ad Soyad" : "Yetkili Ad Soyad"}<input type="text" name="signer_name" required minLength={2} maxLength={180} autoComplete="name" /></label>
    <div className="ad-signature-field">
      <div className="ad-signature-head"><strong>İmza</strong><button type="button" onClick={clear}>Temizle</button></div>
      <canvas
        ref={canvasRef}
        className="ad-signature-canvas"
        onPointerDown={start}
        onPointerMove={draw}
        onPointerUp={finish}
        onPointerCancel={finish}
        aria-label="İmza çizim alanı"
      />
      <input type="hidden" name="signature_data" value={signatureData} />
      <small>Fare, trackpad veya parmağınızla alana imzanızı çiziniz.</small>
    </div>
    {message ? <p className="ad-form-error" role="alert">{message}</p> : null}
    <fieldset className="ad-consent-set">
      <legend>Onay beyanları</legend>
      <label className="ad-check"><input type="checkbox" name="consent_contract" required /><span><b>Sözleşmeyi okudum ve kabul ediyorum.</b> Hizmet kapsamını, ücret ve ödeme koşullarını, gizlilik hükümlerini ve Sözleşme’nin diğer tüm maddelerini okudum; kendi özgür irademle kabul ediyorum.</span></label>
      {consumer
        ? <label className="ad-check"><input type="checkbox" name="consent_preinfo" required /><span><b>Ön Bilgilendirme Formu’nu okudum.</b> Sözleşme kurulmadan önce Ek-1 Ön Bilgilendirme Formu’nu okuduğumu ve cayma hakkım dahil bilgilendirildiğimi teyit ederim.</span></label>
        : <label className="ad-check"><input type="checkbox" name="consent_commercial" required /><span><b>Ticari işlem beyanı.</b> Bu sözleşmeyi ticari veya mesleki faaliyetim kapsamında ve temsil ettiğim kişi adına onaylamaya yetkili olarak akdettiğimi beyan ederim.</span></label>}
      <label className="ad-check"><input type="checkbox" name="consent_kvkk" required /><span><b>KVKK Aydınlatma Metni’ni okudum.</b> Kişisel verilerimin Sözleşme’nin “Kişisel Verilerin Korunması” maddesinde açıklanan amaç ve hukuki sebeplerle işleneceği konusunda bilgilendirildim.</span></label>
      {consumer ? <label className="ad-check ad-check-optional"><input type="checkbox" name="consent_early_start" /><span><b>İsteğe bağlı:</b> Hizmete 14 günlük cayma süresi dolmadan başlanmasını talep ediyorum. Cayma süresi içinde ifasına başlanan hizmetlerde Mesafeli Sözleşmeler Yönetmeliği m.15/1-(ğ) uyarınca cayma hakkımı kullanamayacağım konusunda bilgilendirildim.</span></label> : null}
    </fieldset>
    <p className="ad-form-legal">“Sözleşmeyi İmzala” butonuna bastığınızda ad soyadınız, çizdiğiniz imza, onay beyanlarınız, işlem tarihi ve saati, IP adresiniz ve cihaz/tarayıcı bilginiz Sözleşme’nin delil hükmü uyarınca kayıt altına alınır ve imza bölümünde gösterilir.</p>
    <button type="submit">Sözleşmeyi İmzala</button>
  </form>;
}
