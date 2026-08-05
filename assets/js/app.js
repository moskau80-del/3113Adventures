import {openDatabase,getSetting,setSetting} from "./database.js?v=4012";
import {loadLanguage,translate} from "./i18n.js?v=4012";

const navButtons=document.querySelectorAll(".main-nav button");
const pages=document.querySelectorAll(".page");
const languageSelect=document.getElementById("languageSelect");
const themeSelect=document.getElementById("themeSelect");
const settingsStatus=document.getElementById("settingsStatus");
const databaseStatus=document.getElementById("databaseStatus");

navButtons.forEach((button)=>{
  button.addEventListener("click",()=>{
    navButtons.forEach((item)=>item.classList.toggle("active",item===button));
    pages.forEach((page)=>page.classList.toggle("active",page.id===button.dataset.page));
  });
});

function applyTheme(theme){
  if(theme==="system"){
    const dark=window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme=dark?"dark":"light";
  }else{
    document.documentElement.dataset.theme=theme;
  }
}

async function initialize(){
  try{
    await openDatabase();
    databaseStatus.textContent=translate("database.ready","IndexedDB ist bereit.");
  }catch(error){
    databaseStatus.textContent=`IndexedDB-Fehler: ${error.message}`;
  }

  const language=await getSetting("language","de");
  const theme=await getSetting("theme","system");
  languageSelect.value=language;
  themeSelect.value=theme;
  await loadLanguage(language);
  applyTheme(theme);
  databaseStatus.textContent=translate("database.ready","IndexedDB ist bereit.");
}

document.getElementById("saveSettings")?.addEventListener("click",async()=>{
  const language=languageSelect.value;
  const theme=themeSelect.value;
  await setSetting("language",language);
  await setSetting("theme",theme);
  await loadLanguage(language);
  applyTheme(theme);
  settingsStatus.textContent=translate("settings.saved","Einstellungen gespeichert.");
});

document.getElementById("refreshApp")?.addEventListener("click",async()=>{
  if("serviceWorker"in navigator){
    for(const registration of await navigator.serviceWorker.getRegistrations()){
      await registration.unregister();
    }
  }
  if("caches"in window){
    for(const name of await caches.keys()) await caches.delete(name);
  }
  location.href="./?v=4012";
});

if("serviceWorker"in navigator){
  window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js?v=4012"));
}

initialize();
