'use strict';
(() => {
  const config=window.LEARNING_ACCESS_CONFIG,root=document.querySelector('#access-gate'),app=document.querySelector('#app');
  const key='little-star-entry-v1',localeKey='little-star-language-v1';
  const copy={
    'zh-CN':{brand:'小星星英语',eyebrow:'A LITTLE ENGLISH, EVERY DAY',title:'一个小小的访问码，\n开启英语小冒险',intro:'12 个小世界，陪孩子慢慢听、慢慢认、勇敢说。',code:'访问码',placeholder:'输入你领取的访问码',remember:'在这台设备记住我',enter:'进入英语乐园',loading:'正在打开英语乐园…',checking:'正在验证…',wrong:'访问码不对，再检查一下吧。',empty:'请先输入访问码。',unsupported:'当前浏览器无法校验访问码，请使用 Safari 或 Chrome 打开。',failed:'页面加载失败，请刷新后重试。',get:'获取访问码',social:'在小红书搜索下面的 ID，私信领取访问码，再回到这里输入。',copy:'复制小红书 ID',copied:'已复制，去小红书搜索这个 ID 吧。',copyFailed:'请长按下方 ID 复制。',open:'打开小红书',listen:'听原声',recognise:'认词卡',speak:'勇敢说',language:'界面语言'},
    'zh-HK':{brand:'小星星英語',eyebrow:'A LITTLE ENGLISH, EVERY DAY',title:'一個小小的存取碼，\n展開英語小冒險',intro:'12 個小世界，陪小朋友慢慢聽、慢慢認、勇敢講。',code:'存取碼',placeholder:'輸入你領取的存取碼',remember:'在這部裝置記住我',enter:'進入英語樂園',loading:'正在打開英語樂園…',checking:'正在驗證…',wrong:'存取碼唔啱，再檢查一下。',empty:'請先輸入存取碼。',unsupported:'目前瀏覽器無法驗證存取碼，請使用 Safari 或 Chrome 開啟。',failed:'頁面載入失敗，請重新整理後再試。',get:'領取存取碼',social:'在小紅書搜尋以下 ID，私訊領取存取碼，再回到這裏輸入。',copy:'複製小紅書 ID',copied:'已複製，去小紅書搜尋這個 ID。',copyFailed:'請長按下方 ID 複製。',open:'開啟小紅書',listen:'聽原聲',recognise:'認字卡',speak:'勇敢講',language:'介面語言'},
    'en-GB':{brand:'Little Star English',eyebrow:'A LITTLE ENGLISH, EVERY DAY',title:'A little access code.\nA new English adventure.',intro:'12 little worlds to listen, recognise and have a go at speaking.',code:'Access code',placeholder:'Enter your access code',remember:'Remember me on this device',enter:'Enter the learning world',loading:'Opening your learning world…',checking:'Checking…',wrong:'That code does not match. Please check and try again.',empty:'Please enter your access code.',unsupported:'This browser cannot check the code. Please open the site in Safari or Chrome.',failed:'The page could not load. Refresh and try again.',get:'Get an access code',social:'Search for this ID on Xiaohongshu (RED) and send a private message to request a code. Then return here to enter it.',copy:'Copy Xiaohongshu ID',copied:'ID copied. Search for it on Xiaohongshu.',copyFailed:'Press and hold the ID below to copy it.',open:'Open Xiaohongshu',listen:'Listen',recognise:'Recognise',speak:'Speak',language:'Language'}
  };
  const safe=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let locale='zh-CN',loading=false,reloadNeeded=false,status='',input='',remember=true;
  try{const saved=localStorage.getItem(localeKey);if(copy[saved])locale=saved;}catch{}
  function stored(storage){try{const value=JSON.parse(storage.getItem(key));return value?.version===config.version&&Number(value.expires)>Date.now();}catch{return false;}}
  function setStatus(text){status=text;const el=root.querySelector('.gate-status');if(el)el.textContent=text;}
  function render(){
    const t=copy[locale];document.documentElement.lang=locale;document.title=t.brand;
    root.innerHTML=`<main class="gate-shell"><header class="gate-header"><div class="gate-brand"><span aria-hidden="true">✦</span><b>${safe(t.brand)}</b></div><label class="gate-language"><span class="sr-only">${safe(t.language)}</span><select aria-label="${safe(t.language)}">${Object.entries({'zh-CN':'简体中文','zh-HK':'繁體中文','en-GB':'English'}).map(([id,label])=>`<option value="${id}"${locale===id?' selected':''}>${label}</option>`).join('')}</select></label></header><section class="gate-content"><div class="gate-welcome"><div class="eyebrow">${t.eyebrow}</div><h1>${t.title.split('\n').map(safe).join('<br>')}</h1><p>${safe(t.intro)}</p><div class="gate-features"><span><b>🎧</b>${safe(t.listen)}</span><span><b>🧩</b>${safe(t.recognise)}</span><span><b>🎙️</b>${safe(t.speak)}</span></div><div class="gate-star" aria-hidden="true">✦<i>🌱</i></div></div><div class="gate-card"><form novalidate><label for="entry-code">${safe(t.code)}</label><input id="entry-code" type="text" maxlength="48" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${safe(t.placeholder)}" value="${safe(input)}"><label class="gate-remember"><input type="checkbox"${remember?' checked':''}>${safe(t.remember)}</label><button class="primary gate-enter" type="submit"${loading?' disabled':''}>${safe(loading?t.loading:t.enter)} <span aria-hidden="true">→</span></button><div class="gate-status" role="status" aria-live="polite">${safe(status)}</div></form><section class="gate-social"><span class="redbook-mark">小红书</span><h2>${safe(t.get)}</h2><p>${safe(t.social)}</p><strong class="gate-social-id">${safe(config.social.id)}</strong><div class="gate-social-actions"><button class="secondary" type="button" data-copy-social>${safe(t.copy)}</button><a href="${safe(config.social.url)}" target="_blank" rel="noopener noreferrer">${safe(t.open)} ↗</a></div></section></div></section><footer class="gate-footer"><p>${safe(window.LEARNING_LEGAL.short(locale))}</p><details><summary>${safe(window.LEARNING_LEGAL.title(locale))}</summary>${window.LEARNING_LEGAL.html(locale)}</details></footer></main>`;
    root.querySelector('select').addEventListener('change',event=>{
      input=root.querySelector('#entry-code').value;remember=root.querySelector('input[type="checkbox"]').checked;locale=event.target.value;status='';try{localStorage.setItem(localeKey,locale);}catch{}render();
    });
    root.querySelector('form').addEventListener('submit',submit);
    root.querySelector('[data-copy-social]').addEventListener('click',async()=>{
      try{await navigator.clipboard.writeText(config.social.id);setStatus(t.copied);}catch{setStatus(t.copyFailed);}
    });
  }
  async function loadCourse(){
    if(loading)return;loading=true;render();
    try{
      for(const item of document.querySelectorAll('script[data-course-src]')){
        await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=item.dataset.courseSrc;script.onload=resolve;script.onerror=reject;document.head.append(script);});
      }
      input='';const field=root.querySelector('#entry-code');if(field)field.value='';root.hidden=true;app.hidden=false;document.body.classList.remove('access-mode');
    }catch{loading=false;reloadNeeded=true;render();setStatus(copy[locale].failed);}
  }
  async function submit(event){
    event.preventDefault();if(loading)return;if(reloadNeeded){window.location.reload();return;}
    const t=copy[locale],field=root.querySelector('#entry-code'),value=field.value.normalize('NFKC').replace(/[\s-]+/g,'').toUpperCase();
    if(!value){setStatus(t.empty);field.focus();return;}
    if(!window.crypto?.subtle){setStatus(t.unsupported);return;}
    const button=root.querySelector('.gate-enter');button.disabled=true;setStatus(t.checking);
    try{
      const salt=Uint8Array.from(config.salt.match(/../g),hex=>parseInt(hex,16));
      const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(value),'PBKDF2',false,['deriveBits']);
      const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:config.iterations,hash:'SHA-256'},material,256);
      const hash=Array.from(new Uint8Array(bits),byte=>byte.toString(16).padStart(2,'0')).join('');
      if(hash!==config.hash){setStatus(t.wrong);button.disabled=false;field.focus();return;}
      remember=root.querySelector('input[type="checkbox"]').checked;
      try{const marker=JSON.stringify({version:config.version,expires:Date.now()+config.remember_days*86400000});(remember?localStorage:sessionStorage).setItem(key,marker);}catch{}
      await loadCourse();
    }catch{setStatus(t.unsupported);button.disabled=false;}
  }
  window.LEARNING_ACCESS={lock(){try{localStorage.removeItem(key);sessionStorage.removeItem(key);}catch{}window.location.reload();}};
  document.body.classList.add('access-mode');render();
  let recalled=false;try{recalled=stored(localStorage)||stored(sessionStorage);}catch{}
  if(recalled)loadCourse();
})();
