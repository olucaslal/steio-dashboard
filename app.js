/* STEIO · Dashboard Comercial + Tráfego — backend Supabase */
(() => {
'use strict';

// ---------- CONFIG ----------
const ROLES = {
  sdr: { label:'SDR', tag:'sdr', color:'#3b82f6', fields:[
    {k:'contatos_feitos',label:'Ligações / mensagens que você fez',hint:'Quantas vezes você tentou falar com os leads hoje'},
    {k:'atendeu',label:'Quantos atenderam / responderam',hint:'Leads com quem você realmente conseguiu falar'},
    {k:'reunioes_agendadas',label:'Reuniões que você agendou',hint:'Calls marcadas com o lead'},
    {k:'no_shows',label:'Marcaram e não vieram (no-show)',hint:'Reuniões que furaram'},
  ]},
  social_seller: { label:'Social Seller', tag:'social_seller', color:'#a855f7', fields:[
    {k:'mensagens_enviadas',label:'Mensagens que você enviou',hint:'Total de mensagens no dia'},
    {k:'seguidores_novos',label:'Seguidores novos',hint:'Novos seguidores que chegaram no dia'},
    {k:'seguidores_abordados',label:'Pessoas que você abordou',hint:'Perfis que você chamou ativamente no dia'},
    {k:'directs_recebidos',label:'Directs que chegaram',hint:'DMs que você recebeu'},
    {k:'conversas_ativas',label:'Conversas que engataram',hint:'Pessoas que responderam e conversaram de verdade'},
    {k:'reunioes_agendadas',label:'Reuniões que você agendou',hint:'Calls marcadas a partir do Instagram'},
  ]},
  closer: { label:'Closer', tag:'closer', color:'#10b981', fields:[
    {k:'reunioes_feitas',label:'Reuniões que aconteceram',hint:'O lead compareceu na call'},
    {k:'no_show',label:'Não compareceram',hint:'Estava marcada mas a pessoa não apareceu'},
    {k:'vendas',label:'Vendas fechadas',hint:'Negócios fechados no dia'},
    {k:'valor_vendido',label:'Valor vendido (R$)',hint:'Soma do que você vendeu no dia'},
  ]},
  gestor: { label:'Gestor', tag:'gestor', color:'#64748b', fields:[] },
};
const ENTRY_ROLES = ['sdr','social_seller','closer'];

// Produtos / tickets (escada STEIO)
const PRODUCTS = {
  unity:        {label:'Unity',         ticket:195000},
  construmaster:{label:'ConstruMaster', ticket:95000},
  assessoria:   {label:'Assessoria',    ticket:45000},
  cpv:          {label:'CPV',           ticket:5000},
};
// Jornada do cliente (high ticket)
const ETAPAS = [
  {k:'1a_call',    label:'1ª call',          color:'#3b82f6'},
  {k:'negociacao', label:'Em negociação',    color:'#a855f7'},
  {k:'2a_call',    label:'2ª call agendada',  color:'#0ea5e9'},
  {k:'follow_up',  label:'Follow up',        color:'#f59e0b'},
  {k:'fechado',    label:'Fechado',          color:'#10b981'},
  {k:'perdido',    label:'Perdido',          color:'#ef4444'},
];
const ETAPA_MAP = Object.fromEntries(ETAPAS.map(e=>[e.k,e]));
const ETAPAS_ABERTAS = ['1a_call','negociacao','2a_call','follow_up'];

const DEFAULT_METAS = {
  pct_icp:        {label:'% ICP', target:80, dir:'up',  unit:'%'},
  cpl_cm:         {label:'CPL ConstruMaster', target:300, dir:'down', unit:'R$'},
  cpl_ass:        {label:'CPL Assessoria', target:120, dir:'down', unit:'R$'},
  custo_call:     {label:'Custo por call', target:250, dir:'down', unit:'R$'},
  custo_call_q:   {label:'Custo por call qualif.', target:450, dir:'down', unit:'R$'},
  cac:            {label:'Custo por conversão (CAC)', target:2500, dir:'down', unit:'R$'},
  sdr_connect:    {label:'Connect rate (SDR)', target:40, dir:'up', unit:'%'},
  sdr_agend:      {label:'Taxa agendamento (SDR)', target:25, dir:'up', unit:'%'},
  social_resp:    {label:'Taxa resposta (Social)', target:15, dir:'up', unit:'%'},
  social_agend:   {label:'Taxa agendamento (Social)', target:20, dir:'up', unit:'%'},
  show_rate:      {label:'Show-rate (Closer)', target:70, dir:'up', unit:'%'},
  close_rate:     {label:'Close rate (Closer)', target:25, dir:'up', unit:'%'},
};

// ---------- STATE ----------
let TRAFFIC = {daily:[], until:''};
let TODAY = '';
const LS = {
  get:(k,d)=>{try{return JSON.parse(localStorage.getItem('dc_'+k))??d}catch{return d}},
  set:(k,v)=>localStorage.setItem('dc_'+k,JSON.stringify(v)),
};
// ---- Supabase (backend + Auth) ----
const SUPA_URL='https://usfqgslpcqftafrbvxzd.supabase.co';
const SUPA_KEY='sb_publishable_T4aAxGIFncLq_MLEvQ6Nag_0IUnuM6f';
const EMAIL_DOMAIN='@steio.local';            // login "gabriel" -> gabriel@steio.local (interno, não envia email)
const sb = window.supabase.createClient(SUPA_URL, SUPA_KEY);
let USERS=[], ENTRIES=[], PROFILE=null, PIPELINE=[], METAS_DB={}, ESTEIRA=[];
async function loadProfile(){ const {data:{user}}=await sb.auth.getUser(); if(!user){PROFILE=null;return null;}
  const {data}=await sb.from('profiles').select('id,login,nome,role').eq('id',user.id).single(); PROFILE=data; return data; }
async function loadUsers(){ const {data}=await sb.from('profiles').select('id,login,nome,role'); USERS=data||[]; }
async function loadEntries(){ const {data}=await sb.from('dc_lancamentos').select('usuario_id,data,role,dados');
  ENTRIES=(data||[]).map(r=>({date:r.data,userId:r.usuario_id,role:r.role,data:r.dados||{}})); }
async function loadTraffic(){ const {data}=await sb.from('dc_traffic').select('*').order('data');
  TRAFFIC={daily:(data||[]).map(r=>({date:r.data,spend:Number(r.spend)||0,leads:r.leads,icpA:r.icp_a,icpB:r.icp_b,icpC:r.icp_c||0,icpD:r.icp_d||0,construmaster:r.construmaster,assessoria:r.assessoria}))};
  const n=new Date(); TODAY=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
  overlayLiveLeads(); }   // não-bloqueante: mostra dc_traffic na hora e atualiza ao chegar o real-time

// Sobrepõe leads/ICP em tempo real, contando TODOS os funis (Sessão Estratégica, Site, Social/DM, Typebot, CPV).
// Mantém spend do dc_traffic (métrica de mídia paga). Se a chamada falhar, fica só com o dc_traffic.
async function overlayLiveLeads(){
  try{
    const since = lastNDates(120)[0];
    const r = await fetch(`https://trafego-steio.vercel.app/api/metrics?funil=todos&daily=1&since=${since}&until=${TODAY}`);
    const j = await r.json();
    if(!j || !Array.isArray(j.daily)) return;
    const byDate = Object.fromEntries(TRAFFIC.daily.map(d=>[d.date,d]));
    for(const d of j.daily){
      let row = byDate[d.date];
      if(!row){ row={date:d.date,spend:0,construmaster:d.icpA,assessoria:d.icpB}; TRAFFIC.daily.push(row); byDate[d.date]=row; }
      row.leads=d.leads; row.icpA=d.icpA; row.icpB=d.icpB; row.icpC=d.icpC; row.icpD=d.icpD; // leads/ICP = todos os funis, ao vivo
    }
    TRAFFIC.daily.sort((a,b)=>a.date<b.date?-1:1);
    TRAFFIC.live=true;
    // re-renderiza só as telas que dependem de leads (não mexe no formulário de lançamento)
    try{ if($('#app') && !$('#app').hidden){ renderDashboard(); if(typeof renderFunil==='function') renderFunil(); renderCalendar(); } }catch(e){}
  }catch(e){ /* mantém dc_traffic se a fonte real-time falhar */ }
}
async function loadPipeline(){ const {data}=await sb.from('dc_pipeline').select('*').order('created_at',{ascending:false}); PIPELINE=data||[]; }
async function loadEsteira(){ const {data}=await sb.from('dc_leads').select('*').order('data_chegada',{ascending:false}).limit(1500); ESTEIRA=data||[]; }
async function loadMetas(){ const {data}=await sb.from('dc_metas').select('chave,target'); METAS_DB=Object.fromEntries((data||[]).map(r=>[r.chave,Number(r.target)])); }
async function loadAll(){ await loadProfile(); await Promise.all([loadUsers(),loadEntries(),loadTraffic(),loadPipeline(),loadMetas(),loadEsteira()]); }
const getUsers   = ()=>USERS;
const getEntries = ()=>ENTRIES;
const getPipeline= ()=>PIPELINE;
const getMetas   = ()=>{const o={};for(const [k,m] of Object.entries(DEFAULT_METAS)) o[k]={...m, target:(k in METAS_DB)?METAS_DB[k]:m.target}; return o;};
const curUser    = ()=>PROFILE;

// ---------- HELPERS ----------
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const el=(t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e;};
const money=n=>!isFinite(n)||n==null?'—':'R$ '+Math.round(n).toLocaleString('pt-BR');
const pct=n=>!isFinite(n)||n==null?'—':(n).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
const intf=n=>(n||0).toLocaleString('pt-BR');
const produtoLabel=p=>PRODUCTS[p]?PRODUCTS[p].label:'—';
function lastNDates(n){const out=[];const base=new Date(TODAY+'T00:00:00');for(let i=n-1;i>=0;i--){const d=new Date(base);d.setDate(d.getDate()-i);out.push(d.toISOString().slice(0,10));}return out;}
function statusCls(val,key){const m=getMetas()[key];if(m==null||!isFinite(val)||val==null)return 'none';const up=m.dir==='up';return (up?val>=m.target:val<=m.target)?'ok':'bad';}

// ---------- AGGREGATION (tráfego + comercial) ----------
function aggTraffic(dates){const set=new Set(dates);const o={leads:0,icpA:0,icpB:0,icpC:0,icpD:0,cm:0,ass:0,spend:0};
  for(const d of TRAFFIC.daily){if(!set.has(d.date))continue;o.leads+=d.leads;o.icpA+=d.icpA;o.icpB+=d.icpB;o.icpC+=d.icpC;o.icpD+=d.icpD;o.cm+=d.construmaster;o.ass+=d.assessoria;o.spend+=d.spend;}return o;}
function aggCommercial(dates){const set=new Set(dates);const acc={sdr:{},social_seller:{},closer:{}};
  for(const r of ENTRY_ROLES)for(const f of ROLES[r].fields)acc[r][f.k]=0;
  for(const e of getEntries()){if(!set.has(e.date)||!acc[e.role])continue;for(const f of ROLES[e.role].fields)acc[e.role][f.k]+=Number(e.data[f.k]||0);}
  return acc;}

function computeFunnel(dates){
  const t=aggTraffic(dates), c=aggCommercial(dates);
  const agendadas=(c.sdr.reunioes_agendadas||0)+(c.social_seller.reunioes_agendadas||0);
  const feitas=c.closer.reunioes_feitas||0, vendas=c.closer.vendas||0;
  const mql=(t.icpA||0)+(t.icpB||0)+(t.icpC||0)+(t.icpD||0);
  return {
    t,c,agendadas,feitas,vendas,mql,
    leads:t.leads,
    icpA:t.icpA,icpB:t.icpB,icpC:t.icpC,icpD:t.icpD,
    pctIcp: mql? (t.icpA+t.icpB)/mql*100 : 0,   // qualificação sobre quem respondeu capital (A+B+C+D), não sobre o total
    cplCM: t.cm? t.spend/t.cm : NaN,
    cplAss: t.ass? t.spend/t.ass : NaN,
    custoCall: agendadas? t.spend/agendadas : NaN,
    custoCallQ: feitas? t.spend/feitas : NaN,
    cac: vendas? t.spend/vendas : NaN,
    convMql: t.leads? mql/t.leads*100 : 0,
    convAgenda: mql? agendadas/mql*100 : 0,
    showRate: agendadas? feitas/agendadas*100 : 0,
    closeRate: feitas? vendas/feitas*100 : 0,
    ticket: vendas? (c.closer.valor_vendido||0)/vendas : NaN,
    receita: c.closer.valor_vendido||0,
  };
}

// ---------- AGGREGATION (jornada / financeiro do CRM) ----------
function pipeScopeCards(){ const me=curUser(); return me&&me.role==='closer' ? getPipeline().filter(c=>c.closer_id===me.id) : getPipeline(); }
// ---- Esteira (dc_leads): leads do SDR logado + gravação ----
const isFieldRole = r => r==='sdr'||r==='social_seller';
function myLeads(){ const me=curUser(); let ls=ESTEIRA||[]; if(me&&isFieldRole(me.role)) ls=ls.filter(l=>l.sdr_id===me.id); return ls; }
function leadsInRange(ls){ const set=new Set(datesBetween(RANGE.start,RANGE.end)); return ls.filter(l=>{const d=(l.data_chegada||'').slice(0,10); return !set.size||set.has(d);}); }
async function saveLead(id,patch){
  patch.updated_at=new Date().toISOString(); patch.updated_by=curUser()?.login||'';
  const {error}=await sb.from('dc_leads').update(patch).eq('id',id).select();
  if(error){ alert('Não consegui salvar: '+(error.message||error)); return false; }
  const row=(ESTEIRA||[]).find(l=>String(l.id)===String(id)); if(row) Object.assign(row,patch);
  return true;
}
function computePipeline(cards){
  const m={naMesa:0, contratado:0, coletado:0, fechados:0, perdidos:0, abertos:0, total:cards.length};
  for(const c of cards){
    const et=c.etapa||'1a_call';
    if(et==='fechado'){ m.fechados++; m.contratado+=Number(c.valor_contrato)||0; m.coletado+=Number(c.valor_coletado)||0; }
    else if(et==='perdido'){ m.perdidos++; }
    else { m.abertos++; m.naMesa+=Number(c.valor_apresentado)||0; }
  }
  m.conv = cards.length? m.fechados/cards.length*100 : 0;
  m.ticketMedio = m.fechados? m.contratado/m.fechados : NaN;
  return m;
}
function fechadosIn(cards,dateSet){let count=0,contratado=0,coletado=0;
  for(const c of cards){ if(c.etapa==='fechado'&&c.fechado_em&&dateSet.has(c.fechado_em)){count++;contratado+=Number(c.valor_contrato)||0;coletado+=Number(c.valor_coletado)||0;} }
  return {count,contratado,coletado};}
function pipeByDay(cards,dates){
  const idx=Object.fromEntries(dates.map(d=>[d,{contratos:0,contratado:0,coletado:0}]));
  for(const c of cards){ if(c.etapa!=='fechado'||!c.fechado_em)continue; const r=idx[c.fechado_em]; if(r){r.contratos++;r.contratado+=Number(c.valor_contrato)||0;r.coletado+=Number(c.valor_coletado)||0;} }
  return dates.map(d=>({date:d,...idx[d]}));
}
function pipeByTicket(cards){
  const out={}; for(const k of Object.keys(PRODUCTS)) out[k]={count:0,contratado:0,coletado:0,emJornada:0};
  for(const c of cards){ const p=c.produto; if(!p||!out[p])continue;
    if(c.etapa==='fechado'){out[p].count++;out[p].contratado+=Number(c.valor_contrato)||0;out[p].coletado+=Number(c.valor_coletado)||0;}
    else if(c.etapa!=='perdido'){out[p].emJornada++;} }
  return out;
}

// ---------- RENDER: DASHBOARD (sub-abas) ----------
let RANGE={start:'',end:''};
function addDays(ds,delta){const d=new Date(ds+'T00:00:00');d.setDate(d.getDate()+delta);return d.toISOString().slice(0,10);}
function datesBetween(start,end){const out=[];if(!start||!end||start>end)return out;let d=new Date(start+'T00:00:00');const e=new Date(end+'T00:00:00');while(d<=e){out.push(d.toISOString().slice(0,10));d.setDate(d.getDate()+1);}return out;}
function presetRange(p){if(p==='hoje')return{start:TODAY,end:TODAY};if(p==='ontem'){const y=addDays(TODAY,-1);return{start:y,end:y};}const n=Number(p);return{start:addDays(TODAY,-(n-1)),end:TODAY};}

function renderDashboard(){
  renderGeral();
  if(!isFieldRole(curUser()?.role)) renderFunil();   // SDR/Social não carregam funil/campanhas
  renderJornada();
  renderMissing();
}
function refreshRangeViews(){
  const r=curUser()?.role;
  if(isFieldRole(r)){ renderGeral(); renderJornada(); }
  else if(r==='closer'){ renderGeral(); renderFunil(); renderJornada(); }
  else renderFunil();
}

// ===== Sub-aba GERAL =====
function renderGeral(){
  const r=curUser()?.role;
  if(isFieldRole(r)) return renderMeuFunil();
  if(r==='closer') return renderCloserGeral();
  const cards=pipeScopeCards();
  const fHoje=fechadosIn(cards,new Set([TODAY]));
  const fSemana=fechadosIn(cards,new Set(lastNDates(7)));
  const P=computePipeline(cards);
  const kg=$('#finKpis');
  if(kg) kg.innerHTML=`
    <div class="kpi none kpi-cash"><div class="k-label">Vendas hoje</div><div class="k-val">${intf(fHoje.count)}</div><div class="k-meta">${money(fHoje.contratado)} em contrato</div></div>
    <div class="kpi none kpi-cash"><div class="k-label">Vendas semana</div><div class="k-val">${intf(fSemana.count)}</div><div class="k-meta">${money(fSemana.contratado)} em contrato</div></div>
    <div class="kpi none kpi-money"><div class="k-label">Cash collect hoje</div><div class="k-val">${money(fHoje.coletado)}</div><div class="k-meta">entrou no caixa</div></div>
    <div class="kpi none kpi-money"><div class="k-label">Cash collect semana</div><div class="k-val">${money(fSemana.coletado)}</div><div class="k-meta">entrou no caixa</div></div>
    <div class="kpi none"><div class="k-label">Dinheiro na mesa</div><div class="k-val">${money(P.naMesa)}</div><div class="k-meta">${intf(P.abertos)} em jornada</div></div>
    <div class="kpi none"><div class="k-label">Ticket médio</div><div class="k-val">${money(P.ticketMedio)}</div><div class="k-meta">por contrato fechado</div></div>`;
  renderCharts(cards);
  renderTicketCards(cards);
}

let _charts={};
function drawChart(id,type,labels,datasets,opts){
  if(!window.Chart) return;
  const cv=document.getElementById(id); if(!cv) return;
  if(_charts[id]){ _charts[id].destroy(); }
  _charts[id]=new Chart(cv,{type,data:{labels,datasets},options:Object.assign({
    responsive:true,maintainAspectRatio:false,
    plugins:{legend:{display:datasets.length>1,labels:{boxWidth:12,font:{size:11}}}},
    scales:{y:{beginAtZero:true,ticks:{font:{size:10},color:'#8a97b8'},grid:{color:'rgba(255,255,255,.06)'}},x:{ticks:{font:{size:10},color:'#8a97b8'},grid:{display:false}}},
  },opts||{})});
}
// ===== Meu funil (Dashboard do SDR) =====
function renderMeuFunil(){
  const pane=$('#sub-geral'); if(!pane) return;
  const all=myLeads(), inR=leadsInRange(all);
  const hoje=all.filter(l=>(l.data_chegada||'').slice(0,10)===TODAY);
  const cnt=(arr,f)=>arr.filter(f).length;
  const steps=[
    ['Chegaram', inR.length, '#3b82f6'],
    ['Qualificados', cnt(inR,l=>l.qualificado), '#6366f1'],
    ['Responderam', cnt(inR,l=>l.respondeu), '#8b5cf6'],
    ['Agendaram', cnt(inR,l=>l.agendou), '#a855f7'],
    ['Compareceram', cnt(inR,l=>l.compareceu), '#0ea5e9'],
  ];
  pane.innerHTML=`
    <section class="kpi-grid">
      <div class="kpi none kpi-b"><div class="k-label">Leads hoje</div><div class="k-val">${intf(hoje.length)}</div><div class="k-meta">chegaram pra você</div></div>
      <div class="kpi none"><div class="k-label">Chegaram no período</div><div class="k-val">${intf(inR.length)}</div><div class="k-meta">leads seus</div></div>
      <div class="kpi none"><div class="k-label">Qualificados</div><div class="k-val">${intf(steps[1][1])}</div><div class="k-meta">ICP</div></div>
      <div class="kpi none kpi-p"><div class="k-label">Agendaram</div><div class="k-val">${intf(steps[3][1])}</div><div class="k-meta">reuniões marcadas</div></div>
      <div class="kpi none kpi-g"><div class="k-label">Compareceram</div><div class="k-val">${intf(steps[4][1])}</div><div class="k-meta">apareceram na call</div></div>
    </section>
    <div class="two-col">
      <section class="card"><h2>Agendados por dia</h2><div class="chart-box"><canvas id="chartAgend"></canvas></div></section>
      <section class="card"><h2>Seu funil</h2><div id="meuFunnel" class="funnel"></div></section>
    </div>
    ${curUser()?.role==='social_seller'?socialPerfSection():''}`;
  const dates=lastNDates(8), labels=dates.map(fmtDate);
  const byDay=dates.map(d=>all.filter(l=>l.agendou&&(l.agendado_em||'').slice(0,10)===d).length);
  drawChart('chartAgend','bar',labels,[{label:'Agendados',data:byDay,backgroundColor:'#a855f7',borderRadius:4,maxBarThickness:26}]);
  renderFunnelBars($('#meuFunnel'), steps);
  if(curUser()?.role==='social_seller'){
    const s=mySocialAgg();
    renderFunnelBars($('#socialFunnel'),[
      ['Mensagens enviadas',   s.mensagens_enviadas,   '#3b82f6'],
      ['Seguidores novos',     s.seguidores_novos,     '#6366f1'],
      ['Seguidores abordados', s.seguidores_abordados, '#8b5cf6'],
      ['Directs recebidos',    s.directs_recebidos,    '#a855f7'],
      ['Agendamentos',         s.reunioes_agendadas,   '#22c55e'],
    ]);
  }
}
// Barras de funil (reutilizado no funil do SDR e no de Social Selling).
// Largura tem base na MAIOR etapa e trava em 100% — nunca estoura o container.
function renderFunnelBars(wrap, steps){
  if(!wrap) return;
  const base=Math.max(1,...steps.map(s=>s[1]||0)); wrap.innerHTML='';
  steps.forEach(([lab,v,color],i)=>{
    if(i>0){const prev=steps[i-1][1]||0;const conv=prev?Math.round(100*(v||0)/prev):0;
      const up=conv>100;
      wrap.appendChild(el('div','fn-conv '+(up?'':conv>=40?'ok':conv>0?'':'bad'),`${up?'▲':'▼'} ${conv}%`));}
    const w=Math.min(100,Math.max(20,((v||0)/base)*100));
    const st=el('div','fn-stage');const bar=el('div','fn-bar',`<b>${intf(v)}</b><span>${lab}</span>`);bar.style.width=w+'%';bar.style.background=color;
    st.appendChild(bar);wrap.appendChild(st);
  });
}
function renderCharts(cards){
  const dates=lastNDates(8), labels=dates.map(fmtDate), s=pipeByDay(cards,dates);
  drawChart('chartContratos','bar',labels,[{label:'Contratos',data:s.map(x=>x.contratos),backgroundColor:'#2f4a8a',borderRadius:4,maxBarThickness:26}]);
  drawChart('chartValor','line',labels,[
    {label:'Contratado',data:s.map(x=>x.contratado),borderColor:'#2f4a8a',backgroundColor:'rgba(47,74,138,.14)',fill:true,tension:.4,pointRadius:2},
    {label:'Coletado',data:s.map(x=>x.coletado),borderColor:'#10b981',backgroundColor:'rgba(16,185,129,.12)',fill:true,tension:.4,pointRadius:2},
  ]);
}
function renderTicketCards(cards){
  const grid=$('#ticketCards'); if(!grid) return;
  const by=pipeByTicket(cards);
  grid.innerHTML=Object.entries(PRODUCTS).map(([k,p])=>{const d=by[k];
    return `<div class="ticket-card">
      <div class="t-name">${p.label}</div>
      <div class="t-ticket">${money(p.ticket)}</div>
      <div class="t-stats"><span><b>${intf(d.count)}</b> fechados</span><span><b>${intf(d.emJornada)}</b> em jornada</span></div>
      <div class="t-money">${money(d.contratado)} <small>contratado</small></div>
      <div class="t-money cash">${money(d.coletado)} <small>coletado</small></div>
    </div>`;}).join('');
}

// ===== Sub-aba FUNIL DE VENDA (seletor de funil -> funil comercial + custos + árvore de campanhas) =====
const DC_METRICS_API='https://steio.vercel.app/api/dc-metrics';
const FUNIS_VENDA=['Formulário V1','Formulário V3','Typebot','Página (Site)','Social Selling'];
const FUNIL_APELIDO={'Formulário V1':'Formulário V1','Formulário V3':'Formulário V3','Typebot':'Typebot','Página (Site)':'Página','Social Selling':'Social Selling'};
const STEP_DEFS=[['leads','Chegaram','#3b82f6'],['qualificados','Qualificados','#6366f1'],['responderam','Responderam','#8b5cf6'],['agendaram','Agendaram','#a855f7'],['compareceram','Compareceram','#0ea5e9'],['venderam','Vendas','#22c55e']];
let _dcCache={key:'',data:null};
let SELFUNIL='Formulário V1';

async function renderFunil(){
  if(curUser()?.role==='closer') return renderCloserFunil();
  const pick=$('#funnelPicker'); if(!pick) return;
  const since=RANGE.start||TODAY, until=RANGE.end||TODAY, key=since+'|'+until;
  let d=_dcCache.key===key?_dcCache.data:null;
  if(!d){
    pick.innerHTML=''; const kg=$('#kpiTop'); if(kg) kg.innerHTML='<div class="muted sm" style="padding:10px">Carregando funis…</div>';
    try{ d=await (await fetch(`${DC_METRICS_API}?since=${since}&until=${until}`)).json(); _dcCache={key,data:d}; }
    catch(e){ if(kg) kg.innerHTML='<div class="muted sm" style="padding:10px">Não consegui carregar os funis agora.</div>'; return; }
  }
  // seletor de funil
  pick.innerHTML=FUNIS_VENDA.map(nome=>{
    const f=(d.funis||[]).find(x=>x.nome===nome)||{};
    return `<button class="fpick ${nome===SELFUNIL?'on':''}" data-funil="${nome}">
      <span class="fp-name">${FUNIL_APELIDO[nome]}</span>
      <span class="fp-sub">${intf(f.leads||0)} leads · ${money(f.spend)}</span></button>`;
  }).join('');
  pick.querySelectorAll('.fpick').forEach(b=>b.onclick=()=>{ SELFUNIL=b.dataset.funil; renderFunilSelecionado(d); });
  renderFunilSelecionado(d);
}

function renderFunilSelecionado(d){
  const f=(d.funis||[]).find(x=>x.nome===SELFUNIL)||{};
  $('#funnelPicker')?.querySelectorAll('.fpick').forEach(b=>b.classList.toggle('on',b.dataset.funil===SELFUNIL));

  // KPIs do funil (parecido com o tráfego)
  const kg=$('#kpiTop');
  if(kg){
    const cards=[
      ['Leads', intf(f.leads||0), 'b'],
      ['CPL', money(f.cpl), ''],
      ['CPM', money(f.cpm), ''],
      ['Custo / call', money(f.custoAgendamento), ''],
      ['Custo / venda', money(f.custoVenda), ''],
      ['Faturamento', money(f.faturamento), 'g'],
      ['Investido', money(f.spend), 'p'],
    ];
    kg.innerHTML=cards.map(([l,v,c])=>`<div class="kpi none kpi-${c||'x'}"><div class="k-label">${l}</div><div class="k-val">${v}</div></div>`).join('');
  }
  // Funil comercial (barras descendentes)
  const wrap=$('#funnel');
  if(wrap){
    const base=f.leads||1; wrap.innerHTML='';
    STEP_DEFS.forEach(([k,lab,color],i)=>{
      const v=f[k]||0;
      if(i>0){ const prev=f[STEP_DEFS[i-1][0]]||0; const conv=prev?Math.round(100*v/prev):0;
        wrap.appendChild(el('div','fn-conv '+(conv>=40?'ok':conv>0?'':'bad'),`▼ ${conv}% ${lab.toLowerCase()}`)); }
      const w=Math.max(22,(v/base)*100);
      const stage=el('div','fn-stage');
      const bar=el('div','fn-bar',`<b>${intf(v)}</b><span>${lab}</span>`); bar.style.width=w+'%'; bar.style.background=color;
      stage.appendChild(bar); wrap.appendChild(stage);
    });
  }
  // Custos (cascata)
  const wf=$('#waterfall');
  if(wf){
    const rows=[['CPL (por lead)',f.cpl],['Custo por call',f.custoAgendamento],['Custo por venda',f.custoVenda]];
    const max=Math.max(...rows.map(r=>isFinite(r[1])&&r[1]?r[1]:0),1);
    wf.innerHTML='';
    rows.forEach(([lab,val])=>{
      const w=isFinite(val)&&val?Math.max(5,val/max*100):0;
      const row=el('div','wf-row');
      row.innerHTML=`<div class="wf-label">${lab}</div><div class="wf-bar"><div class="wf-fill" style="width:${w}%;background:#3b82f6"></div><div class="wf-val">${money(val)}</div></div>`;
      wf.appendChild(row);
    });
  }
  renderCampTree((d.arvore||{})[SELFUNIL]||[]);
}

// Árvore campanha -> conjunto -> anúncio (drill-down estilo Facebook Ads)
function nodeRow(n,nivel){
  const has=n.filhos&&n.filhos.length;
  return `<div class="ct-node lvl-${nivel}">
    <div class="ct-row ${has?'clik':''}" ${has?`data-toggle="1"`:''}>
      <span class="ct-arrow">${has?'▸':''}</span>
      <span class="ct-name">${n.nome}</span>
      <span class="ct-metrics">
        <b class="ct-spend">${money(n.spend)}</b>
        <span>chegaram <b>${intf(n.leads)}</b></span>
        <span>agend. <b>${intf(n.agendaram)}</b></span>
        <span>compar. <b>${intf(n.compareceram)}</b></span>
        <span>vendas <b class="pos">${intf(n.venderam)}</b></span>
        <span>CPL <b>${money(n.cpl)}</b></span>
      </span>
    </div>
    ${has?`<div class="ct-kids" hidden>${n.filhos.map(c=>nodeRow(c,nivel+1)).join('')}</div>`:''}
  </div>`;
}
function renderCampTree(camps){
  const box=$('#campTree'); if(!box) return;
  if(!camps.length){ box.innerHTML='<div class="muted sm" style="padding:14px">Nenhuma campanha ativa nesse funil no período.</div>'; return; }
  box.innerHTML=`<div class="ct-head">
    <span class="ct-name">Campanha / conjunto / anúncio</span>
    <span class="ct-metrics"><b>Invest.</b><span>chegaram</span><span>agend.</span><span>compar.</span><span>vendas</span><span>CPL</span></span>
  </div>`+camps.map(c=>nodeRow(c,0)).join('');
  box.querySelectorAll('.ct-row.clik').forEach(r=>r.onclick=()=>{
    const kids=r.parentElement.querySelector(':scope > .ct-kids'); if(!kids)return;
    kids.hidden=!kids.hidden; r.querySelector('.ct-arrow').textContent=kids.hidden?'▸':'▾';
  });
}
function renderFunnel(F){
  const wrap=$('#funnel'); if(!wrap) return;
  const stages=[
    {n:'Leads',v:F.leads,color:'#3b82f6'},
    {n:'MQL (qualificados)',v:F.mql,color:'#6366f1',conv:F.convMql,key:null,convLabel:'qualificação',icp:true},
    {n:'Reuniões agendadas',v:F.agendadas,color:'#a855f7',conv:F.convAgenda,key:null,convLabel:'agendamento'},
    {n:'Reuniões feitas',v:F.feitas,color:'#0ea5e9',conv:F.showRate,key:'show_rate',convLabel:'show-rate'},
    {n:'Vendas',v:F.vendas,color:'#10b981',conv:F.closeRate,key:'close_rate',convLabel:'fechamento'},
  ];
  const max=Math.max(F.leads,1);wrap.innerHTML='';
  stages.forEach((s,i)=>{
    if(i>0){const cls=s.key?statusCls(s.conv,s.key):'ok';
      wrap.appendChild(el('div','fn-conv '+cls,`▼ ${pct(s.conv)} ${s.convLabel}`));}
    const w=Math.max(20,(s.v/max)*100);
    const stage=el('div','fn-stage');
    const bar=el('div','fn-bar',`<b>${intf(s.v)}</b><span>${s.n}</span>`);
    bar.style.width=w+'%';bar.style.background=s.color;
    stage.appendChild(bar);
    if(s.icp){
      const icp=el('div','fn-icp');
      icp.innerHTML=`<span class="icp-pill a">A: ${intf(F.icpA)}</span><span class="icp-pill b">B: ${intf(F.icpB)}</span><span class="icp-pill c">C: ${intf(F.icpC)}</span><span class="icp-pill d">D: ${intf(F.icpD)}</span>`;
      stage.appendChild(icp);
    }
    wrap.appendChild(stage);
  });
}
function renderWaterfall(F){
  const wrap=$('#waterfall'); if(!wrap) return;
  const rows=[
    {label:'CPL (lead)',val:F.leads?F.t.spend/F.leads:NaN,key:null},
    {label:'Custo / call',val:F.custoCall,key:'custo_call'},
    {label:'Custo / call qualif.',val:F.custoCallQ,key:'custo_call_q'},
    {label:'CAC (venda)',val:F.cac,key:'cac'},
  ];
  const max=Math.max(...rows.map(r=>isFinite(r.val)?r.val:0),1);
  wrap.innerHTML='';
  for(const r of rows){
    const cls=r.key?statusCls(r.val,r.key):'none';
    const color=cls==='bad'?'var(--bad)':cls==='ok'?'var(--ok)':'#cbd5e1';
    const w=isFinite(r.val)?Math.max(4,r.val/max*100):0;
    const row=el('div','wf-row');
    row.innerHTML=`<div class="wf-label">${r.label}</div><div class="wf-bar"><div class="wf-fill" style="width:${w}%;background:${color}"></div><div class="wf-val">${money(r.val)}</div></div>`;
    wrap.appendChild(row);
  }
}
function renderRoleCards(c,F){
  const grid=$('#roleCards'); if(!grid) return; grid.innerHTML='';
  const sdr=c.sdr;const icpLeads=F.t.icpA+F.t.icpB;
  const connect=sdr.contatos_feitos?sdr.atendeu/sdr.contatos_feitos*100:NaN;
  const sAgend=icpLeads?sdr.reunioes_agendadas/icpLeads*100:NaN;
  grid.appendChild(roleCard('SDR','#3b82f6',[
    ['Leads que chegaram',intf(F.leads),'auto'],
    ['Leads qualificados (ICP)',intf(icpLeads),'auto'],
    ['Falaram com você',intf(sdr.atendeu),null],
    ['Connect rate',pct(connect),statusCls(connect,'sdr_connect')],
    ['Reuniões agendadas',intf(sdr.reunioes_agendadas),null],
    ['Taxa de agendamento',pct(sAgend),statusCls(sAgend,'sdr_agend')],
  ]));
  const so=c.social_seller;const resp=so.seguidores_abordados?so.directs_recebidos/so.seguidores_abordados*100:NaN;
  const soAgend=so.conversas_ativas?so.reunioes_agendadas/so.conversas_ativas*100:NaN;
  grid.appendChild(roleCard('Social Seller','#a855f7',[
    ['Seguidores abordados',intf(so.seguidores_abordados),null],
    ['Mensagens enviadas',intf(so.mensagens_enviadas),null],
    ['Taxa de resposta',pct(resp),statusCls(resp,'social_resp')],
    ['Taxa agendamento',pct(soAgend),statusCls(soAgend,'social_agend')],
    ['Reuniões agendadas',intf(so.reunioes_agendadas),null],
  ]));
  grid.appendChild(roleCard('Closer','#10b981',[
    ['Reuniões feitas',intf(F.feitas),null],
    ['Show-rate',pct(F.showRate),statusCls(F.showRate,'show_rate')],
    ['Close rate',pct(F.closeRate),statusCls(F.closeRate,'close_rate')],
    ['Vendas',intf(F.vendas),null],
    ['Ticket médio',money(F.ticket),null],
    ['Receita',money(F.receita),null],
  ]));
}
function roleCard(name,color,rows){
  const card=el('div','role-card');card.style.borderTopColor=color;
  let h=`<h3><span style="color:${color}">●</span> ${name}</h3>`;
  for(const [n,v,cls] of rows){
    const badge=cls?` <span class="badge ${cls}">${cls==='ok'?'meta ✓':cls==='bad'?'abaixo':cls==='auto'?'auto ⚡':'—'}</span>`:'';
    h+=`<div class="metric-row"><span class="m-name">${n}</span><span class="m-val">${v}${badge}</span></div>`;
  }
  card.innerHTML=h;return card;
}

// ===== Sub-aba JORNADA DO CLIENTE (board interativo: arrastar + clicar) =====
let _dragId=null;
// ===== Sub-aba JORNADA DO CLIENTE — dispatcher SDR / Closer =====
const SDR_ETAPAS=[
  {k:'chegaram',    label:'Chegaram',    color:'#3b82f6'},
  {k:'contactados', label:'Contactados', color:'#6366f1'},
  {k:'responderam', label:'Responderam', color:'#8b5cf6'},
  {k:'followup',    label:'Follow up',   color:'#f59e0b'},
  {k:'agendaram',   label:'Agendaram',   color:'#a855f7'},
  {k:'compareceu',  label:'Compareceu',  color:'#0ea5e9'},
];
function sdrEtapa(l){
  if(l.compareceu)return'compareceu';
  if(l.agendou)return'agendaram';
  if(l.sdr_status==='follow_up'||l.follow_up)return'followup';
  if(l.respondeu)return'responderam';
  if(l.atendeu)return'contactados';
  return'chegaram';
}
let JVIEW=null;  // 'sdr' | 'closer'
let JQ='';       // busca por nome na jornada
function renderJornada(){
  const me=curUser(); if(!me) return;
  // define a visão conforme o papel (gestor pode alternar)
  if(JVIEW===null) JVIEW = (me.role==='sdr'||me.role==='social_seller') ? 'sdr' : (me.role==='gestor'?'sdr':'closer');
  if(me.role==='closer') JVIEW='closer';
  if(me.role==='sdr'||me.role==='social_seller') JVIEW='sdr';
  // toggle (só faz sentido pro gestor, que enxerga tudo)
  const tools=$('#jornadaTools');
  if(tools){
    const toggle = me.role==='gestor'
      ? `<div class="jtoggle"><button class="jt ${JVIEW==='sdr'?'on':''}" data-v="sdr">SDR</button><button class="jt ${JVIEW==='closer'?'on':''}" data-v="closer">Closer</button></div>`
      : '';
    const hint = JVIEW==='sdr'
      ? `<span class="muted sm">Leads que chegaram no período: se já foram contactados, responderam e agendaram.</span>`
      : `<span class="muted sm">Suas calls: arraste o card pra mudar de etapa ou clique no nome pra abrir.</span>`;
    const search = (me.role==='gestor'||me.role==='sdr'||me.role==='social_seller')
      ? `<input type="search" id="jBusca" class="lead-busca" placeholder="🔎 buscar lead" value="${JQ}">` : '';
    tools.innerHTML = toggle + search + hint;
    tools.querySelectorAll('.jt').forEach(b=>b.onclick=()=>{ JVIEW=b.dataset.v; renderJornada(); });
    const add=$('#jAddBtn'); if(add) add.onclick=openAddModal;
    const jb=$('#jBusca'); if(jb){ jb.oninput=()=>{ JQ=jb.value; if(JVIEW==='sdr') renderJornadaSDR(); else renderJornadaCloser(); const f=$('#jBusca'); if(f){f.focus();f.setSelectionRange(f.value.length,f.value.length);} }; }
  }
  if(JVIEW==='sdr') renderJornadaSDR(); else renderJornadaCloser();
}
function renderJornadaSDR(){
  const board=$('#jornadaBoard'); if(!board) return;
  const me=curUser();
  const dateSet=new Set(datesBetween(RANGE.start,RANGE.end));
  let leads=(ESTEIRA||[]).filter(l=>{ const d=(l.data_chegada||'').slice(0,10); return !dateSet.size||dateSet.has(d); });
  if(me.role==='sdr'||me.role==='social_seller') leads=leads.filter(l=>l.sdr_id===me.id);
  if(JQ.trim()){ const q=JQ.trim().toLowerCase(); leads=leads.filter(l=>(l.nome||'').toLowerCase().includes(q)); }
  const kp=$('#jornadaKpis');
  if(kp) kp.innerHTML=SDR_ETAPAS.map(E=>{const n=leads.filter(l=>sdrEtapa(l)===E.k).length;
    return `<div class="kpi none" style="border-left-color:${E.color}"><div class="k-label">${E.label}</div><div class="k-val">${intf(n)}</div><div class="k-meta">leads</div></div>`;}).join('');
  const isMgr=me.role==='gestor';
  const canMove=isFieldRole(me.role);   // o próprio SDR/Social move seus leads
  board.classList.remove('jb-sdr','jb-closer');
  board.innerHTML=SDR_ETAPAS.map(E=>{
    const cs=leads.filter(l=>sdrEtapa(l)===E.k);
    const body=cs.length?cs.map(l=>{
      const sdrName=isMgr?((getUsers().find(u=>u.id===l.sdr_id)||{}).nome||''):'';
      const orig=l.funil||(l.campanha||'').replace(/\[[^\]]*\]/g,'').trim()||'—';
      const extra = l.agendou&&l.agendado_em ? `<div class="jcard-cash" style="color:var(--purple)">📅 ${fmtDate(l.agendado_em)}${l.agendado_hora?` ${l.agendado_hora}`:''}</div>` : '';
      return `<div class="jcard" data-lid="${l.id}" draggable="${canMove}">
        <b class="jopen">${l.nome||'(sem nome)'}</b>
        <div class="jcard-foot"><span class="temp ${l.qualificado?'frio':'morno'}">${l.qualificado?'ICP '+(l.icp||'✓'):'a qualificar'}</span>${sdrName?`<span class="muted">${sdrName}</span>`:''}</div>
        <div class="muted sm" style="margin-top:5px">${orig}</div>${extra}
      </div>`;}).join(''):'<p class="muted sm">sem leads</p>';
    return `<div class="jcol" data-sstage="${E.k}"><div class="jcol-head" style="--sc:${E.color}">${E.label} <span>${cs.length}</span></div><div class="jcol-body">${body}</div></div>`;
  }).join('');
  board.querySelectorAll('.jcard[data-lid] .jopen').forEach(nm=>nm.onclick=e=>{ e.stopPropagation(); openEsteiraLeadModal(nm.closest('.jcard').dataset.lid); });
  if(canMove){
    board.querySelectorAll('.jcard[data-lid]').forEach(card=>{
      card.ondragstart=e=>{_dragId=card.dataset.lid;e.dataTransfer.effectAllowed='move';};
      card.ondragend=()=>{_dragId=null;board.querySelectorAll('.jcol').forEach(c=>c.classList.remove('drop'));};
    });
    board.querySelectorAll('.jcol').forEach(col=>{
      col.ondragover=e=>{e.preventDefault();col.classList.add('drop');};
      col.ondragleave=()=>col.classList.remove('drop');
      col.ondrop=e=>{e.preventDefault();col.classList.remove('drop');const id=_dragId,st=col.dataset.sstage;if(id&&st)moverLeadSDR(id,st);};
    });
  }
}
function sdrStagePatch(stage){
  const P={atendeu:false,respondeu:false,follow_up:false,agendou:false,compareceu:false};
  if(stage==='contactados') P.atendeu=true;
  if(stage==='responderam'){ P.atendeu=true; P.respondeu=true; }
  if(stage==='followup'){ P.atendeu=true; P.respondeu=true; P.follow_up=true; }
  if(stage==='agendaram'){ P.atendeu=true; P.respondeu=true; P.agendou=true; }
  if(stage==='compareceu'){ P.atendeu=true; P.respondeu=true; P.agendou=true; P.compareceu=true; }
  return P;
}
async function moverLeadSDR(id,stage){
  const l=(ESTEIRA||[]).find(x=>String(x.id)===String(id)); if(!l) return;
  const patch=sdrStagePatch(stage);
  if(stage==='agendaram'&&!l.agendado_em) patch.agendado_em=TODAY;
  const ok=await saveLead(id,patch);
  if(ok) refreshLeadViews();
}
// Pop-up no dia da call: leads que já passaram do agendamento e ainda não foram confirmados
function checarComparecimentos(){
  const me=curUser(); if(!me) return;
  const pend=myLeads().filter(l=>l.agendou && l.agendado_em && String(l.agendado_em).slice(0,10)<=TODAY && !l.compareceu && !l.compareceu_confirmado);
  if(!pend.length) return;
  const m=$('#leadModal'); if(!m) return;
  m.innerHTML=`<div class="modal-card"><button class="modal-x" id="mClose">×</button>
    <h2>Confirmar comparecimento</h2>
    <p class="muted sm" style="margin-bottom:12px">Esses leads tinham call marcada. Eles compareceram?</p>
    <div class="cmp-list">${pend.map(l=>`<div class="cmp-row" data-lid="${l.id}">
      <div><b>${l.nome||'(sem nome)'}</b><div class="muted sm">📅 ${fmtDate(l.agendado_em)}${l.agendado_hora?` · ${l.agendado_hora}`:''}</div></div>
      <div class="cmp-btns"><button class="btn-mini ok" data-cmp="1">Compareceu</button><button class="btn-mini bad" data-cmp="0">Não veio</button></div>
    </div>`).join('')}</div></div>`;
  m.hidden=false;
  $('#mClose').onclick=closeModal;
  m.onclick=e=>{if(e.target===m)closeModal();};
  m.querySelectorAll('.cmp-row').forEach(row=>{
    row.querySelectorAll('[data-cmp]').forEach(b=>b.onclick=async()=>{
      const id=row.dataset.lid, val=b.dataset.cmp==='1';
      const ok=await saveLead(id,{compareceu:val, compareceu_confirmado:true});
      if(!ok) return;
      row.remove();
      if(!m.querySelector('.cmp-row')){ closeModal(); renderGeral(); renderJornada(); if(isFieldRole(curUser().role)) renderSDRLancar(); }
    });
  });
}
// ===== CLOSER — mesma esteira (dc_leads), na ótica das calls =====
const CLOSER_ETAPAS=[
  {k:'agendada',   label:'Call marcada',         color:'#3b82f6'},
  {k:'noshow',     label:'No-show',              color:'#ef4444'},
  {k:'realizada',  label:'Reunião realizada',    color:'#0ea5e9'},
  {k:'negociacao', label:'Em negociação',        color:'#a855f7'},
  {k:'segunda',    label:'2ª reunião realizada', color:'#8b5cf6'},
  {k:'followup',   label:'Follow up',            color:'#f59e0b'},
  {k:'fechado',    label:'Fechado',              color:'#22c55e'},
  {k:'perdido',    label:'Perdido',              color:'#64748b'},
];
function closerEtapa(l){
  if(l.vendeu||l.closer_status==='fechado') return 'fechado';
  if(l.closer_status==='perdido') return 'perdido';
  if(l.closer_status==='follow_up') return 'followup';
  if(l.closer_status==='segunda') return 'segunda';
  if(l.closer_status==='negociacao') return 'negociacao';
  if(l.compareceu) return 'realizada';
  if(l.compareceu_confirmado && !l.compareceu) return 'noshow';
  return 'agendada';
}
function closerScopeLeads(){
  const me=curUser(); let ls=(ESTEIRA||[]).filter(l=>l.agendou);
  if(me.role==='closer') ls=ls.filter(l=>l.closer_id==null||String(l.closer_id)===String(me.id));
  return ls;
}
function closerLeadsInRange(){ const set=new Set(datesBetween(RANGE.start,RANGE.end));
  return closerScopeLeads().filter(l=>{const d=(l.agendado_em||'').slice(0,10); return !set.size||(d&&set.has(d));}); }
function closerStagePatch(stage){
  switch(stage){
    case 'agendada':   return {compareceu:false,compareceu_confirmado:false,closer_status:null,vendeu:false};
    case 'noshow':     return {compareceu:false,compareceu_confirmado:true,closer_status:null,vendeu:false};
    case 'realizada':  return {compareceu:true,compareceu_confirmado:true,closer_status:null,vendeu:false};
    case 'negociacao': return {compareceu:true,compareceu_confirmado:true,closer_status:'negociacao',vendeu:false};
    case 'segunda':    return {compareceu:true,compareceu_confirmado:true,closer_status:'segunda',vendeu:false};
    case 'followup':   return {compareceu:true,compareceu_confirmado:true,closer_status:'follow_up',vendeu:false};
    case 'fechado':    return {compareceu:true,compareceu_confirmado:true,closer_status:'fechado',vendeu:true};
    case 'perdido':    return {closer_status:'perdido',vendeu:false};
  }
  return {};
}
async function moverLeadCloser(id,stage){
  const l=(ESTEIRA||[]).find(x=>String(x.id)===String(id)); if(!l) return;
  const patch=closerStagePatch(stage);
  const me=curUser(); if(me.role==='closer' && l.closer_id==null) patch.closer_id=me.id;
  const ok=await saveLead(id,patch);
  if(ok) refreshLeadViews();
}
function closerControlsInner(l){
  const cur=closerEtapa(l);
  const pills=CLOSER_ETAPAS.map(E=>`<button type="button" class="stage-pill${cur===E.k?' on':''}" data-cmv="${E.k}" style="--sc:${E.color}">${E.label}</button>`).join('');
  const prodOpts=['<option value="">Produto…</option>'].concat(Object.entries(PRODUCTS).map(([k,p])=>`<option value="${k}"${l.produto===k?' selected':''}>${p.label}</option>`)).join('');
  const meetingDone = !['agendada','noshow'].includes(cur);   // reunião aconteceu -> pede o resumo
  const resumoField = meetingDone ? `<label class="full">Resumo da call <small class="muted">(obrigatório após a reunião)</small><textarea data-cf="resumo_call" rows="3" placeholder="Como foi a call, dores, objeções, próximos passos...">${l.resumo_call||''}</textarea></label>` : '';
  const vendaField = (cur==='fechado') ? `<label class="full">Valor da venda (R$)<input type="number" min="0" step="100" data-cf="valor" value="${l.valor||''}"></label>` : '';
  const map = l.mapeamento ? `<div class="closer-map"><b>📋 Mapeamento do SDR</b><p>${String(l.mapeamento).replace(/</g,'&lt;')}</p></div>` : '';
  return `<div class="stage-row">${pills}</div>
    <div class="closer-fields">
      <div class="cf-row">
        <label>Produto<select data-cf="produto">${prodOpts}</select></label>
        <label>Valor proposto (R$)<input type="number" min="0" step="100" data-cf="valor_proposto" value="${l.valor_proposto||''}" placeholder="0"></label>
      </div>
      ${resumoField}
      ${vendaField}
      <button type="button" class="btn-primary" data-csave="${l.id}">Salvar</button>
      <span class="sdr-ag-msg" id="cfmsg-${l.id}"></span>
    </div>${map}`;
}
function wireCloserControls(scope){
  scope.querySelectorAll('[data-cmv]').forEach(b=>b.onclick=()=>moverLeadCloser(b.closest('[data-clead]').dataset.clead,b.dataset.cmv));
  scope.querySelectorAll('[data-csave]').forEach(b=>b.onclick=()=>salvarCloserLead(b.dataset.csave));
}
async function salvarCloserLead(id){
  const modal=$('#leadModal'); const sc=(modal&&!modal.hidden)?modal:document;
  const card=sc.querySelector(`[data-clead="${id}"]`)||document.querySelector(`[data-clead="${id}"]`); if(!card) return;
  const g=s=>{const e=card.querySelector(`[data-cf="${s}"]`); return e?e.value:undefined;};
  const patch={};
  const prod=g('produto'); if(prod!==undefined) patch.produto=prod||null;
  const vp=g('valor_proposto'); if(vp!==undefined) patch.valor_proposto=Number(vp||0);
  const vv=g('valor'); if(vv!==undefined) patch.valor=Number(vv||0);
  const rc=g('resumo_call'); if(rc!==undefined) patch.resumo_call=rc;
  const m=card.querySelector('.sdr-ag-msg'); if(m){m.style.color='var(--ink2)';m.textContent='Salvando...';}
  const ok=await saveLead(id,patch);
  if(ok){ if(m){m.style.color='var(--ok)';m.textContent='✓ salvo';} setTimeout(()=>refreshLeadViews(),700); }
}
function closerLeadCard(l){
  const orig=l.funil||'—'; const dc=(l.agendado_em||'').slice(0,10);
  return `<div class="sdr-card" data-clead="${l.id}" data-nome="${(l.nome||'').toLowerCase()}">
    <div class="sdr-card-head">
      <div><b class="sdr-open" data-open="${l.id}">${l.nome||'(sem nome)'}</b> ${l.icp?`<span class="badge ${l.icp==='A'||l.icp==='B'?'ok':'none'}">ICP ${l.icp}</span>`:''}</div>
      <span class="muted sm">${orig}${dc?` · 📅 ${fmtDate(dc)}${l.agendado_hora?` ${l.agendado_hora}`:''}`:''}</span>
    </div>
    ${closerControlsInner(l)}
  </div>`;
}
let CLOSER_FILTRO='abrir';   // abrir | hoje | todos
function renderCloserLancar(){
  const lbl=$('#entryRoleLabel'), form=$('#entryForm'), msg=$('#entryMsg');
  const cd=$('#closerDeals'); if(cd) cd.hidden=true;
  if(msg) msg.textContent='';
  const card=form.closest('.card'); if(card){card.classList.remove('narrow');card.classList.add('sdr-lancar');}
  form.classList.add('sdr-form');
  lbl.innerHTML=`Suas calls · <b>atualize o que rolou em cada uma</b>`;
  let leads=closerScopeLeads().slice().sort((a,b)=>(b.agendado_em||'').localeCompare(a.agendado_em||''));
  if(CLOSER_FILTRO==='hoje') leads=leads.filter(l=>(l.agendado_em||'').slice(0,10)===TODAY);
  else if(CLOSER_FILTRO==='abrir') leads=leads.filter(l=>!['fechado','perdido'].includes(closerEtapa(l)));
  const chip=(k,t)=>`<button type="button" class="sdr-fil ${CLOSER_FILTRO===k?'on':''}" data-cfil="${k}">${t}</button>`;
  const filtros=`<div class="sdr-filtros">${chip('abrir','Em aberto')}${chip('hoje','Calls de hoje')}${chip('todos','Histórico completo')}
    <input type="search" id="closerBusca" class="lead-busca" placeholder="🔎 buscar lead" value="${SDR_Q}">
    <span class="muted sm" id="sdrCount">${leads.length} calls</span></div>`;
  const rows=leads.length?leads.map(l=>closerLeadCard(l)).join(''):'<p class="muted sm" style="padding:12px">Nenhuma call nesse filtro.</p>';
  form.innerHTML=filtros+`<div class="sdr-list">${rows}</div>`;
  form.querySelectorAll('.sdr-fil').forEach(b=>b.onclick=()=>{CLOSER_FILTRO=b.dataset.cfil;renderCloserLancar();});
  form.querySelectorAll('.sdr-open').forEach(b=>b.onclick=()=>openEsteiraLeadModal(b.dataset.open));
  wireCloserControls(form);
  const busca=$('#closerBusca'); if(busca){busca.oninput=()=>{SDR_Q=busca.value;filtrarSdrCards();}; if(SDR_Q)filtrarSdrCards();}
}
function renderCloserGeral(){
  const pane=$('#sub-geral'); if(!pane) return;
  const inR=closerLeadsInRange(), all=closerScopeLeads();
  const hoje=all.filter(l=>(l.agendado_em||'').slice(0,10)===TODAY);
  const cnt=(a,f)=>a.filter(f).length;
  const marcadas=inR.length, compareceram=cnt(inR,l=>l.compareceu);
  const noshow=cnt(inR,l=>l.compareceu_confirmado&&!l.compareceu);
  const followup=cnt(all,l=>closerEtapa(l)==='followup');
  const fechadas=cnt(inR,l=>l.vendeu);
  const faturamento=inR.filter(l=>l.vendeu).reduce((s,l)=>s+(Number(l.valor)||0),0);
  const txComp=marcadas?100*compareceram/marcadas:NaN, txConv=compareceram?100*fechadas/compareceram:NaN;
  const kc=(l,v,c)=>`<div class="kpi none kpi-${c||'x'}"><div class="k-label">${l}</div><div class="k-val">${v}</div></div>`;
  pane.innerHTML=`
    <section class="kpi-grid">
      ${kc('Calls hoje',intf(hoje.length),'b')}
      ${kc('Calls marcadas',intf(marcadas))}
      ${kc('Compareceram',intf(compareceram),'t')}
      ${kc('No-show',intf(noshow))}
      ${kc('Em follow up',intf(followup),'p')}
      ${kc('Taxa de comparecimento',pct(txComp))}
      ${kc('Taxa de conversão',pct(txConv),'g')}
      ${kc('Faturamento',money(faturamento),'g')}
    </section>
    <div class="two-col">
      <section class="card"><h2>Calls por dia</h2><div class="chart-box"><canvas id="chartCalls"></canvas></div></section>
      <section class="card"><h2>Seu funil comercial</h2><div id="closerFunnelMini" class="funnel"></div></section>
    </div>`;
  const dates=lastNDates(8),labels=dates.map(fmtDate);
  const marc=dates.map(d=>all.filter(l=>(l.agendado_em||'').slice(0,10)===d).length);
  const comp=dates.map(d=>all.filter(l=>(l.agendado_em||'').slice(0,10)===d&&l.compareceu).length);
  drawChart('chartCalls','bar',labels,[
    {label:'Marcadas',data:marc,backgroundColor:'#3b82f6',borderRadius:4,maxBarThickness:20},
    {label:'Compareceram',data:comp,backgroundColor:'#22c55e',borderRadius:4,maxBarThickness:20},
  ]);
  renderFunnelBars($('#closerFunnelMini'),[
    ['Marcadas',marcadas,'#3b82f6'],
    ['Compareceram',compareceram,'#0ea5e9'],
    ['Negociação',cnt(inR,l=>['negociacao','segunda','fechado'].includes(closerEtapa(l))),'#a855f7'],
    ['Fechadas',fechadas,'#22c55e'],
  ]);
}
function renderCloserFunil(){
  const pick=$('#funnelPicker'); if(pick) pick.innerHTML='';
  const inR=closerLeadsInRange(); const cnt=(f)=>inR.filter(f).length;
  const marcadas=inR.length, compareceram=cnt(l=>l.compareceu),
        negoc=cnt(l=>['negociacao','segunda','fechado'].includes(closerEtapa(l))),
        fechadas=cnt(l=>l.vendeu), perdidas=cnt(l=>closerEtapa(l)==='perdido'),
        noshow=cnt(l=>l.compareceu_confirmado&&!l.compareceu), followup=cnt(l=>closerEtapa(l)==='followup');
  const fat=inR.filter(l=>l.vendeu).reduce((s,l)=>s+(Number(l.valor)||0),0);
  const kg=$('#kpiTop'); if(kg){ const kc=(l,v,c)=>`<div class="kpi none kpi-${c||'x'}"><div class="k-label">${l}</div><div class="k-val">${v}</div></div>`;
    kg.innerHTML=[['Calls marcadas',intf(marcadas),'b'],['Compareceram',intf(compareceram),'t'],['Fechadas',intf(fechadas),'g'],['Perdidas',intf(perdidas),''],['No-show',intf(noshow),''],['Faturamento',money(fat),'g']].map(([l,v,c])=>kc(l,v,c)).join(''); }
  renderFunnelBars($('#funnel'),[
    ['Calls marcadas',marcadas,'#3b82f6'],
    ['Compareceram',compareceram,'#0ea5e9'],
    ['Negociação',negoc,'#a855f7'],
    ['Fechadas',fechadas,'#22c55e'],
  ]);
  const wf=$('#waterfall'); if(wf){ const row=(n,v)=>`<div class="metric-row"><span class="m-name">${n}</span><span class="m-val">${v}</span></div>`;
    wf.innerHTML=row('Taxa de comparecimento',pct(marcadas?100*compareceram/marcadas:NaN))
      +row('Taxa de conversão',pct(compareceram?100*fechadas/compareceram:NaN))
      +row('Em follow up',intf(followup))+row('No-show',intf(noshow))+row('Perdidas',intf(perdidas)); }
  const h1=document.querySelector('#sub-funil .two-col .card:nth-child(1) h2'); if(h1) h1.textContent='Funil comercial';
  const h2b=document.querySelector('#sub-funil .two-col .card:nth-child(2) h2'); if(h2b) h2b.textContent='Taxas';
  const st=document.querySelector('#sub-funil .section-title'); if(st) st.style.display='none';
  const ct=$('#campTree'); if(ct) ct.innerHTML='';
}
function renderJornadaCloser(){
  const board=$('#jornadaBoard'); if(!board) return;
  board.classList.remove('jb-sdr'); board.classList.add('jb-closer');
  const me=curUser(); const canMove=me.role==='closer';
  let leads=closerScopeLeads();
  if(JQ.trim()){ const q=JQ.trim().toLowerCase(); leads=leads.filter(l=>(l.nome||'').toLowerCase().includes(q)); }
  const kp=$('#jornadaKpis');
  if(kp) kp.innerHTML=CLOSER_ETAPAS.map(E=>{const n=leads.filter(l=>closerEtapa(l)===E.k).length;
    return `<div class="kpi none" style="border-left-color:${E.color}"><div class="k-label">${E.label}</div><div class="k-val">${intf(n)}</div><div class="k-meta">calls</div></div>`;}).join('');
  const isMgr=me.role==='gestor';
  board.innerHTML=CLOSER_ETAPAS.map(E=>{
    const cs=leads.filter(l=>closerEtapa(l)===E.k);
    const body=cs.length?cs.map(l=>{
      const dt=l.agendado_em?`<div class="muted sm" style="margin-top:5px">📅 ${fmtDate(l.agendado_em)}${l.agendado_hora?` ${l.agendado_hora}`:''}</div>`:'';
      const info=(l.produto||l.valor_proposto)?`<div class="muted sm" style="margin-top:4px">${l.produto?produtoLabel(l.produto):''}${l.valor_proposto?`${l.produto?' · ':''}${money(l.valor_proposto)} proposto`:''}</div>`:'';
      const val=l.vendeu&&l.valor?`<div class="jcard-cash">${money(l.valor)} vendido</div>`:'';
      return `<div class="jcard" data-lid="${l.id}" draggable="${canMove}"><b class="jopen">${l.nome||'(sem nome)'}</b>
        <div class="jcard-foot"><span class="temp ${l.qualificado?'frio':'morno'}">${l.icp?('ICP '+l.icp):''}</span>${isMgr?`<span class="muted">${(getUsers().find(u=>u.id===l.closer_id)||{}).nome||''}</span>`:''}</div>
        ${dt}${info}${val}</div>`;}).join(''):'<p class="muted sm">—</p>';
    return `<div class="jcol" data-cstage="${E.k}"><div class="jcol-head" style="--sc:${E.color}">${E.label} <span>${cs.length}</span></div><div class="jcol-body">${body}</div></div>`;
  }).join('');
  board.querySelectorAll('.jcard[data-lid] .jopen').forEach(nm=>nm.onclick=e=>{e.stopPropagation(); openEsteiraLeadModal(nm.closest('.jcard').dataset.lid);});
  if(canMove){
    board.querySelectorAll('.jcard[data-lid]').forEach(card=>{
      card.ondragstart=e=>{_dragId=card.dataset.lid;e.dataTransfer.effectAllowed='move';};
      card.ondragend=()=>{_dragId=null;board.querySelectorAll('.jcol').forEach(c=>c.classList.remove('drop'));};
    });
    board.querySelectorAll('.jcol').forEach(col=>{
      col.ondragover=e=>{e.preventDefault();col.classList.add('drop');};
      col.ondragleave=()=>col.classList.remove('drop');
      col.ondrop=e=>{e.preventDefault();col.classList.remove('drop');const id=_dragId,st=col.dataset.cstage;if(id&&st)moverLeadCloser(id,st);};
    });
  }
}
function moveLead(id,stage){ if(stage==='fechado') pipeFechar(id); else pipeSetEtapa(id,stage); }
function cardById(id){ return getPipeline().find(c=>c.id===id); }
function closeModal(){ const m=$('#leadModal'); if(m){m.hidden=true;m.innerHTML='';} }
function openLeadModal(id){
  const c=cardById(id); if(!c)return;
  const me=curUser(); const own=me.role==='closer'&&c.closer_id===me.id;
  const E=ETAPA_MAP[c.etapa]||{label:c.etapa};
  const ownerName=(getUsers().find(u=>u.id===c.closer_id)||{}).nome||'';
  const fechadoInfo=c.etapa==='fechado'
    ? `<div class="ml-row"><span>Valor do contrato</span><b>${money(c.valor_contrato)}</b></div>
       <div class="ml-row"><span>Coletado (cash collect)</span><b class="cash">${money(c.valor_coletado)}</b></div>`
    : '';
  const movePills=own
    ? `<div class="ml-move"><span class="ml-lbl">Mover na jornada:</span><div class="stage-row">${ETAPAS.map(s=>`<button class="stage-pill${s.k===c.etapa?' on':''}" data-mv="${s.k}" style="--sc:${s.color}">${s.label}</button>`).join('')}</div></div>
       <div class="ml-actions"><button class="btn-mini" data-del="1">🗑 Excluir cliente</button></div>`
    : '';
  const m=$('#leadModal');
  m.innerHTML=`<div class="modal-card">
    <button class="modal-x" id="mClose">×</button>
    <h2>${c.lead_nome}</h2>
    <div class="ml-grid">
      <div class="ml-row"><span>Produto</span><b>${c.produto?produtoLabel(c.produto)+' · '+money(PRODUCTS[c.produto].ticket):'—'}</b></div>
      <div class="ml-row"><span>Temperatura</span><b>${TEMP_LABEL[c.temperatura]||'—'}</b></div>
      <div class="ml-row"><span>Etapa atual</span><b>${E.label}</b></div>
      <div class="ml-row"><span>Valor proposto</span><b>${money(c.valor_apresentado)}</b></div>
      ${fechadoInfo}
      ${me.role==='gestor'?`<div class="ml-row"><span>Closer</span><b>${ownerName}</b></div>`:''}
    </div>
    ${movePills}
  </div>`;
  m.hidden=false;
  $('#mClose').onclick=closeModal;
  m.onclick=e=>{if(e.target===m)closeModal();};
  if(own){
    m.querySelectorAll('[data-mv]').forEach(b=>b.onclick=()=>{const s=b.dataset.mv;closeModal();if(s==='fechado')pipeFechar(c.id);else pipeSetEtapa(c.id,s);});
    const del=m.querySelector('[data-del]'); if(del) del.onclick=()=>{closeModal();pipeExcluir(c.id);};
  }
}
function openAddModal(){
  const prodOpts=Object.entries(PRODUCTS).map(([k,p])=>`<option value="${k}">${p.label} · ${money(p.ticket)}</option>`).join('');
  const m=$('#leadModal');
  m.innerHTML=`<div class="modal-card">
    <button class="modal-x" id="mClose">×</button>
    <h2>Novo cliente</h2>
    <form id="addForm" class="entry-form">
      <label class="full">Cliente (nome)<input name="lead_nome" autocomplete="off" required></label>
      <label>Produto<select name="produto">${prodOpts}</select></label>
      <label>Temperatura<select name="temperatura"><option value="quente">🔥 Quente</option><option value="morno" selected>🟡 Morno</option><option value="frio">🔵 Frio</option></select></label>
      <label class="full">Valor proposto (R$)<input type="number" min="0" step="1" name="valor_apresentado"></label>
      <button class="btn-primary full" type="submit">Adicionar</button>
    </form>
  </div>`;
  m.hidden=false;
  $('#mClose').onclick=closeModal;
  m.onclick=e=>{if(e.target===m)closeModal();};
  $('#addForm').onsubmit=async e=>{ await pipeAdd(e); closeModal(); };
}

function renderMissing(){
  const me=curUser();const b=$('#missingBanner');b.hidden=false;
  const ok=()=>{b.style.background='var(--ok-bg)';b.style.color='#047857';b.style.borderColor='#a7e8cf';};
  const warn=()=>{b.style.background='';b.style.color='';b.style.borderColor='';};
  const START=TRAFFIC.daily.length?TRAFFIC.daily[0].date:TODAY;
  if(TODAY<START){ ok(); b.innerHTML=`📅 A operação começa em <b>${fmtDate(START)}</b>. Os lançamentos começam aí.`; return; }
  if(me.role!=='gestor'){
    const filled=getEntries().some(e=>e.userId===me.id&&e.date===TODAY);
    if(filled){ok();b.innerHTML=`✓ Você já lançou os dados de hoje (${fmtDate(TODAY)}).`;}
    else{warn();b.innerHTML=`⚠️ Você ainda não lançou os dados de hoje (${fmtDate(TODAY)}). <a href="#" id="goLancar">Lançar agora →</a>`;
      const a=$('#goLancar');if(a)a.onclick=ev=>{ev.preventDefault();document.querySelector('.tab[data-tab="lancar"]').click();};}
    return;
  }
  const users=getUsers().filter(u=>ENTRY_ROLES.includes(u.role));
  if(!users.length){b.hidden=true;return;}
  const todays=getEntries().filter(e=>e.date===TODAY);
  const missing=users.filter(u=>!todays.some(e=>e.userId===u.id));
  if(!missing.length){ok();b.innerHTML=`✓ Todo mundo lançou os dados de hoje (${fmtDate(TODAY)}).`;return;}
  warn();b.innerHTML=`⚠️ Não lançaram hoje (${fmtDate(TODAY)}): `+missing.map(u=>`<b>${u.nome} (${ROLES[u.role].label})</b>`).join(', ');
}
function fmtDate(d){const[y,m,dd]=d.split('-');return `${dd}/${m}`;}

// ---------- ENTRY (lançar dados do dia) ----------
function renderEntryForm(){
  const u=curUser();const lbl=$('#entryRoleLabel');const form=$('#entryForm');
  if(isFieldRole(u.role)) return renderSDRLancar();
  if(u.role==='closer') return renderCloserLancar();
  if(!ENTRY_ROLES.includes(u.role)){
    lbl.innerHTML='Gestor · <b>Gasto de tráfego</b>';
    const date=$('#entryDate').value;const t=TRAFFIC.daily.find(d=>d.date===date);const cur=t?t.spend:0;
    form.innerHTML=`<label class="full">Gasto de tráfego do dia (R$)<input type="number" min="0" step="0.01" name="spend" value="${cur||''}" placeholder="ex: 850.00" /><small class="field-hint">Quanto você gastou em ads nesse dia (você vê no Meta Ads). É isso que faz o CPL, CAC e custo por call calcularem.</small></label><button class="btn-primary full" type="submit">Salvar gasto</button>`;
    return;
  }
  lbl.innerHTML=`Função: <b>${ROLES[u.role].label}</b> · ${u.nome}`;
  const date=$('#entryDate').value;
  const existing=getEntries().find(e=>e.userId===u.id&&e.date===date);
  form.innerHTML='';
  if(u.role==='sdr'){
    const t=TRAFFIC.daily.find(d=>d.date===date);
    const leads=t?t.leads:0, icp=t?(t.icpA+t.icpB):0;
    const box=el('div','auto-box full');
    box.innerHTML=`<div class="auto-item"><span>Leads que chegaram</span><b>${leads}</b></div>
      <div class="auto-item"><span>Leads qualificados (ICP)</span><b>${icp}</b></div>
      <div class="auto-tag">⚡ automático</div>`;
    form.appendChild(box);
  }
  for(const f of ROLES[u.role].fields){
    const wrap=el('label');
    wrap.innerHTML=`${f.label}<input type="number" min="0" step="1" name="${f.k}" value="${existing?existing.data[f.k]??'':''}" />${f.hint?`<small class="field-hint">${f.hint}</small>`:''}`;
    form.appendChild(wrap);
  }
  const btn=el('button','btn-primary full');btn.type='submit';btn.textContent=existing?'Atualizar lançamento':'Salvar lançamento';
  form.appendChild(btn);
}
async function saveEntry(ev){
  ev.preventDefault();const u=curUser();const date=$('#entryDate').value;
  const data={};for(const f of ROLES[u.role].fields)data[f.k]=Number(new FormData($('#entryForm')).get(f.k)||0);
  const msg=$('#entryMsg');msg.style.color='var(--ink2)';msg.textContent='Salvando...';
  if(u.role==='gestor'){
    const spend=Number(new FormData($('#entryForm')).get('spend')||0);
    try{ const {error}=await sb.from('dc_traffic').upsert({data:date,spend},{onConflict:'data'}); if(error)throw error;
      await loadTraffic(); msg.style.color='var(--ok)';msg.textContent='✓ Gasto salvo para '+fmtDate(date);
      renderDashboard();renderEntryForm(); setTimeout(()=>{if(msg.textContent.startsWith('✓'))msg.textContent='';},2500);
    }catch(e){msg.style.color='var(--bad)';msg.textContent='Erro: '+(e.message||e);} return;
  }
  try{
    const {error}=await sb.from('dc_lancamentos').upsert({usuario_id:u.id,data:date,role:u.role,dados:data,updated_at:new Date().toISOString()},{onConflict:'usuario_id,data'});
    if(error) throw error;
    await loadEntries();
    msg.style.color='var(--ok)';msg.textContent='✓ Salvo para '+fmtDate(date);
    renderDashboard();renderCalendar();renderEntryForm();
    setTimeout(()=>{if(msg.textContent.startsWith('✓'))msg.textContent='';},2500);
  }catch(e){msg.style.color='var(--bad)';msg.textContent='Erro ao salvar: '+(e.message||e);}
}

// ===== Social Seller (Tiago): métricas próprias de prospecção na DM =====
function mySocialAgg(){
  const me=curUser(); const set=new Set(datesBetween(RANGE.start,RANGE.end));
  const acc={}; ROLES.social_seller.fields.forEach(f=>acc[f.k]=0);
  getEntries().forEach(e=>{ if(e.userId===me.id && e.role==='social_seller' && (!set.size||set.has(e.date)))
    ROLES.social_seller.fields.forEach(f=>acc[f.k]+=Number(e.data[f.k]||0)); });
  return acc;
}
function socialPerfSection(){
  const s=mySocialAgg();
  const resp  = s.mensagens_enviadas? (100*s.directs_recebidos/s.mensagens_enviadas):NaN;
  const agend = s.conversas_ativas?   (100*s.reunioes_agendadas/s.conversas_ativas):NaN;
  const row=(n,v)=>`<div class="metric-row"><span class="m-name">${n}</span><span class="m-val">${v}</span></div>`;
  return `<h2 class="section-title">Seu funil de Social Selling</h2>
    <div class="two-col">
      <section class="card"><h2>Funil</h2><div id="socialFunnel" class="funnel"></div></section>
      <section class="card"><h2>Volume e taxas</h2>
        ${row('Conversas ativas',intf(s.conversas_ativas))}
        ${row('Taxa de resposta',pct(resp))}
        ${row('Taxa de agendamento',pct(agend))}
      </section>
    </div>`;
}
function socialMetricsFormHTML(){
  const me=curUser(); const date=$('#entryDate').value||TODAY;
  const ex=getEntries().find(e=>e.userId===me.id&&e.date===date&&e.role==='social_seller');
  const fields=ROLES.social_seller.fields.map(f=>`<label>${f.label}<input type="number" min="0" step="1" data-sm="${f.k}" value="${ex?(ex.data[f.k]??''):''}"><small class="field-hint">${f.hint||''}</small></label>`).join('');
  return `<div class="social-metrics">
    <div class="sm-head">Suas métricas de Social Seller · <b>${fmtDate(date)}</b></div>
    <div class="sm-grid">${fields}</div>
    <button type="button" class="btn-primary" id="smSave">Salvar métricas do dia</button>
    <span class="sm-msg" id="smMsg"></span>
  </div>`;
}
async function saveSocialMetrics(){
  const me=curUser(); const date=$('#entryDate').value||TODAY;
  const data={}; document.querySelectorAll('[data-sm]').forEach(i=>data[i.dataset.sm]=Number(i.value||0));
  const msg=$('#smMsg'); if(msg){msg.style.color='var(--ink2)';msg.textContent='Salvando...';}
  try{
    const {error}=await sb.from('dc_lancamentos').upsert({usuario_id:me.id,data:date,role:'social_seller',dados:data,updated_at:new Date().toISOString()},{onConflict:'usuario_id,data'});
    if(error) throw error;
    await loadEntries();
    if(msg){msg.style.color='var(--ok)';msg.textContent='✓ métricas salvas';setTimeout(()=>{if(msg)msg.textContent='';},2000);}
    renderGeral(); renderCalendar();
  }catch(e){ if(msg){msg.style.color='var(--bad)';msg.textContent='Erro: '+(e.message||e);} }
}

// ===== LANÇAR DADOS — worklist do SDR (marca o que fez em cada lead) =====
let SDR_FILTRO='pendentes';   // pendentes | hoje | todos
const SDR_CHECKS=[
  {f:'atendeu',   label:'Contatou'},
  {f:'respondeu', label:'Respondeu'},
  {f:'follow_up', label:'Follow up'},
  {f:'agendou',   label:'Agendou'},
  {f:'compareceu',label:'Compareceu'},
];
let SDR_Q='';
function renderSDRLancar(){
  const lbl=$('#entryRoleLabel'), form=$('#entryForm'), msg=$('#entryMsg');
  const cd=$('#closerDeals'); if(cd) cd.hidden=true;
  if(msg) msg.textContent='';
  const card=form.closest('.card'); if(card){ card.classList.remove('narrow'); card.classList.add('sdr-lancar'); }
  form.classList.add('sdr-form');
  lbl.innerHTML=`Seus leads · <b>marque o que já fez em cada um</b>`;
  let leads=myLeads().slice().sort((a,b)=>(b.data_chegada||'').localeCompare(a.data_chegada||''));
  if(SDR_FILTRO==='hoje') leads=leads.filter(l=>(l.data_chegada||'').slice(0,10)===TODAY);
  else if(SDR_FILTRO==='pendentes') leads=leads.filter(l=>!l.agendou&&!l.compareceu&&l.sdr_status!=='perdido');
  const chip=(k,t)=>`<button type="button" class="sdr-fil ${SDR_FILTRO===k?'on':''}" data-fil="${k}">${t}</button>`;
  const filtros=`<div class="sdr-filtros">${chip('pendentes','A trabalhar')}${chip('hoje','Chegaram hoje')}${chip('todos','Histórico completo')}
    <input type="search" id="sdrBusca" class="lead-busca" placeholder="🔎 buscar lead pelo nome" value="${SDR_Q}">
    <span class="muted sm" id="sdrCount">${leads.length} leads</span></div>`;
  const rows = leads.length ? leads.map(l=>sdrLeadCard(l)).join('') : '<p class="muted sm" style="padding:12px">Nenhum lead nesse filtro. 🎉</p>';
  const socialTop = curUser().role==='social_seller' ? socialMetricsFormHTML() : '';
  form.innerHTML=socialTop+filtros+`<div class="sdr-list">${rows}</div>`;
  const sm=$('#smSave'); if(sm) sm.onclick=saveSocialMetrics;
  form.querySelectorAll('.sdr-fil').forEach(b=>b.onclick=()=>{SDR_FILTRO=b.dataset.fil;renderSDRLancar();});
  form.querySelectorAll('.sdr-chk').forEach(b=>b.onclick=()=>toggleSdrCheck(b.dataset.id,b.dataset.f));
  form.querySelectorAll('[data-save]').forEach(b=>b.onclick=()=>salvarAgendamento(b.dataset.save));
  form.querySelectorAll('.sdr-open').forEach(b=>b.onclick=()=>openEsteiraLeadModal(b.dataset.open));
  const busca=$('#sdrBusca');
  if(busca){ busca.oninput=()=>{ SDR_Q=busca.value; filtrarSdrCards(); }; if(SDR_Q) filtrarSdrCards(); }
}
function filtrarSdrCards(){
  const q=SDR_Q.trim().toLowerCase(); let n=0;
  $$('.sdr-list .sdr-card').forEach(c=>{ const hit=!q||(c.dataset.nome||'').includes(q); c.style.display=hit?'':'none'; if(hit)n++; });
  const cnt=$('#sdrCount'); if(cnt) cnt.textContent=`${n} leads`;
}
function sdrChecksHTML(l){ return SDR_CHECKS.map(c=>`<button type="button" class="sdr-chk ${l[c.f]?'on':''}" data-id="${l.id}" data-f="${c.f}">${l[c.f]?'✓ ':''}${c.label}</button>`).join(''); }
function sdrAgendHTML(l){ return l.agendou ? `<div class="sdr-agend">
      <div class="sdr-agend-row">
        <label>Data<input type="date" data-ag="agendado_em" value="${l.agendado_em||TODAY}"></label>
        <label>Horário<input type="time" data-ag="agendado_hora" value="${l.agendado_hora||''}"></label>
      </div>
      <label class="full">Mapeamento (cole aqui)<textarea data-ag="mapeamento" rows="4" placeholder="Perfil, capital, terreno, quando pretende, travamento, observações...">${l.mapeamento||''}</textarea></label>
      <button type="button" class="btn-primary" data-save="${l.id}">Salvar agendamento</button>
      <span class="sdr-ag-msg" id="agmsg-${l.id}"></span>
    </div>` : ''; }
function sdrLeadCard(l){
  const orig=l.funil||(l.campanha||'').replace(/\[[^\]]*\]/g,'').trim()||'—';
  const dc=(l.data_chegada||'').slice(0,10);
  return `<div class="sdr-card" data-lead="${l.id}" data-nome="${(l.nome||'').toLowerCase()}">
    <div class="sdr-card-head">
      <div><b class="sdr-open" data-open="${l.id}">${l.nome||'(sem nome)'}</b> ${l.icp?`<span class="badge ${l.icp==='A'||l.icp==='B'?'ok':'none'}">ICP ${l.icp}</span>`:(l.qualificado?'<span class="badge ok">ICP</span>':'')}</div>
      <span class="muted sm">${orig}${dc?` · ${fmtDate(dc)}`:''}</span>
    </div>
    ${l.telefone?`<div class="muted sm">${l.telefone}</div>`:''}
    <div class="sdr-checks">${sdrChecksHTML(l)}</div>
    ${sdrAgendHTML(l)}
  </div>`;
}
let MODAL_LEAD=null;
function refreshLeadViews(){
  renderGeral(); renderJornada();
  const lanc=$('#tab-lancar'); if(lanc && !lanc.hidden && isFieldRole(curUser()?.role)) renderSDRLancar();
  if(MODAL_LEAD!=null){ const m=$('#leadModal'); if(m && !m.hidden) openEsteiraLeadModal(MODAL_LEAD); }
}
async function toggleSdrCheck(id,f){
  const l=(ESTEIRA||[]).find(x=>String(x.id)===String(id)); if(!l) return;
  const patch={}; patch[f]=!l[f];
  // encadeamento lógico: marcar etapa avançada acende as anteriores
  if(patch[f]===true){
    if(f==='respondeu') patch.atendeu=true;
    if(f==='agendou'){ patch.atendeu=true; patch.respondeu=true; if(!l.agendado_em) patch.agendado_em=TODAY; }
    if(f==='compareceu'){ patch.atendeu=true; patch.respondeu=true; patch.agendou=true; }
    if(f==='follow_up') patch.atendeu=true;
  }
  const ok=await saveLead(id,patch);
  if(ok) refreshLeadViews();
}
async function salvarAgendamento(id){
  const modal=$('#leadModal'); const scope=(modal&&!modal.hidden)?modal:document;
  const card=scope.querySelector(`.sdr-card[data-lead="${id}"]`)||document.querySelector(`.sdr-card[data-lead="${id}"]`); if(!card) return;
  const g=s=>card.querySelector(`[data-ag="${s}"]`)?.value||'';
  const patch={ agendado_em:g('agendado_em')||TODAY, agendado_hora:g('agendado_hora'), mapeamento:g('mapeamento'), agendou:true, atendeu:true, respondeu:true };
  const m=card.querySelector('.sdr-ag-msg'); if(m){m.style.color='var(--ink2)';m.textContent='Salvando...';}
  const ok=await saveLead(id,patch);
  if(ok){ if(m){ m.style.color='var(--ok)'; m.textContent='✓ agendamento salvo'; } setTimeout(()=>refreshLeadViews(),700); }
}
// Modal de detalhe do lead (esteira) — abre ao clicar no nome na Jornada ou na worklist
function openEsteiraLeadModal(id){
  const l=(ESTEIRA||[]).find(x=>String(x.id)===String(id)); if(!l) return;
  const m=$('#leadModal'); if(!m) return; MODAL_LEAD=l.id;
  const me=curUser();
  const isCloser = me.role==='closer' || (me.role==='gestor' && JVIEW==='closer');
  const orig=l.funil||(l.campanha||'').replace(/\[[^\]]*\]/g,'').trim()||'—';
  const sdrName=(getUsers().find(u=>u.id===l.sdr_id)||{}).nome||'—';
  const etapa=isCloser
    ? (CLOSER_ETAPAS.find(e=>e.k===closerEtapa(l))||{}).label||'—'
    : (SDR_ETAPAS.find(e=>e.k===sdrEtapa(l))||{}).label||'—';
  const controls = isCloser
    ? `<div class="ml-move"><span class="ml-lbl">Atualizar call</span>
        <div class="sdr-card" data-clead="${l.id}">${closerControlsInner(l)}</div></div>`
    : `<div class="ml-move"><span class="ml-lbl">Mover na jornada</span>
        <div class="stage-row">${SDR_ETAPAS.map(E=>`<button type="button" class="stage-pill${sdrEtapa(l)===E.k?' on':''}" data-mv="${E.k}" style="--sc:${E.color}">${E.label}</button>`).join('')}</div></div>
      <div class="ml-move"><span class="ml-lbl">Marcar o que já fez</span>
        <div class="sdr-card" data-lead="${l.id}"><div class="sdr-checks">${sdrChecksHTML(l)}</div>${sdrAgendHTML(l)}</div></div>`;
  m.innerHTML=`<div class="modal-card">
    <button class="modal-x" id="mClose">×</button>
    <h2>${l.nome||'(sem nome)'}</h2>
    <div class="ml-grid">
      <div class="ml-row"><span>Etapa</span><b>${etapa}</b></div>
      <div class="ml-row"><span>Origem</span><b>${orig}</b></div>
      <div class="ml-row"><span>ICP</span><b>${l.icp?('ICP '+l.icp):(l.qualificado?'Qualificado':'—')}</b></div>
      <div class="ml-row"><span>Telefone</span><b>${l.telefone||'—'}</b></div>
      <div class="ml-row"><span>E-mail</span><b>${l.email||'—'}</b></div>
      ${l.agendado_em?`<div class="ml-row"><span>Call marcada</span><b>${fmtDate(l.agendado_em)}${l.agendado_hora?` · ${l.agendado_hora}`:''}</b></div>`:''}
      ${me.role==='gestor'?`<div class="ml-row"><span>SDR</span><b>${sdrName}</b></div>`:''}
    </div>
    ${controls}
  </div>`;
  m.hidden=false;
  const close=()=>{ MODAL_LEAD=null; closeModal(); };
  $('#mClose').onclick=close; m.onclick=e=>{ if(e.target===m) close(); };
  if(isCloser){ wireCloserControls(m); }
  else{
    m.querySelectorAll('[data-mv]').forEach(b=>b.onclick=()=>moverLeadSDR(l.id,b.dataset.mv));
    m.querySelectorAll('.sdr-chk').forEach(b=>b.onclick=()=>toggleSdrCheck(b.dataset.id,b.dataset.f));
    m.querySelectorAll('[data-save]').forEach(b=>b.onclick=()=>salvarAgendamento(b.dataset.save));
  }
}

// ---------- CALENDAR ----------
let calMonth;
function renderCalendar(){
  const grid=$('#calGrid');grid.innerHTML='';
  const[y,m]=calMonth.split('-').map(Number);
  $('#calLabel').textContent=new Date(y,m-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].forEach(d=>grid.appendChild(el('div','cal-cell head',d)));
  const first=new Date(y,m-1,1).getDay();
  for(let i=0;i<first;i++)grid.appendChild(el('div','cal-cell empty'));
  const days=new Date(y,m,0).getDate();
  const me=curUser();const isMgr=me.role==='gestor';
  const teamUsers=getUsers().filter(u=>ENTRY_ROLES.includes(u.role));
  const lg=$('#calLegend');
  if(isMgr)lg.innerHTML=`<b>Cada letra = uma pessoa.</b> &nbsp; <span class="who-chip done">A</span> preencheu &nbsp; <span class="who-chip miss">A</span> faltou &nbsp; <span class="who-chip pending">A</span> ainda não &nbsp;·&nbsp; passe o mouse pra ver o nome`;
  else lg.innerHTML=`<span class="dot dot-ok"></span> você preencheu &nbsp; <span class="dot dot-bad"></span> você faltou &nbsp; <span class="dot dot-none"></span> ainda não`;
  const initialOf=n=>(String(n).replace(/\(.*\)/,'').trim()[0]||'?').toUpperCase();
  const START=TRAFFIC.daily.length?TRAFFIC.daily[0].date:TODAY;
  for(let d=1;d<=days;d++){
    const ds=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const tr=TRAFFIC.daily.find(x=>x.date===ds);
    const entries=getEntries().filter(e=>e.date===ds);
    const countable=(ds>=START && ds<=TODAY);
    const cell=el('div','cal-cell'+(ds===TODAY?' today':''));
    let dots='',miss=false;
    if(isMgr){
      for(const u of teamUsers){const has=entries.some(e=>e.userId===u.id);const st=has?'done':(countable?'miss':'pending');if(!has&&countable)miss=true;
        dots+=`<span class="who-chip ${st}" title="${u.nome} (${ROLES[u.role].label}) — ${has?'lançou ✓':(countable?'faltou ✗':'—')}">${initialOf(u.nome)}</span>`;}
    } else {
      const has=entries.some(e=>e.userId===me.id);const cls=has?'dot-ok':(countable?'dot-bad':'dot-none');miss=!has&&countable;
      dots=`<span class="dot ${cls}"></span> <small style="font-size:10px;font-weight:700;color:${has?'var(--ok)':(countable?'var(--bad)':'var(--mut)')}">${has?'ok':(countable?'faltou':'')}</small>`;
    }
    if(miss)cell.classList.add('cell-miss');
    cell.innerHTML=`<div class="cd">${d}</div>${tr?`<div class="cl">${tr.leads} leads</div>`:''}<div class="dots">${dots}</div>`;
    cell.onclick=()=>showDay(ds);
    grid.appendChild(cell);
  }
}
function showDay(ds){
  const F=computeFunnel([ds]);const box=$('#dayDetail');box.hidden=false;
  const me=curUser();const team=getUsers().filter(u=>ENTRY_ROLES.includes(u.role));const ent=getEntries().filter(e=>e.date===ds);
  const START=TRAFFIC.daily.length?TRAFFIC.daily[0].date:TODAY;
  let fillHtml='';
  if(ds>=START){
    if(me.role==='gestor'){fillHtml=`<div class="fill-list"><b>Quem lançou:</b> `+(team.length?team.map(u=>{const has=ent.some(e=>e.userId===u.id);return `<span class="fill-pill ${has?'ok':'bad'}">${has?'✓':'✗'} ${u.nome}</span>`;}).join(' '):'<span class="muted">ninguém cadastrado</span>')+`</div>`;}
    else{const has=ent.some(e=>e.userId===me.id);fillHtml=`<div class="fill-list"><span class="fill-pill ${has?'ok':'bad'}">${has?'✓ Você lançou esse dia':'✗ Você não lançou esse dia'}</span></div>`;}
  }
  box.innerHTML=`<h2>${fmtDate(ds)} · detalhe do dia</h2>${fillHtml}
   <div class="kpi-grid">
     <div class="kpi none"><div class="k-label">Leads</div><div class="k-val">${intf(F.leads)}</div></div>
     <div class="kpi none"><div class="k-label">Agendadas</div><div class="k-val">${intf(F.agendadas)}</div></div>
     <div class="kpi none"><div class="k-label">Feitas</div><div class="k-val">${intf(F.feitas)}</div></div>
     <div class="kpi none"><div class="k-label">Vendas</div><div class="k-val">${intf(F.vendas)}</div></div>
     <div class="kpi ${statusCls(F.showRate,'show_rate')}"><div class="k-label">Show-rate</div><div class="k-val">${pct(F.showRate)}</div></div>
     <div class="kpi ${statusCls(F.closeRate,'close_rate')}"><div class="k-label">Close rate</div><div class="k-val">${pct(F.closeRate)}</div></div>
   </div>`;
}

// ---------- EQUIPE & METAS ----------
function renderEquipe(){
  const t=$('#teamTbl');const users=getUsers();
  t.innerHTML='<tr><th>Nome</th><th>Login</th><th>Função</th></tr>'+
    (users.length?users.map(u=>`<tr><td>${u.nome}</td><td>${u.login}</td><td><span class="tag ${u.role}">${ROLES[u.role].label}</span></td></tr>`).join(''):'<tr><td colspan=3 class="muted">Ninguém cadastrado ainda.</td></tr>');
  const isMgr=curUser().role==='gestor';
  const mt=$('#metaTbl');const M=getMetas();
  mt.innerHTML='<tr><th>Métrica</th><th>Direção</th><th>Meta</th></tr>'+
    Object.entries(M).map(([k,m])=>`<tr><td>${m.label}</td><td>${m.dir==='up'?'≥ (maior melhor)':'≤ (menor melhor)'}</td>
      <td>${isMgr?`<input type="number" data-meta="${k}" value="${m.target}"> ${m.unit}`:`<b>${m.unit==='R$'?money(m.target):m.target+m.unit}</b>`}</td></tr>`).join('');
  if(isMgr) mt.querySelectorAll('input[data-meta]').forEach(inp=>inp.onchange=()=>saveMeta(inp.dataset.meta,Number(inp.value)));
  const hint=$('#metaHint'); if(hint) hint.textContent=isMgr?'Você ajusta as metas. Valem pra todo o time.':'Somente o gestor pode alterar as metas. Aqui você acompanha os alvos.';
}
async function saveMeta(chave,target){
  try{ const {error}=await sb.from('dc_metas').upsert({chave,target,updated_at:new Date().toISOString()},{onConflict:'chave'}); if(error)throw error;
    await loadMetas(); renderDashboard(); }
  catch(e){ alert('Erro ao salvar meta: '+(e.message||e)); }
}

// ---------- CRM / JORNADA (closer cria e move os cards em Lançar dados) ----------
const TEMP_LABEL={quente:'🔥 Quente',morno:'🟡 Morno',frio:'🔵 Frio'};
function pipeKpiHtml(P){
  return `<div class="kpi-grid" style="margin-bottom:16px">
    <div class="kpi none"><div class="k-label">Em jornada</div><div class="k-val">${intf(P.abertos)}</div><div class="k-meta">${money(P.naMesa)} na mesa</div></div>
    <div class="kpi none kpi-cash"><div class="k-label">Coletado</div><div class="k-val">${money(P.coletado)}</div><div class="k-meta">${intf(P.fechados)} fechados · ${money(P.contratado)} contratado</div></div>
    <div class="kpi ${statusCls(P.conv,'close_rate')}"><div class="k-label">% Conversão</div><div class="k-val">${pct(P.conv)}</div><div class="k-meta">fechados ÷ total</div></div>
  </div>`;
}
function pipeCardHtml(c,{manage=false}={}){
  const et=c.etapa||'1a_call'; const E=ETAPA_MAP[et]||{label:et};
  const prod=c.produto?`<span class="prod-pill">${produtoLabel(c.produto)}</span>`:'';
  const valLine = et==='fechado'
    ? `<div class="pipe-mid">Contrato: <b>${money(c.valor_contrato)}</b> · Coletado: <b class="cash">${money(c.valor_coletado)}</b></div>`
    : `<div class="pipe-mid">Proposto: <b>${money(c.valor_apresentado)}</b></div>`;
  let controls='';
  if(manage){
    const pills=ETAPAS.map(s=>`<button class="stage-pill${s.k===et?' on':''}" data-id="${c.id}" data-stage="${s.k}" style="--sc:${s.color}">${s.label}</button>`).join('');
    controls=`<div class="stage-row">${pills}</div><div class="pipe-actions"><button data-act="excluir" data-id="${c.id}" class="btn-mini">🗑 Excluir</button></div>`;
  }
  return `<div class="pipe-card st-${et}">
    <div class="pipe-top"><b>${c.lead_nome}</b> <span class="temp ${c.temperatura||'morno'}">${TEMP_LABEL[c.temperatura]||''}</span></div>
    <div class="pipe-prod">${prod}<span class="pipe-status et-${et}">${E.label}</span></div>
    ${valLine}
    ${controls}</div>`;
}
function renderCloserDeals(){
  const box=$('#closerDeals'); if(!box) return;
  const wrap=$('#lancarWrap');
  // Painel antigo (dc_pipeline) desativado: o closer agora trabalha as calls na worklist da esteira.
  box.hidden=true; if(wrap)wrap.classList.remove('two'); return;
  const me=curUser();
  box.hidden=false; if(wrap)wrap.classList.add('two');
  const cards=getPipeline().filter(c=>c.closer_id===me.id);
  const P=computePipeline(cards);
  const prodOpts=Object.entries(PRODUCTS).map(([k,p])=>`<option value="${k}">${p.label} · ${money(p.ticket)}</option>`).join('');
  const listHtml=cards.length?cards.map(c=>pipeCardHtml(c,{manage:true})).join(''):'<p class="muted">Nenhum cliente ainda. Adicione o primeiro acima.</p>';
  box.innerHTML=`
    <h2>Meus negócios · jornada do cliente</h2>
    ${pipeKpiHtml(P)}
    <form id="pipeForm" class="entry-form" style="margin:0 0 8px">
      <label class="full">Cliente (nome)<input name="lead_nome" autocomplete="off" required></label>
      <label>Produto<select name="produto">${prodOpts}</select></label>
      <label>Temperatura<select name="temperatura"><option value="quente">🔥 Quente</option><option value="morno" selected>🟡 Morno</option><option value="frio">🔵 Frio</option></select></label>
      <label>Valor proposto (R$)<input type="number" min="0" step="1" name="valor_apresentado"></label>
      <button class="btn-primary full" type="submit">Adicionar cliente</button>
      <p id="pipeMsg" class="entry-msg"></p>
    </form>
    <p class="muted" style="margin:4px 0 8px;font-size:12px">Clique numa etapa pra mover o cliente na jornada. Em <b>Fechado</b>, você informa o valor do contrato e quanto já coletou.</p>
    <div class="pipe-list">${listHtml}</div>`;
  const f=$('#pipeForm'); if(f) f.onsubmit=pipeAdd;
  box.querySelectorAll('.stage-pill').forEach(b=>b.onclick=()=>{const s=b.dataset.stage; if(s==='fechado') pipeFechar(b.dataset.id); else pipeSetEtapa(b.dataset.id,s);});
  box.querySelectorAll('[data-act="excluir"]').forEach(b=>b.onclick=()=>pipeExcluir(b.dataset.id));
}
function refreshPipelineViews(){ renderCloserDeals(); renderJornada(); renderGeral(); }
async function pipeAdd(ev){
  ev.preventDefault();const me=curUser();const fd=new FormData(ev.target);
  const rec={closer_id:me.id,lead_nome:(fd.get('lead_nome')||'').trim(),produto:fd.get('produto')||null,temperatura:fd.get('temperatura'),valor_apresentado:Number(fd.get('valor_apresentado')||0),etapa:'1a_call'};
  if(!rec.lead_nome)return;
  const msg=$('#pipeMsg');if(msg){msg.style.color='var(--ink2)';msg.textContent='Salvando...';}
  try{ const {error}=await sb.from('dc_pipeline').insert(rec); if(error)throw error;
    await loadPipeline(); refreshPipelineViews(); }
  catch(e){ if(msg){msg.style.color='var(--bad)';msg.textContent='Erro: '+(e.message||e);} }
}
async function pipeSetEtapa(id,etapa){
  const patch={etapa,updated_at:new Date().toISOString()};
  if(etapa!=='fechado') patch.fechado_em=null;
  try{ const {error}=await sb.from('dc_pipeline').update(patch).eq('id',id); if(error)throw error;
    await loadPipeline(); refreshPipelineViews(); }
  catch(e){ alert('Erro: '+(e.message||e)); }
}
async function pipeFechar(id){
  const contrato=prompt('Valor do CONTRATO fechado (R$)?'); if(contrato===null)return;
  const coletado=prompt('Valor COLETADO agora — a entrada que entrou no caixa (R$)?\nO resto parcelado você atualiza depois.'); if(coletado===null)return;
  try{ const {error}=await sb.from('dc_pipeline').update({etapa:'fechado',valor_contrato:Number(contrato)||0,valor_coletado:Number(coletado)||0,fechado_em:TODAY,updated_at:new Date().toISOString()}).eq('id',id); if(error)throw error;
    await loadPipeline(); refreshPipelineViews(); }
  catch(e){ alert('Erro: '+(e.message||e)); }
}
async function pipeExcluir(id){
  if(!confirm('Excluir este cliente do CRM?'))return;
  try{ const {error}=await sb.from('dc_pipeline').delete().eq('id',id); if(error)throw error;
    await loadPipeline(); refreshPipelineViews(); }
  catch(e){ alert('Erro: '+(e.message||e)); }
}

// ---------- AUTH / NAV ----------
function showApp(){
  $('#loginScreen').hidden=true;$('#app').hidden=false;
  const u=curUser();$('#whoami').textContent=`${u.nome} · ${ROLES[u.role].label}`;
  $('#entryDate').value=TODAY;calMonth=TODAY.slice(0,7);
  RANGE=presetRange('7');$('#periodFrom').value=RANGE.start;$('#periodTo').value=RANGE.end;
  // Gestor só visualiza: o gasto de tráfego entra automático, ele não lança nada.
  if(u.role==='gestor'){
    const lt=document.querySelector('.tab[data-tab="lancar"]'); if(lt) lt.style.display='none';
    const lp=$('#tab-lancar'); if(lp) lp.hidden=true;
  }
  // SDR / Social: só enxergam o que é deles. Sem Funil de Venda (V1/V3/campanhas) nem Equipe&Metas.
  if(isFieldRole(u.role)){
    const fsub=document.querySelector('.subtab[data-sub="funil"]'); if(fsub) fsub.style.display='none';
    const et=document.querySelector('.tab[data-tab="equipe"]'); if(et) et.style.display='none';
    const ep=$('#tab-equipe'); if(ep) ep.hidden=true;
    const geralSub=document.querySelector('.subtab[data-sub="geral"]'); if(geralSub) geralSub.textContent='Meu funil';
  }
  // Closer: mantém a aba Funil (mas é o funil comercial dele), sem Equipe&Metas.
  if(u.role==='closer'){
    const et=document.querySelector('.tab[data-tab="equipe"]'); if(et) et.style.display='none';
    const ep=$('#tab-equipe'); if(ep) ep.hidden=true;
    const fsub=document.querySelector('.subtab[data-sub="funil"]'); if(fsub) fsub.textContent='Funil';
    const gsub=document.querySelector('.subtab[data-sub="geral"]'); if(gsub) gsub.textContent='Meus números';
  }
  renderAll();
  if(isFieldRole(u.role)) checarComparecimentos();
}
function renderAll(){renderDashboard();renderEntryForm();renderCloserDeals();renderCalendar();renderEquipe();}
async function logout(){ try{await sb.auth.signOut();}catch(e){} location.reload(); }

function initLogin(){
  $('#loginForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);
    const login=(fd.get('login')||'').trim().toLowerCase(),senha=fd.get('senha');const msg=$('#loginMsg');
    if(!login||!senha){msg.textContent='Preencha login e senha.';return;}
    const btn=$('#loginSubmit');btn.disabled=true;const old=btn.textContent;btn.textContent='...';msg.textContent='';
    try{
      const {error}=await sb.auth.signInWithPassword({email:login+EMAIL_DOMAIN,password:senha});
      if(error){msg.textContent='Login ou senha inválidos.';return;}
      await loadAll();showApp();
    }catch(err){msg.textContent='Erro: '+(err.message||err);}
    finally{btn.disabled=false;btn.textContent=old;}
  };
}
function initNav(){
  $$('.tab').forEach(t=>t.onclick=()=>{$$('.tab').forEach(x=>x.classList.toggle('active',x===t));
    $$('.tabpane').forEach(p=>p.hidden=true);$('#tab-'+t.dataset.tab).hidden=false;});
  $$('.subtab').forEach(t=>t.onclick=()=>{$$('.subtab').forEach(x=>x.classList.toggle('active',x===t));
    $$('.subpane').forEach(p=>p.hidden=true);$('#sub-'+t.dataset.sub).hidden=false;
    if(t.dataset.sub==='geral') renderGeral();});
  $('#periodSel').onclick=e=>{const p=e.target.dataset.p;if(!p)return;RANGE=presetRange(p);
    $$('#periodSel button').forEach(b=>b.classList.toggle('active',b===e.target));
    $('#periodFrom').value=RANGE.start;$('#periodTo').value=RANGE.end;refreshRangeViews();};
  const onRange=()=>{const f=$('#periodFrom').value,t=$('#periodTo').value;if(f&&t&&f<=t){RANGE={start:f,end:t};$$('#periodSel button').forEach(b=>b.classList.remove('active'));refreshRangeViews();}};
  $('#periodFrom').onchange=onRange;$('#periodTo').onchange=onRange;
  $('#entryDate').onchange=renderEntryForm;
  $('#entryForm').onsubmit=saveEntry;
  $('#calPrev').onclick=()=>{calMonth=shiftMonth(calMonth,-1);renderCalendar();};
  $('#calNext').onclick=()=>{calMonth=shiftMonth(calMonth,1);renderCalendar();};
  $('#logoutBtn').onclick=logout;
}
function shiftMonth(ym,delta){let[y,m]=ym.split('-').map(Number);m+=delta;if(m<1){m=12;y--}if(m>12){m=1;y++}return `${y}-${String(m).padStart(2,'0')}`;}

// ---------- BOOT ----------
(async function boot(){
  initLogin();initNav();
  try{
    const {data:{session}}=await sb.auth.getSession();
    if(session){ await loadAll(); showApp(); }
  }catch(e){ console.error(e); try{await sb.auth.signOut();}catch(_){} }
})();
})();
