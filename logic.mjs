export function officeOpen(now=new Date()) {const h=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kathmandu',hourCycle:'h23',hour:'2-digit'}).format(now));return h>=10&&h<18}
export function workMessage(text){return typeof text==='string'&&!/^\[(?:Silpa|Workspace) (?:Assistant|Workspace)\]/i.test(text)&&! /^(?:ok(?:ay)?|yes|no|thanks?|thank you|noted|done|👍|🙏)[.!\s]*$/i.test(text)&&/project|video|edit|script|shoot|report|proposal|content|design|motion|graphic|client|deadline|review|subtitle|footage|काम|भिडियो|रिपोर्ट|स्क्रिप्ट|kaam|garnu/i.test(text)}
export function coordinationReply(text,workspace){
 let answer;
 if(/budget|salary|invoice|bank|payment|rate|बजेट|पैसा|तलब/i.test(text))answer='Please check this privately with the finance owner so financial details stay out of the group.';
 else if(/password|secret|api.?key|token|credential/i.test(text))answer='Please keep passwords and access keys out of the group. What production task do you need help coordinating?';
 else if(/workspace|report.{0,15}(?:link|form)/i.test(text))answer='Here is the daily report form: '+workspace+'/?view=report';
 else if(/waiting|stuck|block|delay|pending|समस्या/i.test(text))answer='Thanks for flagging this. What file or decision are you waiting on, and will it affect the delivery date? Please include the project name so the right person can help.';
 else if(/ready|completed|finished|uploaded|submitted|सकियो/i.test(text))answer='Thanks for the update! Please add the review link and current status to the relevant workspace item. Is there any feedback or a decision needed next?';
 else answer='Thanks for sharing. Please include the project, what is needed next and the target date so the team can coordinate it.';
 return '[Silpa Assistant]\n'+answer;
}
export function eligibleGroup(actual,allowed){return !!allowed&&actual===allowed&&allowed.endsWith('@g.us')}
