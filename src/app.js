import { DEFAULT_DAY_RATE, decodePayload, dedupeShifts, dominantMonth, onlyMonth, parseText, reconcileMonth, safeReconcileMonth, splitShift, totals, normalizeShift } from './core.mjs';

const STORAGE_KEY='knok-remuneracao-v2';
const STATE_VERSION=3;
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const money=new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'});
const monthFmt=new Intl.DateTimeFormat('pt-PT',{month:'long',year:'numeric',timeZone:'UTC'});
const dateFmt=new Intl.DateTimeFormat('pt-PT',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});
const localMonth=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
const clone=value=>JSON.parse(JSON.stringify(value));
const emptyState=()=>({version:STATE_VERSION,currentMonth:localMonth(),months:{},undo:null});

function sanitizeMonthData(raw){
  const dayRate=Number(raw?.dayRate);
  return {
    dayRate:Number.isFinite(dayRate)&&dayRate>0&&dayRate<200?dayRate:DEFAULT_DAY_RATE,
    shifts:dedupeShifts(raw?.shifts||[]),
    updatedAt:typeof raw?.updatedAt==='string'?raw.updatedAt:null,
    source:typeof raw?.source==='string'?raw.source.slice(0,120):null
  };
}
function sanitizeState(raw){
  if(!raw||typeof raw!=='object')return emptyState();
  const months={};
  for(const [month,data] of Object.entries(raw.months||{}))if(/^\d{4}-\d{2}$/.test(month))months[month]=sanitizeMonthData(data);
  const currentMonth=/^\d{4}-\d{2}$/.test(raw.currentMonth||'')?raw.currentMonth:localMonth();
  return {version:STATE_VERSION,currentMonth,months,undo:null};
}
function load(){
  try{
    const current=JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(current?.months)return {...sanitizeState(current),undo:current.undo||null};
    for(const key of ['knok-remuneracao-final-v1','knok-remuneracao-definitivo-v1','knok-remuneracao-clean-v1']){
      const old=JSON.parse(localStorage.getItem(key));
      if(old?.months)return sanitizeState(old);
    }
  }catch{}
  return emptyState();
}
let state=load(),editingRef=null,pendingReview=null;
const save=()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));return true}catch{return false}};
function monthData(month=state.currentMonth,create=false){if(!state.months[month]&&create)state.months[month]={dayRate:DEFAULT_DAY_RATE,shifts:[],updatedAt:null,source:null};return state.months[month]||{dayRate:DEFAULT_DAY_RATE,shifts:[],updatedAt:null,source:null}}
function labelMonth(m){const[y,mo]=m.split('-').map(Number);const s=monthFmt.format(new Date(Date.UTC(y,mo-1,1)));return s[0].toUpperCase()+s.slice(1)}
function fmtH(v){const n=Math.round(v*100)/100;return `${Number.isInteger(n)?n:n.toFixed(2).replace('.',',')} h`}
function setNotice(text,{undo=false}={}){$('#noticeText').textContent=text;$('#undoSync').hidden=!undo}
function render(){
  const d=monthData(),shifts=dedupeShifts(d.shifts),t=totals(shifts,d.dayRate);
  $('#monthInput').value=state.currentMonth;$('#totalPay').textContent=money.format(t.pay);$('#totalHours').textContent=`${fmtH(t.total)} trabalhadas`;$('#dayHours').textContent=fmtH(t.day);$('#nightHours').textContent=fmtH(t.night);$('#dayPay').textContent=money.format(t.dayPay);$('#nightPay').textContent=money.format(t.nightPay);$('#countLabel').textContent=`${shifts.length} ${shifts.length===1?'turno':'turnos'}`;
  $$('[data-rate]').forEach(b=>b.classList.toggle('active',Number(b.dataset.rate)===d.dayRate));
  $('#rows').innerHTML=shifts.map((s,i)=>{const r=splitShift(s,d.dayRate);return `<tr><td><strong>${dateFmt.format(new Date(s.date+'T00:00:00Z'))}</strong></td><td><strong>${s.start}–${s.end}</strong></td><td>${r.day?fmtH(r.day):'—'}</td><td>${r.night?fmtH(r.night):'—'}</td><td><strong>${money.format(r.pay)}</strong></td><td><div class="row-actions"><button class="mini" data-edit="${i}">Editar</button><button class="mini delete" data-delete="${i}" aria-label="Remover turno">×</button></div></td></tr>`}).join('');
  $('#emptyState').hidden=!!shifts.length;$('#exportCsv').disabled=!shifts.length;
  const months=Object.entries(state.months).filter(([,v])=>v.shifts?.length).sort(([a],[b])=>b.localeCompare(a));$('#monthEmpty').hidden=!!months.length;
  $('#monthList').innerHTML=months.map(([m,v])=>`<button class="month-item${m===state.currentMonth?' active':''}" data-month="${m}"><strong>${labelMonth(m)}</strong><small>${v.shifts.length} turnos${v.updatedAt?' · sincronizado':''}</small></button>`).join('');
  $('#undoSync').hidden=!state.undo;
}
function snapshot(month){return {month,data:clone(monthData(month,true)),createdAt:new Date().toISOString()}}
function applyMonth(month,shifts,source,message){
  state.undo=snapshot(month);
  const previous=monthData(month,true),rate=previous.dayRate;
  state.months[month]={dayRate:rate,shifts:dedupeShifts(shifts),updatedAt:new Date().toISOString(),source:source||null};
  state.currentMonth=month;save();render();setNotice(message,{undo:true});
}
function diagnosticsText(d){if(!d)return 'Sem diagnóstico técnico (importação manual).';return `Mês: ${d.month||'—'} · células: ${d.cellCount||0} · eventos: ${d.eventNodeCount||0} · interpretados: ${d.parsedEventNodeCount||0} · não interpretados: ${d.unparsedEventNodeCount||0} · ${d.healthy?'leitura completa':'leitura parcial'}`}
function openReview(month,diff,source,diagnostics){
  pendingReview={month,diff,source,diagnostics};
  $('#reviewSummary').textContent=`${labelMonth(month)}: ${diff.added.length} novos e ${diff.removed.length} turnos deixariam de existir.`;
  const line=s=>`${s.date} · ${s.start}–${s.end}`;
  $('#reviewAdded').innerHTML=diff.added.map(s=>`<div>${line(s)}</div>`).join('');$('#reviewRemoved').innerHTML=diff.removed.map(s=>`<div>${line(s)}</div>`).join('');$('#reviewDiagnostics').textContent=diagnosticsText(diagnostics);$('#reviewDialog').showModal();
}
function syncMonth(incoming,source='importação',diagnostics=null,{manualReplace=false}={}){
  const all=dedupeShifts(incoming),month=dominantMonth(all);if(!month)throw new Error('Não existem turnos válidos.');
  const clean=onlyMonth(all,month),d=monthData(month,true),baseDiff=reconcileMonth(d.shifts,clean,month);
  if(manualReplace){applyMonth(month,baseDiff.shifts,source,`${labelMonth(month)} importado: ${baseDiff.added.length} novos, ${baseDiff.removed.length} removidos, ${baseDiff.unchanged.length} iguais · ${source}.`);return baseDiff}
  const safe=safeReconcileMonth(d.shifts,clean,month,diagnostics);
  if(baseDiff.removed.length&&diagnostics?.healthy){openReview(month,baseDiff,source,diagnostics);return baseDiff}
  if(safe.mode==='merge-safe'){
    applyMonth(month,safe.shifts,source,`${labelMonth(month)} em modo seguro: ${safe.added.length} novos adicionados; ${safe.removed.length} possíveis remoções foram preservadas. ${safe.warning}`);return safe;
  }
  applyMonth(month,safe.shifts,source,`${labelMonth(month)} sincronizado: ${safe.added.length} novos, ${safe.removed.length} removidos, ${safe.unchanged.length} iguais · ${source}.`);return safe;
}
function consumeHash(){
  const raw=location.hash.slice(1);if(!raw.startsWith('knok='))return;
  try{const p=decodePayload(raw.slice(5));history.replaceState(null,'',location.pathname+location.search);syncMonth(p.shifts,p.source||'Knok',p.diagnostics||null)}catch(e){setNotice(`Importação recusada: ${e.message}`)}
}

$('#monthInput').onchange=e=>{if(e.target.value){state.currentMonth=e.target.value;save();render()}};
$('#rates').onclick=e=>{const b=e.target.closest('[data-rate]');if(!b)return;monthData(state.currentMonth,true).dayRate=Number(b.dataset.rate);save();render()};
$('#monthList').onclick=e=>{const b=e.target.closest('[data-month]');if(!b)return;state.currentMonth=b.dataset.month;save();render()};
$('#rows').onclick=e=>{const d=monthData(state.currentMonth,true),sh=dedupeShifts(d.shifts);const del=e.target.closest('[data-delete]');if(del){state.undo=snapshot(state.currentMonth);sh.splice(Number(del.dataset.delete),1);d.shifts=sh;d.updatedAt=new Date().toISOString();save();render();setNotice('Turno removido manualmente.',{undo:true});return}const edit=e.target.closest('[data-edit]');if(edit)openShift(sh[Number(edit.dataset.edit)],Number(edit.dataset.edit))};
$('#exportCsv').onclick=()=>{const d=monthData(),sh=dedupeShifts(d.shifts);if(!sh.length)return;const txt='data;inicio;fim\n'+sh.map(s=>`${s.date};${s.start};${s.end}`).join('\n'),a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+txt],{type:'text/csv'}));a.download=`turnos-${state.currentMonth}.csv`;a.click();URL.revokeObjectURL(a.href)};
$('#undoSync').onclick=()=>{if(!state.undo)return;const u=clone(state.undo);state.months[u.month]=sanitizeMonthData(u.data);state.currentMonth=u.month;state.undo=null;save();render();setNotice(`Última alteração de ${labelMonth(u.month)} desfeita.`)};

const importDlg=$('#importDialog');$('#openImport').onclick=()=>importDlg.showModal();$$('[data-close]').forEach(b=>b.onclick=()=>importDlg.close());$$('[data-tab]').forEach(b=>b.onclick=()=>{$$('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));$$('[data-panel]').forEach(p=>p.classList.toggle('active',p.dataset.panel===b.dataset.tab))});
$('#importText').oninput=()=>{$('#foundCount').textContent=`${parseText($('#importText').value,state.currentMonth).length} linhas válidas`;$('#parseError').textContent=''};
$('#confirmText').onclick=()=>{try{const p=parseText($('#importText').value,state.currentMonth);if(!p.length)throw new Error('Não encontrei linhas válidas.');syncMonth(p,'CSV/texto',null,{manualReplace:true});importDlg.close()}catch(e){$('#parseError').textContent=e.message}};

const shiftDlg=$('#shiftDialog');
function openShift(s=null,index=null){editingRef=index===null?null:{month:state.currentMonth,index};$('#shiftTitle').textContent=s?'Editar turno':'Adicionar turno';$('#shiftDate').value=s?.date||`${state.currentMonth}-01`;$('#shiftStart').value=s?.start||'';$('#shiftEnd').value=s?.end||'';$('#shiftError').textContent='';shiftDlg.showModal()}
$('#addShift').onclick=()=>openShift();$$('[data-close-shift]').forEach(b=>b.onclick=()=>shiftDlg.close());
$('#shiftForm').onsubmit=e=>{e.preventDefault();const s=normalizeShift({date:$('#shiftDate').value,start:$('#shiftStart').value,end:$('#shiftEnd').value});if(!s){$('#shiftError').textContent='Data ou horário inválido. Início e fim não podem ser iguais.';return}const month=s.date.slice(0,7);state.undo=snapshot(editingRef?.month||month);if(editingRef){const old=monthData(editingRef.month,true),oldArr=dedupeShifts(old.shifts);oldArr.splice(editingRef.index,1);old.shifts=oldArr;old.updatedAt=new Date().toISOString()}const d=monthData(month,true),arr=dedupeShifts(d.shifts);arr.push(s);d.shifts=dedupeShifts(arr);d.updatedAt=new Date().toISOString();d.source='edição manual';state.currentMonth=month;editingRef=null;save();render();setNotice('Turno guardado.',{undo:true});shiftDlg.close()};

const reviewDlg=$('#reviewDialog');$$('[data-close-review]').forEach(b=>b.onclick=()=>{pendingReview=null;reviewDlg.close()});
$('#applyReview').onclick=()=>{if(!pendingReview)return;const p=pendingReview;applyMonth(p.month,p.diff.shifts,p.source,`${labelMonth(p.month)} sincronizado após revisão: ${p.diff.added.length} novos, ${p.diff.removed.length} removidos.`);pendingReview=null;reviewDlg.close()};
$('#keepExisting').onclick=()=>{if(!pendingReview)return;const p=pendingReview,current=monthData(p.month,true).shifts,merged=dedupeShifts([...current,...p.diff.added]);applyMonth(p.month,merged,p.source,`${labelMonth(p.month)} sincronizado em modo conservador: ${p.diff.added.length} novos; nenhum turno existente foi removido.`);pendingReview=null;reviewDlg.close()};

function downloadBlob(name,type,text){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
$('#exportBackup').onclick=()=>{const backup={schema:'knok-remuneracao-backup',version:STATE_VERSION,exportedAt:new Date().toISOString(),state:{...state,undo:null}};downloadBlob(`knok-remuneracao-backup-${new Date().toISOString().slice(0,10)}.json`,'application/json',JSON.stringify(backup,null,2))};
$('#importBackup').onclick=()=>$('#backupFile').click();
$('#backupFile').onchange=async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;if(file.size>2_000_000){setNotice('Backup recusado: ficheiro demasiado grande.');return}try{const obj=JSON.parse(await file.text());if(obj?.schema!=='knok-remuneracao-backup'||!obj?.state?.months)throw new Error('Formato de backup inválido');state=sanitizeState(obj.state);save();render();setNotice('Backup restaurado com sucesso.')}catch(err){setNotice(`Não foi possível restaurar o backup: ${err.message}`)}};
$('#clearData').onclick=()=>{if(!confirm('Eliminar todos os meses, turnos e tarifas guardados neste dispositivo?'))return;try{for(const key of [STORAGE_KEY,'knok-remuneracao-final-v1','knok-remuneracao-definitivo-v1','knok-remuneracao-clean-v1'])localStorage.removeItem(key)}catch{}state=emptyState();editingRef=null;pendingReview=null;render();setNotice('Dados eliminados. A ferramenta está pronta para outra pessoa.')};

consumeHash();render();
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
