/* ============================================================
   屿 · 情绪小岛 —— 主逻辑
   纯本地 · localStorage · 无外部依赖
   ============================================================ */
'use strict';

/* ---------------- 配置 ---------------- */
const LS_RECORDS = 'mood_island_records_v1';
const LS_SETTINGS = 'mood_island_settings_v1';
const LS_MEALS = 'mood_island_meals_v1';

const WEATHERS = [
  { v: '晴', ico: '☀️' }, { v: '多云', ico: '⛅' }, { v: '阴', ico: '☁️' },
  { v: '小雨', ico: '🌦️' }, { v: '大雨', ico: '🌧️' }, { v: '雪', ico: '❄️' }, { v: '风', ico: '🌬️' },
];

const TRIGGERS = [
  '工作或学业压力', '与人争执或误解', '熬夜 / 睡不好', '孤独感袭来', '身体不舒服',
  '对未来感到焦虑', '家人或亲密关系', '经济压力', '回忆过去', '天气闷或阴雨', '其实没什么特别原因',
];

const HEALERS = [
  '出门走走', '找人倾诉', '好好睡了一觉', '听喜欢的歌', '吃顿喜欢的',
  '运动 / 出汗', '看治愈视频或剧', '痛快哭了一场', '把感受写下来', '放空 / 什么都不做', '被小动物治愈',
  '没做什么特别的，自然而然就好了',
];

const MOODS = [
  { lv: 1, ico: '🍃', txt: '毛毛雨' },
  { lv: 2, ico: '☁️', txt: '灰灰的' },
  { lv: 3, ico: '🌧️', txt: '下雨了' },
  { lv: 4, ico: '🌩️', txt: '雷雨' },
  { lv: 5, ico: '🌊', txt: '快淹没' },
];

/* 时段桶：低谷从几点开始 */
const SLOTS = [
  { key: '凌晨', range: [0, 5] },
  { key: '清晨', range: [5, 9] },
  { key: '上午', range: [9, 12] },
  { key: '午后', range: [12, 14] },
  { key: '下午', range: [14, 18] },
  { key: '傍晚', range: [18, 21] },
  { key: '夜晚', range: [21, 24] },
];

const GENTLE = [
  '慢慢来，你不需要立刻好起来。',
  '情绪像天气，会阴天，也会再放晴。',
  '你已经撑过了很多个以为过不去的时刻。',
  '允许自己难过，也是一种勇敢。',
  '你不是一个人，这片小岛一直都在。',
  '今天辛苦了，先抱抱自己。',
  '低谷不是你的全部，只是路过的一阵风。',
  '把心事写下来，它们就会轻一些。',
];

const CORNER = [
  '把感受写下来的那一刻，你已经在照顾自己了。',
  '如果今天很难，那就只做「呼吸」这一件事。',
  '你不是矫情，你只是需要被好好对待。',
  '感到疲惫，说明你一直在认真生活。',
  '难过的时候，试着摸摸自己的手臂，像安慰朋友那样。',
];

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];

/* ---------------- 状态 ---------------- */
let records = [];          // {id,date,time,durationMin,mood,weather,workday,triggers[],healers[],insight,createdAt}
let meals = {};            // { 'YYYY-MM-DD': { b:{st,what}, l:{st,what}, d:{st,what}, sn:{ate,what} } }
let settings = {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  customTriggers: [],   // 用户自定义的"变坏原因"
};
let curView = 'record';
let rangeSel = 'all';
let editingId = null;      // 正在编辑的记录 id
let formManualWorkday = false; // 用户是否手动改过工作日

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ---------------- 工具 ---------------- */
function loadAll() {
  try { records = JSON.parse(localStorage.getItem(LS_RECORDS)) || []; } catch (e) { records = []; }
  try { meals = JSON.parse(localStorage.getItem(LS_MEALS)) || {}; } catch (e) { meals = {}; }
  try { settings = Object.assign(settings, JSON.parse(localStorage.getItem(LS_SETTINGS)) || {}); } catch (e) { /* keep */ }
}
function saveRecords() { localStorage.setItem(LS_RECORDS, JSON.stringify(records)); }
function saveSettings() { localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); }
function saveMeals() { localStorage.setItem(LS_MEALS, JSON.stringify(meals)); }

function pad(n) { return String(n).padStart(2, '0'); }
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function nowHM() { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function weekdayCN(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return WEEK_CN[d.getDay()];
}
function isWorkdayDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const w = d.getDay();
  return w >= 1 && w <= 5;
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function slotOf(hour) {
  for (const s of SLOTS) if (hour >= s.range[0] && hour < s.range[1]) return s.key;
  return '夜晚';
}
function durText(min) {
  min = Math.max(0, Math.round(min || 0));
  if (min < 60) return min + ' 分钟';
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
}
function fmtDateCN(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}
function moodOf(lv) { return MOODS.find((m) => m.lv === lv) || MOODS[2]; }
function weatherOf(v) { return WEATHERS.find((w) => w.v === v) || { v: v || '?', ico: '🌤️' }; }

function sortRecords(list) {
  return list.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}
/* 时间窗口过滤 */
function windowRecords(list, range) {
  if (range === 'all' || !list.length) return list.slice();
  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - (range - 1));
  const cut = cutoff.toISOString().slice(0, 10);
  return list.filter((r) => r.date >= cut);
}

/* ---------------- 基础交互 ---------------- */
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), ms);
}

function openConfirm({ emoji = '🫧', text = '确定吗？', onYes }) {
  $('#confirm-emoji').textContent = emoji;
  $('#confirm-text').textContent = text;
  $('#confirm-modal').classList.remove('hidden');
  window._confirmYes = onYes;
}
function closeConfirm() { $('#confirm-modal').classList.add('hidden'); }

/* 简易 markdown -> html（供 AI 回复使用） */
function mdToHtml(src) {
  if (!src) return '';
  let s = esc(src).trim();
  s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const lines = s.split('\n').map((l) => l.trim()).filter(Boolean);
  let html = '', inList = false;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (const line of lines) {
    const h = line.match(/^#{1,4}\s+(.*)/);
    const li = line.match(/^[-*•]\s+(.*)/);
    const num = line.match(/^\d+[.、]\s*(.*)/);
    if (h) { closeList(); html += `<h4>${h[1]}</h4>`; }
    else if (li || num) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${(li || num)[1]}</li>`;
    } else { closeList(); html += `<p>${line}</p>`; }
  }
  closeList();
  return html;
}

/* ============================================================
   导航
   ============================================================ */
function switchView(name) {
  curView = name;
  $$('.tab').forEach((b) => b.classList.toggle('is-active', b.dataset.view === name));
  ['record', 'timeline', 'insight', 'heal'].forEach((v) => {
    $('#view-' + v).classList.toggle('hidden', v !== name);
  });
  if (name === 'timeline') renderTimeline();
  if (name === 'insight') renderInsight();
  if (name === 'heal') updateHealState();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============================================================
   记录表单
   ============================================================ */
function buildChips(container, items, selected, selClass = 'is-on', extra = '') {
  container.innerHTML = items.map((it) => {
    const on = selected.has(it) ? ' ' + selClass : '';
    return `<button type="button" class="chip${on}" data-val="${esc(it)}" ${extra}>${esc(it)}</button>`;
  }).join('');
}

/* ---- 触发原因 chips（预设 + 自定义 + 自写入口） ---- */
function snapshotTrig() {
  return $$('#trigger-chips .chip.is-on').map((c) => c.dataset.val);
}
function renderTriggerChips(selected) {
  const customs = settings.customTriggers || [];
  // 预设 + 自定义 + 当前已选（保证编辑旧记录时旧值也可见）
  const union = [...TRIGGERS, ...customs, ...selected];
  const seen = new Set();
  let html = '';
  union.forEach((t) => {
    if (seen.has(t)) return;
    seen.add(t);
    const on = selected.has(t);
    const isCustom = customs.includes(t);
    html += `<button type="button" class="chip${on ? ' is-on' : ''}" data-val="${esc(t)}">${esc(t)}${isCustom ? `<i class="chip-x" data-x="${esc(t)}" title="不再常用，移除它">✕</i>` : ''}</button>`;
  });
  html += `<button type="button" class="chip-add" id="trigger-custom-btn">✍️ 自己写一个…</button>`;
  $('#trigger-chips').innerHTML = html;
}
function openTriggerCustom() {
  const row = $('#custom-trigger-row');
  row.classList.remove('hidden');
  const inp = $('#custom-trigger-input');
  inp.value = '';
  setTimeout(() => inp.focus(), 30);
}
function closeTriggerCustom() { $('#custom-trigger-row').classList.add('hidden'); }
function confirmTriggerCustom() {
  const v = $('#custom-trigger-input').value.trim();
  if (!v) { toast('🌷 先写点什么，再让我加进去吧'); return; }
  const customs = settings.customTriggers || [];
  const existed = customs.includes(v) || TRIGGERS.includes(v);
  if (!existed) {
    customs.push(v);
    settings.customTriggers = customs;
    saveSettings();
  }
  closeTriggerCustom();
  const sel = new Set(snapshotTrig());
  sel.add(v);
  renderTriggerChips(sel);
  toast(existed ? '💗 这个原因已经在了，已帮你勾上' : '🌱 记住这个原因了，下次它会在列表里');
}
function removeTriggerCustom(v) {
  settings.customTriggers = (settings.customTriggers || []).filter((c) => c !== v);
  saveSettings();
  const sel = new Set(snapshotTrig().filter((s) => s !== v));
  renderTriggerChips(sel);
  toast('🗑️ 已移除自定义原因（历史记录不受影响）');
}

function renderWeatherChips() {
  $('#weather-chips').innerHTML = WEATHERS.map((w) => {
    return `<button type="button" class="chip" data-val="${w.v}"><span style="margin-right:4px">${w.ico}</span>${w.v}</button>`;
  }).join('');
}
function renderMoodPicker() {
  $('#mood-picker').innerHTML = MOODS.map((m) => {
    return `<button type="button" class="mood" data-lv="${m.lv}"><span class="m-ico">${m.ico}</span><span class="m-txt">${m.txt}</span></button>`;
  }).join('');
}

function resetForm() {
  editingId = null;
  formManualWorkday = false;
  $('#rec-id').value = '';
  $('#rec-date').value = todayStr();
  $('#rec-time').value = nowHM();
  $('#rec-dur').value = 60;
  updateDurText(60);
  $('#rec-insight').value = '';
  $('#form-title').textContent = '🌱 把今天的心情放进来';
  $('#save-label').textContent = '收藏此刻，轻轻放下';
  $('#btn-cancel-edit').classList.add('hidden');
  renderWeatherChips();
  renderMoodPicker();
  $('#weather-chips').querySelectorAll('.chip').forEach((c) => c.classList.remove('is-on'));
  $('#mood-picker').querySelectorAll('.mood').forEach((c) => c.classList.remove('is-on'));
  // 触发与疗愈默认空
  renderTriggerChips(new Set());
  buildChips($('#heal-chips'), HEALERS, new Set());
  setWorkdaySegAuto();
  $('#rec-date').dispatchEvent(new Event('change'));
}

function updateDurText(min) {
  $('#dur-text').textContent = '大约 ' + durText(min);
}

function setWorkdaySegAuto() {
  const wd = isWorkdayDate($('#rec-date').value || todayStr());
  setWorkdaySeg(wd);
}
function setWorkdaySeg(wd) {
  $$('#workday-seg .seg-btn').forEach((b) => b.classList.toggle('is-active', (b.dataset.v === 'workday') === wd));
}

function fillForm(rec) {
  editingId = rec.id;
  formManualWorkday = true;
  $('#rec-id').value = rec.id;
  $('#rec-date').value = rec.date;
  $('#rec-time').value = rec.time || '20:00';
  $('#rec-dur').value = rec.durationMin || 60;
  updateDurText(rec.durationMin || 60);
  $('#rec-insight').value = rec.insight || '';
  $('#form-title').textContent = '✏️ 修改这段时光';
  $('#save-label').textContent = '保存修改';
  $('#btn-cancel-edit').classList.remove('hidden');

  renderWeatherChips();
  $$('#weather-chips .chip').forEach((c) => c.classList.toggle('is-on', c.dataset.val === rec.weather));
  renderMoodPicker();
  $$('#mood-picker .mood').forEach((m) => m.classList.toggle('is-on', String(m.dataset.lv) === String(rec.mood)));
  renderTriggerChips(new Set(rec.triggers || []));
  buildChips($('#heal-chips'), HEALERS, new Set(rec.healers || []));
  setWorkdaySeg(rec.workday !== false);
  $('#workday-auto-hint').textContent = '（已按你的原记录载入）';
}

function collectForm() {
  const date = $('#rec-date').value;
  const time = $('#rec-time').value;
  if (!date || !time) { toast('🌷 还差日期或时间点哦'); return null; }
  const triggers = $$('#trigger-chips .chip.is-on').map((c) => c.dataset.val);
  const healers = $$('#heal-chips .chip.is-on').map((c) => c.dataset.val);
  const weatherEl = $('#weather-chips .chip.is-on');
  const moodEl = $('#mood-picker .mood.is-on');
  const wdBtn = $('#workday-seg .seg-btn.is-active');
  return {
    id: editingId || uid(),
    date,
    time,
    durationMin: Number($('#rec-dur').value),
    mood: moodEl ? Number(moodEl.dataset.lv) : null,
    weather: weatherEl ? weatherEl.dataset.val : null,
    workday: wdBtn ? wdBtn.dataset.v === 'workday' : isWorkdayDate(date),
    triggers,
    healers,
    insight: $('#rec-insight').value.trim(),
    createdAt: Date.now(),
  };
}

function submitRecord(e) {
  e.preventDefault();
  const data = collectForm();
  if (!data) return;
  const isEdit = records.some((r) => r.id === data.id);
  if (isEdit) {
    records = records.map((r) => (r.id === data.id ? Object.assign(r, data) : r));
    toast('💗 改好啦，谢谢你回来照顾它');
  } else {
    records.push(data);
    toast(randomPick(GENTLE));
  }
  saveRecords();
  resetForm();
}

/* ============================================================
   时光集
   ============================================================ */
let tlMode = 'month';            // 'month' | 'week' | 'list'
let focusDate = todayStr();      // 日历聚焦的日期

function renderTimeline() {
  // 模式按钮态
  $$('#tl-mode-seg .seg-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.tl === tlMode));
  const listEl = $('#timeline-list');
  const calEl = $('#calendar-wrap');
  const navEl = $('#cal-nav');
  if (tlMode === 'list') {
    listEl.classList.remove('hidden');
    calEl.classList.add('hidden');
    navEl.classList.add('hidden');
    renderListBox();
  } else {
    listEl.classList.add('hidden');
    calEl.classList.remove('hidden');
    navEl.classList.remove('hidden');
    calEl.innerHTML = tlMode === 'month' ? renderMonth() : renderWeek();
    bindDayCells(calEl);
    updateCalNav();
  }
}

/* ---- 列表模式 ---- */
function renderListBox() {
  const box = $('#timeline-list');
  if (!records.length) {
    box.innerHTML = `
      <div class="empty">
        <span class="empty-emoji">🌱</span>
        <h3>时光集还是空空的</h3>
        <p>没关系，这里不急。<br>等你愿意的时候，写下第一笔就好。</p>
        <button class="btn-primary" id="go-record-empty">去记一笔 →</button>
      </div>`;
    $('#go-record-empty') && $('#go-record-empty').addEventListener('click', () => switchView('record'));
    return;
  }
  const sorted = sortRecords(records).reverse();
  const groups = {};
  sorted.forEach((r) => { (groups[r.date] = groups[r.date] || []).push(r); });

  box.innerHTML = Object.keys(groups).map((date) => {
    const list = groups[date];
    const wd = list[0].workday !== false;
    return `
      <div class="day-group">
        <div class="day-head">
          <span class="day-title">${fmtDateCN(date)} · 周${weekdayCN(date)}</span>
          <span class="day-desc">${wd ? '💼 工作日' : '🍃 休息日'} · ${list.length} 段心情</span>
        </div>
        ${list.map((r) => entryHtml(r)).join('')}
      </div>`;
  }).join('');
  bindEntryCards(box, renderTimeline);
}

/* 给容器内的记录卡片绑定：点开展开、编辑、删除 */
function bindEntryCards(scope, onDeleteDone) {
  scope.querySelectorAll('.entry').forEach((el) => {
    el.addEventListener('click', (ev) => {
      if (ev.target.closest('.mini-btn')) return;
      el.classList.toggle('expanded');
    });
    const id = el.dataset.id;
    const editBtn = el.querySelector('.mini-btn.edit');
    const delBtn = el.querySelector('.mini-btn.del');
    editBtn && editBtn.addEventListener('click', () => {
      $('#day-modal').classList.add('hidden'); // 若从日历弹窗进来，先收起
      startEdit(id);
    });
    delBtn && delBtn.addEventListener('click', () => askDelete(id, onDeleteDone));
  });
}

/* ---- 日期工具（均按本地时间、正午规避夏令时偏差） ---- */
function toDate(ds) { const [y, m, d] = ds.split('-').map(Number); return new Date(y, m - 1, d, 12); }
function ymd(dt) { return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`; }
function addDays(ds, n) { const dt = toDate(ds); dt.setDate(dt.getDate() + n); return ymd(dt); }
function addMonths(ds, n) {
  const dt = toDate(ds);
  const day = dt.getDate();
  dt.setDate(1);
  dt.setMonth(dt.getMonth() + n);
  const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  dt.setDate(Math.min(day, last));
  return ymd(dt);
}
/* 周一为一周开始：返回 focus 所在周的周一 */
function weekStart(ds) {
  const dt = toDate(ds);
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  return ymd(dt);
}
function shortDur(min) {
  min = Math.round(min || 0);
  if (min < 60) return min + ' 分';
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} 时 ${m} 分` : `${h} 时`;
}
function byDate() {
  const map = {};
  records.forEach((r) => { (map[r.date] = map[r.date] || []).push(r); });
  Object.keys(map).forEach((k) => map[k].sort((a, b) => a.time.localeCompare(b.time)));
  return map;
}
function dayMoodIco(recs) {
  const moods = recs.filter((r) => r.mood);
  if (!moods.length) return '🌤️';
  const avg = moods.reduce((s, r) => s + r.mood, 0) / moods.length;
  return moodOf(Math.round(avg)).ico;
}

/* ---- 格子 ---- */
function cellHtml(date, recs, isOut, isWeek) {
  const t = date === todayStr();
  const todayMark = t ? ' today' : '';
  const has = recs && recs.length;
  const ico = has ? dayMoodIco(recs) : '🌱';
  const maxPills = isWeek ? 5 : 3;
  const pills = has ? recs.slice(0, maxPills) : [];
  const more = has && recs.length > maxPills ? recs.length - maxPills : 0;
  const dayNum = toDate(date).getDate();
  return `
    <div class="day-cell${isOut ? ' out' : ''}${todayMark}${has ? ' has' : ''}${isWeek ? ' week-cell' : ''}" data-date="${date}" role="button" tabindex="0" aria-label="${fmtDateCN(date)}">
      <div class="d-head">
        <span class="d-num">${dayNum}</span>
        <span class="d-wk">${t ? '今天' : '周' + weekdayCN(date)}</span>
      </div>
      <div class="d-pills">
        ${has ? pills.map((r) => {
          const m = moodOf(r.mood);
          const w = weatherOf(r.weather);
          return `<span class="d-pill" title="${esc(r.time)} ${m.txt} · ${w.v} · 持续${durText(r.durationMin)}${r.triggers && r.triggers.length ? ' · ' + esc(r.triggers.join('、')) : ''}">${r.time} ${r.mood ? m.ico : '·'}<span class="p-time">&nbsp;${shortDur(r.durationMin)}</span></span>`;
        }).join('') : `<span class="d-more">空着 · 点我记一笔</span>`}
        ${more ? `<span class="d-more">还有 ${more} 段…</span>` : ''}
      </div>
    </div>`;
}

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
function weekdayHeadRow() {
  return `<div class="wkhead">${WEEK_LABELS.map((w, i) => `<div class="wk-label ${i >= 5 ? 'hl' : ''}">周${w}</div>`).join('')}</div>`;
}

/* ---- 月视图 ---- */
function renderMonth() {
  const [y, m] = focusDate.split('-').map(Number);
  const firstDow = new Date(y, m - 1, 1, 12).getDay();
  const lead = (firstDow + 6) % 7; // 月初前补几天（周一起始）
  const daysInM = new Date(y, m, 0, 12).getDate();
  const daysInPrev = new Date(y, m - 1, 0, 12).getDate();
  const map = byDate();
  const cells = [];
  for (let i = 0; i < lead; i++) {
    cells.push(cellHtml(ymd(new Date(y, m - 2, daysInPrev - lead + 1 + i, 12)), map[ymd(new Date(y, m - 2, daysInPrev - lead + 1 + i, 12))], true, false));
  }
  for (let d = 1; d <= daysInM; d++) {
    const ds = `${focusDate.slice(0, 8)}${pad(d)}`;
    cells.push(cellHtml(ds, map[ds], false, false));
  }
  const total = cells.length;
  void total;
  let next = 1;
  while (cells.length < 42) {
    const real = ymd(new Date(y, m, next, 12));
    cells.push(cellHtml(real, map[real], true, false));
    next++;
  }
  return `
    <div class="cal-wrap">
      <p class="cal-tip">💡 点击任意一天可查看当天，或为那天补记一笔。</p>
      ${weekdayHeadRow()}
      <div class="month-grid">${cells.join('')}</div>
    </div>`;
}

/* ---- 周视图 ---- */
function renderWeek() {
  const mon = weekStart(focusDate);
  const map = byDate();
  const cells = [];
  for (let i = 0; i < 7; i++) {
    const ds = addDays(mon, i);
    cells.push(cellHtml(ds, map[ds], false, true));
  }
  return `
    <div class="cal-wrap">
      <p class="cal-tip">💡 每一格是一天，点击查看详情或补记。</p>
      ${weekdayHeadRow()}
      <div class="week-grid">${cells.join('')}</div>
    </div>`;
}

function updateCalNav() {
  const nav = $('#cal-range');
  if (tlMode === 'month') {
    const [y, m] = focusDate.split('-').map(Number);
    nav.textContent = `${y} 年 ${m} 月`;
  } else {
    const mon = weekStart(focusDate);
    const end = addDays(mon, 6);
    const sameMonth = mon.slice(0, 7) === end.slice(0, 7);
    nav.textContent = sameMonth ? `${fmtDateCN(mon)} ~ ${end.slice(8)} 日` : `${fmtDateCN(mon)} ~ ${fmtDateCN(end)}`;
  }
  const inThisWeek = todayStr() >= weekStart(focusDate) && todayStr() <= addDays(weekStart(focusDate), 6);
  const inThisMonth = focusDate.slice(0, 7) === todayStr().slice(0, 7);
  $('#cal-today').style.visibility = (tlMode === 'month' ? inThisMonth : inThisWeek) ? 'hidden' : 'visible';
}

function bindDayCells(scope) {
  scope.querySelectorAll('.day-cell').forEach((cell) => {
    const open = () => openDayModal(cell.dataset.date);
    cell.addEventListener('click', open);
    cell.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
}

/* ---- 某一天的明细弹窗 ---- */
/* 三餐结构：{b:{st:'ok'|'late'|'skip', what}, l, d, sn:{ate:bool, what}} */
const MEAL_META = [
  { key: 'b', ico: '☀️', name: '早餐' },
  { key: 'l', ico: '🌤️', name: '午餐' },
  { key: 'd', ico: '🌙', name: '晚餐' },
];
function mealOf(date) {
  if (!meals[date]) meals[date] = { b: { st: 'ok', what: '' }, l: { st: 'ok', what: '' }, d: { st: 'ok', what: '' }, sn: { ate: false, what: '' } };
  return meals[date];
}
function renderMealCard(date) {
  const box = $('#day-meal-card');
  if (date > todayStr()) {
    box.innerHTML = `<div class="meal-title">🍱 这天还没到来，先不急着记吃的～</div>`;
    return;
  }
  const m = mealOf(date);
  const row = (meta) => {
    const st = (m[meta.key] && m[meta.key].st) || 'ok';
    const what = (m[meta.key] && m[meta.key].what) || '';
    const mk = (s, label) => `<button type="button" class="ms${st === s ? ' ' + s : ''}" data-st="${s}">${label}</button>`;
    return `
      <div class="meal-row" data-meal="${meta.key}">
        <span class="meal-name">${meta.ico} ${meta.name}</span>
        <div class="meal-st">
          ${mk('ok', '按时吃')}${mk('late', '推迟 / 凑合')}${mk('skip', '没吃')}
        </div>
        <div class="meal-what"><input type="text" data-what="${meta.key}" maxlength="40" placeholder="这顿吃了什么？" value="${esc(what)}"></div>
      </div>`;
  };
  const sn = m.sn || { ate: false, what: '' };
  const snackBtn = (ate, label, cls) => `<button type="button" class="ms${(!!sn.ate === ate) ? ' ' + cls : ''}" data-st="${ate ? '1' : '0'}">${label}</button>`;
  box.innerHTML = `
    <div class="meal-title">🍱 这天吃了什么</div>
    <div class="meal-sub">状态点一下就切换，吃的写进输入框，都会自动保存 🌷</div>
    ${MEAL_META.map(row).join('')}
    <div class="meal-row" data-meal="sn">
      <span class="meal-name">🍪 零食</span>
      <div class="meal-st">
        ${snackBtn(true, '吃了', 'ok')}${snackBtn(false, '没吃', 'skip')}
      </div>
      <div class="meal-what"><input type="text" data-what="sn" maxlength="40" placeholder="吃了什么零食？" value="${esc(sn.what || '')}"></div>
    </div>
    <div class="meal-note">记录过去某天也可以，随时点日历补上。</div>`;

  /* 状态切换：直接改 DOM 高亮 + 保存（不重渲染，避免丢输入焦点） */
  box.querySelectorAll('.meal-row').forEach((rowEl) => {
    const key = rowEl.dataset.meal;
    rowEl.querySelectorAll('.ms').forEach((btn) => {
      btn.addEventListener('click', () => {
        const st = btn.dataset.st;
        if (key === 'sn') {
          m.sn.ate = st === '1';
          rowEl.querySelectorAll('.ms').forEach((b) => b.classList.remove('ok', 'skip'));
          btn.classList.add(st === '1' ? 'ok' : 'skip');
        } else {
          m[key].st = st;
          rowEl.querySelectorAll('.ms').forEach((b) => b.classList.remove('ok', 'late', 'skip'));
          btn.classList.add(st);
        }
        saveMeals();
      });
    });
    const inp = rowEl.querySelector('input[data-what]');
    inp && inp.addEventListener('change', () => {
      const v = inp.value.trim();
      if (key === 'sn') m.sn.what = v; else m[key].what = v;
      saveMeals();
    });
  });
}

function openDayModal(date) {
  const recs = sortRecords(records.filter((r) => r.date === date));
  const t = date === todayStr();
  $('#day-modal-title').textContent = `${fmtDateCN(date)} · 周${weekdayCN(date)}${t ? '（今天）' : ''} · ${isWorkdayDate(date) ? '💼 工作日' : '🍃 休息日'}`;
  renderMealCard(date);
  const body = $('#day-modal-body');
  if (!recs.length) {
    body.innerHTML = `<div class="day-empty">这一天还没有记录。<br>想写点什么的话，点下面的按钮就好 🌷</div>`;
  } else {
    body.innerHTML = recs.map((r) => entryHtml(r)).join('');
  }
  window._dayModalDate = date;
  bindEntryCards(body, () => { $('#day-modal').classList.add('hidden'); renderTimeline(); });
  $('#day-modal').classList.remove('hidden');
}
function closeDayModal() { $('#day-modal').classList.add('hidden'); }
function addRecordOn(date) {
  resetForm();
  const d = $('#rec-date');
  d.value = date;
  d.dispatchEvent(new Event('change')); // 重新自动判断工作日
  closeDayModal();
  switchView('record');
}

function entryHtml(r) {
  const m = moodOf(r.mood);
  const w = weatherOf(r.weather);
  const wd = r.workday !== false;
  const quote = (r.insight || '').trim();
  const tags = [...(r.triggers || [])].slice(0, 2).map(esc);
  return `
    <div class="entry" data-id="${r.id}">
      <div class="entry-top">
        <span class="entry-time">🕰️ ${esc(r.time)}</span>
        <span class="entry-tag ${wd ? 'work' : 'rest'}">${wd ? '💼 工作日' : '🍃 休息日'}</span>
        ${r.weather ? `<span class="entry-tag">${w.ico} ${esc(w.v)}</span>` : ''}
        <span class="entry-tag">⏳ ${durText(r.durationMin)}</span>
        <span class="entry-mood" title="难过程度 ${m.txt}">${r.mood ? m.ico + ' ' + m.txt : ''}</span>
      </div>
      ${tags.length ? `<div class="entry-cause"><b>心情变坏：</b>${tags.map((t) => `#${t}`).join(' ')}</div>` : ''}
      ${quote ? `<div class="entry-quote">${esc(quote)}</div>` : ''}
      <div class="quote-hint">点一下卡片展开 ↕</div>
      <div class="entry-ops">
        <button class="mini-btn edit">✏️ 编辑</button>
        <button class="mini-btn del">🗑️ 删除</button>
      </div>
    </div>`;
}

function startEdit(id) {
  const rec = records.find((r) => r.id === id);
  if (!rec) return;
  fillForm(rec);
  switchView('record');
}

function askDelete(id, onDone) {
  const rec = records.find((r) => r.id === id);
  const d = rec ? `${fmtDateCN(rec.date)} ${rec.time}` : '';
  openConfirm({
    emoji: '🍂',
    text: `确定要放下这段回忆吗？\n（${d} 的记录会被删除）`,
    onYes: () => {
      records = records.filter((r) => r.id !== id);
      saveRecords();
      closeConfirm();
      toast('🕊️ 已轻轻放下');
      if (onDone) onDone(); else renderTimeline();
    },
  });
}

/* ============================================================
   心象图谱（分析）
   ============================================================ */
function renderInsight() {
  const box = $('#insight-content');
  const data = windowRecords(records, rangeSel);
  $$('#range-seg .seg-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.r === rangeSel));

  if (!records.length) {
    box.innerHTML = `
      <div class="empty">
        <span class="empty-emoji">🔮</span>
        <h3>还没有足够的记录来画图谱</h3>
        <p>记下 3 段心情之后，这里就会慢慢浮现<br>属于你的情绪规律。</p>
        <button class="btn-primary" id="go-record-empty2">先去记一笔 →</button>
      </div>`;
    $('#go-record-empty2') && $('#go-record-empty2').addEventListener('click', () => switchView('record'));
    return;
  }
  if (!data.length) {
    box.innerHTML = `<div class="empty"><span class="empty-emoji">🗓️</span><h3>这个时间范围里还没有记录</h3><p>换一个范围试试，或者看看全部。</p></div>`;
    return;
  }
  box.innerHTML = buildInsightHTML(data);
}

function buildInsightHTML(data) {
  const n = data.length;
  const avgDur = data.reduce((s, r) => s + r.durationMin, 0) / n;
  const avgMood = data.filter((r) => r.mood).reduce((s, r) => s + r.mood, 0) / Math.max(1, data.filter((r) => r.mood).length);

  /* --- 时刻段分布 --- */
  const slotCount = SLOTS.map((s) => ({
    key: s.key,
    n: data.filter((r) => slotOf(Number((r.time || '12:00').split(':')[0])) === s.key).length,
  }));
  const maxSlot = slotCount.reduce((a, b) => (b.n > a.n ? b : a), slotCount[0]);

  /* --- 时长趋势：按时间顺序 --- */
  const ordered = sortRecords(data);
  const durSeries = ordered.map((r) => r.durationMin);
  const trend = calcTrend(durSeries);
  const hours = durSeries.map((m) => (m / 60).toFixed(1));

  /* --- 触发原因 --- */
  const trigMap = {};
  data.forEach((r) => (r.triggers || []).forEach((t) => {
    trigMap[t] = trigMap[t] || { n: 0, sum: 0 };
    trigMap[t].n++; trigMap[t].sum += r.durationMin;
  }));
  const trigList = Object.entries(trigMap)
    .map(([k, v]) => ({ k, n: v.n, avg: v.sum / v.n }))
    .sort((a, b) => b.n - a.n).slice(0, 5);

  /* --- 疗愈方式 --- */
  const healMap = {};
  data.forEach((r) => (r.healers || []).forEach((h) => {
    healMap[h] = healMap[h] || { n: 0, sum: 0 };
    healMap[h].n++; healMap[h].sum += r.durationMin;
  }));
  const healList = Object.entries(healMap)
    .map(([k, v]) => ({ k, n: v.n, avg: v.sum / v.n }))
    .sort((a, b) => (a.avg - b.avg) || (b.n - a.n)).slice(0, 5);

  /* --- 工作日 vs 休息日 --- */
  const wd = data.filter((r) => r.workday !== false);
  const rd = data.filter((r) => r.workday === false);
  const cmp = (arr) => {
    if (!arr.length) return null;
    const d = arr.reduce((s, r) => s + r.durationMin, 0) / arr.length;
    const m = arr.filter((r) => r.mood).reduce((s, r) => s + r.mood, 0) / Math.max(1, arr.filter((r) => r.mood).length);
    return { n: arr.length, d, m };
  };
  const wc = cmp(wd), rc = cmp(rd);

  /* --- 天气 --- */
  const wxMap = {};
  data.forEach((r) => {
    if (!r.weather) return;
    wxMap[r.weather] = wxMap[r.weather] || { n: 0, sum: 0 };
    wxMap[r.weather].n++; wxMap[r.weather].sum += r.durationMin;
  });
  const wxList = Object.entries(wxMap)
    .map(([k, v]) => ({ k, n: v.n, avg: v.sum / v.n }))
    .sort((a, b) => b.n - a.n).slice(0, 3);

  /* --- 感悟精选 --- */
  const quotes = sortRecords(data).filter((r) => (r.insight || '').trim()).slice(-6).reverse().slice(0, 3);

  /* 文案 */
  const slotNote = maxSlot.n > 0 ? `「${maxSlot.key}」是你最容易低落的时段，共出现 ${maxSlot.n} 次。那段时间里，记得对自己温柔一点。` : '';
  const trendVerdict = trendVerbal(trend);

  const html = [];
  html.push(`
    <div class="stat-row">
      <div class="stat-card"><span class="s-ico">🗓️</span><div class="s-num">${n}</div><div class="s-label">段心情记录</div></div>
      <div class="stat-card"><span class="s-ico">⏳</span><div class="s-num" style="font-size:20px">${durText(Math.round(avgDur))}</div><div class="s-label">平均持续时长</div></div>
      <div class="stat-card"><span class="s-ico">💧</span><div class="s-num" style="font-size:20px">${avgMood ? moodOf(Math.round(avgMood)).txt : '—'}</div><div class="s-label">平均难过程度</div></div>
    </div>`);

  /* 时刻段分布 */
  html.push(`
    <div class="card panel">
      <div class="panel-title">🕰️ 低谷通常从几点开始？</div>
      <div class="panel-note">${slotNote || '记录更多心情后，这里会慢慢显现规律。'}</div>
      <div class="chart-wrap">
        ${slotCount.map((s) => `
          <div class="bar-row">
            <span class="bar-label">${s.key}</span>
            <div class="bar-track"><div class="bar-fill ${s.n === maxSlot.n && s.n > 0 ? 'hot' : ''}" style="width:${s.n ? Math.max(6, (s.n / Math.max(1, maxSlot.n)) * 100) : 2}%"></div></div>
            <span class="bar-val">${s.n}</span>
          </div>`).join('')}
      </div>
    </div>`);

  /* 时长趋势 */
  html.push(`
    <div class="card panel">
      <div class="panel-title">📈 难过的时间，在变长还是变短？</div>
      <div class="panel-note">每一次低谷持续的时间，以及总体的走向。</div>
      <div class="trend-card">
        <div class="trend-chart">${svgLineChart(durSeries)}</div>
        <div class="verdict">
          <div class="v-big">${trendVerdict.title}</div>
          <div class="v-sub">${trendVerdict.sub}</div>
          <span class="badge ${trendVerdict.cls}">${trendVerdict.tag}</span>
        </div>
      </div>
    </div>`);

  /* 变坏原因 */
  html.push(`
    <div class="card panel">
      <div class="panel-title">🌧️ 什么最容易弄坏你的心情？</div>
      <div class="panel-note">出现次数越多，位置越靠前；括号里是这类低谷平均持续的时间。</div>
      <div class="taglist">
        ${trigList.length ? trigList.map((t, i) => `
          <span class="tagpill"><i>${i + 1}</i> ${esc(t.k)}<span class="pill-note">${t.n} 次 · 平均 ${durText(Math.round(t.avg))}</span></span>`).join('')
          : '<span class="pill-note">还没有记录原因，下次可以试着选一选。</span>'}
      </div>
    </div>`);

  /* 什么最疗愈 */
  html.push(`
    <div class="card panel">
      <div class="panel-title">🌤️ 什么最能哄好你？</div>
      <div class="panel-note">记录里用上这些方法后，低谷的平均时长更短，说明它可能对你更有效。</div>
      <div class="taglist">
        ${healList.length ? healList.map((t) => `
          <span class="tagpill sage">${esc(t.k)}<span class="pill-note">${t.n} 次 · 平均 ${durText(Math.round(t.avg))}</span></span>`).join('')
          : '<span class="pill-note">还没有记录「怎么变好的」，下次难过好转后记得记下来哦。</span>'}
      </div>
    </div>`);

  /* 环境对比 */
  const envCells = [];
  if (wc && rc) {
    envCells.push(`
      <div class="chart-wrap">
        <div class="bar-row"><span class="bar-label">工作日</span><div class="bar-track"><div class="bar-fill ${wc.d > rc.d ? 'hot' : ''}" style="width:${Math.max(6, (wc.d / Math.max(1, Math.max(wc.d, rc.d))) * 100)}%"></div></div><span class="bar-val">${wc.n}次</span></div>
        <div class="bar-row"><span class="bar-label">休息日</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(6, (rc.d / Math.max(1, Math.max(wc.d, rc.d))) * 100)}%"></div></div><span class="bar-val">${rc.n}次</span></div>
        <p style="font-size:12px;color:var(--ink-faint);margin-top:10px">条形长度 = 平均持续时长 ｜ 工作日平均 ${durText(Math.round(wc.d))} vs 休息日 ${durText(Math.round(rc.d))}${wc.m && rc.m ? ` ｜ 难过程度 ${moodOf(Math.round(wc.m)).txt} vs ${moodOf(Math.round(rc.m)).txt}` : ''}</p>
      </div>`);
  }
  html.push(`
    <div class="card panel">
      <div class="panel-title">🏞️ 环境与心情</div>
      <div class="panel-note">工作日与休息日的对比，以及常见天气下的平均时长。</div>
      ${envCells.length ? envCells : '<p class="l-note">记录里有工作日也有休息日的对比后，这里会更有意义。</p>'}
      <div style="margin-top:14px" class="taglist">
        ${wxList.map((w) => `<span class="tagpill">${weatherOf(w.k).ico} ${esc(w.k)}<span class="pill-note">${w.n} 次 · 平均 ${durText(Math.round(w.avg))}</span></span>`).join('')}
      </div>
    </div>`);

  /* 感悟精选 */
  if (quotes.length) {
    html.push(`
      <div class="card panel">
        <div class="panel-title">🕯️ 你说过的话 · 精选</div>
        <div class="panel-note">偶尔回看，会发现自己其实一直很用力地在生活。</div>
        <div class="insight-quotes">
          ${quotes.map((q) => `<div class="q">${esc(q.insight)}<span class="q-date">—— ${fmtDateCN(q.date)} · ${esc(q.time)}</span></div>`).join('')}
        </div>
      </div>`);
  }

  /* 温柔尾巴 */
  html.push(`
    <div class="card tiny-card" style="text-align:center">
      <p style="font-size:14px">💌 图谱只是镜子，不定义你。<br>你已经在认真地认识自己，这就很棒了。</p>
    </div>`);

  return html.join('');
}

/* 线性回归：返回斜率方向结论 */
function calcTrend(series) {
  const n = series.length;
  if (n < 2) return null;
  let slope = 0;
  if (n >= 3) {
    const xs = series.map((_, i) => i);
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = series.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (i - mx) * (series[i] - my); den += (i - mx) * (i - mx); }
    slope = den ? num / den : 0;
  }
  const first = series[0], last = series[n - 1];
  const totalPct = first ? ((last - first) / first) * 100 : 0;
  return { slope, n, first, last, totalPct };
}

function trendVerbal(t) {
  if (!t) return { title: '先多记几笔', sub: '积累 3 段以上心情后，就能看出时间是在变长还是变短了。', tag: '等待中', cls: 'flat' };
  if (t.n < 3) {
    return {
      title: '还看不太清',
      sub: `最近一段 ${durText(Math.round(t.last))}，${t.last <= t.first ? '好像比一开始短了一些' : '好像比一开始长了一些'}。再多记几笔会更准。`,
      tag: '观察中', cls: 'flat',
    };
  }
  const ratio = t.slope / (Math.max(1, t.first) / 1); // 斜率相对起点
  if (Math.abs(t.slope) < 0.5) {
    return {
      title: '大致平稳',
      sub: `每次低谷平均约 ${durText(Math.round((t.first + t.last) / 2))}，时长没有明显的变长或变短。`,
      tag: '稳 定', cls: 'flat',
    };
  }
  if (t.slope < 0) {
    return {
      title: '正在慢慢变短 ✨',
      sub: `最早约 ${durText(Math.round(t.first))} → 最近约 ${durText(Math.round(t.last))}。低谷停留的时间在缩短，这是个温柔的好信号。`,
      tag: '⬇ 在好转', cls: 'up',
    };
  }
  return {
    title: '低谷变长了，抱抱你',
    sub: `最早约 ${durText(Math.round(t.first))} → 最近约 ${durText(Math.round(t.last))}。低谷停留得更久了，也许最近压力比较大。去疗愈室聊聊？`,
    tag: '⬆ 需要关照', cls: 'down',
  };
}

/* SVG 折线图 */
function svgLineChart(series, W = 560, H = 180) {
  const n = series.length;
  if (n === 0) return '';
  const padL = 8, padR = 8, padT = 14, padB = 26;
  const w = W - padL - padR, h = H - padT - padB;
  const max = Math.max(...series, 1);
  const min = Math.min(...series, 0);
  const span = (max - min) || 1;
  const px = (i) => (n === 1 ? w / 2 : padL + (i / (n - 1)) * w);
  const py = (v) => padT + h - ((v - min) / span) * h;

  // 网格线（每档 1 小时）
  let grid = '';
  for (let g = Math.floor(min / 60); g * 60 <= max + 30; g++) {
    const y = py(g * 60);
    if (y < padT || y > padT + h) continue;
    grid += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#F3E7E0" stroke-width="1"/>`;
  }

  // 趋势线（OLS）
  let reg = '';
  if (n >= 2) {
    const mx = (n - 1) / 2;
    const my = series.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    series.forEach((v, i) => { num += (i - mx) * (v - my); den += (i - mx) * (i - mx); });
    const slope = den ? num / den : 0;
    const b0 = my - slope * mx;
    const y0 = py(b0), y1 = py(b0 + slope * (n - 1));
    const down = slope >= 0; // 变长（需要关照）用暖色
    reg = `<line x1="${padL}" y1="${Math.min(y0, y1)}" x2="${padL + w}" y2="${Math.max(y0, y1)}" stroke="${down ? '#DD8A78' : '#8FB98A'}" stroke-width="2.4" stroke-dasharray="6 5" opacity=".8"/>`;
    if (slope < 0) reg = `<line x1="${padL}" y1="${Math.max(y0, y1)}" x2="${padL + w}" y2="${Math.min(y0, y1)}" stroke="#8FB98A" stroke-width="2.4" stroke-dasharray="6 5" opacity=".8"/>`;
  }

  const pts = series.map((v, i) => `${px(i)},${py(v)}`).join(' ');
  const area = `M ${pts.replace(/ /g, ' L ')} L ${px(n - 1)},${padT + h} L ${px(0)},${padT + h} Z`;
  const dots = series.map((v, i) =>
    `<circle cx="${px(i)}" cy="${py(v)}" r="4.5" fill="#fff" stroke="#EE9E88" stroke-width="2.5"><title>第 ${i + 1} 次 · ${durText(Math.round(v))}</title></circle>`
  ).join('');
  const xLabels = series.map((v, i) => `<text x="${px(i)}" y="${H - 8}" text-anchor="middle" font-size="9.5" fill="#B4A49C">${i + 1}</text>`).join('');
  const zeroTip = series.every((v) => v === 0);

  return `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="持续时长趋势">
      ${grid}
      <path d="${area}" fill="url(#areaGrad)" opacity="0">
        <animate attributeName="opacity" from="0" to=".22" dur="1s" fill="freeze"/>
      </path>
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#F2B293"/>
          <stop offset="1" stop-color="#F2B293" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${reg}
      <polyline points="${pts}" fill="none" stroke="#EE9E88" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" opacity="0">
        <animate attributeName="opacity" from="0" to="1" dur="1s" fill="freeze"/>
      </polyline>
      ${dots}
      ${xLabels}
    </svg>
    <p style="font-size:11.5px;color:var(--ink-faint);margin:6px 2px 0">横轴 = 记录顺序（第 1 次…第 ${n} 次），纵轴 = 持续时长 · 虚线 = 整体走向</p>`;
}

/* ============================================================
   疗愈室
   ============================================================ */
function updateHealState() {
  const hasKey = !!(settings.apiKey || '').trim();
  $('#heal-ai-state').textContent = hasKey
    ? `🤖 AI 已就绪（${settings.model}），点上面的按钮开始分析。`
    : `💡 还没接 AI。可以先点「小岛的观察」；或到右上角设置里填入你的 API 配置，就能获得深度 AI 分析。`;
}

function randomPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/* --- 本地引擎 --- */
function localReport() {
  const data = windowRecords(records, 'all');
  const out = [];
  out.push(`<h3>🕊️ 小岛的观察</h3><p class="l-sub">基于你这段时间共 ${records.length} 段心情记录，不用当真，只当一面温柔的镜子。</p>`);
  if (!data.length) {
    out.push(`<p>记录还不多。等你想写的时候，去「记一笔」留下第一段心情，我就有话可以跟你说了。</p>`);
    return out.join('');
  }
  const n = data.length;
  const avgDur = data.reduce((s, r) => s + r.durationMin, 0) / n;
  const slotCount = SLOTS.map((s) => ({ key: s.key, n: data.filter((r) => slotOf(Number((r.time || '12:00').split(':')[0])) === s.key).length }));
  const topSlot = slotCount.reduce((a, b) => (b.n > a.n ? b : a), slotCount[0]);
  const trigMap = {};
  data.forEach((r) => (r.triggers || []).forEach((t) => (trigMap[t] = (trigMap[t] || 0) + 1)));
  const topTrig = Object.entries(trigMap).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const healMap = {};
  data.forEach((r) => (r.healers || []).forEach((h) => (healMap[h] = (healMap[h] || 0) + 1)));
  const healPick = Object.entries(healMap).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const trend = calcTrend(sortRecords(data).map((r) => r.durationMin));
  const tsub = trend ? trendVerbal(trend).title : '记录还不多';

  out.push(`<div class="l-block"><h4>🌊 这阵子你辛苦了</h4><p>一共记录了 ${n} 段难过的时刻，平均每次持续 ${durText(Math.round(avgDur))}。${tsub}。</p></div>`);
  if (topSlot.n > 0) {
    out.push(`<div class="l-block"><h4>🕰️ 一个关于时间的发现</h4><p>你的低谷最容易出现在<b>「${topSlot.key}」</b>（出现 ${topSlot.n} 次）。如果那是一个固定场景（比如睡前、下班后），也许可以提前安排一件让自己放松的小事放在那附近。</p></div>`);
  }
  if (topTrig.length) {
    out.push(`<div class="l-block"><h4>🌧️ 常来找你的乌云是</h4><ul>${topTrig.map(([k, v]) => `<li>${esc(k)}（${v} 次）</li>`).join('')}</ul><p>看到名字，往往就减轻了一半的重量。</p></div>`);
  }
  if (healPick.length) {
    out.push(`<div class="l-block"><h4>🌤️ 你试过且管用的办法</h4><ul>${healPick.map(([k, v]) => `<li>${esc(k)}（用过 ${v} 次）</li>`).join('')}</ul><p>下次乌云来的时候，先试试这些，你已经验证过它们有用。</p></div>`);
  }
  const wd = data.filter((r) => r.workday !== false);
  const rd = data.filter((r) => r.workday === false);
  if (wd.length && rd.length) {
    const wavg = wd.reduce((s, r) => s + r.durationMin, 0) / wd.length;
    const ravg = rd.reduce((s, r) => s + r.durationMin, 0) / rd.length;
    out.push(`<div class="l-block"><h4>🏞️ 工作日 vs 休息日</h4><p>${wavg > ravg ? '看起来<b>工作日</b>的低谷更久一些，也许压力更多来自那里。周末记得真的留给自己。' : '休息日的低谷反而更长，也许空闲时更容易多想，试着给自己安排一点小小的期待。'}</p></div>`);
  }
  const recent = sortRecords(data).filter((r) => (r.insight || '').trim()).pop();
  if (recent) {
    out.push(`<div class="l-block"><h4>🕯️ 最后，重温你最近写的一句话</h4><p style="font-style:italic">“${esc(recent.insight)}”</p><p class="l-note">—— ${fmtDateCN(recent.date)} 的你</p></div>`);
  }
  out.push(`<div class="l-block"><p class="l-note">💌 如果想看得更深，可以在设置里接上 AI，让它陪你一起梳理。</p></div>`);
  return out.join('');
}

function showHealResult(inner, title) {
  const box = $('#heal-result');
  box.classList.remove('hidden', 'loading');
  box.innerHTML = inner;
  window.scrollTo({ top: box.offsetTop - 80, behavior: 'smooth' });
}
function healLoading(txt = '小岛正在慢慢读你的心事…') {
  const box = $('#heal-result');
  box.classList.remove('hidden');
  box.classList.add('loading');
  box.innerHTML = `<div class="spinner"></div><p>${txt}</p>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* --- AI 引擎 --- */
function buildPrompt() {
  const sorted = sortRecords(records);
  const rows = sorted.slice(-40).map((r) => {
    const m = moodOf(r.mood);
    const wd = r.workday !== false ? '工作日' : '休息日';
    return [
      `${r.date} ${r.time}`, wd, r.weather || '未知天气',
      `持续${durText(r.durationMin)}`, r.mood ? `难过程度:${m.txt}` : '',
      r.triggers && r.triggers.length ? `原因:${r.triggers.join('、')}` : '',
      r.healers && r.healers.length ? `好转:${r.healers.join('、')}` : '',
      r.insight ? `感悟:${r.insight}` : '',
    ].filter(Boolean).join(' | ');
  }).join('\n');
  const sys = [
    '你叫「小屿」，是一个温柔、真诚、有心理学常识但不诊断、不评判的情绪陪伴分析助手。',
    '用户会给你一段情绪记录（含时间、持续时长、天气、原因、好转方式、感悟）。',
    '请从下面几个角度给出温和的分析：1) 低谷容易出现的时段与情境；2) 持续时长在变长还是变短；3) 与哪些原因/天气/作息相关；4) 哪些自我安慰方式对他最有效；5) 用 2-3 句暖心的话收尾。',
    '要求：语气像朋友，不使用冷冰冰的术语堆砌；给出可操作的小建议而非空泛安慰；不贴标签、不做诊断；总长度 400 字以内；可以适度使用 emoji，不要用 ### 大标题。',
  ].join('');
  const user = `以下是我最近的${records.length}段情绪记录（最近40条以内）：\n\n${rows || '（暂无记录）'}\n\n请以「小屿」的口吻，给我一段温柔而具体的分析。`;
  return { sys, user };
}

async function callAI() {
  if (!records.length) { toast('🌱 先记几笔，小屿才有话可说呀'); return; }
  if (!(settings.apiKey || '').trim()) {
    toast('🔑 请先在右上角设置里填入 AI 的 API Key');
    $('#settings-modal').classList.remove('hidden');
    return;
  }
  const { sys, user } = buildPrompt();
  healLoading('小屿正在认真读你的每一段心情…');
  try {
    const base = (settings.baseUrl || '').replace(/\/+$/, '');
    const res = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.apiKey.trim() },
      body: JSON.stringify({
        model: settings.model || 'deepseek-chat',
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        temperature: 0.7,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`接口返回 ${res.status}${res.status === 401 ? '（密钥可能不对）' : res.status === 404 ? '（模型名可能不对）' : ''} ${t.slice(0, 120)}`);
    }
    const j = await res.json();
    const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!text) throw new Error('没有收到回复内容');
    showHealResult(`<h3>🤖 小屿想对你说</h3><p class="l-sub">${new Date().toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · 由 ${esc(settings.model)} 生成，仅供温柔参考</p><div class="ai-body">${mdToHtml(text)}</div><p class="l-note" style="margin-top:14px">💌 如果哪里说得不准，请以你自己的感受为准——你是最了解自己的人。</p>`);
  } catch (err) {
    console.error(err);
    const corsHint = /Failed to fetch|NetworkError|CORS|load failed/i.test(String(err.message))
      ? '可能是浏览器跨域限制或网络问题：<br>① 换用允许浏览器跨域的接口；② 或确认网络可访问该地址；③ 密钥/模型名是否正确。'
      : esc(err.message);
    showHealResult(`<h3>🤍 哎呀，暂时连不上</h3><div class="ai-body"><p>${corsHint}</p></div><p class="l-note" style="margin-top:12px">不过没关系，本地的「小岛观察」不需要网络，随时都能陪你。</p>`);
  }
}

/* ============================================================
   设置
   ============================================================ */
function openSettings() {
  $('#set-baseurl').value = settings.baseUrl || '';
  $('#set-key').value = settings.apiKey || '';
  $('#set-model').value = settings.model || '';
  $('#settings-modal').classList.remove('hidden');
}
function saveSettingsModal() {
  settings.baseUrl = ($('#set-baseurl').value || '').trim() || 'https://api.deepseek.com/v1';
  settings.apiKey = ($('#set-key').value || '').trim();
  settings.model = ($('#set-model').value || '').trim() || 'deepseek-chat';
  saveSettings();
  $('#settings-modal').classList.add('hidden');
  updateHealState();
  toast('✅ 设置已保存在本机');
}

function exportData() {
  const blob = new Blob([JSON.stringify({ records, meals, settings, app: 'mood-island', at: new Date().toISOString() }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `情绪小岛备份_${todayStr()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('📦 备份已开始下载（含情绪与三餐记录）');
}
function importData(file) {
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const j = JSON.parse(rd.result);
      const arr = Array.isArray(j) ? j : j.records;
      if (!Array.isArray(arr)) throw new Error('bad');
      const hasMeals = !!(j && j.meals && Object.keys(j.meals).length);
      openConfirm({
        emoji: '📥',
        text: `将导入 ${arr.length} 条情绪记录${hasMeals ? `、${Object.keys(j.meals).length} 天的三餐记录` : ''}。\n（与当前数据合并，重复的会跳过）`,
        onYes: () => {
          const exist = new Set(records.map((r) => r.id));
          let added = 0;
          arr.forEach((r) => {
            if (r && r.date && !exist.has(r.id)) { records.push(r); exist.add(r.id); added++; }
          });
          saveRecords();
          if (hasMeals) {
            meals = Object.assign(meals, j.meals);
            saveMeals();
          }
          closeConfirm();
          toast(added ? `🌷 成功导入 ${added} 条新记录` : '没有新增记录（可能都已存在）');
          renderTimeline();
        },
      });
    } catch (e) {
      toast('⚠️ 这个文件不太像备份文件哦');
    }
  };
  rd.readAsText(file);
}

/* ============================================================
   初始化 & 事件绑定
   ============================================================ */
function initGreeting() {
  const h = new Date().getHours();
  const g = h < 5 ? '夜深了，还没睡吗？' : h < 11 ? '早上好，新的一天慢慢来。' : h < 14 ? '中午好，记得吃口热饭。' : h < 18 ? '下午好，累了就歇一会儿。' : '晚上好，今天也辛苦了。';
  $('#greeting').textContent = g + ' 这里可以安放你的每一种情绪。';
  $('#gentle-text').textContent = randomPick(GENTLE);
  $('#corner-text').textContent = randomPick(CORNER);
}

function initEvents() {
  /* 导航 */
  $$('.tab').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));

  /* 表单 */
  const form = $('#record-form');
  form.addEventListener('submit', submitRecord);

  $('#btn-cancel-edit').addEventListener('click', resetForm);

  $('#rec-date').addEventListener('change', () => {
    if (!formManualWorkday) setWorkdaySegAuto();
  });
  $('#rec-dur').addEventListener('input', (e) => updateDurText(Number(e.target.value)));
  $$('#workday-seg .seg-btn').forEach((b) => b.addEventListener('click', () => {
    formManualWorkday = true;
    $('#workday-auto-hint').textContent = '（已手动选择）';
    $$('#workday-seg .seg-btn').forEach((x) => x.classList.toggle('is-active', x === b));
  }));
  /* chips / mood / weather 用事件委托 */
  $('#weather-chips').addEventListener('click', (e) => {
    const c = e.target.closest('.chip'); if (!c) return;
    $('#weather-chips .chip').forEach((x) => x.classList.remove('is-on'));
    c.classList.add('is-on');
  });
  $('#trigger-chips').addEventListener('click', (e) => {
    const x = e.target.closest('.chip-x');
    if (x) { removeTriggerCustom(x.dataset.x); return; }
    const add = e.target.closest('#trigger-custom-btn');
    if (add) { openTriggerCustom(); return; }
    const c = e.target.closest('.chip');
    if (c) c.classList.toggle('is-on');
  });
  $('#custom-trigger-ok').addEventListener('click', confirmTriggerCustom);
  $('#custom-trigger-cancel').addEventListener('click', closeTriggerCustom);
  $('#custom-trigger-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmTriggerCustom(); } });
  $('#heal-chips').addEventListener('click', (e) => {
    const c = e.target.closest('.chip'); if (c) c.classList.toggle('is-on');
  });
  $('#mood-picker').addEventListener('click', (e) => {
    const m = e.target.closest('.mood'); if (!m) return;
    $('#mood-picker .mood').forEach((x) => x.classList.remove('is-on'));
    m.classList.add('is-on');
  });

  /* 图谱范围 */
  $$('#range-seg .seg-btn').forEach((b) => b.addEventListener('click', () => {
    rangeSel = b.dataset.r;
    renderInsight();
  }));

  /* 时光集：月 / 周 / 列表 */
  $$('#tl-mode-seg .seg-btn').forEach((b) => b.addEventListener('click', () => {
    tlMode = b.dataset.tl;
    if (tlMode === 'month' && focusDate.slice(0, 7) !== todayStr().slice(0, 7)) focusDate = todayStr();
    renderTimeline();
  }));
  $('#cal-prev').addEventListener('click', () => {
    focusDate = tlMode === 'month' ? addMonths(focusDate, -1) : addDays(weekStart(focusDate), -7);
    renderTimeline();
  });
  $('#cal-next').addEventListener('click', () => {
    focusDate = tlMode === 'month' ? addMonths(focusDate, 1) : addDays(weekStart(focusDate), 7);
    renderTimeline();
  });
  $('#cal-today').addEventListener('click', () => { focusDate = todayStr(); renderTimeline(); });

  /* 某日明细弹窗 */
  $('#day-modal').querySelectorAll('[data-close-day]').forEach((b) => b.addEventListener('click', closeDayModal));
  $('#day-add').addEventListener('click', () => addRecordOn(window._dayModalDate || todayStr()));

  /* 疗愈室 */
  $('#btn-heal-local').addEventListener('click', () => {
    if (!records.length) { toast('🌱 先记几笔，小岛才有话可说呀'); switchView('record'); return; }
    healLoading();
    setTimeout(() => showHealResult(localReport()), 650);
  });
  $('#btn-heal-ai').addEventListener('click', callAI);

  /* 设置 */
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-settings-save').addEventListener('click', saveSettingsModal);
  $('#settings-modal').querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => $('#settings-modal').classList.add('hidden')));
  $('#btn-export').addEventListener('click', exportData);
  $('#btn-import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', (e) => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });
  $('#btn-clear').addEventListener('click', () => {
    openConfirm({
      emoji: '🌫️',
      text: `真的要清空吗？\n包括 ${records.length} 条心情记录和全部三餐记录。\n建议先「导出备份」再操作。`,
      onYes: () => { records = []; meals = {}; saveRecords(); saveMeals(); closeConfirm(); toast('已清空。新的故事，随时可以从零开始。'); renderTimeline(); },
    });
  });

  /* 确认弹窗 */
  $('#confirm-no').addEventListener('click', closeConfirm);
  $('#confirm-yes').addEventListener('click', () => {
    const fn = window._confirmYes;
    closeConfirm();
    if (fn) fn();
  });
  $$('.modal-mask').forEach((m) => m.addEventListener('click', (e) => {
    if (e.target === m) m.classList.add('hidden');
  }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $$('.modal-mask').forEach((m) => m.classList.add('hidden')); });
}

/* ---- 启动 ---- */
loadAll();
initGreeting();
initEvents();
resetForm();
updateHealState();
