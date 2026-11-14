import {BufferJSON,initAuthCreds,proto} from '@whiskeysockets/baileys';
export function sqliteAuth(db){
 db.exec('CREATE TABLE IF NOT EXISTS wa_auth (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
 const get=k=>{const row=db.prepare('SELECT value FROM wa_auth WHERE key=?').get(k);return row?JSON.parse(row.value,BufferJSON.reviver):null};
 const set=(k,v)=>db.prepare('INSERT OR REPLACE INTO wa_auth VALUES(?,?)').run(k,JSON.stringify(v,BufferJSON.replacer));
 const creds=get('creds')||initAuthCreds();
 return {state:{creds,keys:{get:async(type,ids)=>Object.fromEntries(ids.map(id=>{let value=get(type+'-'+id);if(type==='app-state-sync-key'&&value)value=proto.Message.AppStateSyncKeyData.fromObject(value);return [id,value]}).filter(([,v])=>v)),set:async data=>{db.exec('BEGIN IMMEDIATE');try{for(const [type,items] of Object.entries(data))for(const [id,value] of Object.entries(items)){const key=type+'-'+id;if(value)set(key,value);else db.prepare('DELETE FROM wa_auth WHERE key=?').run(key)}db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}}},save:()=>set('creds',creds)};
}
