/* 요청문 만들기 — 두 페이지(요청문 도우미, 웹앱 만들기)가 함께 쓰는 코드
   요청문 틀은 4차시 PPT 20장과 같습니다.
   초등 ○학년 ○○ ○○ 수업에서 쓸 웹앱을 만들어 줘. 성취기준은 [코드] 성취기준 문장.
   학생이 ○○을 고르면(누르면) ○○이 나타나고, 아래에 ○○이 함께 보이게 해 줘.
   맨 아래에는 학생이 직접 답을 써 보는 확인 문제를 넣고, 채점할 때 ○○한 답을 정답으로 해 줘.
   초등학생이 태블릿으로 쓰기 쉽게 글씨와 버튼을 크게 만들어 줘.
*/
(function () {
  'use strict';

  // PPT 9장 시연 요청문(10/5~6 배움터 계정 새 대화 6번 시험) — 글자 하나 바꾸지 않고 그대로
  const DEMO_PROMPT = "초등 5학년 수학 분수의 곱셈 수업에서 쓸 웹앱을 만들어 줘. 성취기준은 [6수01-09] 분수의 곱셈의 계산 원리를 탐구하고 그 계산을 할 수 있다. 학생이 진분수(분자, 분모)와 곱할 자연수를 고르면, 진분수만큼 색칠된 막대가 자연수만큼 차례로 나타나고, 아래에 덧셈식(예: 1/5+1/5+1/5)과 곱셈식(1/5×3=3/5)이 함께 보이게 해 줘. 결과가 1보다 크면 1을 넘는 부분을 다음 막대에 이어서 색칠하고 대분수로도 보여 줘. 맨 아래에는 학생이 직접 답을 써 보는 확인 문제를 넣어 줘. 채점할 때 약분해서 가장 간단한 분수로 쓴 답을 정답으로 하고, 약분하지 않은 답에는 '약분하면 더 간단해져요'라고 알려 줘. 답이 자연수이면 자연수로 써도 정답으로 해 줘. 초등학생이 태블릿으로 쓰기 쉽게 글씨와 버튼을 크게 만들어 줘.";

  // 예시: 4차시 PPT 21장에서 이 틀로 실제로 넣어 본 요청문과 글자까지 같게 채웁니다.
  const PRESETS = {
    division: {
      label: '6학년 1학기 수학 · 분수의 나눗셈',
      note: 'PPT 21장에서 넣어 본 요청문이에요. 몫은 맞게 나왔지만 4÷2에 자연수 2를 쓸 수 없었어요.',
      f: { level: '초등', grade: '6', subject: '수학', topic: '분수의 나눗셈', code: '6수01-10',
        standard: "'(자연수)÷(자연수)'에서 나눗셈의 몫을 분수로 나타낼 수 있다.",
        act: '나누어지는 수와 나누는 수를 고르면', appear: '피자를 똑같이 나눈 그림이', below: '나눗셈식과 몫을 분수로 나타낸 식이',
        extra: '', quiz: true, crit: '몫을 분수로 나타낸', more: '', device: '태블릿' }
    },
    land: {
      label: '5학년 1학기 사회 · 우리나라 국토 여행',
      note: "PPT 21장에서 '다른 이름도 정답' 문장을 더해 넣어 본 요청문이에요. 처음부터 황해·서해 모두 정답으로 채점했어요. 지도는 교과서와 꼭 비교해 보세요.",
      f: { level: '초등', grade: '5', subject: '사회', topic: '우리나라의 지형', code: '6사01-01',
        standard: '우리나라 산지, 하천, 해안 지형의 위치를 확인하고 지형의 분포 특징을 탐구한다.',
        act: '산지, 하천, 해안 중 하나를 누르면', appear: '우리나라 지도에 그 지형의 위치가', below: '분포 특징이',
        extra: '', quiz: true, crit: '지형 이름을 바르게 쓴', more: '서해와 황해처럼 같은 곳을 가리키는 다른 이름도 정답으로 해 줘.', device: '태블릿' }
    }
  };
  const EMPTY = { level: '초등', grade: '5', subject: '', topic: '', code: '', standard: '', act: '', appear: '', below: '', extra: '', quiz: true, crit: '', more: '', device: '태블릿' };

  // 정답으로 볼 답에 더할 수 있는 문장(모두 PPT 9장·21장 요청문에서 시험한 문장)
  const MORE_CHIPS = [
    { t: "약분하지 않은 답에는 '약분하면 더 간단해져요'라고 알려 줘.", tip: '분수 답' },
    { t: '답이 자연수이면 자연수로 써도 정답으로 해 줘.', tip: '자연수 답' },
    { t: '서해와 황해처럼 같은 곳을 가리키는 다른 이름도 정답으로 해 줘.', tip: '다른 이름 · 낱말을 바꿔 쓰세요' }
  ];
  const DEVICES = { '태블릿': '태블릿으로', '크롬북': '크롬북으로', '컴퓨터': '컴퓨터로', '휴대폰': '휴대폰으로' };

  const clean = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const endDot = s => { s = clean(s); if (!s) return ''; return /[.!?。]$/.test(s) ? s : s + '.'; };
  const sentences = s => String(s || '').split(/\n+/).map(endDot).filter(Boolean).join(' ');

  // 칸 → 요청문 조각들(색을 나눠 보여 주려고 조각으로 돌려줍니다)
  function parts(f) {
    f = Object.assign({}, EMPTY, f || {});
    const out = [];
    const lv = f.level === '중학교' ? '중학교' : '초등';
    const head = [lv, clean(f.grade) ? clean(f.grade) + '학년' : '', clean(f.subject), clean(f.topic)].filter(Boolean).join(' ');
    out.push({ k: 'intro', t: (head ? head + ' ' : '') + '수업에서 쓸 웹앱을 만들어 줘.' });
    const code = clean(f.code).replace(/^\[|\]$/g, '').trim();
    const std = clean(f.standard);
    if (code || std) out.push({ k: 'std', t: endDot('성취기준은 ' + (code ? '[' + code + '] ' : '') + std) });
    const act = clean(f.act), ap = clean(f.appear), below = clean(f.below);
    if (act || ap || below) {
      let s = '학생이 ' + (act ? act + ' ' : '') + (ap ? ap + ' ' : '');
      s += below ? '나타나고, 아래에 ' + below + ' 함께 보이게 해 줘.' : '나타나게 해 줘.';
      out.push({ k: 'act', t: s.replace(/\s+/g, ' ') });
    }
    if (clean(f.extra)) out.push({ k: 'act', t: sentences(f.extra) });
    if (f.quiz) {
      const crit = clean(f.crit);
      out.push({ k: 'quiz', t: crit
        ? '맨 아래에는 학생이 직접 답을 써 보는 확인 문제를 넣고, 채점할 때 ' + crit + ' 답을 정답으로 해 줘.'
        : '맨 아래에는 학생이 직접 답을 써 보는 확인 문제를 넣어 줘.' });
      if (clean(f.more)) out.push({ k: 'quiz', t: sentences(f.more) });
    }
    const who = lv === '중학교' ? '중학생이' : '초등학생이';
    out.push({ k: 'screen', t: who + ' ' + (DEVICES[f.device] || '태블릿으로') + ' 쓰기 쉽게 글씨와 버튼을 크게 만들어 줘.' });
    return out;
  }
  const build = f => parts(f).map(p => p.t).join(' ');

  // 보내기 전에 살펴볼 점
  function check(f) {
    f = Object.assign({}, EMPTY, f || {});
    const w = [];
    if (!clean(f.subject)) w.push({ lv: 'need', t: '과목을 적어 주세요.' });
    if (!clean(f.code) || !clean(f.standard)) w.push({ lv: 'need', t: '성취기준 코드와 문장을 지도서·교육과정에 있는 그대로 넣어 주세요.' });
    if (!clean(f.act) || !clean(f.appear)) w.push({ lv: 'need', t: '학생이 무엇을 하면(고르면·누르면) 무엇이 나타나는지 적어 주세요.' });
    else if (!/면,?$/.test(clean(f.act))) w.push({ lv: 'tip', t: "'학생이 ○○을 고르면'처럼 '~면'으로 끝나게 쓰면 틀과 같아져요." });
    if (f.quiz && !clean(f.crit) && !clean(f.more)) w.push({ lv: 'warn', t: '채점 기준이 비어 있어요. 채점 기준 없이 만든 앱 5개는 모두 채점이 어긋났어요(PPT 15장).' });
    if (!f.quiz) w.push({ lv: 'tip', t: '확인 문제를 빼면 채점을 검토할 수 없어요. 탐구 화면만 만들 때만 빼 주세요.' });
    if (/\d{6}-\d{7}|010-?\d{4}-?\d{4}/.test(Object.values(f).join(' '))) w.push({ lv: 'warn', t: '전화번호·주민번호처럼 보이는 글자가 있어요. 개인정보는 넣지 마세요.' });
    return w;
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // 칸을 그립니다. (두 페이지가 같은 칸을 씁니다)
  function renderForm(root, opt) {
    opt = opt || {};
    const id = n => (opt.prefix || 'f') + '-' + n;
    const grades = n => Array.from({ length: n }, (_, i) => `<option value="${i + 1}">${i + 1}학년</option>`).join('');
    root.innerHTML = `
<section class="fs fs-intro">
  <h3><span class="dot"></span>수업</h3>
  <div class="row">
    <label class="mini"><span>학교</span><select id="${id('level')}" data-k="level"><option>초등</option><option>중학교</option></select></label>
    <label class="mini"><span>학년</span><select id="${id('grade')}" data-k="grade">${grades(6)}</select></label>
    <label class="grow"><span>과목</span><input id="${id('subject')}" data-k="subject" list="${id('subjects')}" placeholder="예: 수학" autocomplete="off"></label>
  </div>
  <datalist id="${id('subjects')}"><option>국어</option><option>수학</option><option>사회</option><option>과학</option><option>영어</option><option>도덕</option><option>실과</option><option>음악</option><option>미술</option><option>체육</option></datalist>
  <label><span>단원 · 주제</span><input id="${id('topic')}" data-k="topic" placeholder="예: 분수의 나눗셈" autocomplete="off"></label>
</section>
<section class="fs fs-std">
  <h3><span class="dot"></span>① 성취기준 <small>지도서·교육과정의 코드와 문장을 그대로</small></h3>
  <div class="row">
    <label class="code"><span>코드</span><input id="${id('code')}" data-k="code" placeholder="예: 6수01-10" autocomplete="off"></label>
  </div>
  <label><span>성취기준 문장</span><textarea id="${id('standard')}" data-k="standard" rows="2" placeholder="예: '(자연수)÷(자연수)'에서 나눗셈의 몫을 분수로 나타낼 수 있다."></textarea></label>
  <p class="hint">3차시에 퀴즈를 만든 단원의 성취기준을 그대로 써도 돼요.</p>
</section>
<section class="fs fs-act">
  <h3><span class="dot"></span>② 학생 활동과 화면 변화</h3>
  <div class="frame"><span class="fx">학생이</span><input id="${id('act')}" data-k="act" placeholder="나누어지는 수와 나누는 수를 고르면" autocomplete="off"></div>
  <div class="frame"><input id="${id('appear')}" data-k="appear" placeholder="피자를 똑같이 나눈 그림이" autocomplete="off"><span class="fx">나타나고,</span></div>
  <div class="frame"><span class="fx">아래에</span><input id="${id('below')}" data-k="below" placeholder="나눗셈식과 몫을 분수로 나타낸 식이" autocomplete="off"><span class="fx">함께 보이게 해 줘.</span></div>
  <label><span>더 바라는 점 <em>(선택)</em></span><textarea id="${id('extra')}" data-k="extra" rows="2" placeholder="예: 결과가 1보다 크면 1을 넘는 부분을 다음 막대에 이어서 색칠하고 대분수로도 보여 줘."></textarea></label>
</section>
<section class="fs fs-quiz">
  <h3><span class="dot"></span>③ 확인 문제와 채점 기준</h3>
  <label class="check"><input type="checkbox" id="${id('quiz')}" data-k="quiz" checked> 맨 아래에 학생이 직접 답을 써 보는 확인 문제 넣기</label>
  <div class="quizbox">
    <div class="frame"><span class="fx">채점할 때</span><input id="${id('crit')}" data-k="crit" placeholder="몫을 분수로 나타낸" autocomplete="off"><span class="fx">답을 정답으로 해 줘.</span></div>
    <label><span>정답으로 볼 답 더 적기 <em>(선택)</em></span><textarea id="${id('more')}" data-k="more" rows="2" placeholder="예: 서해와 황해처럼 같은 곳을 가리키는 다른 이름도 정답으로 해 줘."></textarea></label>
    <div class="chips" role="group" aria-label="시험해 본 문장 더하기">
      ${MORE_CHIPS.map((c, i) => `<button type="button" class="chip" data-more="${i}" title="${esc(c.tip)}">+ ${esc(c.t)}</button>`).join('')}
    </div>
  </div>
</section>
<section class="fs fs-screen">
  <h3><span class="dot"></span>④ 화면 조건</h3>
  <div class="frame"><span class="fx" data-who>초등학생이</span><select id="${id('device')}" data-k="device">${Object.keys(DEVICES).map(d => `<option value="${d}">${DEVICES[d]}</option>`).join('')}</select><span class="fx">쓰기 쉽게 글씨와 버튼을 크게 만들어 줘.</span></div>
</section>`;

    const els = {};
    root.querySelectorAll('[data-k]').forEach(el => { els[el.dataset.k] = el; });
    const read = () => {
      const f = {};
      for (const k in els) f[k] = els[k].type === 'checkbox' ? els[k].checked : els[k].value;
      return f;
    };
    const syncLevel = () => {
      const mid = els.level.value === '중학교';
      const keep = els.grade.value;
      els.grade.innerHTML = grades(mid ? 3 : 6);
      els.grade.value = (mid && +keep > 3) ? '1' : keep;
      root.querySelector('[data-who]').textContent = mid ? '중학생이' : '초등학생이';
    };
    const syncQuiz = () => root.querySelector('.quizbox').classList.toggle('off', !els.quiz.checked);
    const fill = f => {
      f = Object.assign({}, EMPTY, f || {});
      els.level.value = f.level; syncLevel();
      for (const k in els) { if (k === 'level') continue; if (els[k].type === 'checkbox') els[k].checked = !!f[k]; else els[k].value = f[k] == null ? '' : f[k]; }
      syncQuiz();
      opt.onChange && opt.onChange(read());
    };
    root.addEventListener('input', e => {
      if (e.target === els.level) syncLevel();
      if (e.target === els.quiz) syncQuiz();
      opt.onChange && opt.onChange(read());
    });
    root.addEventListener('change', e => { if (e.target === els.level) { syncLevel(); opt.onChange && opt.onChange(read()); } });
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-more]'); if (!b) return;
      const t = MORE_CHIPS[+b.dataset.more].t;
      const cur = els.more.value.trim();
      if (!cur.split(/\n+/).map(s => s.trim()).includes(t)) els.more.value = cur ? cur + '\n' + t : t;
      els.more.dispatchEvent(new Event('input', { bubbles: true }));
      els.more.focus();
    });
    return { read, fill, els };
  }

  // 조각마다 색을 입힌 미리보기 HTML
  function previewHTML(f) {
    return parts(f).map(p => `<span class="pp pp-${p.k}">${esc(p.t)}</span>`).join(' ');
  }

  // 저장(이 기기 브라우저에만): 막혀 있어도 페이지는 그대로 동작합니다.
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { } }
  };

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      try {
        const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
        ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy'); ta.remove(); return ok;
      } catch (e2) { return false; }
    }
  }

  window.LabForm = { DEMO_PROMPT, PRESETS, EMPTY, MORE_CHIPS, parts, build, check, renderForm, previewHTML, esc, store, copyText };
})();
