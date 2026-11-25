'use strict';
const a=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'sahaja-test-'));
const candidates=[
  process.env.SAHAJA_BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium','/usr/bin/google-chrome'
];
const executable=candidates.find(p=>p&&fs.existsSync(p));
if (!executable) throw Error('Set SAHAJA_BROWSER to the Chrome or Edge executable.');
const server=spawn(process.execPath,[path.join(__dirname,'server.js')],{
  env:{...process.env,SAHAJA_PORT:'0',SAHAJA_BASE_PATH:'/sahaja/'},stdio:['ignore','pipe','inherit']
});
const pending=new Map(), exceptions=[];
let browser,session,id=0;
function send(method,params={},useSession=true) {
  const key=++id;
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{pending.delete(key);reject(Error(method+' timed out'));},8000);
    pending.set(key,m=>{clearTimeout(timeout);m.error?reject(Error(m.error.message)):resolve(m.result);});
    browser.stdio[3].write(JSON.stringify({id:key,method,params,...(session&&useSession?{sessionId:session}:{})})+'\0');
  });
}
async function evaluate(expression) {
  const {result,exceptionDetails}=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(exceptionDetails) throw Error(result.description||exceptionDetails.text);
  return result.value;
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expr) {
  for(let i=0;i<100;i++) {
    try {if(await evaluate(expr)) return;} catch {}
    await delay(60);
  }
  throw Error('Timed out waiting for '+expr+'\n'+await evaluate('document.body.innerText'));
}
const click=selector=>evaluate('document.querySelector('+JSON.stringify(selector)+').click()');
const action=(name)=>click('[data-action="'+name+'"]');
const go=async(name,heading)=>{
  await evaluate('location.hash='+JSON.stringify(name));
  await wait('document.querySelector("h1")?.textContent==='+JSON.stringify(heading));
};
async function submit(kind,values) {
  await evaluate('(() => {const form=document.querySelector(\'[data-form="'+kind+'"]\');const values='+
    JSON.stringify(values)+';for(const [key,value] of Object.entries(values)) form.elements[key].value=value;form.requestSubmit();})()');
}
async function reload() {
  await send('Page.reload');
  await delay(200);
  await wait('typeof state !== "undefined" && state && document.querySelector("main h1")');
}
async function run() {
  const url=await new Promise((resolve,reject)=>{
    server.on('error',reject);
    server.on('exit',code=>reject(Error('Server exited '+code)));
    server.stdout.on('data',b=>{
      const found=String(b).match(/http:\/\/localhost:\d+\/sahaja\//);
      if(found) resolve(found[0]);
    });
  });
  browser=spawn(executable,['--headless=new','--disable-gpu','--remote-debugging-pipe','--no-first-run',
    '--disable-background-networking','--user-data-dir='+root,'about:blank'],
    {stdio:['ignore','ignore','inherit','pipe','pipe'],windowsHide:true});
  let buffer='';
  browser.stdio[4].setEncoding('utf8');
  browser.stdio[4].on('data',chunk=>{
    buffer+=chunk;
    let end;
    while((end=buffer.indexOf('\0'))!==-1) {
      const m=JSON.parse(buffer.slice(0,end));
      buffer=buffer.slice(end+1);
      if(m.id) {pending.get(m.id)?.(m);pending.delete(m.id);}
      if(m.method==='Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.text);
    }
  });
  browser.stdio[3].on('error',()=>{});
  const {targetId}=await send('Target.createTarget',{url:'about:blank'});
  ({sessionId:session}=await send('Target.attachToTarget',{targetId,flatten:true}));
  for(const domain of ['Page','Runtime','Network']) await send(domain+'.enable');
  await send('Page.navigate',{url});
  await wait('document.querySelector("[data-action=empty]")');
  await action('empty');
  await wait('document.querySelector("h1")?.textContent==="Right now"');
  await action('cycle-start');
  await wait('document.querySelector("[data-action=cycle-end]")');
  await submit('capture',{title:'Write release notes'});
  await wait('state.tasks.length===1');
  await go('tasks','Tasks');
  await click('#results [data-action=edit]');
  await submit('task',{est:15,energy:1,rec:'daily',notes:'Complete the test record'});
  await wait('!document.querySelector("dialog").open && state.tasks[0].est===15');
  await go('now','Right now');
  await action('begin');
  await wait('state.active !== null');
  await action('pause');
  await wait('state.active.running===null');
  await reload();
  a.equal(await evaluate('state.active.running'),null);
  await action('resume');
  await wait('state.active.running!==null');
  await action('correct');
  await submit('correct',{minutes:7});
  await wait('state.active===null && state.sessions[0].ms===420000');
  a.equal(await evaluate('state.sessions[0].cycle===state.cycles[0].id'),true);
  await action('complete');
  await wait('state.tasks.length===2');
  await go('tasks','Tasks');
  await evaluate('(()=>{const e=document.querySelector("[name=filter]");e.value="all";e.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await action('reopen');
  await wait('state.tasks.filter(t=>t.status==="open").length===2');
  await go('now','Right now');
  await action('begin');
  await wait('state.active!==null');
  await go('tasks','Tasks');
  await evaluate('document.querySelector(\'[data-action=archive][data-id="\'+state.active.id+\'"]\').click()');
  await wait('state.active===null && state.sessions.length===2');
  await go('week','Activity');
  await action('log');
  await submit('log',{kind:'Nap',minutes:1});
  await wait('state.sessions.length===3');
  await go('money','Money');
  await action('money-edit');
  await submit('money',{amt:155.55,st:'pending',note:'Invoice'});
  await wait('state.money[0]?.st==="pending"');
  await action('receive');
  await wait('state.money[0]?.st==="received"');
  await click('[data-action=money-edit][data-id]:not([data-id=""])');
  await submit('money',{amt:150});
  await wait('state.money[0]?.amt===150');
  await go('data','Workspace');
  const malicious = '<img src=x onerror=alert(1)>';
  await submit('plan',{json:JSON.stringify({format:'sahaja-plan',version:1,tasks:[
    {title:malicious,est:5},{title:'Skipped item',est:5}
  ]})});
  await wait('document.querySelector("[data-form=approve-plan]")');
  a.equal(await evaluate('document.querySelector("img")'),null);
  await evaluate('document.querySelectorAll("[name=selected]")[1].checked=false');
  await click('[data-form=approve-plan] button.primary');
  await wait('state.tasks.length===3');
  a.equal(await evaluate('state.tasks.some(t=>t.title==="Skipped item")'),false);
  await evaluate(`(()=>{
    const input=document.getElementById('backup-file'), transfer=new DataTransfer();
    const incoming={...Model.empty(),onboarded:true,tasks:[Model.task('Replacement','Earn')]};
    transfer.items.add(new File([JSON.stringify(incoming)],'backup.json',{type:'application/json'}));
    input.files=transfer.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));
    window.confirm=()=>true;
  })()`);
  await wait('document.querySelector("[data-action=replace]")');
  a.equal(await evaluate('state.tasks.length'),3);
  await action('replace');
  await wait('state.tasks[0]?.title==="Replacement"');
  await action('recovery');
  await wait('document.querySelector("[data-action=replace]")');
  await action('replace');
  await wait('state.tasks.length===3 && state.money[0]?.amt===150');
  const storage=await evaluate(String.raw`(async()=>{
    const n=Date.now(), key='qa-'+crypto.randomUUID();
    const legacy={v:1,dims:['Earn'],tasks:[{id:'legacy" onclick="bad',title:'Old',status:'open',created:n}],
      cycles:[],sessions:[],money:[]};
    const first=await Repository.open(indexedDB,()=>JSON.stringify(legacy),key);
    const second=await Repository.open(indexedDB,()=>{throw Error('must not migrate twice');},key);
    const replacement=Model.empty();
    await first.commit(first.state,replacement,true);
    let conflict=false,invalid=false;
    try {await second.commit(second.state,{...second.state,theme:'light'});} catch {conflict=true;}
    try {await first.commit(replacement,{...replacement,money:[{id:'invalid',amt:-1}]});} catch {invalid=true;}
    const recovery=await first.recovery();
    first.close();second.close();
    const third=await Repository.open(indexedDB,()=>null,key);
    const persisted=third.state.tasks.length===0;
    third.close();
    indexedDB.deleteDatabase(key);
    return {conflict,invalid,persisted,recovery:recovery.tasks[0].title};
  })()`);
  a.deepEqual(storage,{conflict:true,invalid:true,persisted:true,recovery:'Old'});
  for(const width of [360,390,768,1024,1920]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
    for(const [name,title] of [['now','Right now'],['tasks','Tasks'],['week','Activity'],['money','Money'],['data','Workspace']]) {
      await go(name,title);
      a.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),name+' overflows at '+width);
    }
  }
  await wait('navigator.serviceWorker.controller!==null');
  a.equal(await evaluate('navigator.serviceWorker.ready.then(r=>r.scope)'),url);
  a.equal(await evaluate('caches.match(location.origin+"/sahaja/").then(Boolean)'),true);
  const stopped=new Promise(resolve=>server.once('exit',resolve));
  server.kill();
  await stopped;
  await reload();
  a.equal(await evaluate('state.money[0].amt'),150);
  a.equal(await evaluate('state.tasks.length'),3);
  a.deepEqual(exceptions,[]);
  console.log('PASS Chromium workflows, IndexedDB migration and transactional restore, conflicts, offline reload and 25 viewport checks');
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  server.kill();
  if(browser) {
    try {await send('Browser.close',{},false);} catch {}
    if(browser.exitCode===null) browser.kill();
  }
  for(let i=0;i<12;i++) {
    try {fs.rmSync(root,{recursive:true,force:true});break;} catch {await delay(150);}
  }
});
