"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [message, setMessage] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");

    if (!email || !password) {
      setMessage("E-posta adresinizi ve şifrenizi girin.");
      return;
    }

    setMessage("Giriş altyapısı hesabınızla eşleştiriliyor. Yönetici aktivasyonu tamamlandığında panel açılacaktır.");
  }

  return (
    <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:"32px",background:"radial-gradient(circle at 20% 10%, rgba(61,92,255,.18), transparent 34%), #07101f",color:"#fff",fontFamily:"Arial, sans-serif"}}>
      <section style={{width:"min(100%, 460px)",padding:"40px",border:"1px solid rgba(255,255,255,.12)",borderRadius:"28px",background:"rgba(13,24,43,.88)",boxShadow:"0 28px 80px rgba(0,0,0,.35)"}}>
        <a href="/" style={{display:"inline-flex",marginBottom:"34px",color:"#fff",textDecoration:"none",fontWeight:800,fontSize:"22px"}}>ArvoOS</a>
        <p style={{margin:"0 0 8px",fontSize:"13px",letterSpacing:".12em",color:"#8da6ff",fontWeight:700}}>GÜVENLİ KURUMSAL ERİŞİM</p>
        <h1 style={{margin:"0 0 12px",fontSize:"38px",lineHeight:1.08}}>Hesabınıza giriş yapın</h1>
        <p style={{margin:"0 0 28px",color:"#aebbd0",lineHeight:1.65}}>Ekibinizin iş akışlarına, finansal verilerine ve yönetim paneline tek noktadan erişin.</p>

        <form onSubmit={handleSubmit} style={{display:"grid",gap:"18px"}}>
          <label style={{display:"grid",gap:"8px",fontSize:"14px",fontWeight:700}}>E-posta
            <input name="email" type="email" autoComplete="email" placeholder="ad@sirketiniz.com" style={{height:"52px",borderRadius:"14px",border:"1px solid rgba(255,255,255,.14)",background:"rgba(255,255,255,.06)",color:"#fff",padding:"0 16px",fontSize:"16px",outline:"none"}} />
          </label>
          <label style={{display:"grid",gap:"8px",fontSize:"14px",fontWeight:700}}>Şifre
            <input name="password" type="password" autoComplete="current-password" placeholder="Şifreniz" style={{height:"52px",borderRadius:"14px",border:"1px solid rgba(255,255,255,.14)",background:"rgba(255,255,255,.06)",color:"#fff",padding:"0 16px",fontSize:"16px",outline:"none"}} />
          </label>
          <div style={{display:"flex",justifyContent:"space-between",gap:"16px",fontSize:"14px"}}>
            <label style={{display:"flex",alignItems:"center",gap:"8px",color:"#aebbd0"}}><input type="checkbox" /> Beni hatırla</label>
            <a href="mailto:destek@arvo-os.com?subject=ArvoOS%20Şifre%20Sıfırlama" style={{color:"#9db0ff",textDecoration:"none"}}>Şifremi unuttum</a>
          </div>
          <button type="submit" style={{height:"54px",border:0,borderRadius:"14px",background:"#5d72ff",color:"#fff",fontSize:"16px",fontWeight:800,cursor:"pointer"}}>Giriş Yap →</button>
          {message && <p role="status" style={{margin:0,padding:"13px 14px",borderRadius:"12px",background:"rgba(93,114,255,.13)",color:"#cbd4ff",fontSize:"14px",lineHeight:1.5}}>{message}</p>}
        </form>

        <p style={{margin:"26px 0 0",color:"#8998af",fontSize:"13px",textAlign:"center"}}>Hesabınız yoksa kurum yöneticinizden davet isteyin.</p>
      </section>
    </main>
  );
}
