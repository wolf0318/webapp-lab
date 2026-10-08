/* 말로 만드는 수업 웹앱 — 제미나이 API로 웹앱(HTML 한 파일)을 만들고, 말로 고칩니다.
   - 키는 코드에 넣지 않아요. 관리자가 이 기기에 저장하거나, 연수 코드로 잠근 선생님용 링크(#c=…)로 받아요.
   - 만든 앱은 runner.html을 sandbox(빈 출처)로 열어 띄워요. 앱은 이 사이트의 저장소(키)를 읽을 수 없고 인터넷에도 연결할 수 없어요.
   - 만든 앱의 글은 이 페이지에 HTML로 넣지 않아요(코드 보기는 글자로만 보여 줘요). */
(function () {
  'use strict';
  const L = window.LabForm, $ = s => document.querySelector(s), esc = L.esc, store = L.store;

  /* ---------- 설정 ---------- */
  const MODELS = [
    ['gemini-3.5-flash-lite', '제미나이 3.5 Flash-Lite (기본, 빠름)'],
    ['gemini-3.1-flash-lite', '제미나이 3.1 Flash-Lite'],
    ['gemini-flash-latest', '제미나이 Flash 최신 (붐비면 느리거나 멈출 수 있음)']
  ];
  // 앞 모델이 붐비거나(503·429) 시간 안에 답을 시작하지 않으면 다음 모델로 넘어갑니다.
  const FALLBACK = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
  const FIRST_MS = 25000, STALL_MS = 40000, TOTAL_MS = 5 * 60 * 1000;
  const RL_COUNT = 10, RL_WINDOW = 10 * 60 * 1000;
  const MAX_FIRST = 3000, MAX_FIX = 600, MAX_VERSIONS = 12;
  const K = { key: 'lab.gk', model: 'lab.gm', rl: 'lab.rl', session: 'lab.maker.session', form: 'lab.maker.form', helper: 'lab.helper.form', pending: 'lab.pending' };

  const SYS = [
    '너는 초등·중학교 선생님이 수업에 쓸 웹앱을 만들어 주는 도우미야. 선생님의 요청에 맞는 웹앱을 HTML 파일 하나로 만들어.',
    '반드시 지킬 것:',
    '1. 답에는 <!DOCTYPE html>로 시작해서 </html>로 끝나는 완성된 HTML 문서 하나만 써. 설명, 인사, 마크다운 코드 표시(```)는 쓰지 마.',
    '2. CSS와 JavaScript는 모두 이 파일 안에 넣어. 외부 주소(CDN, 웹 글꼴, 외부 그림, 외부 스크립트)는 하나도 쓰지 마. 그림은 SVG, CSS, 이모지로 그려.',
    '3. fetch, XMLHttpRequest, WebSocket 같은 인터넷 연결과 localStorage, sessionStorage, 쿠키, indexedDB는 쓰지 마. alert, confirm, prompt 대신 화면 안에 메시지를 보여 줘.',
    '4. 화면의 모든 글은 한국어로, 학생이 읽기 쉬운 말로 써.',
    '5. 계산, 정답, 교과 내용은 정확해야 해. 채점은 선생님이 요청한 채점 기준을 그대로 따르고, 맞았는지 틀렸는지 화면에 바로 알려 줘.',
    '6. 태블릿과 컴퓨터 화면에 맞게 만들고, 버튼과 글씨는 크게 해.',
    '7. 꼭 필요한 기능만 넣어 코드를 간결하게 써(대략 600줄 이내).',
    '8. 고쳐 달라는 요청을 받으면 고친 부분만이 아니라 고친 뒤의 HTML 문서 전체를 다시 써. 선생님이 고쳐 달라고 하지 않은 기능은 그대로 둬.'
  ].join('\n');

  /* ---------- 키 ---------- */
  // 기기 안에 키를 둘 때 그대로 보이지 않게만 섞어 둡니다.
  const mix = k => 'g1' + btoa(unescape(encodeURIComponent(k.split('').reverse().join('')))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  function unmix(s) { try { if (!s || !s.startsWith('g1')) return ''; s = s.slice(2).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))).split('').reverse().join(''); } catch (e) { return ''; } }
  const getKey = () => unmix(store.get(K.key, ''));
  const setKey = k => store.set(K.key, mix(k));
  const getModel = () => { const m = store.get(K.model, MODELS[0][0]); return MODELS.some(x => x[0] === m) ? m : MODELS[0][0]; };
  const maskKey = k => k ? k.slice(0, 4) + '…' + k.slice(-4) : '';

  // 선생님용 링크: API 키를 '연수 코드'로 잠가서(PBKDF2 + AES-GCM) 링크에 담습니다. 링크만으로는 키를 꺼낼 수 없어요.
  const b64u = u8 => btoa(String.fromCharCode(...u8)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  function unb64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s); return Uint8Array.from(b, c => c.charCodeAt(0)); }
  async function codeKey(code, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(code.normalize('NFC').trim()), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function sealKey(apiKey, code) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await codeKey(code, salt), new TextEncoder().encode(apiKey)));
    const all = new Uint8Array(1 + salt.length + iv.length + ct.length); all[0] = 1; all.set(salt, 1); all.set(iv, 17); all.set(ct, 29);
    return b64u(all);
  }
  async function openSealed(blob, code) {
    const b = unb64u(blob);
    if (b[0] !== 1 || b.length < 45) throw new Error('bad');
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(17, 29) }, await codeKey(code, b.slice(1, 17)), b.slice(29));
    return new TextDecoder().decode(pt);
  }
  const appBase = () => location.origin + location.pathname;
  // 선생님용 링크(#c=…)로 들어오면 주소에서 바로 지우고, 연수 코드를 물어봅니다.
  (function takeSealedFromLink() {
    const m = location.hash.match(/^#c=([A-Za-z0-9_-]{40,})/);
    if (!m) return;
    store.set(K.pending, m[1]);
    history.replaceState(null, '', location.pathname + location.search);
  })();

  /* ---------- 작은 도구 ---------- */
  let toastT = 0;
  const toast = t => { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2600); };
  const fmtSec = ms => { const s = Math.round(ms / 1000); return s < 60 ? s + '초' : Math.floor(s / 60) + '분 ' + (s % 60) + '초'; };
  const modelName = m => (MODELS.find(x => x[0] === m) || [m, m])[1].replace(/\s*\(.*\)$/, '');
  function rateLeft() {
    const now = Date.now();
    const log = (store.get(K.rl, []) || []).filter(t => now - t < RL_WINDOW);
    store.set(K.rl, log);
    if (log.length < RL_COUNT) return 0;
    return Math.max(1, Math.ceil((RL_WINDOW - (now - log[0])) / 60000));
  }
  function noteUsed() { const log = store.get(K.rl, []) || []; log.push(Date.now()); store.set(K.rl, log.slice(-RL_COUNT * 2)); }

  /* ---------- 연결 상태 ---------- */
  function renderConn() {
    const k = getKey(), el = $('#conn');
    if (k) {
      const used = (store.get(K.rl, []) || []).filter(t => Date.now() - t < RL_WINDOW).length;
      el.innerHTML = `<span class="pill on">● 연결됨</span><span>앱 만들기·고치기는 10분에 ${RL_COUNT}번까지 할 수 있어요 (지금 ${used}번)</span>`;
    } else {
      el.innerHTML = `<span class="pill off">● 아직 연결 안 됨</span><span>AI로 만들려면 연수 담당 선생님께 받은 링크와 연수 코드로 한 번 연결해 주세요.</span><button type="button" class="btn sm" id="connBtn">연결하기</button>`;
      $('#connBtn').onclick = () => openUnlock();
    }
  }

  /* ---------- 요청 쓰기 ---------- */
  const form = L.renderForm($('#form'), { prefix: 'm', onChange: f => { store.set(K.form, f); renderPeek(f); } });
  function renderPeek(f) {
    $('#peek').innerHTML = L.previewHTML(f);
    const w = L.check(f);
    $('#warns').innerHTML = w.map(x => `<li class="${x.lv}">${esc(x.t)}</li>`).join('');
  }
  let tab = 'form';
  function setTab(t) {
    tab = t;
    $('#tabForm').setAttribute('aria-selected', t === 'form'); $('#tabFree').setAttribute('aria-selected', t === 'free');
    $('#formBox').hidden = t !== 'form'; $('#freeBox').hidden = t !== 'free';
  }
  $('#tabForm').onclick = () => setTab('form');
  $('#tabFree').onclick = () => setTab('free');
  const freeCount = () => { $('#freeCount').textContent = $('#free').value.length + ' / ' + MAX_FIRST + '자'; };
  $('#free').addEventListener('input', freeCount);
  $('#useDemo').onclick = () => { $('#free').value = L.DEMO_PROMPT; freeCount(); };
  $('#useForm').onclick = () => { $('#free').value = L.build(form.read()); freeCount(); };
  document.querySelector('#formBox .presets').addEventListener('click', e => {
    const b = e.target.closest('[data-preset]'); if (!b) return;
    const k = b.dataset.preset;
    if (k === 'empty') form.fill(L.EMPTY);
    else if (k === 'helper') form.fill(store.get(K.helper, L.EMPTY));
    else { form.fill(L.PRESETS[k].f); toast(L.PRESETS[k].note); }
  });
  if (store.get(K.helper, null)) $('#fromHelper').hidden = false;
  form.fill(store.get(K.form, null) || L.EMPTY);
  freeCount();

  /* ---------- 앱 기록(이 기기에만) ---------- */
  let S = store.get(K.session, null);
  if (!S || !Array.isArray(S.versions)) S = { first: '', versions: [], cur: -1, log: [] };
  function saveS() {
    if (store.set(K.session, S)) return;
    // 저장 공간이 모자라면 오래된 버전부터 덜어 냅니다.
    while (S.versions.length > 2) {
      S.versions.shift(); S.cur = Math.max(0, S.cur - 1);
      S.log.forEach(x => { if (typeof x.v === 'number') x.v -= 1; });
      if (store.set(K.session, S)) return;
    }
  }

  /* ---------- 제미나이 부르기 ---------- */
  const thinkFor = m => /lite|3\.5|3\.6/.test(m) ? 'minimal' : 'low';
  const noThink = new Set(), slowAt = new Map();
  const slow = { add: m => slowAt.set(m, Date.now()), has: m => Date.now() - (slowAt.get(m) || 0) < 120000 };
  async function callGemini(contents, onText, signal) {
    const key = getKey();
    if (!key) throw { code: 'nokey' };
    const prefer = getModel();
    let list = [prefer].concat(FALLBACK.filter(m => m !== prefer));
    list = list.filter(m => !slow.has(m)).concat(list.filter(m => slow.has(m)));
    let lastErr = null;
    for (let mi = 0; mi < list.length; mi++) {
      const model = list[mi];
      const body = { contents, systemInstruction: { parts: [{ text: SYS }] }, generationConfig: { temperature: 0.4, maxOutputTokens: 32768 } };
      if (!noThink.has(model)) body.generationConfig.thinkingConfig = { thinkingLevel: thinkFor(model) };
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
      const ac = new AbortController(); let timedOut = false, timer = 0;
      const arm = ms => { clearTimeout(timer); timer = setTimeout(() => { timedOut = true; ac.abort(); }, ms); };
      const onOuter = () => ac.abort();
      if (signal) { if (signal.aborted) throw { code: 'abort' }; signal.addEventListener('abort', onOuter, { once: true }); }
      const cleanup = () => { clearTimeout(timer); if (signal) signal.removeEventListener('abort', onOuter); };
      onText('', model, true);
      arm(FIRST_MS);
      let res;
      try { res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), signal: ac.signal, referrerPolicy: 'strict-origin-when-cross-origin', credentials: 'omit' }); }
      catch (e) {
        cleanup();
        if (timedOut) { slow.add(model); lastErr = { code: 'slow', model }; continue; }
        if (signal && signal.aborted) throw { code: 'abort' };
        lastErr = { code: 'net' }; continue;
      }
      if (!res.ok) {
        cleanup();
        let m = ''; try { const j = await res.json(); m = (j.error && j.error.message) || ''; } catch (e) { }
        lastErr = { code: 'http', status: res.status, msg: m, model };
        if (res.status === 400 && /thinking/i.test(m) && !noThink.has(model)) { noThink.add(model); mi--; continue; }
        if (res.status === 404 || res.status === 429 || res.status >= 500) { if (res.status !== 404) slow.add(model); continue; }
        throw lastErr;
      }
      arm(FIRST_MS);
      const reader = res.body.getReader(), dc = new TextDecoder(); let buf = '', text = '', finish = '', gotAny = false;
      try {
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          buf += dc.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
            if (!line.startsWith('data:')) continue;
            const js = line.slice(5).trim(); if (!js || js === '[DONE]') continue;
            try {
              const j = JSON.parse(js); const c0 = (j.candidates || [])[0] || {};
              if (c0.finishReason) finish = c0.finishReason;
              if (j.promptFeedback && j.promptFeedback.blockReason) finish = 'BLOCKED';
              const parts = (c0.content || {}).parts || [];
              for (const p of parts) if (p.text && !p.thought) { text += p.text; gotAny = true; onText(text, model); }
            } catch (e) { }
          }
          arm(gotAny ? STALL_MS : FIRST_MS);
        }
      } catch (e) {
        cleanup();
        if (signal && signal.aborted && !timedOut) throw { code: 'abort', text };
        if (timedOut && !text) { slow.add(model); lastErr = { code: 'slow', model }; continue; }
        if (timedOut) return { text, model, finish: 'STALL' };
        throw { code: 'net', text };
      }
      cleanup();
      return { text, model, finish };
    }
    throw lastErr || { code: 'net' };
  }

  function errText(e) {
    e = e || {};
    if (e.code === 'nokey') return '아직 연결하지 않았어요. 위의 연결하기를 눌러 주세요.';
    if (e.code === 'slow') return '제미나이가 지금 붐벼서 만들기를 시작하지 못했어요. 1분쯤 뒤에 다시 해 주세요.';
    if (e.code === 'http') {
      if (e.status === 400 && /api key/i.test(e.msg)) return '넣어 둔 키가 맞지 않아요. 연수 담당 선생님께 알려 주세요.';
      if (e.status === 400) return '요청을 처리하지 못했어요. 요청을 조금 짧게 바꿔서 다시 해 주세요.';
      if (e.status === 401 || e.status === 403) return '이 키로는 만들 수 없어요. 연수 담당 선생님께 알려 주세요.';
      if (e.status === 429) return '지금 요청이 몰렸어요. 1분쯤 뒤에 다시 해 주세요.';
      if (e.status >= 500) return '제미나이 서버가 잠시 답하지 않아요. 잠시 뒤에 다시 해 주세요.';
    }
    return '답을 받지 못했어요. 인터넷 연결을 확인한 뒤 다시 해 주세요.';
  }

  // 답에서 HTML 문서만 꺼냅니다.
  function extractHtml(t) {
    let s = String(t || '').replace(/^\s*```[a-zA-Z]*\s*\n?/, '');
    const i = s.search(/<!doctype html|<html[\s>]/i);
    if (i < 0) return null;
    s = s.slice(i);
    const j = s.toLowerCase().lastIndexOf('</html>');
    if (j < 0) return { html: s, complete: false };
    return { html: s.slice(0, j + 7), complete: true };
  }
  const titleOf = h => { const m = String(h).match(/<title[^>]*>([^<]{1,80})<\/title>/i); return m ? m[1].replace(/\s+/g, ' ').trim() : ''; };

  /* ---------- 만들기 · 고치기 ---------- */
  let busy = false, ac = null, tick = 0;
  function setBusy(on, label) {
    busy = on;
    $('#busy').hidden = !on;
    ['#makeBtn', '#askBtn', '#newBtn'].forEach(s => { $(s).disabled = on; });
    if (on) {
      const t0 = Date.now(); $('#busyT').textContent = label; $('#busyS').textContent = '0초'; $('#tail').textContent = '';
      clearInterval(tick); tick = setInterval(() => { $('#busyS').dataset.t = fmtSec(Date.now() - t0); paintBusy(); }, 1000);
      $('#busyS').dataset.t = '0초'; $('#busyS').dataset.n = '0'; $('#busyS').dataset.m = ''; paintBusy();
    } else clearInterval(tick);
  }
  function paintBusy() {
    const d = $('#busyS').dataset;
    $('#busyS').textContent = `${d.t}${+d.n ? ' · 코드 ' + (+d.n).toLocaleString('ko-KR') + '자 받음' : ' · 기다리는 중'}${d.m ? ' · ' + modelName(d.m) : ''}`;
  }

  async function run(job) {
    if (busy) return;
    if (!getKey()) { openUnlock(); return; }
    const wait = rateLeft();
    if (wait) { addLog({ r: 'x', t: `짧은 시간에 많이 만드셨어요. ${wait}분쯤 뒤에 다시 해 주세요.` }); return; }
    const contents = job.kind === 'first'
      ? [{ role: 'user', parts: [{ text: job.text }] }]
      : [{ role: 'user', parts: [{ text: S.first }] }, { role: 'model', parts: [{ text: S.versions[job.base].html }] },
        { role: 'user', parts: [{ text: '위 웹앱을 고쳐 줘. ' + job.text + '\n고친 뒤의 HTML 문서 전체를 처음부터 끝까지 다시 써 줘.' }] }];
    noteUsed(); renderConn();
    setBusy(true, job.kind === 'first' ? '앱을 만드는 중…' : '말한 대로 고치는 중…');
    ac = new AbortController();
    const t0 = Date.now();
    let tooLong = false;
    const total = setTimeout(() => { tooLong = true; if (ac) ac.abort(); }, TOTAL_MS);
    try {
      const r = await callGemini(contents, (txt, model, reset) => {
        const d = $('#busyS').dataset; d.m = model; d.n = String(txt.length); paintBusy();
        if (!reset) $('#tail').textContent = txt.slice(-700);
        else $('#tail').textContent = '';
      }, ac.signal);
      const ms = Date.now() - t0;
      const got = extractHtml(r.text);
      if (!got) {
        const said = String(r.text || '').replace(/\s+/g, ' ').trim().slice(0, 140);
        addLog({ r: 'x', t: r.finish === 'SAFETY' || r.finish === 'BLOCKED' ? '제미나이가 이 요청에는 답하지 않았어요. 표현을 바꿔 다시 해 보세요.' : (said ? `앱 대신 글로만 답했어요: "${said}" 같은 요청을 다시 보내 보세요.` : '빈 답이 왔어요. 같은 요청을 다시 보내 보세요.'), retry: job });
        return;
      }
      if (!got.complete) {
        addLog({ r: 'x', t: r.finish === 'MAX_TOKENS' ? '앱 코드가 너무 길어서 끝까지 받지 못했어요. 기능을 조금 줄여서 다시 요청해 보세요.' : '앱 코드를 끝까지 받지 못했어요. 같은 요청을 다시 보내 보세요.', retry: job });
        return;
      }
      if (job.kind === 'first') { S = { first: job.text, versions: [], cur: -1, log: S.log }; }
      S.versions.push({ html: got.html, title: titleOf(got.html), model: r.model, ms, at: Date.now(), from: job.kind === 'first' ? null : job.base });
      if (S.versions.length > MAX_VERSIONS) { S.versions.shift(); S.log.forEach(x => { if (typeof x.v === 'number') x.v -= 1; }); }
      S.cur = S.versions.length - 1;
      const n = S.cur + 1;
      addLog({ r: 'a', t: job.kind === 'first' ? `${n}번째 앱이 나왔어요` : `고친 앱(버전 ${n})이 나왔어요`, v: S.cur, sub: `${fmtSec(ms)} · ${modelName(r.model)}` });
      showVersion(S.cur, true);
      showTalk(true); renderLog();
      // 좁은 화면에서는 앱이 아래에 있으니 앱 쪽으로 내려 줍니다.
      if (matchMedia('(max-width: 900px)').matches) document.querySelector('.right').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      if (e && e.code === 'abort') addLog({ r: 'x', t: tooLong ? '5분이 지나도 끝나지 않아 멈췄어요. 요청을 조금 줄여서 다시 해 보세요.' : '만들기를 멈췄어요.', retry: job });
      else addLog({ r: 'x', t: errText(e), retry: job });
    } finally {
      clearTimeout(total); ac = null; setBusy(false); saveS();
    }
  }
  $('#stopBtn').onclick = () => { if (ac) ac.abort(); };

  $('#makeBtn').onclick = () => {
    let text;
    if (tab === 'form') {
      const f = form.read();
      const need = L.check(f).filter(x => x.lv === 'need');
      if (need.length) { toast(need[0].t); return; }
      text = L.build(f);
    } else {
      text = $('#free').value.trim();
      if (text.length < 20) { toast('만들고 싶은 앱을 조금 더 자세히 적어 주세요.'); $('#free').focus(); return; }
    }
    text = text.slice(0, MAX_FIRST);
    S.log = [];
    addLog({ r: 'u', t: text, first: true });
    run({ kind: 'first', text });
  };

  $('#askForm').addEventListener('submit', e => {
    e.preventDefault();
    const t = $('#ask').value.trim().slice(0, MAX_FIX);
    if (!t) { $('#ask').focus(); return; }
    if (S.cur < 0) return;
    $('#ask').value = '';
    addLog({ r: 'u', t, base: S.cur });
    run({ kind: 'fix', text: t, base: S.cur });
  });
  $('#ask').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#askForm').dispatchEvent(new Event('submit', { cancelable: true })); } });
  const ASK_CHIPS = ['글씨와 버튼을 더 크게 해 줘.', '정답을 맞히면 칭찬하는 효과를 넣어 줘.', '확인 문제를 5개로 늘려 줘.'];
  $('#askChips').innerHTML = ASK_CHIPS.map((t, i) => `<button type="button" class="chip" data-ask="${i}">${esc(t)}</button>`).join('');
  $('#askChips').addEventListener('click', e => { const b = e.target.closest('[data-ask]'); if (!b) return; $('#ask').value = ASK_CHIPS[+b.dataset.ask]; $('#ask').focus(); });
  $('#newBtn').onclick = () => { if (busy) return; showTalk(false); const box = document.querySelector('.left'); if (box) box.scrollTop = 0; };

  /* ---------- 대화 기록 ---------- */
  function addLog(item) { S.log.push(item); renderLog(); saveS(); }
  function renderLog() {
    const ol = $('#log');
    ol.innerHTML = S.log.map((x, i) => {
      if (x.r === 'u') {
        const long = x.t.length > 160;
        return `<li class="u"><span class="who">${x.first ? '처음 요청' : '고쳐 달라고 한 말' + (typeof x.base === 'number' ? ' (버전 ' + (x.base + 1) + '에서)' : '')}</span><span class="t" data-i="${i}">${esc(long ? x.t.slice(0, 160) + '…' : x.t)}</span>${long ? ` <button type="button" class="more" data-more="${i}">전체 보기</button>` : ''}</li>`;
      }
      if (x.r === 'a') return `<li class="a">${typeof x.v === 'number' && x.v >= 0 ? `<button type="button" class="vbtn" data-v="${x.v}">${esc(x.t)}</button>` : esc(x.t)}${x.sub ? ` <small>· ${esc(x.sub)}</small>` : ''}</li>`;
      return `<li class="x">${esc(x.t)}${x.retry ? ` <button type="button" class="vbtn" data-retry="${i}">같은 요청 다시 보내기</button>` : ''}</li>`;
    }).join('');
    // 왼쪽 칸 안에서만 맨 아래로(페이지 전체는 움직이지 않게)
    const box = document.querySelector('.left');
    if (box && !$('#talkBox').hidden && getComputedStyle(box).overflowY === 'auto') box.scrollTop = box.scrollHeight;
  }
  $('#log').addEventListener('click', e => {
    const v = e.target.closest('[data-v]'); if (v) { showVersion(+v.dataset.v); return; }
    const m = e.target.closest('[data-more]'); if (m) { const i = +m.dataset.more; const span = $('#log').querySelector(`.t[data-i="${i}"]`); span.textContent = S.log[i].t; m.remove(); return; }
    const r = e.target.closest('[data-retry]'); if (r) { const job = S.log[+r.dataset.retry].retry; if (job.kind === 'fix' && !S.versions[job.base]) { toast('고칠 앱이 없어요. 새로 만들어 주세요.'); return; } if (job.kind === 'first') { S.log = []; addLog({ r: 'u', t: job.text, first: true }); } else addLog({ r: 'u', t: job.text, base: job.base }); run(job); }
  });
  function showTalk(on) {
    $('#talkBox').hidden = !on; $('#startBox').hidden = on;
    $('#backBtn').hidden = on || !S.versions.length;
    renderErrs();
  }
  $('#backBtn').onclick = () => showTalk(true);

  /* ---------- 미리보기 ---------- */
  let view = 'app', frameErrs = [], frameToken = 0;
  function showVersion(i, fresh) {
    if (!S.versions[i]) return;
    S.cur = i; saveS();
    const v = S.versions[i];
    $('#appTitle').textContent = v.title || '이름 없는 앱';
    $('#verText').textContent = `버전 ${i + 1} / ${S.versions.length}`;
    $('#prevV').disabled = i <= 0; $('#nextV').disabled = i >= S.versions.length - 1;
    $('#empty').hidden = true;
    $('#code').textContent = v.html;
    mountFrame(v.html);
    setView(fresh ? 'app' : view);
  }
  function mountFrame(html) {
    frameErrs = []; renderErrs();
    const wrap = $('#frameWrap'); wrap.innerHTML = '';
    const f = document.createElement('iframe');
    f.title = '만든 앱 미리보기';
    f.setAttribute('sandbox', 'allow-scripts allow-modals allow-forms');
    f.setAttribute('referrerpolicy', 'no-referrer');
    f.src = 'runner.html?v=' + (++frameToken);
    f.dataset.html = '1';
    wrap.appendChild(f);
    pendingHtml = html; pendingFrame = f;
  }
  let pendingHtml = null, pendingFrame = null;
  window.addEventListener('message', e => {
    const f = $('#frameWrap iframe');
    if (!f || e.source !== f.contentWindow || !e.data) return;
    if (e.data.lab === 'ready' && pendingFrame === f && pendingHtml != null) { f.contentWindow.postMessage({ lab: 'run', html: pendingHtml }, '*'); pendingHtml = null; }
    else if (e.data.lab === 'err' && typeof e.data.msg === 'string') { if (frameErrs.length < 20) frameErrs.push(e.data.msg); renderErrs(); }
  });
  function renderErrs() {
    const bar = $('#errbar');
    if (!frameErrs.length || $('#talkBox').hidden) { bar.hidden = true; return; }
    bar.hidden = false;
    $('#errText').textContent = `앱 안에서 오류가 ${frameErrs.length}개 났어요: ${frameErrs[0]}`;
  }
  $('#fixErr').onclick = () => { $('#ask').value = `앱에서 이런 오류가 나요: ${frameErrs[0]}. 고쳐 줘.`.slice(0, MAX_FIX); $('#ask').focus(); };
  function setView(v) {
    view = v;
    const has = S.cur >= 0;
    $('#viewApp').setAttribute('aria-pressed', v === 'app'); $('#viewCode').setAttribute('aria-pressed', v === 'code');
    $('#frameWrap').hidden = !has || v !== 'app'; $('#codeWrap').hidden = !has || v !== 'code';
  }
  $('#viewApp').onclick = () => setView('app');
  $('#viewCode').onclick = () => setView('code');
  $('#prevV').onclick = () => showVersion(S.cur - 1);
  $('#nextV').onclick = () => showVersion(S.cur + 1);
  $('#copyCode').onclick = async () => { const v = S.versions[S.cur]; if (!v) return; toast(await L.copyText(v.html) ? '코드를 복사했어요' : '복사하지 못했어요'); };
  $('#bigBtn').onclick = async () => {
    if (S.cur < 0) { toast('먼저 앱을 만들어 주세요.'); return; }
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('#stage').requestFullscreen(); }
    catch (e) { toast('이 브라우저에서는 크게 보기를 할 수 없어요.'); }
  };
  $('#dlBtn').onclick = () => {
    const v = S.versions[S.cur]; if (!v) { toast('먼저 앱을 만들어 주세요.'); return; }
    const name = ((v.title || '수업 웹앱').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || '수업 웹앱') + `_버전${S.cur + 1}.html`;
    const url = URL.createObjectURL(new Blob([v.html], { type: 'text/html;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('HTML 파일로 내려받았어요');
  };
  ['#prevV', '#nextV'].forEach(s => { $(s).disabled = true; });

  /* ---------- 겹쳐 뜨는 창 ---------- */
  function makeModal(html) {
    const from = document.activeElement;
    const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="box" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(m);
    const close = () => { m.remove(); document.removeEventListener('keydown', onKey, true); if (from && from.focus) from.focus(); };
    const onKey = e => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      if (e.key === 'Tab') { const f = m.querySelectorAll('button,input,select,textarea,a[href]'); if (!f.length) return; const first = f[0], last = f[f.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
    };
    document.addEventListener('keydown', onKey, true);
    m.addEventListener('mousedown', e => { if (e.target === m) close(); });
    m.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
    setTimeout(() => { const f = m.querySelector('input,textarea,button'); f && f.focus(); }, 30);
    return { m, close, q: s => m.querySelector(s) };
  }

  function openUnlock() {
    const pending = store.get(K.pending, '');
    const md = makeModal(`
      <h2>연수 코드로 연결하기</h2>
      <p>${pending ? '받은 링크를 열어 두었어요. 연수 담당 선생님이 알려 준 <b>연수 코드</b>를 넣어 주세요.' : '연수 담당 선생님께 받은 <b>링크</b>를 붙여 넣고 <b>연수 코드</b>를 넣어 주세요.'}</p>
      <label ${pending ? 'hidden' : ''} id="linkRow"><span>받은 링크</span><textarea id="uLink" rows="3" placeholder="링크를 처음부터 끝까지 그대로 붙여 넣어 주세요"></textarea></label>
      <label><span>연수 코드</span><input id="uCode" type="password" autocomplete="off"></label>
      <p class="msg" id="uMsg" aria-live="polite"></p>
      <div class="acts"><button type="button" class="btn ghost" data-close>닫기</button><button type="button" class="btn" id="uGo">연결하기</button></div>`);
    let fails = 0;
    const go = async () => {
      let blob = store.get(K.pending, '');
      const lk = md.q('#uLink').value.trim();
      if (lk) { const m = lk.match(/#c=([A-Za-z0-9_-]{40,})/); if (!m) { md.q('#uMsg').textContent = '링크를 처음부터 끝까지 그대로 붙여 넣어 주세요.'; md.q('#uMsg').className = 'msg bad'; return; } blob = m[1]; }
      if (!blob) { md.q('#uMsg').textContent = '받은 링크를 붙여 넣어 주세요.'; md.q('#uMsg').className = 'msg bad'; return; }
      const code = md.q('#uCode').value;
      if (!code.trim()) { md.q('#uMsg').textContent = '연수 코드를 넣어 주세요.'; md.q('#uMsg').className = 'msg bad'; return; }
      md.q('#uGo').disabled = true; md.q('#uMsg').textContent = '확인하는 중…'; md.q('#uMsg').className = 'msg';
      try {
        const k = await openSealed(blob, code);
        if (!/^[\x21-\x7e]{20,200}$/.test(k)) throw new Error('bad');
        setKey(k); store.del(K.pending); md.close(); renderConn(); toast('연결했어요. 이제 앱을 만들 수 있어요');
      } catch (e) {
        fails++;
        md.q('#uGo').disabled = false;
        md.q('#uMsg').textContent = fails >= 1 && store.get(K.pending, '') ? '연수 코드가 맞지 않아요. 다시 넣어 보거나, 링크가 잘렸다면 아래에 받은 링크를 다시 붙여 넣어 주세요.' : '연수 코드나 링크가 맞지 않아요. 다시 확인해 주세요.';
        md.q('#uMsg').className = 'msg bad';
        md.q('#linkRow').hidden = false;
      }
    };
    md.q('#uGo').onclick = go;
    md.q('#uCode').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) go(); });
  }

  function openAdmin() {
    const k = getKey();
    const md = makeModal(`
      <h2>관리자 설정</h2>
      <p>연수를 여는 선생님만 써요. 키는 이 기기 브라우저에만 저장돼요.</p>
      <h3>1. 제미나이 API 키</h3>
      <label><span>키 ${k ? '(저장됨: ' + esc(maskKey(k)) + ')' : ''}</span><input id="aKey" type="password" autocomplete="off" placeholder="${k ? '바꿀 때만 새 키를 넣어 주세요' : 'AIza로 시작하는 키'}"></label>
      <label><span>먼저 쓸 모델</span><select id="aModel">${MODELS.map(m => `<option value="${m[0]}">${esc(m[1])}</option>`).join('')}</select></label>
      <div class="acts"><button type="button" class="btn ghost sm" id="aDel" ${k ? '' : 'disabled'}>이 기기에서 키 지우기</button><button type="button" class="btn sm" id="aSave">저장</button></div>
      <p class="msg" id="aMsg" aria-live="polite"></p>
      <hr>
      <h3>2. 선생님용 링크 만들기</h3>
      <p>링크와 연수 코드는 따로 알려 주세요. 링크만으로는 키를 꺼낼 수 없어요. 연결한 기기에는 키가 저장되니, 연수가 끝나면 키를 바꾸거나 지우는 것이 안전해요.</p>
      <label><span>연수 코드 (6자 이상)</span><input id="aCode" type="text" autocomplete="off" placeholder="예: 4차시웹앱1026"></label>
      <div class="acts"><button type="button" class="btn sm" id="aLink">링크 만들기</button></div>
      <label id="aOutRow" hidden><span>선생님용 링크</span><textarea id="aOut" rows="3" readonly></textarea></label>
      <div class="acts" id="aCopyRow" hidden><button type="button" class="btn sm ghost" id="aCopy">링크 복사</button></div>
      <p class="msg" id="aMsg2" aria-live="polite"></p>
      <div class="acts"><button type="button" class="btn ghost" data-close>닫기</button></div>`);
    md.q('#aModel').value = getModel();
    const say = (id, t, cls) => { md.q(id).textContent = t; md.q(id).className = 'msg ' + (cls || ''); };
    md.q('#aSave').onclick = () => {
      const nk = md.q('#aKey').value.trim();
      if (nk && !/^[\x21-\x7e]{20,200}$/.test(nk)) { say('#aMsg', '키 모양이 맞지 않아요. 다시 확인해 주세요.', 'bad'); return; }
      if (nk) setKey(nk);
      store.set(K.model, md.q('#aModel').value);
      md.q('#aKey').value = '';
      say('#aMsg', nk ? `저장했어요 (${maskKey(getKey())}).` : '모델 설정을 저장했어요.', 'good');
      md.q('#aDel').disabled = !getKey(); renderConn();
    };
    let delArmed = false;
    md.q('#aDel').onclick = () => {
      if (!delArmed) { delArmed = true; md.q('#aDel').textContent = '한 번 더 누르면 지워요'; return; }
      store.del(K.key); md.q('#aDel').disabled = true; md.q('#aDel').textContent = '이 기기에서 키 지우기'; delArmed = false; say('#aMsg', '이 기기에서 키를 지웠어요.', 'good'); renderConn();
    };
    md.q('#aLink').onclick = async () => {
      if (md.q('#aKey').value.trim()) { say('#aMsg2', '새로 넣은 키를 먼저 저장해 주세요.', 'bad'); return; }
      const key = getKey(); if (!key) { say('#aMsg2', '먼저 키를 저장해 주세요.', 'bad'); return; }
      const code = md.q('#aCode').value.trim(); if (code.length < 6) { say('#aMsg2', '연수 코드는 6자 이상으로 정해 주세요.', 'bad'); return; }
      say('#aMsg2', '링크를 만드는 중…');
      const link = appBase() + '#c=' + await sealKey(key, code);
      md.q('#aOut').value = link; md.q('#aOutRow').hidden = false; md.q('#aCopyRow').hidden = false;
      say('#aMsg2', '링크를 만들었어요. 연수 코드는 링크와 따로 알려 주세요.', 'good');
    };
    md.q('#aCopy').onclick = async () => { toast(await L.copyText(md.q('#aOut').value) ? '링크를 복사했어요' : '링크를 선택해서 복사해 주세요'); };
  }
  $('#adminLink').onclick = openAdmin;

  /* ---------- 시작 ---------- */
  renderConn();
  renderLog();
  if (S.versions.length && S.cur >= 0) { showVersion(Math.min(S.cur, S.versions.length - 1)); showTalk(true); }
  if (store.get(K.pending, '')) setTimeout(openUnlock, 200);
  window.addEventListener('beforeunload', e => { if (busy) { e.preventDefault(); e.returnValue = ''; } });
})();
