/* Presentation-only feedback. Successful combat events are the sole trigger. */
(function (global) {
  'use strict';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const TAU=Math.PI*2;
  function rng(seed){let value=seed>>>0;return()=>{value=(1664525*value+1013904223)>>>0;return value/4294967296;};}
  function canvas(w,h){const el=document.createElement('canvas');el.width=w;el.height=h;return el;}
  function pixel(c,color,x,y,w=1,h=1){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);}
  function line(c,color,x0,y0,x1,y1,width=1){
    x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);
    const dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1;let error=dx+dy;
    for(let safe=0;safe<4096;safe++){
      pixel(c,color,x0,y0,width,width);if(x0===x1&&y0===y1)break;
      const twice=error*2;if(twice>=dy){error+=dy;x0+=sx;}if(twice<=dx){error+=dx;y0+=sy;}
    }
  }
  function polygon(c,color,points){
    if(points.length<3)return;const low=Math.floor(Math.min(...points.map(p=>p.y))),high=Math.ceil(Math.max(...points.map(p=>p.y)));
    // Scan conversion makes leaf silhouettes integer pixel clusters at all angles.
    for(let y=low;y<=high;y++){
      const hits=[];
      for(let i=0,j=points.length-1;i<points.length;j=i++){
        const a=points[i],b=points[j];if((a.y>y)!==(b.y>y))hits.push(a.x+(y-a.y)*(b.x-a.x)/(b.y-a.y));
      }
      hits.sort((a,b)=>a-b);for(let i=0;i<hits.length;i+=2){const x=Math.ceil(hits[i]),end=Math.floor(hits[i+1]);if(end>=x)pixel(c,color,x,y,end-x+1,1);}
    }
  }
  function stroke(c,color,points,offsetX=0,offsetY=0){for(let i=1;i<points.length;i++)line(c,color,points[i-1].x+offsetX,points[i-1].y+offsetY,points[i].x+offsetX,points[i].y+offsetY);}

  class DuelScreenFX {
    constructor({arena,shell}={}){
      this.arena=typeof arena==='string'?document.querySelector(arena):arena;
      this.shell=typeof shell==='string'?document.querySelector(shell):shell;
      this.arena=this.arena||document.getElementById('arena');this.shell=this.shell||document.querySelector('.shell');
      this.active=[];this.lastEventId=0;this.players=null;this.destroyed=false;this.shaking=false;
      this.originalTransform=this.shell?this.shell.style.transform:'';
      this.originalWillChange=this.shell?this.shell.style.willChange:'';
      this.canvas=canvas(1,1);this.canvas.id='screen-fx';this.canvas.hidden=true;this.canvas.dataset.active='';
      this.canvas.setAttribute('aria-hidden','true');
      Object.assign(this.canvas.style,{position:'fixed',inset:'0',width:'100vw',height:'100vh',zIndex:'70',pointerEvents:'none',imageRendering:'pixelated'});
      document.body.appendChild(this.canvas);this.context=this.canvas.getContext('2d');
      this.motionQuery=global.matchMedia?global.matchMedia('(prefers-reduced-motion: reduce)'):null;
      this.reducedMotion=!!this.motionQuery?.matches;
      this.onMotion=e=>{this.reducedMotion=e.matches;if(e.matches)this.restoreShell();};
      this.motionQuery?.addEventListener?.('change',this.onMotion);
      this.onResize=()=>this.resize();global.addEventListener('resize',this.onResize,{passive:true});this.resize();
    }
    resize(){
      if(this.destroyed)return;
      this.width=Math.max(1,Math.ceil(global.innerWidth/2));this.height=Math.max(1,Math.ceil(global.innerHeight/2));
      this.canvas.width=this.width;this.canvas.height=this.height;this.context.imageSmoothingEnabled=false;
      for(const effect of this.active)effect.glass=null;
    }
    project(player){
      const element=this.arena?.querySelector('canvas')||this.arena;
      const box=element?.getBoundingClientRect();
      if(!box||box.width<1||box.height<1||!player)return{x:.5,y:.5};
      return{x:clamp((box.left+(68+(player.x+.5)*24)/544*box.width)/Math.max(1,global.innerWidth),0,1),y:clamp((box.top+(44+(player.y+.5)*24)/352*box.height)/Math.max(1,global.innerHeight),0,1)};
    }
    trigger(event,match,now){
      const player=match.players?.[event.player]||match.players?.[0];
      const random=rng((event.id*104729+(event.type==='parry'?1949:3571))>>>0);
      const origin=this.project(player),facing=player?.facing||{x:1,y:0};
      const vx=facing.x||facing.y*.52,vy=facing.y||-.42,mag=Math.hypot(vx,vy)||1;
      const effect={type:event.type,startedAt:now,duration:event.type==='parry'?500:650,eventId:event.id,origin,
        color:player?.id===1?'#f5a48a':'#a1eddb',direction:{x:vx/mag,y:vy/mag},seed:Math.floor(random()*2147483647),glass:null};
      if(effect.type==='parry'){
        effect.shards=Array.from({length:12},(_,i)=>{
          const angle=TAU*i/12+(random()-.5)*.4;
          return{angle,radius:8+random()*95,speed:65+random()*185,size:5+random()*13,spin:(random()-.5)*8,phase:random()*TAU,ratio:.35+random()*.5};
        });
      }else{
        effect.leaves=Array.from({length:24},(_,i)=>({start:-.75+random()*.65,spread:(random()-.5)*.72,
          phase:random()*TAU,spin:(random()-.5)*9,size:i%6===0?9+random()*3:[3,4.5,6][i%3],shade:i%5,speed:.9+random()*.25}));
        effect.ribbons=Array.from({length:5},(_,i)=>({spread:(i-2)*.19+(random()-.5)*.08,phase:random()*TAU,width:1.5+random()*1.7}));
      }
      this.active.push(effect);
      // Even simultaneous successes keep a fixed upper bound on geometry.
      if(this.active.length>6)this.active.splice(0,this.active.length-6);
    }
    update(match,nowMilliseconds){
      if(this.destroyed||!match)return;
      const now=Number.isFinite(nowMilliseconds)?nowMilliseconds:performance.now();
      if(this.players!==match.players){this.clear();this.players=match.players;this.lastEventId=0;}
      const events=match.events||[];
      if(match.paused){for(const e of events)this.lastEventId=Math.max(this.lastEventId,e.id||0);this.clear();return;}
      for(const event of events){
        if(!(event.id>this.lastEventId))continue;
        this.lastEventId=event.id;
        if(event.type==='parry'||event.type==='blink')this.trigger(event,match,now);
      }
      this.active=this.active.filter(e=>now-e.startedAt<e.duration);
      this.canvas.dataset.active=[...new Set(this.active.map(e=>e.type))].join(',');
      this.canvas.hidden=this.active.length===0;
      const c=this.context;c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.clearRect(0,0,this.width,this.height);
      if(!this.active.length){this.restoreShell();return;}
      // Dark pulses sit below glass and leaf silhouettes when successes overlap.
      for(const e of this.active)if(e.type==='blink')this.drawPulse(e,now-e.startedAt);
      for(const e of this.active){if(e.type==='parry')this.drawParry(e,now-e.startedAt);else this.drawBlink(e,now-e.startedAt);}
      c.globalAlpha=1;this.shake(now);
    }
    makeGlass(effect){
      const w=this.width,h=this.height,cached=canvas(w,h),c=cached.getContext('2d'),random=rng(effect.seed);
      const center={x:effect.origin.x*w,y:effect.origin.y*h},diagonal=Math.hypot(w,h),rays=[];
      for(let i=0;i<8;i++){
        const angle=i/8*TAU+(random()-.5)*.32,points=[center];
        const distances=[.016,.047,.102,.19,.32,.49,.72,1.08];
        for(const d of distances){const a=angle+(random()-.5)*.14;points.push({x:center.x+Math.cos(a)*diagonal*d,y:center.y+Math.sin(a)*diagonal*d});}
        rays.push(points);
      }
      // Transparent, long angular facets give the fracture a glass surface.
      for(let i=0;i<rays.length;i++){
        const a=rays[i],b=rays[(i+1)%rays.length];
        if(i%2===0)polygon(c,'#bededb06',[a[2],a[6],b[5]]);
        polygon(c,'#eff3d807',[a[3],a[7],{x:a[7].x+3,y:a[7].y-2},{x:a[3].x+1,y:a[3].y-1}]);
        stroke(c,'#0b2934ba',a,1,1);stroke(c,'#e9f2dbad',a);
        // Every main fracture has authored secondary forks, with irregular,
        // shorter tertiary cracks instead of uniform decorative star spokes.
        for(let k=2;k<=4;k+=2){
          const start=a[k],next=a[k+1],base=Math.atan2(next.y-start.y,next.x-start.x);
          const side=(i+k)%2?1:-1,angle=base+side*(.35+random()*.7),len=diagonal*(.024+random()*.07);
          const bend={x:start.x+Math.cos(angle)*len*.44,y:start.y+Math.sin(angle)*len*.44};
          const tip={x:bend.x+Math.cos(angle+side*.18)*len*.56,y:bend.y+Math.sin(angle+side*.18)*len*.56};
          stroke(c,'#112f35a0',[start,bend,tip],1,1);stroke(c,'#c7e6db91',[start,bend,tip]);
          if(k===4&&i%2===0)stroke(c,'#b4d8d06e',[bend,{x:bend.x+Math.cos(angle-side*.8)*len*.4,y:bend.y+Math.sin(angle-side*.8)*len*.4}]);
        }
        for(const level of [3]){
          const start=a[level],end=b[level+(i%3===0?1:0)];
          const bend={x:(start.x+end.x)*.5+(random()-.5)*13,y:(start.y+end.y)*.5+(random()-.5)*13};
          stroke(c,'#0b293470',[start,bend,end],1,1);stroke(c,'#c0ddd978',[start,bend,end]);
        }
      }
      // A jagged five-pixel star marks the exact contact point.
      for(let i=0;i<8;i++){const a=i/8*TAU;line(c,'#fff4c9',center.x,center.y,center.x+Math.cos(a)*(i%2?7:12),center.y+Math.sin(a)*(i%2?7:12));}
      effect.glass=cached;return cached;
    }
    drawParry(effect,age){
      const c=this.context,t=clamp(age/effect.duration,0,1),x=effect.origin.x*this.width,y=effect.origin.y*this.height;
      const flash=Math.max(0,1-age/65)*(this.reducedMotion?.025:.09);
      if(flash){c.globalAlpha=flash;c.fillStyle='#fff3d8';c.fillRect(0,0,this.width,this.height);}
      c.globalAlpha=(this.reducedMotion?.34:.58)*(1-t*t)*Math.min(1,.22+age/35);
      c.drawImage(effect.glass||this.makeGlass(effect),0,0);
      const seconds=age/1000,travel=this.reducedMotion?.22:1;
      for(const shard of effect.shards){
        const r=shard.radius+shard.speed*seconds*travel;
        const px=x+Math.cos(shard.angle)*r,py=y+Math.sin(shard.angle)*r+seconds*seconds*55*travel;
        const angle=shard.phase+shard.spin*seconds*travel,cos=Math.cos(angle),sin=Math.sin(angle),size=shard.size;
        const shape=[[-size,-size*shard.ratio],[size*.9,-size*.15],[size*.35,size*shard.ratio],[-size*.65,size*.35]].map(([a,b])=>({x:Math.round(px+a*cos-b*sin),y:Math.round(py+a*sin+b*cos)}));
        c.globalAlpha=(1-t)*.2;polygon(c,shard.ratio>.6?'#bfe9d8':'#f2e7ba',shape);
        c.globalAlpha=(1-t)*.84;line(c,'#e9f1d6',shape[0].x,shape[0].y,shape[1].x,shape[1].y);
        line(c,effect.color,shape[1].x,shape[1].y,shape[2].x,shape[2].y);
        c.globalAlpha=(1-t)*.6;line(c,'#1e5151',shape[2].x,shape[2].y,shape[3].x,shape[3].y);
      }
      // A short expanding pixel ring and opposing blade glints emphasize the
      // impact for the first 150ms, then leave the playfield readable.
      if(age<150){
        c.globalAlpha=(1-age/150)*.8;const r=6+age*.15;
        const points=Array.from({length:9},(_,i)=>({x:x+Math.cos(i/8*TAU)*r,y:y+Math.sin(i/8*TAU)*r}));stroke(c,'#ffe5a7',points);
        line(c,'#fff2ca',x-r*1.7,y+3,x+r*1.7,y-3);line(c,effect.color,x-3,y-r*.6,x+3,y+r*.6);
      }
      c.globalAlpha=1;
    }
    drawPulse(effect,age){
      if(age>=300)return;
      const pulse=age<35?age/35:age<100?1:1-(age-100)/200;
      const c=this.context;c.globalAlpha=Math.max(0,pulse)*(this.reducedMotion?.24:.52);c.fillStyle='#031713';c.fillRect(0,0,this.width,this.height);c.globalAlpha=1;
    }
    drawLeaf(c,x,y,size,angle,flutter,shade,accent,opacity){
      const cos=Math.cos(angle),sin=Math.sin(angle),flat=.24+Math.abs(Math.cos(flutter))*.76;
      const transform=([a,b])=>({x:Math.round(x+a*cos-b*flat*sin),y:Math.round(y+a*sin+b*flat*cos)});
      const silhouette=[[-size-1,0],[-size*.48,-size*.55],[size*.25,-size*.43],[size+1,0],[size*.15,size*.57],[-size*.52,size*.42]].map(transform);
      const shape=[[-size,0],[-size*.4,-size*.36],[size*.25,-size*.27],[size,0],[size*.12,size*.39],[-size*.4,size*.28]].map(transform);
      const colors=shade===0?['#584a29','#c1a45b','#f4d98c']:shade===1?['#2b4f36','#86ad68','#c2d494']:shade===2?['#254f45','#65a38b','#b6dfb2']:shade===3?['#3f5635','#9db47b','#dce5b0']:['#36523c','#719a5f','#b0cb85'];
      c.globalAlpha=opacity;polygon(c,colors[0],silhouette);polygon(c,colors[1],shape);
      const a=transform([-size*.65,0]),b=transform([size*.72,0]);line(c,colors[2],a.x,a.y,b.x,b.y);
      const stem=transform([-size-2,0]);line(c,colors[0],stem.x,stem.y,a.x,a.y);
      if(size>=4){const mid=transform([0,0]),tip=transform([size*.3,-size*.23]);line(c,shade===2?accent:colors[2],mid.x,mid.y,tip.x,tip.y);}
    }
    drawBlink(effect,age){
      const c=this.context,progress=clamp(age/effect.duration,0,1),diagonal=Math.hypot(this.width,this.height);
      const dir=effect.direction,normal={x:-dir.y,y:dir.x},ox=effect.origin.x*this.width,oy=effect.origin.y*this.height;
      const reduced=this.reducedMotion,motion=reduced?.22:1;
      const fade=Math.min(1,age/45)*Math.min(1,(650-age)/190);
      if(age<480){
        const alpha=Math.min(1,age/45)*(1-age/480)*(reduced?.12:.26);
        for(const ribbon of effect.ribbons){
          const points=[],edge=[];
          for(let i=0;i<=24;i++){
            const u=i/24,along=(-.9+progress*1.8*motion+u*.86)*diagonal;
            const wave=Math.sin(u*Math.PI*2.2+ribbon.phase+progress*4)*24;
            const across=ribbon.spread*diagonal+wave;
            const x=ox+dir.x*along+normal.x*across,y=oy+dir.y*along+normal.y*across;
            points.push({x:Math.round(x),y:Math.round(y)});
            const width=Math.sin(u*Math.PI)*ribbon.width;
            edge.unshift({x:Math.round(x+normal.x*width),y:Math.round(y+normal.y*width)});
          }
          c.globalAlpha=alpha;polygon(c,'#cce9c4',[...points,...edge]);c.globalAlpha=alpha*.55;stroke(c,effect.color,points);
        }
      }
      effect.leaves.forEach((leaf,index)=>{
        if(reduced&&index%2)return;
        const along=(leaf.start+progress*1.6*leaf.speed*motion)*diagonal;
        const sway=Math.sin(progress*8+leaf.phase)*(reduced?4:17);
        const across=leaf.spread*diagonal+sway;
        const x=ox+dir.x*along+normal.x*across,y=oy+dir.y*along+normal.y*across;
        if(x<-25||y<-25||x>this.width+25||y>this.height+25)return;
        const angle=Math.atan2(dir.y,dir.x)+leaf.phase+progress*leaf.spin*motion;
        this.drawLeaf(c,x,y,leaf.size,angle,leaf.phase+progress*10*motion,leaf.shade,effect.color,clamp(fade,0,1)*.92);
      });
      c.globalAlpha=1;
    }
    shake(now){
      if(!this.shell||this.reducedMotion){this.restoreShell();return;}
      let x=0,y=0;
      for(const effect of this.active){
        if(effect.type!=='parry')continue;const age=now-effect.startedAt;if(age>=190)continue;
        const amp=5*Math.pow(1-age/190,2),beat=Math.floor(age/23),phase=effect.seed%17;
        x+=Math.sin(beat*2.83+phase)*amp;y+=Math.cos(beat*3.71+phase)*amp*.65;
      }
      if(Math.abs(x)+Math.abs(y)>.08){
        this.shell.style.willChange='transform';this.shell.style.transform=(this.originalTransform?this.originalTransform+' ':'')+`translate3d(${Math.round(clamp(x,-8,8))}px,${Math.round(clamp(y,-6,6))}px,0)`;this.shaking=true;
      }else this.restoreShell();
    }
    restoreShell(){if(this.shell&&this.shaking){this.shell.style.transform=this.originalTransform;this.shell.style.willChange=this.originalWillChange;this.shaking=false;}}
    clear(){
      this.active=[];this.restoreShell();
      if(this.canvas){this.canvas.dataset.active='';this.canvas.hidden=true;this.context?.clearRect(0,0,this.canvas.width,this.canvas.height);}
    }
    destroy(){
      if(this.destroyed)return;this.clear();this.destroyed=true;
      global.removeEventListener('resize',this.onResize);this.motionQuery?.removeEventListener?.('change',this.onMotion);this.canvas.remove();this.players=null;
    }
  }
  global.DuelScreenFX=DuelScreenFX;
})(window);
