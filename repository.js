'use strict';
const Repository = (() => {
  function request(r) {
    return new Promise((resolve,reject)=>{
      r.onsuccess=()=>resolve(r.result);
      r.onerror=()=>reject(r.error);
    });
  }
  function finished(tx) {
    return new Promise((resolve,reject)=>{
      tx.oncomplete=resolve;
      tx.onabort=()=>reject(tx.error ?? Error('Write canceled. Reload to check for changes from another tab.'));
    });
  }
  async function open(api=globalThis.indexedDB, legacy=()=>localStorage.getItem('sahaja'), dbName='sahaja') {
    if (!api) throw Error('IndexedDB is unavailable.');
    const opening=api.open(dbName,1);
    opening.onupgradeneeded=()=>{
      const db=opening.result;
      db.createObjectStore('meta');
      for (const k of Model.collections) db.createObjectStore(k,{keyPath:'id'});
    };
    const db=await new Promise((resolve,reject)=>{
      opening.onsuccess=()=>resolve(opening.result);
      opening.onerror=()=>reject(opening.error);
      opening.onblocked=()=>reject(Error('Close other SAHAJA tabs and reload.'));
    });
    db.onversionchange=()=>db.close();
    const stores=['meta',...Model.collections];
    let revision;
    async function read(key) {
      const tx=db.transaction(stores);
      const meta=tx.objectStore('meta');
      if (key) return request(meta.get(key));
      const [header,...rows]=await Promise.all([request(meta.get('state')),
        ...Model.collections.map(k=>request(tx.objectStore(k).getAll()))]);
      revision=header?.revision;
      if (!header) return null;
      return Model.validate({...header.settings,...Object.fromEntries(Model.collections.map((k,i)=>[k,rows[i]]))});
    }
    function commit(before, after, backup=false) {
      Model.validate(after);
      const {tasks,cycles,sessions,money,projects,...settings}=after;
      const tx=db.transaction(stores,'readwrite');
      const completion=finished(tx);
      const meta=tx.objectStore('meta');
      const check=meta.get('state');
      const expected=revision;
      check.onsuccess=()=>{
        if (check.result?.revision!==expected) { tx.abort(); return; }
        try {
          if (backup && before) meta.put(before,'recovery');
          meta.put({settings,revision:(expected??0)+1},'state');
          for (const k of Model.collections) {
            const store=tx.objectStore(k);
            const old=new Map((before?.[k]??[]).map(x=>[x.id,x]));
            for (const x of after[k]) {
              if (JSON.stringify(old.get(x.id))!==JSON.stringify(x)) store.put(x);
              old.delete(x.id);
            }
            for (const key of old.keys()) store.delete(key);
          }
        } catch { tx.abort(); }
      };
      return completion.then(()=>{revision=(expected??0)+1;});
    }
    try {
      let state=await read();
      if (!state) {
        const raw=legacy();
        state=raw===null?Model.empty():Model.upgrade(JSON.parse(raw));
        try { await commit(null,state); }
        catch (error) {
          state=await read();
          if (!state) throw error;
        }
      }
      return {state,commit,recovery:()=>read('recovery'),close:()=>db.close()};
    } catch (error) {
      db.close();
      throw error;
    }
  }
  return {open};
})();
if (typeof module !== 'undefined') module.exports = Repository;
