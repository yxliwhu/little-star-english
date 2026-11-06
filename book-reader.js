'use strict';
(() => {
  let session = null;
  function destroy() {
    if (!session) return;
    const s=session;session=null;
    s.observer?.disconnect();window.removeEventListener('resize',s.resize);
    s.audio.pause();s.audio.removeAttribute('src');s.audio.load();
    if (document.fullscreenElement && s.root.contains(document.fullscreenElement)) document.exitFullscreen?.().catch(()=>{});
  }
  function open(root,{unit,page,tr,safe,locale,onBeforePlay}) {
    destroy();
    const pages=[...new Set([...unit.pages,...unit.extraPages])].sort((a,b)=>a-b);
    root.innerHTML=`<header class="book-toolbar"><div class="book-page-nav"><button data-book-action="previous" aria-label="${safe(tr('上一页'))}">‹</button><div><small>UNIT ${unit.id}</small><strong class="book-page-label" role="status"></strong></div><button data-book-action="next" aria-label="${safe(tr('下一页'))}">›</button></div><div class="book-zoom"><button data-book-action="zoom-out" aria-label="${safe(tr('缩小课本'))}">−</button><button data-book-action="fit" aria-label="${safe(tr('整页显示'))}">⤢</button><button data-book-action="zoom-in" aria-label="${safe(tr('放大课本'))}">＋</button></div><button class="book-close" data-close aria-label="${safe(tr('关闭课本'))}">×</button></header><div class="book-stage"><div class="book-space"><div class="book-canvas"><img class="book-image" alt="" draggable="false"><div class="book-hotspots"></div></div></div></div><footer class="book-player"><div class="book-playback"><span class="book-track-label" role="status" aria-live="polite"></span><audio controls preload="none" playsinline></audio></div><div class="book-fallback"></div><div class="book-reader-status" role="status"></div><small class="book-rights">${safe(window.LEARNING_LEGAL?.short(locale)||tr('教材版权归原权利人所有'))}</small></footer>`;
    const s={root,unit,page,pages,tr,safe,zoom:1,currentSpot:null,queue:[],queueIndex:0,observer:null,resize:null,audio:root.querySelector('audio'),stage:root.querySelector('.book-stage'),canvas:root.querySelector('.book-canvas'),space:root.querySelector('.book-space'),image:root.querySelector('.book-image')};session=s;
    const query=selector=>root.querySelector(selector);
    function dimensions(){return window.LEARNING_BOOK?.pages?.[s.page] || {width:1191,height:1500,spots:[]};}
    function fit(center=false) {
      if (session!==s) return;
      const meta=dimensions(),w=s.stage.clientWidth||640,h=s.stage.clientHeight||780;
      const fitWidth=Math.max(1,Math.min(w-24,(h-24)*meta.width/meta.height));
      const width=fitWidth*s.zoom,height=width*meta.height/meta.width;
      s.canvas.style.width=width+'px';s.canvas.style.height=height+'px';
      s.space.style.width=Math.max(w,width+24)+'px';s.space.style.height=Math.max(h,height+24)+'px';
      if(center){s.stage.scrollLeft=Math.max(0,(width+24-w)/2);s.stage.scrollTop=Math.max(0,(height+24-h)/2);}
      query('[data-book-action="zoom-out"]').disabled=s.zoom<=1;
      query('[data-book-action="zoom-in"]').disabled=s.zoom>=3;
    }
    function update() {
      if(session!==s)return;
      root.querySelectorAll('[data-book-spot]').forEach(button=>{
        const selected=button.dataset.bookSpot===s.currentSpot;
        const playing=selected&&!s.audio.paused&&!s.audio.ended;
        button.classList.toggle('is-selected',selected);button.classList.toggle('is-playing',playing);
        button.setAttribute('aria-pressed',String(playing));button.querySelector('.book-hotspot-badge').textContent=playing?'Ⅱ':'▶';
      });
    }
    function stop() {
      s.queue=[];s.queueIndex=0;s.currentSpot=null;s.audio.pause();s.audio.removeAttribute('src');s.audio.load();update();
    }
    function playCurrent() {
      if(session!==s)return;
      const track=s.unit.tracks.find(t=>t.page===s.page&&t.id===s.queue[s.queueIndex]);if(!track)return;
      onBeforePlay?.();s.audio.src=track.src;
      query('.book-track-label').textContent=`🎧 ${tr('音轨')} ${track.id} · ${track.title}`;
      query('.book-reader-status').textContent='';
      s.audio.play().catch(()=>{if(session===s)query('.book-reader-status').textContent=tr('音频暂时无法播放，请再点一次小喇叭。');});
    }
    function activate(id,tracks) {
      if(s.currentSpot===id&&s.queue.length){
        if(!s.audio.paused&&!s.audio.ended){s.audio.pause();return;}
        if(!s.audio.ended&&s.audio.currentTime>0){s.audio.play().catch(()=>{query('.book-reader-status').textContent=tr('音频暂时无法播放，请再点一次小喇叭。');});return;}
      }
      s.audio.pause();s.currentSpot=id;s.queue=tracks;s.queueIndex=0;playCurrent();update();
    }
    function show(nextPage) {
      if(!pages.includes(nextPage))return;
      stop();s.page=nextPage;s.zoom=1;
      const meta=dimensions(),tracks=unit.tracks.filter(t=>t.page===nextPage),allowed=new Set(tracks.map(t=>t.id));
      const spots=(meta.spots||[]).filter(spot=>spot.tracks.length&&spot.tracks.every(id=>allowed.has(id)));
      query('.book-page-label').textContent=`${tr('课本')} ${nextPage}`;
      root.setAttribute('aria-label',`${tr('课本')} · Unit ${unit.id} · ${nextPage}`);
      s.image.alt=`Unit ${unit.id} · ${tr('课本')} ${nextPage}`;s.image.src=`assets/unit-${String(unit.id).padStart(2,'0')}/page-${nextPage}.webp`;
      query('.book-hotspots').innerHTML=spots.map((spot,i)=>`<button class="book-hotspot" data-book-spot="${nextPage}-${i}" data-book-spot-index="${i}" style="left:${spot.x*100}%;top:${spot.y*100}%;--spot-width:${(spot.w||.03)*100}%;--spot-height:${(spot.h||.024)*100}%" aria-label="${safe(tr('播放课本音轨')+' '+spot.tracks.join(', '))}" aria-pressed="false"><span class="book-hotspot-badge" aria-hidden="true">▶</span></button>`).join('');
      query('.book-fallback').innerHTML=(!spots.length&&tracks.length)?tracks.map(t=>`<button class="secondary" data-book-track="${t.id}">🔊 ${safe(tr('音轨'))} ${safe(t.id)}</button>`).join(''):'';
      query('.book-track-label').textContent=tracks.length?tr('点图片上的小喇叭，听课本原声'):tr('这一页没有配套音频');
      query('.book-reader-status').textContent='';s.audio.hidden=!tracks.length;
      query('[data-book-action="previous"]').disabled=pages.indexOf(nextPage)===0;
      query('[data-book-action="next"]').disabled=pages.indexOf(nextPage)===pages.length-1;
      s.spots=spots;fit(true);
    }
    s.audio.addEventListener('playing',update);s.audio.addEventListener('pause',update);
    s.audio.addEventListener('ended',()=>{if(session!==s)return;if(s.queueIndex<s.queue.length-1){s.queueIndex++;playCurrent();}else update();});
    s.audio.addEventListener('error',()=>{if(session===s&&s.queue.length){s.audio.pause();query('.book-reader-status').textContent=tr('音频暂时无法播放，请再点一次小喇叭。');}});
    s.image.addEventListener('load',()=>fit());s.image.addEventListener('error',()=>{if(session===s)query('.book-reader-status').textContent=tr('课本图片暂时无法显示，请重新打开。');});
    root.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button||button.disabled)return;
      if(button.dataset.bookSpotIndex!==undefined){const index=Number(button.dataset.bookSpotIndex),spot=s.spots[index];if(spot)activate(button.dataset.bookSpot,[...spot.tracks]);return;}
      if(button.dataset.bookTrack){activate('track-'+button.dataset.bookTrack,[button.dataset.bookTrack]);return;}
      switch(button.dataset.bookAction){
        case 'previous':show(pages[pages.indexOf(s.page)-1]);break;
        case 'next':show(pages[pages.indexOf(s.page)+1]);break;
        case 'zoom-in':s.zoom=Math.min(3,s.zoom+.5);fit(true);break;
        case 'zoom-out':s.zoom=Math.max(1,s.zoom-.5);fit(true);break;
        case 'fit':s.zoom=1;fit(true);break;
      }
    });
    s.resize=()=>fit();window.addEventListener('resize',s.resize);
    if(window.ResizeObserver){s.observer=new ResizeObserver(s.resize);s.observer.observe(s.stage);}
    show(page);query('.book-close').focus();
    const fullscreen=root.requestFullscreen||root.webkitRequestFullscreen;
    if(fullscreen){try{fullscreen.call(root,{navigationUI:'hide'})?.catch?.(()=>{});}catch{}}
  }
  window.LEARNING_BOOK_READER={open,destroy};
})();
