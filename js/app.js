/* 神社知識マップ | YAMLでデータを管理、表示処理はこちら。 */
(()=>{
'use strict';
const WORLD={w:2900,h:2100,cx:1450,cy:1050};
// A complete orbit takes five minutes. Only positions move; the text stays upright.
const ORBIT_PERIOD_MS=300000;
const motionPreference=window.matchMedia('(prefers-reduced-motion: reduce)');
let orbitAngle=0,lastOrbitTime=0,hoverPaused=false;

const LABELS={shrine:'神社',kami:'神様',treasure:'神宝',concept:'信仰・概念',architecture:'建築・様式',rank:'社格・制度'};
// Knowledge data is maintained in YAML under data/; no HTML editing needed.
let DATA=[], EDGES=[], lookup=new Map();
const viewport=document.getElementById('viewport');
const world=document.getElementById('world');
const wires=document.getElementById('wires');
const nodesEl=document.getElementById('nodes');
const detail=document.getElementById('detail');
const detailScroll=document.getElementById('detailScroll');
let focus='world',selected=null,positions=new Map(),camera={scale:1,x:0,y:0},drag=null,nodeElements=new Map();
let lastTouchTap={time:0,id:null};
let pendingClick=null,suppressClickUntil=0;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let adjacency=new Map();

async function readYaml(url){
  const response = await fetch(url,{cache:'no-store'});
  if(!response.ok)throw new Error(`${url} の取得に失敗しました (HTTP ${response.status})`);
  const body=await response.text();
  try{return window.jsyaml.load(body,{filename:url});}
  catch(error){throw new Error(`${url}: YAMLの記述を確認してください。${error.message}`);}
}
function checkList(value,path){
  if(!Array.isArray(value))throw new Error(`${path} は「-」で始まる項目の配列にしてください`);
  return value;
}
async function loadKnowledge(){
  if(!window.jsyaml)throw new Error('YAML解析ライブラリを読み込めません。ネットワーク接続を確認してください。');
  const manifest=await readYaml('./data/manifest.yaml');
  if(!manifest||typeof manifest!=='object')throw new Error('data/manifest.yaml の形式が不正です');
  // All paths are relative to data/. Never allow traversals or remote sources.
  async function loadGroup(group){
    const filenames=checkList(manifest[group],`manifest.yaml の ${group}`);
    const lists=await Promise.all(filenames.map(async name=>{
      if(typeof name!=='string'||!/(^|\/)[\w-]+\.yaml$/.test(name)||name.includes('..')||name.startsWith('/'))
        throw new Error(`manifest.yaml: 許可されていないファイル名 ${name}`);
      return {filename:name, records:checkList(await readYaml(`./data/${name}`), name)};
    }));
    return lists.flatMap(({filename,records})=>records.map((record,index)=>({record,filename,index:index+1})));
  }
  const [rawNodes,rawRels,rawRefs]=await Promise.all([
    loadGroup('nodes'),loadGroup('relations'),loadGroup('sources')
  ]);
  const ids=new Set(),validTypes=new Set(Object.keys(LABELS));
  const typeAliases={'神社':'shrine','神様':'kami','神宝':'treasure','信仰・概念':'concept','建築様式':'architecture','社格・制度':'rank'};
  DATA=rawNodes.map(({record:r,filename,index})=>{
    if(!r||typeof r!=='object'||Array.isArray(r))throw new Error(`${filename} ${index}件目: 項目の形式が不正です`);
    const type=typeAliases[r.type]||r.type;
    if(typeof r.id!=='string'||!r.id.trim()||typeof r.name!=='string'||!r.name.trim())
      throw new Error(`${filename} ${index}件目: idとnameは文字列で指定してください`);
    if(ids.has(r.id))throw new Error(`${filename} ${index}件目: id「${r.id}」が重複しています`);
    if(!validTypes.has(type))throw new Error(`${filename} ${index}件目: type「${r.type}」は未対応です`);
    if(r.tags!==undefined&&!Array.isArray(r.tags))throw new Error(`${filename} ${index}件目: tagsは - から始まる配列にしてください`);
    ids.add(r.id);
    return {id:r.id,type,name:r.name,reading:String(r.reading||''),short:String(r.short||''),
      description:String(r.description||''),tags:(r.tags||[]).map(t=>String(t)),sources:[]};
  });
  if(!DATA.length)throw new Error('項目データが空です');
  lookup=new Map(DATA.map(d=>[d.id,d]));
  const pairs=new Set();
  EDGES=rawRels.map(({record:r,filename,index})=>{
    if(!r||typeof r!=='object'||typeof r.from!=='string'||typeof r.to!=='string')
      throw new Error(`${filename} ${index}件目: from と to が必要です`);
    if(!ids.has(r.from)||!ids.has(r.to))
      throw new Error(`${filename} ${index}件目: 存在しないID（${r.from} → ${r.to}）です`);
    if(r.from===r.to)throw new Error(`${filename} ${index}件目: 自分自身への関係は作れません`);
    const key=[r.from,r.to].sort().join('→');
    if(pairs.has(key))throw new Error(`${filename} ${index}件目: 関係 ${key} が重複しています`);
    pairs.add(key);
    return [r.from,r.to,String(r.label||'関連')];
  });
  rawRefs.forEach(({record:r,filename,index})=>{
    if(!r||!ids.has(r.node_id))throw new Error(`${filename} ${index}件目: 不明な node_id「${r?.node_id}」`);
    if(r.url&&!/^https?:\/\//i.test(r.url))throw new Error(`${filename} ${index}件目: URLは https:// などで指定してください`);
    if(r.title&&r.url)lookup.get(r.node_id).sources.push([String(r.title),String(r.url)]);
  });
  adjacency=new Map(DATA.map(d=>[d.id,[]]));
  for(const [a,b,label] of EDGES){adjacency.get(a).push({id:b,label});adjacency.get(b).push({id:a,label});}
  focus=lookup.has('world')?'world':DATA[0].id;
}
function relations(id){return (adjacency.get(id)||[]).map(({id:r,label})=>({id:r,label,data:lookup.get(r)})).filter(r=>r.data);}
function graphFor(id){
  const primary=relations(id);
  const direct=new Set([id,...primary.map(r=>r.id)]);
  const clusters=new Map(primary.map(r=>[r.id,[]]));
  const seen=new Set(direct);
  // A second-ring node is shown only once. If it touches multiple branches,
  // show additional links instead of duplicating the same knowledge item.
  primary.forEach(p=>{
    // The abstract entrance node is a shortcut back to the whole shrine map;
    // expanding it below every shrine would bury specific relationships.
    if(p.id==='world' && id!=='world')return;
    relations(p.id).forEach(r=>{
      if(seen.has(r.id))return;
      seen.add(r.id);clusters.get(p.id).push(r.id);
    });
  });
  return {primary,clusters,visible:new Set([...seen])};
}
function idealLayout(){
  const graph=graphFor(focus);
  const ringOne=graph.primary;
  const n=Math.max(1,ringOne.length);
  const r1=n>=9?445:n>=6?435:n>=4?430:420;
  const r2=805;
  const pts=new Map([[focus,{x:WORLD.cx,y:WORLD.cy,r:108,depth:0}]]);
  // Allocate a bigger angular sector to branches with more satellites.
  const weights=ringOne.map(r=>1+0.62*graph.clusters.get(r.id).length);
  const total=weights.reduce((a,b)=>a+b,0)||1;
  let cursor=-Math.PI/2-Math.PI*weights[0]/total;
  ringOne.forEach((rel,i)=>{
    const sector=Math.PI*2*weights[i]/total;
    const theta=cursor+sector/2+orbitAngle;
    const parentX=WORLD.cx+Math.cos(theta)*r1;
    const parentY=WORLD.cy+Math.sin(theta)*r1;
    pts.set(rel.id,{x:parentX,y:parentY,r:79,depth:1,parent:focus});
    const children=graph.clusters.get(rel.id),count=children.length;
    const pad=Math.min(.15,sector*.18);
    children.forEach((cid,j)=>{
      const baseAngle=count===1?cursor+sector/2:cursor+pad+(sector-2*pad)*(j+.5)/count;
      // The satellites also have their own very gentle motion within the
      // parent branch, evoking moons while preserving the knowledge links.
      const sway=0.035*Math.sin(orbitAngle*.78+i*.9+j*.7);
      const childTheta=baseAngle+orbitAngle+sway;
      pts.set(cid,{x:WORLD.cx+Math.cos(childTheta)*r2,y:WORLD.cy+Math.sin(childTheta)*r2,r:62,depth:2,parent:rel.id});
    });
    cursor+=sector;
  });
  return {pts,graph};
}
function cardPlace(pts){
  const p=pts.get(selected),width=520,height=660,gap=35;
  const candidates=[];
  for(const side of ['right','left']){
    const x=side==='right'?p.x+p.r+gap:p.x-p.r-gap-width;
    for(const offset of [0,-120,120,-240,240,-355,355]){
      const y=Math.max(35,Math.min(WORLD.h-height-35,p.y-height/2+offset));
      let score=0;
      const overflow=Math.max(0,35-x)+Math.max(0,x+width-(WORLD.w-35));
      score+=overflow*1000;
      for(const [id,q] of pts){
        if(id===selected)continue;
        const nx=Math.max(x,Math.min(q.x,x+width)),ny=Math.max(y,Math.min(q.y,y+height));
        const dist=Math.hypot(q.x-nx,q.y-ny);
        const delta=Math.max(0,q.r+22-dist);
        score+=delta*delta*(id===focus?25:q.depth===1?2.3:1.0);
      }
      score+=Math.abs(y-(p.y-height/2))*0.06;
      candidates.push({x,y,w:width,h:height,side,score});
    }
  }
  candidates.sort((a,b)=>a.score-b.score);
  return candidates[0];
}
function reflow(pts,card){
  const fixed=new Set([focus,selected]);
  for(let iteration=0;iteration<105;iteration++){
    for(const [id,p] of pts){
      if(fixed.has(id))continue;
      // Keep clusters near their intended ring while giving a card a real footprint.
      const nearestX=Math.max(card.x,Math.min(p.x,card.x+card.w));
      const nearestY=Math.max(card.y,Math.min(p.y,card.y+card.h));
      let dx=p.x-nearestX,dy=p.y-nearestY;
      let dist=Math.hypot(dx,dy);
      const minDistance=p.r+27;
      if(dist<minDistance){
        if(dist<.001){
          // A circle center inside the rectangle must be pushed right OUT of
          // the card, not pulled toward its center (which causes hidden nodes).
          const alternatives=[
            {x:card.x-minDistance,y:p.y},
            {x:card.x+card.w+minDistance,y:p.y},
            {x:p.x,y:card.y-minDistance},
            {x:p.x,y:card.y+card.h+minDistance}
          ].map(q=>({
            ...q,
            score:Math.hypot(q.x-p.x,q.y-p.y)+
              (q.x<85||q.x>WORLD.w-85||q.y<85||q.y>WORLD.h-85?5000:0)
          })).sort((a,b)=>a.score-b.score);
          p.x=alternatives[0].x;
          p.y=alternatives[0].y;
        }else{
          const force=(minDistance-dist)*.76;
          p.x+=dx/dist*force;p.y+=dy/dist*force;
        }
      }
      p.x=Math.min(WORLD.w-85,Math.max(85,p.x));
      p.y=Math.min(WORLD.h-85,Math.max(85,p.y));
    }
    const entries=[...pts.entries()];
    for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
      const [idA,a]=entries[i],[idB,b]=entries[j];
      let dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy);
      const needed=a.r+b.r+24;
      if(dist<needed){
        if(dist<.01){dx=1;dy=0;dist=1;}
        const force=(needed-dist)*.4;
        if(!fixed.has(idA)){a.x-=dx/dist*force;a.y-=dy/dist*force;}
        if(!fixed.has(idB)){b.x+=dx/dist*force;b.y+=dy/dist*force;}
      }
    }
  }
  return pts;
}
function paintWires(){
  const svg=[];
  const done=new Set();
  // Draw the complete second-order network: central spokes, every branch's
  // secondary spokes, plus extra (non-tree) relationships between visible nodes.
  for(const [a,b] of EDGES){
    if(!positions.has(a)||!positions.has(b))continue;
    const key=[a,b].sort().join(':');if(done.has(key))continue;done.add(key);
    const pa=positions.get(a),pb=positions.get(b);
    const central=a===focus||b===focus;
    const outer=!central&&(pa.parent===b||pb.parent===a);
    const active=selected!==null&&(a===selected||b===selected);
    const klass=['wire',central?'inner':outer?'outer':'cross',active?'highlight':''].join(' ');
    svg.push(`<path class="${klass}" d="M ${pa.x.toFixed(1)} ${pa.y.toFixed(1)} L ${pb.x.toFixed(1)} ${pb.y.toFixed(1)}"/>`);
  }
  if(detail._place && selected!==null && positions.has(selected)){
    const card=detail._place;
    const p=positions.get(selected);
    const sx=p.x+(card.side==='right'?p.r:-p.r),sy=p.y;
    const ex=card.side==='right'?card.x:card.x+card.w;
    const ey=Math.min(card.y+card.h-24,Math.max(card.y+24,sy));
    svg.push(`<path class="wire detail-wire" d="M ${sx} ${sy} L ${ex} ${ey}"/>`);
    svg.push(`<circle class="wire-dot" cx="${ex}" cy="${ey}" r="3.2"/>`);
  }
  wires.innerHTML=svg.join('');

}
function draw(){
  const {pts:ideal}=idealLayout();
  const visibleSelected=selected!==null&&ideal.has(selected);
  const card=visibleSelected?cardPlace(ideal):null;
  positions=card?reflow(ideal,card):ideal;
  detail._place=card;
  paintWires();

  const existing=new Map([...nodesEl.querySelectorAll('[data-node]')].map(el=>[el.dataset.node,el]));
  for(const [id,el] of existing){if(!positions.has(id))el.remove();}
  const added=[];
  for(const [id,p] of positions){
    const d=lookup.get(id);let el=existing.get(id);
    const root=id===focus;
    if(!el){
      el=document.createElement('button');el.type='button';el.dataset.node=id;
      el.className='node birth';
      el.innerHTML=`<span class="kind"></span><span class="name"></span><span class="short"></span>`;
      el.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')hoverPaused=true;});
      el.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')hoverPaused=false;});
      el.addEventListener('click',()=>scheduleSelect(id));
      el.addEventListener('dblclick',e=>{e.preventDefault();e.stopPropagation();navigate(id);});
      el.addEventListener('pointerup',e=>{
        if(e.pointerType!=='touch')return;
        const time=Date.now();
        if(lastTouchTap.id===id&&time-lastTouchTap.time<320){
          lastTouchTap={time:0,id:null};suppressClickUntil=Date.now()+410;navigate(id);
        } else lastTouchTap={time,id};
      });
      nodesEl.appendChild(el);added.push(el);
    }
    el.className=`node ${d.type} ${root?'root':p.depth===2?'secondary':''} ${id===selected?'selected':''} ${added.includes(el)?'birth':''}`;
    el.setAttribute('aria-label',`${d.name}。クリックで詳細、ダブルクリックで中心へ移動`);
    el.setAttribute('aria-pressed',String(id===selected));
    el.style.left=p.x+'px';el.style.top=p.y+'px';
    el.querySelector('.kind').textContent=LABELS[d.type];
    el.querySelector('.name').textContent=d.name;
    el.querySelector('.short').textContent=d.short;
  }
  if(added.length)requestAnimationFrame(()=>requestAnimationFrame(()=>added.forEach(el=>el.classList.remove('birth'))));
  nodeElements=new Map([...nodesEl.querySelectorAll('[data-node]')].map(el=>[el.dataset.node,el]));
  if(card){
    detail._place=card;
    detail.style.left=card.x+'px';detail.style.top=card.y+'px';
    fillDetail(lookup.get(selected));
    detail.classList.add('visible');
  }else{detail.classList.remove('visible');detail._place=null;}
}
function updateOrbitPositions(){
  const {pts}=idealLayout();
  positions=pts;
  for(const [id,p] of pts){
    const el=nodeElements.get(id);
    if(el){el.style.left=p.x+'px';el.style.top=p.y+'px';}
  }
  paintWires();
}
function orbitFrame(t){
  const delta=lastOrbitTime?Math.min(t-lastOrbitTime,80):0;
  lastOrbitTime=t;
  const paused=motionPreference.matches||selected!==null||drag!==null||hoverPaused||document.hidden;
  if(!paused){
    orbitAngle=(orbitAngle+delta*Math.PI*2/ORBIT_PERIOD_MS)%(Math.PI*2);
    updateOrbitPositions();
  }
  requestAnimationFrame(orbitFrame);
}
function fillDetail(d){
  detailScroll.innerHTML=`<div class="detail-kind">${LABELS[d.type]}</div>
  <h2 class="detail-name">${esc(d.name)}</h2><div class="detail-reading">${esc(d.reading)}</div>
  <p class="detail-desc">${esc(d.description)}</p>
  <div class="detail-label">関連キーワード</div>
  <div class="tags">${d.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>
  <div class="detail-label">つながりをたどる</div>
  <div>${relations(d.id).map(r=>`<button class="relation" type="button" data-follow="${r.id}"><span class="rel-main"><span class="rel-type">${esc(r.label)} · ${LABELS[r.data.type]}</span><span class="rel-name">${esc(r.data.name)}</span></span><span class="rel-arrow" aria-hidden="true">→</span></button>`).join('')}</div>
  ${d.sources.length?`<div class="detail-label">参考資料</div><div>${d.sources.map(([title,url])=>`<a class="reference" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(title)} ↗</a>`).join('')}</div>`:''}`;
  detailScroll.scrollTop=0;
  detailScroll.querySelectorAll('[data-follow]').forEach(el=>el.addEventListener('click',e=>{e.stopPropagation();navigate(el.dataset.follow);}));
}
function scheduleSelect(id){
  if(Date.now()<suppressClickUntil)return;
  if(pendingClick)clearTimeout(pendingClick);
  // Single click opens a detail; wait briefly to distinguish it from dblclick.
  pendingClick=setTimeout(()=>{pendingClick=null;select(id);},235);
}
function select(id){
  if(!positions.has(id))return;
  selected=selected===id?null:id;
  draw();
  if(selected)ensureSelectionVisible();
}
function navigate(id){
  if(pendingClick){clearTimeout(pendingClick);pendingClick=null;}
  if(!lookup.has(id))return;
  focus=id;selected=null;hoverPaused=false;
  draw();
  // Re-center the chosen hub, rather than opening a top-most detail overlay.
  centerCamera(false);
}
function cameraApply(){world.style.transform=`translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`;}
function centerCamera(initial){
  const w=viewport.clientWidth,h=viewport.clientHeight;
  if(initial){
    if(w<650){camera.scale=Math.max(.62,Math.min(.78,w/610));}
    else{camera.scale=Math.max(.80,Math.min(1.14,w/1450,h/1010));}
  }
  camera.x=w/2-WORLD.cx*camera.scale;
  camera.y=h/2-WORLD.cy*camera.scale;
  cameraApply();
}
function ensureSelectionVisible(){
  const p=positions.get(selected),card=detail._place;
  if(!p||!card)return;
  const width=viewport.clientWidth,height=viewport.clientHeight;
  const left=Math.min(p.x-p.r,card.x),right=Math.max(p.x+p.r,card.x+card.w);
  const top=Math.min(p.y-p.r,card.y),bottom=Math.max(p.y+p.r,card.y+card.h);
  const fit=Math.min((width-32)/(right-left),(height-48)/(bottom-top),1.1);
  const newScale=Math.min(Math.max(camera.scale,Math.min(fit,.95)),1.12);
  const x0=left*newScale+camera.x,x1=right*newScale+camera.x;
  const y0=top*newScale+camera.y,y1=bottom*newScale+camera.y;
  // Keep both the selected node and its sidecar entirely inside the viewport.
  if(x0<20||x1>width-20||y0<20||y1>height-20){
    camera.scale=Math.min(camera.scale,fit);
    camera.x=width/2-(left+right)/2*camera.scale;
    camera.y=height/2-(top+bottom)/2*camera.scale;
    cameraApply();
  }
}
function zoomAt(x,y,factor){
  const next=Math.max(.28,Math.min(2.4,camera.scale*factor));
  camera.x=x-(x-camera.x)*next/camera.scale;
  camera.y=y-(y-camera.y)*next/camera.scale;
  camera.scale=next;cameraApply();
}
viewport.addEventListener('wheel',e=>{
  if(e.target.closest('#detail'))return;
  e.preventDefault();zoomAt(e.clientX,e.clientY,e.deltaY>0?.91:1.10);
},{passive:false});
viewport.addEventListener('pointerdown',e=>{
  if(e.target.closest('.node,#detail')||(e.button!==0&&e.pointerType==='mouse'))return;
  drag={px:e.clientX,py:e.clientY,x:camera.x,y:camera.y,moved:false};
  viewport.setPointerCapture(e.pointerId);viewport.classList.add('dragging');
});
viewport.addEventListener('pointermove',e=>{
  if(!drag)return;
  const dx=e.clientX-drag.px,dy=e.clientY-drag.py;
  if(Math.hypot(dx,dy)>4)drag.moved=true;
  camera.x=drag.x+dx;camera.y=drag.y+dy;cameraApply();
});
viewport.addEventListener('pointerup',()=>{
  if(!drag)return;
  const wasMove=drag.moved;drag=null;viewport.classList.remove('dragging');
  if(!wasMove&&selected){selected=null;draw();}
});
viewport.addEventListener('pointercancel',()=>{drag=null;viewport.classList.remove('dragging');});
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&selected){selected=null;draw();}
  if((e.key==='Enter'||e.key===' ')&&document.activeElement?.dataset?.node){
    // A keyboard modifier offers the same behavior as double-click.
    if(e.shiftKey){e.preventDefault();navigate(document.activeElement.dataset.node);}
  }
});
window.addEventListener('resize',()=>centerCamera(true));
loadKnowledge().then(()=>{
  centerCamera(true);
  draw();
  requestAnimationFrame(orbitFrame);
}).catch(error=>{
  console.error('知識データの読み込みエラー:',error);
  const message=document.createElement('div');
  message.setAttribute('role','alert');
  message.style.cssText='position:fixed;inset:0;display:grid;place-items:center;padding:24px;text-align:center;background:#f4efdf;color:#563a2c;z-index:5;font:17px/1.9 sans-serif';
  const inner=document.createElement('div');
  const title=document.createElement('strong');
  title.textContent='知識データを読み込めませんでした';
  const reason=document.createElement('p');
  reason.textContent=error.message;
  const help=document.createElement('p');
  help.textContent='GitHub Pages の公開URL (https://) から開き、data/manifest.yaml と各YAML、ネット接続を確認してください。';
  inner.append(title,reason,help);
  message.appendChild(inner);
  document.body.appendChild(message);
});
})();
