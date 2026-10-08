(function () {
  'use strict';
  const L = window.LabForm, $ = s => document.querySelector(s);
  const KEY = 'lab.helper.form';
  let toastT = 0;
  const toast = t => { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2400); };

  const form = L.renderForm($('#form'), { prefix: 'h', onChange: f => { render(f); L.store.set(KEY, f); } });

  function render(f) {
    $('#prompt').innerHTML = L.previewHTML(f);
    $('#count').textContent = L.build(f).length + '자';
    const w = L.check(f);
    $('#warns').innerHTML = (w.length ? w : [{ lv: 'ok', t: '네 가지가 모두 들어 있어요. 복사해서 제미나이 Canvas에 붙여 넣어 보세요.' }])
      .map(x => `<li class="${x.lv}">${L.esc(x.t)}</li>`).join('');
  }

  document.querySelector('.presets').addEventListener('click', e => {
    const b = e.target.closest('[data-preset]'); if (!b) return;
    const k = b.dataset.preset, note = $('#presetNote');
    if (k === 'empty') { form.fill(L.EMPTY); note.hidden = true; }
    else { form.fill(L.PRESETS[k].f); note.textContent = L.PRESETS[k].note; note.hidden = false; }
    L.store.set(KEY, form.read());
  });

  $('#copyBtn').addEventListener('click', async () => {
    const f = form.read();
    const need = L.check(f).filter(x => x.lv === 'need');
    const ok = await L.copyText(L.build(f));
    toast(ok ? (need.length ? '복사했어요. 빈 칸이 있으니 붙여 넣기 전에 한 번 더 봐 주세요' : '요청문을 복사했어요. 제미나이 Canvas에 붙여 넣으세요') : '복사하지 못했어요. 요청문을 직접 선택해서 복사해 주세요');
  });
  $('#demoText').textContent = L.DEMO_PROMPT;
  $('#demoCopy').addEventListener('click', async () => { toast(await L.copyText(L.DEMO_PROMPT) ? '시연 요청문을 복사했어요' : '복사하지 못했어요. 글을 직접 선택해서 복사해 주세요'); });
  $('#clearBtn').addEventListener('click', () => { L.store.del(KEY); form.fill(L.EMPTY); $('#presetNote').hidden = true; toast('적은 내용을 지웠어요'); });

  $('#mCopy').addEventListener('click', () => $('#copyBtn').click());
  $('#mView').addEventListener('click', () => { $('#resTitle').scrollIntoView({ behavior: 'smooth', block: 'start' }); });

  form.fill(L.store.get(KEY, null) || L.EMPTY);
})();
