(async function(){
  const EARN_PER_MIN = 0.01;
  const db = new Dexie('gailnireus_db_v1');
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

  const titles = [
    {day:3, name:'Minor Node'},
    {day:30, name:'Elder Node'},
    {day:90, name:'Prime Node'},
    {day:180, name:'Ascended Core'},
    {day:360, name:'Eternal Construct'}
  ];

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

  const render = (p)=>{
    if(isPromptActive) return;
    if(!p){
      center.innerHTML = `
        <div>tag: —</div>
        <div>day: —</div>
        <div>time: —</div>
        <div>wallet: —</div>`;
      return;
    }
    const {days,hrs,mins,live}=calc(p);
    center.innerHTML = `
      <div>tag: ${p.tag}</div>
      <div>day: ${days}</div>
      <div>time: ${hrs} h ${String(mins).padStart(2,'0')} m</div>
      <div>wallet: ${fmtMoney(live)}</div>`;
  };

  const persist = async(p)=>{
    const t=now();
    const mins=Math.floor((t-p.lastUpdated)/60000);
    if(mins>=1){
      p.wallet+=mins*EARN_PER_MIN;
      p.lastUpdated+=mins*60000;
      await db.players.put(p);
    }
  };

  const startTicker = ()=>{
    if(ticker) clearInterval(ticker);
    ticker=setInterval(async()=>{
      if(current && !isPromptActive){
        render(current);
        await persist(current);
      }
    },1000);
  };

  const showPrompt = (text,cb)=>{
    isPromptActive = true;
    center.innerHTML = `
      <div>${text}</div>
      <input id="inline-input" class="bg-transparent border-none outline-none text-center text-gray-200 mt-2 text-sm" maxlength="3" autofocus />
    `;
    const inp=document.getElementById('inline-input');
    inp.focus();
    inp.addEventListener('keydown',e=>{
      if(e.key==='Enter'){
        const val=inp.value.trim();
        isPromptActive=false;
        cb(val);
      } else if(e.key==='Escape'){
        isPromptActive=false;
        render(current);
      }
    });
  };

  // Global click listener
  document.addEventListener('click', (e)=>{
    if(!isPromptActive) return;
    const tagName = e.target.tagName.toLowerCase();
    const id = e.target.id;
    // kalau klik pada link bawah, jangan tutup
    if(['a','button'].includes(tagName)) return;
    if(['signup-link','login-link','reset-link','evo-link','whoami-link'].includes(id)) return;

    // selain tu — tutup prompt/info
    isPromptActive = false;
    render(current);
  });

  async function applyOfflineEarnings(p){
    const t=now();
    const diff=t-p.lastUpdated;
    if(diff>60000){
      const mins=Math.floor(diff/60000);
      const earn=mins*EARN_PER_MIN;
      p.wallet+=earn;
      p.lastUpdated=t;
      await db.players.put(p);
      center.innerHTML=`<div>welcome back node ${p.tag}.<br>${(mins/60).toFixed(0)}h offline earnings: +${fmtMoney(earn)}</div>`;
      setTimeout(()=>{isPromptActive=false;render(current)},3000);
    }
  }

  async function signupFlow(){
    showPrompt('signup — enter 3-digit tag:', async val=>{
      if(!/^[0-9]{3}$/.test(val)){render(current);return;}
      const exists=await db.players.get(val);
      if(exists){center.innerHTML='<div>tag exists. try login.</div>';setTimeout(()=>{isPromptActive=false;render(current)},1500);return;}
      const t=now();
      const p={tag:val,createdAt:t,lastUpdated:t,wallet:0};
      await db.players.add(p);
      current=p;
      localStorage.setItem('gailnireus_last_tag',val);
      center.innerHTML=`<div>created tag ${val}</div>`;
      setTimeout(()=>{isPromptActive=false;render(current)},1000);
    });
  }

  async function loginFlow(){
    showPrompt('login — enter tag:', async val=>{
      if(!/^[0-9]{3}$/.test(val)){render(current);return;}
      const p=await db.players.get(val);
      if(!p){center.innerHTML='<div>not found.</div>';setTimeout(()=>{isPromptActive=false;render(current)},1500);return;}
      current=p;
      localStorage.setItem('gailnireus_last_tag',val);
      await applyOfflineEarnings(p);
      render(p);
    });
  }

  async function resetFlow(){
    showPrompt('reset — enter tag:', async val=>{
      if(!/^[0-9]{3}$/.test(val)){render(current);return;}
      const p=await db.players.get(val);
      if(!p){center.innerHTML='<div>not found.</div>';setTimeout(()=>{isPromptActive=false;render(current)},1500);return;}
      await db.players.delete(val);
      if(current && current.tag===val) current=null;
      center.innerHTML=`<div>tag ${val} deleted</div>`;
      setTimeout(()=>{isPromptActive=false;render(current)},1200);
    });
  }

  async function evoFlow(){
    if(!current){center.innerHTML='<div>no active tag.</div>';return;}
    isPromptActive=true;
    const {days}=calc(current);
    const title=titles.slice().reverse().find(t=>days>=t.day);
    let list=titles.map(t=>`${t.day}d → ${t.name}`).join('<br>');
    let msg=`<div>evolution chart:<br>${list}</div>`;
    if(title){msg+=`<br><br>current title:<br>${title.name} (${days} day)`;}
    center.innerHTML=msg;
  }

  async function whoamiFlow(){
    const all=await db.players.toArray();
    if(all.length===0){center.innerHTML='<div>no nodes detected.</div>';return;}
    isPromptActive=true;
    let lines=all.map(p=>{
      const {hrs,mins}=calc(p);
      return `you are node #${p.tag}, ${hrs}h ${mins}m alive.`;
    }).join('<br>');
    center.innerHTML=`<div>> whoami<br>${lines}</div>`;
  }

  signupLink.onclick=e=>{e.preventDefault();signupFlow();};
  loginLink.onclick=e=>{e.preventDefault();loginFlow();};
  resetLink.onclick=e=>{e.preventDefault();resetFlow();};
  evoLink.onclick=e=>{e.preventDefault();evoFlow();};
  whoamiLink.onclick=e=>{e.preventDefault();whoamiFlow();};

  const last=localStorage.getItem('gailnireus_last_tag');
  if(last){
    const p=await db.players.get(last);
    if(p){current=p;await applyOfflineEarnings(p);render(p);}
    else render(null);
  } else render(null);

  startTicker();
})();
