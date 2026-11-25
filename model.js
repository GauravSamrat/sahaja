'use strict';
const Model = (() => {
  const day = 86400000, minute = 60000;
  const collections = ['tasks', 'cycles', 'sessions', 'money', 'projects'];
  const dimensions = ['Earn', 'Create', 'Learn', 'Manage', 'Being', 'Rest'];
  const modes = ['Free Flow', 'Focus Sprint', 'Recovery', 'Deadline Priority'];
  const id = () => crypto.randomUUID();
  const empty = () => ({
    v: 2, dims: [...dimensions], tasks: [], cycles: [], sessions: [], money: [], projects: [],
    active: null, theme: null, onboarded: false,
    ctx: {energy: 2, time: 30, dim: '', device: 'computer', online: true, mode: modes[0], focus: ''}
  });
  const task = (title, dim, now = Date.now()) => ({
    id: id(), title, dim, created: now, status: 'open', est: 0, energy: 2, pri: 2,
    actual: 0, device: 'any', online: false, proj: '', notes: '', subtasks: [],
    deadline: 0, deadlineKind: 'external', start: 0, snooze: 0, dueRec: 0,
    rec: '', nextMade: false, done: null, pp: 0
  });
  const openCycle = s => s.cycles.find(c => !c.e);
  function rank(tasks, now, ctx, limit = 3) {
    const weights = {
      'Free Flow': [.30,.25,.20,.15],
      'Focus Sprint': [.22,.22,.14,.32],
      'Recovery': [.18,.17,.42,.15],
      'Deadline Priority': [.57,.18,.10,.08]
    }[ctx.mode || modes[0]];
    const results = [];
    for (const t of tasks) {
      if (t.status !== 'open' || Math.max(t.start || 0, t.snooze || 0, t.dueRec || 0) > now ||
          (ctx.time && (!t.est || t.est > ctx.time)) || (ctx.dim && t.dim !== ctx.dim) ||
          (t.device && t.device !== 'any' && !['both', t.device].includes(ctx.device)) ||
          (t.online && !ctx.online) || (t.energy || 2) > Math.min(ctx.energy, ctx.mode === 'Recovery' ? 1 : 3)) continue;
      const urgency = t.deadline ? 1 / (1 + Math.max(0, t.deadline - now) / day) : 0;
      const priority = ((t.pri || 2) - 1) / 2;
      const energy = ctx.mode === 'Recovery' ? 1 : 1 - Math.abs((t.energy || 2) - ctx.energy) / 2;
      const fit = ctx.time ? t.est / ctx.time : .5;
      const goal = !!ctx.goals?.has(t.proj);
      const focus = !!ctx.focus && t.proj === ctx.focus;
      const age = Math.max(0, now - t.created);
      const wait = Math.min(.12, (t.pp || 0) * .02 + age / (60 * day) * .05);
      const why = [t.est ? 'Estimated at ' + t.est + ' min' : 'Open time allows an unestimated task'];
      if (urgency >= .5) why.push(t.deadline <= now ? 'deadline reached' : 'due within a day');
      if (priority === 1) why.push('high priority');
      if (energy === 1) why.push('matches your energy');
      if (goal) why.push('supports a project goal');
      if (focus) why.push('matches your project focus');
      if (wait >= .06) why.push('has been waiting');
      results.push({t, sc: urgency*weights[0] + priority*weights[1] + energy*weights[2] +
        fit*weights[3] + wait + .08*goal + .13*focus, why: why.join(' · ')});
    }
    return results.sort((a,b) => b.sc-a.sc || a.t.created-b.t.created ||
      (a.t.id < b.t.id ? -1 : Number(a.t.id !== b.t.id))).slice(0,limit);
  }
  function occurrence(t, now) {
    if (!t.rec || t.nextMade) return null;
    const interval = t.rec === 'daily' ? day : 7*day;
    const anchor = t.dueRec || now;
    const advance = (Math.max(0, Math.floor((now-anchor)/interval)) + 1)*interval;
    return {...t, id: id(), status:'open', done:null, actual:0, pp:0, snooze:0,
      start:0, dueRec:anchor+advance, created:now, nextMade:false,
      deadline:t.deadlineKind === 'flexible' && t.deadline ? t.deadline+advance : 0,
      subtasks:t.subtasks.map(x => ({...x, done:false}))};
  }
  const elapsed = (a,n) => a.ms + (a.running === null ? 0 : Math.max(0,n-a.running));
  function stop(s, now, correction, note='') {
    const a = s.active;
    if (!a) return;
    const t = s.tasks.find(x => x.id === a.id);
    const ms = correction ?? elapsed(a, now);
    const end = Math.max(now, a.start);
    if (t) t.actual += ms;
    s.sessions.push({id:id(), tid:a.id, cycle:a.cycle, dim:t?.dim ?? '', kind:'Focus', s:a.start, e:end, ms, note});
    s.active = null;
  }
  function complete(s, t, now) {
    if (t.status !== 'open') return;
    if (s.active?.id === t.id) stop(s,now);
    const next = occurrence(t,now);
    t.status = 'done';
    t.done = now;
    if (next) {
      t.nextMade = true;
      s.tasks.push(next);
    }
  }
  const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const string = (x,n=200) => typeof x === 'string' && x.length <= n;
  const name = (x,n) => string(x,n) && x.trim().length > 0;
  const integer = (x,min,max) => Number.isSafeInteger(x) && x>=min && x<=max;
  const stamp = x => integer(x,0,8640000000000000);
  const ref = x => x === null || name(x);
  const device = x => ['any','phone','computer'].includes(x);
  const unique = xs => new Set(xs).size === xs.length;
  function validate(s) {
    if (!record(s) || s.v !== 2 || !Array.isArray(s.dims) || !s.dims.length ||
        !s.dims.every(x => name(x,80)) || !unique(s.dims.map(x=>x.toLowerCase()))) throw Error('Invalid version or dimensions.');
    for (const k of collections) {
      if (!Array.isArray(s[k]) || !s[k].every(x => record(x) && name(x.id)) ||
          !unique(s[k].map(x=>x.id))) throw Error('Invalid records or duplicate IDs in '+k+'.');
    }
    const dims = new Set(s.dims);
    const tasks = new Map(s.tasks.map(t=>[t.id,t]));
    const cycles = new Set(s.cycles.map(c=>c.id));
    const cycleRef = x => x === null || cycles.has(x);
    const c = s.ctx;
    if (!record(c) || !integer(c.energy,1,3) || !integer(c.time,0,1440) ||
        !(c.dim === '' || dims.has(c.dim)) || !['both','phone','computer'].includes(c.device) ||
        typeof c.online !== 'boolean' || !modes.includes(c.mode) || !string(c.focus,120) ||
        ![null,'dark','light'].includes(s.theme) || typeof s.onboarded !== 'boolean') throw Error('Invalid settings.');
    if (!s.projects.every(p=>name(p.title,120)&&string(p.goal,500)) ||
        !unique(s.projects.map(p=>p.title.toLowerCase()))) throw Error('Invalid or duplicate projects.');
    if (!s.tasks.every(t => name(t.title) && dims.has(t.dim) && ['open','done','arch'].includes(t.status) &&
        integer(t.est,0,1440) && integer(t.energy,1,3) && integer(t.pri,1,3) && stamp(t.actual) &&
        device(t.device) && typeof t.online === 'boolean' && string(t.proj,120) && string(t.notes,4000) &&
        [t.created,t.deadline,t.start,t.snooze,t.dueRec].every(stamp) &&
        ['external','flexible'].includes(t.deadlineKind) && ['','daily','weekly'].includes(t.rec) &&
        typeof t.nextMade === 'boolean' && (t.done===null || stamp(t.done)) && integer(t.pp,0,1e9) &&
        Array.isArray(t.subtasks) && t.subtasks.length<=50 &&
        t.subtasks.every(x=>record(x)&&name(x.title)&&typeof x.done==='boolean'))) throw Error('Invalid task fields.');
    if (!s.cycles.every(x=>stamp(x.s)&&stamp(x.e)&&(!x.e||x.e>=x.s)) ||
        s.cycles.filter(x=>!x.e).length>1) throw Error('Invalid cycles.');
    if (!s.sessions.every(x=>stamp(x.s)&&stamp(x.e)&&x.e>=x.s&&stamp(x.ms)&&ref(x.tid)&&
        cycleRef(x.cycle)&&string(x.dim,80)&&['Focus','Meditation','Rest','Nap'].includes(x.kind)&&
        (x.note===undefined||string(x.note,4000)))) throw Error('Invalid sessions.');
    if (!s.money.every(x=>stamp(x.ts)&&Number.isFinite(x.amt)&&x.amt>0&&x.amt<=1e12&&
        ['in','out'].includes(x.type)&&['received','pending'].includes(x.st)&&string(x.note,500))) throw Error('Invalid financial entries.');
    const a = s.active;
    if (a!==null && (!record(a)||tasks.get(a.id)?.status!=='open'||!stamp(a.start)||
        !cycleRef(a.cycle)||!stamp(a.ms)||(a.running!==null&&!stamp(a.running)))) throw Error('Invalid active timer.');
    return s;
  }
  function upgrade(old) {
    if (!record(old) || old.v!==1) return validate(old);
    for (const key of ['dims','tasks','cycles','sessions','money']) {
      if (!Array.isArray(old[key])) throw Error('Legacy backup is missing '+key+'.');
    }
    const s = empty();
    s.onboarded = true;
    function dimension(d) {
      const title = d || s.dims[0];
      const existing = s.dims.find(x=>x.toLowerCase()===String(title).toLowerCase());
      if (existing) return existing;
      s.dims.push(title);
      return title;
    }
    if (old.dims.length) s.dims = [];
    for (const d of old.dims) {
      if (!name(d,80)) throw Error('Invalid legacy dimension.');
      dimension(d);
    }
    s.cycles = old.cycles.map(c=>({...c,id:String(c.s)}));
    const association = n => [...s.cycles].reverse().find(c=>c.s<=n&&(!c.e||c.e>=n))?.id ?? null;
    const oldTasks = new Map(old.tasks.map(t=>[t.id,t]));
    const predecessors = new Map();
    for (const t of old.tasks) {
      if (typeof t.id!=='string'||!Number.isSafeInteger(t.created)) continue;
      const suffix='r'+t.created.toString(36);
      const p=t.id.endsWith(suffix) && oldTasks.get(t.id.slice(0,-suffix.length));
      if (p?.rec) predecessors.set(t.id,p.id);
    }
    const alreadyGenerated=new Set(predecessors.values());
    s.tasks = old.tasks.map(t=>{
      const p=oldTasks.get(predecessors.get(t.id));
      const prior=p && t.start===t.created+(p.rec==='weekly'?5*day:day/2);
      return {...task(t.title,dimension(t.dim),t.created??0),...t,dim:dimension(t.dim),
        start:prior?0:t.start??0, dueRec:prior?t.created+(t.rec==='weekly'?7*day:day):0,
        nextMade:alreadyGenerated.has(t.id)||!!t.rec&&t.status!=='open'};
    });
    s.sessions = old.sessions.map(x=>({...x,e:Math.max(x.e,x.s),ms:Math.max(0,x.ms),
      dim:x.dim?dimension(x.dim):'',cycle:association(x.s),kind:'Focus'}));
    s.money = old.money;
    s.theme = old.theme ?? null;
    if (old.ctx) {
      const {dim,device:dev,...rest}=old.ctx;
      s.ctx={...s.ctx,...rest,dim:!dim||dim==='any'?'':dimension(dim),device:!dev||dev==='any'?'both':dev};
    }
    if (old.active) {
      const a=old.active;
      const t=s.tasks.find(t=>t.id===a.id);
      if (!stamp(a.start)||!stamp(a.paused)||(a.pa!=null&&!stamp(a.pa))) throw Error('Invalid legacy timer.');
      if (t?.status==='open') s.active={id:a.id,start:a.start,cycle:association(a.start),
        ms:a.pa==null?0:Math.max(0,a.pa-a.start-a.paused),running:a.pa==null?Math.max(0,a.start+a.paused):null};
      else s.sessions.push({id:id(),tid:a.id,cycle:association(a.start),dim:t?.dim??'',kind:'Focus',
        s:a.start,e:Math.max(a.start,a.pa??Date.now()),ms:Math.max(0,(a.pa??Date.now())-a.start-a.paused)});
    }
    return validate(s);
  }
  function merge(current, incoming) {
    const result = structuredClone(current);
    const dimMap = new Map(incoming.dims.map(d=>{
      const match=result.dims.find(x=>x.toLowerCase()===d.toLowerCase());
      if (!match) result.dims.push(d);
      return [d,match||d];
    }));
    const projectMap = new Map(incoming.projects.map(p=>[p.title,
      result.projects.find(x=>x.id===p.id||x.title.toLowerCase()===p.title.toLowerCase())?.title||p.title]));
    const remappedCycles = new Map();
    for (const k of collections) {
      const ids = new Set(result[k].map(x=>x.id));
      for (const item of incoming[k]) {
        if (ids.has(item.id)) continue;
        let x = {...item};
        if (k==='projects' && projectMap.get(x.title)!==x.title ||
            k==='projects' && result.projects.some(p=>p.title===x.title)) continue;
        if (k==='cycles' && !x.e && openCycle(result)) {
          x.e = Math.max(x.s, ...incoming.sessions.filter(q=>q.cycle===x.id).map(q=>q.e));
          if (!x.e) { remappedCycles.set(x.id,null); continue; }
        }
        if (k==='tasks') x.proj=projectMap.get(x.proj)??x.proj;
        if (k==='tasks'||k==='sessions') x.dim=dimMap.get(x.dim)??x.dim;
        if (k==='sessions'&&remappedCycles.has(x.cycle)) x.cycle=remappedCycles.get(x.cycle);
        result[k].push(x);
      }
    }
    if (incoming.active && !result.active && result.tasks.find(t=>t.id===incoming.active.id)?.status==='open') {
      result.active={...incoming.active};
    } else if (incoming.active && result.active?.id!==incoming.active.id) {
      const partial={...result,active:{...incoming.active}};
      stop(partial,Date.now());
    }
    result.onboarded ||= incoming.onboarded;
    return validate(result);
  }
  const key = t => JSON.stringify([t.title.trim().toLowerCase(),t.dim.toLowerCase(),t.proj.toLowerCase()]);
  function planTime(value, field) {
    const iso = typeof value==='string' && /^(\d{4})-(\d\d)-(\d\d)T\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.exec(value);
    if (!iso) throw Error('Use an ISO timestamp with a timezone for '+field+'.');
    const calendar = new Date(iso[1]+'-'+iso[2]+'-01T00:00:00Z');
    calendar.setUTCDate(Number(iso[3]));
    const parsed = Date.parse(value);
    if (!stamp(parsed)||calendar.getUTCMonth()+1!==Number(iso[2])||!Number(iso[3])||value.slice(11,13)==='24')
      throw Error('Invalid '+field+' timestamp.');
    return parsed;
  }
  function plan(input,s,now=Date.now()) {
    if (!record(input)||input.format!=='sahaja-plan'||input.version!==1||
        !Array.isArray(input.tasks)||input.tasks.length>10000||
        (input.projects!==undefined&&!Array.isArray(input.projects))) throw Error('Expected a version 1 sahaja-plan.');
    const projects=(input.projects??[]).map(p=>{
      if (!record(p)||!name(p.title,120)||!string(p.goal??'',500)) throw Error('Invalid plan project.');
      return {id:id(),title:p.title.trim(),goal:p.goal??''};
    });
    if (!unique(projects.map(p=>p.title.toLowerCase()))) throw Error('Duplicate plan projects.');
    const seen=new Set(s.tasks.map(key));
    const tasks=input.tasks.map(x=>{
      if (!record(x)||!name(x.title)) throw Error('Invalid plan task title.');
      const t=task(x.title.trim(),s.dims[0],now);
      for (const k of ['est','energy','device','online','notes','rec','deadlineKind','subtasks']) {
        if (Object.hasOwn(x,k)) t[k]=x[k];
      }
      if (Object.hasOwn(x,'priority')) t.pri=x.priority;
      if (Object.hasOwn(x,'dim')) {
        if (!name(x.dim,80)) throw Error('Invalid plan dimension.');
        t.dim=s.dims.find(d=>d.toLowerCase()===x.dim.toLowerCase());
      }
      if (Object.hasOwn(x,'project')) t.proj=x.project;
      for (const k of ['deadline','start']) {
        if (!Object.hasOwn(x,k)) continue;
        t[k]=planTime(x[k],k);
      }
      return t;
    });
    validate({...s,tasks});
    return {projects,tasks:tasks.map(t=>{
      const duplicate=seen.has(key(t));
      seen.add(key(t));
      return {t,duplicate};
    })};
  }
  return {empty,task,id,rank,occurrence,elapsed,stop,complete,openCycle,validate,upgrade,merge,plan,key,collections,modes,minute,day};
})();
if (typeof module !== 'undefined') module.exports = Model;
