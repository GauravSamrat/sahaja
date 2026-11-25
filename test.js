'use strict';
const test=require('node:test');
const a=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const M=require('./model');
const R=require('./repository');
const now=Date.parse('2026-11-25T22:00:00+05:30');
const base=()=>M.empty();
const make=(o={})=>({...M.task('Task','Earn',now),est:20,...o});
const ctx=(o={})=>({...base().ctx,...o});
const rank=(rows,c={})=>M.rank(rows,now,ctx(c)).map(x=>x.t.id);
test('each hard constraint excludes an incompatible candidate',()=>{
  for(const [task,c] of [
    [{status:'done'},{}],[{status:'arch'},{}],[{snooze:now+1},{}],[{start:now+1},{}],[{dueRec:now+1},{}],
    [{est:31},{}],[{est:0},{}],[{energy:3},{energy:1}],[{energy:2},{mode:'Recovery'}],
    [{device:'phone'},{device:'computer'}],[{online:true},{online:false}],[{dim:'Rest'},{dim:'Earn'}]
  ]) a.deepEqual(rank([make(task)],c),[],JSON.stringify(task));
  a.equal(rank([make({est:0,device:'phone',energy:1})],{time:0,device:'both',mode:'Recovery'}).length,1);
});
test('eligibility is inclusive at the exact time boundary',()=>{
  a.equal(rank([make({dueRec:now,start:now,snooze:now,est:30})]).length,1);
});
test('urgency, time fit, project and goal factors change order',()=>{
  a.deepEqual(rank([make({id:'a'}),make({id:'b',deadline:now-1})]),['b','a']);
  a.deepEqual(rank([make({id:'a',est:10}),make({id:'b',est:25})]),['b','a']);
  a.deepEqual(rank([make({id:'a'}),make({id:'b',proj:'P'})],{goals:new Set(['P']),focus:'P'}),['b','a']);
});
test('ties use creation time then stable ID',()=>{
  const x=make({id:'b'}), y=make({id:'a'});
  a.deepEqual(rank([x,y]),['a','b']);
  a.deepEqual(rank([y,x]),['a','b']);
  a.deepEqual(rank([y,{...x,created:now-1}]),['b','a']);
});
test('starvation rises and stays bounded',()=>{
  const score=pp=>M.rank([make({pp})],now,ctx())[0].sc;
  a.ok(score(5)>score(0));
  a.equal(score(1000),score(100000));
});
test('daily and weekly recurrence boundaries and flexible deadlines',()=>{
  for(const [rec,days] of [['daily',1],['weekly',7]]) {
    const t=make({rec,deadline:now+M.minute,deadlineKind:'flexible'});
    const next=M.occurrence(t,now);
    a.equal(next.dueRec,now+days*M.day);
    a.equal(next.deadline,t.deadline+days*M.day);
    a.equal(M.rank([next],next.dueRec-1,ctx()).length,0);
    a.equal(M.rank([next],next.dueRec,ctx()).length,1);
    a.equal(M.occurrence(next,next.dueRec+days*M.day).dueRec,next.dueRec+2*days*M.day);
  }
  a.equal(M.occurrence(make(),now),null);
});
test('external deadline stays intact and reopening cannot spawn duplicates',()=>{
  const t=make({rec:'daily',deadline:now+2000}),s={...base(),tasks:[t]};
  M.complete(s,t,now);
  a.equal(t.deadline,now+2000);
  a.equal(s.tasks[1].deadline,0);
  t.status='open'; t.done=null;
  M.complete(s,t,now+10);
  a.equal(s.tasks.length,2);
});
test('timestamp timer survives midnight, pause, reload and backwards clock changes',()=>{
  const t=make(), s={...base(),tasks:[t],cycles:[{id:'night',s:now,e:0}]};
  s.active={id:t.id,start:now,running:now,ms:0,cycle:'night'};
  const pause=now+4*60*M.minute;
  s.active.ms=M.elapsed(s.active,pause);
  s.active.running=null;
  a.equal(M.elapsed(s.active,pause+1000),4*60*M.minute);
  s.active.running=pause+1000;
  s.active=JSON.parse(JSON.stringify(s.active));
  a.equal(M.elapsed(s.active,pause),4*60*M.minute);
  a.equal(M.elapsed(s.active,pause+1000+M.minute),241*M.minute);
  M.stop(s,pause+2000,7*M.minute);
  a.equal(s.active,null);
  a.equal(t.actual,7*M.minute);
  a.equal(s.sessions[0].cycle,'night');
  a.equal(s.sessions[0].ms,7*M.minute);
  M.validate(s);
});
test('strict backup rejects malformed nested data and duplicate IDs',()=>{
  const s={...base(),tasks:[make()]};
  a.equal(M.validate(s),s);
  a.throws(()=>M.validate({...s,tasks:[...s.tasks,...s.tasks]}),/duplicate/);
  a.throws(()=>M.validate({...s,tasks:[make({subtasks:[{title:'T',done:'yes'}]})]}));
  a.throws(()=>M.validate({...s,sessions:[{id:'q',s:now,e:now,ms:-1}]}));
  a.throws(()=>M.validate({...s,active:{id:'missing',start:now,running:now,ms:0,cycle:null}}));
  a.throws(()=>M.validate({...s,v:99}));
  a.throws(()=>M.validate(null));
});
test('rejects invalid money',()=>{
  for(const amt of [0,-1,Infinity,NaN,'15']) {
    a.throws(()=>M.validate({...base(),money:[{id:'a',ts:now,amt,type:'in',st:'pending',note:''}]}),/financial/);
  }
});
test('migration preserves legacy records and fixes identifiable recurrence boundaries',()=>{
  const parent={id:'a',title:'Legacy',created:now-100,deadline:now+100,rec:'daily',status:'open'};
  const child={...parent,id:'ar'+now.toString(36),created:now,start:now+M.day/2};
  const old={v:1,dims:['Earn'],tasks:[parent,child],sessions:[],cycles:[{s:now-100,e:0}],money:[],
    active:{id:'a',start:now,paused:0,pa:null},ctx:{energy:2,time:30,dim:'any',device:'any'}};
  const s=M.upgrade(old);
  a.equal(s.tasks.length,2);
  a.equal(s.tasks[0].deadline,parent.deadline);
  a.equal(s.tasks[0].nextMade,true);
  a.equal(s.tasks[1].start,0);
  a.equal(s.tasks[1].dueRec,now+M.day);
  a.equal(s.active.cycle,String(now-100));
});
test('plan preview is strict, side-effect free and marks duplicates',()=>{
  const s={...base(),tasks:[make()]};
  const input={format:'sahaja-plan',version:1,projects:[{title:'P',goal:'G'}],
    tasks:[{title:'Task',dim:'earn'},{title:'Fresh',project:'P',deadline:'2026-11-25T22:30:00+05:30'}]};
  const p=M.plan(input,s,now);
  a.deepEqual(p.tasks.map(x=>x.duplicate),[true,false]);
  a.equal(p.tasks[1].t.deadline,now+30*M.minute);
  a.equal(s.tasks.length,1);
  a.throws(()=>M.plan({...input,tasks:[{title:'x',energy:9}]},s));
  a.throws(()=>M.plan({...input,tasks:[{title:'x',deadline:'2026-01-01T12:00'}]},s));
  a.throws(()=>M.plan({...input,tasks:[{title:'x',deadline:'2026-02-30T12:00:00Z'}]},s));
});
test('merge preserves current records on collision, remaps dimensions and handles active cycles',()=>{
  const current={...base(),tasks:[make({id:'same',title:'Keep'})],cycles:[{id:'a',s:now,e:0}]};
  const incoming={...base(),dims:['earn'],tasks:[make({id:'same',title:'Other',dim:'earn'}),
    make({id:'new',dim:'earn'})],cycles:[{id:'b',s:now-1,e:0}]};
  const result=M.merge(current,incoming);
  a.deepEqual(result.tasks.map(t=>[t.title,t.dim]),[['Keep','Earn'],['Task','Earn']]);
  a.equal(result.cycles.find(c=>c.id==='b').e,now-1);
  a.equal(current.tasks.length,1);
});
test('unavailable storage rejects startup explicitly',async()=>{
  await a.rejects(R.open(null),/unavailable/);
});
test('activity partitions recorded time and counts completions without inventing duration',()=>{
  const midnight=new Date(2026,10,25).getTime(), end=midnight+2*M.minute;
  const t=make({id:'task',title:'Current title',proj:'Current project',est:25,actual:500*M.minute,done:end,status:'done'});
  const untracked=make({id:'untracked',done:end,status:'done'});
  const cycle={id:'cycle',s:midnight-4*M.minute,e:0};
  const entry={id:'focus',tid:t.id,cycle:cycle.id,dim:'Earn',kind:'Focus',
    s:midnight-M.minute,e:midnight+M.minute,ms:60001,title:'Earlier title',project:'Earlier project',estimate:30};
  const rest={id:'rest',tid:null,cycle:cycle.id,dim:'',kind:'Rest',s:end,e:end,ms:M.minute};
  const s={...base(),tasks:[t,untracked],cycles:[cycle],sessions:[entry,rest]};
  M.validate(s);
  const today=M.activity(s,'today',end);
  a.equal(today.total,90001);
  a.equal(today.completed,2);
  a.equal(today.tasks.length,1);
  a.equal(today.tasks[0].title,'Earlier title');
  a.equal(today.tasks[0].estimate,30);
  a.deepEqual(today.projects,[{title:'Earlier project',ms:30001}]);
  a.deepEqual(today.dimensions,[{title:'Earn',ms:30001}]);
  a.equal(today.kinds.find(k=>k.title==='Rest').ms,M.minute);
  a.equal(M.activity(s,'cycle',end).total,120001);
  a.equal(M.activity(s,'all',end).total,120001);
  a.equal(M.activity(s,'week',end).total,120001);
  a.equal(M.activity(s,'month',end).total,120001);
  a.equal(M.activity({...s,cycles:[{...cycle,e:end}]},'cycle',end).history.length,0);
});
test('session correction replaces duration and backup merge keeps a single record',()=>{
  const t=make({actual:10*M.minute}), s={...base(),tasks:[t],
    active:{id:t.id,start:now,running:now,ms:0,cycle:null}};
  M.stop(s,now+M.minute);
  const original=structuredClone(s);
  M.correctSession(s,s.sessions[0].id,2*M.minute);
  M.correctSession(s,s.sessions[0].id,2*M.minute);
  a.equal(t.actual,12*M.minute);
  const backup=M.upgrade(JSON.parse(JSON.stringify(s)));
  a.equal(backup.sessions[0].ms,2*M.minute);
  a.equal(M.merge(backup,original).sessions.length,1);
});
test('generated prompt includes a valid interchangeable example and the workspace dimensions',()=>{
  const s={...base(),dims:['Other & Learning']};
  const text=M.planPrompt('Build a portfolio',s.dims);
  a.match(text,/Build a portfolio/);
  a.match(text,/Other & Learning/);
  const example=JSON.parse(text.split('Valid example:\n')[1]);
  const preview=M.plan(example,s,now);
  a.equal(preview.tasks[0].t.dim,s.dims[0]);
  a.equal(preview.projects[0].title,'Portfolio');
  a.equal(s.tasks.length,0);
});
for(const n of [100,1000,10000]) {
  test('rank '+n+' tasks',()=>{
    const tasks=Array.from({length:n},(_,i)=>make({id:String(i),est:5+i%60,pp:i%4}));
    for(let i=0;i<3;i++) M.rank(tasks,now,ctx());
    const times=[];
    for(let i=0;i<20;i++) {
      const start=performance.now();
      const result=M.rank(tasks,now,ctx());
      times.push(performance.now()-start);
      a.equal(result.length,3);
      a.ok(result.every(x=>x.t.est<=30));
    }
    times.sort((a,b)=>a-b);
    console.log(n+' tasks, median '+((times[9]+times[10])/2).toFixed(3)+' ms, p95 '+times[18].toFixed(3)+' ms');
  });
}
