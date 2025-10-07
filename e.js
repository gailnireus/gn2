(async function(){
  const EARN_PER_MIN = 0.01;
  const db = new Dexie('gailnireus_db_v1');
  db.version(1).stores({ players: 'tag,createdAt,lastUpdated,wallet' });

  const center = document.getElementById('center');
  const createLink = document.getElementById('create-link');
  const resetLink = document.getElementById('reset-link');
  const evoLink = document.getElementById('evo-link');
  const pingLink = document.getElementById('ping-link');

  let current = null;
  let ticker = null;
  let isPromptActive = false;

  const now = () => Date.now();
  const fmtMoney = n => n.toFixed(2) + 'e';

  const spinners = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  let spinIndex = 0;
  setInterval(() => { spinIndex = (spinIndex + 1) % spinners.length; }, 500);

  const calc = (p) => {
    const t = now();
    const totalMin = Math.floor((t - p.createdAt) / 60000);
    const hrs = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    const live = p.wallet + ((t - p.lastUpdated) / 60000) * EARN_PER_MIN;
    return { hrs, mins, live };
  };

  const render = (p) => {
    if (isPromptActive) return;
    if (!p) {
      center.innerHTML = `
        <div>tag: —</div>
        <div>time: —</div>
        <div>wallet: —</div>`;
      return;
    }
    const { hrs, mins, live } = calc(p);
    const clockChar = `<span style="color:#a855f7">${spinners[spinIndex]}</span>`;
    center.innerHTML = `
      <div>tag: ${p.tag}</div>
      <div>time: ${hrs} h ${String(mins).padStart(2, '0')} m ${clockChar}</div>
      <div>wallet: ${fmtMoney(live)} <span class="pulse-dot">•</span></div>`;
  };

  const persist = async (p) => {
    const t = now();
    const mins = Math.floor((t - p.lastUpdated) / 60000);
    if (mins >= 1) {
      p.wallet += mins * EARN_PER_MIN;
      p.lastUpdated += mins * 60000;
      await db.players.put(p);
    }
  };

  const startTicker = () => {
    if (ticker) clearInterval(ticker);
    ticker = setInterval(async () => {
      if (current && !isPromptActive) {
        render(current);
        await persist(current);
      }
    }, 1000);
  };

  const showPrompt = (text, cb) => {
    isPromptActive = true;
    center.innerHTML = `
      <div>${text}</div>
      <input id="inline-input" maxlength="3" autofocus />
    `;
    const inp = document.getElementById('inline-input');
    inp.focus();
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const val = inp.value.trim();
        isPromptActive = false;
        cb(val);
      } else if (e.key === 'Escape') {
        isPromptActive = false;
        render(current);
      }
    });
  };

  document.addEventListener('click', (e) => {
    if (!isPromptActive) return;
    const id = e.target.id;
    if (['create-link','reset-link','evo-link','ping-link'].includes(id)) return;
    isPromptActive = false;
    render(current);
  });

  async function applyOfflineEarnings(p) {
    const t = now();
    const diff = t - p.lastUpdated;
    if (diff > 60000) {
      const mins = Math.floor(diff / 60000);
      const earn = mins * EARN_PER_MIN;
      p.wallet += earn;
      p.lastUpdated = t;
      await db.players.put(p);
      const hrs = Math.floor(mins / 60);
      center.innerHTML = `
        <div>welcome back node ${p.tag}.<br>
        drift detected — restoring ${hrs}h gap...<br>
        +${fmtMoney(earn)} restored.</div>`;
      setTimeout(() => { isPromptActive = false; render(current); }, 3000);
    }
  }

  async function createFlow() {
    showPrompt('create — enter 3-digit tag:', async val => {
      if (!/^[0-9]{3}$/.test(val)) { render(current); return; }
      let p = await db.players.get(val);
      if (p) {
        current = p;
        localStorage.setItem('gailnireus_last_tag', val);
        center.innerHTML = `<div>tag already exist.<br>loaded node ${val}.</div>`;
        setTimeout(() => { isPromptActive = false; render(current); }, 1500);
      } else {
        const t = now();
        p = { tag: val, createdAt: t, lastUpdated: t, wallet: 0 };
        await db.players.add(p);
        current = p;
        localStorage.setItem('gailnireus_last_tag', val);
        center.innerHTML = `<div>created tag ${val}</div>`;
        setTimeout(() => { isPromptActive = false; render(current); }, 1000);
      }
    });
  }

  async function resetFlow() {
    showPrompt('reset — enter tag:', async val => {
      if (!/^[0-9]{3}$/.test(val)) { render(current); return; }
      const p = await db.players.get(val);
      if (!p) {
        center.innerHTML = '<div>not found.</div>';
        setTimeout(() => { isPromptActive = false; render(current); }, 1500);
        return;
      }
      await db.players.delete(val);
      if (current && current.tag === val) current = null;
      center.innerHTML = `<div>tag ${val} deleted</div>`;
      setTimeout(() => { isPromptActive = false; render(current); }, 1200);
    });
  }

  async function evoFlow() {
    if (!current) { center.innerHTML = '<div>no active tag.</div>'; return; }
    isPromptActive = true;
    center.innerHTML = `
      <div>evolution map unavailable<br>
      (day tracking disabled in this mode)</div>`;
  }

  async function pingFlow() {
    isPromptActive = true;
    const all = await db.players.toArray();
    if (all.length === 0) {
      center.innerHTML = `> ping<br>response: no response from source.`;
      return;
    }
    if (all.length === 1 && Math.random() < 0.5) {
      center.innerHTML = `> ping<br>response: keep alive.`;
      return;
    }
    let lines = all.map(p => {
      const { hrs, mins } = calc(p);
      const h = hrs > 0 ? `${hrs}h ` : '';
      const m = `${String(mins).padStart(2,'0')}m`;
      return `node ${p.tag} [${h}${m}] still alive.`;
    });
    center.innerHTML = `> ping<br>response:<br>${lines.join('<br>')}`;
  }

  createLink.onclick = e => { e.preventDefault(); createFlow(); };
  resetLink.onclick = e => { e.preventDefault(); resetFlow(); };
  evoLink.onclick = e => { e.preventDefault(); evoFlow(); };
  pingLink.onclick = e => { e.preventDefault(); pingFlow(); };

  const last = localStorage.getItem('gailnireus_last_tag');
  if (last) {
    const p = await db.players.get(last);
    if (p) { current = p; await applyOfflineEarnings(p); render(p); }
    else render(null);
  } else render(null);

  startTicker();
})();
