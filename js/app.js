(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 let mode='duel',running=false,audioEnabled=false,audioCtx,overlayKind='start',lastEvent=0,lastToast=0,endingAt=0;
 const match=new DuelCore.Match({mode});match.paused=true;
 const renderer=new DuelRenderer('arena',match);
 const screenFX=new DuelScreenFX({arena:$('arena'),shell:document.querySelector('.shell')});
 window.duel={match,renderer,screenFX};
 const held=new Map();let order=0,previous=performance.now(),lastUI=0;
 let networkState=null,networkRound=-1,lastMoveSent=0,lastMoveKey='';
 const dirs={KeyW:[0,-1,0],KeyA:[-1,0,0],KeyS:[0,1,0],KeyD:[1,0,0],ArrowUp:[0,-1,1],ArrowLeft:[-1,0,1],ArrowDown:[0,1,1],ArrowRight:[1,0,1]};
 const actions={KeyJ:[0,'basic'],KeyK:[0,'skill'],KeyL:[0,'block'],Space:[0,'dodge'],Digit1:[1,'basic'],Digit2:[1,'skill'],Digit3:[1,'block'],Digit0:[1,'dodge'],Numpad1:[1,'basic'],Numpad2:[1,'skill'],Numpad3:[1,'block'],Numpad0:[1,'dodge']};
 const stateLabels={idle:'伺机',move:'踏步',attack:'出剑',block:'格挡',dodge:'踏影',stun:'眩晕',hurt:'受击',dead:'倒下'};
 const network=new DuelNetwork({
  status(message,error){$('room-message').textContent=message;$('room-message').classList.toggle('is-error',error);roomBusy();},
  joined(data){held.clear();$('room-entry').hidden=true;$('room-session').hidden=false;$('room-number').textContent=data.code;$('room-seat').textContent=`你是 P${data.playerId+1} · ${data.playerId===0?'青影':'赤影'}`;document.querySelectorAll('[data-mode]').forEach(b=>b.disabled=true);document.querySelector('.controls').classList.add('is-online');document.querySelector('.controls .p1 .player-tag').textContent=`P${data.playerId+1}`;document.querySelector('.controls .p1').classList.toggle('online-p2',data.playerId===1);$('room-create-password').value='';$('room-join-password').value='';roomBusy();},
  state:applyNetworkState,
  latency(ms){$('room-latency').textContent=`往返 ${ms} ms`;},
  disconnected(){held.clear();match.paused=true;screenFX.clear();$('game-overlay').hidden=false;$('overlay-title').textContent='连接暂歇。';$('overlay-copy').textContent='战斗已暂停，正在恢复连接。';$('start').disabled=true;},
  left(){networkState=null;networkRound=-1;$('room-entry').hidden=false;$('room-session').hidden=true;document.querySelectorAll('[data-mode]').forEach(b=>b.disabled=false);document.querySelector('.controls').classList.remove('is-online');document.querySelector('.controls .p1 .player-tag').textContent='P1';document.querySelector('.controls .p1').classList.remove('online-p2');$('start').disabled=false;$('restart').disabled=false;$('pause').disabled=false;$('round-label').textContent=mode==='training'?'剑术练习':'自由对决';$('room-message').textContent='已离开房间 · 可使用本机模式或重新邀友';restart();roomBusy();}
 });
 window.duel.network=network;
 function online(){return Boolean(network.session);}
 function roomBusy(){$('room-create').disabled=network.busy;$('room-join').disabled=network.busy;}
 function applyNetworkState(data){
  if(!network.active)return;
  networkState=data;
  if(data.round!==networkRound){match.reset('duel');screenFX.clear();lastEvent=0;endingAt=0;networkRound=data.round;renderer.setMatch(match);}
  // Keep player identities within a round: effects use a new array to detect a restart.
  const {players:incomingPlayers,...snapshot}=data.match;
  Object.assign(match,snapshot);
  incomingPlayers.forEach((player,id)=>Object.assign(match.players[id],player));
  running=data.phase==='playing';
  const playing=data.phase==='playing',seat=network.session.playerId,me=data.players[seat],other=data.players[1-seat];
  if(!playing){held.clear();lastMoveKey='';screenFX.clear();}
  $('room-ready').disabled=playing||!other.connected||me.ready;
  $('room-ready').textContent=me.ready?'已准备 · 等待对手':data.phase==='ended'?'准备再战':data.phase==='paused'||data.phase==='disconnected'?'准备继续':'准备对战';
  for(const p of data.players)$('room-member-'+p.id).textContent=`P${p.id+1} ${p.id===seat?'（你）':'（对手）'} · ${!p.connected?'等待加入':p.ready?'已准备':'已入房'}`;
  $('round-label').textContent=`联机房 ${data.code}`;
  $('game-overlay').hidden=playing;
  $('start').disabled=!other.connected||me.ready;
  $('restart').disabled=playing||data.phase==='disconnected';
  $('pause').disabled=!playing&&data.phase!=='paused';
  $('overlay-eyebrow').textContent=`苔庭遗迹 · 联机 P${seat+1}`;
  $('overlay-title').textContent=data.phase==='ended'?(match.winner==='draw'?'棋逢对手。':match.winner===seat?'此局，你胜。':'再候下一剑。'):data.phase==='paused'?'剑歇，稍候。':data.phase==='disconnected'?'静候归来。':!other.connected?'静候对手。':'两剑，即将交锋。';
  const message=playing?'交锋中 · WASD / J K L 空格':data.phase==='disconnected'?'对手连接中断，正在等待重连。':!other.connected?'将房间号和密码告诉朋友，等待对方加入。':me.ready?'你已准备，等待对手准备。':data.phase==='ended'?'双方点击准备再战，开始新的一局。':'双方准备后开始；暂停后也需要双方准备继续。';
  $('overlay-copy').textContent=message;$('overlay-hint').textContent='联机双方均使用 WASD / J K L 空格';$('start').textContent=$('room-ready').textContent;
  $('room-message').textContent=message;$('room-message').classList.remove('is-error');
  $('pause').setAttribute('aria-label',playing?'暂停游戏':'准备继续');
  updateUI();
 }
 function sendMove(force=false){if(!network.active||networkState?.phase!=='playing')return;const d=direction(0)||null,key=d?`${d.x},${d.y}`:'';if(force||key!==lastMoveKey||performance.now()-lastMoveSent>120){network.send({type:'move',direction:d});lastMoveSent=performance.now();lastMoveKey=key;}}
 function act(id,action,d){if(online()){if(id===0&&networkState?.phase==='playing')network.send({type:'input',action,direction:d});}else if(mode==='duel'||id===0)match.act(id,action,d);}
 let savedAddress='';try{savedAddress=localStorage.getItem('duel-server')||'';}catch{}
 $('room-server').value=savedAddress||window.DUEL_SERVER_URL||'';
 $('room-server-save').addEventListener('click',()=>{if(online()||network.busy){network.notify('请先离开房间，再更改服务地址。',true);return;}try{DuelNetwork.endpoint($('room-server').value.trim());try{localStorage.setItem('duel-server',$('room-server').value.trim());}catch{}network.notify('服务地址已保存，可以创建或加入房间。');}catch(e){network.notify(e.message,true);}});
 function enterRoom(type,data){try{if(location.hostname.endsWith('.github.io')&&!$('room-server').value.trim()){network.notify('联机服务尚未接通。请使用局域网游戏地址，或在连接设置填写房间服务网址。',true);return;}network.enter(type,data,$('room-server').value.trim()).catch(e=>{network.busy=false;network.notify(e.message,true);});roomBusy();}catch(e){network.notify(e.message,true);}}
 $('room-create-form').addEventListener('submit',e=>{e.preventDefault();enterRoom('create',{password:$('room-create-password').value});});
 $('room-join-form').addEventListener('submit',e=>{e.preventDefault();enterRoom('join',{code:$('room-code').value.trim(),password:$('room-join-password').value});});
 $('room-ready').addEventListener('click',()=>network.send({type:'ready'}));
 $('room-leave').addEventListener('click',()=>network.leave());
 $('room-copy').addEventListener('click',async()=>{const url=new URL(location.href);url.searchParams.set('room',network.session.code);url.hash='';try{await navigator.clipboard.writeText(`逐影 · 房间 ${network.session.code}\n${url.href}\n请向房主索取密码`);network.notify('邀请已复制，密码请单独告诉朋友。');}catch{network.notify(`房间号 ${network.session.code}，请复制浏览器网址发给朋友。`);}});
 const invitedCode=new URL(location.href).searchParams.get('room');if(/^\d{6}$/.test(invitedCode||''))$('room-code').value=invitedCode;
 if(location.hostname.endsWith('.github.io')&&!$('room-server').value.trim())network.notify('本机对战可用 · 联机服务尚未接通');
 const comboHUD=[0,1].map(id=>{const row=$('combo-'+id),slots=row.querySelector('.combo-slots');return{slots,pips:[...slots.children],description:row.querySelector('.combo-description')};});
 function updateCombo(p){
  const finishing=match.attacks.some(a=>a.owner===p.id&&a.kind==='skill'&&a.stage===3&&match.time<a.endsAt);
  const count=finishing?3:p.combo,hud=comboHUD[p.id];
  hud.slots.dataset.filled=String(count);
  hud.slots.setAttribute('aria-label',`已施放 ${count} / 3 式`);
  hud.slots.classList.toggle('completed',count===3);
  hud.pips.forEach((pip,index)=>pip.classList.toggle('filled',index<count));
  const description=finishing?'三式已出 · 连段完成':p.combo?`已存${p.combo}式 · 下一式${p.combo===1?'回岚':'惊鸿'}  ${Math.max(0,p.comboUntil-match.time).toFixed(1)}s`:'起手 · 断流';
  hud.description.textContent=description;hud.description.title=description;
 }
 function direction(id){let best=null;for(const [key,n]of held){const d=dirs[key];if(d&&d[2]===id&&(!best||n>best.n))best={x:d[0],y:d[1],n};}return best?{x:best.x,y:best.y}:undefined;}
 function beep(type){if(!audioEnabled)return;try{audioCtx=audioCtx||new(window.AudioContext||window.webkitAudioContext)();audioCtx.resume();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.connect(g);g.connect(audioCtx.destination);o.type=type==='parry'?'triangle':'square';const t=audioCtx.currentTime;o.frequency.setValueAtTime(type==='parry'?780:type==='blink'?520:180,t);o.frequency.exponentialRampToValueAtTime(65,t+.12);g.gain.setValueAtTime(.035,t);g.gain.exponentialRampToValueAtTime(.001,t+.13);o.start(t);o.stop(t+.15);}catch{}}
 function showOverlay(kind){screenFX.clear();overlayKind=kind;$('game-overlay').hidden=false;held.clear();match.paused=true;const isTraining=mode==='training';$('overlay-eyebrow').textContent='苔庭遗迹 · '+(isTraining?'单人陪练':'双人对战');$('overlay-hint').textContent=kind==='end'?'按 Enter 再来一局':kind==='pause'?'按 Esc 或 Enter 继续':'同一键盘，双人同屏 · 按 Enter 开始';$('overlay-title').textContent=kind==='pause'?'剑歇，稍候。':kind==='end'?(match.winner==='draw'?'棋逢对手。':`P${match.winner+1}，胜。`):'剑起，入局。';$('overlay-copy').textContent=kind==='pause'?'战斗已暂停。调整好呼吸，再战。':kind==='end'?(match.winner==='draw'?'平局。再试一次，寻找新的破绽。':'此刻胜负已分，下一场仍有变数。'):'两位剑士，一方庭院。胜负只在一瞬。';$('start').innerHTML=(kind==='pause'?'继续对战':kind==='end'?'再战一局':isTraining?'开始陪练':'开始对战')+' <span>↗</span>';$('pause').setAttribute('aria-label','继续游戏');}
 function begin(){if(online()){network.send({type:'ready'});$('start').blur();return;}if(overlayKind==='end'){endingAt=0;match.reset(mode);lastEvent=0;}match.paused=false;running=true;$('game-overlay').hidden=true;$('pause').setAttribute('aria-label','暂停游戏');$('start').blur();lastEvent=match.events.at(-1)?.id||0;updateUI();}
 function restart(){if(online()){network.send({type:'ready'});return;}endingAt=0;match.reset(mode);held.clear();lastEvent=0;running=false;renderer.setMatch(match);showOverlay('start');updateUI();}
 function togglePause(){if(online()){network.send({type:networkState?.phase==='playing'?'pause':'ready'});return;}if(!running||match.winner!==null)return;if(match.paused)begin();else showOverlay('pause');updateUI();}
 $('start').addEventListener('click',begin);$('pause').addEventListener('click',togglePause);$('restart').addEventListener('click',restart);
 document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',x===b?'true':'false');});$('dummy-label').hidden=mode!=='training';$('round-label').textContent=mode==='training'?'剑术练习':'自由对决';restart();}));
 $('dummy').addEventListener('change',()=>match.trainingMode=$('dummy').checked?'dummy':'sparring');
 $('sound').addEventListener('click',()=>{audioEnabled=!audioEnabled;$('sound').textContent='音效 '+(audioEnabled?'开':'关');$('sound').setAttribute('aria-pressed',String(audioEnabled));beep('parry');});
 const dialog=$('rules-dialog');$('rules').addEventListener('click',()=>{if(online()){sendMove(true);if(networkState?.phase==='playing')network.send({type:'pause'});}else if(running&&!match.paused&&match.winner===null)showOverlay('pause');dialog.showModal();});dialog.querySelectorAll('.dialog-close').forEach(b=>b.addEventListener('click',()=>dialog.close()));
 document.addEventListener('keydown',e=>{if(dialog.open||e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target.isContentEditable)return;if(e.code==='Escape'){e.preventDefault();if(!e.repeat)togglePause();return;}if(e.code==='Enter'&&!$('game-overlay').hidden){if(e.target instanceof HTMLButtonElement)return;e.preventDefault();if(!e.repeat&&!$('start').disabled)begin();return;}if(e.key==='?'&&!e.repeat){$('rules').click();return;}if(!(e.code in dirs)&&!(e.code in actions))return;if(e.target instanceof HTMLButtonElement&&match.paused)return;e.preventDefault();if(e.repeat)return;if(e.code in dirs){const d=dirs[e.code];if(online()){if(d[2]===0){held.set(e.code,++order);sendMove(true);}}else{held.set(e.code,++order);if(mode==='duel'||d[2]===0)match.act(d[2],'move',{x:d[0],y:d[1]});}}else{const[id,action]=actions[e.code];act(id,action,direction(id));}});
 document.addEventListener('keyup',e=>{held.delete(e.code);if(online())sendMove(true);if(e.target instanceof HTMLInputElement||e.target instanceof HTMLButtonElement&&match.paused)return;if(e.code in dirs||e.code in actions)e.preventDefault();});
 function autoPause(){held.clear();if(online()){sendMove(true);if(networkState?.phase==='playing')network.send({type:'pause'});}else if(running&&!match.paused&&match.winner===null)showOverlay('pause');}
 window.addEventListener('blur',autoPause);document.addEventListener('visibilitychange',()=>{if(document.hidden)autoPause();});window.addEventListener('resize',()=>renderer.resize());
 const touchDirs={up:'KeyW',left:'KeyA',down:'KeyS',right:'KeyD'};
 document.querySelectorAll('[data-touch]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);const key=touchDirs[b.dataset.touch];if(key){held.set(key,++order);const d=dirs[key];if(online())sendMove(true);else match.act(0,'move',{x:d[0],y:d[1]});}else act(0,b.dataset.touch,direction(0));});for(const ev of['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,()=>{const key=touchDirs[b.dataset.touch];if(key){held.delete(key);if(online())sendMove(true);}});});
 document.querySelectorAll('.mini-grid').forEach(g=>{let stage=+g.dataset.shape;for(let row=0;row<4;row++)for(let col=0;col<3;col++){const i=document.createElement('i');if(row===3&&col===1)i.className='origin';else if(row<3&&(stage===1?col===1:row>=3-stage))i.className='active';g.append(i);}});
 function updateUI(){for(const p of match.players){const i=p.id;$('hp-'+i).style.width=(p.hp/p.maxHp*100)+'%';$('mp-'+i).style.width=(p.mp/p.maxMp*100)+'%';$('hp-label-'+i).textContent=`${p.hp} / ${p.maxHp}`;$('mp-label-'+i).textContent=Math.floor(p.mp);$('status-'+i).textContent=match.paused?'准备就绪':stateLabels[p.state]||'伺机';$('status-'+i).classList.toggle('is-stunned',p.hp>0&&match.time<p.stunUntil);updateCombo(p);}const sec=Math.ceil(match.remaining);$('timer').textContent=`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;$('match-state').textContent=match.winner!==null?'对决结束':match.paused?(running?'已暂停':'等待入场'):'交锋中';const events=match.events.filter(e=>e.type!=='start').slice(-3).reverse();$('events').replaceChildren(...(events.length?events.map(e=>{const li=document.createElement('li');li.textContent=(e.player!=null?`P${e.player+1}  `:'')+e.text;return li;}):[Object.assign(document.createElement('li'),{textContent:'静候剑鸣。'})]));const recent=match.events.filter(e=>e.id>lastEvent);for(const e of recent){if(['parry','blink','nomana','comboReset'].includes(e.type)){$('battle-toast').textContent=(e.player!=null?`P${e.player+1} · `:'')+e.text;$('battle-toast').classList.add('show');lastToast=performance.now();}if(['parry','blink','hit'].includes(e.type))beep(e.type);lastEvent=e.id;}if(performance.now()-lastToast>1500)$('battle-toast').classList.remove('show');}
 function frame(now){const dt=Math.min((now-previous)/1000,.05);previous=now;if(online())sendMove();else if(!match.paused&&match.winner===null){for(let id=0;id<2;id++){if(id===1&&mode==='training')continue;const d=direction(id);if(d)match.act(id,'move',d);}match.step(dt);if(match.winner!==null)endingAt=now+650;}if(!online()&&match.winner!==null&&endingAt&&now>=endingAt&&$('game-overlay').hidden)showOverlay('end');screenFX.update(match,now);if(now-lastUI>50){updateUI();lastUI=now;}requestAnimationFrame(frame);}requestAnimationFrame(frame);updateUI();network.restore();
})();
