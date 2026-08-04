const KEY="a3113-v11";let state=JSON.parse(localStorage.getItem(KEY)||"null")||structuredClone(DEFAULT_STATE);let promptInstall;
const $=id=>document.getElementById(id);const saveLocal=()=>localStorage.setItem(KEY,JSON.stringify(state));
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{document.querySelectorAll("nav button").forEach(x=>x.classList.toggle("active",x===b));document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===b.dataset.page))});
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function render(){arrival.value=state.arrival;start.value=state.start;target.value=state.target;lang.value=state.lang;
 section.innerHTML=NST_SECTIONS.map(x=>`<option>${x}</option>`).join("");
 sectionList.innerHTML=NST_SECTIONS.map((x,i)=>`<article class="section ${x==="Heidschnuckenweg"?"heid":""}"><h3>${i+1}. ${x}</h3>${x==="Heidschnuckenweg"?'<span class="pill">SPEZIELL MARKIERT</span>':""}</article>`).join("");
 const total=state.stages.reduce((a,s)=>a+Number(s.km||0),0),done=state.stages.filter(s=>s.done).reduce((a,s)=>a+Number(s.km||0),0);
 status.innerHTML=`${state.stages.length} Etappen geplant · ${total.toFixed(1)} km eingetragen · ${done.toFixed(1)} km abgeschlossen`;
 bar.style.width=Math.min(100,total/3700*100)+"%";
 stageList.innerHTML=state.stages.length?state.stages.sort((a,b)=>a.date.localeCompare(b.date)).map(s=>`<article class="stage"><h3>${esc(s.date)} · ${esc(s.from)} → ${esc(s.to)}</h3><span class="pill">${esc(s.section)}</span><span class="pill">${Number(s.km||0).toFixed(1)} km</span>${s.done?'<span class="pill">Erledigt</span>':""}<p><b>Übernachtung:</b> ${esc(s.sleep||"–")}</p><p class="muted">${esc(s.notes||"")}</p><div class="buttons"><button onclick="editStage(${s.id})">Bearbeiten</button><button onclick="delStage(${s.id})" class="danger">Löschen</button></div></article>`).join(""):'<div class="card">Noch keine Tagesetappen angelegt.</div>';
}
add.onclick=()=>openStage();window.editStage=id=>openStage(state.stages.find(s=>s.id===id));window.delStage=id=>{if(confirm("Etappe löschen?")){state.stages=state.stages.filter(s=>s.id!==id);saveLocal();render()}};
function openStage(s={}){sid.value=s.id||"";date.value=s.date||state.start;section.value=s.section||NST_SECTIONS[0];from.value=s.from||"";to.value=s.to||"";km.value=s.km||"";sleep.value=s.sleep||"";notes.value=s.notes||"";done.checked=!!s.done;dlg.showModal()}
saveStage.onclick=()=>{const obj={id:Number(sid.value)||Date.now(),date:date.value,section:section.value,from:from.value.trim(),to:to.value.trim(),km:Number(km.value||0),sleep:sleep.value.trim(),notes:notes.value.trim(),done:done.checked};if(!obj.from||!obj.to)return;const i=state.stages.findIndex(x=>x.id===obj.id);i>=0?state.stages[i]=obj:state.stages.push(obj);saveLocal();dlg.close();render()};
save.onclick=()=>{state.lang=lang.value;state.arrival=arrival.value;state.start=start.value;state.target=target.value;saveLocal();render()};
export.onclick=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:"application/json"}));a.download="3113-adventures-v1.1-backup.json";a.click()};
import.onchange=async e=>{try{state=JSON.parse(await e.target.files[0].text());saveLocal();render()}catch{alert("Backup ungültig")}};
reset.onclick=()=>{if(confirm("Alle Änderungen zurücksetzen?")){state=structuredClone(DEFAULT_STATE);saveLocal();render()}};
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();promptInstall=e;install.hidden=false});install.onclick=async()=>{if(promptInstall){promptInstall.prompt();promptInstall=null;install.hidden=true}};
if("serviceWorker"in navigator)navigator.serviceWorker.register("service-worker.js");render();