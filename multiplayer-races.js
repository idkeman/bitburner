/* Multiplayer race layer for the Bitburner build. Uses the reusable transport from Login-n-multiplayer-systems. */
(()=>{"use strict";
const RaceModes={
  NODE:"next-node",
  SERVER:"specific-server",
  UPGRADES:"all-upgrades",
  MONEY:"money-target",
  HACK:"hack-target"
};
const state={mp:null,race:null,finished:false,events:[]};
const $=id=>document.getElementById(id);
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
function ui(){
  if(document.getElementById("bb-race-root")) return;
  const root=document.createElement("div"); root.id="bb-race-root";
  root.innerHTML=`
    <button id="bb-race-open">⚡ Races</button>
    <section id="bb-race-panel" hidden>
      <header><b>Bitburner Multiplayer</b><button id="bb-race-close">×</button></header>
      <div id="bb-race-login"></div>
      <div id="bb-race-lobby"></div>
      <div id="bb-race-content"></div>
    </section>`;
  document.body.appendChild(root);
  $("bb-race-open").onclick=()=>{$("bb-race-panel").hidden=false};
  $("bb-race-close").onclick=()=>{$("bb-race-panel").hidden=true};
  render();
}
function render(){
 const login=$("bb-race-login"), lobby=$("bb-race-lobby"), content=$("bb-race-content");
 if(!login)return;
 const logged=window.LoginSystem?.isLoggedIn;
 login.innerHTML=logged
   ? `<div class="bb-user">Signed in as <b>${esc(window.LoginSystem.profile?.username||window.LoginSystem.user?.email||"Player")}</b></div>`
   : `<div class="bb-note">Login is required for multiplayer races.</div>`;
 if(!logged){lobby.innerHTML="";content.innerHTML="";return;}
 if(!state.mp){
   lobby.innerHTML=`<button id="bb-host">Create race room</button><button id="bb-join">Join room</button><button id="bb-public">Browse public rooms</button>`;
   $("bb-host").onclick=host; $("bb-join").onclick=()=>join(prompt("Room code or invite URL:")||"");
   $("bb-public").onclick=listPublic; content.innerHTML="";
 }else{
   lobby.innerHTML=`<div>Room: <b>${esc(state.mp.room)}</b> ${state.mp.isHost?"(host)":""}</div><div id="bb-players"></div>
   <button id="bb-leave">Leave</button>`;
   $("bb-leave").onclick=leave;
   $("bb-players").innerHTML=state.mp.playerList().map(p=>`<span class="bb-player">${esc(p.name)}${p.isHost?" ★":""}</span>`).join("");
   content.innerHTML=state.race?raceView() : (state.mp.isHost?hostRaceView():"<p>Waiting for the host to start a race…</p>");
   bindRace();
 }
}
function hostRaceView(){
 return `<div class="bb-form"><h3>Create a race</h3>
 <select id="bb-mode"><option value="next-node">Reach the next node first</option><option value="specific-server">Root a specific server first</option><option value="all-upgrades">Unlock all upgrades first</option><option value="money-target">Reach a money target first</option><option value="hack-target">Hack a target server first</option></select>
 <input id="bb-target" placeholder="Target server / node / amount (optional)">
 <button id="bb-start">Start race</button></div>`;
}
function raceView(){
 const r=state.race;
 return `<div class="bb-race-card"><h3>${esc(r.title)}</h3><p>${esc(r.description||"")}</p>
 <div class="bb-standings">${(r.standings||[]).map((p,i)=>`<div>#${i+1} <b>${esc(p.name)}</b> — ${esc(p.progress||"running")}</div>`).join("")}</div>
 ${r.selfFinished?"<strong>Finished — waiting for results.</strong>":`<button id="bb-claim">I reached the objective</button>`}
 </div>`;
}
function bindRace(){
 $("bb-start")?.addEventListener("click",startRace);
 $("bb-claim")?.addEventListener("click",()=>recordProgress("objective"));
}
async function host(){
 try{state.mp=LoginMultiplayer.create();await state.mp.host({name:window.LoginSystem.profile?.username||"Player",settings:{maxPlayers:20},publicRoom:true});
  wire();render();}catch(e){alert(e.message||e)}
}
async function join(code){
 try{if(!code)return;state.mp=LoginMultiplayer.create();await state.mp.join({room:code,name:window.LoginSystem.profile?.username||"Player"});wire();render();}catch(e){alert(e.message||e)}
}
async function listPublic(){
 try{const temp=LoginMultiplayer.create();const rooms=await temp.listPublic();alert(rooms.length?rooms.map(x=>x.room_code+" — "+x.host_name+" ("+x.player_count+"/"+x.max_players+")").join("\n"):"No public rooms found.");}catch(e){alert(e.message||e)}
}
function wire(){
 state.mp.on("players",()=>render());
 state.mp.on("player-join",()=>render());
 state.mp.on("player-leave",()=>render());
 state.mp.on("message",m=>handleMessage(m));
 state.mp.on("player-message",x=>handleMessage(x.message));
}
function startRace(){
 if(!state.mp?.isHost)return;
 const mode=$("bb-mode").value,target=$("bb-target").value.trim();
 const data={type:"race-start",race:{id:crypto.randomUUID(),mode,target,startedAt:Date.now(),finished:[],title:({[RaceModes.NODE]:"Race to the next node",[RaceModes.SERVER]:"Race to root the target server",[RaceModes.UPGRADES]:"Race to unlock every upgrade",[RaceModes.MONEY]:"Race to the money target",[RaceModes.HACK]:"Race to hack the target"})[mode],description:target?"Target: "+target:"First player to complete the objective."}};
 state.race={...data.race,standings:state.mp.playerList().map(p=>({id:p.id,name:p.name,progress:"running"})),selfFinished:false};
 state.mp.broadcast(data);render();
}
function recordProgress(kind){
 if(!state.race||state.finished)return;
 const payload={type:"race-finish",raceId:state.race.id,kind,at:Date.now()};
 if(state.mp.isHost)applyFinish(state.mp.id,payload); else state.mp.broadcast(payload);
}
function applyFinish(id,msg){
 if(!state.race||state.race.id!==msg.raceId||state.race.finished.some(x=>x.id===id))return;
 const p=state.mp.playerList().find(x=>x.id===id); if(!p)return;
 state.race.finished.push({id,name:p.name,at:msg.at});
 state.race.standings=state.race.finished.map(x=>({id:x.id,name:x.name,progress:"finished"})).concat(state.mp.playerList().filter(x=>!state.race.finished.some(y=>y.id===x.id)).map(x=>({id:x.id,name:x.name,progress:"running"})));
 if(id===state.mp.id)state.race.selfFinished=true;
 state.mp.broadcast({type:"race-update",raceId:state.race.id,standings:state.race.standings,winner:state.race.finished[0]});
 render();
}
function handleMessage(m){
 if(m.type==="race-start"){state.race={...m.race,finished:[],standings:state.mp.playerList().map(p=>({id:p.id,name:p.name,progress:"running"})),selfFinished:false};render();}
 if(m.type==="race-finish"&&state.mp.isHost)applyFinish(m.from,m);
 if(m.type==="race-update"&&state.race?.id===m.raceId){state.race.standings=m.standings;state.race.selfFinished=m.standings.find(x=>x.id===state.mp.id)?.progress==="finished";render();}
}
function leave(){state.mp?.leave();state.mp=null;state.race=null;render();}
window.BitburnerRaces={
 start:()=>ui(),
 reportMilestone:(type,data={})=>{
   state.events.push({type,data,time:Date.now()});
   if(!state.race)return false;
   const r=state.race,t=String(r.target||"").toLowerCase();
   let match=type===r.mode;
   if(r.mode===RaceModes.SERVER||r.mode===RaceModes.HACK)match=String(data.server||"").toLowerCase()===t;
   if(r.mode===RaceModes.MONEY)match=Number(data.money||0)>=Number(r.target||0);
   if(r.mode===RaceModes.NODE)match=!!data.reachedNextNode;
   if(r.mode===RaceModes.UPGRADES)match=Number(data.upgrades||0)>=Number(data.totalUpgrades||Infinity);
   if(match)recordProgress(type);
   return match;
 }
};
window.addEventListener("login-state",render);
if(window.LoginSystem?.init)window.LoginSystem.init().catch(()=>{}).finally(ui);else window.addEventListener("load",ui);
})();