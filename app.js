const KEY="a3113-v12";let state=JSON.parse(localStorage.getItem(KEY)||"null")||structuredClone(DEFAULT_STATE);
const $=id=>document.getElementById(id),saveLocal=()=>localStorage.setItem(KEY,JSON.stringify(state));
function days(a,b){return Math.max(1,Math.round((new Date(b)-new Date(a))/86400000)+1)}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{document.querySelectorAll("nav button").forEach(x=>x.classList.toggle("active",x===b));document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===b.dataset.page))});
function render(){arrival.value=state.arrival;start.value=state.start;target.value=state.target;lang.value=state.lang;restDays.value=state.restDays;section.innerHTML=NST_SECTIONS.map(x=>`<option>${x}</option>`).join("");
 const totalDays=days(state.start,state.target),walkDays=Math.max(1,totalDays-Number(state.restDays||0));needKm.textContent=(3700/walkDays).toFixed(1)+" km";buffer.textContent=state.restDays;
 const total=state.stages.reduce((a,s)=>a+Number(s.km||0),0),doneKm=state.stages.filter(s=>s.done).reduce((a,s)=>a+Number(s.km||0),0);
 status.innerHTML=`${state.stages.length} Etappen geplant · ${total.toFixed(1)} km eingetragen · ${doneKm.toFixed(1)} km abgeschlossen`;
 bar.style.width=Math.min(100,total/3700*100)+"%";
 const n=state.stages.find(s=>!s.done);next.innerHTML=n?`<b>${esc(n.date)} · ${esc(n.from)} → ${esc(n.to)}</b><p>${Number(n.km||0).toFixed(1)} km · ↑ ${n.up||0} m · ↓ ${n.down||0} m</p>`:'<p class="muted">Noch keine offene Etappe.</p>';
 renderSections();renderStages();
}
function renderSections(){const q=sectionSearch.value.toLowerCase();sectionList.innerHTML=NST_SECTIONS.filter(x=>x.toLowerCase().includes(q)).map((x,i)=>`<article class="section ${x==="Heidschnuckenweg"?"heid":""}"><h3>${x}</h3>${x==="Heidschnuckenweg"?'<span class="pill">SPEZIELL MARKIERT</span>':""}</article>`).join("")}
function renderStages(){const q=stageSearch.value.toLowerCase(),f=stageFilter.value;let list=state.stages.filter(s=>`${s.from} ${s.to} ${s.section}`.toLowerCase().includes(q));if(f==="open")list=list.filter(s=>!s.done);if(f==="done")list=list.filter(s=>s.done);if(f==="heid")list=list.filter(s=>s.section==="Heidschnuckenweg");
 stageList.innerHTML=list.length?list.sort((a,b)=>a.date.localeCompare(b.date)).map(s=>`<article class="stage"><h3>${esc(s.date)} · ${esc(s.from)} → ${esc(s.to)}</h3><span class="pill">${esc(s.section)}</span><span class="pill">${Number(s.km||0).toFixed(1)} km</span>${s.done?'<span class="pill">Erledigt</span>':""}<p>↑ ${s.up||0} m · ↓ ${s.down||0} m</p><p><b>Übernachtung:</b> ${esc(s.sleep||"–")}</p><p class="muted">${esc(s.notes||"")}</p><div class="buttons"><button onclick="editStage(${s.id})">Bearbeiten</button><button onclick="delStage(${s.id})" class="danger">Löschen</button></div></article>`).join(""):'<div class="card">Keine passenden Etappen.</div>';
}
sectionSearch.oninput=renderSections;stageSearch.oninput=renderStages;stageFilter.onchange=renderStages;
add.onclick=()=>openStage();window.editStage=id=>openStage(state.stages.find(s=>s.id===id));window.delStage=id=>{if(confirm("Etappe löschen?")){state.stages=state.stages.filter(s=>s.id!==id);saveLocal();render()}};
function openStage(s={}){sid.value=s.id||"";date.value=s.date||state.start;section.value=s.section||NST_SECTIONS[0];from.value=s.from||"";to.value=s.to||"";km.value=s.km||"";up.value=s.up||0;down.value=s.down||0;sleep.value=s.sleep||"";notes.value=s.notes||"";done.checked=!!s.done;dlg.showModal()}
saveStage.onclick=()=>{const obj={id:Number(sid.value)||Date.now(),date:date.value,section:section.value,from:from.value.trim(),to:to.value.trim(),km:Number(km.value||0),up:Number(up.value||0),down:Number(down.value||0),sleep:sleep.value.trim(),notes:notes.value.trim(),done:done.checked};if(!obj.from||!obj.to)return;const i=state.stages.findIndex(x=>x.id===obj.id);i>=0?state.stages[i]=obj:state.stages.push(obj);saveLocal();dlg.close();render()};
save.onclick=()=>{state.lang=lang.value;state.arrival=arrival.value;state.start=start.value;state.target=target.value;state.restDays=Number(restDays.value||0);saveLocal();render()};
export.onclick=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:"application/json"}));a.download="3113-adventures-v1.2-backup.json";a.click()};
import.onchange=async e=>{try{state=JSON.parse(await e.target.files[0].text());saveLocal();render()}catch{alert("Backup ungültig")}};
reset.onclick=()=>{if(confirm("Alle Änderungen zurücksetzen?")){state=structuredClone(DEFAULT_STATE);saveLocal();render()}};
refreshApp.onclick=async()=>{if("serviceWorker"in navigator){const regs=await navigator.serviceWorker.getRegistrations();for(const r of regs)await r.update()}location.reload(true)};
if("serviceWorker"in navigator)navigator.serviceWorker.register("service-worker.js?v=12");render();