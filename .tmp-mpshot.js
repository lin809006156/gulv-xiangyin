const fs=require('fs'),path=require('path'),http=require('http');
const {spawn}=require('child_process');
const WEB=path.join(process.cwd(),'web');
const SHOTS=path.join(process.cwd(),'screenshots');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
function serve(port){
  return new Promise(r=>{
    const s=http.createServer((q,p)=>{
      let u=decodeURIComponent(q.url.split('?')[0]);
      if(u==='/')u='/index.html';
      const f=path.join(WEB,u);
      if(!f.startsWith(WEB)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){p.writeHead(404);p.end();return;}
      p.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});
      fs.createReadStream(f).pipe(p);
    });
    s.listen(port,'127.0.0.1',()=>r(s));
  });
}
class CDP{
  constructor(u){
    this.ws=new WebSocket(u);
    this.id=0;
    this.p=new Map();
    const self=this;
    this.ready=new Promise((a,b)=>{
      this.ws.addEventListener('open',()=>a());
      this.ws.addEventListener('error',()=>b(new Error('ws')));
    });
    this.ws.addEventListener('message',e=>{
      let m;
      try{m=JSON.parse(e.data);}catch(x){return;}
      if(m.id&&self.p.has(m.id)){
        const job=self.p.get(m.id);
        self.p.delete(m.id);
        if(m.error)job.reject(new Error(JSON.stringify(m.error)));
        else job.resolve(m.result);
      }
    });
  }
  send(method,params){
    const self=this;
    const id=++this.id;
    this.ws.send(JSON.stringify({id:id,method:method,params:params||{}}));
    return new Promise((resolve,reject)=>{
      self.p.set(id,{resolve:resolve,reject:reject});
      setTimeout(()=>{ if(self.p.has(id)){ self.p.delete(id); reject(new Error('timeout '+method)); } },60000);
    });
  }
}
(async()=>{
  const b='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const PORT=8952;
  const srv=await serve(PORT);
  const dir=path.join(require('os').tmpdir(),'gx-mp-'+Date.now());
  const proc=spawn(b,['--headless=new','--disable-gpu','--no-sandbox','--remote-debugging-port=9272','--user-data-dir='+dir,'about:blank'],{stdio:'ignore'});
  let t=null;
  for(let i=0;i<40;i++){
    await new Promise(r=>setTimeout(r,300));
    try{
      const res=await new Promise((ok,no)=>{
        http.get('http://127.0.0.1:9272/json/list',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>ok(JSON.parse(d)));}).on('error',no);
      });
      t=res.find(x=>x.type==='page');
      if(t)break;
    }catch(e){}
  }
  const cdp=new CDP(t.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});
  await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+PORT+'/index.html'});
  await new Promise(r=>setTimeout(r,3000));
  const ev=async(x,ap)=>{
    const r=await cdp.send('Runtime.evaluate',{expression:x,awaitPromise:!!ap,returnByValue:true});
    return r.result&&r.result.value;
  };
  const shotClip=async(name,selExpr,pad)=>{
    const clip=await ev(selExpr);
    if(!clip)return;
    const s=await cdp.send('Page.captureScreenshot',{format:'png',clip:clip,captureBeyondViewport:true});
    fs.writeFileSync(path.join(SHOTS,name),Buffer.from(s.data,'base64'));
    console.log('[OK]',name);
  };
  // 1) 起卦栏顶部（新名字）
  await shotClip('new-name-header.png',`(()=>{
    const el=document.querySelector('.header');
    let r=el.getBoundingClientRect();
    window.scrollBy(0,r.top-20);
    r=el.getBoundingClientRect();
    return {x:r.x-2,y:r.y+window.scrollY-2,width:r.width+4,height:r.height+4,scale:3};
  })()`);
  // 2) 起播 → 截浮动栏（停在起卦栏也能看到浮动栏）
  await ev(`document.querySelector('.tabbtn[data-page=\"music\"]').click()`);
  await new Promise(r=>setTimeout(r,400));
  await ev(`document.querySelector('#btnPlay').click()`);
  await new Promise(r=>setTimeout(r,2600));
  await shotClip('miniplayer-show.png',`(()=>{
    const el=document.querySelector('#miniPlayer');
    let r=el.getBoundingClientRect();
    window.scrollBy(0,r.top-window.innerHeight/2+r.height/2);
    r=el.getBoundingClientRect();
    return {x:r.x-6,y:r.y+window.scrollY-6,width:r.width+12,height:r.height+12,scale:3};
  })()`);
  // 3) 播放器控制区（合并后的大按钮）
  await shotClip('new-player-controls.png',`(()=>{
    const el=document.querySelector('.player-controls');
    let r=el.getBoundingClientRect();
    window.scrollBy(0,r.top-window.innerHeight/2+r.height/2);
    r=el.getBoundingClientRect();
    return {x:r.x-8,y:r.y+window.scrollY-8,width:r.width+16,height:r.height+16,scale:3};
  })()`);
  // 4) 暂停态：浮动栏图标变播放、大按钮变「继续」
  await ev(`document.querySelector('#mpPlay').click()`);
  await new Promise(r=>setTimeout(r,600));
  await shotClip('miniplayer-paused.png',`(()=>{
    const el=document.querySelector('#miniPlayer');
    let r=el.getBoundingClientRect();
    window.scrollBy(0,r.top-window.innerHeight/2+r.height/2);
    r=el.getBoundingClientRect();
    return {x:r.x-6,y:r.y+window.scrollY-6,width:r.width+12,height:r.height+12,scale:3};
  })()`);
  cdp.ws.close();
  proc.kill();
  srv.close();
  process.exit(0);
})();
