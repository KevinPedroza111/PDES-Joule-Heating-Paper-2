(()=>{
const $=id=>document.getElementById(id);
const svg=$('schem');if(!svg)return;
const NS='http://www.w3.org/2000/svg',RDS=0.025;
const motionOn=()=>document.body.classList.contains('has-motion');
const css=name=>getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* ---------- Component descriptions (from the Electrical Circuit Procedure, section 3) ---------- */
const parts={
v1:{id:'V1',name:'DC power supply',val:'2 V nominal · 1.5–2.0 V in use',text:'Provides the energy for Joule heating. Its positive terminal connects to the coated sample, and its negative terminal connects to the MOSFET source through the common return. While the MOSFET conducts, the supply voltage and the total series resistance set the current, as long as the supply stays in constant-voltage mode. The current limit caps the maximum current.'},
r1:{id:'R1',name:'Liquid-metal coating on the PDES sample',val:'1 Ω nominal · coating + contacts',text:'The coating is the conductive heating path along the sample. Its resistance turns electrical energy into heat (P = I²R), which warms the PDES and makes it contract under the hanging load. When the current stops, the sample releases heat and recovers as it cools. R1 models the coated-sample connection, coating plus contacts; it is not an extra resistor in the real circuit.'},
r2:{id:'R2',name:'Thin hanging wire',val:'1 Ω nominal',text:'Completes the electrical connection to the hanging sample while letting it move. It is in series with the coating, so it carries the same current. Its resistance adds to the circuit total and dissipates power outside the sample, which is why it is measured on its own and subtracted from the combined reading.'},
q1:{id:'Q1',name:'IRLZ44NPBF N-channel MOSFET',val:'VGS ≈ 5 V → on · ≈ 0 V → off',text:'Switches the heating current. The drain (D) connects to the thin-wire end of the load, the source (S) to the common return, and the gate (G) receives the function-generator signal. About 5 V gate-to-source opens a low-resistance path from drain to source; returning to about 0 V interrupts it and ends the heating interval. This lets a small control signal switch the much larger supply current.'},
vg:{id:'VG',name:'Function generator (Analog Discovery 3)',val:'0–5 V square wave',text:'Sets the timing of the heating cycles by applying a 0–5 V square wave to the MOSFET gate: the high part commands heating and the low part commands cooling. Frequency sets cycles per second, and duty cycle sets the fraction of each cycle spent heating; 1 Hz at 50% gives 0.5 s of heating then 0.5 s of cooling. It only controls the switching; the DC supply delivers the heating energy.'},
led:{id:'D1',name:'Red indicator LED (LTL-307EE)',val:'Lights while the gate signal is high',text:'A visible timing reference for the electrical command. It lights during the high part of the gate signal, so the command timing can be found in the video recording. A lit LED confirms the control signal is present; it does not confirm current is flowing through the sample.'},
r3:{id:'R3',name:'6 kΩ resistor',val:'LED current limit',text:'Limits the current through the LED. The LED and this resistor form a series branch from the gate signal to the common return, which runs separately from the sample’s heating-current path.'},
tp1:{id:'TP1',name:'Gate test point · CH1',val:'Oscilloscope channel 1',text:'Put the oscilloscope’s CH1 tip here with its ground clip on the common return. Measuring between gate and source shows the applied 0–5 V control waveform.'},
tp2:{id:'TP2',name:'Drain test point · CH2',val:'Oscilloscope channel 2',text:'Put the CH2 tip here with its ground clip on the common return. Measuring between drain and source shows the switching: the drain voltage falls while the MOSFET conducts and rises toward the supply voltage when it turns off.'},
ret:{id:'GND',name:'Common return',val:'Shared reference point',text:'Connects the DC supply’s negative terminal, the MOSFET source and the function-generator return. It is the reference for the gate signal and completes the power-current path. The ground symbol in the schematic marks this shared point.'}
};
const extraParts=[
{id:'Cu',name:'Copper clips',val:'Not drawn · part of R1',text:'Hold the sample’s ends and make electrical contact with the liquid-metal coating. They also mark the ends of the active length, so placing them consistently keeps the measurements matched to the region that actuates. Poor contact adds resistance and changes the current and local heating.'},
{id:'DMM',name:'Multimeter',val:'Resistance before and after testing',text:'Measures the wire and coated-sample connection resistances before and after testing, always with power disconnected. In voltage mode it measures the potential difference between selected points. Never take resistance readings on the energized circuit.'},
{id:'OSC',name:'Oscilloscope (optional)',val:'CH1 → TP1 · CH2 → TP2',text:'Records voltage over time. Gate-to-source verifies the control waveform; drain-to-source shows the switching response. Measuring current needs a current probe or the voltage across a known series resistance. Oscilloscope use supplements the original procedure, so document the probe setup and acquisition settings.'}
];

/* ---------- State ---------- */
const st={mode:'auto',freq:.5,duty:.5,V:2,R1:1,R2:1,connected:true,t:0,temp:0,high:false,sel:null};

/* ---------- Part selection ---------- */
const info=$('part-info');
function showPart(key){
  st.sel=key;
  svg.querySelectorAll('.part').forEach(g=>g.classList.toggle('sel',g.dataset.part===key));
  const p=parts[key];
  info.classList.remove('swap');void info.offsetWidth;info.classList.add('swap');
  info.innerHTML=p?'<div class="pi-id">'+p.id+'</div><h4>'+p.name+'</h4><div class="pi-val">'+p.val+'</div><p>'+p.text+'</p>'
    :'<div class="pi-id">?</div><h4>Click any component</h4><div class="pi-val">The schematic is live</div><p>Select a part of the circuit to see what it does. Use the controls to switch the generator, change values and disconnect the sample; current, heating and the LED respond in real time.</p>';
}
svg.querySelectorAll('.part').forEach(g=>{
  g.addEventListener('click',()=>showPart(g.dataset.part));
  g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showPart(g.dataset.part);}});
});
showPart(null);

/* ---------- Controls ---------- */
const modes={auto:$('mode-auto'),low:$('mode-low'),high:$('mode-high')};
let ready=false;
function refresh(){if(!ready)return;st.high=gateHigh();render();drawPtx();}
Object.entries(modes).forEach(([m,b])=>b.onclick=()=>{st.mode=m;Object.entries(modes).forEach(([k,x])=>x.setAttribute('aria-pressed',String(k===m)));refresh();});
function bind(id,key,fmt,scale=1){const el=$(id),out=$(id+'-out');const f=()=>{st[key]=parseFloat(el.value)*scale;out.textContent=fmt(st[key]);refresh();};el.addEventListener('input',f);f();}
bind('volt','V',v=>v.toFixed(2)+' V');
bind('r1','R1',v=>v.toFixed(2)+' Ω');
bind('r2','R2',v=>v.toFixed(2)+' Ω');
bind('duty','duty',v=>Math.round(v*100)+'%',.01);
$('freq').addEventListener('change',e=>{st.freq=parseFloat(e.target.value);$('freq-out').textContent=st.freq+' Hz';refresh();});
$('connected').addEventListener('change',e=>{st.connected=e.target.checked;refresh();});
function gateHigh(){return st.mode==='high'||(st.mode==='auto'&&((st.t*st.freq)%1)<st.duty);}

/* ---------- Moving charge dots ---------- */
const dotsG=$('dots');
function makeDots(path,n,cls){const p=svg.querySelector('.flow.'+path),L=p.getTotalLength(),list=[];for(let i=0;i<n;i++){const c=document.createElementNS(NS,'circle');c.setAttribute('class','dot '+cls);c.setAttribute('r',cls==='led'?3.2:4.2);c.style.opacity=0;dotsG.append(c);list.push(c);}return {p,L,list,s:0};}
const powerDots=makeDots('power',22,'power'),ledDots=makeDots('led',12,'led');
function moveDots(set,on,speed,dt){set.s=(set.s+speed*dt)%set.L;set.list.forEach((c,i)=>{const d=(set.s+i*set.L/set.list.length)%set.L,pt=set.p.getPointAtLength(d);c.setAttribute('cx',pt.x.toFixed(1));c.setAttribute('cy',pt.y.toFixed(1));c.style.opacity=on?1:0;});}

/* ---------- Readouts ---------- */
const fmtA=a=>a<.005?'0 A':(a<1?(a*1000).toFixed(0)+' mA':a.toFixed(2)+' A');
const fmtW=w=>w<.0005?'0 W':(w<1?(w*1000).toFixed(0)+' mW':w.toFixed(2)+' W');
function onCurrent(){return st.connected?st.V/(st.R1+st.R2+RDS):0;}
function render(){
  const Ion=onCurrent(),flow=st.high&&st.connected,I=flow?Ion:0;
  svg.classList.toggle('on-power',flow);svg.classList.toggle('on-gate',st.high);svg.classList.toggle('on-led',st.high);svg.classList.toggle('disconnected',!st.connected);
  $('ro-gate').textContent=st.high?'5 V':'0 V';
  $('ro-led').textContent=st.high?'On':'Off';
  $('ro-i').textContent=fmtA(I);$('ro-i-box').classList.toggle('live',flow);
  $('ro-vds').textContent=!st.connected&&!st.high?'floating':(st.high?(I*RDS).toFixed(3)+' V':st.V.toFixed(2)+' V');
  $('ro-p1').textContent=fmtW(I*I*st.R1);$('ro-p2').textContent=fmtW(I*I*st.R2);
  $('q1-state').textContent=st.high?'ON · conducting':'OFF · open';
  $('vg-state').textContent=(st.high?'HIGH · 5 V':'LOW · 0 V')+' · '+Math.round(st.duty*100)+'% duty';
  $('vg-sub').textContent='0–5 V square wave';
  $('v1-sub').textContent=st.V.toFixed(2)+' V';
  $('r1-sub').textContent=st.R1.toFixed(2)+' Ω · coating + contacts';
  $('r2-sub').textContent=st.R2.toFixed(2)+' Ω';
  $('r1-heat').setAttribute('opacity',(st.temp*.9).toFixed(3));
  const s=$('status');let cls,msg;
  if(!st.connected){cls='';msg='<b>Sample disconnected.</b> The LED still follows the command, but there’s no complete path, so no heating current flows even when the gate is high.';}
  else if(Ion>2){cls='over';msg='<b>On-state current '+Ion.toFixed(2)+' A exceeds the 2 A maximum.</b> That can damage the thin wire, the coating or the sample. Lower the voltage.';}
  else if(Ion>1){cls='high';msg='<b>On-state current '+Ion.toFixed(2)+' A</b> is above the 0.7–1.0 A target. Lower the supply voltage.';}
  else if(Ion>=.7){cls='ok';msg='<b>On-state current '+Ion.toFixed(2)+' A</b> is inside the 0.7–1.0 A target window. Average coating power at this duty cycle: '+fmtW(st.duty*Ion*Ion*st.R1)+'.';}
  else{cls='low';msg='<b>On-state current '+Ion.toFixed(2)+' A</b> is below the 0.7–1.0 A target. Raise the voltage slightly, or improve the coating contact to lower R1.';}
  s.className='status '+cls;s.innerHTML=msg;
  // operating-cycle bar
  const d=Math.round(st.duty*100),period=1/st.freq;
  $('duty-h').style.flexBasis=d+'%';$('duty-h').textContent='HEAT '+d+'%';$('duty-c').textContent='COOL '+(100-d)+'%';
  $('duty-text').textContent='At '+st.freq+' Hz and '+d+'% duty, each '+fmtS(period)+' cycle has '+fmtS(period*st.duty)+' of heating followed by '+fmtS(period*(1-st.duty))+' of cooling. The playhead follows the live circuit above.';
  $('playhead').style.display=st.mode==='auto'?'block':'none';
  $('playhead').style.left=((st.t*st.freq)%1*100)+'%';
}
const fmtS=x=>(Math.round(x*100)/100)+' s';

/* ---------- Oscilloscope ---------- */
const scope=$('scope'),sctx=scope.getContext('2d'),WINDOW=8,buf=[];
function fit(c){const dpr=Math.min(devicePixelRatio||1,2),w=c.clientWidth,h=c.clientHeight;if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}const x=c.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);return [w,h];}
function drawScope(){
  const [w,h]=fit(scope),x=sctx;x.clearRect(0,0,w,h);x.fillStyle='#0b1620';x.fillRect(0,0,w,h);
  x.strokeStyle='rgba(120,170,200,.12)';x.lineWidth=1;
  for(let i=1;i<10;i++){x.beginPath();x.moveTo(i*w/10,0);x.lineTo(i*w/10,h);x.stroke();}
  for(let j=1;j<6;j++){x.beginPath();x.moveTo(0,j*h/6);x.lineTo(w,j*h/6);x.stroke();}
  const lanes=[{key:'g',color:'#f5c542',max:5.5,top:.04,bot:.32,label:'CH1 gate · 0–5 V'},{key:'d',color:'#3fd0e0',max:Math.max(4.2,st.V*1.1),top:.37,bot:.65,label:'CH2 drain · 0–'+st.V.toFixed(1)+' V'},{key:'T',color:'#ff8a5b',max:1.1,top:.70,bot:.97,label:'Coating temperature (illustrative)'}];
  const now=buf.length?buf[buf.length-1].t:0;
  lanes.forEach(L=>{
    x.fillStyle='rgba(200,220,235,.55)';x.font='11px '+css('--mono');x.fillText(L.label,8,L.top*h+12);
    x.strokeStyle=L.color;x.lineWidth=2;x.shadowColor=L.color;x.shadowBlur=6;x.beginPath();let started=false,lastNull=false;
    for(const s of buf){const px=w-(now-s.t)/WINDOW*w;if(px<0)continue;const v=s[L.key];if(v===null){lastNull=true;continue;}const py=L.bot*h-(v/L.max)*(L.bot-L.top)*h;if(!started||lastNull){x.moveTo(px,py);started=true;lastNull=false;}else x.lineTo(px,py);}
    x.stroke();x.shadowBlur=0;
  });
  x.fillStyle='rgba(200,220,235,.45)';x.fillText(WINDOW+' s window · '+st.freq+' Hz · '+Math.round(st.duty*100)+'% duty',w-200,h-8);
}

/* ---------- Guided tour ---------- */
const tours=[
{path:'power',title:'Path 1 · The heating loop',text:'While the gate signal is high, current flows from the supply’s positive terminal through the coated sample (R1), through the thin wire (R2) and through the conducting MOSFET, then back to the negative terminal through the common return. Every element in this loop carries the same current.',chain:['V1 +','R1 coating','R2 thin wire','Q1 drain → source','Common return','V1 −']},
{path:'gate',title:'Path 2 · Gate control',text:'The function generator drives the MOSFET gate through test point TP1. The gate is insulated, so it draws almost no steady current; it only decides whether the drain-source path conducts. That’s how a 0–5 V signal can switch the supply’s ~1 A heating current.',chain:['VG output','TP1','Q1 gate','Drain-source path on/off']},
{path:'led',title:'Path 3 · The LED branch',text:'The generator output also drives the red LED through the 6 kΩ resistor, back to the common return. This branch is separate from the heating loop: disconnect the sample and the LED still flashes. It marks the command timing in the video, not the sample current.',chain:['VG output','D1 red LED','R3 6 kΩ','Common return']},
{path:'ret',title:'The shared common return',text:'The supply negative terminal, the MOSFET source and the generator return all meet at one node. It’s the reference that gives the 5 V gate command its meaning, and it completes the power-current path back to the supply.',chain:['V1 −','Q1 source','VG return','One shared node']}
];
const tourBtns=[...document.querySelectorAll('[data-tour]')];
function setTour(i){
  tourBtns.forEach((b,k)=>b.setAttribute('aria-pressed',String(k===i)));
  const focusEls=svg.querySelectorAll('[data-paths]');
  if(i===null){svg.classList.remove('focus');focusEls.forEach(e=>e.classList.remove('dim'));$('tour-title').textContent='Pick a path';$('tour-text').textContent='Choose a path on the left. The live schematic highlights it and dims everything else, while the animation keeps running.';$('tour-chain').replaceChildren();return;}
  const t=tours[i];svg.classList.add('focus');
  focusEls.forEach(e=>e.classList.toggle('dim',!e.dataset.paths.split(' ').includes(t.path)));
  $('tour-title').textContent=t.title;$('tour-text').textContent=t.text;
  const ch=$('tour-chain');ch.replaceChildren();
  t.chain.forEach((n,k)=>{if(k){const a=document.createElement('span');a.className='arr';a.textContent='→';ch.append(a);}const c=document.createElement('span');c.className='node-chip';c.textContent=n;c.style.animationDelay=(k*.07)+'s';ch.append(c);});
}
tourBtns.forEach((b,i)=>b.onclick=()=>setTour(i));
$('tour-clear').onclick=()=>setTour(null);
setTour(null);

/* ---------- Component reference grid ---------- */
const grid=$('parts-grid');
['v1','r1','r2','q1','vg','led','r3','ret','tp1'].forEach(k=>grid.append(partCard(parts[k],k)));
extraParts.forEach(p=>grid.append(partCard(p,null)));
function partCard(p,key){const d=document.createElement('div');d.className='card pcard';d.innerHTML='<div class="pc-top"><span class="pc-id">'+p.id+'</span><div><h3>'+p.name+'</h3><div class="pc-val">'+p.val+'</div></div></div><p>'+p.text+'</p>';if(key){const b=document.createElement('button');b.type='button';b.textContent='Show on schematic ↑';b.onclick=()=>{showPart(key);$('schem-card').scrollIntoView({behavior:motionOn()?'smooth':'auto',block:'center'});};d.append(b);}return d;}
grid.querySelectorAll('.pcard').forEach(el=>{el.classList.add('reveal','pending');});
const gridObs=new IntersectionObserver(es=>{let i=0;es.forEach(e=>{if(e.isIntersecting){e.target.style.setProperty('--d',Math.min(i++*.06,.4)+'s');e.target.classList.remove('pending');gridObs.unobserve(e.target);}});},{threshold:.08});
grid.querySelectorAll('.pcard').forEach(el=>gridObs.observe(el));

/* ---------- Power-transfer chart (section 13) ---------- */
const ptx=$('ptx'),pctx=ptx.getContext('2d');let ptxProgress=0,ptxSeen=false;
const rrem=$('rrem');rrem.addEventListener('input',()=>{$('rrem-out').textContent=parseFloat(rrem.value).toFixed(2)+' Ω';});
new IntersectionObserver(es=>{if(es[0].isIntersecting)ptxSeen=true;},{threshold:.3}).observe(ptx);
function drawPtx(){
  const [w,h]=fit(ptx),x=pctx,V=st.V,Rr=parseFloat(rrem.value),RMAX=4;
  const pad={l:52,r:18,t:20,b:40},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b;
  const P=rc=>V*V*rc/((rc+Rr)*(rc+Rr)),Pmax=V*V/(4*Rr),yMax=Math.max(Pmax*1.25,.1);
  const X=rc=>pad.l+rc/RMAX*pw,Y=p=>pad.t+ph-p/yMax*ph;
  x.clearRect(0,0,w,h);
  const ink=css('--ink'),muted=css('--muted'),line=css('--line'),blue=css('--blue'),heat=css('--heat');
  x.font='11px '+css('--mono');x.strokeStyle=line;x.lineWidth=1;x.fillStyle=muted;
  for(let i=0;i<=4;i++){const xx=X(i);x.beginPath();x.moveTo(xx,pad.t);x.lineTo(xx,pad.t+ph);x.stroke();x.fillText(i+' Ω',xx-8,h-pad.b+18);}
  for(let j=0;j<=4;j++){const p=yMax*j/4,yy=Y(p);x.beginPath();x.moveTo(pad.l,yy);x.lineTo(pad.l+pw,yy);x.stroke();x.fillText(p.toFixed(2),6,yy+4);}
  x.fillText('W',6,pad.t-6);x.fillText('R coating',pad.l+pw-62,h-6);
  // curve (drawn in progressively on first view)
  const end=RMAX*ptxProgress;x.strokeStyle=blue;x.lineWidth=3;x.beginPath();
  for(let rc=0;rc<=end+1e-9;rc+=.02){const xx=X(rc),yy=Y(P(rc));rc===0?x.moveTo(xx,yy):x.lineTo(xx,yy);}x.stroke();
  if(ptxProgress<1)return;
  // peak marker
  x.setLineDash([5,4]);x.strokeStyle=muted;x.beginPath();x.moveTo(X(Rr),pad.t);x.lineTo(X(Rr),pad.t+ph);x.stroke();x.setLineDash([]);
  x.fillStyle=ink;x.beginPath();x.arc(X(Rr),Y(Pmax),5,0,Math.PI*2);x.fill();
  x.fillText('peak at R coating = R remaining ('+fmtW(Pmax)+')',Math.min(X(Rr)+8,w-250),Y(Pmax)-10);
  // current R1
  const r1=Math.min(st.R1,RMAX);x.fillStyle=heat;x.shadowColor=heat;x.shadowBlur=10;x.beginPath();x.arc(X(r1),Y(P(r1)),6.5,0,Math.PI*2);x.fill();x.shadowBlur=0;
  $('ptx-tag').textContent='V = '+V.toFixed(2)+' V';
}

/* Motion paused: draw a static snapshot of the last 8 s for the current settings. */
function synthScope(){
  buf.length=0;const n=480,Ion=onCurrent();let T=0;
  for(let k=-n;k<=n;k++){const tt=st.t-WINDOW*2+(k+n)*WINDOW/n,ph=((tt*st.freq)%1+1)%1;
    const hi=st.mode==='high'||(st.mode==='auto'&&ph<st.duty),flow=hi&&st.connected,I=flow?Ion:0;
    T+=((flow?Math.min(1,I*I*st.R1/1.2):0)-T)*(WINDOW/n)/1.1;
    if(k>=0)buf.push({t:tt,g:hi?5:0,d:st.connected?(flow?I*RDS:st.V):null,T});}
}

/* ---------- Main loop ---------- */
let last=0;
ready=true;refresh();
function frame(now){
  const dt=last?Math.min((now-last)/1000,.05):0;last=now;
  const moving=motionOn();
  if(moving)st.t+=dt;
  st.high=gateHigh();
  const Ion=onCurrent(),flow=st.high&&st.connected,I=flow?Ion:0;
  const target=flow?Math.min(1,I*I*st.R1/1.2):0;
  st.temp=moving?st.temp+(target-st.temp)*Math.min(1,dt/1.1):target;
  if(moving){
    moveDots(powerDots,flow,40+90*Math.min(I,2.5),dt);
    moveDots(ledDots,st.high,55,dt);
    buf.push({t:st.t,g:st.high?5:0,d:st.connected?(flow?I*RDS:st.V):null,T:st.temp});
    while(buf.length&&st.t-buf[0].t>WINDOW+.5)buf.shift();
  }else{moveDots(powerDots,flow,0,0);moveDots(ledDots,st.high,0,0);synthScope();}
  if(ptxSeen&&ptxProgress<1)ptxProgress=moving?Math.min(1,ptxProgress+dt/1.4):1;
  render();drawScope();drawPtx();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
