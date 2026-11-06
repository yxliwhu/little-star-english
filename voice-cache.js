'use strict';
(() => {
  const CACHE_NAME = 'little-star-voice-20261106-v1';
  const MAX_BYTES = 8 * 1024 * 1024;
  const MAX_CLIP = 256 * 1024;
  const memory = new Map(), jobs = new Map(), failed = new Map();
  let queue = [], running = 0, bytes = 0, pinned = null, storage;
  // An inline 50 ms WAV unlocks the shared audio element during the child's tap.
  const silence = 'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

  function key(file) {
    try {
      const url = new URL(file, document.baseURI);
      return url.origin === location.origin && url.pathname.includes('/assets/voice/') && /\.(mp3|wav)$/i.test(url.pathname) ? url.href : null;
    } catch { return null; }
  }
  function touch(id) {
    const entry = memory.get(id);
    if (entry) { memory.delete(id); memory.set(id, entry); }
    return entry?.url || null;
  }
  function keep(id, blob) {
    const existing = touch(id);
    if (existing) return existing;
    const url = URL.createObjectURL(blob);
    memory.set(id, {url, size: blob.size}); bytes += blob.size;
    for (const [old, entry] of memory) {
      if (bytes <= MAX_BYTES) break;
      if (old === pinned || old === id) continue;
      memory.delete(old); bytes -= entry.size; URL.revokeObjectURL(entry.url);
    }
    return url;
  }
  function disk() {
    if (!storage) storage = (async () => {
      try { return await window.caches?.open(CACHE_NAME) || null; } catch { return null; }
    })();
    return storage;
  }
  async function download(job) {
    const cache = await disk();
    let response = null;
    try { response = await cache?.match(job.id); } catch {}
    if (response) {
      try {
        const blob = await response.blob();
        if (blob.size > 0 && blob.size <= MAX_CLIP && blob.type.startsWith('audio/')) return keep(job.id, blob);
      } catch {}
      try { await cache?.delete(job.id); } catch {}
    }
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 12000) : null;
    let blob;
    try {
      response = await fetch(job.id, {credentials:'same-origin', priority:job.urgent ? 'high' : 'low', ...(controller ? {signal:controller.signal} : {})});
      if (response.status !== 200 || !response.headers.get('Content-Type')?.startsWith('audio/')) throw new Error('Voice unavailable');
      blob = await response.blob();
    } finally { if (timeout !== null) clearTimeout(timeout); }
    if (!blob.size || blob.size > MAX_CLIP) throw new Error('Voice size invalid');
    const url = keep(job.id, blob);
    // Cache complete files, never browser byte ranges or the child's recordings.
    if (cache) cache.put(job.id, new Response(blob, {headers:{'Content-Type':blob.type}})).catch(() => {});
    return url;
  }
  function pump() {
    while (queue.length && (running < 3 || running < 4 && queue[0].urgent)) {
      const job = queue.shift(); running++; job.started = true;
      download(job).then(url => { failed.delete(job.id); job.resolve(url); }, () => {
        failed.set(job.id, Date.now()); job.resolve(null);
      }).finally(() => { jobs.delete(job.id); running--; pump(); });
    }
  }
  function load(file, {urgent=false} = {}) {
    const id = key(file);
    if (!id || !window.fetch || !URL.createObjectURL) return Promise.resolve(null);
    const ready = touch(id);
    if (ready) return Promise.resolve(ready);
    const existing = jobs.get(id);
    if (existing) {
      if (urgent && !existing.started) {
        existing.urgent = true; queue = [existing, ...queue.filter(job => job !== existing)]; pump();
      }
      return existing.promise;
    }
    if (!urgent && failed.has(id) && Date.now() - failed.get(id) < 30000) return Promise.resolve(null);
    const job = {id, urgent, started:false};
    job.promise = new Promise(resolve => { job.resolve = resolve; });
    jobs.set(id, job); urgent ? queue.unshift(job) : queue.push(job); pump();
    return job.promise;
  }
  function preload(files) {
    const unique = [...new Set(files.filter(Boolean))];
    const wanted = new Set(unique.map(key).filter(Boolean));
    queue = queue.filter(job => {
      if (job.urgent || wanted.has(job.id)) return true;
      jobs.delete(job.id); job.resolve(null); return false;
    });
    for (const file of unique) load(file);
  }
  window.LEARNING_VOICE_CACHE = {
    load, preload, silence,
    peek(file) { const id = key(file); return id ? touch(id) : null; },
    pin(file) { pinned = file ? key(file) : null; }
  };
})();
