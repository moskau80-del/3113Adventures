let translations={};

function getNested(object,path){
  return path.split(".").reduce((value,key)=>value?.[key],object);
}

export async function loadLanguage(language){
  const response=await fetch(`lang/${language}.json?v=4012`);
  if(!response.ok) throw new Error(`Language file ${language} could not be loaded.`);
  translations=await response.json();
  document.documentElement.lang=language;

  document.querySelectorAll("[data-i18n]").forEach((element)=>{
    const text=getNested(translations,element.dataset.i18n);
    if(text) element.textContent=text;
  });
}

export function translate(key,fallback=key){
  return getNested(translations,key) ?? fallback;
}
