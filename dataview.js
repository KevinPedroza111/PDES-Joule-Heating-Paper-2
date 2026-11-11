(()=>{
const D=window.WARELAB_DATA,$=id=>document.getElementById(id);
const root=$('data-root');if(!root)return;
if(!D||!D.tests||!D.tests.length){root.innerHTML='<div class="note"><strong>No data found.</strong><p>Run exportWebsiteData.m in MATLAB to generate data.js.</p></div>';return;}
const cssVar=n=>getComputedStyle(root).getPropertyValue(n).trim()||getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const motion=()=>document.body.classList.contains('has-motion');

/* =====================================================================
   FORMATTING
   ===================================================================== */
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtDate=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||'');return m?MONTHS[+m[2]-1]+' '+(+m[3])+', '+m[1]:(s||'—');};
const fmtNum=(v,d=2)=>v===null||v===undefined||!isFinite(v)?'—':(+v).toFixed(d);
function fmtSI(v,unit){
  if(v===null||v===undefined||!isFinite(v))return '—';
  const a=Math.abs(v),pre=[[1e6,'M'],[1e3,'k'],[1,''],[1e-3,'m'],[1e-6,'µ'],[1e-9,'n']];
  for(const [f,p] of pre){if(a>=f||f===1e-9)return (v/f).toPrecision(3).replace(/\.?0+$/,'')+' '+p+unit;}
}
const typeLabel=t=>t.type==='fixedFrequency'?'Fixed frequency':'Frequency sweep';
const settingsLabel=t=>t.type==='fixedFrequency'?t.settings.frequency_Hz+' Hz':t.settings.sweepStart_Hz+' → '+t.settings.sweepStop_Hz+' Hz over '+t.settings.sweepDuration_s+' s';
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}

/* =====================================================================
   CSV + TABLE HELPERS
   ===================================================================== */
function downloadCSV(name,headers,rows){
  const esc=v=>{const s=v===null||v===undefined?'':String(v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
  const text=[headers.map(esc).join(',')].concat(rows.map(r=>r.map(esc).join(','))).join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+text],{type:'text/csv'}));a.download=name+'.csv';document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);
}
function fillTable(container,headers,rows){
  const t=el('table'),th=el('thead'),tr=el('tr');headers.forEach(h=>tr.append(el('th',null,h)));th.append(tr);t.append(th);
  const tb=el('tbody');rows.forEach(r=>{const row=el('tr');r.forEach(c=>row.append(el('td',null,c===null||c===undefined?'—':String(c))));tb.append(row);});t.append(tb);
  container.replaceChildren(t);
}

/* =====================================================================
   CHART ENGINE (canvas, hover crosshair + tooltip, drag to zoom)
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
    if(o.zoom){this.hint=el('div','hint','Drag to zoom · double-click to reset');host.append(this.hint);}
    const all=o.series.filter(s=>s.x&&s.x.length);
    this.full=[Math.min(...all.map(s=>s.x[0])),Math.max(...all.map(s=>s.x[s.x.length-1]))];
    if(o.type==='bar'){const s=o.series[0],w=(s.x.length>1?(s.x[1]-s.x[0]):1)/2;this.full=[s.x[0]-w,s.x[s.x.length-1]+w];}
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
    if(hi===lo){hi+=1;lo-=this.o.zeroBase?0:1;}
    const pad=(hi-lo)*.08;return [this.o.zeroBase&&lo===0?0:lo-pad,hi+pad];
  }
  draw(target){
    // target = {w,h,ctx} renders into an export canvas instead of the page
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
    xt.ticks.forEach(v=>{if(this.o.type==='bar'&&Math.abs(v-Math.round(v))>1e-9)return;const xx=Math.round(X(v))+.5;x.beginPath();x.moveTo(xx,p.t);x.lineTo(xx,p.t+ph);x.stroke();x.textAlign='center';x.fillText(this.fmtTick(v,xt.step),xx,p.t+ph+16);});
    x.strokeStyle=axis;x.beginPath();x.moveTo(p.l,p.t+ph+.5);x.lineTo(p.l+pw,p.t+ph+.5);x.stroke();
    x.fillStyle=ink;x.font='600 12px '+font;x.textAlign='center';x.fillText(this.o.xLabel,p.l+pw/2,h-6);
    x.save();x.translate(14,p.t+ph/2);x.rotate(-Math.PI/2);x.fillText(this.o.yLabel,0,0);x.restore();
    x.save();x.beginPath();x.rect(p.l,p.t-2,pw,ph+4);x.clip();
    (this.o.hlines||[]).forEach(L=>{x.strokeStyle=muted;x.setLineDash([5,4]);x.beginPath();x.moveTo(p.l,Y(L.y));x.lineTo(p.l+pw,Y(L.y));x.stroke();x.setLineDash([]);x.font='11px '+mono;const tw=x.measureText(L.label).width;x.fillStyle=cssVar('--surface');x.fillRect(p.l+pw-tw-12,Y(L.y)-19,tw+8,15);x.fillStyle=muted;x.textAlign='right';x.fillText(L.label,p.l+pw-8,Y(L.y)-8);});
    (this.o.vlines||[]).forEach(L=>{if(L.x<x0||L.x>x1)return;x.strokeStyle=muted;x.setLineDash([5,4]);x.beginPath();x.moveTo(X(L.x),p.t);x.lineTo(X(L.x),p.t+ph);x.stroke();x.setLineDash([]);x.fillStyle=muted;x.font='11px '+mono;x.textAlign='left';x.fillText(L.label,Math.min(X(L.x)+6,p.l+pw-140),p.t+12);});
    for(const s of this.o.series){if(s.visible===false)continue;const col=cssVar(s.color);
      if(s.kind==='bar')this.drawBars(x,s,col);
      else if(s.kind==='points')this.drawPoints(x,s,col);
      else this.drawLine(x,s,col,pw);}
    x.restore();
  }
  fmtTick(v,step){const d=step>=1||(this.o.type==='bar'&&Number.isInteger(v))?0:Math.min(4,Math.ceil(-Math.log10(step)));return v.toFixed(d);}
  drawLine(x,s,col,pw){
    const {X,Y,x0,x1}=this.map,i0=Math.max(0,lowerBound(s.x,x0)-1),i1=Math.min(s.x.length,lowerBound(s.x,x1)+1),n=i1-i0;
    x.strokeStyle=col;x.lineWidth=s.width||2;x.lineJoin='round';x.lineCap='round';if(s.dash)x.setLineDash(s.dash);
    x.beginPath();let started=false;
    if(n>pw*2){ // min/max decimation per pixel column
      let col0=-1,mn=0,mx=0,first=0;
      const flush=()=>{if(col0<0)return;const xx=col0+.5;if(!started){x.moveTo(xx,Y(first));started=true;}x.lineTo(xx,Y(mn));x.lineTo(xx,Y(mx));};
      for(let i=i0;i<i1;i++){const v=s.y[i];if(v===null)continue;const c=Math.floor(X(s.x[i]));if(c!==col0){flush();col0=c;mn=mx=first=v;}else{if(v<mn)mn=v;if(v>mx)mx=v;}}
      flush();
    }else{
      for(let i=i0;i<i1;i++){const v=s.y[i];if(v===null){started=false;continue;}const xx=X(s.x[i]),yy=Y(v);if(!started){x.moveTo(xx,yy);started=true;}else x.lineTo(xx,yy);}
    }
    x.stroke();x.setLineDash([]);
    // Zoomed in far enough: mark every individual data point
    if(s.dots&&n<=pw/6){x.fillStyle=col;for(let i=i0;i<i1;i++){const v=s.y[i];if(v===null)continue;x.beginPath();x.arc(X(s.x[i]),Y(v),2.4,0,Math.PI*2);x.fill();}}
  }
  drawPoints(x,s,col){
    const {X,Y,x0,x1}=this.map,surf=cssVar('--surface'),r=s.size||4.5;
    // Too many markers bury the line: show them only once zoomed in far enough
    const visible=lowerBound(s.x,x1)-lowerBound(s.x,x0);
    if(s.maxVisible&&visible>s.maxVisible)return;
    for(let i=0;i<s.x.length;i++){if(s.x[i]<x0||s.x[i]>x1)continue;const xx=X(s.x[i]),yy=Y(s.y[i]);
      x.beginPath();if(s.marker==='up'){x.moveTo(xx,yy-r-1);x.lineTo(xx+r,yy+r-1);x.lineTo(xx-r,yy+r-1);}else if(s.marker==='down'){x.moveTo(xx,yy+r+1);x.lineTo(xx+r,yy-r+1);x.lineTo(xx-r,yy-r+1);}else x.arc(xx,yy,r,0,Math.PI*2);
      x.closePath();x.fillStyle=col;x.strokeStyle=surf;x.lineWidth=2;x.fill();x.stroke();}
  }
  drawBars(x,s,col){
    const {X,Y,x0,x1,pw}=this.map,base=Y(0),slot=pw/((x1-x0)||1),bw=Math.max(1,Math.min(42,slot-2));
    x.fillStyle=col;
    for(let i=0;i<s.x.length;i++){if(s.x[i]<x0-1||s.x[i]>x1+1)continue;const cx=X(s.x[i]),top=Y(s.y[i]),r=bw>=6?Math.min(4,bw/2):0,left=cx-bw/2;
      x.beginPath();if(r){x.moveTo(left,base);x.lineTo(left,top+r);x.arcTo(left,top,left+r,top,r);x.lineTo(left+bw-r,top);x.arcTo(left+bw,top,left+bw,top+r,r);x.lineTo(left+bw,base);}else x.rect(left,top,bw,base-top);x.fill();}
  }
  bind(){
    let drag=null;
    const pos=e=>{const r=this.ov.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];};
    const toX=px=>{const m=this.map;return m.x0+(px-m.p.l)/m.pw*(m.x1-m.x0);};
    this.ov.addEventListener('pointermove',e=>{const [px,py]=pos(e);if(drag){drag.x1=px;this.overlay(px,null,drag);return;}this.hover(px,py);});
    this.ov.addEventListener('pointerleave',()=>{if(!drag){this.tip.classList.remove('show');this.clearOverlay();}});
    if(this.o.zoom){
      this.ov.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')return;const [px]=pos(e);drag={x0:px,x1:px};this.ov.setPointerCapture(e.pointerId);this.tip.classList.remove('show');});
      this.ov.addEventListener('pointerup',e=>{if(!drag)return;const a=Math.min(drag.x0,drag.x1),b=Math.max(drag.x0,drag.x1);drag=null;this.clearOverlay();if(b-a>8){const [f0,f1]=this.full;this.setZoom([Math.max(f0,toX(a)),Math.min(f1,toX(b))]);}});
      this.ov.addEventListener('dblclick',()=>this.setZoom(null));
    }
  }
  setZoom(z){this.zoom=z;this.draw();if(this.o.onZoom)this.o.onZoom(z);}
  /* Draw this chart (at its current zoom) into ctx at (left, top), size w x h. */
  renderTo(ctx,left,top,w,h){
    const saved=this.map;ctx.save();ctx.translate(left,top);this.draw({w,h,ctx});ctx.restore();this.map=saved;
  }
  clearOverlay(){const x=this.ov.getContext('2d');x.clearRect(0,0,this.ov.width,this.ov.height);}
  overlay(px,idx,drag){
    const x=this.ov.getContext('2d'),m=this.map;this.clearOverlay();
    if(drag){x.fillStyle=cssVar('--select');const a=Math.max(m.p.l,Math.min(drag.x0,drag.x1)),b=Math.min(m.p.l+m.pw,Math.max(drag.x0,drag.x1));x.fillRect(a,m.p.t,b-a,m.ph);return;}
    if(idx===null)return;
    const s=this.o.series[this.o.primary||0],xx=m.X(s.x[idx]);
    if(this.o.type==='bar'){const slot=m.pw/((m.x1-m.x0)||1),bw=Math.max(1,Math.min(42,slot-2));x.fillStyle=cssVar('--select');x.fillRect(xx-bw/2-3,m.p.t,bw+6,m.ph);return;}
    x.strokeStyle=cssVar('--axis');x.lineWidth=1;x.beginPath();x.moveTo(Math.round(xx)+.5,m.p.t);x.lineTo(Math.round(xx)+.5,m.p.t+m.ph);x.stroke();
    for(const ser of this.o.series){if(ser.visible===false||ser.kind==='points'||ser.x!==s.x)continue;const v=ser.y[idx];if(v===null)continue;x.beginPath();x.arc(xx,m.Y(v),4.5,0,Math.PI*2);x.fillStyle=cssVar(ser.color);x.strokeStyle=cssVar('--surface');x.lineWidth=2;x.fill();x.stroke();}
  }
  hover(px,py){
    const m=this.map;if(!m||px<m.p.l||px>m.p.l+m.pw){this.tip.classList.remove('show');this.clearOverlay();return;}
    const s=this.o.series[this.o.primary||0],xv=m.x0+(px-m.p.l)/m.pw*(m.x1-m.x0);
    let i=lowerBound(s.x,xv);if(i>=s.x.length)i=s.x.length-1;if(i>0&&Math.abs(s.x[i-1]-xv)<Math.abs(s.x[i]-xv))i--;
    this.overlay(px,i);
    const rows=this.o.tooltip(i);this.tip.replaceChildren(el('div','t-head',rows.head));
    rows.items.forEach(r=>{const row=el('div','t-row');const k=el('i');k.style.background=r.color?cssVar(r.color):'transparent';row.append(k,el('span',null,r.label),el('strong',null,r.value));this.tip.append(row);});
    this.tip.classList.add('show');
    const hw=this.host.clientWidth,tw=this.tip.offsetWidth,left=m.X(s.x[i])+10+18+tw>hw?m.X(s.x[i])-tw+0:m.X(s.x[i])+28;
    this.tip.style.left=Math.max(4,left)+'px';this.tip.style.top=Math.max(4,py-20)+'px';
  }
}

/* =====================================================================
   IMAGE EXPORT (PNG of one graph, or every graph for a test)
   ===================================================================== */
const EXPORT_W=1400,EXPORT_PAD=44,EXPORT_SCALE=2;
const slug=s=>String(s).replace(/[^A-Za-z0-9.]+/g,'_').replace(/^_+|_+$/g,'');
const fileBase=t=>slug(t.mvi)+'_'+t.recordedDate;
function wrapText(ctx,text,maxW){const words=String(text).split(' '),lines=[];let line='';for(const w of words){const tryLine=line?line+' '+w:w;if(ctx.measureText(tryLine).width>maxW&&line){lines.push(line);line=w;}else line=tryLine;}if(line)lines.push(line);return lines;}
function graphBlockHeight(ctx,meta,innerW){
  ctx.font='400 15px '+cssVar('--font');const subLines=meta.sub?wrapText(ctx,meta.sub,innerW).length:0;
  return 30+subLines*22+(meta.legend&&meta.legend.length?34:8)+Math.round(innerW*.42)+16;
}
function drawGraphBlock(ctx,entry,left,top,innerW){
  const {chart,meta}=entry,ink=cssVar('--ink'),muted=cssVar('--muted'),font=cssVar('--font');
  let y=top;
  ctx.fillStyle=ink;ctx.font='700 21px '+font;ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillText(meta.title,left,y+22);y+=30;
  if(meta.sub){ctx.fillStyle=muted;ctx.font='400 15px '+font;wrapText(ctx,meta.sub,innerW).forEach(l=>{ctx.fillText(l,left,y+16);y+=22;});}
  if(meta.legend&&meta.legend.length){
    let lx=left;y+=6;ctx.font='500 14px '+font;
    meta.legend.forEach(L=>{const col=cssVar(L.color);ctx.fillStyle=col;if(L.marker)ctx.fillRect(lx,y+5,10,10);else ctx.fillRect(lx,y+9,18,3);lx+=L.marker?16:26;ctx.fillStyle=muted;ctx.fillText(L.label,lx,y+15);lx+=ctx.measureText(L.label).width+24;});
    y+=28;
  }else y+=8;
  const ch=Math.round(innerW*.42);chart.renderTo(ctx,left,y,innerW,ch);
  return y+ch+16;
}
function exportCanvas(height,paint){
  const c=document.createElement('canvas');c.width=EXPORT_W*EXPORT_SCALE;c.height=Math.ceil(height)*EXPORT_SCALE;
  const ctx=c.getContext('2d');ctx.scale(EXPORT_SCALE,EXPORT_SCALE);ctx.fillStyle=cssVar('--surface');ctx.fillRect(0,0,EXPORT_W,height);paint(ctx);return c;
}
function footerLine(ctx,t,y){
  ctx.fillStyle=cssVar('--muted');ctx.font='400 13px '+cssVar('--font');ctx.textAlign='left';
  ctx.fillText(t.mvi+' · '+typeLabel(t)+' · recorded '+fmtDate(t.recordedDate)+' · video '+t.videoFile,EXPORT_PAD,y);
  ctx.textAlign='right';ctx.fillText('Joule Heating · PDES Experiment Guide',EXPORT_W-EXPORT_PAD,y);ctx.textAlign='left';
}
function savePNG(canvas,name){canvas.toBlob(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name+'.png';document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},800);},'image/png');}
function downloadGraph(entry,t){
  const innerW=EXPORT_W-EXPORT_PAD*2,probe=document.createElement('canvas').getContext('2d');
  const h=EXPORT_PAD+graphBlockHeight(probe,entry.meta,innerW)+40;
  savePNG(exportCanvas(h,ctx=>{const y=drawGraphBlock(ctx,entry,EXPORT_PAD,EXPORT_PAD,innerW);footerLine(ctx,t,y+18);}),fileBase(t)+'_'+slug(entry.meta.title));
}
function downloadAllGraphs(t){
  const innerW=EXPORT_W-EXPORT_PAD*2,probe=document.createElement('canvas').getContext('2d');
  probe.font='400 17px '+cssVar('--font');const sumLines=wrapText(probe,summaryText(t),innerW);
  const headH=40+sumLines.length*26+20;
  const blocks=currentCharts.map(e=>graphBlockHeight(probe,e.meta,innerW)+24);
  const h=EXPORT_PAD+headH+blocks.reduce((a,b)=>a+b,0)+40;
  savePNG(exportCanvas(h,ctx=>{
    const font=cssVar('--font');let y=EXPORT_PAD;
    ctx.fillStyle=cssVar('--ink');ctx.font='800 30px '+font;ctx.fillText(titleText(t),EXPORT_PAD,y+28);y+=44;
    ctx.fillStyle=cssVar('--muted');ctx.font='400 17px '+font;sumLines.forEach(l=>{ctx.fillText(l,EXPORT_PAD,y+18);y+=26;});y+=20;
    currentCharts.forEach(e=>{ctx.strokeStyle=cssVar('--line');ctx.beginPath();ctx.moveTo(EXPORT_PAD,y-8);ctx.lineTo(EXPORT_W-EXPORT_PAD,y-8);ctx.stroke();y=drawGraphBlock(ctx,e,EXPORT_PAD,y+8,innerW)+16;});
    footerLine(ctx,t,y+10);
  }),fileBase(t)+'_all_graphs');
}

/* =====================================================================
   GRAPH CARDS
   ===================================================================== */
let currentCharts=[],currentTest=null,graphNo=0;
function addGraph(parent,{title,sub,legend,tools,csv,chart:opts}){
  graphNo++;const entry={meta:{title,sub,legend}};
  const card=el('div','card chart-card'),head=el('div','card-head'),t=el('div'),h=el('h3');
  h.append(el('span','chart-num',String(graphNo)),document.createTextNode(title));t.append(h);if(sub)t.append(el('p','chart-sub',sub));
  const tl=el('div','chart-tools');
  const allTools=(tools||[]).concat(opts.zoom?[{label:'Reset zoom',onClick:()=>entry.chart.setZoom(null)}]:[])
    .concat(csv?[{label:'Download data',onClick:()=>downloadCSV(fileBase(currentTest)+'_'+slug(title),csv.headers,csv.rows())}]:[])
    .concat([{label:'Download image',cls:'dl',onClick:()=>downloadGraph(entry,currentTest)}]);
  allTools.forEach(b=>{const btn=el('button',b.cls||null,b.label);btn.type='button';if(b.pressed!==undefined)btn.setAttribute('aria-pressed',String(b.pressed));btn.onclick=()=>b.onClick(btn,entry.chart);tl.append(btn);});
  head.append(t,tl);card.append(head);
  if(legend&&legend.length){const lg=el('div','legend');legend.forEach(L=>{const sp=el('span'),k=el('i',L.marker?'mk':null);k.style.background='var('+L.color+')';sp.append(k,document.createTextNode(L.label));lg.append(sp);});card.append(lg);}
  const host=el('div'),tv=el('div','table-view');card.append(host,tv);parent.append(card);
  entry.chart=new Chart(host,opts);entry.tableView=tv;currentCharts.push(entry);
  return entry;
}

/* =====================================================================
   PLAIN-LANGUAGE TEXT
   ===================================================================== */
function titleText(t){return t.mvi+' · '+(t.type==='fixedFrequency'?'Fixed frequency, '+t.settings.frequency_Hz+' Hz':'Frequency sweep, '+t.settings.sweepStart_Hz+'–'+t.settings.sweepStop_Hz+' Hz');}
function summaryText(t){
  const s=t.summary;
  if(t.type==='fixedFrequency'){
    if(!s.cyclesDetected)return 'The sample was driven at '+t.settings.frequency_Hz+' Hz, but no complete heating cycles were detected. The most it contracted was '+fmtNum(s.maxStrain_pct,1)+' %.';
    return 'Driven at '+t.settings.frequency_Hz+' Hz, the sample contracted and relaxed '+s.cyclesDetected+' times. Each cycle it contracted by '+fmtNum(s.meanCycleStrainRange_pct,1)+' % on average, and the most it ever contracted was '+fmtNum(s.maxStrain_pct,1)+' %. It followed the drive at '+fmtNum(s.meanCycleFrequency_Hz,3)+' Hz ('+fmtNum(s.measuredToInputRatio*100,0)+' % of the set frequency).';
  }
  return 'The drive frequency swept from '+t.settings.sweepStart_Hz+' to '+t.settings.sweepStop_Hz+' Hz over '+t.settings.sweepDuration_s+' s. The sample responded most strongly at about '+fmtNum(s.frequencyAtMaxPercentileAmplitude_Hz,2)+' Hz, where its strain amplitude reached '+fmtNum(s.maxPercentileAmplitude_pct,1)+' %. The most it ever contracted was '+fmtNum(s.maxStrain_pct,1)+' %.';
}

/* =====================================================================
   TEST PICKER + COMPARE TABLE
   ===================================================================== */
const tests=D.tests,groupOf=t=>t.isJuly?'July 2026':'Fall 2026';
const list=$('test-list'),sel=$('test-select'),ovBody=$('overview-body'),detail=$('test-detail');
const pickButtons=[],ovRows=[];let lastGroup=null,optGroup=null;
tests.forEach((t,i)=>{
  const g=groupOf(t);
  if(g!==lastGroup){
    lastGroup=g;list.append(el('div','picker-group',g));
    optGroup=el('optgroup');optGroup.label=g;sel.append(optGroup);
    const gr=el('tr','group-row'),td=el('td',null,g+' tests');td.colSpan=6;gr.append(td);ovBody.append(gr);
  }
  const b=el('button','picker-item');b.type='button';
  const meta=el('span');const dot=el('i','dot-type'+(t.type==='fixedFrequency'?'':' sweep'));meta.append(dot,document.createTextNode(settingsLabel(t).replace(' over ',' · ')+' · '+fmtDate(t.recordedDate).replace(/, \d{4}$/,'')));
  b.append(el('b',null,t.mvi+(t.isTrial?' (trial)':'')+(t.isCopy?' (copy)':'')),meta);b.onclick=()=>select(i,'picker');list.append(b);pickButtons.push(b);
  const o=el('option',null,t.mvi+' — '+typeLabel(t)+', '+settingsLabel(t));o.value=i;optGroup.append(o);
  const tr=el('tr');tr.tabIndex=0;
  const c1=el('td');c1.append(document.createTextNode(t.mvi));c1.append(el('small',null,t.videoFile));
  const c3=el('td');c3.append(el('span','type-pill '+(t.type==='fixedFrequency'?'fixed':'sweep'),typeLabel(t)));
  const e=t.electrical||{};
  const result=t.type==='fixedFrequency'?fmtNum(t.summary.meanCycleStrainRange_pct)+' % per cycle ('+t.summary.cyclesDetected+' cycles)':fmtNum(t.summary.maxPercentileAmplitude_pct)+' % at '+fmtNum(t.summary.frequencyAtMaxPercentileAmplitude_Hz)+' Hz';
  tr.append(c1,el('td',null,fmtDate(t.recordedDate)),c3,el('td',null,settingsLabel(t)),el('td',null,e.current_A!==undefined?fmtNum(e.current_A)+' A':'—'),el('td',null,result));
  tr.onclick=()=>select(i,'table');tr.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();select(i,'table');}};
  ovBody.append(tr);ovRows.push(tr);
});
sel.onchange=()=>select(+sel.value,'select');
document.querySelectorAll('.compare summary span').forEach(s=>s.textContent=tests.length+' tests');

/* =====================================================================
   TEST DETAIL
   ===================================================================== */
function select(i,source){
  const t=tests[i];currentTest=t;currentCharts=[];graphNo=0;
  pickButtons.forEach((b,k)=>b.setAttribute('aria-current',String(k===i)));
  ovRows.forEach((r,k)=>r.setAttribute('aria-selected',String(k===i)));
  sel.value=String(i);
  try{history.replaceState(null,'','#'+encodeURIComponent(t.id));}catch{}
  detail.replaceChildren();
  renderHeader(t);
  const main=el('div','graph-heading');main.append(el('h3',null,'Main graphs'),el('span',null,'Every tracked data point'));detail.append(main);
  strainTimeGraph(t);strainCycleGraph(t);
  const more=el('div','graph-heading');more.append(el('h3',null,'More graphs'),el('span',null,t.type==='fixedFrequency'?'Cycle-by-cycle and frequency results':'Frequency response'));detail.append(more);
  if(t.type==='fixedFrequency'){cycleRangeGraph(t);fftGraph(t);}else amplitudeGraph(t);
  renderDetails(t);
  if(motion())detail.animate([{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'none'}],{duration:420,easing:'cubic-bezier(.2,.8,.2,1)'});
  if(source==='table'||source==='select'||(source==='picker'&&detail.getBoundingClientRect().top<0))detail.scrollIntoView({behavior:motion()?'smooth':'auto',block:'start'});
}

function renderHeader(t){
  const card=el('div','card test-head');
  card.append(el('div','eyebrow',typeLabel(t)+' test'),el('h2',null,titleText(t)),el('p','summary-line',summaryText(t)));
  card.append(el('div','file','Video: '+t.videoFile+' · recorded '+fmtDate(t.recordedDate)+' · analyzed '+fmtDate(t.analyzedDate)));
  const actions=el('div','head-actions');
  const all=el('button','button primary','Download all graphs (one image)');all.type='button';all.onclick=()=>downloadAllGraphs(t);
  const ts=t.timeSeries,csvAll=el('button','button','Download all data points (CSV)');csvAll.type='button';
  csvAll.onclick=()=>{const P=cyclePoints(t),cycAt=new Map(P.idx.map((i,k)=>[i,P.x[k]]));
    downloadCSV(fileBase(t)+'_all_data_points',['Video frame','Time (s)','Raw strain (%)','Smoothed strain (%)',t.type==='fixedFrequency'?'Cycle position (cycle + fraction)':'Drive cycle position (from sweep timing)'].concat(ts.driveFrequency_Hz?['Estimated drive frequency (Hz)']:[]),
      ts.time_s.map((x,i)=>[ts.frame[i],x,ts.rawStrain_pct[i],ts.smoothStrain_pct[i],cycAt.has(i)?+cycAt.get(i).toFixed(5):''].concat(ts.driveFrequency_Hz?[ts.driveFrequency_Hz[i]]:[])));};
  actions.append(all,csvAll);card.append(actions);
  if(t.notes&&t.notes.length){card.append(el('h4','notes-title','Things to know about this test'));const dn=el('div','data-notes');t.notes.forEach(n=>{const d=el('div','data-note');d.append(el('b',null,'!'),el('span',null,n));dn.append(d);});card.append(dn);}
  detail.append(card);
  const s=t.summary,stats=el('div','stat-row');
  const items=t.type==='fixedFrequency'?[
    ['Contraction per cycle',fmtNum(s.meanCycleStrainRange_pct,1)+' %','average stroke'],
    ['Largest contraction',fmtNum(s.maxStrain_pct,1)+' %','anywhere in the test'],
    ['Cycles',String(s.cyclesDetected),'complete heat–cool cycles'],
    ['Measured frequency',fmtNum(s.meanCycleFrequency_Hz,3)+' Hz','set to '+t.settings.frequency_Hz+' Hz']
  ]:[
    ['Strongest response',fmtNum(s.maxPercentileAmplitude_pct,1)+' %','strain amplitude'],
    ['At frequency',fmtNum(s.frequencyAtMaxPercentileAmplitude_Hz,2)+' Hz','where it moved most'],
    ['Largest contraction',fmtNum(s.maxStrain_pct,1)+' %','anywhere in the test'],
    ['Sweep',t.settings.sweepStart_Hz+'–'+t.settings.sweepStop_Hz+' Hz','over '+t.settings.sweepDuration_s+' s']
  ];
  items.forEach(([k,v,sub])=>{const st=el('div','stat');st.append(el('span',null,k),el('strong',null,v),el('small',null,sub));stats.append(st);});
  detail.append(stats);
}

function renderDetails(t){
  const box=el('details','more');box.append(el('summary',null,'Test settings and measurements'));
  const e=t.electrical||{},s=t.sample,v=t.video;
  const groups=[
    ['Test settings',t.type==='fixedFrequency'
      ?[['Drive frequency',t.settings.frequency_Hz+' Hz'],['Duty cycle',e.dutyCycle_pct!==undefined?e.dutyCycle_pct+' %':'—']]
        .concat(e.supplyVoltage_V!==undefined?[['Supply voltage',fmtNum(e.supplyVoltage_V)+' V']]:[])
        .concat([[e.currentIsCalculated?'Current (calculated)':'Measured current',e.current_A!==undefined?fmtNum(e.current_A)+' A':'—']])
        .concat(e.circuitResistance_ohm!==undefined?[['Circuit resistance',fmtNum(e.circuitResistance_ohm)+' Ω']]:[['Liquid-metal resistance',e.liquidMetalResistance_ohm!==undefined?fmtNum(e.liquidMetalResistance_ohm)+' Ω':'—']])
      :[['Sweep range',t.settings.sweepStart_Hz+' → '+t.settings.sweepStop_Hz+' Hz'],['Sweep duration',t.settings.sweepDuration_s+' s'],['Ignored after LED start',t.settings.ignoredStart_s+' s'],['Direction','Low to high']]],
    ['Sample',[['Stretched length L₀',fmtNum(s.stretchedLengthL0_mm)+' mm'],['Stretched width',fmtNum(s.stretchedWidth_mm,3)+' mm'],['Stretched thickness',s.stretchedThickness_mm+' mm'],['Hanging mass',s.hangingMass_g+' g'],['Tensile stress',fmtNum(s.tensileStress_MPa,3)+' MPa']]],
    ['Video',[['Frame rate',fmtNum(v.frameRate_fps)+' fps'],['Video length',fmtNum(v.duration_s,1)+' s'],['Actuation start frame',v.startFrame],['Frames tracked',v.framesTracked.toLocaleString()]]]
  ];
  const mg=el('div','meta-groups');
  groups.forEach(([name,items])=>{const g=el('div','meta-group');g.append(el('h4',null,name));const dl=el('dl');items.forEach(([k,val])=>dl.append(el('dt',null,k),el('dd',null,String(val))));g.append(dl);mg.append(g);});
  box.append(mg);
  if(t.type==='fixedFrequency'){
    const sm=t.summary,tw=el('div','table-wrap');
    fillTable(tw,['Actuator performance','Value'],[['Mechanical work per cycle',fmtSI(sm.mechanicalWork_J,'J')],['Output power',fmtSI(sm.outputPower_W,'W')],['Work density',fmtSI(sm.workDensity_J_per_m3,'J/m³')],['Specific power',fmtSI(sm.specificPower_W_per_kg,'W/kg')],['Average electrical power in the coating',fmtSI(sm.averageElectricalPower_W,'W')],['Electrical-to-mechanical efficiency',fmtNum(sm.efficiency_pct,4)+' %']]);
    tw.querySelector('table').classList.add('perf-table');box.append(tw);
    box.append(el('p','small','Performance values are calculated by the MATLAB analysis from the average cycle strain, hanging mass, current and resistance. Check “Things to know” above before comparing tests.'));
  }
  detail.append(box);
}

/* =====================================================================
   GRAPHS
   ===================================================================== */
function strainTimeGraph(t){
  const ts=t.timeSeries,pt=new Array(ts.time_s.length).fill('');
  (ts.peakIndex||[]).forEach(i=>pt[i]='Most contracted (peak)');(ts.valleyIndex||[]).forEach(i=>pt[i]='Most stretched (valley)');
  const raw={label:'Raw strain',color:'--raw',x:ts.time_s,y:ts.rawStrain_pct,width:1.2,visible:false};
  const series=[{label:'Strain',color:'--series-1',x:ts.time_s,y:ts.smoothStrain_pct,width:2,dots:true},raw];
  const legend=[{label:'Strain (smoothed)',color:'--series-1'}];
  if(ts.peakIndex){
    const many=ts.peakIndex.length>60;
    series.push({kind:'points',marker:'up',maxVisible:60,color:'--series-2',x:ts.peakIndex.map(i=>ts.time_s[i]),y:ts.peakIndex.map(i=>ts.smoothStrain_pct[i])});
    series.push({kind:'points',marker:'down',maxVisible:60,color:'--series-3',x:ts.valleyIndex.map(i=>ts.time_s[i]),y:ts.valleyIndex.map(i=>ts.smoothStrain_pct[i])});
    legend.push({label:'Most contracted'+(many?' (zoom in)':''),color:'--series-2',marker:true},{label:'Most stretched'+(many?' (zoom in)':''),color:'--series-3',marker:true});
  }
  const headers=['Video frame','Time (s)','Raw strain (%)','Smoothed strain (%)'].concat(ts.driveFrequency_Hz?['Estimated drive frequency (Hz)']:[],['Point type']);
  addGraph(detail,{title:'Strain over time',
    sub:'How much the sample contracted at every moment of the test. Each of the '+ts.time_s.length.toLocaleString()+' video frames is one data point; zoom in to see them. Higher means more contracted.',
    legend,
    tools:[{label:'Show raw',pressed:false,onClick:(b,ch)=>{raw.visible=!raw.visible;b.setAttribute('aria-pressed',String(raw.visible));b.textContent=raw.visible?'Hide raw':'Show raw';ch.draw();}}],
    csv:{headers,rows:()=>ts.time_s.map((x,i)=>[ts.frame[i],x,ts.rawStrain_pct[i],ts.smoothStrain_pct[i]].concat(ts.driveFrequency_Hz?[ts.driveFrequency_Hz[i]]:[],[pt[i]]))},
    chart:{xLabel:'Time since actuation start (s)',yLabel:'Contraction strain (%)',series,zoom:true,
      tooltip:i=>{const items=[{label:'Strain',value:fmtNum(ts.smoothStrain_pct[i])+' %',color:'--series-1'}];if(raw.visible)items.push({label:'Raw',value:fmtNum(ts.rawStrain_pct[i])+' %',color:'--raw'});if(ts.driveFrequency_Hz)items.push({label:'Drive frequency',value:fmtNum(ts.driveFrequency_Hz[i],2)+' Hz'});if(pt[i])items.push({label:pt[i],value:'',color:pt[i].startsWith('Most c')?'--series-2':'--series-3'});return {head:'t = '+fmtNum(ts.time_s[i],3)+' s · frame '+ts.frame[i],items};}}});
}

/* Every frame placed at (cycle number + fraction completed).
   Fixed frequency: valley to valley, exactly as in the ALL DATA POINTS export.
   Sweep: no detected cycles, so the drive cycle is integrated from the sweep frequency. */
function cyclePoints(t){
  const ts=t.timeSeries,x=[],y=[],idx=[];
  if(t.type==='fixedFrequency'){
    const v=ts.valleyIndex||[],n=v.length-1;
    for(let c=0;c<n;c++){const a=v[c],b=v[c+1],end=c<n-1?b-1:b;for(let i=a;i<=end;i++){x.push(c+1+(i-a)/(b-a));y.push(ts.smoothStrain_pct[i]);idx.push(i);}}
  }else{
    const f=ts.driveFrequency_Hz,tt=ts.time_s,dur=t.settings.sweepDuration_s;let cyc=0;
    for(let i=0;i<tt.length;i++){if(i>0)cyc+=.5*(f[i]+f[i-1])*(tt[i]-tt[i-1]);if(tt[i]<0||tt[i]>dur)continue;x.push(1+cyc);y.push(ts.smoothStrain_pct[i]);idx.push(i);}
  }
  return {x,y,idx};
}
function strainCycleGraph(t){
  const ts=t.timeSeries,P=cyclePoints(t),fixed=t.type==='fixedFrequency';
  if(!P.x.length){const n=el('div','note');n.append(el('strong',null,'Strain by cycle'),el('p',null,'No complete cycles were detected in this test, so there is nothing to place on a cycle axis.'));detail.append(n);return;}
  const nCycles=Math.floor(P.x[P.x.length-1]-1e-9);
  const headers=['Video frame','Time (s)','Cycle number','Cycle position (cycle + fraction)','Percent through cycle (%)','Smoothed strain (%)'].concat(fixed?[]:['Estimated drive frequency (Hz)']);
  addGraph(detail,{title:'Strain by cycle',
    sub:fixed?'The same data lined up by cycle, so each contraction can be compared with the next. '+P.x.length.toLocaleString()+' points; 2.5 means halfway through cycle 2. A cycle runs from one full stretch (valley) to the next.'
             :'The same data lined up by drive cycle ('+P.x.length.toLocaleString()+' points). Sweep tests have no detected cycles, so the cycle number comes from the sweep frequency over time.',
    tools:[{label:'First 3 cycles',onClick:(b,ch)=>ch.setZoom([1,Math.min(4,P.x[P.x.length-1])])}],
    csv:{headers,rows:()=>P.x.map((cx,k)=>{const i=P.idx[k];return [ts.frame[i],ts.time_s[i],Math.floor(cx),+cx.toFixed(5),+((cx%1)*100).toFixed(2),P.y[k]].concat(fixed?[]:[ts.driveFrequency_Hz[i]]);})},
    chart:{xLabel:fixed?'Cycle number':'Drive cycle number (from sweep timing)',yLabel:'Contraction strain (%)',zoom:true,
      series:[{label:'Strain',color:'--series-1',x:P.x,y:P.y,width:1.6,dots:true}],
      vlines:nCycles<=12?Array.from({length:nCycles+1},(_,k)=>({x:k+1,label:''})):[],
      tooltip:k=>{const i=P.idx[k],cx=P.x[k],items=[{label:'Strain',value:fmtNum(P.y[k])+' %',color:'--series-1'},{label:'Through cycle',value:fmtNum((cx%1)*100,1)+' %'},{label:'Time',value:fmtNum(ts.time_s[i],3)+' s'}];if(!fixed)items.push({label:'Drive frequency',value:fmtNum(ts.driveFrequency_Hz[i],2)+' Hz'});return {head:'Cycle '+Math.floor(cx)+' · frame '+ts.frame[i],items};}}});
}

function cycleRangeGraph(t){
  if(!t.cycles)return;
  const cy=t.cycles,mean=t.summary.meanCycleStrainRange_pct;
  const headers=['Cycle','Start time (s)','Period (s)','Frequency (Hz)','Strain range (%)','Mean strain (%)','Min strain (%)','Max strain (%)'];
  const rows=()=>cy.number.map((n,i)=>[n,cy.startTime_s[i],cy.period_s[i],cy.frequency_Hz[i],cy.strainRange_pct[i],cy.meanStrain_pct[i],cy.minStrain_pct[i],cy.maxStrain_pct[i]]);
  const entry=addGraph(detail,{title:'Contraction in each cycle',
    sub:'Each bar is one cycle’s stroke: its highest strain minus its lowest. The dashed line is the average ('+fmtNum(mean,1)+' %). Bars that stay level mean the sample behaved consistently.',
    tools:[{label:'Show table',onClick:b=>{const s=entry.tableView.classList.toggle('show');b.textContent=s?'Hide table':'Show table';if(s)fillTable(entry.tableView,headers,rows());}}],
    csv:{headers,rows},
    chart:{type:'bar',xLabel:'Cycle number',yLabel:'Strain range (%)',zeroBase:true,zoom:true,
      series:[{kind:'bar',label:'Strain range',color:'--series-1',x:cy.number,y:cy.strainRange_pct}],hlines:[{y:mean,label:'average '+fmtNum(mean)+' %'}],
      tooltip:i=>({head:'Cycle '+cy.number[i]+' · starts at '+fmtNum(cy.startTime_s[i],2)+' s',items:[{label:'Stroke (max − min)',value:fmtNum(cy.strainRange_pct[i])+' %',color:'--series-1'},{label:'Lowest / highest',value:fmtNum(cy.minStrain_pct[i])+' / '+fmtNum(cy.maxStrain_pct[i])+' %'},{label:'Cycle frequency',value:fmtNum(cy.frequency_Hz[i],3)+' Hz'}]})}});
}

function fftGraph(t){
  const f=t.fft;
  addGraph(detail,{title:'Frequency content (FFT)',
    sub:'Shows which rhythms are in the motion. A tall peak on the dashed line at '+t.settings.frequency_Hz+' Hz means the sample kept time with the drive signal.',
    csv:{headers:['Frequency (Hz)','Power (arbitrary units)'],rows:()=>f.frequency_Hz.map((x,i)=>[x,f.power[i]])},
    chart:{xLabel:'Frequency (Hz)',yLabel:'Power (arbitrary units)',zeroBase:true,zoom:true,
      series:[{label:'Power',color:'--series-1',x:f.frequency_Hz,y:f.power,width:2}],vlines:[{x:t.settings.frequency_Hz,label:'drive '+t.settings.frequency_Hz+' Hz'}],
      tooltip:i=>({head:fmtNum(f.frequency_Hz[i],3)+' Hz',items:[{label:'Power',value:f.power[i].toPrecision(3),color:'--series-1'}]})}});
}

function amplitudeGraph(t){
  const a=t.amplitude,iMax=a.percentileAmplitude_pct.indexOf(Math.max(...a.percentileAmplitude_pct));
  const headers=['Window center frequency (Hz)','Window center time (s)','Strain amplitude, 5th–95th percentile / 2 (%)','Strain amplitude, peak-to-peak / 2 (%)','Displacement amplitude (mm)'];
  const rows=()=>a.frequency_Hz.map((f,i)=>[f,a.centerTime_s[i],a.percentileAmplitude_pct[i],a.peakAmplitude_pct[i],a.displacementAmplitude_mm[i]]);
  const entry=addGraph(detail,{title:'Response at each frequency',
    sub:'How far the sample moved at each point in the sweep. The blue line ignores single noisy frames, the orange line includes them, and the green dot marks the strongest response.',
    legend:[{label:'Typical amplitude (5th–95th percentile)',color:'--series-1'},{label:'Peak-to-peak / 2',color:'--series-2'},{label:'Strongest response',color:'--series-3',marker:true}],
    tools:[{label:'Show table',onClick:b=>{const s=entry.tableView.classList.toggle('show');b.textContent=s?'Hide table':'Show table';if(s)fillTable(entry.tableView,headers,rows());}}],
    csv:{headers,rows},
    chart:{xLabel:'Drive frequency (Hz)',yLabel:'Strain amplitude (%)',zeroBase:true,zoom:true,
      series:[{label:'Typical',color:'--series-1',x:a.frequency_Hz,y:a.percentileAmplitude_pct,width:2},{label:'Peak-to-peak / 2',color:'--series-2',x:a.frequency_Hz,y:a.peakAmplitude_pct,width:1.4},{kind:'points',color:'--series-3',x:[a.frequency_Hz[iMax]],y:[a.percentileAmplitude_pct[iMax]],size:6}],
      tooltip:i=>({head:fmtNum(a.frequency_Hz[i],3)+' Hz · t = '+fmtNum(a.centerTime_s[i],1)+' s',items:[{label:'Typical amplitude',value:fmtNum(a.percentileAmplitude_pct[i])+' %',color:'--series-1'},{label:'Peak-to-peak / 2',value:fmtNum(a.peakAmplitude_pct[i])+' %',color:'--series-2'},{label:'Displacement',value:fmtNum(a.displacementAmplitude_mm[i],3)+' mm'}]})}});
}

/* initial selection: from the URL hash, else the first (July) test */
const fromHash=decodeURIComponent((location.hash||'').slice(1)),start=tests.findIndex(t=>t.id===fromHash);
select(start>=0?start:0,null);
$('generated').textContent='Data exported '+D.generated+' from the saved MATLAB results.';
})();
