import {setTimeout as sleep} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
import {Google, QuietGate, REVIEW_TITLE, tabs, extract, snapshot, processed, cycle} from './worker.mjs';

// A bounded invocation for scheduled GitHub Actions; never creates a polling daemon.
export async function reviewOnce(google, config, pause = sleep, clock = Date.now, reviewer) {
  const [doc, comments] = await Promise.all([google.doc(), google.comments()]);
  const snap = snapshot(doc, comments);
  const own = tabs(doc.tabs).filter(t => t.tabProperties.title === REVIEW_TITLE);
  if (own.length > 1) throw Error('Multiple reserved review tabs');
  if (own[0] && processed(extract(own[0].documentTab?.body?.content),snap.hash)) return 'unchanged';
  const gate = new QuietGate(config.quietSeconds);
  gate.ready(snap.hash,clock());
  await pause(config.quietSeconds * 1000);
  // Any intervening text/comment change resets the gate and defers to next run.
  return cycle(google,config,{gate,calls:[],lastCall:0},clock(),reviewer);
}

async function main() {
  const env=process.env;
  for(const key of ['GOOGLE_SERVICE_ACCOUNT_JSON','GOOGLE_DOCUMENT_ID','OPENAI_API_KEY','OPENAI_MODEL']) {
    if(!env[key]) throw Error('Missing configuration');
  }
  const google = new Google(JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON),env.GOOGLE_DOCUMENT_ID);
  const result=await reviewOnce(google,{
    apiKey:env.OPENAI_API_KEY,model:env.OPENAI_MODEL,
    quietSeconds:90,maxReviewsPerHour:6,cooldownMs:180000,
  });
  console.log(`Document review: ${result}`);
}

if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(()=>{console.error('Review failed. Check Actions secrets, Google API permissions, document sharing and model access. No source edits performed.');process.exitCode=1;});
}
