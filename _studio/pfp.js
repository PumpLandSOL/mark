// pfp variants: a single split-flap cell mid-flip — the old cream M folding away, the amber K arriving.
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const CHROME=process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT=path.join(__dirname,'..','brand'),TMP=path.join(__dirname,'out');fs.mkdirSync(TMP,{recursive:true});
const F=`<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700&display=swap" rel="stylesheet">`;
const cell=(tilt,bg)=>`<!doctype html><html><head><meta charset="utf-8">${F}<style>
*{margin:0;padding:0}html,body{width:400px;height:400px;overflow:hidden}
body{background:${bg};display:flex;align-items:center;justify-content:center;font-family:'Barlow Condensed',Impact,sans-serif;font-weight:700}
.cell{position:relative;width:272px;height:300px;perspective:900px}
.h{position:absolute;left:0;right:0;height:50%;overflow:hidden;background:#141418;border:3px solid #0d0d10;box-sizing:border-box}
.h span{position:absolute;left:0;right:0;height:300px;line-height:300px;text-align:center;font-size:300px;letter-spacing:-.02em}
.t{top:0;border-radius:22px 22px 4px 4px;transform-origin:bottom;transform:rotateX(${tilt}deg);background:linear-gradient(#26262c,#1a1a1f)}
.t span{top:-6px;color:#f3ecd9}
.b{bottom:0;border-radius:4px 4px 22px 22px;background:linear-gradient(#141418,#1c1c22)}
.b span{bottom:-6px;color:#f0a51f}
.seam{position:absolute;left:0;right:0;top:50%;height:4px;background:#0a0a0c;transform:translateY(-50%);z-index:5}
.pin{position:absolute;top:50%;width:14px;height:34px;background:#3a3a44;border-radius:3px;transform:translateY(-50%);z-index:6}
.pin.l{left:-8px}.pin.r{right:-8px}
.shadow{position:absolute;inset:0;border-radius:22px;box-shadow:0 30px 60px -20px rgba(0,0,0,.55);z-index:-1}
</style></head><body><div class="cell"><div class="shadow"></div><div class="h t"><span>M</span></div><div class="h b"><span>K</span></div><div class="seam"></div><div class="pin l"></div><div class="pin r"></div></div></body></html>`;
const V={'mark-pfp':cell(0,'#ebe4d6'),'mark-pfp-flip':cell(-28,'#ebe4d6'),'mark-pfp-dark':cell(0,'#17150f')};
for(const [n,h] of Object.entries(V)){const f=path.join(TMP,n+'.html');fs.writeFileSync(f,h);execFileSync(CHROME,['--headless=new','--disable-gpu','--no-sandbox','--hide-scrollbars','--window-size=400,400','--virtual-time-budget=5000','--screenshot='+path.join(OUT,n+'.png'),'file:///'+f.split(String.fromCharCode(92)).join('/')],{stdio:'ignore'});console.log('✓',n)}
