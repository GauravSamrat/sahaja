'use strict';
const M = Model;
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const btn = (action,text,id='',primary=false) =>
  '<button type="button" data-action="'+esc(action)+'" data-id="'+esc(id)+'"'+(primary?' class="primary"':'')+'>'+esc(text)+'</button>';
const option = (value,label,selected) =>
  '<option value="'+esc(value)+'"'+(value===selected?' selected':'')+'>'+esc(label)+'</option>';
const select = (label,name,options,value) =>
  '<label>'+label+'<select name="'+name+'">'+options.map(([v,l])=>option(v,l,value)).join('')+'</select></label>';
const names = list => list.map(x=>[x,x]);
const field = (label,name,value,attrs='') =>
  '<label>'+label+'<input name="'+name+'" value="'+esc(value)+'" '+attrs+'></label>';
const local = ts => {
  if (!ts) return '';
  const d=new Date(ts);
  const pad=n=>String(n).padStart(2,'0');
  return pad(d.getFullYear())+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
};
const date = n => new Date(n).toLocaleString([], {dateStyle:'medium',timeStyle:'short'});
function parseLocal(value) {
  const ts=Date.parse(value);
  if (!Number.isFinite(ts)||local(ts)!==value) throw Error('Choose a valid local date and time.');
  return ts;
}
const mins = n => Math.round(n/M.minute)+' min';
const money = n => new Intl.NumberFormat(undefined,{style:'currency',currency:'INR'}).format(n);
const numerical = (label,name,value,min,max,step=1) =>
  field(label,name,value,'type="number" min="'+min+'" max="'+max+'" step="'+step+'" required');
const energy = [[1,'Low'],[2,'Medium'],[3,'High']];
const devices = [['phone','Phone'],['computer','Computer']];
const labels = [['now','Now'],['tasks','Tasks'],['week','Activity'],['money','Money'],['data','Data']];
let state, repo, busy=false, preview=null, offset=0, page=0, moneyLimit=30, filter='open', query='', view='now', tick, debounce;
let persistenceRequested=false;
function requestPersistence() {
  const storage=navigator.storage;
  if (persistenceRequested || !storage?.persist) return;
  persistenceRequested=true;
  storage.persist().catch(()=>{});
}
const notice = (message, error=false) => {
  const p=$(error?'storage':'notice');
  p.textContent=message;
  p.hidden=!message;
  const dialogStatus=$('dialog-status');
  if ($('dlg').open && dialogStatus) dialogStatus.textContent=message;
};
const getTask = id => state.tasks.find(t=>t.id===id);
async function change(update,options={}) {
  if (!repo || busy) return false;
  busy=true;
  let next;
  try {
    next=structuredClone(state);
    next=update(next) ?? next;
    M.validate(next);
  } catch (e) {
    notice(e.message);
    busy=false;
    return false;
  }
  try {
    await repo.commit(state,next,options.backup);
    state=next;
    notice('',true);
  } catch (e) {
    notice('Changes were not saved. '+e.message+' Reload before retrying if another tab is open.',true);
    busy=false;
    return false;
  }
  busy=false;
  notice(options.message??'');
  if (options.draw!==false) render();
  return true;
}
const capture = () => '<form data-form="capture" class="row"><label class="grow">Quick capture<input name="title" required maxlength="200" placeholder="Add a task…"></label><button class="primary">Add task</button></form>';
function cycleControls() {
  const c=M.openCycle(state);
  return '<section><h2>Current cycle</h2><p class="small">'+(c?'Started '+esc(date(c.s)):'No cycle running')+'</p><div class="row">'+
    (c?btn('cycle-end','End cycle')+btn('wake','Correct wake time'):btn('cycle-start','Start cycle','',true))+'</div></section>';
}
function taskDetails(t) {
  return '<p class="small">'+[t.dim,t.proj,t.est?mins(t.est*M.minute):'',t.actual?'Spent '+mins(t.actual):'',
    t.deadline?(t.deadlineKind==='flexible'?'Target ':'Due ')+date(t.deadline):'',
    t.start?'Starts '+date(t.start):'',t.dueRec?'Occurrence '+date(t.dueRec):'',
    t.rec,t.snooze>Date.now()?'Later until '+date(t.snooze):'',
    t.subtasks.length?t.subtasks.filter(x=>x.done).length+'/'+t.subtasks.length+' subtasks':''].filter(Boolean).map(esc).join(' · ')+'</p>';
}
function nowView() {
  const ctx={...state.ctx,goals:new Set(state.projects.filter(p=>p.goal).map(p=>p.title))};
  const ranked=M.rank(state.tasks,Date.now(),ctx,state.tasks.length);
  const start=ranked.length?offset%ranked.length:0;
  const chosen=ranked.slice(start,start+3);
  const projects=[...new Set([...state.projects.map(p=>p.title),...state.tasks.map(t=>t.proj).filter(Boolean)])].sort();
  return '<h1>Right now</h1><div class="split"><div class="stack">'+cycleControls()+
    '<form data-form="context" class="stack panel"><h2>Available capacity</h2>'+
    select('Energy','energy',energy,ctx.energy)+
    select('Time','time',[[5,'5 minutes'],[15,'15 minutes'],[30,'30 minutes'],[60,'1 hour'],[120,'2 hours'],[0,'Open time'],
      ...(![5,15,30,60,120,0].includes(ctx.time)?[[ctx.time,ctx.time+' minutes']]:[])],ctx.time)+
    '<details'+(ctx.dim||ctx.focus||ctx.mode!==M.modes[0]||!ctx.online||ctx.device!=='computer'?' open':'')+'><summary>Mode and filters</summary>'+
    select('Mode','mode',names(M.modes),ctx.mode)+select('Dimension','dim',[['','Any dimension'],...names(state.dims)],ctx.dim)+
    select('Available device','device',[...devices,['both','Both']],ctx.device)+
    select('Internet','online',[['yes','Available'],['no','Offline']],ctx.online?'yes':'no')+
    select('Project focus','focus',[['','Any project'],...names(projects)],ctx.focus)+'</details></form></div>'+
    '<div class="stack"><section class="panel"><h2>Suggested action</h2>'+
    (chosen.length?chosen.map(({t,why},i)=>'<article class="'+(i?'item':'')+'"><h3>'+esc(t.title)+'</h3>'+
      taskDetails(t)+'<p class="small">'+esc(why)+'</p><div class="row">'+btn('begin','Begin',t.id,true)+
      btn('complete','Complete',t.id)+btn('later','Later',t.id)+btn('edit','Edit',t.id)+'</div></article>').join(''):
      '<p>No task fits these settings. Try open time, a different dimension, or check availability in Tasks.</p>')+
    (ranked.length>1?btn('else','Something else'):'')+'</section><section class="panel">'+capture()+'</section></div></div>';
}
function results() {
  const q=query.toLowerCase().trim();
  const matches=state.tasks.filter(t=>(filter==='all'||filter===t.status)&&
    (!q||[t.title,t.dim,t.proj,t.notes].some(v=>v.toLowerCase().includes(q))))
    .sort((a,b)=>b.created-a.created);
  page=Math.min(page,Math.max(0,Math.ceil(matches.length/30)-1));
  const rows=matches.slice(page*30,page*30+30);
  return '<p class="small">'+matches.length+' tasks</p>'+rows.map(t=>'<article class="item"><h3>'+esc(t.title)+'</h3>'+
    taskDetails(t)+'<div class="row">'+btn('edit','Edit',t.id)+
    (t.status==='open'?btn('complete','Complete',t.id)+btn('later','Later',t.id):btn('reopen','Reopen',t.id))+
    (t.status==='arch'?'':btn('archive','Archive',t.id))+btn('delete','Delete',t.id)+'</div></article>').join('')+
    '<div class="row">'+(page?btn('page-prev','Previous'):'')+((page+1)*30<matches.length?btn('page-next','Next'):'')+'</div>';
}
function tasksView() {
  return '<h1>Tasks</h1><div class="stack"><section class="panel">'+capture()+btn('edit','Task details')+'</section>'+
    '<div class="row">'+field('Search','search',query,'id="search" type="search"')+
    select('Status','filter',[['open','Open'],['done','Completed'],['arch','Archived'],['all','All tasks']],filter)+
    '</div><section id="results" aria-label="Task results">'+results()+'</section></div>';
}
function weekView() {
  const now=new Date();
  const since=new Date(now.getFullYear(),now.getMonth(),now.getDate()-6).getTime();
  const totals=new Map();
  for (const s of state.sessions) {
    if (s.e<since) continue;
    const k=s.kind==='Focus'?(s.dim||'Focus'):s.kind;
    const fraction=s.s<since&&s.e>s.s?(s.e-since)/(s.e-s.s):1;
    totals.set(k,(totals.get(k)||0)+Math.round(s.ms*fraction));
  }
  const cycles=[...state.cycles].sort((a,b)=>b.s-a.s);
  const cycleList=new Map(cycles.map(c=>[c.id,c]));
  return '<h1>Activity</h1><div class="stack">'+cycleControls()+
    '<section class="panel"><h2>Last seven calendar days</h2>'+[...totals].map(([k,v])=>'<p>'+esc(k)+' · '+mins(v)+'</p>').join('')+
    (!totals.size?'<p class="small">No activity logged in this period.</p>':'')+btn('log','Log meditation, rest or nap','',true)+'</section>'+
    '<section><h2>Recent sessions</h2>'+[...state.sessions].sort((a,b)=>b.s-a.s).slice(0,30).map(s=>
      '<article class="item"><h3>'+esc(s.kind)+' · '+mins(s.ms)+'</h3><p class="small">'+esc(date(s.s))+
      (cycleList.has(s.cycle)?' · Cycle from '+esc(date(cycleList.get(s.cycle).s)):' · Outside a cycle')+
      (s.note?' · '+esc(s.note):'')+'</p></article>').join('')+'</section>'+
    '<section><h2>Recent cycles</h2>'+cycles.slice(0,10).map(c=>'<p>'+esc(date(c.s))+' · '+(c.e?mins(c.e-c.s):'Running')+'</p>').join('')+'</section></div>';
}
function moneyView() {
  const now=new Date(), month=new Date(now.getFullYear(),now.getMonth(),1).getTime(),
    next=new Date(now.getFullYear(),now.getMonth()+1,1).getTime();
  const sum=(type,status)=>state.money.filter(x=>x.ts>=month&&x.ts<next&&x.type===type&&(!status||x.st===status))
    .reduce((n,x)=>n+Math.round(x.amt*100),0)/100;
  return '<h1>Money</h1><section class="panel"><h2>This month</h2><p>Received '+esc(money(sum('in','received')))+
    ' · Pending '+esc(money(sum('in','pending')))+' · Expenses '+esc(money(sum('out')))+'</p>'+btn('money-edit','Add entry','',true)+
    '</section><section aria-label="Transactions">'+[...state.money].sort((a,b)=>b.ts-a.ts).slice(0,moneyLimit).map(x=>
      '<article class="item"><h3>'+(x.type==='in'?'+':'−')+esc(money(x.amt))+'</h3><p class="small">'+
      [date(x.ts),x.type==='in'?x.st:'Expense',x.note].filter(Boolean).map(esc).join(' · ')+'</p><div class="row">'+
      btn('money-edit','Correct',x.id)+(x.type==='in'&&x.st==='pending'?btn('receive','Mark received',x.id):'')+
      btn('money-delete','Delete',x.id)+'</div></article>').join('')+
    (state.money.length>moneyLimit?btn('money-more','Show more'):'')+'</section>';
}
function previewView() {
  if (!preview) return '';
  if (preview.kind==='backup') {
    const s=preview.data;
    return '<section class="panel"><h2>Backup preview</h2><p>'+s.tasks.length+' tasks · '+s.projects.length+
      ' projects · '+s.cycles.length+' cycles · '+s.sessions.length+' sessions · '+s.money.length+
      ' transactions'+(s.active?' · Active timer':'')+'</p><p class="small">SAHAJA keeps a recovery copy of the current workspace.</p><div class="row">'+
      btn('replace','Replace workspace')+btn('merge','Merge records')+btn('dismiss','Cancel')+'</div></section>';
  }
  return '<form data-form="approve-plan" class="panel"><h2>Plan preview</h2>'+
    (preview.data.projects.length?'<p>New projects with selected tasks or project approval</p>':'')+
    preview.data.projects.map(p=>'<label class="inline"><input type="checkbox" name="project" checked value="'+esc(p.id)+'">'+esc(p.title)+'</label>').join('')+
    preview.data.tasks.map(({t,duplicate},i)=>'<label class="inline"><input type="checkbox" name="selected" value="'+i+'" '+
      (duplicate?'disabled':'checked')+'><span>'+esc(t.title)+' <small>'+esc(t.dim)+(duplicate?' · Duplicate':'')+
      (t.proj?' · '+esc(t.proj):'')+'</small></span></label>').join('')+
    '<div class="row"><button class="primary">Import selection</button>'+btn('dismiss','Cancel')+'</div></form>';
}
function dataView() {
  return '<h1>Workspace</h1><div class="stack"><section class="panel stack"><h2>Backup and restore</h2>'+
    '<div class="row">'+btn('export','Export JSON','',true)+btn('recovery','Preview recovery copy')+
    '</div><label>Preview backup file<input id="backup-file" type="file" accept=".json,application/json"></label>'+
    '<p class="small">Records are local to this browser profile. Export a backup to move records to another device.</p></section>'+
    '<section class="panel stack"><h2>Import an AI plan</h2><form data-form="plan" class="stack"><label>Paste JSON'+
    '<textarea name="json" id="plan-json" rows="4" required></textarea></label><div class="row"><button>Preview pasted plan</button>'+
    '</div></form><label>Preview plan file<input id="plan-file" type="file" accept=".json,application/json"></label></section>'+
    previewView()+'<section class="panel"><h2>Life dimensions</h2>'+state.dims.map(d=>'<div class="row">'+
    '<span class="grow">'+esc(d)+'</span>'+btn('dimension','Rename',d)+'</div>').join('')+btn('dimension','Add dimension')+'</section>'+
    '<section class="panel"><h2>Projects and goals</h2>'+state.projects.map(p=>'<article class="item"><h3>'+esc(p.title)+'</h3>'+
    (p.goal?'<p>'+esc(p.goal)+'</p>':'')+btn('project','Edit',p.id)+btn('project-delete','Remove project',p.id)+'</article>').join('')+
    btn('project','Add project')+'</section><section class="panel"><h2>Appearance</h2>'+btn('theme','Switch to '+
    (state.theme==='light'?'dark':'light')+' theme')+'</section></div>';
}
function renderTimer() {
  clearTimeout(tick);
  const bar=$('bar'), a=state.active;
  bar.hidden=!a;
  bar.innerHTML=a?'<div class="panel"><div class="row"><strong class="grow">'+esc(getTask(a.id)?.title)+'</strong>'+
    '<span id="timer" aria-label="Elapsed time"></span></div><div class="row">'+
    (a.running===null?btn('resume','Resume'):btn('pause','Pause'))+btn('stop','Stop')+
    btn('correct','Correct duration')+btn('complete','Complete',a.id,true)+'</div></div>':'';
  updateTimer();
}
function updateTimer() {
  clearTimeout(tick);
  if (!state?.active||document.hidden||!$('timer')) return;
  const ms=M.elapsed(state.active,Date.now());
  const s=Math.floor(ms/1000);
  const display=[Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(x=>String(x).padStart(2,'0')).join(':');
  if ($('timer').textContent!==display) $('timer').textContent=display;
  if (state.active.running!==null) tick=setTimeout(updateTimer,1000-ms%1000);
}
function render() {
  document.documentElement.dataset.t=state.theme||'dark';
  $('nav').innerHTML=labels.map(([key,label])=>'<a href="#'+key+'"'+
    (view===key?' aria-current="page"':'')+'>'+label+'</a>').join('');
  $('v').innerHTML=state.onboarded?({now:nowView,tasks:tasksView,week:weekView,money:moneyView,data:dataView}[view])():
    '<h1>Your workspace</h1><section class="panel"><h2>Choose how to start</h2><p>Set up your own tasks or load an editable set for work, learning and personal life.</p>'+
    '<div class="row">'+btn('empty','Start empty','',true)+btn('starter','Load Operation Independence')+'</div></section>';
  renderTimer();
}
function modal(title,form,body,action='Save') {
  const d=$('dlg');
  d.innerHTML='<h2 id="dialog-title">'+esc(title)+'</h2><p id="dialog-status" role="status"></p><form data-form="'+form+'" class="editor">'+body+
    '<div class="row wide"><button class="primary">'+esc(action)+'</button>'+btn('cancel','Cancel')+'</div></form>';
  d.showModal();
}
function taskEditor(id) {
  const t=getTask(id)||M.task('',state.dims[0]);
  const list=[...new Set([...state.projects.map(p=>p.title),...state.tasks.map(t=>t.proj).filter(Boolean)])].sort();
  modal(id?'Edit task':'New task','task',
    '<input type="hidden" name="id" value="'+esc(id)+'">'+field('Title','title',t.title,'maxlength="200" required')+
    select('Dimension','dim',names(state.dims),t.dim)+
    field('Project','proj',t.proj,'maxlength="120" list="project-options"')+
    '<datalist id="project-options">'+list.map(p=>option(p,p,null)).join('')+'</datalist>'+
    numerical('Estimate in minutes (0 for unknown)','est',t.est,0,1440)+
    select('Energy required','energy',energy,t.energy)+select('Priority','pri',[[1,'Low'],[2,'Normal'],[3,'High']],t.pri)+
    select('Device required','device',[['any','Any device'],...devices],t.device)+
    select('Internet required','online',[['no','No'],['yes','Yes']],t.online?'yes':'no')+
    field('Earliest start','start',local(t.start),'type="datetime-local"')+
    field('Deadline','deadline',local(t.deadline),'type="datetime-local"')+
    select('Deadline type','deadlineKind',[['external','External deadline'],['flexible','Flexible target']],t.deadlineKind)+
    select('Repeat','rec',[['','Never'],['daily','Daily'],['weekly','Weekly']],t.rec)+
    numerical('Actual minutes', 'actual', t.actual/M.minute,0,14400000,'any')+
    (t.snooze>Date.now()?'<label class="inline"><input type="checkbox" name="unsnooze"> Clear postponement</label>':'')+
    '<label class="wide">Notes<textarea name="notes" maxlength="4000">'+esc(t.notes)+'</textarea></label>'+
    '<label class="wide">Subtasks, one per line. Use [x] for completed.<textarea name="subtasks" maxlength="10350">'+
    esc(t.subtasks.map(x=>(x.done?'[x] ':'')+x.title).join('\n'))+'</textarea></label>');
}
function moneyEditor(id) {
  const x=state.money.find(m=>m.id===id)??{id:'',amt:'',type:'in',st:'received',ts:Date.now(),note:''};
  modal(id?'Correct entry':'New entry','money','<input type="hidden" name="id" value="'+esc(id)+'">'+
    numerical('Amount in ₹','amt',x.amt,.01,1e12,.01)+select('Type','type',[['in','Income'],['out','Expense']],x.type)+
    select('Income status','st',[['received','Received'],['pending','Pending']],x.st)+
    field('Calendar time','ts',local(x.ts),'type="datetime-local" required')+field('Note','note',x.note,'maxlength="500"'));
}

const starter = [
  ['Operation Independence','Earn','Apply for remote jobs|Find AI training opportunities|Send freelance proposals|Contact potential clients|Explore agency subcontracting|Review existing gig work'],
  ['Operation Independence','Manage','Review finances'],
  ['Citta','Create','Polish a small UI detail|Test on Android|Test on Windows|Improve the reader|Improve text to speech|Review mind maps and the library|Fix a critical bug|Record a product demonstration|Prepare the beta release|Validate a commercial use case'],
  ['Learning','Learn','Practice Python|Practice Dart and Flutter|Practice JavaScript|Practice SQL|Practice Git|Work with an API|Practice software testing|Try a business automation'],
  ['Personal life','Being','Meditate|Read|Reflect'],
  ['Personal life','Rest','Sleep|Have a meal|Exercise|Take a rest']
];
async function setup(useStarter) {
  await change(s=>{
    s.onboarded=true;
    if (!useStarter) return;
    for (const [proj,dim,titles] of starter) {
      if (!s.projects.some(p=>p.title===proj)) s.projects.push({id:M.id(),title:proj,goal:''});
      for (const title of titles.split('|')) s.tasks.push({...M.task(title,dim),proj,est:20,energy:dim==='Rest'||dim==='Being'?1:2});
    }
  });
}
function download(value) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const link=document.createElement('a');
  link.href=url;
  link.download='sahaja-backup-'+new Date().toISOString().slice(0,10)+'.json';
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function showPreview(kind,value) {
  const data=kind==='backup'?M.upgrade(value):M.plan(value,state);
  preview={kind,data};
  const oldText=$('plan-json')?.value;
  render();
  if (oldText && $('plan-json')) $('plan-json').value=oldText;
  const h=[...$('v').querySelectorAll('h2')].find(e=>e.textContent.endsWith('preview'));
  if (h) { h.tabIndex=-1; h.focus(); }
}
const act = {
  empty:()=>setup(false),
  starter:()=>setup(true),
  edit:taskEditor,
  cancel:()=>$('dlg').close(),
  else:()=>{offset++;$('v').innerHTML=nowView();$('v').querySelector('[data-action="else"]')?.focus();},
  'page-prev':()=>{page--;$('results').innerHTML=results();$('results').querySelector('button')?.focus();},
  'page-next':()=>{page++;$('results').innerHTML=results();$('results').querySelector('button')?.focus();},
  'money-more':()=>{moneyLimit+=30;render();},
  begin:(id,n)=>change(s=>{
    if (s.active?.id===id) return;
    if (s.active) M.stop(s,n);
    s.active={id,start:n,running:n,ms:0,cycle:M.openCycle(s)?.id??null};
  }),
  complete:(id,n)=>change(s=>M.complete(s,s.tasks.find(t=>t.id===id),n)),
  reopen:id=>change(s=>{const t=s.tasks.find(x=>x.id===id);t.status='open';t.done=null;}),
  archive:(id,n)=>change(s=>{if(s.active?.id===id) M.stop(s,n);s.tasks.find(t=>t.id===id).status='arch';}),
  delete:(id,n)=>{
    if (confirm('Delete this task permanently?')) return change(s=>{
      if (s.active?.id===id) M.stop(s,n);
      s.tasks=s.tasks.filter(t=>t.id!==id);
    });
  },
  later:id=>modal('Postpone task','later','<input type="hidden" name="id" value="'+esc(id)+'">'+
    numerical('Postpone for minutes','minutes',60,1,525600),'Postpone'),
  pause:(_,n)=>change(s=>{s.active.ms=M.elapsed(s.active,n);s.active.running=null;}),
  resume:(_,n)=>change(s=>{s.active.running=n;}),
  stop:(_,n)=>change(s=>M.stop(s,n)),
  correct:(_,n)=>modal('Correct focus duration','correct',
    numerical('Total minutes','minutes',+(M.elapsed(state.active,n)/M.minute).toFixed(2),0,1000000,'any')+
    field('Outcome note','note','','maxlength="500"'),'Save and stop'),
  'cycle-start':(_,n)=>change(s=>{s.cycles.push({id:M.id(),s:n,e:0});}),
  'cycle-end':(_,n)=>change(s=>{
    const c=M.openCycle(s);
    if(s.active?.cycle===c.id) M.stop(s,n);
    c.e=Math.max(c.s,n);
  }),
  wake:()=>modal('Correct wake time','wake',field('Wake time','wake',local(M.openCycle(state).s),'type="datetime-local" required')),
  log:(_,n)=>modal('Log activity','log',select('Activity','kind',names(['Meditation','Rest','Nap']),'Meditation')+
    numerical('Minutes','minutes',15,1,1440)+field('Ended at','end',local(n),'type="datetime-local" required')+
    field('Note','note','','maxlength="500"')),
  'money-edit':moneyEditor,
  receive:id=>change(s=>{s.money.find(m=>m.id===id).st='received';}),
  'money-delete':id=>{if(confirm('Delete this financial entry?')) return change(s=>{s.money=s.money.filter(x=>x.id!==id);});},
  theme:()=>change(s=>{s.theme=s.theme==='light'?'dark':'light';}),
  dimension:id=>modal(id?'Rename dimension':'Add dimension','dimension',
    '<input type="hidden" name="old" value="'+esc(id)+'">'+field('Name','name',id,'maxlength="80" required')),
  project:id=>{
    const p=state.projects.find(p=>p.id===id)??{title:'',goal:''};
    modal(id?'Edit project':'Add project','project','<input type="hidden" name="id" value="'+esc(id)+'">'+
      field('Project name','title',p.title,'maxlength="120" required')+
      '<label>Goal<textarea name="goal" maxlength="500">'+esc(p.goal)+'</textarea></label>');
  },
  'project-delete':id=>{
    if(confirm('Remove this project and clear its assignment on tasks?')) return change(s=>{
      const p=s.projects.find(p=>p.id===id);
      s.projects=s.projects.filter(p=>p.id!==id);
      for(const t of s.tasks) if(t.proj===p.title) t.proj='';
      if(s.ctx.focus===p.title) s.ctx.focus='';
    });
  },
  export:()=>download(state),
  recovery:async()=>{
    const value=await repo.recovery();
    if(value) showPreview('backup',value);
    else notice('No recovery copy is available.');
  },
  dismiss:()=>{preview=null;render();},
  merge:()=>restore(false),
  replace:()=>restore(true)
};
async function restore(replace) {
  if (!preview || !confirm(replace?'Replace this workspace with the previewed backup?':'Merge the previewed backup into this workspace?')) return;
  const incoming=preview.data;
  if(await change(s=>replace?incoming:M.merge(s,incoming),{backup:true,draw:false,message:'Restore saved.'})) {
    preview=null;
    render();
  }
}
const forms = {
  capture:(s,f)=>{s.tasks.push(M.task(f.get('title').trim(),s.dims[0]));},
  task:(s,f)=>{
    const id=f.get('id');
    const t=s.tasks.find(t=>t.id===id)||M.task('',s.dims[0]);
    for(const k of ['title','dim','proj','device','deadlineKind','rec','notes']) t[k]=f.get(k).trim();
    for(const k of ['est','energy','pri']) t[k]=Number(f.get(k));
    for(const k of ['start','deadline']) {
      const value=f.get(k);
      if(value!==local(t[k])) t[k]=value?parseLocal(value):0;
    }
    t.online=f.get('online')==='yes';
    t.actual=Math.round(Number(f.get('actual'))*M.minute);
    if(f.has('unsnooze')) t.snooze=0;
    t.subtasks=f.get('subtasks').split(/\r?\n/).map(x=>x.trim()).filter(Boolean)
      .map(x=>({title:x.replace(/^\[x\]\s+/i,''),done:/^\[x\]\s+/i.test(x)}));
    if(!id) s.tasks.push(t);
  },
  later:(s,f)=>{
    const t=s.tasks.find(t=>t.id===f.get('id'));
    t.snooze=Date.now()+Number(f.get('minutes'))*M.minute;
    t.pp=Math.min(1e9,t.pp+1);
  },
  correct:(s,f)=>{M.stop(s,Date.now(),Math.round(Number(f.get('minutes'))*M.minute),f.get('note').trim());},
  money:(s,f)=>{
    const id=f.get('id');
    const prior=s.money.find(m=>m.id===id);
    const type=f.get('type');
    const entry={id:id||M.id(),type,st:type==='out'?'received':f.get('st'),amt:Number(f.get('amt')),
      ts:prior&&f.get('ts')===local(prior.ts)?prior.ts:parseLocal(f.get('ts')),note:f.get('note').trim()};
    if(prior) Object.assign(prior,entry);
    else s.money.push(entry);
  },
  wake:(s,f)=>{
    const n=parseLocal(f.get('wake')), c=M.openCycle(s);
    if (n>Date.now()) throw Error('Wake time must be in the past.');
    const previous=s.cycles.filter(x=>x.e&&x.s<=c.s).reduce((end,x)=>Math.max(end,x.e),0);
    if (n<previous) throw Error('Wake time overlaps the previous cycle.');
    if (s.sessions.some(x=>x.cycle===c.id&&x.s<n)||s.active?.cycle===c.id&&s.active.start<n)
      throw Error('Wake time must precede the activity already associated with this cycle.');
    if (f.get('wake')!==local(c.s)) c.s=n;
  },
  log:(s,f)=>{
    const end=parseLocal(f.get('end')), ms=Number(f.get('minutes'))*M.minute;
    if(end>Date.now()) throw Error('Activity end must be in the past.');
    const start=end-ms;
    const cycle=[...s.cycles].sort((a,b)=>b.s-a.s).find(c=>c.s<=start&&(!c.e||c.e>=start));
    s.sessions.push({id:M.id(),tid:null,cycle:cycle?.id??null,dim:'',kind:f.get('kind'),s:start,e:end,ms,note:f.get('note').trim()});
  },
  dimension:(s,f)=>{
    const old=f.get('old'), name=f.get('name').trim();
    if (!old) {s.dims.push(name);return;}
    s.dims=s.dims.map(d=>d===old?name:d);
    for (const t of [...s.tasks,...s.sessions]) if(t.dim===old) t.dim=name;
    if(s.ctx.dim===old) s.ctx.dim=name;
  },
  project:(s,f)=>{
    const p=s.projects.find(p=>p.id===f.get('id'));
    const title=f.get('title').trim(), goal=f.get('goal').trim();
    if(!p) {s.projects.push({id:M.id(),title,goal});return;}
    for(const t of s.tasks) if(t.proj===p.title) t.proj=title;
    if(s.ctx.focus===p.title) s.ctx.focus=title;
    Object.assign(p,{title,goal});
  },
  'approve-plan':(s,f)=>{
    const picked=new Set(f.getAll('selected').map(Number)), projects=new Set(f.getAll('project'));
    const known=new Map(s.projects.map(p=>[p.title.toLowerCase(),p.title]));
    for(const p of preview.data.projects) {
      const key=p.title.toLowerCase();
      if(projects.has(p.id)&&!known.has(key)) {s.projects.push(p);known.set(key,p.title);}
    }
    const keys=new Set(s.tasks.map(M.key));
    for(const [i,{t,duplicate}] of preview.data.tasks.entries()) {
      if(!picked.has(i)||duplicate) continue;
      const row={...t,proj:known.get(t.proj.toLowerCase())??t.proj};
      const key=M.key(row);
      if(!keys.has(key)) {s.tasks.push(row);keys.add(key);}
    }
  }
};
document.addEventListener('click',async e=>{
  const button=e.target.closest('button[data-action]');
  if(!button||busy||!state) return;
  if (e.isTrusted) requestPersistence();
  try {await act[button.dataset.action]?.(button.dataset.id,Date.now());}
  catch(error) {notice(error.message);}
});
document.addEventListener('submit',async e=>{
  const form=e.target, kind=form.dataset.form;
  if(!kind) return;
  e.preventDefault();
  if (busy) return;
  if (e.isTrusted) requestPersistence();
  const data=new FormData(form);
  if(kind==='plan') {
    try {showPreview('plan',JSON.parse(data.get('json')));}
    catch(error) {notice('Plan rejected. '+error.message);}
    return;
  }
  if (!forms[kind]) return;
  const isModal=$('dlg').contains(form);
  const saved=await change(s=>forms[kind](s,data),{draw:false,message:kind==='capture'?'Task added.':'Saved.'});
  if(saved) {
    if(isModal) $('dlg').close();
    if(kind==='approve-plan') preview=null;
    if(kind==='task'||kind==='capture') offset=0;
    render();
    if(kind==='capture') $('v').querySelector('[data-form="capture"] input')?.focus();
  }
});
document.addEventListener('input',e=>{
  if(e.target.id!=='search') return;
  query=e.target.value;page=0;
  clearTimeout(debounce);
  debounce=setTimeout(()=>{if($('results')) $('results').innerHTML=results();},150);
});
document.addEventListener('change',async e=>{
  const el=e.target;
  if(el.name==='filter') {filter=el.value;page=0;$('results').innerHTML=results();return;}
  if(el.form?.dataset.form==='context') {
    const key=el.name, value=el.value;
    offset=0;
    const saved=await change(s=>{s.ctx[key]=['time','energy'].includes(key)?Number(value):key==='online'?value==='yes':value;});
    if(!saved&&!busy) render();
    $('v').querySelector('[name="'+key+'"]')?.focus();
    return;
  }
  if(!['backup-file','plan-file'].includes(el.id)||!el.files[0]) return;
  try {
    const file=el.files[0];
    if(file.size>50*1024*1024) throw Error('File is larger than 50 MB.');
    const value=JSON.parse(await file.text());
    if(view==='data') showPreview(el.id==='backup-file'?'backup':'plan',value);
  } catch(error) {notice('Import rejected. '+error.message);}
  finally {el.value='';}
});
function navigate() {
  const key=location.hash.slice(1);
  if(key==='v') return;
  view=labels.some(([x])=>x===key)?key:'now';
  offset=0;
  if(state) {render();$('v').focus();}
}
document.addEventListener('keydown',e=>{
  if(!state?.onboarded||$('dlg').open||e.ctrlKey||e.metaKey||e.altKey||
      e.target.closest('input,select,textarea,[contenteditable]')) return;
  if(e.key.toLowerCase()==='n') {
    e.preventDefault();
    taskEditor('');
  }
  if(e.key==='/'&&view==='tasks') {
    e.preventDefault();
    $('search').focus();
  }
});
window.addEventListener('hashchange',navigate);
document.addEventListener('visibilitychange',updateTimer);
window.addEventListener('pageshow',updateTimer);
async function start() {
  try {
    repo=await Repository.open();
    state=repo.state;
    navigate();
    if(!$('v').querySelector('h1')) render();
  } catch(error) {
    notice('Persistent storage could not be opened. Your records were left in place. '+error.message,true);
    $('v').textContent='Use the original browser profile and site address, then reload. If legacy data is invalid, preserve its localStorage value before attempting recovery.';
  }
  if('serviceWorker' in navigator && isSecureContext) {
    navigator.serviceWorker.register('sw.js').catch(()=>notice('Offline installation is currently unavailable.'));
  }
}
start();
