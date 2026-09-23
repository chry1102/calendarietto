const DB_KEY = 'frosted-lessons-v1';
const DAY = 86400000;
let state = loadState();
let cursor = mondayOf(new Date());
let activeFilter = 'Tutti';
let viewMode = 'week';

function loadState() {
  try { const saved = JSON.parse(localStorage.getItem(DB_KEY)) || {}; return { calendars: saved.calendars || [], manualLessons: saved.manualLessons || [], importedLessons: saved.importedLessons || [], hiddenImportedIds: saved.hiddenImportedIds || [] }; }
  catch { return { calendars: [], manualLessons: [], importedLessons: [], hiddenImportedIds: [] }; }
}
function saveState() { localStorage.setItem(DB_KEY, JSON.stringify(state)); }
function uid() { return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(); }
function pad(n) { return String(n).padStart(2, '0'); }
function localInputDate(d) { return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes()); }
function mondayOf(d) { const x = new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate() - ((x.getDay()+6)%7)); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function prettyDate(d) { return new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short'}).format(d); }
function dateFromIcs(raw) {
  if (!raw) return null;
  const value = raw.replace(/^\d{8}T?/, '');
  const basic = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/);
  if (!basic) return null;
  const [,y,m,d,h='00',mi='00',s='00',z] = basic;
  return z ? new Date(Date.UTC(+y,+m-1,+d,+h,+mi,+s)) : new Date(+y,+m-1,+d,+h,+mi,+s);
}
function unescapeIcs(s='') { return s.replace(/\\n/gi,'\n').replace(/\\,/g,',').replace(/\\;/g,';').replace(/\\\\/g,'\\'); }
function parseIcs(text, calendar) {
  const lines = text.replace(/\r\n[ \t]/g,'').replace(/\r/g,'').split('\n');
  const events=[]; let block=null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { block={}; continue; }
    if (line === 'END:VEVENT' && block) {
      const start=dateFromIcs(block.DTSTART), end=dateFromIcs(block.DTEND) || (start && new Date(start.getTime()+3600000));
      if(start) events.push({ id:'ics-'+calendar.id+'-'+(block.UID||uid()), calendarId:calendar.id, source:'ics', title:unescapeIcs(block.SUMMARY||'Lezione'), start:start.toISOString(), end:end.toISOString(), location:unescapeIcs(block.LOCATION||''), notes:unescapeIcs(block.DESCRIPTION||''), group:calendar.group, rrule:block.RRULE||'', uid:block.UID||'' });
      block=null; continue;
    }
    if(block && line.includes(':')) { const i=line.indexOf(':'); const key=line.slice(0,i).split(';')[0]; block[key]=line.slice(i+1); }
  }
  return events;
}
function expandedLessons() {
  const start=cursor, end=addDays(cursor, viewMode === 'day' ? 1 : 7);
  const raw=[...state.importedLessons.filter(e=>!state.hiddenImportedIds.includes(e.id) && !state.manualLessons.some(m=>m.id===e.id)),...state.manualLessons];
  return raw.flatMap(e => expandEvent(e,start,end)).filter(e=>e.start>=start && e.start<end);
}
function expandEvent(e, rangeStart, rangeEnd) {
  const first = new Date(e.start), duration = new Date(e.end)-first;
  if (!e.rrule) return first>=rangeStart && first<rangeEnd ? [{...e,start:first,end:new Date(+first+duration)}] : [];
  const rule=Object.fromEntries(e.rrule.split(';').map(x=>x.split('=')));
  const freq=rule.FREQ, until=dateFromIcs(rule.UNTIL||'99991231');
  const step=freq==='DAILY'?1:freq==='WEEKLY'?7:0;
  if(!step) return first>=rangeStart && first<rangeEnd ? [{...e,start:first,end:new Date(+first+duration)}] : [];
  const output=[]; let occurrence=new Date(first); let guard=0;
  while(occurrence<rangeEnd && guard++<600) {
    if(occurrence>=rangeStart && occurrence<=until) output.push({...e,start:new Date(occurrence),end:new Date(+occurrence+duration)});
    occurrence.setDate(occurrence.getDate()+step);
  }
  return output;
}
function getCalendar(id) { return state.calendars.find(c=>c.id===id); }
function setStatus(message='') { document.querySelector('#status').textContent=message; }
function render() {
  const label=document.querySelector('#weekLabel');
  label.textContent=viewMode==='day' ? new Intl.DateTimeFormat('it-IT',{weekday:'long',day:'numeric',month:'long'}).format(cursor) : prettyDate(cursor)+' – '+prettyDate(addDays(cursor,6));
  const names=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
  const today=new Date(); today.setHours(0,0,0,0); const calendar=document.querySelector('.calendar');
  calendar.classList.toggle('daily',viewMode==='day');
  document.querySelectorAll('.view-button').forEach(button=>button.classList.toggle('active',button.dataset.view===viewMode));
  const groups=['Tutti','A','B','Altro'];
  document.querySelector('#filterRow').innerHTML=groups.map(g=>'<button class="filter '+(g===activeFilter?'active':'')+'" data-filter="'+g+'">'+(g==='Tutti'?'Tutti': 'Corso '+g)+'</button>').join('');
  const lessons=expandedLessons().filter(e=>activeFilter==='Tutti'||e.group===activeFilter);
  if(viewMode==='day') { renderDailyAgenda(lessons, today); renderCalendarOptions(); return; }
  document.querySelector('#calendarHead').innerHTML=names.map((n,i)=>'<div class="day-head '+(today.getTime()===addDays(cursor,i).getTime()?'today':'')+'">'+n+'<br><b>'+addDays(cursor,i).getDate()+'</b></div>').join('');
  document.querySelector('#weekGrid').innerHTML='';
  for(let i=0;i<7;i++) {
    const day=addDays(cursor,i), column=document.createElement('div'); column.className='day-column';
    const dayEvents=lessons.filter(e=>e.start.getFullYear()===day.getFullYear()&&e.start.getMonth()===day.getMonth()&&e.start.getDate()===day.getDate()).sort((a,b)=>a.start-b.start);
    if(!dayEvents.length) column.innerHTML='<span class="empty-day">—</span>';
    for(const event of dayEvents) {
      const node=document.querySelector('#lessonTemplate').content.firstElementChild.cloneNode(true);
      node.classList.add('group-'+event.group); node.dataset.id=event.id;
      node.querySelector('.lesson-time').textContent=pad(event.start.getHours())+':'+pad(event.start.getMinutes());
      node.querySelector('.lesson-name').textContent=event.title; node.querySelector('.lesson-location').textContent=event.location || 'Dettagli';
      column.append(node);
    }
    document.querySelector('#weekGrid').append(column);
  }
  renderCalendarOptions();
}
function renderDailyAgenda(lessons, today) {
  const calendar=document.querySelector('.calendar');
  const week=mondayOf(cursor);
  const dayNames=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
  const tabs=dayNames.map((name,index)=>{
    const date=addDays(week,index), selected=date.getTime()===cursor.getTime(), isToday=date.getTime()===today.getTime();
    return '<button class="daily-tab '+(selected?'selected':'')+'" data-day-offset="'+index+'"><span>'+name+'</span><b>'+date.getDate()+'</b>'+(isToday?'<i></i>':'')+'</button>';
  }).join('');
  const now=new Date(), completed=lessons.filter(e=>e.end<=now).length, upcoming=lessons.filter(e=>e.end>now).length;
  const isToday=cursor.getTime()===today.getTime();
  const heading=isToday?'Lezioni di oggi':'Lezioni del giorno';
  const summary=upcoming ? upcoming+' da seguire' : (lessons.length ? 'Giornata conclusa' : 'Nessuna lezione');
  const done=!upcoming && completed>0 ? '<div class="done-summary"><span>✓</span><div><strong>Lezioni concluse</strong><p>Hai finito per oggi: '+completed+' '+(completed===1?'lezione svolta.':'lezioni svolte.')+'</p></div></div>' : '';
  const cards=lessons.length ? lessons.map(event=>{
    const initials=event.title.split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase();
    const details=[event.location,event.notes.split('\n')[0]].filter(Boolean).join(' · ') || 'Dettagli non disponibili';
    const ended=event.end<=now;
    return '<article class="agenda-card group-'+event.group+(ended?' ended':'')+'" data-id="'+event.id+'"><span class="agenda-initials">'+escapeHtml(initials)+'</span><div class="agenda-main"><strong>'+escapeHtml(event.title)+'</strong><p>'+escapeHtml(details)+'</p></div><div class="agenda-time"><b>'+pad(event.start.getHours())+':'+pad(event.start.getMinutes())+'</b><span>→ '+pad(event.end.getHours())+':'+pad(event.end.getMinutes())+'</span></div></article>';
  }).join('') : '<div class="agenda-empty"><span>☀</span><strong>Nessuna lezione</strong><p>Goditi il tempo libero di oggi.</p></div>';
  calendar.innerHTML='<div class="daily-tabs">'+tabs+'</div><section class="daily-agenda"><header><div><h2>'+heading+'</h2><p>'+summary+'</p></div></header>'+done+'<div class="agenda-list">'+cards+'</div></section>';
}
function renderCalendarOptions() {
  const select=document.querySelector('#calendarInput');
  select.innerHTML='<option value="manual">Personale</option>'+state.calendars.map(c=>'<option value="'+c.id+'">'+escapeHtml(c.name)+'</option>').join('');
}
function escapeHtml(value) { const x=document.createElement('div'); x.textContent=value; return x.innerHTML; }
async function refreshCalendar(calendar, force=false) {
  if(!calendar.url) return;
  if(!force && calendar.lastRefreshed && Date.now()-calendar.lastRefreshed<DAY) return;
  const response=await fetch(calendar.url,{cache:'no-store'});
  if(!response.ok) throw new Error('HTTP '+response.status);
  const parsed=parseIcs(await response.text(),calendar);
  state.importedLessons=state.importedLessons.filter(x=>x.calendarId!==calendar.id).concat(parsed);
  calendar.lastRefreshed=Date.now(); saveState();
}
async function refreshDueCalendars() {
  const due=state.calendars.filter(c=>!c.lastRefreshed || Date.now()-c.lastRefreshed>=DAY);
  if(!due.length) { setStatus(state.calendars.length?'Calendari aggiornati oggi':'Aggiungi il tuo calendario ICS per iniziare'); return; }
  setStatus('Aggiornamento calendario…');
  const failures=[];
  for(const calendar of due) try { await refreshCalendar(calendar); } catch(e) { failures.push(calendar.name); }
  setStatus(failures.length ? 'Mantengo i dati salvati: impossibile aggiornare '+failures.join(', ') : 'Calendari aggiornati ora');
  render();
}
function showLesson(id) {
  const isNew=!id, lesson=id ? [...state.manualLessons,...state.importedLessons].find(x=>x.id===id) : null;
  if(!isNew && !lesson) return;
  document.querySelector('#lessonTitle').textContent=isNew?'Nuova lezione':lesson.title;
  document.querySelector('#lessonId').value=lesson?.id||'';
  document.querySelector('#titleInput').value=lesson?.title||'';
  document.querySelector('#startInput').value=lesson?localInputDate(new Date(lesson.start)):localInputDate(new Date());
  document.querySelector('#endInput').value=lesson?localInputDate(new Date(lesson.end)):localInputDate(new Date(Date.now()+3600000));
  document.querySelector('#locationInput').value=lesson?.location||'';
  document.querySelector('#notesInput').value=lesson?.notes||'';
  document.querySelector('#groupInput').value=lesson?.group||'A';
  document.querySelector('#calendarInput').value=lesson?.calendarId||'manual';
  document.querySelector('#deleteLesson').style.visibility=isNew?'hidden':'visible';
  document.querySelector('#lessonDialog').showModal();
}
function renderCalendarList() {
 const list=document.querySelector('#calendarList');
 list.innerHTML=state.calendars.length?state.calendars.map(c=>'<div class="calendar-row"><div><b>'+escapeHtml(c.name)+'</b><small>Corso '+c.group+' · '+escapeHtml(c.url)+'</small></div><button data-refresh="'+c.id+'">Aggiorna</button><button data-remove="'+c.id+'" aria-label="Rimuovi">×</button></div>').join(''):'<p class="muted">Nessun calendario importato.</p>';
}
document.querySelector('#prevWeek').onclick=()=>{cursor=addDays(cursor,viewMode==='day'?-1:-7);render()};
document.querySelector('#nextWeek').onclick=()=>{cursor=addDays(cursor,viewMode==='day'?1:7);render()};
document.querySelector('#weekLabel').onclick=()=>{const now=new Date(); now.setHours(0,0,0,0); cursor=viewMode==='day'?now:mondayOf(now);render()};
document.querySelector('#filterRow').onclick=e=>{if(e.target.dataset.filter){activeFilter=e.target.dataset.filter;render()}};
document.querySelector('.view-switch').onclick=e=>{if(e.target.dataset.view){viewMode=e.target.dataset.view; if(viewMode==='week') cursor=mondayOf(cursor); render()}};
document.querySelector('.calendar').onclick=e=>{const tab=e.target.closest('[data-day-offset]'); if(tab){cursor=addDays(mondayOf(cursor),Number(tab.dataset.dayOffset));render();return;} const card=e.target.closest('[data-id]');if(card)showLesson(card.dataset.id)};
document.querySelector('#addLesson').onclick=()=>showLesson();
document.querySelector('#settingsButton').onclick=()=>{renderCalendarList();document.querySelector('#settingsDialog').showModal()};
document.querySelector('#lessonForm').addEventListener('submit',e=>{
  if(e.submitter?.value==='cancel') return; e.preventDefault();
  const id=document.querySelector('#lessonId').value, old=[...state.manualLessons,...state.importedLessons].find(x=>x.id===id);
  const calendarId=document.querySelector('#calendarInput').value, cal=getCalendar(calendarId);
  const event={id:id||'manual-'+uid(),calendarId,source:'manual',title:document.querySelector('#titleInput').value.trim(),start:new Date(document.querySelector('#startInput').value).toISOString(),end:new Date(document.querySelector('#endInput').value).toISOString(),location:document.querySelector('#locationInput').value.trim(),notes:document.querySelector('#notesInput').value.trim(),group:document.querySelector('#groupInput').value,rrule:'',uid:''};
  if(new Date(event.end)<=new Date(event.start)) return setStatus('La fine deve essere dopo l’inizio.');
  state.manualLessons=state.manualLessons.filter(x=>x.id!==id);
  if(old?.source==='ics') state.importedLessons=state.importedLessons.filter(x=>x.id!==id);
  state.manualLessons.push(event); saveState(); document.querySelector('#lessonDialog').close();render();setStatus('Lezione salvata');
});
document.querySelector('#deleteLesson').onclick=()=>{
 const id=document.querySelector('#lessonId').value;
 const imported = id.startsWith('ics-') || state.importedLessons.some(x=>x.id===id); state.manualLessons=state.manualLessons.filter(x=>x.id!==id); state.importedLessons=state.importedLessons.filter(x=>x.id!==id);
 if(imported && !state.hiddenImportedIds.includes(id)) state.hiddenImportedIds.push(id);
 saveState();document.querySelector('#lessonDialog').close();render();setStatus('Lezione rimossa');
};
document.querySelector('#addCalendar').onclick=async()=>{
 const name=document.querySelector('#newCalendarName').value.trim(),url=document.querySelector('#newCalendarUrl').value.trim(),group=document.querySelector('#newCalendarGroup').value;
 if(!name||!url) return setStatus('Inserisci nome e URL ICS.');
 try { new URL(url) } catch { return setStatus('Inserisci un URL valido.'); }
 const calendar={id:'cal-'+uid(),name,url,group,lastRefreshed:0}; state.calendars.push(calendar);saveState();setStatus('Importazione in corso…');
 try { await refreshCalendar(calendar,true); document.querySelector('#newCalendarName').value='';document.querySelector('#newCalendarUrl').value='';renderCalendarList();render();setStatus('Calendario importato'); }
 catch(e) { setStatus('Calendario salvato, ma il feed non è raggiungibile dal browser. '+e.message); renderCalendarList(); }
};
document.querySelector('#calendarList').onclick=async e=>{
 const refresh=e.target.dataset.refresh, remove=e.target.dataset.remove;
 if(remove){const c=getCalendar(remove);if(confirm('Rimuovere '+c.name+'?')){state.calendars=state.calendars.filter(x=>x.id!==remove);state.importedLessons=state.importedLessons.filter(x=>x.calendarId!==remove);saveState();renderCalendarList();render();}}
 if(refresh){const c=getCalendar(refresh);setStatus('Aggiornamento in corso…');try{await refreshCalendar(c,true);setStatus('Calendario aggiornato');render()}catch(err){setStatus('Aggiornamento non riuscito: '+err.message)}}
};
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
render();refreshDueCalendars();