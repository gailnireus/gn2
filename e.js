(async function(){
  const EARN_PER_MIN = 0.01;
  const DB_NAME = 'gailnireus_db_v1';

  const db = new Dexie(DB_NAME);
  db.version(1).stores({ players: 'tag,createdAt,lastUpdated,wallet' });

  const center = document.getElementById('center');
  const signupLink = document.getElementById('signup-link');
  const loginLink = document.getElementById('login-link');
  const resetLink = document.getElementById('reset-link');
  const evoLink = document.getElementById('evo-link');
  const whoamiLink = document.getElementById('whoami-link');

  let current = null;
  let ticker = null;
  let isPromptActive = false;

  const now = ()=>Date.now();
  const fmtMoney = n=>n.toFixed(2)+'e';

  // --- evolution titles ---
  const titles = [
    {day:3, name:'Minor Node'},
    {day:30, name:'Elder Node'},
    {day:90, name:'Prime Node'},
    {day:180, name:'Ascended Core'},
    {day:360, name:'Eternal Construct'}
  ];

  // --- calculation helper ---
  const calc = (p)=>{
    const created=p.createdAt;
    const t=now();
    const days=Math.floor((t-created)/(86400000))+1;
    const totalMin=Math.floor((t-created)/60000);
    const hrs=Math.floor(totalMin/60);
    const mins=totalMin%60;
    const live=p.wallet+((t-p.lastUpdated)/60000)*EARN_PER_MIN;
    return {days,hrs,mins,live};
  };

  // --- render UI ---
  const render = (p)=>{
    if(isPromptActive) return;
    if(!p){
      center.innerHTML = `
        <div class="text-sm">tag: —</div>
        <div class="text-sm">day: —</div>
        <div class="text-sm">time: —</div>
        <div class="text-sm">wallet: —</div>`;
      return;
    }
    const {days,hrs,mins,live}=calc(p);
    center.innerHTML = `
      <div class="text-sm">tag: ${p.tag}</div>
      <div class="text-sm">day: ${days}</div>
      <div class="text-sm">time: ${hrs} h ${String(mins).padStart(2,'0')} m</div>
      <div class="text-sm">wallet: ${fmtMoney(live)}</div>`;
  };

  // --- save updated data ---
  const persist = async(p)=>{
    const t=now();
    const mins=Math.floor((t-p.lastUpdated)/60000);
    if(mins>=1){
      p.wallet+=mins*EARN_PER_MIN;
      p.lastUpdated+=mins*60000;
      await db.players.put(p);
    }
  };

  // --- ticker: auto-update display & persist ---
  const startTicker = ()=>{
    if(ticker) clearInterval(ticker);
    ticker=setInterval(async()=>{
      if(!current) return;
      if(isPromptActive) return; // pause render bila buka prompt
      render(current);
      await persist(current);
    },1000);
  };

  // --- prompt UI (inline input) ---
  const showPrompt = (text,cb)=>{
    isPromptActive = true;
    clearInterval(ticker); // pause ticker sementara prompt aktif

    center.innerHTML = `
      <div class="text-sm">${text}</div>
      <input id="inline-input"
        class="invisible-input text-sm bg-transparent border-none outline-none text-center text-gray-200 mt-2"
        maxlength="3" autofocus />
    `;
    const inp=document.getElementById('inline-input');
    inp.focus();

    inp.addEventListener('keydown',e=>{
      if(e.key==='Enter'){
        const val=inp.value.trim();
        isPromptActive=false;
        startTicker(); // resume ticker
        cb(val);
      } else if(e.key==='Escape'){
        isPromptActive=false;
        startTicker(); // resume ticker
        render(current);
      }
    });
  };

  // --- feature 1: Offline Task Queue ---
  async function applyOfflineEarnings(p){
    const t=now();
    const diff=t-p.lastUpdated;
    if(diff>60000){
      const mins=Math.floor(diff/60000);
      const earn=mins*EARN_PER_MIN;
      p.wallet+=earn;
      p.lastUpdated=t;
      await db.players.put(p);
      const hours=(mins/60).toFixed(0);
      const msg=`<div class="text-sm">welcome back node ${p.tag}.<br>${hours}h offline earnings: +${fmtMoney(earn)}</div>`;
      center.innerHTML=msg;
      setTimeout(()=>{isPromptActive=false;render(current);},2500);
    }
  }

  // --- signup ---
  async function signupFlow(){
    showPrompt('signup — enter 3-digit tag:', async val=>{
      if(!/^[0-9]{3}$/.test(val)){render(current);return;}
      const exists=await db.players.get(val);
      if(exists){
        center.innerHTML='<div class="text-sm">tag exists. try login.</div>';
        setTimeout(()=>{isPromptActive=false;render(current)},2000);
        return;
      }
      const t=now();
      const p={tag:val,createdAt:t,lastUpdated:t,wallet:0};
      await db.players.add(p);
      current=p;
      localStorage.setItem('gailnireus_last_tag',val);
      center.innerHTML=`<div class="text-sm">created tag ${val}</div>`;
      setTimeout(()=>{isPromptActive=false;render(current)},1000);
    });
  }

  // --- login ---
  async function loginFlow(){
    showPrompt('login — enter tag:', async val=>{
      if(!/^[0-9]{3}$/.test(val)){render(current);return;}
      const p=await db.players.get(val);
      if(!p){
        center.innerHTML='<div class="text-sm">not found.</div>';
        setTimeout(()=>{isPromptActive=false;render(current)},2000);
        return;
      }
      current=p;
      localStorage.setItem('gailnireus_last_tag',val);
      await applyOfflineEarnings(p);
      render(p);
    });
  }

  // --- reset ---
  async function resetFlow(){
    showPrompt('reset — enter tag:', async val=>{
      if(!/^[0-9]{3}$/.test(val)){render(current);return;}
      const p=await db.players.get(val);
      if(!p){
        center.innerHTML='<div class="text-sm">not found.</div>';
        setTimeout(()=>{isPromptActive=false;render(current)},2000);
        return;
      }
      await db.players.delete(val);
      if(current && current.tag===val) current=null;
      center.innerHTML=`<div class="text-sm">tag ${val} deleted</div>`;
      setTimeout(()=>{isPromptActive=false;render(current)},1200);
    });
  }

  // --- feature 2: Evolution ---
  async function evoFlow(){
    if(!current){
      center.innerHTML='<div class="text-sm">no active tag.</div>';
      setTimeout(()=>{isPromptActive=false;render(current)},2000);
      return;
    }
    const {days}=calc(current);
    const title=titles.slice().reverse().find(t=>days>=t.day);
    let list=titles.map(t=>`${t.day}d → ${t.name}`).join('<br>');
    let msg=`<div class="text-sm">evolution chart:<br>${list}</div>`;
    if(title){msg+=`<br><br>current title:<br>${title.name} (${days} day)`;}
    center.innerHTML=msg;
    setTimeout(()=>{isPromptActive=false;render(current)},4000);
  }

  // --- feature 3: AI Echo (whoami) ---
  async function whoamiFlow(){
    const all=await db.players.toArray();
    if(all.length===0){
      center.innerHTML='<div class="text-sm">no nodes detected.</div>';
      setTimeout(()=>{isPromptActive=false;render(current)},2000);
      return;
    }
    let lines=all.map(p=>{
      const {hrs,mins}=calc(p);
      return `you are node #${p.tag}, ${hrs}h ${mins}m alive.`;
    }).join('<br>');
    const msg=`<div class="text-sm text-gray-300">> whoami<br>${lines}</div>`;
    center.innerHTML=msg;
    setTimeout(()=>{isPromptActive=false;render(current)},4000);
  }

  // --- events ---
  signupLink.onclick=e=>{e.preventDefault();signupFlow();};
  loginLink.onclick=e=>{e.preventDefault();loginFlow();};
  resetLink.onclick=e=>{e.preventDefault();resetFlow();};
  evoLink.onclick=e=>{e.preventDefault();evoFlow();};
  whoamiLink.onclick=e=>{e.preventDefault();whoamiFlow();};

  // --- auto load last session ---
  const last=localStorage.getItem('gailnireus_last_tag');
  if(last){
    const p=await db.players.get(last);
    if(p){current=p;await applyOfflineEarnings(p);render(p);}
    else render(null);
  } else render(null);

  startTicker();

  // --- service worker for offline ---
  try{
    const swCode=`
      const C='gailnireus-cache-v6';
      self.addEventListener('install',e=>{
        e.waitUntil(caches.open(C).then(c=>c.addAll([
          'index.html','e.js',
          'https://cdn.tailwindcss.com',
          'https://cdn.jsdelivr.net/npm/dexie@3.2.2/dist/dexie.min.js'
        ])));
        self.skipWaiting();
      });
      self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
      self.addEventListener('fetch',e=>{
        e.respondWith(
          caches.match(e.request).then(r=>r||fetch(e.request).catch(()=>caches.match('index.html')))
        );
      });
    `;
    const blob=new Blob([swCode],{type:'text/javascript'});
    const url=URL.createObjectURL(blob);
    if('serviceWorker' in navigator){navigator.serviceWorker.register(url);}
  }catch(e){console.log('sw fail',e);}
})();