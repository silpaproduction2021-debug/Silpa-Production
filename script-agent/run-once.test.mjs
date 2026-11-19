import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewOnce} from './run-once.mjs';
import {snapshot,REVIEW_TITLE} from './worker.mjs';
const tab=(id,title,text)=>({tabProperties:{tabId:id,title},documentTab:{body:{content:[{endIndex:text.length+1,paragraph:{elements:[{textRun:{content:text}}]}}]}}});
test('unchanged source exits immediately without waiting or AI calls',async()=>{
  const d={revisionId:'r',tabs:[tab('s','Script','Source\n')]};const hash=snapshot(d,[]).hash;
  d.tabs.push(tab('a',REVIEW_TITLE,`SOURCE-SHA256: ${hash}\n`));
  const g={doc:async()=>d,comments:async()=>[]};
  assert.equal(await reviewOnce(g,{quietSeconds:90},()=>assert.fail(),()=>100000,()=>assert.fail()),'unchanged');
});
test('new edits during quiet period defer review without an AI call',async()=>{
  const d={revisionId:'r',tabs:[tab('s','Script','Source\n')]};let now=100000;
  const g={doc:async()=>structuredClone(d),comments:async()=>[]};
  const result=await reviewOnce(g,{quietSeconds:90},async()=>{now+=90000;d.tabs[0]=tab('s','Script','Client editing\n');},()=>now,()=>assert.fail());
  assert.equal(result,'waiting');
});
