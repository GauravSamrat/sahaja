'use strict';
const http=require('node:http');
const path=require('node:path');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const port=Number(process.env.SAHAJA_PORT||8080);
const base=process.env.SAHAJA_BASE_PATH==='/sahaja/'?'/sahaja':'';
const files=new Map(Object.entries({
  '/index.html':'text/html; charset=utf-8','/app.js':'text/javascript; charset=utf-8',
  '/repository.js':'text/javascript; charset=utf-8','/model.js':'text/javascript; charset=utf-8',
  '/sw.js':'text/javascript; charset=utf-8','/style.css':'text/css; charset=utf-8',
  '/manifest.json':'application/manifest+json','/icon-192.png':'image/png','/icon-512.png':'image/png'
}));
const server=http.createServer((req,res)=>{
  const requestPath=req.url.split('?')[0];
  if (!requestPath.startsWith(base+'/')) {res.writeHead(404).end('Not found');return;}
  const pathname=requestPath.slice(base.length);
  const file=pathname==='/'?'/index.html':pathname;
  if (!files.has(file)||!['GET','HEAD'].includes(req.method)) {
    res.writeHead(404).end('Not found');
    return;
  }
  const stream=fs.createReadStream(path.join(__dirname,file.slice(1)));
  stream.on('open',()=>{
    res.writeHead(200,{'Content-Type':files.get(file),'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    if(req.method==='HEAD') {stream.destroy();res.end();}
    else stream.pipe(res);
  });
  stream.on('error',()=>res.destroy());
});
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{
  const url='http://localhost:'+server.address().port+base+'/';
  console.log('SAHAJA is running at '+url+' (Ctrl+C to stop).');
  if(process.argv.includes('--open')&&process.platform==='win32') {
    const child=spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{stdio:'ignore',windowsHide:true});
    child.on('error',()=>console.log('Open the address above in your browser.'));
  }
});
