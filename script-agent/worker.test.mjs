import test from 'node:test';
import assert from 'node:assert/strict';
import {REVIEW_TITLE,extract,snapshot,QuietGate,appendRequests,cycle} from './worker.mjs';

const para = text => ({startIndex:1,endIndex:text.length+1,paragraph:{elements:[{textRun:{content:text}}]}});
const tab = (id,title,text) => ({tabProperties:{tabId:id,title},documentTab:{body:{content:[para(text)]}}});
const base = () => ({revisionId:'r1',tabs:[tab('source','Script','Original script\n')]});
const state = hash => {const gate=new QuietGate(1);gate.ready(hash,0);return {gate,calls:[],lastCall:0};};
const config = {maxReviewsPerHour:6,cooldownMs:1000};

test('extracts both columns of tables and nested tabs',()=>{
  const doc=base();doc.tabs[0].childTabs=[tab('nested','Notes','Client instructions\n')];
  doc.tabs[0].documentTab.body.content=[{table:{tableRows:[{tableCells:[{content:[para('Audio\n')]},{content:[para('Visual\n')]}]}]}}];
  const s=snapshot(doc,[]);assert.ok(s.payload.includes('Audio'));assert.ok(s.payload.includes('Visual'));assert.ok(s.payload.includes('Client instructions'));
});
test('agent output does not trigger another review',()=>{
  const a=base(),b=base();b.tabs.push(tab('review',REVIEW_TITLE,'A proposal\n'));
  assert.equal(snapshot(a,[]).hash,snapshot(b,[]).hash);
});
test('comment edits and replies change the fingerprint',()=>{
  const a=snapshot(base(),[{id:'1',content:'Change this',resolved:true}]);
  const b=snapshot(base(),[{id:'1',content:'Change this',resolved:true,replies:[{content:'Still outstanding'}]}]);
  assert.notEqual(a.hash,b.hash);assert.ok(b.payload.includes('Still outstanding'));
});
test('a typing pause is required after every change',()=>{
  const g=new QuietGate(90);assert.equal(g.ready('a',0),false);assert.equal(g.ready('a',89999),false);assert.equal(g.ready('a',90000),true);assert.equal(g.ready('b',90001),false);
});
test('write helper refuses source tabs and preserves UTF-16 index',()=>{
  assert.throws(()=>appendRequests(tab('source','Script','Original\n'),'replacement'));
  const t=tab('review',REVIEW_TITLE,'🌱\n');const r=appendRequests(t,'New\n');assert.equal(r[0].insertText.location.index,3);assert.equal(r[0].insertText.location.tabId,'review');
});

function mock(doc=base()) {
  return {data:doc,reads:0,writes:[],threads:[],
    async doc(){this.reads++;return structuredClone(this.data);},
    async comments(){return structuredClone(this.threads);},
    async write(revision,requests){
      assert.equal(revision,this.data.revisionId);this.writes.push(requests);
      for(const r of requests){
        if(r.addDocumentTab)this.data.tabs.push(tab('review',REVIEW_TITLE,'\n'));
        if(r.insertText){const t=this.data.tabs.find(t=>t.tabProperties.tabId===r.insertText.location.tabId);assert.equal(t.tabProperties.title,REVIEW_TITLE);const before=extract(t.documentTab.body.content);t.documentTab.body.content=[para(before.slice(0,-1)+r.insertText.text+'\n')];}
      }
      this.data.revisionId+='x';
    }
  };
}
test('writes one proposal into a separate tab, keeps source unchanged, skips duplicates',async()=>{
  const g=mock(),hash=snapshot(g.data,[]).hash,s=state(hash);let calls=0;
  const reviewer=async()=>{calls++;return 'Proposed revision';};
  assert.equal(await cycle(g,config,s,100000,reviewer),'proposal-written');
  assert.equal(extract(g.data.tabs[0].documentTab.body.content),'Original script\n');
  assert.equal(await cycle(g,config,s,200000,reviewer),'waiting');assert.equal(calls,1);
});
test('discards model output if the client edits during generation',async()=>{
  const g=mock(),s=state(snapshot(g.data,[]).hash);
  const result=await cycle(g,config,s,100000,async()=>{g.data.tabs[0].documentTab.body.content=[para('Client now typing\n')];return 'Stale proposal';});
  assert.equal(result,'source-changed');assert.equal(g.writes.length,0);
});
test('discards output when a new client comment arrives',async()=>{
  const g=mock(),s=state(snapshot(g.data,[]).hash);
  const result=await cycle(g,config,s,100000,async()=>{g.threads=[{id:'2',content:'New instructions'}];return 'Stale proposal';});
  assert.equal(result,'source-changed');assert.equal(g.writes.length,0);
});
test('rate limit prevents another paid AI call',async()=>{
  const g=mock(),s=state(snapshot(g.data,[]).hash);s.calls=[99999];let called=false;
  const result=await cycle(g,{...config,maxReviewsPerHour:1},s,100000,async()=>{called=true;return 'No';});
  assert.equal(result,'rate-limited');assert.equal(called,false);
});
test('fails closed on comments read errors',async()=>{
  const g=mock(),s=state(snapshot(g.data,[]).hash);g.comments=async()=>{throw Error('No comments access');};
  await assert.rejects(cycle(g,config,s,100000,async()=>assert.fail()));assert.equal(g.writes.length,0);
});
