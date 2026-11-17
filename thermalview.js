(()=>{
/* Temperature page (temperature.html): thermal camera recordings from thermal.js.
   The chart engine is the Data page's (dataview.js) with zoom in / zoom out,
   Ctrl + scroll zoom and panning added. */
const D=window.WARELAB_THERMAL,$=id=>document.getElementById(id);
const root=$('thermal-root');if(!root)return;
const detail=$('thermal-detail'),tabs=$('thermal-tabs'),compare=$('thermal-compare');
if(!D||!D.tests||!D.tests.length){detail.innerHTML='<div class="note"><strong>No temperature data found.</strong><p>Run exportThermalData.m in MATLAB to generate thermal.js.</p></div>';return;}
const cssVar=n=>getComputedStyle(root).getPropertyValue(n).trim()||getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const motion=()=>document.body.classList.contains('has-motion');

/* =====================================================================
   FORMATTING + HELPERS
   ===================================================================== */
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtDate=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||'');return m?MONTHS[+m[2]-1]+' '+(+m[3])+', '+m[1]:(s||'—');};
const fmtNum=(v,d=1)=>v===null||v===undefined||!isFinite(v)?'—':(+v).toFixed(d);
const fmtC=(v,d=1)=>fmtNum(v,d)+' °C';
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
const slug=s=>String(s).replace(/[^A-Za-z0-9.]+/g,'_').replace(/^_+|_+$/g,'');
function clockAt(t,sec){const m=/^(\d+):(\d+):(\d+)$/.exec(t.startClock||'');if(!m)return '';let s=Math.floor(+m[1]*3600+ +m[2]*60+ +m[3]+sec)%86400;const p=n=>String(n).padStart(2,'0');return p(Math.floor(s/3600))+':'+p(Math.floor(s/60)%60)+':'+p(s%60);}

function downloadCSV(name,headers,rows){
  const esc=v=>{const s=v===null||v===undefined?'':String(v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
  const text=[headers.map(esc).join(',')].concat(rows.map(r=>r.map(esc).join(','))).join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+text],{type:'text/csv'}));a.download=name+'.csv';document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);
}

/* =====================================================================
   STATS
   ===================================================================== */
function movAvg(y,win){
  const n=y.length,h=Math.max(0,Math.floor(win/2)),out=new Array(n);let s=0,c=0,lo=0,hi=-1;
  for(let i=0;i<n;i++){const a=Math.max(0,i-h),b=Math.min(n-1,i+h);while(hi<b){hi++;s+=y[hi];c++;}while(lo<a){s-=y[lo];lo++;c--;}out[i]=s/c;}
  return out;
}
function derivative(t,y){
  const n=y.length,out=new Array(n);
  for(let i=0;i<n;i++){const a=Math.max(0,i-1),b=Math.min(n-1,i+1);out[i]=t[b]>t[a]?(y[b]-y[a])/(t[b]-t[a]):0;}
  return out;
}
const r3=v=>Math.round(v*1000)/1000;
function analyze(t){
  const T=t.temp_C,x=t.time_s,n=T.length,dur=x[n-1]-x[0],fps=(n-1)/dur;
  const avg1=movAvg(T,Math.round(fps)).map(r3);                 // 1 s average
  const rate=movAvg(derivative(x,movAvg(T,Math.round(fps/2))),Math.round(fps/2)).map(v=>Math.round(v*100)/100); // °C/s from 0.5 s smoothing
  let iPk=0,iLow=0,iPkA=0,iUp=0,iDown=0;
  for(let i=1;i<n;i++){if(T[i]>T[iPk])iPk=i;if(T[i]<T[iLow])iLow=i;if(avg1[i]>avg1[iPkA])iPkA=i;if(rate[i]>rate[iUp])iUp=i;if(rate[i]<rate[iDown])iDown=i;}
  const mean=(a,b)=>{let s=0,c=0;for(let i=0;i<n;i++)if(x[i]>=a&&x[i]<=b){s+=T[i];c++;}return c?s/c:NaN;};
  const start=mean(x[0],x[0]+1),end=mean(x[n-1]-1,x[n-1]);
  const half=start+(T[iPk]-start)/2;let above=0,hotSum=0;
  for(let i=0;i<n;i++)if(T[i]>=half){above++;hotSum+=T[i];}
  return {T,x,n,dur,fps,avg1,rate,iPk,iPkA,iLow,iUp,iDown,start,end,half,
    peak:T[iPk],peakAvg:avg1[iPkA],low:T[iLow],rise:T[iPk]-start,
    timeAbove:above/fps,meanHot:above?hotSum/above:NaN,maxUp:rate[iUp],maxDown:rate[iDown]};
}
const tests=D.tests.map(t=>({...t,s:analyze(t)}));

function summaryText(t){
  const s=t.s;
  return 'Starting at '+fmtC(s.start)+', the hottest point in the measured area reached '+fmtC(s.peak)+' at '+fmtNum(s.x[s.iPk])+' s (frame '+t.frame[s.iPk]+'), '+fmtNum(s.rise)+' °C above where it started. '
    +'It spent '+fmtNum(s.timeAbove)+' s above '+fmtC(s.half)+' (halfway to the peak), heated as fast as '+fmtNum(s.maxUp)+' °C/s, and was at '+fmtC(s.end)+' when the recording ended.';
}
function statsRows(t){
  const s=t.s;
  return [
    ['Peak temperature',fmtC(s.peak),'at '+fmtNum(s.x[s.iPk])+' s · frame '+t.frame[s.iPk]],
    ['Peak 1 s average',fmtC(s.peakAvg),'ignores single-frame spikes'],
    ['Starting temperature',fmtC(s.start),'average of the first second'],
    ['Rise above start',fmtNum(s.rise)+' °C','peak minus starting temperature'],
    ['Time above '+fmtC(s.half),fmtNum(s.timeAbove)+' s','halfway between start and peak'],
    ['Average while above it',fmtC(s.meanHot),'mean of those frames'],
    ['Fastest heating',fmtNum(s.maxUp)+' °C/s','at '+fmtNum(s.x[s.iUp])+' s'],
    ['Fastest cooling',fmtNum(Math.abs(s.maxDown))+' °C/s','at '+fmtNum(s.x[s.iDown])+' s'],
    ['Lowest temperature',fmtC(s.low),'at '+fmtNum(s.x[s.iLow])+' s'],
    ['Ending temperature',fmtC(s.end),'average of the last second'],
  ];
}

/* =====================================================================
   CHART ENGINE (canvas, hover tooltip, drag / buttons / Ctrl+scroll zoom)
   ===================================================================== */
function niceTicks(lo,hi,n=6){
  if(!(hi>lo)){hi=lo+1;}
  const span=hi-lo,step0=span/n,mag=Math.pow(10,Math.floor(Math.log10(step0))),r=step0/mag;
  const step=(r<1.5?1:r<3?2:r<7?5:10)*mag,start=Math.ceil(lo/step)*step,ticks=[];
  for(let v=start;v<=hi+step*1e-6;v+=step)ticks.push(+v.toFixed(10));
  return {ticks,step};
}
function lowerBound(arr,x){let lo=0,hi=arr.length;while(lo<hi){const m=(lo+hi)>>1;if(arr[m]<x)lo=m+1;else hi=m;}return lo;}

class Chart{
  constructor(host,o){
    this.o=o;this.host=host;this.zoom=null;
    host.classList.add('plot');
    this.c=el('canvas');this.ov=el('canvas','overlay');this.tip=el('div','tip');
    this.c.setAttribute('role','img');this.c.setAttribute('aria-label',o.aria||o.yLabel+' against '+o.xLabel);
    this.ov.setAttribute('aria-hidden','true');
    host.append(this.c,this.ov,this.tip);
    this.hint=el('div','hint','Drag to zoom · Ctrl + scroll to zoom in/out · double-click to reset');host.append(this.hint);
    const all=o.series.filter(s=>s.x&&s.x.length);
    this.full=[Math.min(...all.map(s=>s.x[0])),Math.max(...all.map(s=>s.x[s.x.length-1]))];
    this.bind();
    new ResizeObserver(()=>this.draw()).observe(host);
    new MutationObserver(()=>this.draw()).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  }
  range(){return this.zoom||this.full;}
  fit(c){const dpr=Math.min(devicePixelRatio||1,2),w=c.clientWidth,h=c.clientHeight;c.width=Math.max(1,Math.round(w*dpr));c.height=Math.max(1,Math.round(h*dpr));const x=c.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);return [w,h,x];}
  layout(w,h){const p={l:62,r:18,t:16,b:46};return {p,pw:w-p.l-p.r,ph:h-p.t-p.b};}
  yDomain(x0,x1){
    let lo=Infinity,hi=-Infinity;
    for(const s of this.o.series){if(s.visible===false||!s.x)continue;const i0=lowerBound(s.x,x0),i1=Math.min(s.x.length,lowerBound(s.x,x1)+1);for(let i=i0;i<i1;i++){const v=s.y[i];if(v===null||!isFinite(v))continue;if(v<lo)lo=v;if(v>hi)hi=v;}}
    if(this.o.zeroBase){lo=Math.min(lo,0);hi=Math.max(hi,0);}
    if(!isFinite(lo)){lo=0;hi=1;}
    if(hi===lo){hi+=1;lo-=1;}
    const pad=(hi-lo)*.08;return [lo-pad,hi+pad];
  }
  draw(target){
    const [w,h,x]=target?[target.w,target.h,target.ctx]:this.fit(this.c);if(!target)this.fit(this.ov);
    const {p,pw,ph}=this.layout(w,h),[x0,x1]=this.range(),[y0,y1]=this.yDomain(x0,x1);
    const X=v=>p.l+(v-x0)/(x1-x0)*pw,Y=v=>p.t+ph-(v-y0)/(y1-y0)*ph;
    this.map={X,Y,p,pw,ph,x0,x1,y0,y1};
    if(target){x.fillStyle=cssVar('--surface');x.fillRect(0,0,w,h);}else x.clearRect(0,0,w,h);
    const grid=cssVar('--grid'),axis=cssVar('--axis'),muted=cssVar('--muted'),ink=cssVar('--ink'),mono=cssVar('--mono')||'monospace',font=cssVar('--font')||'sans-serif';
    x.font='11px '+mono;x.fillStyle=muted;x.lineWidth=1;
    const yt=niceTicks(y0,y1,5),xt=niceTicks(x0,x1,8);
    x.strokeStyle=grid;
    yt.ticks.forEach(v=>{const yy=Math.round(Y(v))+.5;x.beginPath();x.moveTo(p.l,yy);x.lineTo(p.l+pw,yy);x.stroke();x.textAlign='right';x.fillText(this.fmtTick(v,yt.step),p.l-8,yy+4);});
    xt.ticks.forEach(v=>{const xx=Math.round(X(v))+.5;x.beginPath();x.moveTo(xx,p.t);x.lineTo(xx,p.t+ph);x.stroke();x.textAlign='center';x.fillText(this.fmtTick(v,xt.step),xx,p.t+ph+16);});
    x.strokeStyle=axis;x.beginPath();x.moveTo(p.l,p.t+ph+.5);x.lineTo(p.l+pw,p.t+ph+.5);x.stroke();
    x.fillStyle=ink;x.font='600 12px '+font;x.textAlign='center';x.fillText(this.o.xLabel,p.l+pw/2,h-6);
    x.save();x.translate(14,p.t+ph/2);x.rotate(-Math.PI/2);x.fillText(this.o.yLabel,0,0);x.restore();
    x.save();x.beginPath();x.rect(p.l,p.t-2,pw,ph+4);x.clip();
    (this.o.hlines||[]).forEach(L=>{if(L.y<y0||L.y>y1)return;x.strokeStyle=muted;x.setLineDash([5,4]);x.beginPath();x.moveTo(p.l,Y(L.y));x.lineTo(p.l+pw,Y(L.y));x.stroke();x.setLineDash([]);x.font='11px '+mono;const tw=x.measureText(L.label).width;x.fillStyle=cssVar('--surface');x.fillRect(p.l+pw-tw-12,Y(L.y)-19,tw+8,15);x.fillStyle=muted;x.textAlign='right';x.fillText(L.label,p.l+pw-8,Y(L.y)-8);});
    for(const s of this.o.series){if(s.visible===false)continue;const col=cssVar(s.color);
      if(s.kind==='points')this.drawPoints(x,s,col);else this.drawLine(x,s,col,pw);}
    x.restore();
  }
  fmtTick(v,step){const d=step>=1?0:Math.min(4,Math.ceil(-Math.log10(step)));return v.toFixed(d);}
  drawLine(x,s,col,pw){
    const {X,Y,x0,x1}=this.map,i0=Math.max(0,lowerBound(s.x,x0)-1),i1=Math.min(s.x.length,lowerBound(s.x,x1)+1),n=i1-i0;
    x.strokeStyle=col;x.lineWidth=s.width||2;x.lineJoin='round';x.lineCap='round';if(s.dash)x.setLineDash(s.dash);
    x.beginPath();let started=false;
    if(n>pw*2){ // min/max decimation per pixel column keeps every peak visible
      let col0=-1,mn=0,mx=0,first=0;
      const flush=()=>{if(col0<0)return;const xx=col0+.5;if(!started){x.moveTo(xx,Y(first));started=true;}x.lineTo(xx,Y(mn));x.lineTo(xx,Y(mx));};
      for(let i=i0;i<i1;i++){const v=s.y[i];if(v===null)continue;const c=Math.floor(X(s.x[i]));if(c!==col0){flush();col0=c;mn=mx=first=v;}else{if(v<mn)mn=v;if(v>mx)mx=v;}}
      flush();
    }else{
      for(let i=i0;i<i1;i++){const v=s.y[i];if(v===null){started=false;continue;}const xx=X(s.x[i]),yy=Y(v);if(!started){x.moveTo(xx,yy);started=true;}else x.lineTo(xx,yy);}
    }
    x.stroke();x.setLineDash([]);
    if(s.dots&&n<=pw/6){x.fillStyle=col;for(let i=i0;i<i1;i++){const v=s.y[i];if(v===null)continue;x.beginPath();x.arc(X(s.x[i]),Y(v),2.4,0,Math.PI*2);x.fill();}}
  }
  drawPoints(x,s,col){
    const {X,Y,x0,x1}=this.map,surf=cssVar('--surface'),r=s.size||4.5;
    for(let i=0;i<s.x.length;i++){if(s.x[i]<x0||s.x[i]>x1)continue;x.beginPath();x.arc(X(s.x[i]),Y(s.y[i]),r,0,Math.PI*2);x.fillStyle=col;x.strokeStyle=surf;x.lineWidth=2;x.fill();x.stroke();}
  }
  bind(){
    let drag=null;
    const pos=e=>{const r=this.ov.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];};
    const toX=px=>{const m=this.map;return m.x0+(px-m.p.l)/m.pw*(m.x1-m.x0);};
    this.ov.addEventListener('pointermove',e=>{const [px,py]=pos(e);if(drag){drag.x1=px;this.overlay(null,drag);return;}this.hover(px,py);});
    this.ov.addEventListener('pointerleave',()=>{if(!drag){this.tip.classList.remove('show');this.clearOverlay();}});
    this.ov.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')return;const [px]=pos(e);drag={x0:px,x1:px};this.ov.setPointerCapture(e.pointerId);this.tip.classList.remove('show');});
    this.ov.addEventListener('pointerup',()=>{if(!drag)return;const a=Math.min(drag.x0,drag.x1),b=Math.max(drag.x0,drag.x1);drag=null;this.clearOverlay();if(b-a>8){const [f0,f1]=this.full;this.setZoom([Math.max(f0,toX(a)),Math.min(f1,toX(b))]);}});
    this.ov.addEventListener('dblclick',()=>this.setZoom(null));
    // Ctrl + scroll (or a trackpad pinch) zooms around the pointer; plain scrolling still scrolls the page
    this.ov.addEventListener('wheel',e=>{if(!e.ctrlKey&&!e.metaKey)return;e.preventDefault();const [px]=pos(e);this.zoomBy(e.deltaY>0?1.25:0.8,toX(px));},{passive:false});
  }
  setZoom(z){this.zoom=z;this.draw();if(this.o.onZoom)this.o.onZoom(z);}
  zoomBy(f,center){
    const [a,b]=this.range(),[f0,f1]=this.full,full=f1-f0;if(center===undefined)center=(a+b)/2;
    let w=(b-a)*f;if(w>=full){this.setZoom(null);return;}
    w=Math.max(w,this.o.minSpan||full/1000);
    let n0=center-(center-a)*(w/(b-a)),n1=n0+w;
    if(n0<f0){n0=f0;n1=f0+w;}if(n1>f1){n1=f1;n0=f1-w;}
    this.setZoom([n0,n1]);
  }
  panBy(frac){
    if(!this.zoom)return;const [a,b]=this.zoom,[f0,f1]=this.full;let d=(b-a)*frac;
    if(a+d<f0)d=f0-a;if(b+d>f1)d=f1-b;this.setZoom([a+d,b+d]);
  }
  renderTo(ctx,left,top,w,h){const saved=this.map;ctx.save();ctx.translate(left,top);this.draw({w,h,ctx});ctx.restore();this.map=saved;}
  clearOverlay(){const x=this.ov.getContext('2d');x.clearRect(0,0,this.ov.width,this.ov.height);}
  overlay(hit,drag){
    const x=this.ov.getContext('2d'),m=this.map;this.clearOverlay();
    if(drag){x.fillStyle=cssVar('--select');const a=Math.max(m.p.l,Math.min(drag.x0,drag.x1)),b=Math.min(m.p.l+m.pw,Math.max(drag.x0,drag.x1));x.fillRect(a,m.p.t,b-a,m.ph);return;}
    if(!hit)return;
    const xx=m.X(hit.x);
    x.strokeStyle=cssVar('--axis');x.lineWidth=1;x.beginPath();x.moveTo(Math.round(xx)+.5,m.p.t);x.lineTo(Math.round(xx)+.5,m.p.t+m.ph);x.stroke();
    hit.dots.forEach(d=>{x.beginPath();x.arc(m.X(d.x),m.Y(d.y),4.5,0,Math.PI*2);x.fillStyle=cssVar(d.color);x.strokeStyle=cssVar('--surface');x.lineWidth=2;x.fill();x.stroke();});
  }
  hover(px,py){
    const m=this.map;if(!m||px<m.p.l||px>m.p.l+m.pw){this.tip.classList.remove('show');this.clearOverlay();return;}
    const xv=m.x0+(px-m.p.l)/m.pw*(m.x1-m.x0);
    // nearest sample in every line series (series may have different x arrays)
    const near=s=>{let i=lowerBound(s.x,xv);if(i>=s.x.length)i=s.x.length-1;if(i>0&&Math.abs(s.x[i-1]-xv)<Math.abs(s.x[i]-xv))i--;return i;};
    const idx=this.o.series.map(s=>s.kind==='points'||s.visible===false||xv<s.x[0]-1e-9||xv>s.x[s.x.length-1]+1e-9?-1:near(s));
    const p=this.o.primary||0,ip=idx[p]>=0?idx[p]:near(this.o.series[p]);
    const dots=this.o.series.map((s,k)=>idx[k]<0?null:{x:s.x[idx[k]],y:s.y[idx[k]],color:s.color}).filter(Boolean);
    this.overlay({x:this.o.series[p].x[ip],dots});
    const rows=this.o.tooltip(ip,idx);this.tip.replaceChildren(el('div','t-head',rows.head));
    rows.items.forEach(r=>{const row=el('div','t-row');const k=el('i');k.style.background=r.color?cssVar(r.color):'transparent';row.append(k,el('span',null,r.label),el('strong',null,r.value));this.tip.append(row);});
    this.tip.classList.add('show');
    const hx=m.X(this.o.series[p].x[ip]),hw=this.host.clientWidth,tw=this.tip.offsetWidth,left=hx+28+tw>hw?hx-tw:hx+28;
    this.tip.style.left=Math.max(4,left)+'px';this.tip.style.top=Math.max(4,py-20)+'px';
  }
}

/* =====================================================================
   IMAGE EXPORT
   ===================================================================== */
const EXPORT_W=1400,EXPORT_PAD=44,EXPORT_SCALE=2;
function wrapText(ctx,text,maxW){const words=String(text).split(' '),lines=[];let line='';for(const w of words){const tryLine=line?line+' '+w:w;if(ctx.measureText(tryLine).width>maxW&&line){lines.push(line);line=w;}else line=tryLine;}if(line)lines.push(line);return lines;}
function downloadGraph(entry,footer,name){
  const innerW=EXPORT_W-EXPORT_PAD*2,probe=document.createElement('canvas').getContext('2d'),font=cssVar('--font');
  probe.font='400 15px '+font;const sub=entry.meta.sub?wrapText(probe,entry.meta.sub,innerW):[];
  const ch=Math.round(innerW*.42),legendH=entry.meta.legend&&entry.meta.legend.length?34:8;
  const h=EXPORT_PAD+30+sub.length*22+legendH+ch+16+40;
  const c=document.createElement('canvas');c.width=EXPORT_W*EXPORT_SCALE;c.height=h*EXPORT_SCALE;
  const ctx=c.getContext('2d');ctx.scale(EXPORT_SCALE,EXPORT_SCALE);ctx.fillStyle=cssVar('--surface');ctx.fillRect(0,0,EXPORT_W,h);
  let y=EXPORT_PAD;const ink=cssVar('--ink'),muted=cssVar('--muted');
  ctx.fillStyle=ink;ctx.font='700 21px '+font;ctx.textAlign='left';ctx.fillText(entry.meta.title,EXPORT_PAD,y+22);y+=30;
  ctx.fillStyle=muted;ctx.font='400 15px '+font;sub.forEach(l=>{ctx.fillText(l,EXPORT_PAD,y+16);y+=22;});
  if(legendH>8){let lx=EXPORT_PAD;y+=6;ctx.font='500 14px '+font;entry.meta.legend.forEach(L=>{ctx.fillStyle=cssVar(L.color);if(L.marker)ctx.fillRect(lx,y+5,10,10);else ctx.fillRect(lx,y+9,18,3);lx+=L.marker?16:26;ctx.fillStyle=muted;ctx.fillText(L.label,lx,y+15);lx+=ctx.measureText(L.label).width+24;});y+=28;}else y+=8;
  entry.chart.renderTo(ctx,EXPORT_PAD,y,innerW,ch);y+=ch+16;
  ctx.fillStyle=muted;ctx.font='400 13px '+font;ctx.fillText(footer,EXPORT_PAD,y+18);
  ctx.textAlign='right';ctx.fillText('Joule Heating · PDES Experiment Guide',EXPORT_W-EXPORT_PAD,y+18);
  c.toBlob(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name+'.png';document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},800);},'image/png');
}

/* =====================================================================
   GRAPH CARDS
   ===================================================================== */
let graphNo=0;
function addGraph(parent,{title,sub,legend,tools,csv,fileBase,footer,chart:opts}){
  graphNo++;const entry={meta:{title,sub,legend}};
  const card=el('div','card chart-card'),head=el('div','card-head'),t=el('div'),h=el('h3');
  h.append(el('span','chart-num',String(graphNo)),document.createTextNode(title));t.append(h);if(sub)t.append(el('p','chart-sub',sub));
  const tl=el('div','chart-tools');
  const zoomTools=[
    {label:'+ Zoom in',title:'Zoom in on the middle of the graph',onClick:(b,ch)=>ch.zoomBy(0.5)},
    {label:'− Zoom out',title:'Zoom out',onClick:(b,ch)=>ch.zoomBy(2)},
    {label:'◀',title:'Move left',onClick:(b,ch)=>ch.panBy(-0.5)},
    {label:'▶',title:'Move right',onClick:(b,ch)=>ch.panBy(0.5)},
    {label:'Reset zoom',onClick:(b,ch)=>ch.setZoom(null)}];
  const allTools=(tools||[]).concat(zoomTools)
    .concat(csv?[{label:'Download data (CSV)',onClick:()=>downloadCSV(fileBase+'_'+slug(title),csv.headers,csv.rows())}]:[])
    .concat([{label:'Download image',cls:'dl',onClick:()=>downloadGraph(entry,footer,fileBase+'_'+slug(title))}]);
  allTools.forEach(b=>{const btn=el('button',b.cls||null,b.label);btn.type='button';if(b.title){btn.title=b.title;btn.setAttribute('aria-label',b.title);}btn.onclick=()=>b.onClick(btn,entry.chart);tl.append(btn);});
  head.append(t,tl);card.append(head);
  if(legend&&legend.length){const lg=el('div','legend');legend.forEach(L=>{const sp=el('span'),k=el('i',L.marker?'mk':null);k.style.background='var('+L.color+')';sp.append(k,document.createTextNode(L.label));lg.append(sp);});card.append(lg);}
  const host=el('div');card.append(host);parent.append(card);
  entry.chart=new Chart(host,opts);
  return entry;
}

/* =====================================================================
   ONE RECORDING
   ===================================================================== */
const fileBaseOf=t=>slug(t.id)+'_'+t.recordedDate;
const footerOf=t=>t.title+' · thermal camera, '+t.recording+' ('+t.region+', '+t.statistic+') · recorded '+fmtDate(t.recordedDate);
function allPointsCSV(t){
  const s=t.s;
  downloadCSV(fileBaseOf(t)+'_temperature_all_points',
    ['Frame','Time (s)','Clock time','Temperature (°C)','1 s average (°C)','Rate of change (°C/s)'],
    t.frame.map((f,i)=>[f,s.x[i],clockAt(t,s.x[i]),s.T[i],s.avg1[i],s.rate[i]]));
}

function render(i){
  const t=tests[i],s=t.s;graphNo=0;
  [...tabs.children].forEach((b,k)=>b.setAttribute('aria-pressed',String(k===i)));
  try{history.replaceState(null,'','#'+encodeURIComponent(t.id));}catch{}
  detail.replaceChildren();

  // header card with stats
  const card=el('div','card test-head');
  card.append(el('div','eyebrow','Thermal camera · drive '+t.drive),el('h2',null,t.title),el('p','summary-line',summaryText(t)));
  card.append(el('div','file','Recording: '+t.recording+' · '+t.region+' ('+t.statistic+' temperature in the region) · recorded '+fmtDate(t.recordedDate)+' at '+t.startClock+(t.sample?' · '+t.sample:'')));
  const stats=el('div','stat-row');
  statsRows(t).forEach(([k,v,sm])=>{const d=el('div','stat');d.append(el('span',null,k),el('strong',null,v),el('small',null,sm));stats.append(d);});
  card.append(stats);
  const actions=el('div','head-actions');
  const all=el('button','button primary','Download all data points (CSV)');all.type='button';all.onclick=()=>allPointsCSV(t);
  const orig=el('a','button','Original camera CSV');orig.href=t.csvFile;orig.setAttribute('download',t.csvFile.split('/').pop());
  const st=el('button','button','Download stats (CSV)');st.type='button';
  st.onclick=()=>downloadCSV(fileBaseOf(t)+'_temperature_stats',['Stat','Value','Detail'],statsRows(t));
  actions.append(all,orig,st);card.append(actions);
  const notes=(t.notes||[]).concat(['Each value is the '+(t.statistic==='max'?'hottest':t.statistic)+' reading inside '+t.region+', the rectangle drawn over the sample in the thermal camera software, recorded at '+fmtNum(s.fps,1)+' frames per second. Absolute temperatures depend on the emissivity set in that software.']);
  card.append(el('h4','notes-title','Things to know about this recording'));
  const dn=el('div','data-notes');notes.forEach(n=>{const d=el('div','data-note');d.append(el('b',null,'!'),el('span',null,n));dn.append(d);});card.append(dn);
  detail.append(card);

  const gh=el('div','graph-heading');gh.append(el('h3',null,'Graphs'),el('span',null,'Every camera frame, '+s.n.toLocaleString()+' points'));detail.append(gh);

  // 1. temperature over time
  const peakWin=Math.max(3,s.dur*0.06);
  addGraph(detail,{title:'Temperature over time',fileBase:fileBaseOf(t),footer:footerOf(t),
    sub:'The hottest reading in the measured area for every camera frame. The orange line is a 1 s moving average, which shows the overall trend under the fast heating cycles. Zoom in to see individual frames.',
    legend:[{label:'Every frame',color:'--series-1'},{label:'1 s average',color:'--series-2'},{label:'Peak '+fmtC(s.peak),color:'--series-3',marker:true}],
    tools:[{label:'Zoom to peak',onClick:(b,ch)=>ch.setZoom([Math.max(s.x[0],s.x[s.iPk]-peakWin),Math.min(s.x[s.n-1],s.x[s.iPk]+peakWin)])}],
    csv:{headers:['Frame','Time (s)','Temperature (°C)','1 s average (°C)'],rows:()=>t.frame.map((f,i)=>[f,s.x[i],s.T[i],s.avg1[i]])},
    chart:{xLabel:'Time since the recording started (s)',yLabel:'Temperature (°C)',minSpan:0.5,
      hlines:[{y:s.start,label:'start '+fmtC(s.start)}],
      series:[{label:'Every frame',color:'--series-1',x:s.x,y:s.T,width:1.2,dots:true},{label:'1 s average',color:'--series-2',x:s.x,y:s.avg1,width:2.2},{kind:'points',color:'--series-3',x:[s.x[s.iPk]],y:[s.peak],size:6}],
      tooltip:i=>({head:fmtNum(s.x[i],3)+' s · frame '+t.frame[i]+' · '+clockAt(t,s.x[i]),items:[{label:'Temperature',value:fmtC(s.T[i],2),color:'--series-1'},{label:'1 s average',value:fmtC(s.avg1[i],2),color:'--series-2'},{label:'Above start',value:fmtNum(s.T[i]-s.start)+' °C'}]})}});

  // 2. heating / cooling rate
  addGraph(detail,{title:'Heating and cooling rate',fileBase:fileBaseOf(t),footer:footerOf(t),
    sub:'How fast the temperature was changing, from the slope of a 0.5 s average. Above zero the sample is heating, below zero it is cooling.',
    legend:[{label:'Rate of change',color:'--series-1'}],
    csv:{headers:['Frame','Time (s)','Rate of change (°C/s)'],rows:()=>t.frame.map((f,i)=>[f,s.x[i],s.rate[i]])},
    chart:{xLabel:'Time since the recording started (s)',yLabel:'Rate (°C/s)',zeroBase:true,minSpan:0.5,
      hlines:[{y:0,label:'0 °C/s'}],
      series:[{label:'Rate',color:'--series-1',x:s.x,y:s.rate,width:1.6}],
      tooltip:i=>({head:fmtNum(s.x[i],3)+' s · frame '+t.frame[i],items:[{label:s.rate[i]>=0?'Heating':'Cooling',value:fmtNum(Math.abs(s.rate[i]),2)+' °C/s',color:'--series-1'},{label:'Temperature',value:fmtC(s.T[i],2)}]})}});

  if(motion())detail.animate([{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'none'}],{duration:420,easing:'cubic-bezier(.2,.8,.2,1)'});
}

/* =====================================================================
   TABS + COMPARISON
   ===================================================================== */
tests.forEach((t,i)=>{
  const b=el('button');b.type='button';
  b.append(el('b',null,t.title),el('span',null,'Peak '+fmtC(t.s.peak)+' · '+fmtDate(t.recordedDate)));
  b.onclick=()=>render(i);tabs.append(b);
});

function renderCompare(){
  if(tests.length<2)return;
  const gh=el('div','graph-heading');gh.append(el('h3',null,'Compare recordings'),el('span',null,tests.length+' recordings'));compare.append(gh);
  const card=el('div','card');card.style.padding='20px 22px';
  const keys=statsRows(tests[0]).map(r=>r[0].replace(/^Time above .*/,'Time above halfway'));
  const rows=keys.map((k,j)=>[k].concat(tests.map(t=>statsRows(t)[j][1])));
  rows.unshift(['Recorded'].concat(tests.map(t=>fmtDate(t.recordedDate)+' '+t.startClock)),['Drive'].concat(tests.map(t=>t.drive)),['Length of recording'].concat(tests.map(t=>fmtNum(t.s.dur)+' s')));
  const headers=['Stat'].concat(tests.map(t=>t.title));
  const wrap=el('div','table-wrap'),tb=el('table'),th=el('thead'),tr=el('tr');headers.forEach(h=>tr.append(el('th',null,h)));th.append(tr);tb.append(th);
  const body=el('tbody');rows.forEach(r=>{const row=el('tr');r.forEach(c=>row.append(el('td',null,c)));body.append(row);});tb.append(body);wrap.append(tb);card.append(wrap);
  const act=el('div','head-actions');const b=el('button','button','Download comparison (CSV)');b.type='button';b.onclick=()=>downloadCSV('temperature_comparison',headers,rows);act.append(b);card.append(act);
  compare.append(card);
  const colors=['--series-1','--series-2','--series-3'],longest=tests.reduce((k,t,i)=>t.s.dur>tests[k].s.dur?i:k,0);
  addGraph(compare,{title:'All recordings on one graph',fileBase:'temperature_comparison',footer:'Thermal camera recordings · '+tests.map(t=>t.title).join(', '),
    sub:'Every frame of each recording, lined up at the moment each recording started.',
    legend:tests.map((t,i)=>({label:t.title,color:colors[i%3]})),
    csv:{headers:['Recording','Frame','Time (s)','Temperature (°C)'],rows:()=>tests.flatMap(t=>t.frame.map((f,i)=>[t.title,f,t.s.x[i],t.s.T[i]]))},
    chart:{xLabel:'Time since the recording started (s)',yLabel:'Temperature (°C)',minSpan:0.5,primary:longest,
      series:tests.map((t,i)=>({label:t.title,color:colors[i%3],x:t.s.x,y:t.s.T,width:1.3})),
      tooltip:(ip,idx)=>({head:fmtNum(tests[longest].s.x[ip],2)+' s',items:tests.map((t,k)=>({label:t.title,value:idx[k]>=0?fmtC(t.s.T[idx[k]],2):'—',color:colors[k%3]}))})}});
}

const fromHash=decodeURIComponent((location.hash||'').slice(1)),start=tests.findIndex(t=>t.id===fromHash);
render(start>=0?start:0);
renderCompare();
$('generated').textContent='Data exported '+D.generated+' from the thermal camera CSVs.';
})();
