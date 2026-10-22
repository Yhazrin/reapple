import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const home=process.env.REAPPLE_HOME||path.join(os.homedir(),'.reapple'),port=process.env.REAPPLE_PORT||9333;
let pages;
try {pages=await(await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(2000)})).json();} catch {process.exit(0);}
const regs=(()=>{try{return JSON.parse(fs.readFileSync(path.join(home,'state.json'),'utf8')).registrations||{}}catch{return {}}})();
const timer=setTimeout(()=>{console.error('detach timed out; quit NetEase to clear injection');process.exit(1)},10000);
for(const page of pages.filter(p=>p.type==='page'&&p.url?.startsWith('orpheus://orpheus/')&&p.webSocketDebuggerUrl)){
 const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})});
 let id=0;const send=(method,params)=>new Promise((r,j)=>{const n=++id;function f(e){const v=JSON.parse(e.data);if(v.id!==n)return;ws.removeEventListener('message',f);v.error?j(Error(v.error.message)):r(v.result)}ws.addEventListener('message',f);ws.send(JSON.stringify({id:n,method,params}))});
 if(regs[page.id])try{await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:regs[page.id]})}catch(e){if(!/Script not found/.test(e.message))throw e;}
 await send('Runtime.evaluate',{expression:'window.__kabiStageDispose?.()',returnByValue:true});ws.close();
}
clearTimeout(timer);fs.rmSync(path.join(home,'state.json'),{force:true});console.log('detached and disarmed');
