(()=>{
  function norm(s){return String(s||'').replace(/…/g,'...').replace(/\s+/g,' ').trim()}
  function normalizeTime(v){const s=norm(v);let m=s.match(/^(\d{1,2}):(\d{2})$/);if(m){const h=+m[1],mi=+m[2];return h<24&&mi<60?`${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}`:null}m=s.match(/^(\d{1,2})(?:\.\.\.)?$/);if(m){const h=+m[1];return h<24?`${String(h).padStart(2,'0')}:00`:null}return null}
  function timePair(text){const s=norm(text);const patterns=[/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/,/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2})\s*\.\.\./,/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2})(?![:\d])/];for(const re of patterns){const m=s.match(re);if(!m)continue;const a=normalizeTime(m[1]),b=normalizeTime(m[2]);if(a&&b&&a!==b)return[a,b]}return null}
  function allTimePairs(text){const s=norm(text),out=[];const re=/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}(?::\d{2}|\s*\.\.\.)?)/g;let m;while((m=re.exec(s))){const a=normalizeTime(m[1]),b=normalizeTime(m[2]);if(a&&b&&a!==b)out.push([a,b])}return out}
  function key(x){return`${x.date}|${x.start}|${x.end}`}
  function dominantMonth(items){const c={};for(const x of items){const m=x.date.slice(0,7);c[m]=(c[m]||0)+1}return Object.entries(c).sort((a,b)=>b[1]-a[1]||b[0].localeCompare(a[0]))[0]?.[0]||null}
  function encode(obj){return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'')}
  globalThis.KnokShared={norm,normalizeTime,timePair,allTimePairs,key,dominantMonth,encode};
})();
