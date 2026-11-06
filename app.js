'use strict';

const COURSE = window.LEARNING_COURSE;
const $ = selector => document.querySelector(selector);
const app = $('#app');
const safe = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const I18N = window.LEARNING_I18N;
const tr = text => I18N.translate(text);
const l10n = (parts, ...values) => parts.map((part, i) => I18N.translate(part, false) + (i < values.length ? values[i] : '')).join('');
let units = I18N.courseUnits(COURSE.units);
const pageNames = {home:tr('我的乐园'),listen:tr('听一听'),read:tr('认一认'),speak:tr('说一说'),library:tr('故事屋')};
const profileKey = 'little-star-profile-v1';
let unit = null, state = null, page = 'catalog', group = '', quiz = null;
let selectedPhrase = 0, feedback = '', selectedCard = '', isCorrect = false;
let routeKey = null, toastTimer, activeAudio = null;
let recording = false, recorder = null, stream = null, recordUrl = null;
let recordAudio = null, recordTimer, recordGeneration = 0;
let recordHeld = false, recordPending = false, recordFallback = false, recordPointer = null, recordPhase = 'idle';
let voicePlayer = null, micClickGuardUntil = 0;
const SPEAK_GUIDE = '先听一听，再按住小话筒说英语。说完松开，就会听到自己的声音。';
const MIC_READY = '准备好啦！按住小话筒，说完再松开。';
const MIC_HELP = '请家长帮忙开启麦克风。也可以先听示范，直接开口说。';
let recordStatus = '按住小话筒，说完再松开';

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}
function freshState() { return {seen:[],completed:[],attempts:[],results:[],last:'listen',lastGroup:''}; }
function storeKey(id) { return `little-star-unit${id}-v1`; }
function maxStars(u) { return Object.keys(u.groups).length * 2 + 1; }
function readState(u) {
  const s = {...freshState(), ...readJSON(storeKey(u.id), {})};
  for (const key of ['seen','completed','attempts','results']) if (!Array.isArray(s[key])) s[key] = [];
  const validStars = Object.keys(u.groups).flatMap(g => ['listen-'+g,'read-'+g]).concat('speak');
  s.completed = [...new Set(s.completed.filter(x => validStars.includes(x)))];
  s.attempts = [...new Set(s.attempts.filter(x => Number.isInteger(x) && x >= 0 && x < u.phrases.length))];
  s.results = s.results.filter(r => u.groups[r.group] && Array.isArray(r.retryIds)).slice(-40);
  if (!u.groups[s.lastGroup]) s.lastGroup = Object.keys(u.groups)[0];
  if (!pageNames[s.last] || s.last === 'home') s.last = 'listen';
  return s;
}
const oldProfile = readJSON(storeKey(1), {});
let profile = {...{name:'小星星',age:''}, ...readJSON(profileKey, {name:oldProfile.name || '小星星',age:oldProfile.age || ''})};
if (!COURSE.numbers.some(n => String(n.number) === String(profile.age))) profile.age = '';
profile.name = String(profile.name || '小星星').slice(0,12);

function displayName() { return profile.name === '小星星' ? tr('小星星') : profile.name; }
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { toast(tr('这个浏览器暂时不能保存进度，仍然可以继续玩。')); }
}
function save() { if (unit && state) writeJSON(storeKey(unit.id), state); }
function toast(text) {
  $('#toast').textContent = text;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3400);
}
function silence() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  activeAudio?.pause(); activeAudio = null;
  recordAudio?.pause();
  recordPhase = 'idle';
  document.querySelectorAll('audio,video').forEach(m => m.pause());
}
function playClip(file, fallback, after = null) {
  const player = voicePlayer || (voicePlayer = new Audio());
  player.pause(); player.src = file; activeAudio = player;
  player.onended = () => { if (activeAudio === player) { activeAudio = null; after?.(); } };
  player.play().catch(() => { if (activeAudio === player) toast(tr(fallback)); });
}
function say(text, after = null) {
  silence();
  const file = window.LEARNING_AUDIO?.english?.[text];
  if (file) { playClip(file, '语音暂时不能播放，可以去故事屋听原声。', after); return; }
  if (!('speechSynthesis' in window)) { toast(tr('设备语音暂不可用，可以去故事屋听教材原声。')); return; }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-GB'; utterance.rate = .78; utterance.onend = after;
  const voices = window.speechSynthesis.getVoices();
  utterance.voice = voices.find(v => v.lang === 'en-GB') || voices.find(v => v.lang.startsWith('en')) || null;
  utterance.onerror = e => { if (!['interrupted','canceled'].includes(e.error)) toast(tr('语音暂时不能播放，可以去故事屋听原声。')); };
  window.speechSynthesis.speak(utterance);
}
function guide(text, after = null) {
  silence();
  const source = I18N.source(text);
  const file = window.LEARNING_AUDIO?.guides?.[I18N.locale]?.[source];
  if (!file) { toast(tr(source)); return; }
  playClip(file, source, after);
}
function voiceCredit() {
  return tr(window.LEARNING_AUDIO?.ready ? '互动提示和英语示范：豆包 AI 配音' : '配音准备中：普通话提示已就绪，英语暂用设备语音');
}
function languagePicker() {
  return '<label class="language-picker"><span>🌐 <span class="language-label">'+safe(tr('界面和提示语言'))+'</span></span><select id="learning-language" aria-label="'+safe(tr('界面和提示语言'))+'">'+Object.entries(I18N.languages).map(([id,label])=>'<option value="'+id+'"'+(id===I18N.locale?' selected':'')+'>'+label+'</option>').join('')+'</select></label>';
}
function changeLanguage(locale) {
  if (!I18N.languages[locale] || locale === I18N.locale) return;
  closeModal(); silence(); clearRecord();
  I18N.setLocale(locale);
  units = I18N.courseUnits(COURSE.units);
  if (unit) {
    unit = units.find(u => u.id === unit.id);
    if (quiz) {
      const current = unit.groups[quiz.group].items;
      quiz.items = quiz.items.map(x => current.find(i => i.id === x.id));
      quiz.options = quiz.options.map(x => current.find(i => i.id === x.id));
    }
  }
  render();
  $('#learning-language')?.focus();
}
function stopRecord(discard = false) {
  if (discard) recordGeneration++;
  clearTimeout(recordTimer);
  recordHeld = false; recordPending = false; recordPointer = null; recordPhase = 'idle';
  if (recorder && recorder.state !== 'inactive') {
    if (discard) recorder.onstop = null;
    recorder.stop();
  }
  stream?.getTracks().forEach(t => t.stop()); stream = null; recording = false;
}
function clearRecord() {
  stopRecord(true); recordAudio?.pause(); recordAudio = null;
  if (recordUrl) URL.revokeObjectURL(recordUrl);
  recordUrl = null; recordPhase = 'idle'; recordFallback = false; recordStatus = '按住小话筒，说完再松开';
}
function navigate(id = null, next = 'home', nextGroup = '') {
  const hash = id ? `#unit-${id}/${next}${nextGroup ? '/'+nextGroup : ''}` : '#catalog';
  if (window.location.hash !== hash) window.location.hash = hash;
  applyRoute();
}
function applyRoute() {
  const hash = window.location.hash || '#catalog';
  if (hash === routeKey) return;
  routeKey = hash;
  closeModal(); silence(); clearRecord(); quiz = null; feedback = ''; selectedCard = ''; isCorrect = false;
  const match = /^#unit-(\d+)(?:\/(home|listen|read|speak|library))?(?:\/([\w-]+))?$/.exec(hash);
  const target = match && units.find(u => u.id === Number(match[1]));
  if (!target) { unit = null; state = null; page = 'catalog'; }
  else {
    if (unit?.id !== target.id) { unit = target; state = readState(unit); selectedPhrase = 0; }
    page = match[2] || 'home';
    group = unit.groups[match[3]] ? match[3] : state.lastGroup;
    state.lastGroup = group;
    if (page !== 'home') state.last = page;
    save(); writeJSON('little-star-last-unit', unit.id);
  }
  render(); window.scrollTo({top:0,behavior:'instant'});
}
function go(next) { navigate(next === 'catalog' ? null : unit.id, next, next === 'listen' || next === 'read' ? group : ''); }
function stars() { return state?.completed.length || 0; }
function heading(kicker,title,description) {
  return `<div class="page-heading"><div class="eyebrow">${safe(kicker)}</div><h1>${safe(title)}</h1><p>${safe(description)}</p></div>`;
}
function shell(content) {
  const nav = unit ? [['home','🏡',tr('我的乐园')],['listen','🎧',tr('听一听')],['read','🧩',tr('认一认')],['speak','🎙️',tr('说一说')],['library','📚',tr('故事屋')]] : [];
  return l10n`<div class="shell"><aside class="sidebar"><div class="brand"><span class="brand-star">✦</span><div>小星星英语<small>LITTLE STAR ENGLISH</small></div></div>
    <button class="catalog-link ${page === 'catalog' ? 'active' : ''}" data-go="catalog">▦ 单元目录</button>
    ${unit ? `<div class="current-unit"><span>UNIT ${String(unit.id).padStart(2,'0')}</span><b>${safe(unit.zhTitle)}</b></div>` : ''}
    <nav class="nav" aria-label="主导航">${nav.map(([id,icon,name]) => `<button data-go="${id}" class="${page === id ? 'active' : ''}" ${page === id ? 'aria-current="page"' : ''}><span class="ico">${icon}</span>${name}</button>`).join('')}</nav>
    <div class="side-note"><span style="font-size:24px">🌱</span><b>每天一点点</b>听见、认出、勇敢说。<br>跟着自己的节奏就好。</div><button class="parent-button" data-action="parent">⚙ 家长角落</button></aside>
    <main class="main"><header class="topbar"><div class="crumb">KID’S BOX 1 <b>${unit ? `UNIT ${String(unit.id).padStart(2,'0')} · ${safe(unit.title)}` : 'MY ENGLISH ADVENTURE'}</b></div><div class="topbar-tools">${languagePicker()}<div class="star-pill">${unit ? l10n`✦ ${stars()} / ${maxStars(unit)} 颗星` : tr('✦ 12 个小世界')}</div></div></header>${content}${legalFooter()}</main></div>`;
}
function catalog() {
  const lastId = readJSON('little-star-last-unit', 1);
  const last = units.find(u => u.id === lastId) || units[0];
  const touched = units.filter(u => { const s = readState(u); return s.seen.length || s.completed.length || s.attempts.length; }).length;
  const resumeUnit = touched ? last : units[0];
  return shell(l10n`<section class="catalog-hero"><div><div class="eyebrow">A LITTLE ENGLISH, EVERY DAY</div><h1>${safe(displayName())}的英语小世界</h1><p>十二段小冒险，慢慢听、慢慢认、勇敢说。<br>点一个喜欢的单元，就可以出发啦。</p><button class="primary" data-resume="${resumeUnit.id}">${touched ? tr('继续上次的小冒险') : tr('从 Hello 开始')} →</button></div><div class="catalog-art" aria-hidden="true"><span class="orbit o1">🎒</span><span class="orbit o2">🐘</span><span class="orbit o3">🍎</span><div class="catalog-star">✦</div><span class="catalog-sticker">Hello, world!</span></div></section>
    <div class="section-head"><h2>选一个单元，开始吧</h2><small>${touched ? l10n`已经探索 ${touched} / 12 个单元` : tr('每个单元都有听、认、说')}</small></div>
    <section class="unit-grid" aria-label="选择学习单元">${units.map(u => {
      const s = readState(u), total = maxStars(u), words = Object.values(u.groups).reduce((n,g) => n + g.items.length, 0);
      const started = s.seen.length || s.attempts.length || s.completed.length;
      return l10n`<button class="unit-card" data-unit="${u.id}" style="--unit-tint:${u.tint}" aria-label="Unit ${u.id} ${safe(u.title)}，${safe(u.zhTitle)}"><div class="unit-cover"><img src="${u.hero}" alt="" loading="lazy"><span class="unit-number">${String(u.id).padStart(2,'0')}</span><span class="unit-emoji" aria-hidden="true">${u.emoji}</span></div><div class="unit-copy"><div class="unit-card-top"><span class="eyebrow">UNIT ${String(u.id).padStart(2,'0')}</span><span class="unit-status">${s.completed.length === total ? tr('✦ 已集满星星') : started ? tr('正在探索') : tr('准备出发')}</span></div><h3>${safe(u.title)}</h3><p>${safe(u.zhTitle)} <span>· ${words} 张词卡</span></p><div class="unit-progress" aria-label="已获得 ${s.completed.length} 颗星，共 ${total} 颗"><i style="width:${s.completed.length/total*100}%"></i></div><div class="unit-card-bottom"><span>✦ ${s.completed.length} / ${total}</span><span>听 · 认 · 说 ↗</span></div></div></button>`;
    }).join('')}</section><div class="notice">🌱 不用一次学完，也不用按顺序解锁。每个单元的星星和练习记录都会分别保存。</div>`);
}
function home() {
  return shell(l10n`<section class="hero" style="background:${unit.tint}"><div class="hero-copy"><div class="eyebrow">OUR LITTLE ADVENTURE · ${String(unit.id).padStart(2,'0')}</div><h1>${unit.id === 1 ? 'Hello, '+safe(displayName())+'！' : safe(unit.title)}</h1><p>${safe(unit.intro)}<br>听一听、找一找，再勇敢说一句。</p><button class="primary" data-action="start">${stars() || state.seen.length ? tr('继续小冒险') : tr('开始小冒险')} <span style="margin-left:16px">→</span></button></div><div class="hero-art"><img src="${unit.hero}" alt="${safe(unit.zhTitle)}教材插图"><div class="floating-label">${unit.emoji} ${safe(unit.zhTitle)}</div></div></section>
    <div class="section-head"><h2>今天的三个小任务</h2><button class="text-button" data-action="home-guide">🔊 听听怎么玩</button></div><section class="path">${[['listen','🎧',tr('听一听'),tr('听声音，找到对应图片'),'01'],['read','🧩',tr('认一认'),tr('看单词，找到对应图片'),'02'],['speak','🎙️',tr('说一说'),tr('跟着示范，试着说一句'),'03']].map(([id,icon,title,desc,n]) => `<button class="lesson" data-go="${id}"><span class="step">${n} / ${id === 'speak' ? tr('说') : id === 'read' ? tr('认') : tr('听')}</span><div class="big-icon">${icon}</div><h3>${title}</h3><p>${desc}</p><span class="arrow">↗</span></button>`).join('')}</section>
    <div class="bottom-note"><div><span class="mini-art">${unit.emoji}</span><b>去故事屋坐坐吧</b><span class="muted">　歌曲、故事，还有你的课本。</span></div><button class="secondary" data-go="library">去看看 →</button></div>
    <div class="unit-footer"><button class="text-button" data-go="catalog">← 选别的单元</button>${unit.id < 12 ? l10n`<button class="text-button" data-unit="${unit.id+1}">下一个单元：${safe(units[unit.id].title)} →</button>` : tr('<span class="muted">你来到了第十二个小世界 ✦</span>')}</div>`);
}
function tabs() {
  return l10n`<div class="tabs" role="group" aria-label="选择主题">${Object.entries(unit.groups).map(([id,g]) => `<button data-group="${id}" class="${group === id ? 'active' : ''}">${safe(g.name)} ${state.completed.includes(page+'-'+id) ? '✓' : ''}</button>`).join('')}</div>`;
}
function art(item) {
  if (item.type === 'number') return `<div class="number-art">${item.number}</div><span class="dots" aria-hidden="true">${'●'.repeat(item.number)}</span>`;
  if (item.type === 'colour') return `<div class="swatch" style="background:${item.hex}" aria-hidden="true"></div>`;
  return `<img class="${item.type === 'person' ? 'portrait' : 'vocab-art'}" src="${item.image}" alt="" loading="lazy">`;
}
function card(item,{hide=false,action='learn',className=''}={}) {
  return `<button class="card ${className}" data-action="${action}" data-id="${item.id}" aria-label="${hide ? tr('图片选项 ')+(unit.groups[group].items.indexOf(item)+1) : safe(item.word)}">${art(item)}${hide ? '' : l10n`<span class="word">${safe(item.word)}</span><span class="tiny">♫ 点一下，听一听</span>`}</button>`;
}
function learning() {
  if (quiz) return quizView();
  const read = page === 'read';
  return shell(heading(read ? 'LOOK & RECOGNISE' : 'LISTEN & DISCOVER',read ? tr('让单词和图片做好朋友') : tr('小耳朵，准备好了吗？'),read ? tr('先看看单词，再玩一轮“看词找图”。') : tr('点卡片听英语。准备好后，来玩“听音找图”。')) + tabs() + l10n`<section class="panel"><div class="instruction"><div><h3>${safe(unit.groups[group].name)}</h3><p>${read ? tr('先看一看这些词，点卡片也能听发音。') : tr('先点卡片熟悉声音，不着急，全都可以听很多遍。')}</p></div><button class="speak-prompt" data-action="learn-guide" aria-label="听操作说明">🔊</button></div><div class="cards">${unit.groups[group].items.map(x => card(x)).join('')}</div><div class="panel-footer"><small>${voiceCredit()}</small><button class="primary" data-action="quiz">${read ? tr('开始看词找图') : tr('开始听音找图')} →</button></div></section>`);
}
function shuffle(items) {
  const a = [...items];
  for (let i=a.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function startQuiz() {
  silence();
  quiz = {mode:page,group,index:0,items:shuffle(unit.groups[group].items).slice(0,5),tries:0,firstCorrect:0,retryIds:[],done:false};
  nextOptions(); render();
  const currentQuiz = quiz;
  guide(page === 'listen' ? tr('点小喇叭听英语，再找到对应的图片。') : tr('看看上面的英文单词，找到对应的图片。'), () => { if (quiz === currentQuiz && !quiz.done && quiz.index === 0 && page === 'listen' && !isCorrect) say(quiz.items[0].say); });
}
function nextOptions() {
  const target = quiz.items[quiz.index];
  quiz.options = shuffle([target,...shuffle(unit.groups[group].items.filter(x => x.id !== target.id)).slice(0,2)]);
  feedback = ''; selectedCard = ''; isCorrect = false; quiz.tries = 0;
}
function quizView() {
  if (quiz.done) return shell(l10n`<section class="panel reward"><div class="reward-icon">🌟</div><div class="eyebrow">LITTLE STEPS, BIG SMILES</div><h2>你完成了一个小挑战！</h2><p>这次练习了 ${quiz.items.length} 个词。<br>第一次就找到 ${quiz.firstCorrect} 个，${quiz.retryIds.length ? tr('还有 ')+quiz.retryIds.length+tr(' 个，我们下次再听听。') : tr('给自己一个大大的拥抱！')}</p><div class="notice">这一颗星记录你完成了${quiz.mode === 'read' ? tr('认词') : tr('听音')}练习。多玩几次，会越来越熟悉。</div><button class="primary" data-action="next-task">${quiz.mode === 'listen' ? tr('去认一认') : tr('去说一说')} →</button><button class="secondary" data-action="quiz-again">再玩一次</button></section>`);
  const target = quiz.items[quiz.index], listen = quiz.mode === 'listen';
  return shell(heading(listen ? 'LISTEN & FIND' : 'LOOK & FIND',listen ? tr('听一听，找到它') : tr('看一看，哪个是它？'),l10n`${unit.groups[group].name} · 第 ${quiz.index+1} / ${quiz.items.length} 题`) + l10n`<section class="panel"><div class="quiz-progress"><i style="width:${quiz.index/quiz.items.length*100}%"></i></div><div class="quiz-prompt">${listen ? tr('<button class="audio-orb" data-action="prompt" aria-label="播放英语题目">🔊</button><p class="muted">点喇叭，再选图片</p>') : l10n`<span class="eyebrow">FIND THE PICTURE</span><span class="english">${safe(target.word)}</span><button class="text-button" data-action="prompt">🔊 需要时，听一听</button>`}</div><div class="quiz-options">${quiz.options.map(x => card(x,{hide:true,action:'answer',className:selectedCard === x.id ? (isCorrect ? 'correct' : 'wrong') : ''})).join('')}</div><div class="feedback" role="status" aria-live="polite">${tr(feedback) || tr('慢慢来，可以反复听。')}</div><div class="quiz-next">${isCorrect ? `<button class="primary" data-action="next-question">${quiz.index === quiz.items.length-1 ? tr('完成挑战 ✦') : tr('下一题 →')}</button>` : ''}</div><div class="panel-footer"><button class="text-button" data-action="exit-quiz">← 回到卡片</button><button class="text-button" data-action="quiz-guide">🔊 听说明</button></div></section>`);
}
function answer(id) {
  if (!quiz || quiz.done || isCorrect || !quiz.options.some(x => x.id === id)) return;
  selectedCard = id; quiz.tries++; isCorrect = id === quiz.items[quiz.index].id;
  if (isCorrect) {
    if (quiz.tries === 1) quiz.firstCorrect++;
    feedback = tr('找到了！真棒，继续吧。'); guide(tr('找到了，真棒！'));
  } else {
    if (!quiz.retryIds.includes(quiz.items[quiz.index].id)) quiz.retryIds.push(quiz.items[quiz.index].id);
    feedback = tr('再听听、看看，还可以再试一次。');
    const currentQuiz = quiz, index = quiz.index;
    guide(tr('再试一次，点小喇叭听一听。'), () => { if (quiz === currentQuiz && quiz.index === index && !isCorrect && page === 'listen') say(quiz.items[index].say); });
  }
  render();
}
function nextQuestion() {
  if (!quiz || quiz.done || !isCorrect) return;
  quiz.index++;
  if (quiz.index === quiz.items.length) {
    quiz.done = true;
    const id = quiz.mode+'-'+group;
    if (!state.completed.includes(id)) state.completed.push(id);
    state.results.push({mode:quiz.mode,group,firstCorrect:quiz.firstCorrect,total:quiz.items.length,retryIds:[...quiz.retryIds],date:new Date().toISOString()});
    state.results = state.results.slice(-40); save(); guide(tr('小挑战完成啦！送你一颗小星星。'));
  } else nextOptions();
  render();
  if (!quiz.done && quiz.mode === 'listen') say(quiz.items[quiz.index].say);
}
function phrases() {
  return unit.phrases.map(p => {
    if (p.personal === 'name') return {...p,en:"I'm "+(profile.name === '小星星' ? '…' : profile.name)+'.'};
    if (p.personal === 'age' && profile.age) {
      const word = COURSE.numbers[Number(profile.age)-1].word;
      return {...p,en:"I'm "+word+'.',model:"I'm "+word+'.',zh:tr('告诉朋友你几岁。')};
    }
    return p;
  });
}
function recordControls() {
  if (recordUrl) return `<button class="secondary big-child-control" data-action="play-record"><span aria-hidden="true">🔁</span>${safe(tr('再听一次'))}</button><button class="primary big-child-control next-phrase" data-action="next-phrase"><span aria-hidden="true">${selectedPhrase < phrases().length-1 ? '➜' : '🏡'}</span>${safe(tr(selectedPhrase < phrases().length-1 ? '下一句' : '完成啦'))}</button>`;
  return recordFallback ? `<button class="secondary big-child-control" data-action="said"><span aria-hidden="true">✓</span>${safe(tr('我说好啦 ✓'))}</button>` : '';
}
function speak() {
  const all = phrases(), p = all[selectedPhrase];
  return shell(`<div class="page-heading speak-heading"><h1>${safe(tr('听一听，轮到你说啦'))}</h1><button class="speak-prompt" data-action="speak-guide" aria-label="${safe(tr('听听怎么玩'))}">🔊</button></div>` + `<div class="speech-layout"><div class="phrase-list" aria-label="${safe(tr('选择要练习的句子'))}">${all.map((phrase,i) => `<button data-phrase="${i}" aria-label="${safe(phrase.en)}" class="${selectedPhrase === i ? 'active' : ''} ${state.attempts.includes(i) ? 'practised' : ''}"><span class="phrase-number">${state.attempts.includes(i) ? '✓' : i+1}</span><span class="phrase-choice-text">${safe(phrase.en)}</span><span class="phrase-list-speaker" aria-hidden="true">🔊</span></button>`).join('')}</div><section class="panel record-panel"><div class="speaking-steps" aria-label="${safe(tr('听示范，按住说，听自己'))}"><span data-speech-step="model"><b aria-hidden="true">🎧</b>${safe(tr('听示范'))}</span><i aria-hidden="true">→</i><span data-speech-step="record"><b aria-hidden="true">🎙️</b>${safe(tr('按住说'))}</span><i aria-hidden="true">→</i><span data-speech-step="replay"><b aria-hidden="true">🔁</b>${safe(tr('听自己'))}</span></div><div class="phrase-en">${safe(p.en)}</div><div class="phrase-zh">${safe(p.zh)}</div><button class="secondary model-button" data-action="model"><span aria-hidden="true">🔊</span>${safe(tr('听英语示范'))}</button><div class="hold-area"><button id="hold-mic" class="mic ${recording ? 'recording' : ''}" data-action="record" aria-label="${safe(tr('按住录音，松开回放'))}" aria-pressed="${recording}"><span class="mic-symbol" aria-hidden="true">🎙️</span><span class="record-waves" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span></button><div class="hold-caption">${safe(tr('按住说 · 松开听'))}</div></div><div class="record-status" role="status" aria-live="polite">${safe(tr(recordStatus))}</div><div class="record-success" ${state.attempts.includes(selectedPhrase) ? '' : 'hidden'}><span aria-hidden="true">✦</span> ${safe(tr('记下这次勇敢开口啦'))}</div><div class="record-controls">${recordControls()}</div><button class="text-button speak-help" data-action="speak-guide">🔊 ${safe(tr('听听怎么玩'))}</button><div class="record-help">${safe(tr('最多录 20 秒，只在本页回放，不上传。'))}</div></section></div>`);
}
function updateRecordUI() {
  const mic = $('#hold-mic');
  if (!mic || typeof mic.setAttribute !== 'function') return;
  // Keep the held button in the DOM so pointer capture survives until release.
  mic.classList.toggle('recording',recording);
  mic.classList.toggle('preparing',recordPending);
  mic.setAttribute('aria-pressed',String(recording));
  document.querySelectorAll('[data-action="model"],[data-action="speak-guide"]').forEach(el => { el.disabled = recording || recordPending; });
  mic.setAttribute('aria-label',tr(recording ? '松开，听听自己的声音' : '按住录音，松开回放'));
  $('.record-status').textContent = tr(recordStatus);
  $('.record-controls').innerHTML = recordControls();
  $('.record-success').hidden = !state?.attempts.includes(selectedPhrase);
  const activeStep = recording ? 'record' : recordPhase;
  document.querySelectorAll('[data-speech-step]').forEach(el => el.classList.toggle('active',el.dataset.speechStep === activeStep));
  const selected = document.querySelector(`[data-phrase="${selectedPhrase}"]`);
  if (selected && state?.attempts.includes(selectedPhrase)) {
    selected.classList.add('practised');
    selected.querySelector('.phrase-number').textContent = '✓';
  }
  const pill = $('.star-pill');
  if (pill && unit) pill.textContent = l10n`✦ ${stars()} / ${maxStars(unit)} 颗星`;
}
function rememberSpeakingAttempt() {
  if (!state.attempts.includes(selectedPhrase)) state.attempts.push(selectedPhrase);
  if (!state.completed.includes('speak')) state.completed.push('speak');
  save();
}
function playModel() {
  if (recording || recordPending) return;
  const unitId = unit.id, index = selectedPhrase;
  say(phrases()[index].model, () => {
    if (page === 'speak' && unit?.id === unitId && selectedPhrase === index) { recordPhase = 'idle'; updateRecordUI(); }
  });
  recordPhase = 'model'; updateRecordUI();
}
function replayRecord() {
  if (!recordUrl || !recordAudio || recording || recordPending) return;
  silence();
  const player = recordAudio, file = recordUrl, generation = recordGeneration;
  player.src = file; recordPhase = 'replay'; recordStatus = '听听自己的声音'; updateRecordUI();
  player.onended = () => {
    if (recordAudio !== player || recordUrl !== file || recordGeneration !== generation || page !== 'speak' || recordPhase !== 'replay') return;
    recordPhase = 'idle'; recordStatus = '可以再按住说一次，也可以点大箭头'; updateRecordUI();
    guide('勇敢开口，真棒！');
  };
  player.play().catch(() => {
    if (recordAudio !== player || recordUrl !== file || recordGeneration !== generation || page !== 'speak') return;
    recordPhase = 'idle'; recordStatus = '点一下回放按钮，听听自己的声音'; updateRecordUI();
  });
}
function releaseRecord(discard = false) {
  if (!recordHeld && !recording && !recordPending) return;
  recordHeld = false; recordPointer = null;
  if (recordPending) { updateRecordUI(); return; }
  if (recording) {
    stopRecord(discard);
    if (discard) recordStatus = '按住小话筒，说完再松开';
    else recordStatus = '录好了，马上听听';
    updateRecordUI();
  }
}
async function record(pointerId = null) {
  if (recording || recordPending) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    recordFallback = true; recordStatus = '这个浏览器暂不支持录音。可以听示范后直接说。'; updateRecordUI(); guide(MIC_HELP); return;
  }
  silence(); clearRecord();
  const generation = ++recordGeneration, unitId = unit.id, phraseIndex = selectedPhrase;
  recordHeld = true; recordPointer = pointerId; recordPending = true;
  recordStatus = '请家长允许麦克风，准备好就能说啦';
  // Unlock this same audio element during the press for automatic iPad replay.
  const playback = new Audio('assets/voice/tap-silence.wav'); recordAudio = playback;
  playback.play().catch(() => {});
  updateRecordUI();
  try {
    const source = await navigator.mediaDevices.getUserMedia({audio:true});
    if (page !== 'speak' || unit?.id !== unitId || selectedPhrase !== phraseIndex || generation !== recordGeneration || document.hidden) { source.getTracks().forEach(t => t.stop()); return; }
    recordPending = false;
    if (!recordHeld) {
      source.getTracks().forEach(t => t.stop()); recordStatus = MIC_READY; updateRecordUI(); guide(MIC_READY); return;
    }
    stream = source; const chunks = [];
    const currentRecorder = new MediaRecorder(source); recorder = currentRecorder;
    let startedAt = 0;
    currentRecorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    currentRecorder.onstop = () => {
      source.getTracks().forEach(t => t.stop());
      if (page !== 'speak' || unit?.id !== unitId || selectedPhrase !== phraseIndex || generation !== recordGeneration || recorder !== currentRecorder) return;
      recording = false; recordHeld = false; recordPointer = null; recorder = null; stream = null;
      const blob = new Blob(chunks,{type:currentRecorder.mimeType});
      if (!blob.size || Date.now()-startedAt < 300) {
        recordStatus = '再按住久一点，说完再松开'; updateRecordUI(); guide(MIC_READY); return;
      }
      recordUrl = URL.createObjectURL(blob); rememberSpeakingAttempt();
      updateRecordUI(); replayRecord();
      $('.record-controls')?.scrollIntoView?.({behavior:'smooth',block:'nearest'});
    };
    currentRecorder.onerror = () => {
      if (generation !== recordGeneration) return;
      stopRecord(true); recordFallback = true; recordStatus = '录音遇到问题，可以直接开口练习。'; updateRecordUI(); guide(MIC_HELP);
    };
    currentRecorder.start(); startedAt = Date.now(); recording = true; recordPhase = 'record';
    recordStatus = '正在听你说 · 说完松开'; updateRecordUI();
    recordTimer = setTimeout(() => { if (recording && generation === recordGeneration) releaseRecord(); },20000);
  } catch (e) {
    if (generation !== recordGeneration) return;
    stopRecord(true); recordFallback = true;
    recordStatus = e.name === 'NotAllowedError' ? '麦克风没有开启。请家长帮忙允许，或直接开口练习。' : '麦克风暂不可用，可以直接开口练习。';
    updateRecordUI(); guide(MIC_HELP);
  }
}
function announcePage() {
  if (recording || recordPending) return;
  if (page === 'speak') {
    const unitId = unit.id, index = selectedPhrase;
    guide(SPEAK_GUIDE, () => { if (page === 'speak' && unit?.id === unitId && selectedPhrase === index) playModel(); });
  } else if (page === 'listen' || page === 'read') {
    guide(page === 'read' ? '看看卡片上的英文单词。点卡片可以听英语。准备好了，点开始看词找图。' : '点一张卡片听英语。都听过以后，点开始听音找图。');
  }
}
function nextPhrase() {
  silence(); clearRecord();
  if (selectedPhrase < phrases().length-1) { selectedPhrase++; render(); playModel(); }
  else { go('home'); guide('小挑战完成啦！送你一颗小星星。'); }
}

function pageCard(n, label = '') {
  return l10n`<button class="book-page" data-book="${n}"><img src="assets/unit-${String(unit.id).padStart(2,'0')}/page-${n}.webp" alt="课本第 ${n} 页" loading="lazy"><span>第 ${n} 页${label ? ' · '+safe(label) : ''} ↗</span></button>`;
}
function library() {
  const extras = [unit.clil && {n:unit.clil.page,label:unit.clil.zhTitle},unit.values && {n:unit.values.page,label:unit.values.zhTitle},...unit.reviewPages.map(n => ({n,label:tr('复习')}))].filter(Boolean);
  return shell(heading('STORY & SONG TIME',tr('故事屋，欢迎你'),tr('熟悉的教材原声。可以随时暂停、再听一次，也可以跟着一起唱。')) + l10n`<div class="library-grid">${unit.videos.map(v => l10n`<article class="media-card"><div class="media-cover" style="background:${v.id === 'Song' ? '#f6e4ad' : v.id === 'Language' ? '#dceade' : '#e9e2f2'}">${v.emoji}</div><div class="media-info"><h3>${safe(v.title)}</h3><p>${safe(v.description)}</p><button class="secondary" data-video="${v.id}">▷ 打开${v.id === 'Karaoke' ? tr('伴奏') : tr('视频')}</button></div></article>`).join('')}</div>
    <div class="section-head"><h2>翻翻我的课本</h2><small>Unit ${unit.id} · p.${unit.pages[0]}–${unit.pages.at(-1)}</small></div><div class="book-pages">${unit.pages.map(n => pageCard(n)).join('')}</div>
    ${extras.length ? l10n`<div class="section-head"><h2>再发现一点点</h2><small>小发现、好习惯和复习</small></div><div class="book-pages">${extras.map(x => pageCard(x.n,x.label)).join('')}</div>` : ''}
    <div class="section-head"><h2>课本原声小书架</h2><small>${unit.tracks.length} 段原声 · 可以反复听</small></div><div class="audio-list">${unit.tracks.map(t => l10n`<div class="audio-row"><div><b>${safe(t.title)}</b><small>课本 p.${t.page} · 音轨 ${t.id}</small></div><button class="secondary" data-track="${t.id}" aria-label="播放第${t.page}页音轨${t.id}">▷ 听原声</button></div>`).join('')}</div><p class="parent-copy">教材音视频来自你提供的 Kid’s Box New Generation 1 材料。${voiceCredit()}。</p>`);
}
let lastFocus = null;
function modal(content, options = {}) {
  if (recording || recordPending) { clearRecord(); updateRecordUI(); }
  closeModal(); silence(); lastFocus = document.activeElement;
  const el = document.createElement('div'); el.className = 'overlay'+(options.book ? ' book-overlay' : '');
  el.innerHTML = l10n`<section class="modal${options.book ? ' book-reader' : ''}" role="dialog" aria-modal="true" aria-label="内容窗口">${content}</section>`;
  document.body.append(el); document.body.classList.add('modal-open');
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-close]')) closeModal(); });
  el.querySelector('button,input')?.focus();
}
function closeModal() {
  const el = $('.overlay'); if (!el) return;
  if (el.classList.contains('book-overlay')) window.LEARNING_BOOK_READER?.destroy();
  el.querySelectorAll('video,audio').forEach(m => m.pause()); el.remove(); document.body.classList.remove('modal-open'); silence();
  if (lastFocus?.isConnected) lastFocus.focus(); lastFocus = null;
}
function modalHead(title) { return l10n`<div class="modal-head"><h2>${safe(title)}</h2><button class="close" data-close aria-label="关闭">×</button></div>`; }
function media(kind,id) {
  const info = (kind === 'video' ? unit.videos : unit.tracks).find(x => x.id === id); if (!info) return;
  const tag = kind === 'video' ? 'video' : 'audio';
  modal(modalHead(info.title) + l10n`<${tag} controls playsinline preload="metadata" src="${info.src}"></${tag}><p class="parent-copy">点击播放开始。可以暂停，再听一次。教材原声 · Unit ${unit.id}</p><p id="media-error" role="status"></p>`);
  $('.modal').querySelector(tag).addEventListener('error', () => { $('#media-error').textContent = tr('这段内容暂时没能加载，请重新打开。'); });
}
function book(n) {
  if (![...unit.pages,...unit.extraPages].includes(n)) return;
  if (!window.LEARNING_BOOK_READER) { toast(tr('课本暂时无法打开，请刷新页面。')); return; }
  modal('',{book:true});
  window.LEARNING_BOOK_READER.open($('.modal'),{unit,page:n,tr,safe,locale:I18N.locale,onBeforePlay:silence});
}
function legalFooter() {
  const legal=window.LEARNING_LEGAL;
  if(!legal)return '';
  return `<footer class="legal-footer"><span>${safe(legal.short(I18N.locale))}</span><button class="text-button" data-action="copyright">${safe(legal.title(I18N.locale))}</button></footer>`;
}
function copyright() {
  if (!window.LEARNING_LEGAL) return;
  modal(modalHead(window.LEARNING_LEGAL.title(I18N.locale))+window.LEARNING_LEGAL.html(I18N.locale));
}
function parent() {
  const allStates = units.map(u => ({u,s:unit?.id === u.id ? state : readState(u)}));
  const heard = allStates.reduce((n,x) => n+x.s.seen.length,0);
  const recognised = allStates.reduce((n,x) => n+x.s.results.filter(r => r.mode === 'read').length,0);
  const attempts = allStates.reduce((n,x) => n+x.s.attempts.length,0);
  const recent = allStates.flatMap(({u,s}) => s.results.map(r => ({...r,u}))).sort((a,b) => b.date.localeCompare(a.date)).slice(0,6);
  modal(modalHead(tr('家长角落')) + l10n`<p class="parent-copy">本地版包含 Unit 1–12。每个单元分别保存学习记录；称呼与年龄在所有单元共用。记录保存在当前浏览器，换设备后不会同步。</p><div class="stats"><div class="stat"><strong>${heard}</strong><small>点听过的词卡</small></div><div class="stat"><strong>${recognised}</strong><small>完成认词练习</small></div><div class="stat"><strong>${attempts}</strong><small>尝试过的小句子</small></div></div><label>孩子的称呼<input id="child-name" maxlength="12" value="${safe(profile.name === '小星星' ? '' : profile.name)}" placeholder="${safe(tr('小星星'))}" autocomplete="off"></label><label>年龄（用于 Unit 1 跟读示范）<select id="child-age"><option value="">暂不设置</option>${COURSE.numbers.map(n => l10n`<option value="${n.number}" ${String(profile.age) === String(n.number) ? 'selected' : ''}>${n.number} 岁</option>`).join('')}</select></label><button class="primary" data-action="save-profile">保存设置</button>
    <h3 style="margin-top:27px">各单元的小脚印</h3><div class="parent-unit-list">${allStates.map(({u,s}) => `<button class="parent-unit-row" data-unit="${u.id}"><span>${u.emoji} Unit ${u.id} · ${safe(u.zhTitle)}</span><b>✦ ${s.completed.length}/${maxStars(u)}</b></button>`).join('')}</div>
    <h3 style="margin-top:27px">最近练习</h3><div class="parent-copy">${recent.length ? recent.map(r => l10n`<p>Unit ${r.u.id} · ${r.mode === 'listen' ? tr('听音找图') : tr('看词找图')} · ${safe(r.u.groups[r.group].name)}：首次答对 ${r.firstCorrect}/${r.total}${r.retryIds.length ? tr('；再练练 ')+r.retryIds.map(id => safe(r.u.groups[r.group].items.find(i => i.id === id)?.word || id)).join('、') : ''}</p>`).join('') : tr('还没有完成的挑战，先让她自由点听也很好。')}</div>
    <div class="notice">录音只在本页回放，不上传。离开说话页面或切换单元即清除。成功录音或点击“我说好啦”会记录一次开口尝试，没有自动发音评分。</div><p class="parent-copy">${voiceCredit()}。故事屋包含本单元教材原声与视频；偶数单元还收录跨学科、品格和对应复习页。平板建议使用 Safari 或 Chrome。</p>${window.LEARNING_ACCESS ? `<button class="secondary" data-action="lock-site">🔒 ${safe(tr('锁定课程入口'))}</button>` : ''}${unit ? l10n`<div class="button-row"><button class="secondary" data-action="reset-ask">重新开始 Unit ${unit.id} 的学习记录</button></div>` : ''}`);
}
function markSaid() {
  if (recording || recordPending) { toast(tr('先松开小话筒，再继续')); return; }
  rememberSpeakingAttempt(); toast(tr('记下了你的勇敢尝试！✦')); guide(tr('勇敢开口，真棒！'));
  if (selectedPhrase < phrases().length-1) { clearRecord(); selectedPhrase++; }
  render();
}
function handle(e) {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.dataset.unit) { navigate(Number(b.dataset.unit)); return; }
  if (b.dataset.resume) { const u=units.find(u => u.id === Number(b.dataset.resume)); const s=readState(u); navigate(u.id,s.last,s.lastGroup); announcePage(); return; }
  if (b.dataset.go) { go(b.dataset.go); announcePage(); return; }
  if (b.dataset.group) { navigate(unit.id,page,b.dataset.group); return; }
  if (b.dataset.phrase !== undefined) { silence(); clearRecord(); selectedPhrase=Number(b.dataset.phrase); render(); playModel(); return; }
  if (b.dataset.book) { book(Number(b.dataset.book)); return; }
  if (b.dataset.video) { media('video',b.dataset.video); return; }
  if (b.dataset.track) { media('audio',b.dataset.track); return; }
  switch (b.dataset.action) {
    case 'start': go(state.last); announcePage(); break;
    case 'home-guide': guide(tr('先听一听，再认一认，最后说一说。点你喜欢的小任务就可以开始。')); break;
    case 'learn': {
      const item=unit.groups[group].items.find(x => x.id === b.dataset.id); if (!item) return;
      say(item.say); if (!state.seen.includes(item.id)) { state.seen.push(item.id); save(); }
      b.classList.add('selected'); setTimeout(() => b.classList.remove('selected'),900); break;
    }
    case 'learn-guide': guide(page === 'read' ? tr('看看卡片上的英文单词。点卡片可以听英语。准备好了，点开始看词找图。') : tr('点一张卡片听英语。都听过以后，点开始听音找图。')); break;
    case 'quiz': startQuiz(); break;
    case 'prompt': if (quiz && !quiz.done) say(quiz.items[quiz.index].say); break;
    case 'answer': answer(b.dataset.id); break;
    case 'next-question': nextQuestion(); break;
    case 'quiz-guide': guide(quiz.mode === 'listen' ? tr('点小喇叭听英语，再选对应的图片。答错可以再试一次。') : tr('看上面的英文，选出对应的图片。需要帮助，可以点听一听。')); break;
    case 'exit-quiz': silence(); quiz=null; render(); break;
    case 'quiz-again': startQuiz(); break;
    case 'next-task': go(quiz.mode === 'listen' ? 'read' : 'speak'); announcePage(); break;
    case 'model': playModel(); break;
    case 'speak-guide': announcePage(); break;
    case 'next-phrase': nextPhrase(); break;
    case 'record': if (e.detail === 0 && Date.now() >= micClickGuardUntil && !['touch','pen'].includes(e.pointerType)) { if (recording || recordPending) releaseRecord(); else record(); } break;
    case 'play-record': replayRecord(); break;
    case 'said': markSaid(); break;
    case 'parent': parent(); break;
    case 'copyright': copyright(); break;
    case 'lock-site': window.LEARNING_ACCESS?.lock(); break;
    case 'save-profile':
      profile.name=$('#child-name').value.trim() || '小星星'; profile.age=$('#child-age').value;
      writeJSON(profileKey,profile); closeModal(); render(); toast(tr('设置已保存')); break;
    case 'reset-ask':
      modal(modalHead(l10n`重新开始 Unit ${unit.id}？`) + tr('<p>将清除这个单元的学习记录，保留其他单元、称呼与年龄。</p><div class="button-row"><button class="secondary" data-close>保留记录</button><button class="primary" data-action="reset-confirm">清除这个单元的记录</button></div>')); break;
    case 'reset-confirm': state=freshState(); state.lastGroup=Object.keys(unit.groups)[0]; group=state.lastGroup; selectedPhrase=0; save(); closeModal(); go('home'); render(); break;
  }
}
function render() {
  document.documentElement.lang = I18N.locale;
  const description = document.querySelector('meta[name="description"]');
  if (description) description.content = tr('十二个英语小冒险，一起听、认、说。');
  document.title = unit ? l10n`小星星英语 · Unit ${unit.id} ${unit.title}` : tr('小星星英语 · 单元目录');
  app.innerHTML = page === 'catalog' ? catalog() : page === 'home' ? home() : page === 'listen' || page === 'read' ? learning() : page === 'speak' ? speak() : library();
}
app.addEventListener('pointerdown', e => {
  const mic = e.target.closest('[data-action="record"]');
  if (!mic || e.button !== 0 || recordHeld || recordPending) return;
  e.preventDefault(); micClickGuardUntil = Date.now()+700; record(e.pointerId);
  try { mic.setPointerCapture(e.pointerId); } catch {}
});
for (const type of ['pointerup','pointercancel','lostpointercapture']) document.addEventListener(type,e => {
  if (e.target?.closest?.('[data-action="record"]') || recordPointer === e.pointerId) micClickGuardUntil = Date.now()+700;
  if (recordPointer !== e.pointerId) return;
  e.preventDefault(); releaseRecord(type !== 'pointerup');
});
app.addEventListener('contextmenu',e => { if (e.target.closest('[data-action="record"]')) e.preventDefault(); });
app.addEventListener('keydown',e => {
  if (!e.target.closest('[data-action="record"]') || ![' ','Enter'].includes(e.key)) return;
  e.preventDefault(); micClickGuardUntil = Date.now()+700; if (!e.repeat) record();
});
app.addEventListener('keyup',e => {
  if (!e.target.closest('[data-action="record"]') || ![' ','Enter'].includes(e.key)) return;
  e.preventDefault(); micClickGuardUntil = Date.now()+700; releaseRecord();
});
app.addEventListener('click',handle);
app.addEventListener('change', e => { if (e.target.id === 'learning-language') changeLanguage(e.target.value); });
document.addEventListener('click',e => { if (e.target.closest('.overlay')) handle(e); });
document.addEventListener('keydown',e => {
  if (e.key === 'Escape') { releaseRecord(true); closeModal(); }
  const overlay=$('.overlay');
  if (e.key === 'Tab' && overlay) {
    const focusable=[...overlay.querySelectorAll('button,input,select,audio,video,[href]')].filter(el => !el.disabled && !el.hidden);
    const first=focusable[0],last=focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }
});
document.addEventListener('visibilitychange',() => {
  if (document.hidden) { silence(); if (recording || recordPending) { clearRecord(); updateRecordUI(); } }
});
window.addEventListener('blur', () => { if (recording || recordPending) releaseRecord(true); });
window.addEventListener('hashchange',applyRoute);
window.addEventListener('pagehide',() => { silence(); clearRecord(); });
applyRoute();
