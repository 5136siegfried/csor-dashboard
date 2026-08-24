// ── State ────────────────────────────────────────────────────────────────────
let data = null;
let token = sessionStorage.getItem('maraude_token') || null;
let dragSrcId = null;
let dragSrcType = null;

// ── API ──────────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function loadData() {
  try { data = await api('GET', '/api/data'); }
  catch { toast('Impossible de charger les données', true); }
}

async function saveData() {
  if (!token) return;
  try { await api('PUT', '/api/data', data); toast('Sauvegardé'); }
  catch { toast('Erreur de sauvegarde', true); }
}

// ── Auth ─────────────────────────────────────────────────────────────────────
function isEditor() { return !!token; }

async function doLogin() {
  const pw = document.getElementById('login-password').value;
  const err = document.getElementById('login-error');
  err.classList.remove('visible');
  try {
    const res = await api('POST', '/api/auth', { password: pw });
    token = res.token;
    sessionStorage.setItem('maraude_token', token);
    closeModal('login');
    document.getElementById('login-password').value = '';
    updateAuthUI(); render(); toast('Mode éditeur activé');
  } catch { err.classList.add('visible'); }
}

function logout() {
  token = null; sessionStorage.removeItem('maraude_token');
  updateAuthUI(); render();
}

function updateAuthUI() {
  const status = document.getElementById('auth-status');
  const btn = document.getElementById('auth-btn');
  if (isEditor()) {
    status.textContent = '✎ Mode éditeur'; status.className = 'auth-status editor';
    btn.textContent = 'Se déconnecter'; btn.onclick = logout;
  } else {
    status.textContent = '🔒 Mode lecture'; status.className = 'auth-status';
    btn.textContent = 'Se connecter'; btn.onclick = () => openModal('login');
  }
  document.querySelectorAll('.editor-only').forEach(el => el.style.display = isEditor() ? '' : 'none');
}

// ── Navigation ───────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item[data-page]').forEach(el => {
  el.addEventListener('click', () => {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('page-' + el.dataset.page).classList.add('active');
    el.classList.add('active');
    render();
  });
});

// ── Render ───────────────────────────────────────────────────────────────────
function render() {
  if (!data) return;
  renderStats(); renderAxes(); renderPipeline(); renderFormation();
  renderPartenaires(); renderActions(); renderFrais(); renderComptes(); renderStock();
  document.getElementById('last-update').textContent =
    new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' });
}

function renderStats() {
  document.getElementById('stat-actifs').textContent    = data.benevoles.filter(b=>b.statut==='actif').length;
  document.getElementById('stat-formation').textContent = data.benevoles.filter(b=>b.statut==='formation').length;
  document.getElementById('stat-points').textContent    = data.partenaires.filter(p=>p.statut==='actif').length;
  const attente = (data.frais||[]).filter(f=>f.statut==='attente');
  document.getElementById('stat-frais').textContent = attente.length;
  const total = attente.reduce((s,f)=>s+parseFloat(f.montant||0),0);
  document.getElementById('stat-frais-montant').textContent = total > 0 ? total.toFixed(2)+' €' : '';
}

const profilLabel = { sante:'Santé', social:'Social', secours:'Secours', autre:'Autre' };
const profilTag   = { sante:'tag-sante', social:'tag-social', secours:'tag-secours', autre:'tag-autre' };
const prioLabel   = { high:'Haute', med:'Moyenne', low:'Basse' };
const prioClass   = { high:'prio-high', med:'prio-med', low:'prio-low' };

function renderAxes() {
  document.getElementById('axes-grid').innerHTML = (data.axes||[]).map((axe,ai) => {
    const done = axe.items.filter(i=>i.done).length;
    const pct  = axe.items.length ? Math.round((done/axe.items.length)*100) : 0;
    return `<div class="axe-card">
      <div class="axe-header"><div class="axe-title">${axe.titre}</div><div class="axe-pct">${pct}%</div></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <ul class="axe-items">${axe.items.map((it,ii)=>`
        <li class="axe-item ${it.done?'done':''} ${isEditor()?'editable':''}"
            ${isEditor()?`onclick="toggleAxeItem(${ai},${ii})"`:''}>${it.label}</li>`).join('')}
      </ul></div>`;
  }).join('');
}

function toggleAxeItem(ai,ii) {
  data.axes[ai].items[ii].done = !data.axes[ai].items[ii].done;
  saveData(); renderAxes();
}

// ── Pipeline with drag & drop ────────────────────────────────────────────────
function renderPipeline() {
  const cols = [
    {key:'prospect',label:'Prospects'},{key:'contacte',label:'Contactés'},
    {key:'formation',label:'En formation'},{key:'actif',label:'Actifs'},
  ];
  document.getElementById('pipeline-board').innerHTML = cols.map(col => {
    const bvs = data.benevoles.filter(b=>b.statut===col.key);
    return `<div class="pipeline-col" data-col="${col.key}"
        ondragover="event.preventDefault();this.classList.add('drag-over')"
        ondragleave="this.classList.remove('drag-over')"
        ondrop="dropBenevole(event,'${col.key}')">
      <div class="pipeline-col-header">${col.label} <span class="col-count">${bvs.length}</span></div>
      ${bvs.map(b=>`
        <div class="pipeline-card" draggable="${isEditor()}" data-id="${b.id}"
             ondragstart="dragStartBenevole(event,${b.id})">
          <div class="p-name">${b.nom}</div>
          <div class="p-meta">${b.note||''}</div>
          <span class="p-tag ${profilTag[b.profil]}">${profilLabel[b.profil]}</span>
        </div>`).join('')}
      <button class="add-card-btn" ${!isEditor()?'disabled':''} onclick="openModal('benevole')">+ Ajouter</button>
    </div>`;
  }).join('');
}

function dragStartBenevole(e, id) {
  dragSrcId = id; dragSrcType = 'benevole';
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(()=>e.target.classList.add('dragging'),0);
}

function dropBenevole(e, newStatut) {
  e.preventDefault();
  document.querySelectorAll('.pipeline-col').forEach(c=>c.classList.remove('drag-over'));
  document.querySelectorAll('.pipeline-card').forEach(c=>c.classList.remove('dragging'));
  if (dragSrcType !== 'benevole') return;
  const b = data.benevoles.find(x=>x.id===dragSrcId);
  if (b && b.statut !== newStatut) { b.statut = newStatut; saveData(); renderPipeline(); }
}

// ── Formation ────────────────────────────────────────────────────────────────
const modules = [
  {nom:'Socle commun',badge:'Obligatoire',desc:"Protocole maraude, posture d'écoute, limites du rôle, sécurité du bénévole.",duree:'2h'},
  {nom:'Premiers secours & bobologie',badge:'PSC1 min.',desc:'Révision PSC1, plaies, ampoules, hypothermie, déshydratation.',duree:'3h'},
  {nom:'Orientation & ressources',badge:'Terrain',desc:'115, SAMU social, PASS, addictologie, hébergement. Rôle de l\'orienteur.',duree:'1h30'},
  {nom:'Situations complexes',badge:'Avancé',desc:'États psychiatriques, ivresse, agressivité, désescalade.',duree:'2h'},
];
function renderFormation() {
  document.getElementById('formation-grid').innerHTML = modules.map(m=>`
    <div class="module-card">
      <div class="module-header"><div class="module-name">${m.nom}</div><span class="module-badge">${m.badge}</span></div>
      <div class="module-desc">${m.desc}</div>
      <div style="font-size:11px;color:var(--muted)">Durée : ${m.duree}</div>
    </div>`).join('');
}

// ── Partenaires ───────────────────────────────────────────────────────────────
function renderPartenaires() {
  const sC={actif:'status-actif',nego:'status-nego',prospect:'status-prospect'};
  const sL={actif:'Actif',nego:'En négociation',prospect:'Prospect'};
  const tL={alimentaire:'Distribution alimentaire',hebergement:'Hébergement',sante:'Santé',sociale:'Action sociale',autre:'Autre'};
  document.getElementById('partners-grid').innerHTML = (data.partenaires||[]).map(p=>`
    <div class="partner-card">
      <div class="partner-name">${p.nom}</div>
      <div class="partner-type">${tL[p.type]||p.type}</div>
      <div class="partner-detail"><strong>Contact :</strong> ${p.contact}</div>
      <div class="partner-detail"><strong>Accueil :</strong> ${p.freq}</div>
      <span class="partner-status ${sC[p.statut]}">${sL[p.statut]}</span>
    </div>`).join('') || '<div style="color:var(--muted);font-size:13px;padding:1rem">Aucun partenaire enregistré.</div>';
}

// ── Actions with drag & drop ─────────────────────────────────────────────────
function renderActions() {
  const sorted = [...(data.actions||[])].sort((a,b)=>{
    if(a.done!==b.done) return a.done?1:-1;
    return ({high:0,med:1,low:2})[a.prio]-({high:0,med:1,low:2})[b.prio];
  });
  document.getElementById('actions-list').innerHTML = sorted.map(a=>`
    <div class="action-row ${isEditor()?'draggable':''}" data-id="${a.id}"
         draggable="${isEditor()}"
         ondragstart="dragStartItem(event,${a.id},'action')"
         ondragover="event.preventDefault();this.classList.add('drag-over')"
         ondragleave="this.classList.remove('drag-over')"
         ondrop="dropAction(event,${a.id})">
      ${isEditor()?'<span class="drag-handle">⠿</span>':''}
      <div class="action-check ${a.done?'done':''}" ${isEditor()?`onclick="toggleAction(${a.id})"`:''}></div>
      <div class="action-text ${a.done?'done':''}">${a.text}</div>
      <span class="priority ${prioClass[a.prio]}">${prioLabel[a.prio]}</span>
      <div class="action-meta">${a.axe}</div>
    </div>`).join('') || '<div style="color:var(--muted);font-size:13px;padding:1rem">Aucune action enregistrée.</div>';
}

function toggleAction(id) {
  const a = data.actions.find(x=>x.id===id);
  if(a){ a.done=!a.done; saveData(); renderActions(); }
}

function dragStartItem(e, id, type) {
  dragSrcId=id; dragSrcType=type;
  e.dataTransfer.effectAllowed='move';
  setTimeout(()=>e.currentTarget.classList.add('dragging'),0);
}

function dropAction(e, targetId) {
  e.preventDefault();
  document.querySelectorAll('.action-row').forEach(r=>r.classList.remove('drag-over','dragging'));
  if(dragSrcType!=='action'||dragSrcId===targetId) return;
  const arr = data.actions;
  const fromIdx = arr.findIndex(x=>x.id===dragSrcId);
  const toIdx   = arr.findIndex(x=>x.id===targetId);
  if(fromIdx<0||toIdx<0) return;
  const [item] = arr.splice(fromIdx,1);
  arr.splice(toIdx,0,item);
  saveData(); renderActions();
}

// ── Notes de frais with drag & drop ──────────────────────────────────────────
function renderFrais() {
  const frais = data.frais||[];
  const total = frais.reduce((s,f)=>s+parseFloat(f.montant||0),0);
  document.getElementById('frais-total').textContent =
    frais.length ? `Total : ${total.toFixed(2)} €` : '';

  const stC = {attente:'st-attente',valide:'st-valide',rembourse:'st-rembourse'};
  const stL = {attente:'En attente',valide:'Validé',rembourse:'Remboursé'};

  document.getElementById('frais-list').innerHTML = frais.map(f=>`
    <div class="frais-row" data-id="${f.id}"
         draggable="${isEditor()}"
         ondragstart="dragStartItem(event,${f.id},'frais')"
         ondragover="event.preventDefault();this.classList.add('drag-over')"
         ondragleave="this.classList.remove('drag-over')"
         ondrop="dropFrais(event,${f.id})">
      <div class="frais-date">${f.date||'—'}</div>
      <div class="frais-desc">${f.desc}${f.nom?`<div style="font-size:11px;color:var(--muted)">${f.nom}</div>`:''}</div>
      <div class="frais-cat"><span style="font-size:11px;color:var(--muted)">${f.cat}</span></div>
      <div class="frais-montant">${parseFloat(f.montant||0).toFixed(2)} €</div>
      <div class="frais-statut"><span class="${stC[f.statut]}">${stL[f.statut]}</span></div>
      <div>${isEditor()?`<button class="del-btn" onclick="deleteFrais(${f.id})">✕</button>`:''}</div>
    </div>`).join('') || '<div style="color:var(--muted);font-size:13px;padding:1rem 1.25rem">Aucune note de frais.</div>';
}

function dropFrais(e, targetId) {
  e.preventDefault();
  document.querySelectorAll('.frais-row').forEach(r=>r.classList.remove('drag-over','dragging'));
  if(dragSrcType!=='frais'||dragSrcId===targetId) return;
  const arr = data.frais;
  const fromIdx = arr.findIndex(x=>x.id===dragSrcId);
  const toIdx   = arr.findIndex(x=>x.id===targetId);
  if(fromIdx<0||toIdx<0) return;
  const [item] = arr.splice(fromIdx,1);
  arr.splice(toIdx,0,item);
  saveData(); renderFrais();
}

function deleteFrais(id) {
  data.frais = data.frais.filter(f=>f.id!==id);
  saveData(); renderFrais(); renderStats();
}

// ── Comptes ───────────────────────────────────────────────────────────────────
function renderComptes() {
  const stL={preparation:'En préparation',valide:'Validé en AG',depose:'Déposé en préfecture'};
  const stC={preparation:'st-attente',valide:'st-valide',depose:'st-rembourse'};
  document.getElementById('comptes-grid').innerHTML = (data.comptes||[]).map(c=>{
    const result = (parseFloat(c.produits||0)-parseFloat(c.charges||0));
    return `<div class="compte-card">
      <div class="compte-exercice">Exercice ${c.exercice}</div>
      <div class="compte-label">Clôture : ${c.date||'—'}</div>
      <div class="compte-montant">${parseFloat(c.treso||0).toFixed(2)} €</div>
      <div class="compte-detail"><strong>Produits :</strong> ${parseFloat(c.produits||0).toFixed(2)} €</div>
      <div class="compte-detail"><strong>Charges :</strong> ${parseFloat(c.charges||0).toFixed(2)} €</div>
      <div class="compte-detail"><strong>Résultat :</strong> <span style="color:${result>=0?'var(--green)':'var(--red)'}">${result>=0?'+':''}${result.toFixed(2)} €</span></div>
      <div style="margin-top:.75rem"><span class="partner-status ${stC[c.statut]}">${stL[c.statut]}</span></div>
    </div>`;
  }).join('') || '<div style="color:var(--muted);font-size:13px">Aucun exercice enregistré.</div>';
}

// ── Stock / Matériel ──────────────────────────────────────────────────────────
const PEREMPTION_SOON_DAYS = 60;
const stockCatLabel = { mobilier:'Mobilier', medical:'Médical', equipement:'Équipement', autre:'Autre' };
const stockCatClass = { mobilier:'cat-mobilier', medical:'cat-medical', equipement:'cat-equipement', autre:'cat-autre' };

let stockFilters = { q:'', cat:'', loc:'', perim:'', onlyCmd:false };
let editingStockId = null;

function peremptionStatus(dateStr) {
  if (!dateStr) return 'none';
  const d = new Date(dateStr); if (isNaN(d)) return 'none';
  const now = new Date(); now.setHours(0,0,0,0); d.setHours(0,0,0,0);
  const diffDays = Math.floor((d - now) / 86400000);
  if (diffDays < 0) return 'expired';
  if (diffDays <= PEREMPTION_SOON_DAYS) return 'soon';
  return 'ok';
}

function isLowStock(item) {
  const q = parseFloat(item.quantite), m = parseFloat(item.stockMin);
  return !isNaN(q) && !isNaN(m) && m > 0 && q < m;
}
function estACommander(item) { return isLowStock(item) || !!item.aCommanderManuel; }

function populateStockLocOptions() {
  const locs = [...new Set((data.stock||[]).map(s=>s.localisation).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));
  const sel = document.getElementById('stock-filter-loc');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Toutes localisations</option>' + locs.map(l=>`<option value="${l}">${l}</option>`).join('');
  sel.value = cur;
  const dl = document.getElementById('stock-loc-options');
  if (dl) dl.innerHTML = locs.map(l=>`<option value="${l}">`).join('');
}

function onStockFilterChange() {
  stockFilters.q = document.getElementById('stock-search').value.trim().toLowerCase();
  stockFilters.cat = document.getElementById('stock-filter-cat').value;
  stockFilters.loc = document.getElementById('stock-filter-loc').value;
  stockFilters.perim = document.getElementById('stock-filter-perim').value;
  stockFilters.onlyCmd = document.getElementById('stock-filter-cmd').checked;
  renderStock();
}

function getFilteredStock() {
  if (!data.stock) data.stock = [];
  return data.stock.filter(item => {
    if (stockFilters.q && !(item.nom||'').toLowerCase().includes(stockFilters.q)) return false;
    if (stockFilters.cat && item.categorie !== stockFilters.cat) return false;
    if (stockFilters.loc && item.localisation !== stockFilters.loc) return false;
    if (stockFilters.perim && peremptionStatus(item.peremption) !== stockFilters.perim) return false;
    if (stockFilters.onlyCmd && !estACommander(item)) return false;
    return true;
  }).sort((a,b) => (a.nom||'').localeCompare(b.nom||'', 'fr'));
}

function renderStock() {
  if (!data.stock) data.stock = [];
  populateStockLocOptions();

  const list = getFilteredStock();

  const perimLabelMap = { expired:'Périmé', soon:'Bientôt', ok:'OK', none:'—' };
  const perimClassMap = { expired:'perim-expired', soon:'perim-soon', ok:'perim-ok', none:'perim-none' };

  document.getElementById('stock-list').innerHTML = list.map(item => {
    const low = isLowStock(item);
    const cmd = estACommander(item);
    const perim = peremptionStatus(item.peremption);
    const clickable = isEditor() && !low;
    return `<div class="stock-row ${low?'low':''}" data-id="${item.id}">
      <div class="stock-nom ${isEditor()?'editable':''}" ${isEditor()?`onclick="editStock(${item.id})"`:''}>${item.nom}</div>
      <div><span class="cat-tag ${stockCatClass[item.categorie]||'cat-autre'}">${stockCatLabel[item.categorie]||'Autre'}</span></div>
      <div class="stock-loc">${item.localisation||'—'}</div>
      <div class="stock-qte ${low?'low':''}">${item.quantite ?? '—'}${item.unite?' '+item.unite:''}</div>
      <div class="stock-min">${item.stockMin ?? '—'}</div>
      <div>${perim==='none' ? `<span class="perim-none">—</span>` : `<span class="perim-badge ${perimClassMap[perim]}">${perimLabelMap[perim]}${item.peremption?' · '+item.peremption:''}</span>`}</div>
      <div><div class="cmd-check ${cmd?'checked':''} ${low?'auto':''} ${!clickable?'disabled':''}"
            title="${low?'Automatique — stock sous le minimum':'Cliquer pour marquer à commander'}"
            ${clickable?`onclick="toggleStockCommande(${item.id})"`:''}></div></div>
      <div>${isEditor()?`<button class="del-btn" onclick="deleteStock(${item.id})">✕</button>`:''}</div>
    </div>`;
  }).join('') || '<div style="color:var(--muted);font-size:13px;padding:1rem 1.25rem">Aucun article ne correspond aux filtres.</div>';

  document.getElementById('stat-stock-total').textContent = data.stock.length;
  document.getElementById('stat-stock-cmd').textContent = data.stock.filter(estACommander).length;
  document.getElementById('stat-stock-perim').textContent =
    data.stock.filter(i => ['expired','soon'].includes(peremptionStatus(i.peremption))).length;
}

function toggleStockCommande(id) {
  const item = (data.stock||[]).find(x=>x.id===id);
  if (!item || isLowStock(item)) return; // le flag auto prime, non éditable manuellement
  item.aCommanderManuel = !item.aCommanderManuel;
  saveData(); renderStock();
}

function editStock(id) {
  const item = (data.stock||[]).find(x=>x.id===id);
  if (!item) return;
  editingStockId = id;
  document.getElementById('stock-modal-title').textContent = "Modifier l'article";
  document.getElementById('s-nom').value = item.nom||'';
  document.getElementById('s-cat').value = item.categorie||'autre';
  document.getElementById('s-loc').value = item.localisation||'';
  document.getElementById('s-qte').value = item.quantite ?? '';
  document.getElementById('s-unite').value = item.unite||'';
  document.getElementById('s-min').value = item.stockMin ?? '';
  document.getElementById('s-peremption').value = item.peremption||'';
  document.getElementById('s-cmd-manuel').checked = !!item.aCommanderManuel;
  populateStockLocOptions();
  openModal('stock');
}

function resetStockForm() {
  editingStockId = null;
  document.getElementById('stock-modal-title').textContent = 'Nouvel article';
  ['s-nom','s-loc','s-qte','s-unite','s-min','s-peremption'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('s-cat').value = 'mobilier';
  document.getElementById('s-cmd-manuel').checked = false;
}

function saveStock() {
  const nom = document.getElementById('s-nom').value.trim(); if (!nom) return;
  const payload = {
    nom,
    categorie: document.getElementById('s-cat').value,
    localisation: document.getElementById('s-loc').value.trim(),
    quantite: document.getElementById('s-qte').value===''? null : parseFloat(document.getElementById('s-qte').value),
    unite: document.getElementById('s-unite').value.trim(),
    stockMin: document.getElementById('s-min').value===''? null : parseFloat(document.getElementById('s-min').value),
    peremption: document.getElementById('s-peremption').value,
    aCommanderManuel: document.getElementById('s-cmd-manuel').checked,
  };
  if (!data.stock) data.stock = [];
  if (editingStockId != null) {
    const item = data.stock.find(x=>x.id===editingStockId);
    if (item) Object.assign(item, payload);
  } else {
    data.stock.push({ id: Date.now(), ...payload });
  }
  saveData(); closeModal('stock'); resetStockForm(); render();
}

function deleteStock(id) {
  data.stock = (data.stock||[]).filter(x=>x.id!==id);
  saveData(); renderStock();
}

// ── Import CSV / Excel ───────────────────────────────────────────────────────
const STOCK_FIELD_ALIASES = {
  nom: ['nom','article','designation','produit','item'],
  categorie: ['categorie','cat','category'],
  localisation: ['localisation','emplacement','lieu','location'],
  quantite: ['quantite','qte','qty','stock','quantity'],
  unite: ['unite','unit'],
  stockMin: ['stock minimum','stockmin','stock min','minimum','seuil','seuil minimum'],
  peremption: ['peremption','expiration','date peremption','date de peremption','dlc'],
};

function normalizeHeader(h) {
  return (h||'').toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

function normalizeDateValue(v) {
  if (v === '' || v == null) return '';
  if (typeof v === 'number' && window.XLSX && XLSX.SSF) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
    return '';
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return '';
}

function mapRowToStockItem(row) {
  const normalized = {};
  Object.keys(row).forEach(k => { normalized[normalizeHeader(k)] = row[k]; });
  function pick(aliases) {
    for (const a of aliases) {
      const key = normalizeHeader(a);
      if (normalized[key] !== undefined && normalized[key] !== '') return normalized[key];
    }
    return '';
  }
  const nom = String(pick(STOCK_FIELD_ALIASES.nom)).trim();
  if (!nom) return null;
  const catRaw = normalizeHeader(pick(STOCK_FIELD_ALIASES.categorie));
  let categorie = 'autre';
  if (catRaw.includes('medic')) categorie = 'medical';
  else if (catRaw.includes('mobil')) categorie = 'mobilier';
  else if (catRaw.includes('equip')) categorie = 'equipement';
  const qteRaw = String(pick(STOCK_FIELD_ALIASES.quantite));
  const minRaw = String(pick(STOCK_FIELD_ALIASES.stockMin));
  const qte = parseFloat(qteRaw.replace(',','.').replace(/[^\d.\-]/g,''));
  const min = parseFloat(minRaw.replace(',','.').replace(/[^\d.\-]/g,''));
  return {
    id: Date.now() + Math.floor(Math.random()*100000),
    nom, categorie,
    localisation: String(pick(STOCK_FIELD_ALIASES.localisation)).trim(),
    quantite: isNaN(qte) ? null : qte,
    unite: String(pick(STOCK_FIELD_ALIASES.unite)).trim(),
    stockMin: isNaN(min) ? null : min,
    peremption: normalizeDateValue(pick(STOCK_FIELD_ALIASES.peremption)),
    aCommanderManuel: false,
  };
}

function handleStockImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const replace = document.getElementById('stock-import-replace').checked;
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const wb = XLSX.read(evt.target.result, { type:'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval:'' });
      const imported = rows.map(mapRowToStockItem).filter(Boolean);
      if (!imported.length) { toast('Aucune ligne exploitable dans le fichier', true); return; }
      if (!data.stock) data.stock = [];
      data.stock = replace ? imported : data.stock.concat(imported);
      saveData(); renderStock();
      toast(`${imported.length} article(s) importé(s)${replace?' (stock remplacé)':''}`);
    } catch (err) {
      console.error(err);
      toast('Erreur de lecture du fichier — vérifie le format', true);
    }
  };
  reader.readAsArrayBuffer(file);
  e.target.value = '';
}

function exportStock() {
  if (!data.stock) data.stock = [];
  const scope = document.getElementById('stock-export-scope').value;

  const scopeConfig = {
    filtered:  { list: () => getFilteredStock(),                                                          suffix: 'filtre' },
    all:       { list: () => [...data.stock].sort((a,b)=>(a.nom||'').localeCompare(b.nom||'', 'fr')),      suffix: 'complet' },
    commander: { list: () => data.stock.filter(estACommander).sort((a,b)=>(a.nom||'').localeCompare(b.nom||'', 'fr')), suffix: 'a-commander' },
    expired:   { list: () => data.stock.filter(i=>peremptionStatus(i.peremption)==='expired').sort((a,b)=>(a.nom||'').localeCompare(b.nom||'', 'fr')), suffix: 'perimes' },
    expiring:  { list: () => data.stock.filter(i=>['expired','soon'].includes(peremptionStatus(i.peremption))).sort((a,b)=>(a.nom||'').localeCompare(b.nom||'', 'fr')), suffix: 'peremption-proche' },
  };
  const cfg = scopeConfig[scope] || scopeConfig.filtered;
  const list = cfg.list();

  if (!list.length) { toast('Aucun article ne correspond à cette sélection', true); return; }

  const rows = list.map(item => ({
    'Nom': item.nom || '',
    'Catégorie': stockCatLabel[item.categorie] || 'Autre',
    'Localisation': item.localisation || '',
    'Quantité': item.quantite ?? '',
    'Unité': item.unite || '',
    'Stock minimum': item.stockMin ?? '',
    'Péremption': item.peremption || '',
    'À commander': estACommander(item) ? 'Oui' : 'Non',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{wch:32},{wch:14},{wch:20},{wch:10},{wch:8},{wch:12},{wch:12},{wch:11}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Stock');
  const today = new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `stock-csor-${today}-${cfg.suffix}.xlsx`);
  toast(`${rows.length} article(s) exporté(s)`);
}

// ── Modals ────────────────────────────────────────────────────────────────────
function openModal(t)  { document.getElementById('modal-'+t).classList.add('open'); }
function closeModal(t) { document.getElementById('modal-'+t).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open');}));

function saveBenevole() {
  const nom = document.getElementById('b-nom').value.trim(); if(!nom) return;
  data.benevoles.push({id:Date.now(),nom,profil:document.getElementById('b-profil').value,
    statut:document.getElementById('b-statut').value,note:document.getElementById('b-note').value});
  saveData(); closeModal('benevole'); render();
  ['b-nom','b-note'].forEach(id=>document.getElementById(id).value='');
}

function savePartenaire() {
  const nom = document.getElementById('p-nom').value.trim(); if(!nom) return;
  data.partenaires.push({id:Date.now(),nom,type:document.getElementById('p-type').value,
    contact:document.getElementById('p-contact').value,freq:document.getElementById('p-freq').value,
    statut:document.getElementById('p-statut').value});
  saveData(); closeModal('partenaire'); render();
  ['p-nom','p-contact','p-freq'].forEach(id=>document.getElementById(id).value='');
}

function saveAction() {
  const text = document.getElementById('a-text').value.trim(); if(!text) return;
  data.actions.push({id:Date.now(),text,prio:document.getElementById('a-prio').value,
    axe:document.getElementById('a-axe').value,done:false});
  saveData(); closeModal('action'); render();
  document.getElementById('a-text').value='';
}

function saveFrais() {
  const desc = document.getElementById('f-desc').value.trim(); if(!desc) return;
  if(!data.frais) data.frais=[];
  data.frais.push({id:Date.now(),desc,date:document.getElementById('f-date').value,
    montant:document.getElementById('f-montant').value,cat:document.getElementById('f-cat').value,
    statut:document.getElementById('f-statut').value,nom:document.getElementById('f-nom').value});
  saveData(); closeModal('frais'); render();
  ['f-desc','f-date','f-montant','f-nom'].forEach(id=>document.getElementById(id).value='');
}

function saveCompte() {
  if(!data.comptes) data.comptes=[];
  data.comptes.push({id:Date.now(),exercice:document.getElementById('c-exercice').value,
    date:document.getElementById('c-date').value,produits:document.getElementById('c-produits').value,
    charges:document.getElementById('c-charges').value,treso:document.getElementById('c-treso').value,
    statut:document.getElementById('c-statut').value});
  saveData(); closeModal('compte'); render();
  ['c-exercice','c-date','c-produits','c-charges','c-treso'].forEach(id=>document.getElementById(id).value='');
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg,err=false) {
  const el=document.getElementById('toast');
  el.textContent=msg; el.className='show'+(err?' error':'');
  setTimeout(()=>el.className='',2500);
}

// ── Init ──────────────────────────────────────────────────────────────────────
(async()=>{ updateAuthUI(); await loadData(); render(); })();
