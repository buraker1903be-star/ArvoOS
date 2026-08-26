"use client";

import { useEffect, useRef, useState } from "react";
import { signConfidentialityAgreement } from "./actions";

export function ConfidentialitySignatureForm({ agreementId, defaultName }: { agreementId: string; defaultName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [signature, setSignature] = useState("");
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
      context.lineWidth = 2.5;
      context.strokeStyle = "#1358c8";
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.setPointerCapture(event.pointerId);
    drawing.current = true;
    hasInk.current = true;
    const current = point(event);
    context.beginPath();
    context.moveTo(current.x, current.y);
    setMessage("");
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const current = point(event);
    context.lineTo(current.x, current.y);
    context.stroke();
  };
  const finish = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    canvasRef.current?.releasePointerCapture(event.pointerId);
    setSignature(canvasRef.current?.toDataURL("image/png") || "");
  };
  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
    setSignature("");
    setMessage("");
  };

  return <form className="nda-sign-form" action={signConfidentialityAgreement.bind(null, agreementId)} onSubmit={(event) => { if (!hasInk.current || !signature) { event.preventDefault(); setMessage("Lütfen imzanızı çiziniz."); } }}>
    <label>Ad Soyad<input name="signer_name" required minLength={2} defaultValue={defaultName} autoComplete="name" /></label>
    <div className="nda-signature-field">
      <div><strong>Elektronik İmza</strong><button type="button" onClick={clear}>Temizle</button></div>
      <canvas ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} aria-label="İmza çizim alanı" />
      <input type="hidden" name="signature_data" value={signature} />
      <small>Fare, trackpad veya parmağınızla mavi alana imzanızı çiziniz.</small>
    </div>
    {message ? <p className="nda-error">{message}</p> : null}
    <label className="nda-accept"><input type="checkbox" name="accepted" required /><span>Sözleşmenin tamamını okudum, anladım ve kendi irademle kabul ediyorum.</span></label>
    <button className="panel-primary" type="submit">Sözleşmeyi İmzala</button>
  </form>;
}
