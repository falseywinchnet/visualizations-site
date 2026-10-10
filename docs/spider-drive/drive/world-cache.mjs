// IndexedDB cache of generated worlds, keyed by body, seed and generator version. Every call fails soft.
import {GENERATOR_VERSION} from './worldgen.mjs';
const DB='spider-drive-worlds',STORE='worlds';
const BODY_REV={mars:'b'};/* per-body revisions, so reworking one world does not regenerate the others */
const keyOf=(seed,body)=>`${body&&body!=='earth'?body+':':''}${seed}:${GENERATOR_VERSION}${BODY_REV[body]||''}`;
function open(){return new Promise((res,rej)=>{let r;try{r=indexedDB.open(DB,1);}catch(e){rej(e);return;}r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
export async function loadWorld(seed,body='earth'){try{const db=await open();return await new Promise(res=>{const t=db.transaction(STORE,'readonly').objectStore(STORE).get(keyOf(seed,body));t.onsuccess=()=>res(t.result||null);t.onerror=()=>res(null);});}catch{return null;}}
export async function saveWorld(world){try{const db=await open();await new Promise(res=>{const tx=db.transaction(STORE,'readwrite');const st=tx.objectStore(STORE);
 // keep at most four worlds
 const k=st.getAllKeys();k.onsuccess=()=>{const keys=k.result||[];for(const key of keys.slice(0,Math.max(0,keys.length-3)))st.delete(key);st.put(world,keyOf(world.seed,world.body));};
 tx.oncomplete=()=>res();tx.onerror=()=>res();});}catch{}}
