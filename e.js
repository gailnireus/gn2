(async function(){
const EARN_PER_MIN = 0.01;
const TAX_INTERVAL_MIN = 60; //1jm
let lastTax = Date.now();

const db = new Dexie('gailnireus_db_v1');
db.version(1).stores({ players: 'tag,createdAt,lastUpdated,wallet,vault' });

const center = document.getElementById('center');
const createLink = document.getElementById('create-link');
const resetLink = document.getElementById('reset-link');
const vaultLink = document.getElementById('vault-link');
const pingLink = document.getElementById('ping-link');
const saveLink = document.getElementById('save-link');
const loadLink = document.getElementById('load-link');
const fileInput = document.getElementById('file-input');

let current = null;
let ticker = null;
let isPromptActive = false;

const now = () => Date.now();
const fmtMoney = n => n.toFixed(2)+'e';
const spinners = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
let spinIndex=0;
setInterval(()=>{spinIndex=(spinIndex+1)%spinners.length;},500);

const calc = p => {
  const t = now();
  const totalMin = Math.floor((t-p.createdAt)/60000);
  const hrs = Math.floor(totalMin/60);
  const mins = totalMin%60;
  const live = p.wallet + ((t-p.lastUpdated)/60000)*EARN_PER_MIN;
  return { hrs, mins, live };
};

const render = p => {
  if(isPromptActive) return;
  if(!p){center.innerHTML=`<div>tag: —</div><div>time: —</div><div>wallet: —</div>`; return;}
  const { hrs, mins, live } = calc(p);
  const clockChar = `<span style="color:#a855f7">${spinners[spinIndex]}</span>`;
  center.innerHTML = `
    <div>tag: ${p.tag} <span class="tag-flash">⦿</span></div>
    <div>time: ${hrs} h ${String(mins).padStart(2,'0')} m ${clockChar}</div>
    <div>wallet: ${fmtMoney(live)} <span class="pulse-dot">•</span></div>`;
};

const persist = async p => {
  const t = now();
  const mins = Math.floor((t-p.lastUpdated)/60000);
  if(mins>=1){ p.wallet += mins*EARN_PER_MIN; p.lastUpdated += mins*60000; await db.players.put(p); }
};

const startTicker = () => {
  if(ticker) clearInterval(ticker);
  ticker=setInterval(async()=>{
    if(current && !isPromptActive){
      render(current);
      await persist(current);

      // ------------------ Network Tax ------------------
      const minsSinceTax = (now() - lastTax) / 60000;
      if(minsSinceTax >= TAX_INTERVAL_MIN){
        current.wallet -= 0.01;
        if(current.wallet < 0) current.wallet = 0;
        lastTax = now();
        await db.players.put(current);
        isPromptActive = true;
        center.innerHTML = `system maintenance executed.<br>wallet: -0.01e`;
        setTimeout(()=>{ isPromptActive=false; render(current); }, 3000);
      }
      // -------------------------------------------------
    }
  },1000);
};

const showPrompt = (text, cb) => {
  isPromptActive=true;
  center.innerHTML=`<div>${text}</div><input id="inline-input" maxlength="3" autofocus />`;
  const inp=document.getElementById('inline-input');
  inp.focus();
  inp.addEventListener('keydown', e=>{
    if(e.key==='Enter'){ isPromptActive=false; cb(inp.value.trim()); }
    else if(e.key==='Escape'){ isPromptActive=false; render(current); }
  });
};

document.addEventListener('click', e=>{
  if(!isPromptActive) return;
  const id = e.target.id;
  if(['create-link','reset-link','vault-link','ping-link','save-link','load-link'].includes(id)) return;
  isPromptActive=false; render(current);
});

async function applyOfflineEarnings(p){
  const t = now();
  const diff = t - p.lastUpdated;
  if(diff>60000){
    const mins = Math.floor(diff/60000);
    const earn = mins*EARN_PER_MIN;
    p.wallet += earn;
    p.lastUpdated = t;
    await db.players.put(p);
    const hrs = Math.floor(mins/60);
    center.innerHTML=`<div>welcome back node ${p.tag}.<br>system drift detected — recalibrating ${hrs}h gap...<br>+${fmtMoney(earn)} restored.</div>`;
    setTimeout(()=>{ isPromptActive=false; render(current); },3000);
  }
}

// ------------------- FLOWS -------------------
async function createFlow(){
  showPrompt('create — enter 3-digit tag:', async val=>{
    if(!/^[0-9]{3}$/.test(val)){ render(current); return; }
    let p = await db.players.get(val);
    if(p){ if(p.vault===undefined)p.vault=0; current=p; localStorage.setItem('gailnireus_last_tag', val); center.innerHTML=`<div>tag already exist.<br>loaded node ${val}.</div>`; setTimeout(()=>{isPromptActive=false;render(current);},1500); }
    else{
      const t=now();
      p={tag:val,createdAt:t,lastUpdated:t,wallet:0,vault:0};
      await db.players.add(p);
      current=p;
      localStorage.setItem('gailnireus_last_tag', val);
      center.innerHTML=`<div>created tag ${val}</div>`;
      setTimeout(()=>{isPromptActive=false;render(current);},1000);
    }
  });
}

async function resetFlow(){
  showPrompt('reset — enter 3-digit tag:', async val=>{
    if(!/^[0-9]{3}$/.test(val)){ render(current); return; }
    const p = await db.players.get(val);
    if(!p){ center.innerHTML='<div>not found.</div>'; setTimeout(()=>{isPromptActive=false;render(current);},1500); return; }
    await db.players.delete(val);
    if(current && current.tag===val) current=null;
    center.innerHTML=`<div>tag ${val} deleted</div>`;
    setTimeout(()=>{isPromptActive=false;render(current);},1200);
  });
}

async function vaultFlow(){
  if(!current){center.innerHTML='no active tag'; return;}
  isPromptActive=true;
  if(current.vault===undefined) current.vault=0;
  const { live } = calc(current);
  const total=current.vault||0;
  center.innerHTML=`&gt; vault<br>response:<br>
    total stored: ${fmtMoney(total)}<br>
    active wallet: ${fmtMoney(live)}<br><br>
    <a href="#" id="deposit-btn" class="center-link">[deposit]</a>
    <a href="#" id="withdraw-btn" class="center-link">[withdraw]</a>`;
  const depositBtn=document.getElementById('deposit-btn');
  const withdrawBtn=document.getElementById('withdraw-btn');

  depositBtn.onclick=async e=>{
    e.preventDefault();
    await persist(current);
    const { live } = calc(current);
    if(live<=0.000001){center.innerHTML='&gt; deposit<br>response: nothing to move.'; setTimeout(()=>{isPromptActive=false;render(current);},1500); return;}
    current.wallet=0; current.lastUpdated=now(); current.vault=(current.vault||0)+live;
    await db.players.put(current);
    center.innerHTML=`&gt; deposit<br>response: +${fmtMoney(live)} moved to vault.`;
    setTimeout(()=>{isPromptActive=false;render(current);},1500);
  };

  withdrawBtn.onclick=async e=>{
    e.preventDefault();
    const amt=current.vault||0;
    if(amt<=0){center.innerHTML='&gt; withdraw<br>response: vault empty.'; setTimeout(()=>{isPromptActive=false;render(current);},1500); return;}
    current.vault=0; current.wallet=(current.wallet||0)+amt; current.lastUpdated=now();
    await db.players.put(current);
    center.innerHTML=`&gt; withdraw<br>response: +${fmtMoney(amt)} moved to wallet.`;
    setTimeout(()=>{isPromptActive=false;render(current);},1500);
  };
}

async function pingFlow(){
  if(!current){center.innerHTML='&gt; ping<br>no active node'; return;}
  isPromptActive=true;
  center.innerHTML=`&gt; ping<br>response:<br>node ${current.tag} [${calc(current).hrs>0?calc(current).hrs+'h ':''}${String(calc(current).mins).padStart(2,'0')}m] still alive.`;
  setTimeout(()=>{isPromptActive=false;render(current);},2000);
}

async function saveFlow(){
  isPromptActive=true;
  try{
    const all = await db.players.toArray();
    const sanitized=all.map(p=>({tag:p.tag,createdAt:Number(p.createdAt),lastUpdated:Number(p.lastUpdated),wallet:Number(p.wallet||0),vault:Number(p.vault||0)}));
    const blob=new Blob([JSON.stringify({exportedAt:now(),players:sanitized},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`gailnireus_save_${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    center.innerHTML='&gt; save<br>response: file downloaded.';
  } catch(err){center.innerHTML='&gt; save<br>response: failed.'; console.error(err);}
  setTimeout(()=>{isPromptActive=false;render(current);},1200);
}

async function loadFlow(){
  isPromptActive=true;
  fileInput.value=''; fileInput.click();
  fileInput.onchange=async e=>{
    const f=e.target.files && e.target.files[0];
    if(!f){isPromptActive=false;render(current); return;}
    try{
      const text=await f.text();
      const data=JSON.parse(text);
      const arr=Array.isArray(data)?data:(Array.isArray(data.players)?data.players:null);
      if(!arr){center.innerHTML='&gt; load<br>invalid file'; setTimeout(()=>{isPromptActive=false;render(current);},1500);return;}
      const normalized=[];
      for(const item of arr){
        if(!item||!item.tag) continue;
        const tag=String(item.tag).padStart(3,'0').slice(-3);
        const createdAt=Number(item.createdAt)||now();
        const lastUpdated=Number(item.lastUpdated)||createdAt;
        const wallet=Number(item.wallet||0);
        const vault=Number(item.vault||0);
        normalized.push({tag,createdAt,lastUpdated,wallet,vault});
      }
      if(normalized.length===0){center.innerHTML='&gt; load<br>no valid players'; setTimeout(()=>{isPromptActive=false;render(current);},1500);return;}
      await db.transaction('rw',db.players,async()=>{
        await db.players.clear();
        await db.players.bulkAdd(normalized);
      });
      const lastTag=localStorage.getItem('gailnireus_last_tag');
      let p=null; if(lastTag)p=await db.players.get(lastTag);
      if(!p)p=await db.players.get(normalized[0].tag);
      current=p;
      center.innerHTML='&gt; load<br>response: save loaded.';
      setTimeout(()=>{isPromptActive=false;render(current);},1200);
    } catch(err){console.error(err);center.innerHTML='&gt; load<br>response: error reading file.'; setTimeout(()=>{isPromptActive=false;render(current);},1500);}
    finally{fileInput.value='';}
  };
}

// ---------------- LINK HANDLERS ----------------
createLink.onclick=e=>{e.preventDefault(); createFlow();};
resetLink.onclick=e=>{e.preventDefault(); resetFlow();};
vaultLink.onclick=e=>{e.preventDefault(); vaultFlow();};
pingLink.onclick=e=>{e.preventDefault(); pingFlow();};
saveLink.onclick=e=>{e.preventDefault(); saveFlow();};
loadLink.onclick=e=>{e.preventDefault(); loadFlow();};

// ---------------- INITIAL LOAD ----------------
const last = localStorage.getItem('gailnireus_last_tag');
if(last){
  const p = await db.players.get(last);
  if(p){current=p; await applyOfflineEarnings(p); render(p);}
  else render(null);
} else render(null);
startTicker();
})();  const { hrs, mins, live } = calc(p);
  const clockChar = `<span style="color:#a855f7">${spinners[spinIndex]}</span>`;
  center.innerHTML = `
    <div>tag: ${p.tag} <span class="tag-flash">⦿</span></div>
    <div>time: ${hrs} h ${String(mins).padStart(2,'0')} m ${clockChar}</div>
    <div>wallet: ${fmtMoney(live)} <span class="pulse-dot">•</span></div>`;
};

const persist = async p => {
  const t = now();
  const mins = Math.floor((t-p.lastUpdated)/60000);
  if(mins>=1){ p.wallet += mins*EARN_PER_MIN; p.lastUpdated += mins*60000; await db.players.put(p); }
};

const startTicker = () => {
  if(ticker) clearInterval(ticker);
  ticker=setInterval(async()=>{
    if(current && !isPromptActive){ render(current); await persist(current); }
  },1000);
};

const showPrompt = (text, cb) => {
  isPromptActive=true;
  center.innerHTML=`<div>${text}</div><input id="inline-input" maxlength="3" autofocus />`;
  const inp=document.getElementById('inline-input');
  inp.focus();
  inp.addEventListener('keydown', e=>{
    if(e.key==='Enter'){ isPromptActive=false; cb(inp.value.trim()); }
    else if(e.key==='Escape'){ isPromptActive=false; render(current); }
  });
};

document.addEventListener('click', e=>{
  if(!isPromptActive) return;
  const id = e.target.id;
  if(['create-link','reset-link','vault-link','ping-link','save-link','load-link'].includes(id)) return;
  isPromptActive=false; render(current);
});

async function applyOfflineEarnings(p){
  const t = now();
  const diff = t - p.lastUpdated;
  if(diff>60000){
    const mins = Math.floor(diff/60000);
    const earn = mins*EARN_PER_MIN;
    p.wallet += earn;
    p.lastUpdated = t;
    await db.players.put(p);
    const hrs = Math.floor(mins/60);
    center.innerHTML=`<div>welcome back node ${p.tag}.<br>system drift detected — recalibrating ${hrs}h gap...<br>+${fmtMoney(earn)} restored.</div>`;
    setTimeout(()=>{ isPromptActive=false; render(current); },3000);
  }
}

// ------------------- FLOWS -------------------
async function createFlow(){
  showPrompt('create — enter 3-digit tag:', async val=>{
    if(!/^[0-9]{3}$/.test(val)){ render(current); return; }
    let p = await db.players.get(val);
    if(p){ if(p.vault===undefined)p.vault=0; current=p; localStorage.setItem('gailnireus_last_tag', val); center.innerHTML=`<div>tag already exist.<br>loaded node ${val}.</div>`; setTimeout(()=>{isPromptActive=false;render(current);},1500); }
    else{
      const t=now();
      p={tag:val,createdAt:t,lastUpdated:t,wallet:0,vault:0};
      await db.players.add(p);
      current=p;
      localStorage.setItem('gailnireus_last_tag', val);
      center.innerHTML=`<div>created tag ${val}</div>`;
      setTimeout(()=>{isPromptActive=false;render(current);},1000);
    }
  });
}

async function resetFlow(){
  showPrompt('reset — enter 3-digit tag:', async val=>{
    if(!/^[0-9]{3}$/.test(val)){ render(current); return; }
    const p = await db.players.get(val);
    if(!p){ center.innerHTML='<div>not found.</div>'; setTimeout(()=>{isPromptActive=false;render(current);},1500); return; }
    await db.players.delete(val);
    if(current && current.tag===val) current=null;
    center.innerHTML=`<div>tag ${val} deleted</div>`;
    setTimeout(()=>{isPromptActive=false;render(current);},1200);
  });
}

async function vaultFlow(){
  if(!current){center.innerHTML='no active tag'; return;}
  isPromptActive=true;
  if(current.vault===undefined) current.vault=0;
  const { live } = calc(current);
  const total=current.vault||0;
  center.innerHTML=`&gt; vault<br>response:<br>
    total stored: ${fmtMoney(total)}<br>
    active wallet: ${fmtMoney(live)}<br><br>
    <a href="#" id="deposit-btn" class="center-link">[deposit]</a>
    <a href="#" id="withdraw-btn" class="center-link">[withdraw]</a>`;
  const depositBtn=document.getElementById('deposit-btn');
  const withdrawBtn=document.getElementById('withdraw-btn');

  depositBtn.onclick=async e=>{
    e.preventDefault();
    await persist(current);
    const { live } = calc(current);
    if(live<=0.000001){center.innerHTML='&gt; deposit<br>response: nothing to move.'; setTimeout(()=>{isPromptActive=false;render(current);},1500); return;}
    current.wallet=0; current.lastUpdated=now(); current.vault=(current.vault||0)+live;
    await db.players.put(current);
    center.innerHTML=`&gt; deposit<br>response: +${fmtMoney(live)} moved to vault.`;
    setTimeout(()=>{isPromptActive=false;render(current);},1500);
  };

  withdrawBtn.onclick=async e=>{
    e.preventDefault();
    const amt=current.vault||0;
    if(amt<=0){center.innerHTML='&gt; withdraw<br>response: vault empty.'; setTimeout(()=>{isPromptActive=false;render(current);},1500); return;}
    current.vault=0; current.wallet=(current.wallet||0)+amt; current.lastUpdated=now();
    await db.players.put(current);
    center.innerHTML=`&gt; withdraw<br>response: +${fmtMoney(amt)} moved to wallet.`;
    setTimeout(()=>{isPromptActive=false;render(current);},1500);
  };
}

async function pingFlow(){
  if(!current){center.innerHTML='&gt; ping<br>no active node'; return;}
  isPromptActive=true;
  center.innerHTML=`&gt; ping<br>response:<br>node ${current.tag} [${calc(current).hrs>0?calc(current).hrs+'h ':''}${String(calc(current).mins).padStart(2,'0')}m] still alive.`;
  setTimeout(()=>{isPromptActive=false;render(current);},2000);
}

async function saveFlow(){
  isPromptActive=true;
  try{
    const all = await db.players.toArray();
    const sanitized=all.map(p=>({tag:p.tag,createdAt:Number(p.createdAt),lastUpdated:Number(p.lastUpdated),wallet:Number(p.wallet||0),vault:Number(p.vault||0)}));
    const blob=new Blob([JSON.stringify({exportedAt:now(),players:sanitized},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`gailnireus_save_${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    center.innerHTML='&gt; save<br>response: file downloaded.';
  } catch(err){center.innerHTML='&gt; save<br>response: failed.'; console.error(err);}
  setTimeout(()=>{isPromptActive=false;render(current);},1200);
}

async function loadFlow(){
  isPromptActive=true;
  fileInput.value=''; fileInput.click();
  fileInput.onchange=async e=>{
    const f=e.target.files && e.target.files[0];
    if(!f){isPromptActive=false;render(current); return;}
    try{
      const text=await f.text();
      const data=JSON.parse(text);
      const arr=Array.isArray(data)?data:(Array.isArray(data.players)?data.players:null);
      if(!arr){center.innerHTML='&gt; load<br>invalid file'; setTimeout(()=>{isPromptActive=false;render(current);},1500);return;}
      const normalized=[];
      for(const item of arr){
        if(!item||!item.tag) continue;
        const tag=String(item.tag).padStart(3,'0').slice(-3);
        const createdAt=Number(item.createdAt)||now();
        const lastUpdated=Number(item.lastUpdated)||createdAt;
        const wallet=Number(item.wallet||0);
        const vault=Number(item.vault||0);
        normalized.push({tag,createdAt,lastUpdated,wallet,vault});
      }
      if(normalized.length===0){center.innerHTML='&gt; load<br>no valid players'; setTimeout(()=>{isPromptActive=false;render(current);},1500);return;}
      await db.transaction('rw',db.players,async()=>{
        await db.players.clear();
        await db.players.bulkAdd(normalized);
      });
      const lastTag=localStorage.getItem('gailnireus_last_tag');
      let p=null; if(lastTag)p=await db.players.get(lastTag);
      if(!p)p=await db.players.get(normalized[0].tag);
      current=p;
      center.innerHTML='&gt; load<br>response: save loaded.';
      setTimeout(()=>{isPromptActive=false;render(current);},1200);
    } catch(err){console.error(err);center.innerHTML='&gt; load<br>response: error reading file.'; setTimeout(()=>{isPromptActive=false;render(current);},1500);}
    finally{fileInput.value='';}
  };
}

// ---------------- LINK HANDLERS ----------------
createLink.onclick=e=>{e.preventDefault(); createFlow();};
resetLink.onclick=e=>{e.preventDefault(); resetFlow();};
vaultLink.onclick=e=>{e.preventDefault(); vaultFlow();};
pingLink.onclick=e=>{e.preventDefault(); pingFlow();};
saveLink.onclick=e=>{e.preventDefault(); saveFlow();};
loadLink.onclick=e=>{e.preventDefault(); loadFlow();};

// ---------------- INITIAL LOAD ----------------
const last = localStorage.getItem('gailnireus_last_tag');
if(last){
  const p = await db.players.get(last);
  if(p){current=p; await applyOfflineEarnings(p); render(p);}
  else render(null);
} else render(null);
startTicker();
})();
