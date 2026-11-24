const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
(async()=>{const b=await chromium.launch();const p=await b.newPage();
for(const f of process.argv.slice(2)){const svg=fs.readFileSync(f,'utf8');const m=svg.match(/width="(\d+)" height="(\d+)"/);
await p.setViewportSize({width:+m[1],height:+m[2]});await p.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
await p.screenshot({path:f.replace('.svg','.png'),omitBackground:true,clip:{x:0,y:0,width:+m[1],height:+m[2]}});}
await b.close();})();
