(()=>{
const root=document.documentElement,body=document.body,media=matchMedia('(prefers-reduced-motion: reduce)');let storedTheme,storedMotion;try{storedTheme=localStorage.getItem('jh-theme');storedMotion=localStorage.getItem('jh-motion');}catch{}
let dark=storedTheme?storedTheme==='dark':matchMedia('(prefers-color-scheme: dark)').matches,motion=storedMotion?storedMotion==='on':!media.matches;
const isHome=!!document.querySelector('.home-hero');body.classList.add(isHome?'page-home':'page-module');

/* ---------- Icons ---------- */
const icon={
moon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
pause:'<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>',
play:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L8.5 4.64A1 1 0 0 0 7 5.5z"/></svg>',
up:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
mark:'<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4.5 13.5H12L11 22l8.5-11.5H12L13 2z"/></svg>'
};

/* ---------- Brand ---------- */
const brandHTML='<span class="brand-mark" aria-hidden="true">'+icon.mark+'</span><span class="brand-text"><span class="brand-name">Joule Heating</span><span class="brand-sub">PDES Experiment Guide</span></span>';
const brand=document.querySelector('header a.brand');if(brand){brand.innerHTML=brandHTML;brand.setAttribute('aria-label','Joule Heating PDES Experiment Guide, home');}

/* ---------- Header tools: theme + motion ---------- */
const tools=document.createElement('div');tools.className='site-tools';tools.innerHTML='<button id="theme-toggle" type="button"></button><button id="motion-toggle" type="button"></button>';document.querySelector('header').appendChild(tools);
function apply(){root.dataset.theme=dark?'dark':'light';body.classList.toggle('has-motion',motion);body.classList.toggle('motion-paused',!motion);const t=document.getElementById('theme-toggle'),m=document.getElementById('motion-toggle');t.innerHTML=(dark?icon.sun:icon.moon)+'<span class="sr-only">'+(dark?'Light mode':'Dark mode')+'</span>';t.title=dark?'Switch to light mode':'Switch to dark mode';t.setAttribute('aria-label',t.title);m.innerHTML=(motion?icon.pause:icon.play)+'<span class="sr-only">'+(motion?'Pause motion':'Enable motion')+'</span>';m.title=motion?'Pause animations':'Enable animations';m.setAttribute('aria-label',m.title);m.setAttribute('aria-pressed',String(!motion));}
document.getElementById('theme-toggle').onclick=()=>{dark=!dark;apply();try{localStorage.setItem('jh-theme',dark?'dark':'light');}catch{}};
document.getElementById('motion-toggle').onclick=()=>{motion=!motion;apply();try{localStorage.setItem('jh-motion',motion?'on':'off');}catch{}};
apply();

/* ---------- Scroll progress, header shadow, back to top ---------- */
const bar=document.createElement('div');bar.id='scroll-progress';body.prepend(bar);
const toTop=document.createElement('button');toTop.id='to-top';toTop.type='button';toTop.innerHTML=icon.up;toTop.setAttribute('aria-label','Back to top');toTop.onclick=()=>scrollTo({top:0,behavior:motion?'smooth':'auto'});body.append(toTop);
const header=document.querySelector('header');
function onScroll(){const max=document.documentElement.scrollHeight-innerHeight;bar.style.transform='scaleX('+(max>0?Math.min(scrollY/max,1):0)+')';header.classList.toggle('scrolled',scrollY>8);toTop.classList.toggle('show',scrollY>innerHeight*.8);}
addEventListener('scroll',onScroll,{passive:true});addEventListener('resize',onScroll);onScroll();

/* ---------- Home hero extras ---------- */
const heroText=document.querySelector('.home-hero>div');
if(heroText){
  heroText.classList.add('hero-in');
  const badge=document.createElement('div');badge.className='hero-badge';badge.innerHTML='<b>NEW</b> Interactive 3D apparatus model';heroText.prepend(badge);
  const stats=document.createElement('div');stats.className='hero-stats';stats.innerHTML='<div><strong data-count="5">5</strong><span>Learning modules</span></div><div><strong data-count="6">6</strong><span>Procedure steps</span></div><div><strong>3D</strong><span>Interactive apparatus</span></div><div><strong>Offline</strong><span>No internet required</span></div>';heroText.append(stats);
}

/* ---------- Footer ---------- */
const footer=document.querySelector('footer');
if(footer&&!footer.querySelector('.footer-inner')){
  const note=footer.innerHTML,links=[...document.querySelectorAll('header nav a')].map(a=>'<a href="'+a.getAttribute('href')+'">'+a.textContent+'</a>').join('');
  footer.innerHTML='<div class="footer-inner"><div><a class="brand" href="Joule HeatingWebiste.html">'+brandHTML+'</a><p>An interactive guide to the liquid-metal-coated PDES Joule heating experiment: hardware, procedure, circuit and measurements.</p></div><div><h4>Modules</h4>'+links+'</div><div><h4>Explore</h4><a href="3D_Demo.html" target="_blank" rel="noopener">3D simulation ↗</a><a href="schematic.html">Interactive circuit</a><a href="procedure.html">Step-by-step procedure</a></div></div><div class="footer-note">'+note+'</div>';
}

/* ---------- Scroll reveal with stagger ---------- */
const targets=[...document.querySelectorAll('.section>.eyebrow,.section>h2,.section>.intro,.section>p,.section>h3,.overview>div,.module-link,.section>details,.step,.table-wrap,.cycle-banner>div,.note,.module-foot,.formula,.signal-results>div,.lesson-content,.try-switch>h2,.scope-brief,.breadcrumb,.section>h1,.section>.lead,.lesson-nav')].filter(el=>!el.closest('.home-hero'));
const observer=new IntersectionObserver(entries=>{let i=0;entries.forEach(e=>{if(e.isIntersecting){e.target.style.setProperty('--d',Math.min(i++*.07,.5)+'s');e.target.classList.remove('pending');observer.unobserve(e.target);}});},{threshold:.08,rootMargin:'0px 0px -40px 0px'});
targets.forEach(el=>{el.classList.add('reveal','pending');observer.observe(el);});

/* ---------- Card spotlight ---------- */
document.querySelectorAll('.module-link').forEach(card=>card.addEventListener('pointermove',e=>{const r=card.getBoundingClientRect();card.style.setProperty('--mx',(e.clientX-r.left)+'px');card.style.setProperty('--my',(e.clientY-r.top)+'px');}));

/* ---------- Smooth page transitions ---------- */
document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a||!motion||e.defaultPrevented||e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||a.target==='_blank')return;const href=a.getAttribute('href');if(!/\.html$/i.test(href)||/^[a-z]+:/i.test(href))return;e.preventDefault();body.classList.add('leaving');setTimeout(()=>{location.href=a.href;},200);});
addEventListener('pageshow',()=>body.classList.remove('leaving'));

/* ---------- Hero particles (heat + current) ---------- */
const hero=document.querySelector('.home-hero');
if(hero&&!media.matches){
  const c=document.createElement('canvas');c.id='hero-canvas';c.setAttribute('aria-hidden','true');hero.prepend(c);
  const ctx=c.getContext('2d');let w=0,h=0,dpr=1,parts=[],visible=true,last=0;
  function size(){dpr=Math.min(devicePixelRatio||1,2);w=c.clientWidth;h=c.clientHeight;c.width=w*dpr;c.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);const n=Math.round(Math.min(70,w*h/18000));parts=Array.from({length:n},()=>({x:Math.random()*w,y:Math.random()*h,r:Math.random()*1.8+.6,v:Math.random()*14+6,p:Math.random()*Math.PI*2,heat:Math.random()<.4}));}
  new IntersectionObserver(es=>{visible=es[0].isIntersecting;}).observe(hero);
  addEventListener('resize',size);size();
  function draw(now){const dt=last?Math.min((now-last)/1000,.05):0;last=now;
    if(visible&&motion){ctx.clearRect(0,0,w,h);const styles=getComputedStyle(root),blue=styles.getPropertyValue('--blue').trim(),heat=styles.getPropertyValue('--heat').trim();
      for(const q of parts){q.y-=q.v*dt;q.p+=dt*.8;q.x+=Math.sin(q.p)*.25;if(q.y<-10){q.y=h+10;q.x=Math.random()*w;}
        const fade=Math.min(1,q.y/(h*.35));ctx.globalAlpha=.55*fade;ctx.fillStyle=q.heat?heat:blue;ctx.beginPath();ctx.arc(q.x,q.y,q.r,0,Math.PI*2);ctx.fill();}
      ctx.globalAlpha=1;}
    requestAnimationFrame(draw);}
  requestAnimationFrame(draw);
}

/* ---------- Home heating-cycle demo ---------- */
const demo=document.getElementById('cycle-visual');if(demo){let t=0,last=0,temp=0,strain=0,state='';const fiber=document.getElementById('cycle-fiber'),lower=document.getElementById('cycle-lower');function frame(now){const dt=last?Math.min((now-last)/1000,.05):0;last=now;if(motion){t+=dt;const on=t%10<5;temp+=((on?1:0)-temp)*dt/2;strain+=(temp*.2-strain)*dt/.3;}const on=t%10<5;demo.classList.toggle('is-heating',on);const length=92*(1-strain);fiber.setAttribute('height',length.toFixed(2));lower.setAttribute('transform','translate(0,'+(length-92).toFixed(2)+')');const next=on?'Heating command · 5 V':'Passive cooling · 0 V';if(state!==next){document.getElementById('cycle-phase').textContent=next;state=next;}requestAnimationFrame(frame);}requestAnimationFrame(frame);}
})();
