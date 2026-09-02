const NIGHT_RATE = 13;
const DAY_RATES = [10, 12, 16];
const DEFAULT_DAY_RATE = 12;
const PAYLOAD_VERSION = 2;

function validDate(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function normalizeDate(value, selectedMonth) {
  const s = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return validDate(y, m, d) ? s : null;
  }
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (!m) return null;
  const [, dd, mm, yy] = m;
  const fallbackYear = Number(String(selectedMonth || '').slice(0, 4)) || new Date().getFullYear();
  const year = yy ? (Number(yy) < 100 ? 2000 + Number(yy) : Number(yy)) : fallbackYear;
  const month = Number(mm), day = Number(dd);
  if (!validDate(year, month, day)) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeTime(value) {
  const raw = String(value ?? '').trim();
  // Knok frequently truncates the right side as "04..." in the visual calendar.
  let m = raw.match(/^(\d{1,2})(?:\.\.\.)$/);
  if (m) return `${m[1].padStart(2, '0')}:00`;
  const s = raw.replace('.', ':');
  m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function parseTimeRange(text) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  const patterns = [
    /(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/,
    /(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2})\s*\.\.\./,
    /(\d{1,2}:\d{2})\s+to\s+(\d{1,2}:\d{2})/i
  ];
  for (const re of patterns) {
    const m = clean.match(re);
    if (!m) continue;
    const start = normalizeTime(m[1]);
    const end = normalizeTime(m[2].includes(':') ? m[2] : `${m[2]}...`);
    if (start && end) return [start, end];
  }
  return null;
}

function shiftKey(s) {
  return `${s.date}|${s.start}|${s.end}`;
}

function normalizeShift(input) {
  const date = normalizeDate(input?.date, input?.date?.slice?.(0, 7));
  const start = normalizeTime(input?.start);
  const end = normalizeTime(input?.end);
  return date && start && end ? { date, start, end } : null;
}

function dedupeShifts(shifts) {
  const map = new Map();
  for (const raw of shifts || []) {
    const s = normalizeShift(raw);
    if (s) map.set(shiftKey(s), s);
  }
  return [...map.values()].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

function dominantMonth(shifts) {
  const counts = new Map();
  for (const s of dedupeShifts(shifts)) {
    const m = s.date.slice(0, 7);
    counts.set(m, (counts.get(m) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0] || null;
}

function onlyMonth(shifts, month) {
  return dedupeShifts(shifts).filter(s => s.date.startsWith(`${month}-`));
}

function parseText(text, selectedMonth) {
  const result = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^(data|date|dia)[;,\t ]/i.test(line)) continue;
    const parts = line.split(/[;,\t]/).map(x => x.trim()).filter(Boolean);
    let d, a, b;
    if (parts.length >= 3) [d, a, b] = parts;
    else {
      const m = line.match(/^(\d{1,2}(?:[/-]\d{1,2}(?:[/-]\d{2,4})?)?|\d{4}-\d{2}-\d{2})\s+(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})$/);
      if (m) [, d, a, b] = m;
    }
    const date = normalizeDate(d, selectedMonth), start = normalizeTime(a), end = normalizeTime(b);
    if (date && start && end) result.push({ date, start, end });
  }
  return dedupeShifts(result);
}

function minutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function overlap(a, b, c, d) {
  return Math.max(0, Math.min(b, d) - Math.max(a, c));
}
function splitShift(shift, dayRate = DEFAULT_DAY_RATE) {
  const s = normalizeShift(shift);
  if (!s) throw new Error('Invalid shift');
  let start = minutes(s.start), end = minutes(s.end);
  if (end <= start) end += 1440;
  const nightMinutes = overlap(start, end, 0, 420) + overlap(start, end, 1440, 1860);
  const totalMinutes = end - start;
  const night = nightMinutes / 60;
  const day = (totalMinutes - nightMinutes) / 60;
  return { ...s, day, night, pay: day * dayRate + night * NIGHT_RATE };
}

function totals(shifts, dayRate = DEFAULT_DAY_RATE) {
  let day = 0, night = 0;
  for (const s of dedupeShifts(shifts)) {
    const row = splitShift(s, dayRate);
    day += row.day; night += row.night;
  }
  return {
    day, night, total: day + night,
    dayPay: day * dayRate,
    nightPay: night * NIGHT_RATE,
    pay: day * dayRate + night * NIGHT_RATE
  };
}

function encodePayload(shifts, source = 'knok-extension') {
  const clean = dedupeShifts(shifts);
  const payload = JSON.stringify({ v: PAYLOAD_VERSION, source, exportedAt: new Date().toISOString(), shifts: clean });
  return btoa(unescape(encodeURIComponent(payload))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodePayload(encoded) {
  let s = String(encoded ?? '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const obj = JSON.parse(decodeURIComponent(escape(atob(s))));
  if (![1, 2].includes(Number(obj?.v ?? 1)) || !Array.isArray(obj?.shifts)) throw new Error('Payload inválido');
  const shifts = dedupeShifts(obj.shifts);
  if (!shifts.length) throw new Error('Payload sem turnos válidos');
  return { ...obj, v: Number(obj.v ?? 1), shifts };
}

function reconcileMonth(existing, incoming, month) {
  const before = onlyMonth(existing, month);
  const after = onlyMonth(incoming, month);
  const beforeKeys = new Set(before.map(shiftKey));
  const afterKeys = new Set(after.map(shiftKey));
  const added = after.filter(s => !beforeKeys.has(shiftKey(s)));
  const removed = before.filter(s => !afterKeys.has(shiftKey(s)));
  const unchanged = after.filter(s => beforeKeys.has(shiftKey(s)));
  return { shifts: after, added, removed, unchanged };
}

const STORAGE_KEY='knok-remuneracao-v2';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const money=new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'});
const monthFmt=new Intl.DateTimeFormat('pt-PT',{month:'long',year:'numeric',timeZone:'UTC'});
const dateFmt=new Intl.DateTimeFormat('pt-PT',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});
const localMonth=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
const emptyState=()=>({version:2,currentMonth:localMonth(),months:{}});
function load(){
  try{
    const current=JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(current?.months)return current;
    for(const key of ['knok-remuneracao-final-v1','knok-remuneracao-definitivo-v1','knok-remuneracao-clean-v1']){
      const old=JSON.parse(localStorage.getItem(key));
      if(old?.months)return {version:2,currentMonth:old.currentMonth||localMonth(),months:old.months};
    }
  }catch{}
  return emptyState();
}
let state=load(),editingRef=null;
const save=()=>localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
function monthData(month=state.currentMonth,create=false){if(!state.months[month]&&create)state.months[month]={dayRate:DEFAULT_DAY_RATE,shifts:[],updatedAt:null};return state.months[month]||{dayRate:DEFAULT_DAY_RATE,shifts:[],updatedAt:null}}
function labelMonth(m){const[y,mo]=m.split('-').map(Number);const s=monthFmt.format(new Date(Date.UTC(y,mo-1,1)));return s[0].toUpperCase()+s.slice(1)}
function fmtH(v){const n=Math.round(v*100)/100;return `${Number.isInteger(n)?n:n.toFixed(2).replace('.',',')} h`}
function render(){const d=monthData(),shifts=dedupeShifts(d.shifts),t=totals(shifts,d.dayRate);$('#monthInput').value=state.currentMonth;$('#totalPay').textContent=money.format(t.pay);$('#totalHours').textContent=`${fmtH(t.total)} trabalhadas`;$('#dayHours').textContent=fmtH(t.day);$('#nightHours').textContent=fmtH(t.night);$('#dayPay').textContent=money.format(t.dayPay);$('#nightPay').textContent=money.format(t.nightPay);$('#countLabel').textContent=`${shifts.length} ${shifts.length===1?'turno':'turnos'}`;$$('[data-rate]').forEach(b=>b.classList.toggle('active',Number(b.dataset.rate)===d.dayRate));$('#rows').innerHTML=shifts.map((s,i)=>{const r=splitShift(s,d.dayRate);return `<tr><td><strong>${dateFmt.format(new Date(s.date+'T00:00:00Z'))}</strong></td><td><strong>${s.start}–${s.end}</strong></td><td>${r.day?fmtH(r.day):'—'}</td><td>${r.night?fmtH(r.night):'—'}</td><td><strong>${money.format(r.pay)}</strong></td><td><div class="row-actions"><button class="mini" data-edit="${i}">Editar</button><button class="mini delete" data-delete="${i}">×</button></div></td></tr>`}).join('');$('#emptyState').hidden=!!shifts.length;$('#exportCsv').disabled=!shifts.length;const months=Object.entries(state.months).filter(([,v])=>v.shifts?.length).sort(([a],[b])=>b.localeCompare(a));$('#monthEmpty').hidden=!!months.length;$('#monthList').innerHTML=months.map(([m,v])=>`<button class="month-item${m===state.currentMonth?' active':''}" data-month="${m}"><strong>${labelMonth(m)}</strong><small>${v.shifts.length} turnos${v.updatedAt?' · sincronizado':''}</small></button>`).join('')}
function syncMonth(incoming,source='importação'){const all=dedupeShifts(incoming);const month=dominantMonth(all);if(!month)throw new Error('Não existem turnos válidos.');const clean=onlyMonth(all,month),d=monthData(month,true),diff=reconcileMonth(d.shifts,clean,month);d.shifts=diff.shifts;d.updatedAt=new Date().toISOString();state.currentMonth=month;save();render();$('#notice').textContent=`${labelMonth(month)} sincronizado: ${diff.added.length} novos, ${diff.removed.length} removidos, ${diff.unchanged.length} iguais · ${source}.`;return diff}
function consumeHash(){const raw=location.hash.slice(1);if(!raw.startsWith('knok='))return;try{const p=decodePayload(raw.slice(5));syncMonth(p.shifts,p.source||'Knok');history.replaceState(null,'',location.pathname+location.search)}catch(e){$('#notice').textContent=`Importação recusada: ${e.message}`}}
$('#monthInput').onchange=e=>{if(e.target.value){state.currentMonth=e.target.value;save();render()}};
$('#rates').onclick=e=>{const b=e.target.closest('[data-rate]');if(!b)return;monthData(state.currentMonth,true).dayRate=Number(b.dataset.rate);save();render()};
$('#monthList').onclick=e=>{const b=e.target.closest('[data-month]');if(!b)return;state.currentMonth=b.dataset.month;save();render()};
$('#rows').onclick=e=>{const d=monthData(state.currentMonth,true),sh=dedupeShifts(d.shifts);const del=e.target.closest('[data-delete]');if(del){sh.splice(Number(del.dataset.delete),1);d.shifts=sh;save();render();return}const edit=e.target.closest('[data-edit]');if(edit){openShift(sh[Number(edit.dataset.edit)],Number(edit.dataset.edit))}};
$('#exportCsv').onclick=()=>{const d=monthData(),sh=dedupeShifts(d.shifts);if(!sh.length)return;const txt='data;inicio;fim\n'+sh.map(s=>`${s.date};${s.start};${s.end}`).join('\n'),a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+txt],{type:'text/csv'}));a.download=`turnos-${state.currentMonth}.csv`;a.click();URL.revokeObjectURL(a.href)};
const importDlg=$('#importDialog');$('#openImport').onclick=()=>importDlg.showModal();$$('[data-close]').forEach(b=>b.onclick=()=>importDlg.close());$$('[data-tab]').forEach(b=>b.onclick=()=>{$$('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));$$('[data-panel]').forEach(p=>p.classList.toggle('active',p.dataset.panel===b.dataset.tab))});
$('#importText').oninput=()=>{$('#foundCount').textContent=`${parseText($('#importText').value,state.currentMonth).length} linhas válidas`;$('#parseError').textContent=''};$('#confirmText').onclick=()=>{try{const p=parseText($('#importText').value,state.currentMonth);if(!p.length)throw new Error('Não encontrei linhas válidas.');syncMonth(p,'CSV/texto');importDlg.close()}catch(e){$('#parseError').textContent=e.message}};
const shiftDlg=$('#shiftDialog');function openShift(s=null,index=null){editingRef=index===null?null:{month:state.currentMonth,index};$('#shiftTitle').textContent=s?'Editar turno':'Adicionar turno';$('#shiftDate').value=s?.date||`${state.currentMonth}-01`;$('#shiftStart').value=s?.start||'';$('#shiftEnd').value=s?.end||'';$('#shiftError').textContent='';shiftDlg.showModal()}$('#addShift').onclick=()=>openShift();$$('[data-close-shift]').forEach(b=>b.onclick=()=>shiftDlg.close());$('#shiftForm').onsubmit=e=>{e.preventDefault();const s=normalizeShift({date:$('#shiftDate').value,start:$('#shiftStart').value,end:$('#shiftEnd').value});if(!s){$('#shiftError').textContent='Data ou horário inválido.';return}const month=s.date.slice(0,7);
  if(editingRef){
    const old=monthData(editingRef.month,true),oldArr=dedupeShifts(old.shifts);
    oldArr.splice(editingRef.index,1);old.shifts=oldArr;old.updatedAt=new Date().toISOString();
  }
  const d=monthData(month,true),arr=dedupeShifts(d.shifts);arr.push(s);d.shifts=dedupeShifts(arr);d.updatedAt=new Date().toISOString();state.currentMonth=month;editingRef=null;save();render();shiftDlg.close()};
consumeHash();render();


const EXTENSION_ZIP_B64='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';
document.getElementById('downloadExtension')?.addEventListener('click',()=>{
  const bin=atob(EXTENSION_ZIP_B64),bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/zip'}));
  const a=document.createElement('a');a.href=url;a.download='knok-remuneracao-extension-v2.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
