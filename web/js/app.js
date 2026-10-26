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

  /**
   * 把实时频谱整理成共享渲染核心要的信号包
   * ---------------------------------------------------------------
   * 频段划分（fftSize=512、44.1kHz 时每 bin ≈ 86Hz）：
   *   低频 low   约 86–344Hz   → 云雾生成速度、辉光亮度
   *   中频 mid   约 344–2064Hz → 主体厚度
   *   高频 high  约 2k–12kHz   → 细碎湍流
   *   音量 level 总体包络     → 流速、粒子亮度、撞到卦爻的扰动强度
   */
  function vizSignal() {
    const analyser = player.analyser;
    const live = !!(analyser && flowMode === 'playing');
    if (!live) {
      return {
        bins: null,
        bands: {
          low: vizLow * 0.88, mid: vizMid * 0.88, high: vizHigh * 0.88,
          level: vizLevel * 0.88, energy: vizEnergy * 0.86
        },
        bassTarget: 0
      };
    }
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const dt = Math.min(0.05, vizDt());
    const e = Math.sqrt(sumSq(data) / data.length) / 255;
    vizEnergy = vizEnergy * 0.78 + e * 0.22;
    const lo = bandAvg(data, 1, 4);
    const md = bandAvg(data, 4, 24);
    const hi = bandAvg(data, 24, 140);
    vizLow = envFollow(vizLow, Math.min(1, Math.pow(lo, 0.72) * 1.5), dt, 0.05, 0.30);
    vizMid = envFollow(vizMid, Math.min(1, Math.pow(md, 0.85) * 1.7), dt, 0.04, 0.22);
    vizHigh = envFollow(vizHigh, Math.min(1, Math.pow(hi, 0.90) * 2.1), dt, 0.02, 0.14);
    vizLevel = envFollow(vizLevel, Math.min(1, Math.pow(e, 0.80) * 2.0), dt, 0.04, 0.26);
    let lo2 = 0;
    const loN = Math.min(data.length, 6);
    for (let i = 1; i < loN; i++) lo2 += data[i];
    lo2 = lo2 / Math.max(1, loN - 1) / 255;
    vizBassTarget = Math.min(1, Math.pow(lo2, 0.78) * 1.35);
    return {
      bins: data,
      bands: {
        low: vizLow, mid: vizMid, high: vizHigh,
        level: vizLevel, energy: vizEnergy
      },
      bassTarget: vizBassTarget
    };
  }

  /** 频谱平方和 */
  function sumSq(data) {
    let s = 0;
    for (let i = 0; i < data.length; i++) s += data[i] * data[i];
    return s;
  }

  /** 频段均值 */
  function bandAvg(data, a, b) {
    let s = 0, n = 0;
    for (let i = a; i < b && i < data.length; i++) { s += data[i]; n++; }
    return n ? (s / n) / 255 : 0;
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

  /* ---------- 主绘制入口 ---------- */
  function drawViz() {
    const sized = resizeViz();
    if (!sized) return;
    const { ctx, w, h } = sized;
    const dt = vizDt();

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
      /* 三维模式：画面由共享渲染核心绘制（core/viz-stage.js）——
       * 微信小程序端用的是同一份代码，故两端效果一致。 */
      const hd = vizHexData();
      stage.resize(w, h);
      stage.setHex(hd.rows, hd.moving);
      stage.setLayers(activeLayerWaves());
      stage.setQuality(vizQuality);
      stage.setFlowState(flowMode);
      stage.setSignal(vizSignal());
      stage.draw(ctx, dt);
    }

    vizAdvance(dt);
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

  /* 画质档：网页版的纸面模式（silk/ripple）与三维模式共用一份档位定义。
   * 字段取并集：max / puff / samples / spawn 供纸面模式；
   * fil / filTrail / steps / glow / reflect / ceiling 供三维模式。 */
  const VIZ_QUALITY = {
    high: Object.assign({}, ICVizStage.VIZ_QUALITY.high, {
      max: 36, samples: 14, puff: [34, 24], spawn: 1.0
    }),
    perf: Object.assign({}, ICVizStage.VIZ_QUALITY.perf, {
      max: 14, samples: 7, puff: [28, 18], spawn: 1.7
    })
  };
  let vizQuality = 'high';
  function vizQ() { return VIZ_QUALITY[vizQuality] || VIZ_QUALITY.high; }

  let flowLines = [];
  let flowClock = 0;
  /* 波形台共享渲染核心（与微信小程序端同一份代码） */
  const stage = ICVizStage.createStage();
  let flowMode = 'idle';           // idle | playing | paused | drain
  let flowDrainT = 0;
  let flowIntro = 0;               // 渐入进度 0..1（音乐起了雾才现）
  let flowBands = [];              // 各流的发射计时
  // 当前模型几何由共享渲染核心维护（stage.model()）
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
    // 供端到端测试读取丝缕系统状态（丝缕由共享渲染核心维护）
    window.__gxFil = () => stage.stats();
    window.__gxFilXs = () => stage.filXs();
    // 鼓点包络：低频能量上升快、回落慢 —— 停止后缓缓停下
    const target = vizBassTarget;
    const k = target > vizBass
      ? 1 - Math.pow(0.001, dt / 0.045)
      : 1 - Math.pow(0.001, dt / 0.42);
    vizBass += (target - vizBass) * k;
  }

  /** 流线在某屏幕横坐标处的纵坐标：基础轨道 + 绕行 + 波形 */
  function flowYAt(line, px, w, h) {
    const geo = stage.model();
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
    const geo = stage.model();
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
