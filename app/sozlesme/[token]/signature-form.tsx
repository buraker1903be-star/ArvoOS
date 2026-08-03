"use client";

import { useEffect, useRef, useState } from "react";
import { signContract } from "./actions";

export function ContractSignatureForm({ token }: { token: string }) {
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
      context.strokeStyle = "#1358c8";
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
    const data = canvasRef.current?.toDataURL("image/png") || "";
    setSignatureData(data);
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
      setMessage("Lütfen mavi imza alanına imzanızı çiziniz.");
    }
  };

  return <form className="ct-form print-hide" action={signContract.bind(null, token)} onSubmit={validate}>
    <label>Ad Soyad<input type="text" name="signer_name" required minLength={2} autoComplete="name" /></label>
    <div className="ct-signature-field">
      <div className="ct-signature-head"><strong>Mavi İmza</strong><button type="button" onClick={clear}>Temizle</button></div>
      <canvas
        ref={canvasRef}
        className="ct-signature-canvas"
        onPointerDown={start}
        onPointerMove={draw}
        onPointerUp={finish}
        onPointerCancel={finish}
        aria-label="Mavi renk çizim imza alanı"
      />
      <input type="hidden" name="signature_data" value={signatureData} />
      <small>Fare, trackpad veya parmağınızla mavi alana imzanızı çiziniz.</small>
    </div>
    {message ? <p className="ct-form-error">{message}</p> : null}
    <label className="ct-accept"><input type="checkbox" name="accepted" required/><span>Sözleşmenin tamamını, hizmet kapsamını ve ödeme planını okudum; kendi irademle kabul ediyorum.</span></label>
    <button type="submit">Sözleşmeyi Mavi İmza ile Onayla</button>
  </form>;
}
