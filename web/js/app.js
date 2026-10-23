/**
 * 古律象音 · APP 主控（iPhone 玻璃拟态版）
 * ---------------------------------------------------------------
 * 职责：三栏导航、界面渲染、交互编排、播放控制、卦历存储、乐器试听
 * 依赖：core/data.js、core/hexagram.js、core/music.js、core/player.js
 *      core/recognize.js、js/learn.js
 *
 * 栏位：
 *   起卦 —— 每日一卦 / 观象起卦（手动选物象）/ 数字起卦 + 卦象解读 + 卦历
 *   音乐 —— 当前卦心音直达 + 播放器 + 乐器园（八音介绍与试听）
 *   学易 —— 易经知识（由 learn.js 渲染）
 *
 * 与小程序版共用 core/ 全部逻辑，此处只做 DOM 适配。
 */

'use strict';

(function () {

  const D = window.ICData;
  const H = window.ICHexagram;
  const M = window.ICMusic;
  const P = window.ICPlayer;
  const R = window.ICRecognize;
  const G = window.ICRender;

  const STORAGE_KEY = 'gulv-xiangyin-history';
  const PREF_KEY = 'gulv-xiangyin-pref';

  let currentResult = null;
  let currentScore = null;
  let isPlaying = false;
  let userPaused = false;      // 用户主动暂停（回到前台时不自动继续）
  let lastVolume = 85;          // 静音前的音量（点图标恢复用）
  let selectedImage = null;
  /* 播放目标：'hex' 卦象之音（即兴连播） | { type:'inst', voice } 乐器试听 */
  let playTarget = null;
  let auditionVoice = null;
  /* 音层（可选叠加，非古律、非疗效）：
     sol —— 疗愈频率（索菲吉奥九频选一，可关）；
     nature —— 自然音层（雨声/鸟鸣/篝火/风声/溪流，可多选）；
     level —— 音层总音量（乘在各层上）。 */
  const ambient = {
    sol: { on: true, freq: 528 },
    nature: { rain: false, birds: false, fire: false, wind: false, stream: false },
    level: 1
  };
  /* 波形显示模式：hex3d 卦象流动（默认）| silk 丝弦波形 | ripple 卦象涟漪 */
  let vizMode = 'hex3d';
  /* 铜钱卦：已掷的六爻（自下而上），每项 { yang, moving, backs, name } */

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  /** 当前音层配置 → renderScore / player 的 ambient 参数 */
  function buildAmbient() {
    return {
      solfeggio: ambient.sol.on ? { freq: ambient.sol.freq, level: 0.05 } : null,
      nature: {
        rain: !!ambient.nature.rain, birds: !!ambient.nature.birds,
        fire: !!ambient.nature.fire, wind: !!ambient.nature.wind,
        stream: !!ambient.nature.stream
      },
      level: ambient.level
    };
  }

  /** 即兴段落的中文题名（起承转合） */
  const SECTION_NAMES = {
    intro: ['起', '卦音一击，确立调式'],
    theme: ['承', '主题陈述 · 六爻为骨'],
    variation: ['转', '移度变奏 · 加花'],
    coda: ['合', '收束 · 尾音渐隐']
  };

  /* ===============================================================
   * 三栏导航
   * =============================================================== */

  const PAGE_NAMES = { cast: 'pageCast', music: 'pageMusic', learn: 'pageLearn' };

  function switchPage(name) {
    const id = PAGE_NAMES[name];
    if (!id || !$('#' + id)) return;
    $$('.page').forEach((p) => p.classList.remove('is-active'));
    $('#' + id).classList.add('is-active');
    $$('.tabbtn').forEach((b) => {
      const on = b.dataset.page === name;
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
    // 音乐栏的卦体需要常驻绘制（静止时也要看得到立体模型）
    if (name === 'music') startViz();
  }

  function bindTabbar() {
    $$('.tabbtn').forEach((btn) => {
      btn.addEventListener('click', () => switchPage(btn.dataset.page));
    });
  }

  /* ===============================================================
   * 播放引擎
   * =============================================================== */

  const player = new P.Player({
    // 供调试与端到端测试读取播放器内部状态（音层总线、音频图）
    onEnd: () => {
      // 即兴连播没有「结束」；会走到这里的是乐器试听
      isPlaying = false;
      playTarget = null;
      auditionVoice = null;
      setPlayIcon(false);
      markInstButtons();
      // 试听自然结束：流线走完渐隐，模型缓缓停下
      setFlowState('drain');
      $('#playerLive').hidden = true;
      if ($('#playerTip').textContent.indexOf('试听') >= 0) {
        $('#playerTip').textContent = '试听结束。';
      }
    },
    onError: (msg) => {
      $('#playerTip').textContent = msg;
      isPlaying = false;
      playTarget = null;
      auditionVoice = null;
      setPlayIcon(false);
      markInstButtons();
      setFlowState('drain');
      $('#playerLive').hidden = true;
    },
    onStateChange: (state) => {
      if (state === 'rendering') {
        $('#playerTip').textContent = auditionVoice
          ? '正在合成试听音色…'
          : (player.generative ? '正在编曲：第一段即兴…' : '正在生成音频…');
      } else if (state === 'composing') {
        // 即兴连播：正在编下一段（当前段仍在响，无需打扰用户）
        $('#genRound').textContent = '正在编下一段…';
      }
    }
  });

  // 调试与端到端测试入口：读取播放器内部状态（音层总线、音频图、流线）
  window.__gxPlayer = player;

  /* ===============================================================
   * 初始化
   * =============================================================== */

  function init() {
    renderDate();
    startClock();
    renderImagePicker();
    bindTabs();
    bindTabbar();
    bindButtons();
    bindImageSearch();
    renderInstruments();
    renderHistory();
    updateDailyNote();
    renderAmbientChips();
    bindAmbient();
    bindSkin();
    bindVisibility();
    bindVizModes();
    bindLiquidPress();
    restorePref();
    bindMiniPlayerLayout();
    castDaily();
  }

  function renderDate() {
    const now = new Date();
    const cn = ['日', '一', '二', '三', '四', '五', '六'];
    $('#dateCn').textContent = `${now.getMonth() + 1}月${now.getDate()}日 周${cn[now.getDay()]}`;
    $('#dateNum').textContent = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
    renderClock();
  }

  /** 时钟：精确到秒，每秒刷新 */
  function renderClock() {
    const now = new Date();
    const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const el = $('#dateClock');
    if (el) el.textContent = t;
  }

  function startClock() {
    renderClock();
    setInterval(() => {
      renderClock();
      // 跨零点时日期也要翻页
      const now = new Date();
      const cn = ['日', '一', '二', '三', '四', '五', '六'];
      const want = `${now.getMonth() + 1}月${now.getDate()}日 周${cn[now.getDay()]}`;
      if ($('#dateCn').textContent !== want) renderDate();
    }, 1000);
  }

  function updateDailyNote() {
    const d = new Date();
    const yearZhi = H.getYearZhiIndex(d);
    const detail = H.timeHexagram(d).detail;
    $('#dailyNote').textContent =
      `年支${H.ZHI_ORDER[yearZhi - 1]} · ${detail.month}月${detail.day}日 · ${detail.shi}时` +
      `　→　上卦数 ${detail.upperNum}，下卦数 ${detail.lowerNum}，动爻 ${detail.movingLine}`;
  }

  /* ===============================================================
   * 外观皮肤（可切换）
   * ---------------------------------------------------------------
   * 纸本 = 宣纸柔雾（默认）；流光 = 更通透的液态玻璃；夜航 = 深色夜光玻璃。
   * 皮肤只改 CSS 变量，故即时生效、无需重绘任何内容。
   * =============================================================== */

  const SKINS = [
    { key: 'paper', name: '纸本' },
    { key: 'shine', name: '流光' },
    { key: 'night', name: '夜航' }
  ];
  const FONTS = [
    { key: 's', name: '小' },
    { key: 'm', name: '标准' },
    { key: 'l', name: '大' }
  ];
  let skin = 'paper';
  let fontSize = 'm';

  /** 应用皮肤：改 <html data-skin> 即可整体换色 */
  function applySkin(key) {
    const root = document.documentElement;
    if (!key || key === 'paper') root.removeAttribute('data-skin');
    else root.setAttribute('data-skin', key);
  }

  /** 应用字号 */
  function applyFont(key) {
    const root = document.documentElement;
    if (!key || key === 'm') root.removeAttribute('data-font');
    else root.setAttribute('data-font', key);
  }

  /** 设置项：标出当前的皮肤与字号 */
  function renderSkinOptions() {
    $$('#skinList .skin-opt').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.key === skin);
    });
    $$('#fontRow .seg').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.font === fontSize);
    });
  }

  /* ---------- 设置面板 ---------- */

  function openSettings() {
    const sheet = $('#settingsSheet');
    const mask = $('#sheetMask');
    if (!sheet) return;
    syncSettingsUI();
    sheet.hidden = false;
    mask.hidden = false;
  }

  function closeSettings() {
    const sheet = $('#settingsSheet');
    const mask = $('#sheetMask');
    if (sheet) sheet.hidden = true;
    if (mask) mask.hidden = true;
  }

  /** 把当前状态回填到设置面板（打开时与偏好恢复后都会调用） */
  function syncSettingsUI() {
    renderSkinOptions();
    const vol = $('#setVolume');
    if (vol && document.activeElement !== vol) {
      vol.value = $('#volume').value;
      $('#setVolumeNum').textContent = vol.value;
    }
    const lv = $('#setAmbLevel');
    if (lv && document.activeElement !== lv) {
      lv.value = String(Math.round(ambient.level * 100));
      $('#setAmbLevelNum').textContent = lv.value;
    }
    $$('#setVizRow .seg').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.viz === vizMode);
    });
    $$('#qualityRow .seg').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.q === vizQuality);
    });
    const n = $('#setHistoryNum');
    if (n) n.textContent = `${loadHistory().length} 条`;
  }

  function bindSkin() {
    // 皮肤
    const list = $('#skinList');
    if (list) {
      list.addEventListener('click', (e) => {
        const btn = e.target.closest('.skin-opt');
        if (!btn) return;
        skin = btn.dataset.key;
        applySkin(skin);
        renderSkinOptions();
        savePref();
      });
    }
    // 字号
    const frow = $('#fontRow');
    if (frow) {
      frow.addEventListener('click', (e) => {
        const btn = e.target.closest('.seg');
        if (!btn) return;
        fontSize = btn.dataset.font;
        applyFont(fontSize);
        renderSkinOptions();
        savePref();
      });
    }
    // 画质档
    const qrow = $('#qualityRow');
    if (qrow) {
      qrow.addEventListener('click', (e) => {
        const btn = e.target.closest('.seg');
        if (!btn) return;
        vizQuality = btn.dataset.q;
        flowLines = [];               // 清场，按新档位重开
        syncSettingsUI();
        savePref();
      });
    }
    // 波形台模式
    const vrow = $('#setVizRow');
    if (vrow) {
      vrow.addEventListener('click', (e) => {
        const btn = e.target.closest('.seg');
        if (!btn) return;
        vizMode = btn.dataset.viz;
        syncVizModes();
        syncSettingsUI();
        savePref();
      });
    }
    // 音量（与播放器上的滑杆同一状态）
    const vol = $('#setVolume');
    if (vol) {
      vol.addEventListener('input', () => {
        $('#volume').value = vol.value;
        $('#setVolumeNum').textContent = vol.value;
        player.setVolume(vol.value / 100);
        lastVolume = Number(vol.value);
        syncVolIcon(Number(vol.value));
      });
      vol.addEventListener('change', savePref);
    }
    // 音层总量
    const lv = $('#setAmbLevel');
    if (lv) {
      lv.addEventListener('input', () => {
        ambient.level = Math.max(0, Math.min(1, parseInt(lv.value, 10) / 100));
        $('#setAmbLevelNum').textContent = lv.value;
        $('#ambLevel').value = lv.value;
        $('#ambLevelNum').textContent = lv.value;
        player.setAmbient(buildAmbient());
      });
      lv.addEventListener('change', savePref);
    }
    // 作者邮箱：一键复制（并给个简短反馈）
    const copyBtn = $('#btnCopyEmail');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const mail = ($('#authorEmail') || {}).textContent || '';
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(mail);
          } else {
            // 老 WebView 没有 clipboard API：用临时输入框兜底
            const ta = document.createElement('textarea');
            ta.value = mail;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
          }
          flashTip('邮箱已复制：' + mail);
        } catch (e) {
          flashTip('复制失败，请手动选中：' + mail);
        }
      });
    }
    // 卦历清空
    const clr = $('#btnClearHistory2');
    if (clr) clr.addEventListener('click', () => {
      clearHistory();
      syncSettingsUI();
    });
    // 面板开合
    const open = $('#btnSettings');
    if (open) open.addEventListener('click', openSettings);
    const close = $('#btnSettingsClose');
    if (close) close.addEventListener('click', closeSettings);
    const mask = $('#sheetMask');
    if (mask) mask.addEventListener('click', closeSettings);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSettings();
    });
    renderSkinOptions();
  }

  /**
   * 切后台再回前台
   * ---------------------------------------------------------------
   * 安卓 / iOS 切后台时系统会挂起 AudioContext，回前台若不恢复，
   * 音乐会一直停着。这里在**非用户主动暂停**的前提下自动恢复 ——
   * 因是同一条时间轴，恢复后从原处接上，仍是无缝的。
   */
  function bindVisibility() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (!isPlaying || userPaused) return;
      // 系统挂起了音频上下文（切后台）→ 恢复；用户主动暂停则不动
      if (player.contextSuspended) {
        player.resume();
        setPlayState('playing');
        setFlowState('playing');
      }
    });
  }

  /* ===============================================================
   * 偏好设置（音量 / 音层 / 波形模式 / 外观）
   * =============================================================== */

  function restorePref() {
    try {
      const pref = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      if (typeof pref.volume === 'number') {
        $('#volume').value = pref.volume;
        player.setVolume(pref.volume / 100);
        lastVolume = pref.volume;
      }
      syncVolIcon(Number($('#volume').value));
      if (pref.solfeggio && typeof pref.solfeggio === 'object') {
        ambient.sol.on = !!pref.solfeggio.on;
        if (typeof pref.solfeggio.freq === 'number') ambient.sol.freq = pref.solfeggio.freq;
      } else if (typeof pref.solfeggio === 'boolean') {
        ambient.sol.on = pref.solfeggio;   // 旧版偏好兼容
      }
      if (pref.nature && typeof pref.nature === 'object') {
        Object.keys(ambient.nature).forEach((k) => {
          ambient.nature[k] = !!pref.nature[k];
        });
      }
      if (typeof pref.ambLevel === 'number') {
        ambient.level = Math.max(0, Math.min(1, pref.ambLevel));
      }
      if (pref.vizMode && ['hex3d', 'silk', 'ripple'].indexOf(pref.vizMode) >= 0) {
        vizMode = pref.vizMode;
      }
      if (pref.skin && SKINS.some((k) => k.key === pref.skin)) {
        skin = pref.skin;
      }
      if (pref.font && FONTS.some((k) => k.key === pref.font)) {
        fontSize = pref.font;
      }
      if (pref.quality && VIZ_QUALITY[pref.quality]) {
        vizQuality = pref.quality;
      }
      if (typeof pref.loop === 'boolean') {
        player.setLoop(pref.loop);
        const btn = $('#btnLoop');
        if (btn) btn.setAttribute('aria-pressed', pref.loop ? 'true' : 'false');
        const txt = $('#btnLoopText');
        if (txt) txt.textContent = pref.loop ? '循环中' : '循环';
      }
      applySkin(skin);
      applyFont(fontSize);
      setSolfIcon(ambient.sol.on);
      syncAmbientUI();
      syncVizModes();
    } catch (e) { /* 无偏好 */ }
  }

  function savePref() {
    try {
      const v = parseInt($('#volume').value, 10);
      localStorage.setItem(PREF_KEY, JSON.stringify({
        volume: v,
        solfeggio: { on: ambient.sol.on, freq: ambient.sol.freq },
        nature: ambient.nature,
        ambLevel: ambient.level,
        vizMode,
        skin,
        font: fontSize,
        quality: vizQuality,
        loop: player.loop
      }));
    } catch (e) { /* 忽略 */ }
  }

  /* ===============================================================
   * 物象选择器
   * =============================================================== */

  function renderImagePicker() {
    const wrap = $('#imagePicker');
    wrap.innerHTML = '';

    D.IMAGE_LIBRARY.forEach((group) => {
      const g = document.createElement('div');
      g.className = 'img-group';

      const title = document.createElement('div');
      title.className = 'img-group-title';
      title.textContent = group.category;
      g.appendChild(title);

      const grid = document.createElement('div');
      grid.className = 'img-grid';

      group.items.forEach((item) => {
        const chip = document.createElement('button');
        chip.className = 'img-chip';
        chip.type = 'button';
        chip.dataset.gua = item.gua;
        chip.dataset.name = item.name;

        const nm = document.createElement('span');
        nm.textContent = item.name;
        chip.appendChild(nm);

        const gu = document.createElement('span');
        gu.className = 'chip-gua';
        gu.textContent = D.TRIGRAMS[item.gua].name;
        chip.appendChild(gu);

        chip.addEventListener('click', () => selectImage(item, chip));
        grid.appendChild(chip);
      });

      g.appendChild(grid);
      wrap.appendChild(g);
    });
  }

  function selectImage(item, chip) {
    selectedImage = item;
    $$('.img-chip').forEach((c) => c.classList.remove('is-selected'));
    if (chip) chip.classList.add('is-selected');
    $('#selImageName').textContent = item.name;
    const t = D.TRIGRAMS[item.gua];
    $('#selImageGua').textContent = `属${t.name}卦 · ${t.attribute}`;
    $('#btnImage').disabled = false;
    $$('.vcand').forEach((c) => c.classList.remove('is-on'));
  }

  /* ===============================================================
   * 物象搜索（口语 → 标准物象）
   * =============================================================== */

  function bindImageSearch() {
    const input = $('#imageSearch');
    if (!input) return;
    input.addEventListener('input', () => {
      const kw = input.value.trim();
      // 无关键词时恢复完整列表
      if (!kw) {
        renderImagePicker();
        return;
      }
      const hits = R.searchImages(kw, 30);
      const wrap = $('#imagePicker');
      wrap.innerHTML = '';
      if (!hits.length) {
        const empty = document.createElement('p');
        empty.className = 'search-empty';
        empty.textContent = `没有找到「${kw}」。换个词试试，或在下方直接选物象。`;
        wrap.appendChild(empty);
        return;
      }
      const g = document.createElement('div');
      g.className = 'img-group';
      const title = document.createElement('div');
      title.className = 'img-group-title';
      title.textContent = `搜索「${kw}」的结果 · ${hits.length} 条`;
      g.appendChild(title);
      const grid = document.createElement('div');
      grid.className = 'img-grid';
      hits.forEach((h) => {
        const chip = document.createElement('button');
        chip.className = 'img-chip';
        chip.type = 'button';
        const nm = document.createElement('span');
        nm.textContent = h.image;
        const gu = document.createElement('span');
        gu.className = 'chip-gua';
        gu.textContent = D.TRIGRAMS[h.gua].name;
        chip.appendChild(nm);
        chip.appendChild(gu);
        chip.addEventListener('click', () => {
          // 命中项可能是别名（如"凳子"→"椅子"），取其标准物象
          selectImage({ name: h.image, gua: h.gua }, chip);
        });
        grid.appendChild(chip);
      });
      g.appendChild(grid);
      wrap.appendChild(g);
    });
  }


  /** HTML 转义（拼 innerHTML 时防注入） */
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ===============================================================
   * 标签页（起卦方式）
   * =============================================================== */

  function bindTabs() {
    $$('#castTabs .tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        $$('#castTabs .tab').forEach((t) => t.classList.remove('is-active'));
        $$('.tab-panel').forEach((p) => p.classList.remove('is-active'));
        tab.classList.add('is-active');
        const panel = document.querySelector(`.tab-panel[data-panel="${tab.dataset.mode}"]`);
        if (panel) panel.classList.add('is-active');
      });
    });
  }

  /* ===============================================================
   * 事件绑定
   * =============================================================== */

  function bindButtons() {
    $('#btnDaily').addEventListener('click', castDaily);
    $('#btnImage').addEventListener('click', castImage);
    $('#btnNumber').addEventListener('click', castNumber);

    $('#btnPlay').addEventListener('click', togglePlay);
    $('#btnLoop').addEventListener('click', toggleLoop);
    bindMiniPlayer();
    $('#btnExport').addEventListener('click', exportWav);
    $('#btnClearHistory').addEventListener('click', clearHistory);

    $('#volume').addEventListener('input', (e) => {
      player.setVolume(e.target.value / 100);
      lastVolume = Number(e.target.value);
      syncVolIcon(Number(e.target.value));
      syncMpVolIcon();
    });
    $('#volume').addEventListener('change', savePref);
    // 图标点按：静音 / 恢复
    const volBtn = $('#volBtn');
    if (volBtn) {
      volBtn.addEventListener('click', () => {
        const cur = Number($('#volume').value);
        if (cur > 0) {
          lastVolume = cur;
          $('#volume').value = '0';
          player.setVolume(0);
        } else {
          const back = lastVolume > 0 ? lastVolume : 60;
          $('#volume').value = String(back);
          player.setVolume(back / 100);
        }
        syncVolIcon(Number($('#volume').value));
        savePref();
      });
    }

    $('#btnSolf').addEventListener('click', toggleSolfeggio);

    // 起卦栏 → 音乐栏 的跳转
    const jump = $('#btnJumpMusic');
    if (jump) jump.addEventListener('click', () => switchPage('music'));

    // 音乐栏空状态 → 起卦栏
    const go = $('#btnGoCast');
    if (go) go.addEventListener('click', () => switchPage('cast'));
  }

  /* ===============================================================
   * 起卦
   * =============================================================== */

  function castDaily() {
    present(H.dailyHexagram(new Date()));
  }

  function castImage() {
    if (!selectedImage) return;
    present(H.imageHexagram(selectedImage.name, selectedImage.gua, new Date()));
  }

  function castNumber() {
    const a = parseInt($('#numUpper').value, 10);
    const b = parseInt($('#numLower').value, 10);
    if (!a || !b || a < 1 || b < 1) {
      $('#numUpper').focus();
      return;
    }
    present(H.numberHexagram(a, b));
  }

  /** 学易栏「以此卦起卦」：直接以指定卦序立卦（不动爻） */
  function castHexagramByNumber(n) {
    const hex = D.getHexagram(n);
    if (!hex) return;
    present({
      hex,
      changedHex: null,
      movingLine: 1,
      movingLines: [1],
      lines: D.getSixLines(hex),
      changedLines: D.getSixLines(hex),
      methodText: '六十四卦直选',
      detail: {},
      music: D.deriveMusicConfig(hex)
    });
    // 起卦后切回起卦栏，让用户看到解读
    switchPage('cast');
  }

  // 供 learn.js 调用
  window.__gxCastHexagram = castHexagramByNumber;

  /* ===============================================================
   * 展示卦象（起卦栏 + 音乐栏同步更新）
   * =============================================================== */

  function present(result) {
    currentResult = result;
    const reading = H.buildReading(result);
    const hex = result.hex;
    const music = result.music;

    /* ---------- 起卦栏：卦象解读 ---------- */
    $('#resultCard').classList.remove('hidden');

    $('#resultSymbol').textContent = reading.symbol;
    $('#resultName').textContent = reading.name;
    $('#resultStructure').textContent = reading.structure;
    $('#resultVirtue').textContent = reading.virtue + '之卦';
    $('#resultMethod').textContent = reading.methodText;
    $('#resultGua').textContent = `「${reading.gua}」`;
    $('#resultXiang').textContent = reading.xiang;
    $('#resultHint').textContent = reading.hint;
    const movers = (reading.movingLines && reading.movingLines.length)
      ? reading.movingLines.map((i) => reading.yaoList[i - 1].title).join('、')
      : '';
    $('#resultMoving').textContent = movers ? `${movers}　${reading.movingText}` : reading.movingText;
    $('#resultChanged').textContent = reading.changedText;

    renderYao(reading, result);
    renderMusicParams(music);
    renderClassics(result);

    /* ---------- 音乐栏：当前卦心音直达 ---------- */
    // 即兴连播不需要预先渲染整曲：卦象与配置在此定好，
    // 每次播放都按「卦象逻辑 + 时间种子 + 随机变体 + 宏曲式阶段」现场编曲。
    // 导出的乐谱取「呈示」阶段（含轮内发展手法），避免导出旧式原样复读的一段。
    currentScore = M.composeNotes(hex, music, result.changedMusic, { form: 'chengshi' });
    renderWavePreview();
    const mpT = $('#mpTitle');
    if (mpT) mpT.textContent = hex.name;
    // 预热：在 Worker 后台把第一段编好放着，按下播放即刻出声（不必等那一秒多）
    try { player.warmup(hex, music, result.changedMusic, buildAmbient()); } catch (e) { /* 无 Worker 则回退 */ }
    // 每卦配一支建议疗愈频率（同卦同频），用户可在「音层」另选
    ambient.sol.freq = G.solfeggioForHex(hex.n).freq;
    // 换卦即清场：旧流线不再代表新卦
    flowLines = [];
    flowBands = [];
    vizBass = 0;
    vizBassTarget = 0;
    renderSectionsReset();
    renderMusicNow(reading, music);
    syncAmbientUI();

    stopPlayback();
    saveHistory(reading, result);
  }

  /** 音乐栏的「当前心音」卡片 */
  function renderMusicNow(reading, music) {
    $('#musicEmpty').classList.add('hidden');
    $('#musicNow').classList.remove('hidden');
    $('#playerCard').classList.remove('hidden');
    $('#ambientCard').classList.remove('hidden');

    $('#musicNowSymbol').textContent = reading.symbol;
    $('#musicNowName').textContent = `${reading.name} · 心音`;
    $('#musicNowMeta').textContent =
      `${reading.structure} · ${reading.virtue}之卦 · ${reading.methodText}`;

    const box = $('#musicNowParams');
    box.innerHTML = '';
    const natureOn = G.NATURE_LAYERS.filter((l) => ambient.nature[l.key]);
    const natureText = natureOn.length
      ? natureOn.map((l) => l.name).join('·')
      : '未开启';
    [
      { label: '调式', value: music.modeName, sub: music.modeMood },
      { label: '律', value: music.lvName },
      { label: '音色', value: music.voiceText, sub: music.voiceMaterial + '声' },
      { label: '速度', value: music.tempo, sub: 'BPM' },
      { label: '疗愈音层', value: ambient.sol.on ? `${ambient.sol.freq}Hz` : '未开启', sub: ambient.sol.on ? G.solfeggioForHex(reading.n).label : '' },
      { label: '自然音层', value: natureText, sub: natureOn.length ? '合成' : '' }
    ].forEach((it) => {
      const d = document.createElement('div');
      d.className = 'mparam';
      d.innerHTML =
        `<div class="mparam-label">${it.label}</div>` +
        `<div class="mparam-value">${it.value}${it.sub ? ` <small>${it.sub}</small>` : ''}</div>`;
      box.appendChild(d);
    });
    // 按钮与音层面板随当前卦刷新
    setSolfIcon(ambient.sol.on);
    syncAmbientUI();
  }

  function renderYao(reading, result) {
    const fig = $('#yaoFigure');
    fig.innerHTML = '';
    for (let i = 5; i >= 0; i--) {
      const yao = reading.yaoList[i];
      const row = document.createElement('div');
      row.className = 'yao';
      if (yao.isMoving) row.classList.add('moving');
      if (yao.isMoving && result.changedLines[i] !== (yao.isYang ? 1 : 0)) row.classList.add('changed');

      if (yao.isYang) {
        const l = document.createElement('span');
        l.className = 'yao-line solid';
        row.appendChild(l);
      } else {
        const l1 = document.createElement('span');
        l1.className = 'yao-line broken';
        const l2 = document.createElement('span');
        l2.className = 'yao-line broken';
        row.appendChild(l1);
        row.appendChild(l2);
      }
      fig.appendChild(row);
    }
  }

  function renderMusicParams(music) {
    const box = $('#musicParams');
    box.innerHTML = '';
    const items = [
      { label: '调式', value: music.modeName, sub: music.modeMood },
      { label: '律', value: music.lvName },
      { label: '主音', value: 'MIDI ' + music.rootMidi, sub: freqName(music.rootMidi) },
      { label: '音色', value: music.voiceText, sub: music.voiceMaterial + '声' },
      { label: '速度', value: music.tempo, sub: 'BPM' },
      { label: '音色情绪', value: music.virtue }
    ];
    items.forEach((it) => {
      const d = document.createElement('div');
      d.className = 'mparam';
      d.innerHTML =
        `<div class="mparam-label">${it.label}</div>` +
        `<div class="mparam-value">${it.value}${it.sub ? ` <small>${it.sub}</small>` : ''}</div>`;
      box.appendChild(d);
    });
  }

  /* ===============================================================
   * 文献依据面板
   * ---------------------------------------------------------------
   * 把取象、卦德、乐器配卦、调式清浊的出处逐条摊开，
   * 并标注「典籍原文 / 后世类书 / 当代类推」三档来源，
   * 便于用户自行查证与质疑。
   * =============================================================== */

  function renderClassics(result) {
    const box = $('#classicsBody');
    if (!box) return;
    const panel = D.buildClassicsPanel(result, { imageName: selectedImageName(result) });
    box.innerHTML = '';

    const block = (title, inner) => {
      const sec = document.createElement('section');
      sec.className = 'cblock';
      sec.innerHTML = `<h4 class="cblock-title">${title}</h4>` + inner;
      box.appendChild(sec);
    };

    /* ---------- 起卦法 ---------- */
    block('起卦法',
      `<p class="citem"><span class="cbadge ${panel.method.srcCls}">${panel.method.srcLabel}</span>`
      + `<span class="cname">${panel.method.name}</span></p>`
      + `<p class="ccite">${panel.method.cite}</p>`
      + `<p class="ctext">${panel.method.text}</p>`
      + `<p class="cnote">${panel.method.note}</p>`);

    /* ---------- 物象出处 ---------- */
    if (panel.images.length) {
      const inner = panel.images.map((im) => (
        `<p class="citem"><span class="cbadge ${im.srcCls}">${im.srcLabel}</span>`
        + `<span class="cname">${im.name} → ${im.guaName}卦 ${im.guaSymbol}</span></p>`
        + `<p class="ccite">${im.cite}</p>`
        + `<p class="ctext"><b>取象之理：</b>${im.reason}</p>`
        + (im.alt ? `<p class="cnote"><b>异说与取舍：</b>${im.alt}</p>` : '')
      )).join('');
      block('所取物象', inner);
    }

    /* ---------- 内外卦 ---------- */
    const triInner = panel.trigrams.map((t) => (
      `<p class="citem"><span class="cname">${t.role} ${t.name} ${t.symbol}　${t.nature}　${t.wuxing}</span></p>`
      + `<p class="ccite">《说卦传》：${t.shuogua}</p>`
      + `<p class="ctext"><b>《梅花易数》属类：</b>${t.meihua}</p>`
      + `<p class="cnote"><b>类象歌诀：</b>${t.koujue}</p>`
    )).join('');
    block('卦德与物象', triInner);

    /* ---------- 乐器 ---------- */
    block('乐器（外卦配八音）',
      `<p class="citem"><span class="cname">${panel.voice.name}　${panel.voice.material}声</span>`
      + `<span class="csub">配${panel.voice.trigramName}卦</span></p>`
      + `<p class="ctext"><b>音色：</b>${panel.voice.timbre}</p>`
      + `<p class="ctext">${panel.voice.desc}</p>`
      + `<p class="ccite">${panel.voice.cite}</p>`);

    /* ---------- 调式（五音） ---------- */
    if (panel.mode) {
      const m = panel.mode;
      block('调式（内卦五行纳音）',
        `<p class="citem"><span class="cname">${m.full}　${m.wuxing}</span>`
        + `<span class="csub">${m.role}　${m.meaning}</span></p>`
        + `<p class="ctext"><b>清浊：</b>${m.clarityLabel}（${m.claritySrc}）</p>`
        + `<p class="ctext"><b>音色：</b>${m.timbre}</p>`
        + `<p class="ctext"><b>五脏配属：</b>${m.organ}（${m.organSrc}）</p>`
        + `<p class="cnote">${m.meaningSrc}<br>${m.roleSrc}<br>${m.animal}</p>`);
    }

    /* ---------- 免责 ---------- */
    const dis = document.createElement('section');
    dis.className = 'cblock cblock-dis';
    dis.innerHTML =
      `<h4 class="cblock-title">声明</h4>`
      + `<p class="ctext">${panel.disclaimer.music}</p>`
      + `<p class="ctext">${panel.disclaimer.divination}</p>`
      + `<p class="cnote">${panel.disclaimer.source}</p>`;
    box.appendChild(dis);
  }

  /** 观象起卦时取出所选物象名（用于展示其出处） */
  function selectedImageName(result) {
    if (result.method === 'image' && result.detail && result.detail.imageName) {
      return result.detail.imageName;
    }
    return '';
  }

  function freqName(midi) {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const n = names[((midi % 12) + 12) % 12];
    const oct = Math.floor(midi / 12) - 1;
    return n + oct;
  }

  /** 重置即兴段落显示（换卦时） */
  function renderSectionsReset() {
    const sec = SECTION_NAMES.intro;
    $('#genSec').textContent = sec[0];
    $('#genSecName').textContent = sec[1];
    $('#genRound').textContent = '即兴第 1 段';
    $('#playerLive').hidden = true;
  }

  /** 即兴连播的段落回调：只显示「奏到哪一段」，不显示进度 */
  function onGenChange(info) {
    const sec = SECTION_NAMES[info.section] || SECTION_NAMES.intro;
    $('#genSec').textContent = sec[0];
    $('#genSecName').textContent = sec[1];
    const layers = [];
    if (ambient.sol.on) layers.push(`疗愈 ${ambient.sol.freq}Hz`);
    G.NATURE_LAYERS.forEach((l) => { if (ambient.nature[l.key]) layers.push(l.name); });
    const sol = layers.length ? ` · ${layers.join(' · ')}` : '';
    // 宏曲式阶段名：八段一循环，让听者知道这一段走到了曲式的哪一步
    const arc = info.arcName ? ` · ${info.arcName}` : '';
    $('#genRound').textContent = `即兴第 ${info.round + 1} 段${arc}${sol}`;
    $('#playerLive').hidden = false;
  }

  /* ===============================================================
   * 播放控制
   * =============================================================== */

  /**
   * 显眼大按钮：播放 → 暂停 → 继续（三态合一）
   * ---------------------------------------------------------------
   * 没有独立的「停止」键 —— 暂停是挂起音频时间轴（无缝接续），
   * 彻底停止由「切换卦象 / 关闭音层」等页面动作完成。
   */
  function togglePlay() {
    if (isPlaying) {
      if (player.paused) {
        // 继续：从挂起处接着放（无缝）
        player.resume();
        userPaused = false;
        setPlayState('playing');
        setFlowState('playing');
      } else {
        // 暂停：挂起音频时间轴，音乐停在原处
        pausePlayback();
      }
      return;
    }
    startGenerative();
  }

  /** 暂停：挂起音频时间轴，音乐停在原处；雾也随声而定格 */
  function pausePlayback() {
    if (!isPlaying) return;
    userPaused = true;
    player.pause();
    setPlayState('paused');
    setFlowState('paused');
  }

  /** 设置页里的简短反馈（借用播放器提示条，不另做 toast） */
  let tipTimer = null;
  function flashTip(text) {
    const tip = $('#playerTip');
    if (!tip) return;
    if (!tip.dataset.orig) tip.dataset.orig = tip.textContent;
    tip.textContent = text;
    if (tipTimer) clearTimeout(tipTimer);
    tipTimer = setTimeout(() => {
      tip.textContent = tip.dataset.orig || tip.textContent;
      tipTimer = null;
    }, 2200);
  }

  /** 循环：反复播放当前这一段，不再另编新段（与导出的 WAV 同一份乐谱） */
  function toggleLoop() {
    const on = player.toggleLoop();
    const btn = $('#btnLoop');
    if (btn) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    const txt = $('#btnLoopText');
    if (txt) txt.textContent = on ? '循环中' : '循环';
    const mpLoop = $('#mpLoop');
    if (mpLoop) mpLoop.setAttribute('aria-pressed', on ? 'true' : 'false');
    savePref();
    return on;
  }

  /**
   * 开始即兴连播：现场编曲、叠尾相接、无终点。
   * 每一轮都以「当前时间 + 随机数」为种子重新生成，
   * 故同一卦每次听、每段听，都是新的编舞。
   */
  function startGenerative() {
    if (!currentResult) return;
    playTarget = 'hex';
    auditionVoice = null;
    markInstButtons();

    const amb = buildAmbient();
    const label = G.solfeggioForHex(currentResult.hex.n).label;
    const natureOn = G.NATURE_LAYERS.filter((l) => ambient.nature[l.key]);
    const layers = [];
    if (ambient.sol.on) layers.push(`疗愈 ${ambient.sol.freq}Hz（${label}）`);
    if (natureOn.length) layers.push(natureOn.map((l) => l.name).join('、'));
    $('#playerTip').textContent = layers.length
      ? `即兴连播中：八段一循环（呈示·应和·加花·隔凡·分裂·压上·换头·再现），`
        + `同一动机逐段生长、不作原样复读。${layers.join('；')}垫在五声之下 —— `
        + '皆为可选氛围元素，非古律、不涉疗效，可随时关闭。'
      : '即兴连播中：八段一循环（呈示·应和·加花·隔凡·分裂·压上·换头·再现），'
        + '同一动机逐段生长、不作原样复读，绵延不绝。';

    player.playGenerative(currentResult.hex, currentResult.music, currentResult.changedMusic, {
      ambient: amb,
      onChange: onGenChange
    });
    isPlaying = true;
    setPlayState('playing');
    setFlowState('playing');
    startViz();
  }

  function stopPlayback() {
    player.stop();
    isPlaying = false;
    playTarget = null;
    auditionVoice = null;
    setPlayState('idle');
    markInstButtons();
    // 流线不再发射新线，已有流线向右走完并渐隐
    setFlowState('drain');
    $('#playerLive').hidden = true;
    renderSectionsReset();
  }

  function setPlayIcon(playing) {
    $('#btnPlayIcon').textContent = playing ? '❚❚' : '▶';
    $('#btnPlayText').textContent = playing ? '停止' : '播放';
  }

  /** 播放按钮三态：播放 / 暂停 / 继续
   *  ---------------------------------------------------------------
   * 暂停是**挂起音频时间轴**，恢复后从原处接上（无缝）；
   * 停止才是彻底结束（下一段要重新编曲，故有一秒多的准备时间）。
   */
  /** 音量图标三态：静音 / 低 / 高（图标随音量变化，不用 emoji） */
  function syncVolIcon(v) {
    const btn = $('#volBtn');
    if (!btn) return;
    const val = Math.max(0, Math.min(100, Math.round(v)));
    const level = val <= 0 ? 'mute' : (val < 50 ? 'low' : 'high');
    btn.dataset.level = level;
    btn.setAttribute('aria-label', level === 'mute' ? '已静音，点按恢复' : `音量 ${val}，点按静音`);
  }

  /**
   * 播放按钮三态：播放（▶ 播放）/ 播放中（❚❚ 暂停）/ 暂停（▶ 继续）
   * 同时同步浮动播放栏（mini player）的显示与图标。
   */
  function setPlayState(state) {
    const icon = $('#btnPlayIcon');
    const text = $('#btnPlayText');
    if (!icon || !text) return;
    if (state === 'playing') {
      icon.textContent = '❚❚';
      text.textContent = '暂停';
      $('#playerLiveText') && ($('#playerLiveText').textContent = '即兴中');
    } else if (state === 'paused') {
      icon.textContent = '▶';
      text.textContent = '继续';
      $('#playerLiveText') && ($('#playerLiveText').textContent = '已暂停');
    } else {
      icon.textContent = '▶';
      text.textContent = '播放';
    }
    syncMiniPlayer(state);
  }

  /* ===============================================================
   * 浮动播放栏（mini player）
   * ---------------------------------------------------------------
   * 播放 / 暂停时滑出在底部标签栏上方，像音乐软件的浮动控制条：
   * 曲名、状态、跳动音波、播放/暂停、循环、音量。点曲名区回音乐栏。
   * =============================================================== */
  function syncMiniPlayer(state) {
    const mp = $('#miniPlayer');
    if (!mp) return;
    const show = (state === 'playing' || state === 'paused');
    mp.hidden = !show;
    mp.classList.toggle('is-playing', state === 'playing');
    // 浮动栏会盖住页面底部，给内容留出空间（避免遮住最后一行）
    document.body.classList.toggle('has-miniplayer', show);
    const sub = $('#mpSub');
    if (sub) sub.textContent = state === 'playing' ? '即兴中 · 心音' : '已暂停';
    const title = $('#mpTitle');
    if (title && currentResult) title.textContent = currentResult.hex.name;
    // 循环态与音量态跟随
    const loopBtn = $('#mpLoop');
    if (loopBtn) loopBtn.setAttribute('aria-pressed', player.loop ? 'true' : 'false');
    syncMpVolIcon();
  }

  function syncMpVolIcon() {
    const btn = $('#mpVol');
    if (!btn) return;
    const v = Number($('#volume').value);
    btn.classList.toggle('is-mute', v <= 0);
  }

  function bindMiniPlayer() {
    const mp = $('#miniPlayer');
    const mpPlay = $('#mpPlay');
    if (mpPlay) mpPlay.addEventListener('click', togglePlay);
    const mpLoop = $('#mpLoop');
    if (mpLoop) mpLoop.addEventListener('click', toggleLoop);
    const mpVol = $('#mpVol');
    if (mpVol) {
      mpVol.addEventListener('click', () => {
        const cur = Number($('#volume').value);
        if (cur > 0) {
          lastVolume = cur;
          $('#volume').value = '0';
          player.setVolume(0);
        } else {
          const back = lastVolume > 0 ? lastVolume : 60;
          $('#volume').value = String(back);
          player.setVolume(back / 100);
        }
        syncVolIcon(Number($('#volume').value));
        syncMpVolIcon();
        savePref();
      });
    }
    // 点信息区回到音乐栏
    const info = mp.querySelector('.mp-info');
    if (info) {
      info.addEventListener('click', () => {
        document.querySelector('.tabbtn[data-page="music"]').click();
      });
    }
  }

  /* ---------------------------------------------------------------
   * 浮动栏贴位：实测标签栏位置，写入 --mp-bottom
   * ---------------------------------------------------------------
   * 标签栏是 fixed 胶囊，高度随字号档 / 安全区 / 横竖屏变化，
   * 写死的 --tabbar-h 会在大字号时与实际位置对不上（曾导致两栏重叠）。
   * 故此处量真实矩形，浮动栏永远停在标签栏上方 10px。
   */
  function layoutMiniPlayer() {
    const tb = $('#tabbar');
    if (!tb) return;
    const r = tb.getBoundingClientRect();
    if (!r.height) return;
    const gap = 10;
    const bottom = Math.round(window.innerHeight - r.top) + gap;
    document.documentElement.style.setProperty('--mp-bottom', bottom + 'px');
  }

  function bindMiniPlayerLayout() {
    layoutMiniPlayer();
    window.addEventListener('resize', layoutMiniPlayer);
    window.addEventListener('orientationchange', () => setTimeout(layoutMiniPlayer, 120));
    // 字号档切换会改变标签栏高度，稍后再量一次
    const fontRow = $('#fontRow');
    if (fontRow) {
      fontRow.addEventListener('click', () => setTimeout(layoutMiniPlayer, 60));
    }
  }

  /* ===============================================================
   * 液态玻璃 · 按压动效
   * ---------------------------------------------------------------
   * 玻璃被按下去时不该「塌陷」，而该被压出一个凹面：
   *   1. 触点高光 —— 记住触点，伪元素从该点散开（CSS .is-press）
   *   2. 涟漪环   —— 主操作键点按荡开一圈水纹
   *   3. 涌起     —— 开关切换时的一下回弹
   * 只动 transform / opacity，不触发布局。
   * =============================================================== */

  /** 会参与液态按压的玻璃按键（与 CSS 的选择器列表对应） */
  const LIQUID_SEL = '.btn, .tabbtn, .seg, .viz-mode, .mp-btn, .skin-opt,'
    + ' .segmented .tab, .amb-chip, .inst-play, .icon-btn, .vol-btn';
  /** 会荡开涟漪的主操作键 */
  const RIPPLE_SEL = '.btn-play, .mp-btn';

  function bindLiquidPress() {
    // 触点位置 → 按压高光的中心
    document.addEventListener('pointerdown', (e) => {
      const t = e.target && e.target.closest ? e.target.closest(LIQUID_SEL) : null;
      if (!t) return;
      const r = t.getBoundingClientRect();
      // 元素不可见时（矩形为 0）用默认中心点，仍保留按压高光
      if (r.width && r.height) {
        t.style.setProperty('--px', (((e.clientX - r.left) / r.width) * 100).toFixed(1) + '%');
        t.style.setProperty('--py', (((e.clientY - r.top) / r.height) * 100).toFixed(1) + '%');
      }
      t.classList.add('is-press');
    }, { passive: true });

    // 松手：高光缓缓退去（CSS 负责淡出）
    const release = (e) => {
      const t = e.target && e.target.closest ? e.target.closest(LIQUID_SEL) : null;
      if (t) t.classList.remove('is-press');
    };
    document.addEventListener('pointerup', release, { passive: true });
    document.addEventListener('pointercancel', release, { passive: true });
    document.addEventListener('pointerleave', release, { passive: true });

    // 主操作键：点按处荡开一圈水纹
    document.addEventListener('pointerdown', (e) => {
      const t = e.target && e.target.closest ? e.target.closest(RIPPLE_SEL) : null;
      if (!t) return;
      spawnRipple(t, e.clientX, e.clientY);
    }, { passive: true });

    // 开关态变化：一下「涌起」
    document.addEventListener('click', (e) => {
      const t = e.target && e.target.closest ? e.target.closest('[aria-pressed]') : null;
      if (!t) return;
      t.classList.remove('is-pulse');
      // 强制重排以便重放同一动画
      void t.offsetWidth;
      t.classList.add('is-pulse');
      setTimeout(() => t.classList.remove('is-pulse'), 520);
    });
  }

  /** 生成一圈扩散的涟漪 */
  function spawnRipple(host, clientX, clientY) {
    if (!host) return;
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;   // 不可见时不生成
    const size = Math.max(r.width, r.height) * 2.2;
    const x = (typeof clientX === 'number' ? clientX : r.left + r.width / 2) - r.left;
    const y = (typeof clientY === 'number' ? clientY : r.top + r.height / 2) - r.top;
    const span = document.createElement('span');
    span.className = 'lq-ripple';
    span.style.width = size + 'px';
    span.style.height = size + 'px';
    span.style.left = x + 'px';
    span.style.top = y + 'px';
    host.appendChild(span);
    setTimeout(() => { if (span.parentNode) span.parentNode.removeChild(span); }, 700);
  }

  /** 播放卡片上的快捷开关：疗愈频率（其余音层在「音层」面板） */
  function toggleSolfeggio() {
    ambient.sol.on = !ambient.sol.on;
    setSolfIcon(ambient.sol.on);
    player.setAmbient(buildAmbient());
    const label = G.solfeggioForHex(currentResult ? currentResult.hex.n : 1).label;
    $('#playerTip').textContent = ambient.sol.on
      ? `疗愈音层已开启：${ambient.sol.freq}Hz（${label}）在五声之下极轻铺底，下一段起生效。`
      : '疗愈音层已关闭：只留下五声本体。';
    savePref();
    syncAmbientUI();
    // 同步音乐栏参数卡
    if (currentResult) {
      renderMusicNow(H.buildReading(currentResult), currentResult.music);
    }
  }

  function setSolfIcon(on) {
    const btn = $('#btnSolf');
    if (!btn) return;
    btn.classList.toggle('on', !!on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    $('#btnSolfText').textContent = on ? `疗愈 ${ambient.sol.freq}Hz` : '疗愈音层';
  }

  /* ===============================================================
   * 音层面板：疗愈频率（索菲吉奥九频）+ 自然音层（多选）
   * =============================================================== */

  function renderAmbientChips() {
    // 疗愈频率九频
    const solBox = $('#ambSolfChips');
    if (solBox) {
      solBox.innerHTML = '';
      G.SOLFEGGIO_FREQS.forEach((f, i) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'amb-chip' + (ambient.sol.on && ambient.sol.freq === f ? ' is-on' : '');
        chip.dataset.freq = String(f);
        chip.innerHTML =
          `<span class="ac-name">${G.SOLFEGGIO_LABELS[i]}</span>` +
          `<span class="ac-freq">${f} Hz</span>` +
          layerWaveSpark(LAYER_WAVE_STYLES.sol);
        chip.title = G.SOLFEGGIO_INTROS[i];
        chip.addEventListener('click', () => {
          if (ambient.sol.on && ambient.sol.freq === f) {
            ambient.sol.on = false;            // 再点一次 = 关闭
          } else {
            ambient.sol.on = true;
            ambient.sol.freq = f;
          }
          afterAmbientChange();
        });
        solBox.appendChild(chip);
      });
    }
    // 自然音层
    const natBox = $('#ambNatureChips');
    if (natBox) {
      natBox.innerHTML = '';
      G.NATURE_LAYERS.forEach((l) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'amb-chip' + (ambient.nature[l.key] ? ' is-on' : '');
        chip.dataset.nature = l.key;
        chip.title = l.intro;
        chip.innerHTML =
          `<span class="ac-name">${l.name}</span>` +
          `<span class="ac-freq">合成音层</span>` +
          layerWaveSpark(LAYER_WAVE_STYLES[l.key]);
        chip.addEventListener('click', () => {
          ambient.nature[l.key] = !ambient.nature[l.key];
          afterAmbientChange();
        });
        natBox.appendChild(chip);
      });
    }
  }

  function bindAmbient() {
    const clear = $('#ambSolfClear');
    if (clear) {
      clear.addEventListener('click', () => {
        ambient.sol.on = false;
        afterAmbientChange();
      });
    }
    const lv = $('#ambLevel');
    if (lv) {
      lv.value = String(Math.round(ambient.level * 100));
      const num = $('#ambLevelNum');
      if (num) num.textContent = `${lv.value}%`;
      lv.addEventListener('input', () => {
        ambient.level = Math.max(0, Math.min(1, parseInt(lv.value, 10) / 100));
        if (num) num.textContent = `${lv.value}%`;
        player.setAmbient(buildAmbient());
      });
      lv.addEventListener('change', savePref);
    }
  }

  /** 音层任一变动后的统一收尾：刷新 UI、通知播放器（下一段生效）、存偏好 */
  function afterAmbientChange() {
    setSolfIcon(ambient.sol.on);
    syncAmbientUI();
    player.setAmbient(buildAmbient());
    savePref();
    if (currentResult) {
      renderMusicNow(H.buildReading(currentResult), currentResult.music);
    }
    const label = G.solfeggioForHex(currentResult ? currentResult.hex.n : 1).label;
    const on = [];
    if (ambient.sol.on) on.push(`疗愈 ${ambient.sol.freq}Hz（${label}）`);
    G.NATURE_LAYERS.forEach((l) => { if (ambient.nature[l.key]) on.push(l.name); });
    $('#playerTip').textContent = on.length
      ? `音层：${on.join('、')} —— 下一段即兴起混入。`
      : '音层已全部关闭：只留下五声本体。';
  }

  /** 把当前音层状态同步到面板（chips 高亮、介绍文案、总音量） */
  function syncAmbientUI() {
    $$('#ambSolfChips .amb-chip').forEach((c) => {
      c.classList.toggle('is-on', ambient.sol.on && ambient.sol.freq === parseInt(c.dataset.freq, 10));
    });
    $$('#ambNatureChips .amb-chip').forEach((c) => {
      c.classList.toggle('is-on', !!ambient.nature[c.dataset.nature]);
    });
    const intro = $('#ambSolfIntro');
    if (intro) {
      if (!ambient.sol.on) {
        intro.textContent = '未选频率 —— 点选上方任一频率开启疗愈音层。';
      } else {
        const i = G.SOLFEGGIO_FREQS.indexOf(ambient.sol.freq);
        intro.textContent = i >= 0
          ? `${G.SOLFEGGIO_LABELS[i]} · ${ambient.sol.freq}Hz —— ${G.SOLFEGGIO_INTROS[i]}`
          : '';
      }
    }
    const natIntro = $('#ambNatureIntro');
    if (natIntro) {
      const on = G.NATURE_LAYERS.filter((l) => ambient.nature[l.key]);
      natIntro.textContent = on.length
        ? `已叠加：${on.map((l) => l.name).join('、')} —— ${on.map((l) => l.intro).join('；')}`
        : '点选叠加，再点取消；各层由合成引擎实时生成，非录音素材。';
    }
    const lv = $('#ambLevel');
    const num = $('#ambLevelNum');
    if (lv && document.activeElement !== lv) lv.value = String(Math.round(ambient.level * 100));
    if (num) num.textContent = `${Math.round(ambient.level * 100)}%`;
  }

  async function exportWav() {
    const btn = $('#btnExport');
    const old = btn.textContent;
    btn.textContent = '导出中…';
    btn.disabled = true;
    try {
      // 即兴连播中：导出正在听的这一轮（已含音层）；
      // 否则以当前卦与音层配置现场渲染一份导出
      const buf = player.exportLastWav()
        || player.exportWav(currentScore, { ambient: buildAmbient() });
      const blob = new Blob([buf], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const name = currentResult ? currentResult.hex.name : '古律象音';
      a.href = url;
      a.download = `${name}-古律象音.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      $('#playerTip').textContent = '已导出这一段 WAV 文件。';
    } catch (e) {
      $('#playerTip').textContent = '导出失败：' + e.message;
    } finally {
      btn.textContent = old;
      btn.disabled = false;
    }
  }

  /* ===============================================================
   * 乐器园 · 八音介绍与试听
   * =============================================================== */

  /**
   * 试听乐谱：以宫调式五声写一段短句，用指定乐器演奏。
   * 打击类（鼓、柷敔）移低/移高音区以贴合其物理音色。
   * 音色修饰取宫调式参数（浊而中和），与生成音乐同一套 VOICE_SPECS。
   */
  const AUDITION_TIMBRE = {
    clarity: 0.15, brightness: 0.24, attack: 0.085,
    release: 0.80, noise: 0.14, harmonic: 0.95
  };

  const AUDITION_PHRASE = [0, 2, 4, 7, 9, 7, 4, 2];   // 宫 商 角 徵 羽 徵 角 商

  function buildAuditionScore(voice) {
    const percussive = voice === 'gu';
    const highClack = voice === 'zhu';
    const root = percussive ? 36 : highClack ? 72 : 62;
    const beat = percussive ? 0.34 : 0.44;
    const durs = [0.9, 0.7, 0.9, 1.2, 1.4, 0.8, 0.9, 1.7];

    const notes = [];
    let t = 0;
    for (let i = 0; i < AUDITION_PHRASE.length; i++) {
      const dur = durs[i] * beat;
      notes.push({
        time: +t.toFixed(3),
        dur: +dur.toFixed(3),
        midi: root + AUDITION_PHRASE[i],
        vel: 0.32,
        voice,
        pan: 0,
        timbre: AUDITION_TIMBRE
      });
      t += dur * 0.92;
    }
    return { notes, duration: t + 0.5, sections: {} };
  }

  function renderInstruments() {
    const grid = $('#instGrid');
    if (!grid) return;
    grid.innerHTML = '';

    Object.keys(D.EIGHT_TONE).forEach((key) => {
      const t = D.EIGHT_TONE[key];
      const tri = D.TRIGRAMS[t.trigram];
      const card = document.createElement('div');
      card.className = 'inst-card';
      card.dataset.voice = key;
      card.innerHTML =
        `<div class="inst-top">` +
          `<span class="inst-sym">${tri.symbol}</span>` +
          `<div>` +
            `<div class="inst-name">${escapeHtml(t.name)}</div>` +
            `<div class="inst-alias">${escapeHtml(t.alias)}</div>` +
          `</div>` +
        `</div>` +
        `<div class="inst-tags">` +
          `<span class="inst-tag inst-tag-mat">${escapeHtml(t.material)}声</span>` +
          `<span class="inst-tag inst-tag-gua">配${escapeHtml(tri.name)}卦 · ${escapeHtml(tri.attribute)}</span>` +
        `</div>` +
        `<p class="inst-timbre">音色：${escapeHtml(t.timbre)}</p>` +
        `<p class="inst-desc">${escapeHtml(t.desc)}</p>` +
        `<div class="inst-foot-row">` +
          `<span class="inst-cite">典籍原文</span>` +
          `<button class="inst-play" type="button" data-voice="${key}">试听</button>` +
        `</div>`;
      grid.appendChild(card);
    });

    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('.inst-play');
      if (btn) audition(btn.dataset.voice);
    });

    const foot = $('#instFoot');
    if (foot) {
      foot.innerHTML =
        '八音之材各配一卦，柷敔、钟、弦、鼓、埙、管六器见《白虎通·礼乐》引《乐记》原文，' +
        '箫、磬为清人陈立《白虎通疏证》所补。试听音色由本应用合成引擎实时生成，' +
        '与起卦后主奏乐器同一套音色规格（物理频谱参数见 core/render.js VOICE_SPECS）。';
    }
  }

  function audition(voice) {
    // 再点一次正在试听的乐器 = 停止
    if (auditionVoice === voice && isPlaying) {
      stopPlayback();
      return;
    }
    const info = D.EIGHT_TONE[voice];
    if (!info) return;

    playTarget = { type: 'inst', voice };
    auditionVoice = voice;
    markInstButtons();

    $('#playerTip').textContent = `正在试听：${info.name}（${info.material}声，配${D.TRIGRAMS[info.trigram].name}卦）`;
    player.play(buildAuditionScore(voice));
    isPlaying = true;
    setPlayIcon(true);
    markInstButtons();
    setFlowState('playing');
    startViz();
  }

  function markInstButtons() {
    $$('.inst-play').forEach((b) => {
      const on = auditionVoice === b.dataset.voice && isPlaying;
      b.classList.toggle('playing', on);
      b.textContent = on ? '停止' : '试听';
    });
  }

  /* ===============================================================
   * 波形可视化
   * ---------------------------------------------------------------
   * 三种显示，默认「卦象流动」：
   *   hex3d  —— 多条柔和线条在卦象的三维模型上横穿流动、附着跳动：
   *             六爻卦体以伪三维投影缓旋，丝带线随音频能量起伏，
   *             经过爻位时增亮，动爻发光；
   *   silk   —— 丝弦波形：传统对称波形条（旧默认）；
   *   ripple —— 卦象涟漪：六重同心涟漪自卦心荡开。
   * =============================================================== */

  let vizRaf = null;
  let vizT = 0;               // 动画相位（与音频无关的持续流动）

  function startViz() {
    stopViz();
    const loop = () => {
      drawViz();
      vizRaf = requestAnimationFrame(loop);
    };
    vizRaf = requestAnimationFrame(loop);
  }

  function stopViz() {
    if (vizRaf) { cancelAnimationFrame(vizRaf); vizRaf = null; }
  }

  function bindVizModes() {
    $$('#vizModes .viz-mode').forEach((btn) => {
      btn.addEventListener('click', () => {
        vizMode = btn.dataset.viz;
        syncVizModes();
        savePref();
      });
    });
  }

  function syncVizModes() {
    $$('#vizModes .viz-mode').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.viz === vizMode);
    });
  }

  /** 取当前卦的六爻（自上而下）与动爻集合；无卦时用乾卦 */
  function vizHexData() {
    const hex = currentResult ? currentResult.hex : D.HEXAGRAMS[0];
    const lines = D.getSixLines(hex);           // 自下而上，1=阳
    const moving = (currentResult && currentResult.movingLines) || [];
    const out = {
      rows: lines.slice().reverse(),            // 自上而下
      moving: moving.slice(),
      symbol: hex.symbol,
      name: hex.name
    };
    // 供端到端测试核对：波形台的卦象方向须与起卦栏的六爻图一致
    window.__gxVizRows = out.rows.join('');
    window.__gxVizName = out.name;
    return out;
  }

  /** 频谱能量：取 Analyser 数据并平滑（无音频时归零）
   *  ---------------------------------------------------------------
   * 频段划分（fftSize=512、44.1kHz 时每 bin ≈ 86Hz）：
   *   低频 low   约 86–260Hz   → 云雾生成速度、辉光亮度
   *   中频 mid   约 260–2000Hz → 主体厚度
   *   高频 high  约 2k–12kHz   → 细碎湍流
   *   音量 level 总体包络     → 流速、粒子亮度、撞到卦爻的扰动强度
   */
  let vizEnergy = 0;
  let vizBassTarget = 0;
  let vizLow = 0;
  let vizMid = 0;
  let vizHigh = 0;
  let vizLevel = 0;

  /** 包络跟随：起音快、回落慢 */
  function envFollow(cur, target, dt, upT, downT) {
    const k = target > cur
      ? 1 - Math.pow(0.001, dt / upT)
      : 1 - Math.pow(0.001, dt / downT);
    return cur + (target - cur) * k;
  }

  function vizSpectrum() {
    const analyser = player.analyser;
    const live = !!(analyser && flowMode === 'playing');
    if (!live) {
      // 未播放 / 已暂停：能量与频段都归零，雾随之定格
      vizEnergy = vizEnergy * 0.86;
      vizBassTarget = 0;
      vizLow *= 0.88;
      vizMid *= 0.88;
      vizHigh *= 0.88;
      vizLevel *= 0.88;
      return null;
    }
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const dt = Math.min(0.05, vizDt());

    // 总能量（RMS 近似）
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const e = Math.sqrt(sum / data.length) / 255;
    vizEnergy = vizEnergy * 0.78 + e * 0.22;

    // 分频段能量
    const band = (a, b) => {
      let s = 0, n = 0;
      for (let i = a; i < b && i < data.length; i++) { s += data[i]; n++; }
      return n ? (s / n) / 255 : 0;
    };
    const lo = band(1, 4);        // 86–344Hz
    const md = band(4, 24);       // 344–2064Hz
    const hi = band(24, 140);     // 2k–12k
    vizLow = envFollow(vizLow, Math.min(1, Math.pow(lo, 0.72) * 1.5), dt, 0.05, 0.30);
    vizMid = envFollow(vizMid, Math.min(1, Math.pow(md, 0.85) * 1.7), dt, 0.04, 0.22);
    vizHigh = envFollow(vizHigh, Math.min(1, Math.pow(hi, 0.90) * 2.1), dt, 0.02, 0.14);
    vizLevel = envFollow(vizLevel, Math.min(1, Math.pow(e, 0.80) * 2.0), dt, 0.04, 0.26);

    // 低频鼓点：前若干个频段（供卦体缩放与光晕用）
    let lo2 = 0;
    const loN = Math.min(data.length, 6);
    for (let i = 1; i < loN; i++) lo2 += data[i];
    lo2 = lo2 / Math.max(1, loN - 1) / 255;
    vizBassTarget = Math.min(1, Math.pow(lo2, 0.78) * 1.35);
    return data;
  }

  /**
   * 波形预览条
   * ---------------------------------------------------------------
   * 直接由乐谱的音符表算包络（起音—衰减），不重渲染 PCM，
   * 故换卦后瞬间可更新、主线程不卡。
   */
  function renderWavePreview() {
    const cv = $('#wavePreview');
    if (!cv) return;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const w = cv.clientWidth || 358, h = cv.clientHeight || 36;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const score = currentScore;
    if (!score || !score.notes.length) return;
    const N = 120;                      // 采样格数
    const dur = Math.max(1, score.duration);
    const env = new Float32Array(N);
    const total = Math.round(score.duration);
    score.notes.forEach((n) => {
      const t0 = Math.max(0, Math.floor(n.time / total * N));
      const t1 = Math.min(N, Math.max(t0 + 1, Math.floor((n.time + (n.dur || 0.2)) / total * N)));
      const amp = Math.min(1, (n.vel === undefined ? 0.2 : n.vel) * 3.2);
      for (let i = t0; i < t1; i++) {
        const f = (i - t0) / Math.max(1, t1 - t0);
        const e = amp * (1 - f * 0.72) * (f < 0.12 ? f / 0.12 : 1);
        if (e > env[i]) env[i] = e;
      }
    });
    // 归一化并画成上下对称的波形条
    let mx = 0;
    for (let i = 0; i < N; i++) if (env[i] > mx) mx = env[i];
    if (mx <= 0) return;
    const bw = w / N;
    const mid = h / 2;
    const gold = '255,202,132';
    for (let i = 0; i < N; i++) {
      const v = env[i] / mx;
      const bh = Math.max(1, v * (h * 0.42));
      const x = i * bw;
      const t = i / N;
      ctx.fillStyle = `rgba(${Math.round(90 + 120 * t)},${Math.round(130 + 70 * t)},${Math.round(160 + 40 * t)},${0.30 + v * 0.55})`;
      ctx.fillRect(x, mid - bh, Math.max(1, bw - 1.2), bh * 2);
    }
    // 暖金高光带：与卦象边缘同色
    ctx.fillStyle = `rgba(${gold},0.22)`;
    ctx.fillRect(0, mid - 0.6, w, 1.2);
  }

  /** 画布按设备像素比重设 backing store，绘制坐标一律用 CSS 像素 */
  function resizeViz() {
    const canvas = $('#viz');
    if (!canvas) return null;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 358;
    const h = canvas.clientHeight || 150;
    vizCanvasW = w;                     // 供流线的归一化坐标换算使用
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  /* ===============================================================
   * 波形显示：风洞空间 + 立体卦体 + 体积雾气
   * ---------------------------------------------------------------
   * 空间层：一间精致的深色风洞 —— 尽头柔光池、透视格线地面、
   *   两侧墙灯、地面光池与暗角；灯光随音乐能量明灭。
   * 模型层：六爻为**圆角立体条**（顶面 / 正面 / 右端面三面光照 + 高光），
   *   机位固定不动（不猜着转），整体大小随低频鼓点包络起伏，
   *   停止后缓慢归位；阴阳爻形状差异极大，一眼可辨，动爻朱红高亮；
   *   地面上有接触阴影与一道淡淡的倒影。
   * 雾气层：声波不再是细线，而是一团团柔雾，从左向右流动，
   *   经过卦体时减速堆积、涨大扩散、被推向上下两侧绕行；
   *   主心音一色，每个叠加音层各按其专属颜色汇入 —— 开一层，
   *   就多一种颜色的雾。三阶段：渐入（雾随音乐成形）→ 流动 → 渐出。
   * 时序：播放中才发射新雾并推进；暂停则完全定格；停止后不再发射，
   *   已有雾团继续走完并渐隐，模型随之缓缓停下。
   * =============================================================== */

  /* ---------- 三维几何：固定机位（不旋转） ---------- */
  /* 机位由「方位角 yaw + 仰角 pitch」定义相机位置，再建立
     右/上/前三条基向量做标准 look-at 投影。
     好处：顶面、右端面、正面三面必然同时可见且法线朝向正确，
     不会出现「某个面翻到背面去」的破面，也不需要自转。

     取值原则（据参考图）：机位基本正对卦体 —— 方位角取极小值，
     使爻条在画面上保持水平、卦体左右对称，透视消失点正落在模型
     正后方的中轴上；立体感主要来自顶面与端面的明暗，而非强烈的斜切。 */
  const VIZ_YAW = 0.17;      // 方位角：略偏右 → 露出一线右端面（参考图的比例）
  const VIZ_PITCH = 0.26;    // 仰角：轻俯 → 露出一线顶面，不多不少
  const VIZ_PERSP = 0.0032;  // （房间透视强度用；卦体本身走正交，纹丝不歪）

  /* ---------- 一根爻的立体绘制（正交：绝不歪） ---------- */
  /**
   * 画一块金属爻板。**正交画法**：
   *   · 正面 = 水平矩形（绝对平直，绝不因透视被拉成梯形）
   *   · 顶面 = 沿景深方向偏移的平行四边形（偏移 = 深度 × sin(仰角/方位角)）
   *   · 右端面 = 同理，一片薄薄的侧棱
   * 立体感完全来自「三个面 + 光照」，不靠投影除法 ——
   * 此前用伪透视投影器，长爻沿长度方向被缩放，整座卦象看着是歪的。
   *
   * @param bar  {x0, x1, y}  段的世界 x 范围与世界 y（向上为正）
   * @param mirror 1 = 镜面地面上的倒影（沿 floorY 翻折）
   */
  function drawYao3D(ctx, geo, bar, energy, isMov, fade, mirror) {
    const s = geo.scale;
    const hx = (bar.x1 - bar.x0) / 2;
    const cx0 = (bar.x0 + bar.x1) / 2;          // 本段在卦体中的横向中心（世界 x）
    const hy = geo.hy, hz = geo.hz;
    const halfW = hx * s, halfH = hy * s;

    // 屏幕坐标：正面矩形
    let x0 = geo.cx + bar.x0 * s;
    let x1 = geo.cx + bar.x1 * s;
    let cy = geo.cy - bar.y * s;                // 世界 y 向上 → 屏幕 y 向下
    // 景深方向在屏幕上的偏移（背面相对正面）：上 + 左
    let ddx = -hz * Math.sin(VIZ_YAW) * s;
    let ddy = -hz * Math.sin(VIZ_PITCH) * s;
    if (mirror) { cy = 2 * geo.floorY - cy; ddy = -ddy; }

    const yTop = cy - halfH, yBot = cy + halfH;
    const bw = x1 - x0, bh = yBot - yTop;

    const base = isMov ? (geo.movRGB || [178, 58, 46]) : (geo.barRGB || [46, 74, 92]);
    const edge = geo.edgeRGB || (isMov ? [126, 38, 30] : [28, 48, 62]);
    const glow = Math.min(1, 0.30 + energy * 1.5 + (isMov ? 0.28 : 0));
    const lit = (k) => `rgba(${Math.round(Math.min(255, base[0] * k))},` +
      `${Math.round(Math.min(255, base[1] * k))},${Math.round(Math.min(255, base[2] * k))},${fade})`;

    /* 右端面（最暗，勾出厚度） */
    ctx.fillStyle = lit(0.22 + glow * 0.08);
    ctx.beginPath();
    ctx.moveTo(x1, yTop);
    ctx.lineTo(x1, yBot);
    ctx.lineTo(x1 + ddx, yBot + ddy);
    ctx.lineTo(x1 + ddx, yTop + ddy);
    ctx.closePath();
    ctx.fill();

    /* 顶面（受光面，最亮） */
    const gTop = ctx.createLinearGradient(x0, yTop, x1, yTop + ddy);
    gTop.addColorStop(0, lit(1.45 + glow * 0.32));
    gTop.addColorStop(0.55, lit(1.06 + glow * 0.20));
    gTop.addColorStop(1, lit(0.72 + glow * 0.10));
    ctx.fillStyle = gTop;
    ctx.beginPath();
    ctx.moveTo(x0, yTop);
    ctx.lineTo(x1, yTop);
    ctx.lineTo(x1 + ddx, yTop + ddy);
    ctx.lineTo(x0 + ddx, yTop + ddy);
    ctx.closePath();
    ctx.fill();

    /* 正面（主体）：竖向渐变，模拟金属面由上到下的明暗过渡 */
    const gFront = ctx.createLinearGradient(x0, yTop, x0 + bw * 0.30, yBot);
    gFront.addColorStop(0, lit(0.58 + glow * 0.22));
    gFront.addColorStop(0.22, lit(0.36 + glow * 0.13));
    gFront.addColorStop(0.66, lit(0.17 + glow * 0.07));
    gFront.addColorStop(1, lit(0.09 + glow * 0.04));
    ctx.fillStyle = gFront;
    ctx.fillRect(x0, yTop, bw, bh);

    /* 金属高光：一条窄而亮的镜面反光带（金属的高光是收紧的，不是漫反射） */
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, yTop, bw, bh);
    ctx.clip();

    /* 拉丝：金属表面的细密横向纹理（各向异性反射的来源） */
    const seed = Math.round(cy * 13 + hx * 7 + cx0 * 3);
    const STREAKS = 18;
    for (let i = 0; i < STREAKS; i++) {
      const yy = yTop + (bh * (i + 0.5)) / STREAKS + (vizHash(seed, i) - 0.5) * bh * 0.05;
      const a = (0.025 + vizHash(seed, i + 40) * 0.085) * fade;
      ctx.strokeStyle = vizHash(seed, i + 80) > 0.48
        ? `rgba(255,248,232,${a})`
        : `rgba(26,16,8,${a * 1.1})`;
      ctx.lineWidth = 0.5 + vizHash(seed, i + 120) * 1.2;
      ctx.beginPath();
      ctx.moveTo(x0 - 2, yy);
      ctx.lineTo(x1 + 2, yy);
      ctx.stroke();
    }

    /* 磨损：几道细划痕（金属用久了的样子） */
    for (let i = 0; i < 4; i++) {
      const sx = x0 + bw * (0.10 + vizHash(seed, 200 + i) * 0.80);
      const sy = yTop + bh * (0.16 + vizHash(seed, 220 + i) * 0.68);
      const len = bw * (0.04 + vizHash(seed, 240 + i) * 0.11);
      ctx.strokeStyle = `rgba(255,250,236,${(0.08 + vizHash(seed, 260 + i) * 0.15) * fade})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + len, sy - len * 0.16);
      ctx.stroke();
    }

    const ms = ctx.createLinearGradient(x0, yTop + bh * 0.10, x0 + bw * 0.62, yBot);
    ms.addColorStop(0, 'rgba(255,255,255,0)');
    ms.addColorStop(0.40, `rgba(255,246,228,${(0.04 + energy * 0.08) * fade})`);
    ms.addColorStop(0.52, `rgba(255,252,242,${(0.10 + energy * 0.13) * fade})`);
    ms.addColorStop(0.64, 'rgba(255,255,255,0)');
    ctx.fillStyle = ms;
    ctx.fillRect(x0 - 2, yTop - 2, bw + 4, bh + 4);
    // 底部反光（环境光反弹），进一步柔化
    const rf = ctx.createLinearGradient(0, yBot - bh * 0.42, 0, yBot);
    rf.addColorStop(0, 'rgba(255,250,240,0)');
    rf.addColorStop(1, `rgba(255,214,150,${0.14 * fade})`);
    ctx.fillStyle = rf;
    ctx.fillRect(x0 - 2, yTop - 2, bw + 4, bh + 4);
    ctx.restore();

    /* 倒角：上缘一条亮棱、下缘一条暗棱 —— 金属的边缘最抓光 */
    ctx.strokeStyle = `rgba(255,246,224,${(0.09 + energy * 0.10) * fade})`;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x0, yTop);
    ctx.lineTo(x1, yTop);
    ctx.stroke();
    ctx.strokeStyle = `rgba(10,6,3,${0.42 * fade})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x0, yBot);
    ctx.lineTo(x1, yBot);
    ctx.stroke();

    /* 边缘暖金自发光：先一层柔光，再一条细亮线（微弱、不刺眼） */
    const gold = geo.goldRGB || [255, 202, 132];
    const goldCss = `${gold[0]},${gold[1]},${gold[2]}`;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(${goldCss},${(0.035 + energy * 0.065) * fade})`;
    ctx.lineWidth = Math.max(2.2, bh * 0.38);
    ctx.beginPath();
    ctx.moveTo(x0, yBot - bh * 0.10);
    ctx.lineTo(x1, yBot - bh * 0.10);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = `rgba(${goldCss},${(0.15 + energy * 0.15) * fade})`;
    ctx.lineWidth = Math.max(0.7, bh * 0.075);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0 + 1, yBot - bh * 0.10);
    ctx.lineTo(x1 - 1, yBot - bh * 0.10);
    ctx.stroke();

    /* 描边：金属暗边，兼作边缘微光的收束 */
    ctx.strokeStyle = isMov
      ? `rgba(${Math.round(edge[0] * 1.4)},${Math.round(edge[1] * 1.4)},${Math.round(edge[2] * 1.4)},${0.55 * fade})`
      : `rgba(${edge[0]},${edge[1]},${edge[2]},${0.42 * fade})`;
    ctx.lineWidth = 0.9;
    ctx.strokeRect(x0, yTop, bw, bh);
  }


  /* ---------- 主绘制入口 ---------- */
  function drawViz() {
    const sized = resizeViz();
    if (!sized) return;
    const { ctx, w, h } = sized;
    const dt = vizDt();

    // 模型几何（供流线绕行取用）
    const geo = vizModelGeom(w, h);
    vizModel = geo;

    // 流线的发射 / 推进 / 排空（每帧一次，两种画法共用）
    const gf = updateFlows(dt);

    if (vizMode === 'silk' || vizMode === 'ripple') {
      // 纸色底 + 中心柔光（让立体模型落在纸上而非飘着）
      ctx.fillStyle = 'rgba(255,253,248,.55)';
      ctx.fillRect(0, 0, w, h);
      if (vizMode === 'silk') drawVizSilk(ctx, w, h);
      else drawVizRipple(ctx, w, h);
      drawStreamlines(ctx, w, h, gf);
    } else {
      drawVizHex3D(ctx, w, h, geo, gf, dt);
    }

    vizAdvance(dt);
  }

  /* ===============================================================
   * 风洞空间（深色三维背景）
   * ---------------------------------------------------------------
   * 像图片里那样：一间精致的深色风洞 —— 尽头有柔光池，
   * 地面是透视格线，两侧墙有灯带，模型立在地面上、带倒影，
   * 声波以「雾气」的形态在其中流动。灯光随音乐能量明灭。
   * =============================================================== */
  /**
   * 天花板筒灯：多组长条形冷白灯，向灭点收敛（越远越短越密）
   */
  function drawCeilingLights(ctx, w, h, vpx, lit) {
    const q = vizQ();
    const rows = 4;
    for (let i = 0; i < rows; i++) {
      const t = i / (rows - 1);                     // 0 最近，1 最远
      const y = h * (0.035 + t * 0.075);
      const len = w * (0.46 - t * 0.24);
      const th = Math.max(1.4, h * 0.013 * (1 - t * 0.5));
      const a = (0.52 - t * 0.26) * lit * q.ceiling;
      // 灯管辉光
      const g = ctx.createLinearGradient(vpx - len / 2, 0, vpx + len / 2, 0);
      g.addColorStop(0, 'rgba(198,224,255,0)');
      g.addColorStop(0.5, `rgba(198,224,255,${a * 0.30})`);
      g.addColorStop(1, 'rgba(198,224,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(vpx - len / 2, y - th * 2.6, len, th * 6.2);
      // 灯管本体
      const tube = ctx.createLinearGradient(0, y, 0, y + th);
      tube.addColorStop(0, `rgba(240,248,255,${a})`);
      tube.addColorStop(1, `rgba(206,226,248,${a * 0.5})`);
      ctx.fillStyle = tube;
      ctx.beginPath();
      ctx.roundRect(vpx - len / 2, y, len, th, th / 2);
      ctx.fill();
    }
  }

  /**
   * 圆形金属底座：卦象落座之处（深色金属盘 + 暖金内环）
   */
  function drawPedestal(ctx, geo) {
    const rx = geo.hx * geo.scale * 1.32;
    const ry = Math.max(3, rx * 0.21);
    const y = geo.baseY;
    const ph = geo.pedestalH;
    const gold = geo.goldRGB || [255, 202, 132];

    // 柱体侧面
    const side = ctx.createLinearGradient(0, y, 0, y + ph);
    side.addColorStop(0, 'rgba(44,50,60,.96)');
    side.addColorStop(1, 'rgba(13,16,21,.96)');
    ctx.fillStyle = side;
    ctx.beginPath();
    ctx.moveTo(geo.cx - rx, y);
    ctx.lineTo(geo.cx - rx, y + ph);
    ctx.ellipse(geo.cx, y + ph, rx, ry, 0, Math.PI, 0, true);
    ctx.lineTo(geo.cx + rx, y);
    ctx.closePath();
    ctx.fill();

    // 顶面（金属盘）
    const top = ctx.createLinearGradient(geo.cx - rx, y - ry, geo.cx + rx, y + ry);
    top.addColorStop(0, 'rgba(70,78,90,.96)');
    top.addColorStop(0.45, 'rgba(32,38,47,.96)');
    top.addColorStop(1, 'rgba(56,63,74,.96)');
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.ellipse(geo.cx, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // 顶面高光环
    ctx.strokeStyle = 'rgba(206,220,238,.26)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(geo.cx, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    // 暖金内环（与爻的边缘自发光呼应）
    const ga = 0.16 + Math.min(1, vizEnergy * 1.4 + vizBass * 0.6) * 0.22;
    ctx.strokeStyle = `rgba(${gold[0]},${gold[1]},${gold[2]},${ga})`;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(geo.cx, y, rx * 0.80, ry * 0.80, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawRoom3D(ctx, w, h, geo) {
    const energy = Math.min(1, vizEnergy * 1.4 + vizBass * 0.6);

    /* 基底：深蓝灰空间，上浅下深 */
    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#151f29');
    base.addColorStop(0.52, '#0e161f');
    base.addColorStop(1, '#070b11');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    // 灭点：落在中轴上，但高度取「卦象脚下略上方」——
    //   ① 于是地平线在模型底部附近（俯视广角该有的样子）；
    //   ② 灭点被卦体与底座挡住，看不见；
    //   ③ 地面辐线在靠近灭点处淡出，不会聚成一个显眼的点。
    const vpx = geo.cx;
    const vpy = Math.max(geo.cy - h * 0.04, geo.floorY - (h - geo.floorY) * 0.58);

    /* 尽头光池：模型背后的柔光（风洞尽头的灯） */
    const pool = ctx.createRadialGradient(vpx, vpy, 4, vpx, vpy, Math.max(w, h) * 0.72);
    pool.addColorStop(0, `rgba(96,140,180,${0.055 + energy * 0.05})`);
    pool.addColorStop(0.28, `rgba(86,124,158,${0.030 + energy * 0.03})`);
    pool.addColorStop(1, 'rgba(76,112,142,0)');
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, w, h);

    /* 地面：透视格线（纵向辐线由灭点散开 + 横向档线，越近越疏） */
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, vpy, w, h - vpy);
    ctx.clip();
    const fg = ctx.createLinearGradient(0, vpy, 0, h);
    fg.addColorStop(0, 'rgba(30,44,60,0)');
    fg.addColorStop(0.22, 'rgba(30,44,60,0.5)');
    fg.addColorStop(1, 'rgba(14,21,30,0.92)');
    ctx.fillStyle = fg;
    ctx.fillRect(0, vpy, w, h - vpy);

    ctx.lineWidth = 1;
    for (let i = -7; i <= 7; i++) {
      if (i === 0) continue;
      const ex = vpx + i * (w * 0.19);
      // 辐线自灭点淡出：只留下向观者散开的纵深，灭点本身看不见
      const ga = 0.030 + energy * 0.024;
      const lg = ctx.createLinearGradient(vpx, vpy, ex, h);
      lg.addColorStop(0, 'rgba(122,158,188,0)');
      lg.addColorStop(0.26, `rgba(122,158,188,${ga * 0.30})`);
      lg.addColorStop(1, `rgba(122,158,188,${ga})`);
      ctx.strokeStyle = lg;
      ctx.beginPath();
      ctx.moveTo(vpx, vpy);
      ctx.lineTo(ex, h + 6);
      ctx.stroke();
    }
    const RUNGS = 7;
    for (let i = 1; i <= RUNGS; i++) {
      const f = Math.pow(i / RUNGS, 2.1);
      const y = vpy + (h - vpy) * f;
      // 越近地平线越淡（广角近景：远处的地面细节被压平）
      const ga = (0.022 + 0.090 * f + energy * 0.030) * Math.min(1, f * 2.6);
      ctx.strokeStyle = `rgba(122,158,188,${ga})`;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();

    /* 两侧墙灯：沿灭点收敛的两列横向光带（像风洞壁上的灯） */
    const lit = 0.55 + energy * 0.45;
    for (let i = 0; i < 4; i++) {
      // 灯带沿墙面向灭点收缩：越远越靠近中轴、越窄
      const t = i / 3;
      const spread = 0.30 - t * 0.19;              // 距画面中心的比例
      const y = vpy - h * 0.16 * (1 - t) - h * 0.02;
      const ww = w * (0.052 - t * 0.026);
      const hh = Math.max(2.2, h * 0.013 * (1 - t * 0.4));
      [vpx - w * spread, vpx + w * spread].forEach((cx) => {
        const g = ctx.createLinearGradient(cx - ww / 2, 0, cx + ww / 2, 0);
        g.addColorStop(0, 'rgba(150,196,230,0)');
        g.addColorStop(0.5, `rgba(150,196,230,${(0.26 - t * 0.14) * lit})`);
        g.addColorStop(1, 'rgba(150,196,230,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - ww / 2, y, ww, hh);
      });
    }

    /* 地面光池：模型下方的两团椭圆光（灯打在地面的反照） */
    [vpx - w * 0.13, vpx + w * 0.13].forEach((cx, i) => {
      const r = w * (0.10 + i * 0.02);
      const gy = geo.floorY + (h - geo.floorY) * 0.42;
      const g = ctx.createRadialGradient(cx, gy, 2, cx, gy, r);
      g.addColorStop(0, `rgba(126,168,204,${0.13 * lit})`);
      g.addColorStop(1, 'rgba(126,168,204,0)');
      ctx.save();
      ctx.translate(cx, gy);
      ctx.scale(1, 0.30);
      ctx.translate(-cx, -gy);
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, gy - r, r * 2, r * 2);
      ctx.restore();
    });

    /* ---------- 两侧墙面的孔洞：烟雾自此喷出 ---------- */
    // 参考图：左右各一个发亮的竖长孔洞，雾从两侧涌入，在卦体处相遇。
    drawVents(ctx, w, h, geo, lit);

    /* ---------- 天花板筒灯 ---------- */
    drawCeilingLights(ctx, w, h, vpx, lit);

    /* ---------- 镜面地面：地平线亮线 + 竖向镜面反光带 ---------- */
    const q = vizQ();
    // 后墙与地面的交界：一道冷白细线
    const hz = ctx.createLinearGradient(0, vpy - 1, 0, vpy + 1.5);
    hz.addColorStop(0, 'rgba(190,214,240,0)');
    hz.addColorStop(0.5, `rgba(190,214,240,${0.20 * lit})`);
    hz.addColorStop(1, 'rgba(190,214,240,0)');
    ctx.fillStyle = hz;
    ctx.fillRect(0, vpy - 1, w, 2.5);
    // 镜面竖向反光带（天花板灯在地面上的倒影）
    const bandW = w * 0.16;
    const band = ctx.createLinearGradient(vpx - bandW, 0, vpx + bandW, 0);
    band.addColorStop(0, 'rgba(150,190,230,0)');
    band.addColorStop(0.5, `rgba(150,190,230,${0.07 * lit * q.reflect})`);
    band.addColorStop(1, 'rgba(150,190,230,0)');
    ctx.fillStyle = band;
    ctx.fillRect(vpx - bandW, vpy, bandW * 2, h - vpy);

    /* 暗角：把视线收回中心 */
    const vg = ctx.createRadialGradient(w / 2, h * 0.46, Math.min(w, h) * 0.34, w / 2, h * 0.46, Math.max(w, h) * 0.74);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.40)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  /**
   * 两侧墙面的出气孔洞
   * ---------------------------------------------------------------
   * 每侧一个竖长亮孔：孔内是强光，孔外有一圈辉光与一道向内的光锥，
   * 地上还留着孔光洒下的亮斑 —— 雾气即由此处喷出。
   */
  function drawVents(ctx, w, h, geo, lit) {
    const ports = vizPorts(w, h, geo);
    ports.l.dir = 1; ports.r.dir = -1;
    [ports.l, ports.r].forEach((v) => {
      const cx = v.x, cy = v.y;

      /* 孔外辉光 */
      const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, v.ry * 1.5);
      glow.addColorStop(0, `rgba(176,214,244,${0.20 * lit})`);
      glow.addColorStop(0.35, `rgba(140,182,220,${0.075 * lit})`);
      glow.addColorStop(1, 'rgba(120,164,204,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(cx - v.ry * 1.6, cy - v.ry * 1.6, v.ry * 3.2, v.ry * 3.2);

      /* 向内的光锥（体积光）：从孔口斜射向画面深处 */
      const coneLen = w * 0.52;
      const cone = ctx.createLinearGradient(cx, 0, cx + v.dir * coneLen, 0);
      cone.addColorStop(0, `rgba(196,226,250,${0.085 * lit})`);
      cone.addColorStop(0.3, `rgba(150,192,228,${0.030 * lit})`);
      cone.addColorStop(1, 'rgba(140,182,220,0)');
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy - v.ry * 0.92);
      ctx.lineTo(cx, cy + v.ry * 0.92);
      ctx.lineTo(cx + v.dir * coneLen, cy + v.ry * 1.35);
      ctx.lineTo(cx + v.dir * coneLen, cy - v.ry * 1.35);
      ctx.closePath();
      ctx.fillStyle = cone;
      ctx.fill();
      ctx.restore();

      /* 金属环：拉丝钢的环体（外圈暗、内缘亮） */
      const ringW = Math.max(3, v.rx * 0.30);
      const ring = ctx.createLinearGradient(cx - ringW, cy - v.ry, cx + ringW, cy + v.ry);
      ring.addColorStop(0, 'rgba(96,112,130,.92)');
      ring.addColorStop(0.35, 'rgba(48,58,72,.95)');
      ring.addColorStop(0.7, 'rgba(78,92,108,.9)');
      ring.addColorStop(1, 'rgba(26,32,42,.95)');
      ctx.save();
      ctx.lineWidth = ringW;
      ctx.strokeStyle = ring;
      ctx.beginPath();
      ctx.ellipse(cx, cy, v.rx + ringW / 2, v.ry + ringW / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      /* 环上的高光弧（上缘一条亮线，像被顶灯打亮） */
      ctx.lineWidth = Math.max(0.8, ringW * 0.28);
      ctx.strokeStyle = `rgba(226,240,255,${0.55 * lit})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, v.rx + ringW / 2, v.ry + ringW / 2, 0, Math.PI * 1.05, Math.PI * 1.85);
      ctx.stroke();
      ctx.restore();

      /* 孔内：强光核心 + 一点虹膜环 */
      const inner = ctx.createRadialGradient(cx, cy, 1, cx, cy, v.rx * 1.25);
      inner.addColorStop(0, `rgba(255,255,255,${0.98 * lit})`);
      inner.addColorStop(0.22, `rgba(222,240,255,${0.80 * lit})`);
      inner.addColorStop(0.62, `rgba(150,196,236,${0.34 * lit})`);
      inner.addColorStop(1, 'rgba(96,140,190,0)');
      ctx.fillStyle = inner;
      ctx.beginPath();
      ctx.ellipse(cx, cy, v.rx * 1.22, v.ry * 0.98, 0, 0, Math.PI * 2);
      ctx.fill();
      /* 虹膜：几道同心细弧，给出「机械舱门」的科技感 */
      ctx.save();
      ctx.strokeStyle = `rgba(255,255,255,${0.16 * lit})`;
      ctx.lineWidth = 1;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, v.rx * (0.30 + i * 0.24), v.ry * (0.22 + i * 0.24), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      /* 地上的孔光亮斑 */
      const gy = geo.floorY + (h - geo.floorY) * 0.30;
      const sx = cx + v.dir * w * 0.06;
      const spot = ctx.createRadialGradient(sx, gy, 2, sx, gy, w * 0.13);
      spot.addColorStop(0, `rgba(160,200,232,${0.18 * lit})`);
      spot.addColorStop(1, 'rgba(160,200,232,0)');
      ctx.save();
      ctx.translate(sx, gy);
      ctx.scale(1, 0.24);
      ctx.translate(-sx, -gy);
      ctx.fillStyle = spot;
      ctx.fillRect(sx - w * 0.13, gy - w * 0.13, w * 0.26, w * 0.26);
      ctx.restore();
    });
  }

  /** 模型落座处：地面上的柔光池（灯打在地面的反照）与一点接触暗影 */
  function drawFloorShadow(ctx, geo) {
    const rx = geo.hx * geo.scale * 1.5;
    const ry = Math.max(6, rx * 0.22);
    const cy = geo.floorY;
    ctx.save();
    ctx.translate(geo.cx, cy);
    ctx.scale(1, ry / rx);
    ctx.translate(-geo.cx, -cy);
    // 外圈：极淡的暗影，把模型「压」在地面上
    const sh = ctx.createRadialGradient(geo.cx, cy, 2, geo.cx, cy, rx * 1.15);
    sh.addColorStop(0, 'rgba(0,0,0,0.34)');
    sh.addColorStop(0.6, 'rgba(0,0,0,0.12)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(geo.cx - rx * 1.2, cy - rx * 1.2, rx * 2.4, rx * 2.4);
    // 内圈：冷色反照光（深色地面上唯一可见的「接地点」）
    const lit = 0.55 + Math.min(1, vizEnergy * 1.4 + vizBass * 0.6) * 0.45;
    const gl = ctx.createRadialGradient(geo.cx, cy, 2, geo.cx, cy, rx * 0.9);
    gl.addColorStop(0, `rgba(126,168,204,${0.13 * lit})`);
    gl.addColorStop(0.55, `rgba(126,168,204,${0.05 * lit})`);
    gl.addColorStop(1, 'rgba(126,168,204,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(geo.cx - rx, cy - rx, rx * 2, rx * 2);
    ctx.restore();
  }

  /** 地面倒影：把爻板沿镜面镜像一份，越远越淡 */
  function drawReflection(ctx, geo, data, moving) {
    const rows = geo.rows;
    const floorY = geo.floorY;         // 镜面地面线
    const modelH = (rows.length - 1) * geo.gap * geo.scale + geo.hy * geo.scale * 2;
    for (let i = rows.length - 1; i >= 0; i--) {
      const yang = rows[i] === 1;
      // 投影器里 +y 朝上（屏幕 y = cy - yv），故上爻取正、下爻取负，
      // 这样卦象才是「上爻在上」，与起卦栏的六爻图一致。
      const y = ((rows.length - 1) / 2 - i) * geo.gap;
      const isMov = moving.indexOf(rows.length - i) >= 0;
      const band = Math.floor((i / 6) * (data ? data.length * 0.62 : 1));
      let e = 0.16;
      if (data) {
        for (let k = 0; k < 7; k++) e += data[Math.min(data.length - 1, band + k * 3)];
        e = e / (7 * 255);
      }
      e = Math.min(1, e);
      // 该爻离地面的距离 → 倒影沉入地面多深 → 越深越淡
      const yScreen = geo.cy - y * geo.scale;
      const depth = Math.max(0, floorY - yScreen);
      const fade = 0.26 * Math.max(0.05, 1 - depth / Math.max(1, modelH * 0.95));
      if (fade < 0.012) continue;
      const segs = yang ? [[-geo.hx, geo.hx]] : [[-geo.hx, -13], [13, geo.hx]];
      segs.forEach(([x0, x1]) => {
        drawYao3D(ctx, geo, { x0, x1, y }, e, isMov, fade, 1);
      });
    }
  }

  function drawVizHex3D(ctx, w, h, geo, gf, dt) {
    const data = vizSpectrum();
    const hd = vizHexData();
    const rows = geo.rows, moving = hd.moving;
    /* 深色展厅：空间 → 底座 → 倒影 → 卦体 */
    drawRoom3D(ctx, w, h, geo);
    drawPedestal(ctx, geo);
    drawFloorShadow(ctx, geo);

    /* 镜面地面：模型暖光的倒影 */
    {
      const en = Math.min(1, vizEnergy * 1.4 + vizBass * 0.6);
      const rh = (h - geo.floorY) * 0.62;
      const rg = ctx.createLinearGradient(0, geo.floorY, 0, geo.floorY + rh);
      rg.addColorStop(0, `rgba(255,196,120,${0.085 * (0.4 + en)})`);
      rg.addColorStop(0.45, `rgba(255,176,104,${0.028 * (0.4 + en)})`);
      rg.addColorStop(1, 'rgba(255,170,96,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rg;
      ctx.fillRect(geo.cx - geo.hx * geo.scale * 1.1, geo.floorY, geo.hx * geo.scale * 2.2, rh);
      ctx.restore();
    }
    drawReflection(ctx, geo, data, moving);

    /* 丝缕系统：推进 → 地面雾影 → 后景丝缕 */
    filUpdate(dt, gf);
    filReflect(ctx, w, h, gf);
    filDraw(ctx, w, h, 'behind', gf);

    // 自下而上绘制：上方各爻的顶面才不会盖住下方爻身
    for (let i = rows.length - 1; i >= 0; i--) {
      const yang = rows[i] === 1;
      // 投影器里 +y 朝上（屏幕 y = cy - yv），故上爻取正、下爻取负，
      // 这样卦象才是「上爻在上」，与起卦栏的六爻图一致。
      const y = ((rows.length - 1) / 2 - i) * geo.gap;
      const isMov = moving.indexOf(rows.length - i) >= 0;   // rows 自上而下 → 爻位 rows.length - i

      // 各爻取不同频段：上爻高频、下爻低频
      const band = Math.floor((i / 6) * (data ? data.length * 0.62 : 1));
      let e = 0.16;
      if (data) {
        for (let k = 0; k < 7; k++) e += data[Math.min(data.length - 1, band + k * 3)];
        e = e / (7 * 255);
      }
      e = Math.min(1, e);

      const segs = yang ? [[-geo.hx, geo.hx]] : [[-geo.hx, -13], [13, geo.hx]];
      segs.forEach(([x0, x1]) => {
        drawYao3D(ctx, geo, { x0, x1, y }, e, isMov, 1, 0);
      });

      /* 动爻标记：右侧一枚朱红圆点，随鼓点点亮 */
      if (isMov) {
        const px = geo.cx + (geo.hx + 20) * geo.scale;
        const py = geo.cy - y * geo.scale;
        const pulse = 0.45 + 0.55 * Math.min(1, vizBass * 2.2 + 0.25);
        ctx.fillStyle = `rgba(232,120,96,${pulse})`;
        ctx.beginPath();
        ctx.arc(px, py, 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(232,120,96,${pulse * 0.22})`;
        ctx.beginPath();
        ctx.arc(px, py, 7.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /* 面前的雾 + 音层名标注 */
    filDraw(ctx, w, h, 'front', gf);

    /* 卦象的暖金辉光：光溢到四周的雾上（模型是这场景里的光源） */
    const energy2 = Math.min(1, vizEnergy * 1.4 + vizBass * 0.6);
    const bloomR = geo.hx * geo.scale * 2.8;
    const bloom = ctx.createRadialGradient(geo.cx, geo.cy, 4, geo.cx, geo.cy, bloomR);
    bloom.addColorStop(0, `rgba(255,198,124,${0.115 * (0.45 + energy2 * 0.75)})`);
    bloom.addColorStop(0.40, `rgba(255,172,104,${0.040 * (0.45 + energy2 * 0.75)})`);
    bloom.addColorStop(1, 'rgba(255,160,90,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = bloom;
    ctx.fillRect(geo.cx - bloomR, geo.cy - bloomR, bloomR * 2, bloomR * 2);
    ctx.restore();

    /* 镜头横向耀斑：模型高度上的一道水平光（科技感的一笔） */
    {
      const sw = w * 0.44;
      const sg = ctx.createLinearGradient(geo.cx - sw, 0, geo.cx + sw, 0);
      sg.addColorStop(0, 'rgba(255,224,186,0)');
      sg.addColorStop(0.5, `rgba(255,236,208,${0.085 * (0.4 + energy2)})`);
      sg.addColorStop(1, 'rgba(255,224,186,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = sg;
      ctx.fillRect(geo.cx - sw, geo.cy - 0.8, sw * 2, 1.6);
      ctx.fillStyle = sg;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(geo.cx - sw, geo.cy - 5, sw * 2, 10);
      ctx.restore();
    }

    filLabels(ctx, w, h, gf);
  }

  /** 模型尺寸与鼓点缩放（含圆形金属底座） */
  function vizModelGeom(w, h) {
    const rows = vizHexData().rows;
    vizCW = w; vizCH = h;
    const barH = 12, gap = 23;
    const totalH = (rows.length - 1) * gap + barH + 14;
    const scale = Math.min(w / 340, (h * 0.52) / totalH);
    // 鼓点缩放：播放中随低频起伏，停止后由 release 缓慢归位
    const s = scale * (1 + vizBass * 0.11 + vizEnergy * 0.035);
    const cy = h * 0.47;
    // 底座：卦象立于一枚圆形金属底座上；镜面地面在底座前缘
    const bottomEdge = cy + ((rows.length - 1) / 2) * gap * s + (barH / 2) * s;
    const pedestalH = Math.max(5, h * 0.032);
    const baseY = bottomEdge + 1;                 // 底座顶面（卦象落座处）
    const floorY = baseY + pedestalH;             // 镜面地面线
    // 供端到端测试读取真实几何（避免测试里写死常量而随改动腐化）
    window.__gxVizGeo = { scale: s, gap, cy, barH, rows: rows.length, floorY, baseY };
    return {
      cx: w * 0.5,
      cy,
      baseY,
      floorY,
      pedestalH,
      scale: s,
      // 卦象：厚实长方体，古铜金属；动爻偏朱，边缘自带暖金自发光
      hx: 62, hy: barH / 2, hz: 13, r: 2.2,
      gap, rows,
      barRGB: [140, 104, 66], movRGB: [180, 102, 68], edgeRGB: [18, 12, 8],
      goldRGB: [255, 202, 132]
    };
  }

  /* ---------- 模式二：丝弦波形（旧默认，保留） ---------- */
  function drawVizSilk(ctx, w, h) {
    const data = vizSpectrum();
    if (!data) {
      drawStaticWave(ctx, w, h);
      return;
    }
    const bars = 72;
    const step = Math.max(1, Math.floor(data.length / bars));
    const bw = w / bars;

    for (let i = 0; i < bars; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        const idx = i * step + j;
        if (idx < data.length) sum += data[idx];
      }
      const v = (sum / step) / 255;
      const bh = Math.max(2, v * h * 0.86);
      const x = i * bw;
      const y = (h - bh) / 2;

      const grad = ctx.createLinearGradient(0, y, 0, y + bh);
      grad.addColorStop(0, 'rgba(178,58,46,.75)');
      grad.addColorStop(1, 'rgba(178,58,46,.22)');
      ctx.fillStyle = grad;
      ctx.fillRect(x + 1, y, bw - 2, bh);
    }
  }

  /* ---------- 模式三：卦象涟漪 ---------- */
  function drawVizRipple(ctx, w, h) {
    vizSpectrum();
    const { rows, moving } = vizHexData();
    const cx = w * 0.5, cy = h * 0.52;
    const yangCount = rows.filter((y) => y === 1).length;
    const rings = 6;
    for (let i = 0; i < rings; i++) {
      const t = (vizT * 0.4 + i / rings) % 1;
      const rad = 16 + t * Math.min(w, h) * 0.44;
      const alpha = (1 - t) * (0.16 + vizEnergy * 0.5);
      const isMov = moving.indexOf(rings - i) >= 0;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.strokeStyle = isMov
        ? `rgba(178,58,46,${alpha})`
        : `rgba(46,74,92,${alpha})`;
      ctx.lineWidth = 1.4 + vizEnergy * 2.2;
      ctx.stroke();
    }
    // 卦心：阳爻数决定亮点数
    for (let i = 0; i < yangCount; i++) {
      const a = vizT * 0.8 + (i / yangCount) * Math.PI * 2;
      const r = 9 + Math.sin(vizT * 2 + i) * 2.4;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(178,58,46,.8)';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, 5.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(46,74,92,.85)';
    ctx.fill();
  }

  function drawStaticWave(ctx, w, h) {
    ctx.strokeStyle = 'rgba(138,129,117,.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 4) {
      const t = x / w;
      const y = h / 2 + Math.sin(t * Math.PI * 6) * h * 0.16 * Math.sin(t * Math.PI);
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  /* ===============================================================
   * 风洞流线的形状签名
   * ---------------------------------------------------------------
   * 主心音 core —— 取自实时频谱的柔和波形（见 flowSpecFn 缓存）
   * 其余每个音层一条**形状独特**的风线，即该层合成特征的「签名」：
   *   sol    疗愈正弦：极平滑的单频长起伏
   *   rain   雨声（高通噪）：细密碎纹 + 稀疏雨点尖峰
   *   birds  鸟鸣：长静默中的短促啾声脉冲
   *   fire   篝火（低通噪）：低频粗顿 + 偶发爆裂尖刺
   *   wind   风声（缓变带通）：宽幅慢呼吸波
   *   stream 溪流（带通）：中频连续细密波纹
   * =============================================================== */

  /** 确定性伪随机（同一参数恒得同一值，保证层线不跳变） */
  function layerHash01(n) {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  const LAYER_WAVE_STYLES = {
    core: {
      name: '心音', color: '40,74,96', fog: '112,162,206', kind: 'core',
      // 无频谱时（未播放/极静）的兜底形状：舒缓复合波
      fn: (p, t) =>
        Math.sin(p * Math.PI * 2 * 1.7 + t * 0.8) * 0.66 +
        Math.sin(p * Math.PI * 2 * 3.4 + t * 0.5) * 0.22
    },
    sol: {
      name: '疗愈', color: '124,92,168', fog: '158,124,206', kind: 'sine',
      fn: (p, t) =>
        Math.sin(p * Math.PI * 2 * 1.5 + t * 0.9) * 0.72 +
        Math.sin(p * Math.PI * 2 * 3.1 + t * 0.4) * 0.18
    },
    rain: {
      name: '雨声', color: '52,110,140', fog: '92,152,186', kind: 'rain',
      fn: (p, t) => {
        const grain = (layerHash01(p * 240 + Math.floor(t * 4) * 31) * 2 - 1) * 0.42;
        const hiss = Math.sin(p * Math.PI * 2 * 60 + t * 2.2) * 0.28;
        // 稀疏雨点：每七分之一段一记，确定性三角尖峰
        const cell = Math.floor(p * 7) + Math.floor(t * 0.6) * 7;
        const dp = ((p * 7 + Math.floor(t * 0.6) * 0.13) % 1);
        let drop = 0;
        if (dp < 0.06) {
          const u = dp < 0.03 ? dp / 0.03 : (0.06 - dp) / 0.03;
          drop = u * (0.55 + 0.45 * layerHash01(cell));
        }
        return grain + hiss + drop;
      }
    },
    birds: {
      name: '鸟鸣', color: '176,132,48', fog: '214,166,78', kind: 'birds',
      fn: (p, t) => {
        const seg = Math.floor(p * 4 + t * 0.35);
        const local = (p * 4 + t * 0.35) % 1;
        // 啾声窗口：每段一次短促颤音（上挑双峰），其余近静
        if (local > 0.18 && local < 0.30) {
          const u = (local - 0.18) / 0.12;
          return Math.sin(u * Math.PI) * Math.sin(u * Math.PI * 2.5)
            * (0.55 + 0.45 * layerHash01(seg + 7));
        }
        return (layerHash01(p * 60 + Math.floor(t * 8)) * 2 - 1) * 0.06;
      }
    },
    fire: {
      name: '篝火', color: '196,88,40', fog: '232,124,66', kind: 'fire',
      fn: (p, t) => {
        const low = Math.sign(Math.sin(p * Math.PI * 2 * 2.5 + t * 0.6)) * 0.42
          * (0.55 + 0.45 * Math.sin(t * 0.5 + p * 3));
        // 偶发爆裂：窄尖刺（正负皆可）
        const bp = (p * 5 + 0.3 + Math.floor(t * 0.7) * 0.21) % 1;
        let pop = 0;
        if (bp < 0.03) {
          const u = bp < 0.015 ? bp / 0.015 : (0.03 - bp) / 0.015;
          pop = u * (0.65 + 0.35 * layerHash01(Math.floor(p * 5) + 13))
            * (layerHash01(Math.floor(p * 5) + 29) > 0.5 ? 1 : -0.7);
        }
        return low + pop;
      }
    },
    wind: {
      name: '风声', color: '96,120,104', fog: '134,160,142', kind: 'wind',
      fn: (p, t) => {
        const swell = 0.5 + 0.5 * Math.sin(p * Math.PI * 2 * 1.1 + t * 0.33)
          * Math.sin(t * 0.21 + 1.3);
        return Math.sin(p * Math.PI * 2 * 3.5 + t * 0.45) * 0.6 * swell
          + (layerHash01(p * 40 + Math.floor(t * 0.5)) * 2 - 1) * 0.14 * swell;
      }
    },
    stream: {
      name: '溪流', color: '56,128,140', fog: '92,172,184', kind: 'stream',
      fn: (p, t) =>
        Math.sin(p * Math.PI * 2 * 8 + t * 1.05) * 0.5 +
        Math.sin(p * Math.PI * 2 * 21 + t * 1.6) * 0.24 +
        (layerHash01(p * 120 + Math.floor(t * 6)) * 2 - 1) * 0.2
    }
  };

  /** 层线的迷你静态版：供音层面板 chip 使用（与风洞流线同形状同色） */
  function layerWaveSpark(st) {
    const W = 40, H = 12, AMP = 2.6;
    let d = '';
    for (let i = 0; i <= 40; i++) {
      const p = i / 40;
      const y = H / 2 - st.fn(p, 0) * AMP;
      d += `${i === 0 ? 'M' : ' L'}${(p * W).toFixed(1)},${y.toFixed(2)}`;
    }
    return `<svg class="ac-wave" viewBox="0 0 ${W} ${H}" aria-hidden="true">` +
      `<path d="${d}" fill="none" stroke="rgb(${st.color})" ` +
      `stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  /** 当前开启的音层（顺序固定：疗愈在前，自然层按表序） */
  function activeLayerWaves() {
    const out = [];
    if (ambient.sol.on) {
      const st = LAYER_WAVE_STYLES.sol;
      out.push(Object.assign({}, st, { key: 'sol', name: `疗愈 ${ambient.sol.freq}Hz` }));
    }
    G.NATURE_LAYERS.forEach((l) => {
      if (ambient.nature[l.key]) {
        out.push(Object.assign({}, LAYER_WAVE_STYLES[l.key], { key: l.key, name: l.name }));
      }
    });
    return out;
  }

  /* ===============================================================
   * 风洞流线
   * ---------------------------------------------------------------
   * 状态机：
   *   playing —— 持续从左边缘发射新流线，已有流线向右推进；
   *   paused  —— 不发射、不推进，流线定格（音乐停则线停）；
   *   drain   —— 停止播放后进入：不再发射，已有流线继续向右走完，
   *              整体透明度随时间渐弱，走出右缘即销毁。
   * 每条流线绕过卦体时被「分流」：靠近模型中心的线被推向两侧，
   * 形成包裹模型的气流感，而不是横穿过去。
   * =============================================================== */

  const FLOW_SPAWN_MAIN = 0.095;   // 秒/条（主心音，基准值；实际由低频能量调节）
  const FLOW_SPAWN_LAYER = 0.27;   // 秒/条（每个叠加音层）
  const FLOW_MAX = 34;             // 同屏上限，防堆积（高清档）
  const FLOW_TAIL = 0.55;          // 线尾占比（相对自身长度）
  const FLOW_DRAIN_FADE = 1.6;     // 排空渐弱秒数
  const FLOW_INTRO = 2.0;          // 渐入秒数：雾气自两端缓缓浮现、汇聚

  /* 画质档：性能模式降粒子数与细节层，低配手机更稳 */
  const VIZ_QUALITY = {
    high: { max: 36, samples: 14, puff: [34, 24], spawn: 1.0, glow: 1.0, reflect: 1.0, ceiling: 1.0, fil: 820, filTrail: 7, filStep: 1 },
    perf: { max: 14, samples: 7, puff: [28, 18], spawn: 1.7, glow: 0.72, reflect: 0.55, ceiling: 0.6, fil: 190, filTrail: 6, filStep: 3 }
  };
  let vizQuality = 'high';
  function vizQ() { return VIZ_QUALITY[vizQuality] || VIZ_QUALITY.high; }

  let flowLines = [];
  let flowClock = 0;
  let flowMode = 'idle';           // idle | playing | paused | drain
  let flowDrainT = 0;
  let flowIntro = 0;               // 渐入进度 0..1（音乐起了雾才现）
  let flowBands = [];              // 各流的发射计时
  let vizModel = null;             // 当前模型几何（供绕行计算）
  let vizCW = 0, vizCH = 0;        // 画布尺寸（丝缕系统用）
  let vizBass = 0;                 // 低频鼓点包络
  let vizLastT = 0;
  let vizCanvasW = 0;              // 画布 CSS 宽度（归一化坐标换算用）

  /** 帧间隔（秒），首帧兜底 1/60 */
  function vizDt() {
    const now = (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
    const dt = vizLastT ? Math.min(0.05, (now - vizLastT) / 1000) : 1 / 60;
    vizLastT = now;
    return dt;
  }

  /** 播放/停止时切换流线状态机 */
  function setFlowState(mode) {
    if (mode === 'playing') {
      if (flowMode !== 'playing') flowBands = [];
      flowMode = 'playing';
      flowDrainT = 0;
    } else if (mode === 'paused') {
      flowMode = 'paused';
    } else {
      // drain：停止后已有流线走完
      if (flowMode === 'playing') {
        flowMode = 'drain';
        flowDrainT = FLOW_DRAIN_FADE;
      } else if (flowMode === 'idle') {
        flowMode = 'idle';
      }
    }
  }

  /** 生成一条流线（雾团）。kind: 'main' 或音层 key；dir: 1 自左孔喷出，-1 自右孔 */
  function spawnFlow(kind, dir) {
    const q = vizQ();
    if (flowLines.length >= q.max) return;
    const isMain = kind === 'main';
    const st = isMain ? LAYER_WAVE_STYLES.core : LAYER_WAVE_STYLES[kind];
    // 主线：抓一份当前频谱快照，让流线形状就是此刻音乐的样子
    const spec = isMain ? vizSpecSnapshot() : null;
    flowLines.push({
      kind,
      st,
      spec,
      color: st.color,
      dir: dir || 1,                       // 喷射方向
      fade: 1,                             // 个体淡出系数（渐入结束时收掉汇聚流）
      // 出生在孔洞之外，头部已推进一小段避免「凭空出现」
      x: -0.10 - Math.random() * 0.06,
      len: isMain ? 0.68 + Math.random() * 0.18 : 0.48 + Math.random() * 0.16,
      speed: (isMain ? 0.34 : 0.40) + Math.random() * (isMain ? 0.12 : 0.16),
      // 轨道：以卦体高度为中心铺开（不铺满整幅画面），
      // 雾便聚在卦体上下，像一团体积气体而非四散的烟
      lane: ((Math.random() + Math.random() + Math.random()) / 3 - 0.5) * 1.75,
      phase: Math.random() * 6.283,
      amp: isMain ? 1 : 0.85,
      born: vizT,
      // 雾团属性：前后景深度（负在模型后）、雾团大小、个体摆动
      z: (Math.random() * 2 - 1),
      puff: q.puff[0] + Math.random() * q.puff[1],
      wob: Math.random() * 6.283
    });
  }

  /** 出气方向
   *  ---------------------------------------------------------------
   * 渐入阶段：左右两端都出雾，向中心卦象缓缓汇聚；
   * 进行中：主雾流自左向右穿过卦象（规格如此），右孔只作光源。
   */
  let flowDirFlip = {};
  function nextFlowDir(key) {
    if (flowIntro >= 1) return 1;                 // 进行中：只自左向右
    const cur = flowDirFlip[key] === undefined ? 1 : flowDirFlip[key];
    flowDirFlip[key] = -cur;
    return cur;
  }

  /** 雾团头部在屏幕上的横坐标（按喷射方向换算） */
  function flowHeadX(line, w) {
    return (line.dir > 0 ? line.x : 1 - line.x) * w;
  }

  /** 雾团尾部（尾迹在身后，即喷射方向的反侧） */
  function flowTailX(line, w) {
    return (line.dir > 0 ? line.x - line.len : 1 - line.x + line.len) * w;
  }

  /** 当前频谱快照（归一化到 -1..1 的波形序列），供主心音流线取形 */
  function vizSpecSnapshot() {
    const analyser = player.analyser;
    const N = 64;
    if (!analyser) {
      // 无音频：给一条温和的静态波形，便于预览形态
      const out = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const p = i / N;
        out[i] = (Math.sin(p * Math.PI * 2 * 1.7) * 0.66 +
          Math.sin(p * Math.PI * 2 * 3.4) * 0.22);
      }
      return out;
    }
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    // 取前 N 个有效频段（音乐主体所在区间），映射为波形
    const usable = Math.max(N, Math.floor(data.length * 0.55));
    const out = new Float32Array(N);
    let max = 1;
    for (let i = 0; i < N; i++) {
      const idx = Math.floor((i / N) * usable);
      out[i] = data[idx] / 255;
      if (out[i] > max) max = out[i];
    }
    // 以包络正弦塑形：低频重、高频轻，接近听感
    for (let i = 0; i < N; i++) {
      const p = i / N;
      const env = 0.42 + 0.58 * Math.pow(1 - p, 0.8);
      const carve = Math.sin(p * Math.PI * 2 * 1.3 + 0.7) * 0.22;
      out[i] = Math.max(-1, Math.min(1, ((out[i] / max) * env - carve) * 1.15));
    }
    return out;
  }

  /** 推进流线时间与鼓点包络 */
  function vizAdvance(dt) {
    // 相位只在播放中推进：暂停/停止时线条完全定格
    if (flowMode === 'playing') vizT += dt;
    // 供端到端测试读取当前流线状态
    window.__gxFlowMode = flowMode;
    window.__gxFlowKinds = flowLines.map((l) => l.kind);
    // 供端到端测试读取丝缕系统状态
    window.__gxFil = () => ({
      n: filParts.length,
      intro: flowIntro,
      sample: filParts.length ? {
        x: Math.round(filParts[0].x), y: Math.round(filParts[0].y),
        z: +filParts[0].z.toFixed(2), trail: filParts[0].trail.length
      } : null
    });
    window.__gxFilXs = () => filParts.map((p) => p.x);
    // 鼓点包络：低频能量上升快、回落慢 —— 停止后缓缓停下
    const target = vizBassTarget;
    const k = target > vizBass
      ? 1 - Math.pow(0.001, dt / 0.045)
      : 1 - Math.pow(0.001, dt / 0.42);
    vizBass += (target - vizBass) * k;
  }

  /** 流线在某屏幕横坐标处的纵坐标：基础轨道 + 绕行 + 波形 */
  function flowYAt(line, px, w, h) {
    const geo = vizModel;
    const t = px / w;                                  // 0..1 沿画面横向
    // 基础轨道：lane ∈ [-1.25, 1.25] 铺满并溢出画面高度
    let y = h * 0.5 + line.lane * (h * 0.5) * 0.86;

      // 绕行：模型所在处，流被推向上下两侧，形成包裹感
    if (geo) {
      const halfW = geo.hx * geo.scale * 1.5;
      const gx0 = geo.cx - halfW, gx1 = geo.cx + halfW;
      // 前缘平缓进入，后缘平缓回归，形成流被「分开—合拢」的形态
      const u = (px - gx0) / Math.max(1, gx1 - gx0);
      const inSpan = smooth01(Math.min(1, Math.max(0, u))) * smooth01(Math.min(1, Math.max(0, 1 - u) * 1.15));
      if (inSpan > 0.001) {
        const halfH = Math.max(12, geo.gap * (geo.rows.length - 1) * geo.scale * 0.5 + 10);
        const dir = line.lane >= 0 ? 1 : -1;
        // 推力恰好把流送到模型上下边缘之外 —— 于是气流是「绕过」卦体，
        // 而不是从爻条中间穿过去；越靠外的流本就离得远，推得越少。
        // wrap 给每条流一点个体差，避免所有雾挤在同两条线上。
        const wrap = 0.82 + (line.wob % 1) * 0.5;
        // 音量越大，撞到卦爻的扰动越强（规格：扰动强度随音量）
        const disturb = 0.55 + 0.95 * vizLevel;
        const reach = Math.max(0, (halfH + 20 - Math.abs(line.lane) * (h * 0.5) * 0.72) * wrap) * disturb;
        y += dir * reach * inSpan;
        // 绕行段振幅收敛 → 流贴着模型表面走，「包裹」更明显
        y += Math.sin(t * Math.PI * 2.6 + line.phase) * line.amp * inSpan * halfH * 0.10;
        // 高频 → 细碎湍流：撞散时抖得更碎
        y += Math.sin(t * Math.PI * 2 * (14 + 18 * vizHigh) + line.phase * 5.1)
          * vizHigh * 3.0 * inSpan;
      }
    }

    // 本层签名波形（主线用出生时的频谱快照，音层用各自形状）
    const lp = (t * line.len + line.phase * 0.13) % 1;
    let wave;
    if (line.spec) {
      const n = line.spec.length;
      const f = lp * (n - 1);
      const i0 = Math.floor(f), fr = f - i0;
      const i1 = Math.min(n - 1, i0 + 1);
      wave = line.spec[i0] * (1 - fr) + line.spec[i1] * fr;
    } else {
      wave = line.st.fn(lp, vizT * 1.6 + line.phase);
    }
    const waveAmp = (h * 0.052) * line.amp * (0.6 + vizEnergy * 1.0);
    y += wave * waveAmp;
    return y;
  }

  function smooth01(t) {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
  }

  /**
   * 发射 / 推进 / 排空（每帧一次，线与雾两种画法共用）
   * @returns {number} globalFade —— 排空渐弱系数（1 = 正常）
   */
  function updateFlows(dt) {
    const playing = flowMode === 'playing';
    const layers = activeLayerWaves();
    const q = vizQ();

    /* ---------- 阶段一：渐入（云雾自两端浮现、缓缓向中心汇聚） ---------- */
    const wasIntro = flowIntro < 1;
    if (flowMode === 'playing') flowIntro = Math.min(1, flowIntro + dt / FLOW_INTRO);
    else if (flowMode === 'drain') flowIntro = Math.max(0, flowIntro - dt / 0.6);
    // 渐入结束：自右向左的汇聚流淡出，交由「自左向右穿过卦象」的主流接管
    if (wasIntro && flowIntro >= 1) {
      flowLines.forEach((l) => { if (l.dir < 0) l.fadeOut = true; });
    }

    if (playing) {
      flowClock += dt;
      // 低频能量越大，雾气生成越快（规格：低频控制生成速度）
      const rateK = (0.55 + 1.45 * vizLow) * q.spawn;
      // 首次进入播放：立刻发一条，避免按下播放后画面空一拍
      if (!flowBands.length) {
        spawnFlow('main', nextFlowDir('main'));
        flowBands.push({ key: 'main', acc: FLOW_SPAWN_MAIN / rateK });
        layers.forEach((l) => flowBands.push({ key: l.key, acc: FLOW_SPAWN_LAYER * 0.6 / rateK }));
      }
      // 按各自节奏发射（低频越强越密）
      flowBands = flowBands.filter((b) => {
        if (b.key !== 'main' && !layers.some((l) => l.key === b.key)) return false;
        b.acc -= dt;
        if (b.acc <= 0) {
          spawnFlow(b.key, nextFlowDir(b.key));
          b.acc = (b.key === 'main' ? FLOW_SPAWN_MAIN : FLOW_SPAWN_LAYER) / rateK;
        }
        return true;
      });
      // 新开启的音层立刻补一条，从它那一侧的孔洞加入
      layers.forEach((l) => {
        if (!flowBands.some((b) => b.key === l.key)) {
          spawnFlow(l.key, nextFlowDir(l.key));
          flowBands.push({ key: l.key, acc: FLOW_SPAWN_LAYER / rateK });
        }
      });
    }

    /* ---------- 阶段三：渐出（粒子衰减消散、向两侧飘走） ---------- */
    let globalFade = 1;
    if (flowMode === 'drain') {
      flowDrainT -= dt;
      globalFade = Math.max(0, flowDrainT / FLOW_DRAIN_FADE);
      if (flowDrainT <= 0) flowLines = [];
    }

    // 推进（播放或排空时才走；暂停则定格）。靠近模型处减速 —— 雾会先在
    // 卦体前方堆起来，再被推向两侧，像真的被物体撞开一样。
    const geo = vizModel;
    let cxN = 0.5, halfN = 0;
    if (geo && vizCanvasW > 0) {
      cxN = geo.cx / vizCanvasW;
      halfN = (geo.hx * geo.scale * 1.5) / vizCanvasW;
    }
    // 音量越大流速越快（规格）；渐入阶段更慢，让雾缓缓汇聚
    const speedK = (0.55 + 0.95 * vizLevel) * (flowIntro < 1 ? 0.55 : 1);
    for (let i = flowLines.length - 1; i >= 0; i--) {
      const line = flowLines[i];
      if (flowMode === 'playing' || flowMode === 'drain') {
        let slow = 1;
        if (geo && flowMode === 'playing' && line.x > cxN - halfN && line.x < cxN + halfN) slow = 0.85;
        // 渐出时加速飘向边缘
        const drift = flowMode === 'drain' ? 1.5 : 1;
        line.x += line.speed * dt * slow * speedK * drift;
      }
      // 个体淡出（渐入结束时的汇聚流收尾）
      if (line.fadeOut) {
        line.fade = (line.fade === undefined ? 1 : line.fade) - dt * 1.4;
        if (line.fade <= 0) { flowLines.splice(i, 1); continue; }
      }
      if (line.x - line.len > 1.04) { flowLines.splice(i, 1); }
    }

    return globalFade;
  }

  /** 绘制丝弦/涟漪模式下的细流线（纸面风格） */
  function drawStreamlines(ctx, w, h, globalFade) {
    const playing = flowMode === 'playing';

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = flowLines.length - 1; i >= 0; i--) {
      const line = flowLines[i];
      // 头部位置（线尾在身后 len 处）
      const headX = flowHeadX(line, w);
      const tailX = flowTailX(line, w);
      if (headX < -4 || headX > w + 4) continue;

      const N = 42;
      const isMain = line.kind === 'main';
      const pts = [];
      for (let k = 0; k <= N; k++) {
        const px = tailX + (headX - tailX) * (k / N);
        if (px < -6 || px > w + 6) continue;
        pts.push([px, flowYAt(line, px, w, h)]);
      }
      if (pts.length < 2) continue;

      // 头亮尾淡：像烟线被气流拉长（尾部完全透明，融进纸色）
      const grad = ctx.createLinearGradient(tailX, 0, headX, 0);
      const a1 = (0.56 + vizEnergy * 0.34) * globalFade;
      grad.addColorStop(0, `rgba(${line.color},0)`);
      grad.addColorStop(Math.min(0.999, FLOW_TAIL), `rgba(${line.color},0)`);
      grad.addColorStop(Math.min(0.999, FLOW_TAIL + 0.18), `rgba(${line.color},${a1 * 0.72})`);
      grad.addColorStop(1, `rgba(${line.color},${a1})`);

      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
      ctx.strokeStyle = grad;
      ctx.lineWidth = isMain ? (1.8 + vizEnergy * 2.4) : (1.3 + vizEnergy * 1.5);
      ctx.stroke();

      // 头部亮点：让流线有明确的「来处」
      if (playing && isMain) {
        const head = pts[pts.length - 1];
        ctx.fillStyle = `rgba(${line.color},${0.5 * globalFade})`;
        ctx.beginPath();
        ctx.arc(head[0], head[1], 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 音层名字标注：贴在各自流线的头部，暂停时定格不消失
    if (globalFade > 0.05) {
      ctx.font = '600 9.5px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      flowLines.forEach((line) => {
        if (line.kind === 'main') return;
        const headX = flowHeadX(line, w);
        if (headX < 16 || headX > w - 16) return;
        const y = flowYAt(line, headX, w, h);
        if (y < 9 || y > h - 5) return;
        // 圆角底衬，保证任何背景下都读得清
        const tw = ctx.measureText(line.st.name).width;
        ctx.fillStyle = `rgba(255,253,248,${0.72 * globalFade})`;
        ctx.beginPath();
        ctx.roundRect(headX - tw / 2 - 3, y - 8, tw + 6, 11, 3);
        ctx.fill();
        ctx.fillStyle = `rgba(${line.color},${0.95 * globalFade})`;
        ctx.fillText(line.st.name, headX, y - 2.5);
      });
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  /* ===============================================================
   * 体积雾气（风洞空间的声波形态）
   * ---------------------------------------------------------------
   * 不再是细线，而是一团团柔雾：每条流由尾至头串起若干雾团，
   * 以 'lighter' 叠加 —— 重叠处自然变亮变厚，像真的气雾。
   * 经过卦体时：速度放慢（碰撞堆积）、雾团涨大（扩散）、被推向两侧（绕行）。
   * 音层各按其专属颜色成雾：开一层，就多一种颜色的雾汇入。
   * 三阶段与参考图一致：渐入（雾随音乐成形）→ 流动 → 渐出（排空渐弱）。
   * =============================================================== */

  /* ===============================================================
   * 声波云雾 · 丝缕系统（方案 B：湍流丝缕）
   * ---------------------------------------------------------------
   * 一比一照参考图的做法：
   *   · 雾自左右两侧的金属气口涌入（气口本身建模：环 + 内芯 + 光锥 + 地照）
   *   · 粒子被「旋度噪声场」推动，拉成一条条细丝（拖尾折线）
   *   · 靠近卦象时被切向力推着绕行，两股雾在卦象处相遇，汇成蝴蝶结
   *   · 颜色：外层冰白（体积雾），内核暖金（近卦象、受光处）
   *   · 镜面地面有雾的倒影
   * 丝 = 两次描边：宽而淡的辉光（体积感）+ 细而亮的芯（丝感）。
   * =============================================================== */

  let filParts = [];          // 丝缕粒子
  let filAcc = 0;             // 生成累加器
  let filT = 0;               // 湍流场时间
  let filAdapt = 1;           // 自适应系数：帧率吃紧就减丝，流畅就拉满
  let filFrameAcc = 0, filFrameN = 0;

  /* ---- 值噪声 / fbm（湍流场） ---- */
  function vizHash(x, y) {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return n - Math.floor(n);
  }
  function vizNoise2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = vizHash(xi, yi), b = vizHash(xi + 1, yi);
    const c = vizHash(xi, yi + 1), d = vizHash(xi + 1, yi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  function vizFbm(x, y, oct) {
    let s = 0, amp = 0.5, f = 1;
    for (let i = 0; i < (oct || 3); i++) { s += amp * vizNoise2(x * f, y * f); f *= 2.03; amp *= 0.5; }
    return s;
  }

  /**
   * 左右气口的几何
   * 竖长椭圆孔洞，贴左右画面边缘（大半在画外），雾由此涌入。
   */
  function vizPorts(w, h, geo) {
    const R = Math.min(h * 0.34, 132);
    const cy = geo.cy;
    return {
      R,
      l: { x: -R * 0.26, y: cy, rx: R * 0.44, ry: R * 1.00, dir: 1 },
      r: { x: w + R * 0.26, y: cy, rx: R * 0.44, ry: R * 1.00, dir: -1 }
    };
  }

  /** 生成一条丝缕 */
  function filSpawn(w, h, geo, kind, st) {
    const ports = vizPorts(w, h, geo);
    const fromLeft = Math.random() < 0.5;
    const p0 = fromLeft ? ports.l : ports.r;
    const a = (Math.random() - 0.5) * 2.2;          // 椭圆内散布
    const rr = Math.sqrt(Math.random());
    filParts.push({
      x: p0.x + Math.cos(a) * p0.rx * rr,
      y: p0.y + Math.sin(a) * p0.ry * rr,
      // lane：这条丝在羽流里的位置（-1 下缘 … +1 上缘），全程不变 ——
      // 参考图里那股羽流自两侧涌入、在卦象处收腰分瓣，靠的就是这个固定的「轨道位」。
      lane: (Math.random() * 2 - 1),
      spread: h * 0.33 * (0.82 + Math.random() * 0.36),
      z: (Math.random() * 2 - 1) * 0.85,           // 深度：负在后景
      dir: fromLeft ? 1 : -1,                       // 推进方向（向右为 1）
      swirl: Math.random() < 0.5 ? 1 : -1,          // 绕行方向：上绕 / 下绕
      age: 0,
      life: 190 + Math.random() * 240,
      w: 0.4 + Math.random() * 0.85,               // 粗细权重
      gold: Math.random() * 0.42,                   // 暖金倾向
      kind, st,
      trail: []
    });
  }

  /**
   * 丝缕系统的推进：生成 + 湍流平流 + 绕行 + 深度投影
   */
  function filUpdate(dt, gf) {
    const geo = vizModel;
    if (!geo) return;
    const q = vizQ();
    const w = vizCW, h = vizCH;
    if (!w || !h) return;
    filT += dt;
    const k = dt / 0.0167;            // dt 单位是秒 → 折算成「帧倍数」

    /* 帧率自适应：连续 30 帧的平均耗时决定丝的数量上限 */
    filFrameAcc += dt; filFrameN++;
    if (filFrameN >= 30) {
      const avg = filFrameAcc / filFrameN;
      if (avg > 0.034) filAdapt = Math.max(0.34, filAdapt * 0.86);
      else if (avg < 0.020) filAdapt = Math.min(1, filAdapt * 1.06);
      filFrameAcc = 0; filFrameN = 0;
    }
    const filCap = Math.max(40, Math.floor(q.fil * filAdapt));

    /* 生成：演奏中按能量补充；停止后不再生成（余雾自行散尽） */
    if (flowMode === 'playing' && flowIntro > 0.02) {
      const layers = activeLayerWaves();
      filAcc += k * (filCap / 190) * (0.42 + 0.78 * vizLevel) * flowIntro;
      let guard = 0;
      while (filAcc >= 1 && guard++ < 60) {
        filAcc -= 1;
        if (filParts.length >= filCap) break;
        if (layers.length && Math.random() < 0.42) {
          const st = layers[(Math.random() * layers.length) | 0];
          filSpawn(w, h, geo, st.key, st);
        } else {
          filSpawn(w, h, geo, 'main', LAYER_WAVE_STYLES.core);
        }
      }
    }

    /* 平流：主流 + 切向绕行 + 旋度噪声湍流 + 卦象排斥 + 中轴收束 */
    const F = 0.0052, E = 2.0;
    const mcx = geo.cx, mcy = geo.cy;
    const halfW = geo.hx * geo.scale * 1.55;
    const modelHalfH = (geo.gap * (geo.rows.length - 1) * geo.scale * 0.5) + geo.hy * geo.scale + 10;
    const tOff = filT * 0.0011;
    const turbK = 0.55 + vizHigh * 0.85;

    for (let i = filParts.length - 1; i >= 0; i--) {
      const p = filParts[i];
      p.age++;
      if (p.age > p.life || p.x < -w * 0.4 || p.x > w * 1.4) { filParts.splice(i, 1); continue; }

      const dx = p.x - mcx, dy = p.y - mcy;
      const dist = Math.hypot(dx, dy) + 1;
      const tanX = -dy / dist, tanY = dx / dist;
      const near = Math.max(0, 1 - dist / (w * 0.40));

      /* ---- 目标轨道：宽羽流 → 卦象处收腰 → 贴着卦体上下缘走 ---- */
      const waist = Math.exp(-Math.pow((p.x - mcx) / (w * 0.30), 2));   // 1 = 中心
      const inner = modelHalfH * 0.94;                                 // 卦体外缘
      const outer = inner + Math.max(0, p.spread - inner) * (1 - waist);
      const off = inner + (outer - inner) * Math.abs(p.lane);
      const yT = mcy + (p.lane >= 0 ? -off : off);

      // 主流：向对侧推进
      let vx = p.dir * (1.9 + vizLevel * 2.4);
      // 弹性回归轨道（形由轨道定，湍流只做质感）
      let vy = (yT - p.y) * 0.062;

      // 切向绕行：靠近卦象时被推开，形成包裹感
      const swirl = near * near * 1.15 * p.swirl;
      vx += tanX * swirl;
      vy += tanY * swirl * 0.5;

      // 湍流：旋度噪声（无散度 → 自然的卷曲与分叉）
      const n0 = vizFbm(p.x * F, p.y * F + tOff, 3);
      const nx = vizFbm((p.x + E) * F, p.y * F + tOff, 3);
      const ny = vizFbm(p.x * F, (p.y + E) * F + tOff, 3);
      let cx = (ny - n0) / E * 900;
      let cy = -(nx - n0) / E * 900;
      cx = Math.max(-2.4, Math.min(2.4, cx));
      cy = Math.max(-2.4, Math.min(2.4, cy));
      vx += cx * turbK * 1.05;
      vy += cy * turbK * 1.05;

      p.x += vx * k;
      p.y += vy * k;
      p.z += (Math.random() - 0.5) * 0.016 + p.dir * 0.0018;

      // 深度投影：越远越向灭点收、体积越小
      const ps = 1 / (1 + p.z * 0.11);
      p.trail.push(mcx + (p.x - mcx) * ps, mcy + (p.y - mcy) * ps);
      const maxTrail = q.filTrail * 2;
      if (p.trail.length > maxTrail) p.trail.splice(0, 2);
    }
  }

  /**
   * 绘制丝缕
   * ---------------------------------------------------------------
   * 两层结构（这是「体积感」的关键）：
   *   · 辉光层：所有丝缕的宽描边画进离屏画布，再**整层做一次高斯模糊**后叠上来
   *     —— 这一层提供烟的柔软体积与空气感（一次性模糊，比逐条模糊便宜得多）
   *   · 芯层：细而亮的描边直接画在主画布上，保持丝缕的锐利与结构
   * @param {string} pass 'behind'（模型之后）| 'front'（模型之前）
   */
  let fogCvB = null, fogCvF = null;      // 离屏辉光层
  function fogLayer(w, h, back) {
    const key = back ? 'fogCvB' : 'fogCvF';
    let cv = back ? fogCvB : fogCvF;
    const scale = vizQuality === 'perf' ? 0.5 : 1;     // 性能档降分辨率
    const tw = Math.max(2, Math.round(w * scale));
    const th = Math.max(2, Math.round(h * scale));
    if (!cv) { cv = document.createElement('canvas'); if (back) fogCvB = cv; else fogCvF = cv; }
    if (cv.width !== tw || cv.height !== th) { cv.width = tw; cv.height = th; }
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, tw, th);
    g.setTransform(scale, 0, 0, scale, 0, 0);
    return g;
  }

  function filDraw(ctx, w, h, pass, globalFade) {
    const fade = globalFade * flowIntro;
    if (fade <= 0.012 || !filParts.length) return;
    if (window.__gxNoFog) return;          // 调试开关
    const geo = vizModel;
    if (!geo) return;
    const q = vizQ();
    const level = Math.min(1, vizLevel);
    const back = pass === 'behind';

    /* ---- 辉光层：画进离屏画布 ---- */
    const g = fogLayer(w, h, back);
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const cores = [];
    for (let i = 0; i < filParts.length; i++) {
      const p = filParts[i];
      const isBack = p.z < 0;
      if (isBack !== back) continue;
      const t = p.trail;
      if (t.length < 4) continue;

      const fadeIn = Math.min(1, p.age / 20);
      const fadeOut = Math.min(1, (p.life - p.age) / 45);
      // 近模型程度 → 暖金内核；远 → 冰白体积雾
      const near = Math.max(0, 1 - Math.hypot(p.x - geo.cx, p.y - geo.cy) / (geo.hx * geo.scale * 2.8));
      const gAmt = Math.max(0, Math.min(1, near * near * 1.5 + p.gold * 0.20));
      const r = Math.round(198 + gAmt * 57);
      const gg = Math.round(232 - gAmt * 46);
      const b = Math.round(255 - gAmt * 140);
      const depthK = isBack ? 0.34 : 1;
      const a = fade * fadeIn * fadeOut * depthK * (0.016 + 0.028 * level) * p.w * (0.75 + near * 1.25);
      if (a < 0.003) continue;

      // 宽描边（辉光）
      g.strokeStyle = `rgba(${r},${gg},${b},${a})`;
      g.lineWidth = (7.5 + p.w * 13.5) * (isBack ? 0.68 : 1);
      g.beginPath();
      g.moveTo(t[0], t[1]);
      for (let k = 2; k < t.length; k += 2) g.lineTo(t[k], t[k + 1]);
      g.stroke();

      cores.push([t, r, gg, b, a, p, isBack]);
    }

    /* ---- 整层模糊后叠回主画布：这一下就是「体积」 ---- */
    const layer = back ? fogCvB : fogCvF;
    if (layer) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const blur = q.filStep > 1 ? 3 : 4;
      if (ctx.filter !== undefined) ctx.filter = `blur(${blur}px)`;
      ctx.drawImage(layer, 0, 0, w, h);
      ctx.filter = 'none';
      ctx.restore();
    }

    /* ---- 芯层：细而亮的丝，直接画在主画布上 ---- */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < cores.length; i++) {
      const [t, r, gg, b, a, p, isBack] = cores[i];
      ctx.strokeStyle = `rgba(${r},${gg},${b},${a * 0.85})`;
      ctx.lineWidth = (0.6 + p.w * 1.3) * (isBack ? 0.65 : 1);
      ctx.beginPath();
      ctx.moveTo(t[0], t[1]);
      for (let k = 2; k < t.length; k += 2) ctx.lineTo(t[k], t[k + 1]);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * 镜面地面上的雾影：把丝缕沿镜面翻转、压淡
   */
  function filReflect(ctx, w, h, globalFade) {
    const fade = globalFade * flowIntro;
    const q = vizQ();
    if (fade <= 0.02 || !filParts.length || !vizModel) return;
    const floorY = vizModel.floorY;
    const step = q.filStep;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, floorY, w, h - floorY);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < filParts.length; i += step) {
      const p = filParts[i];
      const t = p.trail;
      if (t.length < 4) continue;
      const lastY = t[t.length - 1];
      if (lastY > floorY) continue;               // 只有地面之上的雾才有倒影
      const fadeIn = Math.min(1, p.age / 20);
      const fadeOut = Math.min(1, (p.life - p.age) / 45);
      const a = fade * fadeIn * fadeOut * 0.045 * q.reflect * p.w;
      if (a < 0.003) continue;
      ctx.strokeStyle = `rgba(186,216,244,${a})`;
      ctx.lineWidth = 1.2 + p.w * 2.4;
      ctx.beginPath();
      ctx.moveTo(t[0], 2 * floorY - t[1]);
      for (let k = 2; k < t.length; k += 2) ctx.lineTo(t[k], 2 * floorY - t[k + 1]);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * 音层名标注：贴在每层最靠前的那条丝上
   */
  function filLabels(ctx, w, h, globalFade) {
    const fade = globalFade * flowIntro;
    if (fade < 0.06 || !filParts.length) return;
    const best = {};
    for (let i = 0; i < filParts.length; i++) {
      const p = filParts[i];
      if (p.kind === 'main') continue;
      const t = p.trail;
      if (t.length < 4) continue;
      const prog = p.dir > 0 ? p.x : (w - p.x);
      const b = best[p.kind];
      if (!b || prog > b.prog) {
        best[p.kind] = { prog, x: t[t.length - 2], y: t[t.length - 1], st: p.st };
      }
    }
    ctx.save();
    ctx.font = '600 9.5px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    Object.keys(best).forEach((key) => {
      const b = best[key];
      if (!b.st) return;
      if (b.x < 30 || b.x > w - 30) return;
      if (b.y < 12 || b.y > h - 8) return;
      const tw = ctx.measureText(b.st.name).width;
      ctx.fillStyle = `rgba(10,16,23,${0.62 * fade})`;
      ctx.beginPath();
      ctx.roundRect(b.x - tw / 2 - 4, b.y - 8.5, tw + 8, 12.5, 4);
      ctx.fill();
      ctx.fillStyle = `rgba(${b.st.color},${0.98 * fade})`;
      ctx.fillText(b.st.name, b.x, b.y - 2.2);
    });
    ctx.textAlign = 'left';
    ctx.restore();
  }


  /* ===============================================================
   * 卦历
   * =============================================================== */

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveHistory(reading, result) {
    const list = loadHistory();
    const now = new Date();
    const key = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${reading.n}`;
    const filtered = list.filter((h) => h.key !== key);
    filtered.unshift({
      key,
      n: reading.n,
      name: reading.name,
      symbol: reading.symbol,
      hint: reading.hint,
      method: reading.methodText,
      image: (result.detail && result.detail.imageName) || '',
      date: `${now.getMonth() + 1}月${now.getDate()}日`,
      time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered.slice(0, 60)));
    renderHistory();
  }

  function renderHistory() {
    const list = loadHistory();
    const box = $('#historyList');
    box.innerHTML = '';
    $('#historyCard').classList.toggle('hidden', list.length === 0);
    if (!list.length) {
      box.innerHTML = '<div class="history-empty">还没有记录，起一卦吧。</div>';
      return;
    }
    list.forEach((h) => {
      const item = document.createElement('div');
      item.className = 'history-item';
      item.innerHTML =
        `<span class="hi-symbol">${h.symbol}</span>` +
        `<span class="hi-body">` +
          `<span class="hi-name">${h.name}${h.image ? ` · 观${h.image}` : ''}</span>` +
          `<span class="hi-hint">${h.hint}</span>` +
        `</span>` +
        `<span class="hi-date">${h.date}<br>${h.time}</span>`;
      item.addEventListener('click', () => replayHistory(h));
      box.appendChild(item);
    });
  }

  function replayHistory(h) {
    const hex = D.getHexagram(h.n);
    present({
      hex,
      changedHex: null,
      movingLine: 1,
      movingLines: [1],
      lines: D.getSixLines(hex),
      changedLines: D.getSixLines(hex),
      methodText: h.method,
      detail: {},
      music: D.deriveMusicConfig(hex)
    });
  }

  function clearHistory() {
    if (!confirm('确定清空卦历记录？')) return;
    localStorage.removeItem(STORAGE_KEY);
    renderHistory();
  }

  /* ===============================================================
   * PWA 安装引导
   * =============================================================== */

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = $('#btnInstall');
    if (btn) btn.classList.remove('hidden');
  });

  let deferredPrompt = null;

  function bindInstall() {
    const btn = $('#btnInstall');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') btn.classList.add('hidden');
      deferredPrompt = null;
    });
  }

  /* ===============================================================
   * PWA 注册
   * =============================================================== */

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    // file:// 协议下无法注册，跳过
    if (location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js').catch((e) => {
      console.warn('Service Worker 注册失败', e);
    });
  }

  /* ===============================================================
   * 启动
   * =============================================================== */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { init(); bindInstall(); });
  } else {
    init();
    bindInstall();
  }

  registerSW();

})();
