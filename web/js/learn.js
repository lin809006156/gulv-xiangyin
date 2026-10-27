/**
 * 古律象音 · 学易栏（易经知识学习）
 * ---------------------------------------------------------------
 * 内容来源全部取自 core 模块的既有数据与典籍依据：
 *   D.TRIGRAMS / D.HEXAGRAMS / D.TWELVE_LV / D.MODES / D.EIGHT_TONE / D.FIVE_TONE
 *   C.DIVINATION_METHODS / C.ANCIENT_DIVINATION / C.TRIGRAM_CLASSICS / C.SOURCE_KIND
 *   T.HEXAGRAM_TEXTS / T.PALACES —— 六十四卦原文与京房八宫纳甲
 * 不杜撰定义；引文均注书名篇名。
 *
 * 版面：各章节默认折叠（易理知识宜按需取阅，不一次摊开占满屏），
 * 展开状态记在本地，下次进来保持原样。
 */

'use strict';

(function () {

  const D = window.ICData;
  const C = window.ICClassics;
  const T = window.ICTexts;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const OPEN_KEY = 'gulv-xiangyin-learn-open';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** 文献档位徽标 */
  function badge(kind) {
    const k = C.SOURCE_KIND[kind] || C.SOURCE_KIND.modern;
    const cls = kind === 'classic' ? 'classic' : kind === 'later' ? 'later' : 'modern';
    return `<span class="cbadge cbadge-src-${cls}">${esc(k.label)}</span>`;
  }

  /* ===============================================================
   * 版面：可折叠章节
   * =============================================================== */

  function openState() {
    try {
      return JSON.parse(localStorage.getItem(OPEN_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function saveOpenState(state) {
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(state));
    } catch (e) { /* 忽略 */ }
  }

  /** 包一节：标题条常显，正文默认收起 */
  function lsec(no, title, body, key) {
    const open = openState()[key] ? ' is-open' : '';
    return `
    <div class="glass-card lsec${open}" data-key="${key}">
      <button class="lsec-head" type="button" aria-expanded="${open ? 'true' : 'false'}">
        <span class="ls-no">${no}</span>
        <span class="lsec-title-text">${esc(title)}</span>
        <span class="lsec-chev" aria-hidden="true">›</span>
      </button>
      <div class="lsec-body"${open ? '' : ' hidden'}>${body}</div>
    </div>`;
  }

  /** 绑定所有折叠开关（含首次渲染与后续动态插入） */
  function bindCollapse(root) {
    (root || document).querySelectorAll('.lsec-head').forEach((head) => {
      if (head.dataset.bound) return;
      head.dataset.bound = '1';
      head.addEventListener('click', () => {
        const card = head.closest('.lsec');
        if (!card) return;
        const body = card.querySelector('.lsec-body');
        const open = card.classList.toggle('is-open');
        if (body) body.hidden = !open;
        head.setAttribute('aria-expanded', open ? 'true' : 'false');
        const st = openState();
        st[card.dataset.key] = open;
        saveOpenState(st);
      });
    });
  }

  /** 展开某一节（供内部跳转用，如找到卦后自动展开） */
  function openSection(card) {
    if (!card || card.classList.contains('is-open')) return;
    const head = card.querySelector('.lsec-head');
    if (head) head.click();
  }

  /* ===============================================================
   * 一、太极 → 两仪 → 四象 → 八卦 → 六十四卦（生成图）
   * ---------------------------------------------------------------
   * 爻形一律用矢量画出（阳爻整条、阴爻中断），不依赖字体字形：
   * 四象自上而下为 太阳（二阳）、少阴（上阴下阳）、少阳（上阳下阴）、
   * 太阴（二阴），依朱熹《周易本义》伏羲八卦次序图「加一倍法」：
   * 阳仪生阴为少阴、阴仪生阳为少阳，故少阴之上爻为阴、少阳之上爻为阳。
   * =============================================================== */

  function taijiSvg() {
    // 一爻：阳=整条，阴=中断两段
    const yao = (cx, y, yang, w, h) => (yang
      ? `<rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#23201B"/>`
      : `<rect x="${cx - w / 2}" y="${y}" width="${w * 0.44}" height="${h}" rx="${h / 2}" fill="#23201B"/>
         <rect x="${cx + w / 2 - w * 0.44}" y="${y}" width="${w * 0.44}" height="${h}" rx="${h / 2}" fill="#23201B"/>`);
    // 分支箭头：从 (x1,y1) 指向 (x2,y2)
    const branch = (x1, y1, x2, y2) => {
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / len, uy = dy / len;
      const bx = x2 - ux * 7, by = y2 - uy * 7;
      const px = -uy * 3.6, py = ux * 3.6;
      return `<line x1="${x1}" y1="${y1}" x2="${bx}" y2="${by}" stroke="#C9C0B1" stroke-width="1.2"/>
       <path d="M${bx + px} ${by + py} L${x2} ${y2} L${bx - px} ${by - py}" fill="none" stroke="#C9C0B1" stroke-width="1.2" stroke-linejoin="round"/>`;
    };
    const label = (x, y, t, size, color) =>
      `<text x="${x}" y="${y}" text-anchor="middle" font-size="${size || 11}" fill="${color || '#8A8175'}" font-family="var(--font-sans)">${t}</text>`;
    const sym = (x, y, ch) =>
      `<text x="${x}" y="${y}" text-anchor="middle" font-size="24" fill="#23201B" font-family="var(--font-serif)">${ch}</text>`;

    return `
    <svg viewBox="0 0 420 352" role="img" aria-label="太极生两仪，两仪生四象，四象生八卦">
      <!-- 太极（矢量绘制，不依赖字体字形） -->
      <g transform="translate(210,26)">
        <circle cx="0" cy="0" r="15" fill="#F7F2E8" stroke="#B23A2E" stroke-width="1.4"/>
        <path d="M0,-15 A15,15 0 0,1 0,15 A7.5,7.5 0 0,1 0,0 A7.5,7.5 0 0,0 0,-15 Z" fill="#B23A2E"/>
        <circle cx="0" cy="-3.75" r="1.9" fill="#F7F2E8"/>
        <circle cx="0" cy="3.75" r="1.9" fill="#B23A2E"/>
      </g>
      ${label(210, 54, '太极')}
      ${branch(210, 60, 105, 84)}
      ${branch(210, 60, 315, 84)}

      <!-- 两仪 -->
      ${yao(105, 92, true, 64, 10)}
      ${yao(315, 92, false, 64, 10)}
      ${label(105, 124, '阳仪 · 阳爻')}
      ${label(315, 124, '阴仪 · 阴爻')}
      ${branch(105, 130, 60, 148)}
      ${branch(105, 130, 160, 148)}
      ${branch(315, 130, 260, 148)}
      ${branch(315, 130, 360, 148)}

      <!-- 四象：自上而下 太阳 / 少阴 / 少阳 / 太阴 -->
      ${yao(60, 156, true, 56, 10)}${yao(60, 172, true, 56, 10)}
      ${yao(160, 156, false, 56, 10)}${yao(160, 172, true, 56, 10)}
      ${yao(260, 156, true, 56, 10)}${yao(260, 172, false, 56, 10)}
      ${yao(360, 156, false, 56, 10)}${yao(360, 172, false, 56, 10)}
      ${label(60, 206, '太阳', 12, '#4A443B')}
      ${label(160, 206, '少阴', 12, '#4A443B')}
      ${label(260, 206, '少阳', 12, '#4A443B')}
      ${label(360, 206, '太阴', 12, '#4A443B')}
      ${label(60, 222, '二阳', 10)}
      ${label(160, 222, '上阴下阳', 10)}
      ${label(260, 222, '上阳下阴', 10)}
      ${label(360, 222, '二阴', 10)}
      ${branch(60, 228, 35, 246)}
      ${branch(60, 228, 85, 246)}
      ${branch(160, 228, 135, 246)}
      ${branch(160, 228, 185, 246)}
      ${branch(260, 228, 235, 246)}
      ${branch(260, 228, 285, 246)}
      ${branch(360, 228, 335, 246)}
      ${branch(360, 228, 385, 246)}

      <!-- 八卦（先天序：乾兑离震巽坎艮坤） -->
      ${sym(35, 268, '☰')}${sym(85, 268, '☱')}${sym(135, 268, '☲')}${sym(185, 268, '☳')}
      ${sym(235, 268, '☴')}${sym(285, 268, '☵')}${sym(335, 268, '☶')}${sym(385, 268, '☷')}
      ${label(35, 290, '乾')}${label(85, 290, '兑')}${label(135, 290, '离')}${label(185, 290, '震')}
      ${label(235, 290, '巽')}${label(285, 290, '坎')}${label(335, 290, '艮')}${label(385, 290, '坤')}
      ${label(210, 320, '八卦（经卦）· 三爻成一卦', 12, '#4A443B')}
      ${label(210, 340, '八卦两两相重，得六十四卦（别卦 · 六爻）', 11)}
    </svg>`;
  }

  function sectionOrigin() {
    return `
    <div class="glass-card learn-hero">
      <!-- 太极图用 Canvas 绘制（core/taiji.js）：字体字形 ☯ 跨平台可能缺字或变形 -->
      <canvas class="lh-sym" id="lhTaiji" width="108" height="108"></canvas>
      <h2>易之约</h2>
      <p>《周易·系辞上》：「<b>易有太极，是生两仪，两仪生四象，四象生八卦</b>，八卦定吉凶，吉凶生大业。」<br>
      「生生之谓易。」—— 易之所言，是一套观变化之道的语言，而非命定之数。</p>
    </div>
    ${lsec('壹', '易之生成', `
      <p class="lsec-desc">
        一气未分曰太极；分而有阴阳，是生两仪（阳爻 ⚊、阴爻 ⚋）。
        两仪之上再各生一阴一阳，成四象；四象各加一爻，成八卦（经卦，三爻）；
        八卦两两相重，得六十四卦（别卦，六爻）。
      </p>
      <div class="taiji-fig">${taijiSvg()}</div>
      <p class="lsec-note">
        四象自上而下为<b>太阳</b>（二阳）、<b>少阴</b>（上阴下阳）、<b>少阳</b>（上阳下阴）、<b>太阴</b>（二阴）。
        何以少阴上爻为阴？依朱熹《周易本义》伏羲八卦次序图的「加一倍法」：
        阳仪之上生一阴为少阴，阴仪之上生一阳为少阳 —— 由是
        「太阳生乾兑，少阴生离震，少阳生巽坎，太阴生艮坤」，正先天八卦之序。
      </p>
      <p class="ccite">《周易·系辞上》：「易有太极，是生两仪，两仪生四象，四象生八卦。」</p>
      <p class="ctext">
        本应用中的每一卦，皆是这六十四「别卦」之一：<b>上卦（外卦）定乐器音色，下卦（内卦）定调式</b>，
        六爻之阴阳生成专属旋律轮廓 —— 故六十四卦，六十四段心音。
      </p>`, 'origin')}`;
  }

  /* ===============================================================
   * 二、八卦速查
   * =============================================================== */

  function sectionTrigrams() {
    const keys = ['qian', 'dui', 'li', 'zhen', 'xun', 'kan', 'gen', 'kun'];
    const cards = keys.map((k) => {
      const t = D.TRIGRAMS[k];
      const tc = C.TRIGRAM_CLASSICS[k];
      return `
      <div class="tri-card">
        <div class="tri-head">
          <span class="tri-sym">${t.symbol}</span>
          <div>
            <div class="tri-name">${esc(t.name)} · ${esc(t.nature)}</div>
            <div class="tri-attr">${esc(t.attribute)} · ${esc(t.wuxing)}</div>
          </div>
        </div>
        <div class="tri-rows">
          <div><b>类象：</b>${esc(t.image)}</div>
          <div><b>配音：</b>${esc(t.voiceText)}（${esc(t.voiceMaterial)}）</div>
        </div>
        <p class="tri-de">${esc(tc.deText)}</p>
      </div>`;
    }).join('');

    return lsec('贰', '八卦速查', `
      <p class="lsec-desc">八经卦之象、德、五行与配乐，逐卦列出。卦德句一字不易，皆出《周易·说卦传》。</p>
      <div class="tri-grid">${cards}</div>
      <p class="ccite" style="margin-top:12px">
        《说卦传》：「乾，健也。坤，顺也。震，动也。巽，入也。坎，陷也。离，丽也。艮，止也。兑，说也。」<br>
        八音配卦出《白虎通·礼乐》引《乐记》，清人陈立《白虎通疏证》补箫、磬。
      </p>`, 'trigrams');
  }

  /* ===============================================================
   * 三、六十四卦（含「按上下卦找卦」）
   * =============================================================== */

  let currentHex = null;

  function hex64Cell(h) {
    return `
    <button class="hex64-cell" data-n="${h.n}" type="button">
      <span class="h64-sym">${D.hexagramSymbol(h.n)}</span>
      <span class="h64-name">${esc(h.name)}</span>
      <span class="h64-no">${h.n}</span>
    </button>`;
  }

  /**
   * 六十四卦详解
   * ---------------------------------------------------------------
   * 数据全部来自 core/hexagram-texts.js（由 scripts/build-hex-texts.js 生成）：
   *   卦辞 / 彖传 / 大象传 / 六爻爻辞 / 六爻小象 / 用九用六 —— 典籍原文
   *   世应、六亲、纳甲、八宫、山向 —— 依京房法算法计算
   *   常见占断 —— 当代类推，标明档位，不作吉凶断定
   * 阳宅一栏只列纳甲所配之山与方位（算法可查），不给吉凶断语。
   */
  function hex64Detail(h) {
    const upper = D.TRIGRAMS[h.upper];
    const lower = D.TRIGRAMS[h.lower];
    const cfg = D.deriveMusicConfig(h);
    const mode = D.FIVE_TONE[cfg.modeKey];
    const t = T ? T.getText(h.n) : null;
    if (!t) return hex64DetailLite(h, upper, lower, cfg, mode);

    const pal = T.getPalace(h.n);
    const prof = T.getYaoProfile(h.n);
    const div = T.getDivination(h.n);
    const yangText = prof.yang === 6 ? '六爻皆阳' : prof.yin === 6 ? '六爻皆阴'
      : `阳爻 ${prof.yang} · 阴爻 ${prof.yin}`;

    /* 六爻逐条：爻辞 + 小象 + 纳甲六亲 */
    const yaoRows = t.yao.map((y) => {
      const marks = [
        y.isShi ? '<span class="h64d-tag t-shi">世</span>' : '',
        y.isYing ? '<span class="h64d-tag t-ying">应</span>' : ''
      ].join('');
      return `
      <tr class="${y.yang ? 'is-yang' : 'is-yin'}">
        <td class="h64d-yh">
          <b>${esc(y.head)}</b>${marks}
          <span class="h64d-gz">${esc(y.ganzhi)}</span>
          <span class="h64d-lq">${esc(y.liuqin)}</span>
          <span class="h64d-dx">${esc(y.dir)}</span>
        </td>
        <td class="h64d-yx">${esc(y.xiang)}</td>
        <td class="h64d-yc">${esc(y.text)}</td>
      </tr>`;
    }).join('');

    return `
    <div class="h64d-head">
      <div class="h64d-sym">${D.hexagramSymbol(h.n)}</div>
      <div>
        <div class="h64d-name">${esc(h.name)}</div>
        <div class="h64d-struct">
          第 ${h.n} 卦 · ${esc(upper.name)}上${esc(lower.name)}下 ·
          ${esc(h.virtue)}之卦 · ${esc(yangText)}
        </div>
      </div>
    </div>

    <div class="h64d-sec">
      <div class="h64d-sec-t">卦辞${badge('classic')}</div>
      <p class="h64d-gua">${esc(t.gua)}</p>
      <div class="h64d-sec-t2">彖传${badge('classic')}</div>
      <p class="h64d-txt">${esc(t.tuan)}</p>
      <div class="h64d-sec-t2">大象传${badge('classic')}</div>
      <p class="h64d-xiang">${esc(t.xiang)}</p>
      ${t.yong ? `<div class="h64d-sec-t2">${esc(t.yong.split('：')[0])}${badge('classic')}</div>
      <p class="h64d-txt">${esc(t.yong.split('：').slice(1).join('：'))}</p>` : ''}
    </div>

    <div class="h64d-sec">
      <div class="h64d-sec-t">六爻爻辞与小象${badge('classic')}</div>
      <table class="h64d-yao">
        <thead><tr><th>爻题 · 纳甲六亲</th><th>象曰</th><th>爻辞</th></tr></thead>
        <tbody>${yaoRows}</tbody>
      </table>
      <p class="h64d-note">每爻自上而下为：爻题与纳甲六亲 → 象曰（小象传）→ 爻辞。</p>
    </div>

    <div class="h64d-sec">
      <div class="h64d-sec-t">京房八宫 · 纳甲 · 阳宅山向${badge('later')}</div>
      <div class="h64d-pal">
        <div class="h64d-pal-item"><span>卦宫</span><b>${esc(pal.palaceName)}宫（属${esc(pal.wuxing)}）</b></div>
        <div class="h64d-pal-item"><span>次序</span><b>${esc(pal.stageName)}卦</b></div>
        <div class="h64d-pal-item"><span>世应</span><b>世在${esc(pal.shi)}爻 · 应在${esc(pal.ying)}爻</b></div>
        <div class="h64d-pal-item"><span>本宫纳甲</span><b>内${esc(pal.najia.inner.join('、'))} · 外${esc(pal.najia.outer.join('、'))}</b></div>
        <div class="h64d-pal-item"><span>所辖山向</span><b>${esc(pal.dir)} · ${esc(pal.shan.join('、'))}三山</b></div>
      </div>
      <p class="h64d-note">
        山向依二十四山一卦管三山（八干四维配十二支）推得，只列方位配属，不作吉凶断语。
      </p>
    </div>

    <div class="h64d-sec">
      <div class="h64d-sec-t">常见占断${badge('modern')}</div>
      <p class="h64d-div">${esc(div)}</p>
      <p class="h64d-hint">心语：${esc(h.hint)}</p>
    </div>

    <div class="h64d-sec">
      <div class="h64d-sec-t">此卦之音</div>
      <p class="h64d-music">
        调式 <b>${esc(cfg.modeName)}</b>（${esc(mode.wuxing)}，${esc(mode.role)}）·
        律属 <b>${esc(cfg.lvName)}</b> ·
        音色取 <b>${esc(cfg.voiceText)}</b>（${esc(cfg.voiceMaterial)}，配${esc(upper.name)}卦）
      </p>
      <button class="btn btn-primary" id="btnLearnCast" data-n="${h.n}">以此卦起卦，听它的心音</button>
    </div>`;
  }

  /** 数据层缺失时的降级渲染（保留原有精简版式） */
  function hex64DetailLite(h, upper, lower, cfg, mode) {
    return `
    <div class="h64d-head">
      <div class="h64d-sym">${D.hexagramSymbol(h.n)}</div>
      <div>
        <div class="h64d-name">${esc(h.name)}</div>
        <div class="h64d-struct">第 ${h.n} 卦 · ${esc(upper.name)}上${esc(lower.name)}下 · ${esc(h.virtue)}之卦</div>
      </div>
    </div>
    <p class="h64d-gua">卦辞：${esc(h.gua)}</p>
    <p class="h64d-xiang">大象传：${esc(h.xiang)}</p>
    <p class="h64d-hint">心语：${esc(h.hint)}</p>
    <p class="h64d-music">
      此卦之音：<b>${esc(cfg.modeName)}</b>（${esc(mode.wuxing)}，${esc(mode.role)}）·
      律属<b>${esc(cfg.lvName)}</b> · 音色取<b>${esc(cfg.voiceText)}</b>（${esc(cfg.voiceMaterial)}，配${esc(upper.name)}卦）
    </p>
    <button class="btn btn-primary" id="btnLearnCast" data-n="${h.n}">以此卦起卦，听它的心音</button>`;
  }

  function bindHex64() {
    const grid = $('#hex64Grid');
    const detail = $('#hex64Detail');
    if (!grid) return;

    grid.addEventListener('click', (e) => {
      const cell = e.target.closest('.hex64-cell');
      if (!cell) return;
      const h = D.getHexagram(parseInt(cell.dataset.n, 10));
      if (!h) return;
      currentHex = h;
      detail.innerHTML = hex64Detail(h);
      detail.classList.add('open');
      detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    detail.addEventListener('click', (e) => {
      const btn = e.target.closest('#btnLearnCast');
      if (!btn || !currentHex) return;
      if (typeof window.__gxCastHexagram === 'function') {
        window.__gxCastHexagram(currentHex.n);
      }
    });
  }

  /** 按上下卦找卦：选定上下两经卦，直接定位到那一卦 */
  function bindHex64Finder() {
    const up = $('#hexFindUpper');
    const low = $('#hexFindLower');
    if (!up || !low) return;

    const options = D.TRIGRAM_KEYS.map((k) => {
      const t = D.TRIGRAMS[k];
      return `<option value="${k}">${esc(t.symbol)} ${esc(t.name)}（${esc(t.attribute)}）</option>`;
    }).join('');
    up.innerHTML = options;
    low.innerHTML = options;
    up.value = 'qian';
    low.value = 'kun';

    const find = () => {
      const idx = D.findHexagramIndex(up.value, low.value);
      if (idx < 0) return;
      const h = D.getHexagram(idx + 1);
      if (!h) return;
      currentHex = h;
      const detail = $('#hex64Detail');
      detail.innerHTML = hex64Detail(h);
      detail.classList.add('open');
      // 确保所在章节展开，并在网格中高亮定位
      const card = detail.closest('.lsec');
      if (card) openSection(card);
      $$('.hex64-cell').forEach((c) => c.classList.remove('is-hit'));
      const cell = $(`.hex64-cell[data-n="${h.n}"]`);
      if (cell) {
        cell.classList.add('is-hit');
        cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => cell.classList.remove('is-hit'), 2000);
      }
    };

    $('#hexFindBtn').addEventListener('click', find);
    up.addEventListener('change', find);
    low.addEventListener('change', find);
  }

  function sectionHexagrams() {
    const cells = D.HEXAGRAMS.map(hex64Cell).join('');
    const options = D.TRIGRAM_KEYS.map((k) => {
      const t = D.TRIGRAMS[k];
      return `<option value="${k}">${esc(t.symbol)} ${esc(t.name)}</option>`;
    }).join('');
    return lsec('叁', '六十四卦', `
      <p class="lsec-desc">
        点开任意一卦，可读卦辞、大象传与本应用为它所配的音律，亦可直接以此卦起卦听音。
        知道上下两卦（如「上乾下坤」）时，用下方「按上下卦找卦」一步定位。
      </p>
      <div class="hex64-finder">
        <div class="hex64-search">
          <input type="text" id="hex64Search" placeholder="搜索卦名或卦序，如：乾 / 泰 / 11">
        </div>
        <div class="h64f-row">
          <span class="h64f-cap">上卦</span>
          <select id="hexFindUpper" class="h64f-sel">${options}</select>
          <span class="h64f-cap">下卦</span>
          <select id="hexFindLower" class="h64f-sel">${options}</select>
          <button class="btn btn-soft btn-sm" id="hexFindBtn" type="button">找这一卦</button>
        </div>
      </div>
      <div class="hex64-grid" id="hex64Grid">${cells}</div>
      <div class="hex64-detail" id="hex64Detail"></div>`, 'hexagrams');
  }

  function bindHex64Search() {
    const input = $('#hex64Search');
    const grid = $('#hex64Grid');
    if (!input || !grid) return;
    input.addEventListener('input', () => {
      const kw = input.value.trim();
      const hits = kw
        ? D.HEXAGRAMS.filter((h) =>
            h.name.indexOf(kw) >= 0 || String(h.n) === kw)
        : D.HEXAGRAMS;
      grid.innerHTML = hits.length
        ? hits.map(hex64Cell).join('')
        : '<p class="search-empty">没有匹配的卦。</p>';
    });
  }

  /* ===============================================================
   * 四、五音与十二律
   * =============================================================== */

  function sectionTones() {
    const lvChips = D.TWELVE_LV.map((lv, i) => `
      <div class="lv-chip"><b>${esc(lv.name)}</b><span>${i + 1}</span></div>`).join('');

    const keys = ['gong', 'shang', 'jue', 'zhi', 'yu'];
    const fiveCards = keys.map((k) => {
      const f = D.FIVE_TONE[k];
      const m = D.MODES[k];
      return `
      <div class="five-card">
        <div class="five-head">
          <span class="five-name">${esc(f.name)}</span>
          <span class="five-wx">${esc(f.wuxing)}</span>
          <span class="five-role">${esc(f.role)}</span>
        </div>
        <div class="five-clarity" title="清浊度">
          <i style="width:${Math.round(m.clarity * 100)}%"></i>
        </div>
        <div class="five-meta">
          <div>${esc(f.meaning)}</div>
          <div>配属：${esc(f.organ)}</div>
          <div>${esc(m.mood)}</div>
        </div>
      </div>`;
    }).join('');

    return lsec('肆', '五音与十二律', `
      <p class="lsec-desc">
        十二律吕定音高之本，五音定调式之性。宫为君、商为臣、角为民、徵为事、羽为物
        （《礼记·乐记》）；五音清浊次第为「宫至浊 → 商 → 角（清浊相半）→ 徵（次清）→ 羽最清」
        （《乐记》郑玄注、孔颖达疏）。
      </p>
      <div class="lv-strip">${lvChips}</div>
      <div class="five-grid">${fiveCards}</div>
      <p class="ccite" style="margin-top:12px">
        《礼记·乐记》：「宫为君，商为臣，角为民，徵为事，羽为物。」<br>
        《管子·地员》以众声譬五音：「凡听宫，如牛鸣窌中；凡听商，如离群羊；凡听角，如雉登木以鸣；凡听徵，如负猪豕觉而骇；凡听羽，如鸣马在野。」
      </p>
      <p class="learn-tip">
        本应用为每一卦配定调式与律吕后，再依五音清浊为每个音符施加音色修饰（清则明亮促急、浊则低沉舒缓）——
        所以不同卦的心音之别，不止在音高，也在音色。<br>
        ※ 五音配脏腑是古代音律理论之说，此处仅作文化展示，不构成任何医疗建议。
      </p>`, 'tones');
  }

  /* ===============================================================
   * 五、爻位与变卦
   * =============================================================== */

  function yaoDemoSvg() {
    // 乾卦六爻，自上而下：上九 九五 九四 九三 九二 初九
    const rows = [
      { title: '上九', yang: true },
      { title: '九五', yang: true },
      { title: '九四', yang: true },
      { title: '九三', yang: true },
      { title: '九二', yang: true },
      { title: '初九', yang: true }
    ];
    let bars = '';
    rows.forEach((r, i) => {
      const y = 24 + i * 34;
      const bar = r.yang
        ? `<rect x="150" y="${y}" width="120" height="12" rx="6" fill="#23201B"/>`
        : `<rect x="150" y="${y}" width="52" height="12" rx="6" fill="#23201B"/>
           <rect x="218" y="${y}" width="52" height="12" rx="6" fill="#23201B"/>`;
      bars += `${bar}<text x="128" y="${y + 11}" text-anchor="end" font-size="13" fill="#B23A2E" font-family="var(--font-sans)">${r.title}</text>`;
    });
    return `
    <svg viewBox="0 0 380 236" role="img" aria-label="乾卦六爻爻位图">
      <text x="330" y="20" font-size="11" fill="#8A8175" font-family="var(--font-sans)">上爻</text>
      <text x="330" y="222" font-size="11" fill="#8A8175" font-family="var(--font-sans)">初爻</text>
      <path d="M318 26 L318 216" stroke="#DED5C4" stroke-width="1.2" stroke-dasharray="3 3"/>
      ${bars}
    </svg>`;
  }

  function sectionYao() {
    return lsec('伍', '爻位、动爻与变卦', `
      <p class="lsec-desc">
        六爻自下而上，依次称初、二、三、四、五、上。爻题两例：
        初、上两爻位置在前（初九、上六），中间四爻阴阳在前（九二、六五）。
        阳爻称九、阴爻称六 —— 「乾卦」六爻皆阳，爻题即初九、九二、九三、九四、九五、上九。
      </p>
      <div class="yao-demo">${yaoDemoSvg()}</div>
      <div class="method-list">
        <div class="method-item">
          <div class="method-head"><span class="method-name">动爻</span></div>
          <p class="method-text">
            起卦所得「将变之爻」。占筮以动爻为问事之机：本卦言当下之体，动爻言变化之几。
            本应用中，动爻同时是音乐的转折点 —— 主题段奏毕，动爻所启之变进入变奏与尾声。
          </p>
        </div>
        <div class="method-item">
          <div class="method-head"><span class="method-name">变卦</span></div>
          <p class="method-text">
            动爻阴阳互变之后所成之新卦，又称「之卦」。本应用中，变卦只更换尾声音色，
            不改变全曲调式 —— 所谓「之卦其音」，是同一心境里的余韵一转。
          </p>
        </div>
      </div>
      <p class="ccite">《周易·乾》：「初九，潜龙勿用。」「上九，亢龙有悔。」—— 爻位之辞，即位置之德。</p>`, 'yao');
  }

  /* ===============================================================
   * 六、八音配卦
   * =============================================================== */

  function sectionEightTone() {
    const chips = Object.keys(D.EIGHT_TONE).map((k) => {
      const t = D.EIGHT_TONE[k];
      const tri = D.TRIGRAMS[t.trigram];
      return `
      <div class="tri-card">
        <div class="tri-head">
          <span class="tri-sym">${tri.symbol}</span>
          <div>
            <div class="tri-name">${esc(t.name)}</div>
            <div class="tri-attr">${esc(t.material)}声 · 配${esc(tri.name)}卦</div>
          </div>
        </div>
        <div class="tri-rows"><div>${esc(t.timbre)}</div></div>
      </div>`;
    }).join('');

    return lsec('陆', '八音配卦', `
      <p class="lsec-desc">
        金、石、丝、竹、匏、土、革、木八类材质，与八卦一一相配；每卦因外卦之异而得不同主奏乐器，
        此即「古律象音」音色层的第一来源。八种音色均可在「音乐」栏试听。
      </p>
      <div class="tri-grid">${chips}</div>
      <p class="ccite" style="margin-top:12px">《白虎通·礼乐》引《乐记》：「埙，坎音也；管，艮音也；鼓，震音也；弦，离音也；钟，兑音也；柷敔，乾音也。」清人陈立《白虎通疏证》补：「箫当为巽音，磬当为坤音。」</p>`, 'eight');
  }

  /* ===============================================================
   * 七、所据典籍
   * =============================================================== */

  function sectionBooks() {
    const books = [
      { name: '《周易》', desc: '卦辞、大象传与十翼（系辞、说卦等）之文，本项目引其原文立论。' },
      { name: '《梅花易数》', desc: '传宋·邵雍撰。观梅占、时间起卦、物象起例，为本项目起卦法之所本。' },
      { name: '《白虎通》', desc: '东汉·班固等撰。礼乐篇载八音配八卦、五音配五行，本项目乐器归属所本。' },
      { name: '《礼记·乐记》', desc: '宫为君、五声之序与清浊次第，本项目音色清浊立论之所本（参郑玄注、孔颖达疏）。' },
      { name: '《黄帝内经·素问》', desc: '金匮真言论载五音入五脏之说。本项目仅引其文作文化展示，不作医疗结论。' }
    ];
    const items = books.map((b) => `
      <div class="book-item">
        <span class="book-name">${esc(b.name)}</span>
        <span class="book-desc">${esc(b.desc)}</span>
      </div>`).join('');

    return lsec('柒', '所据典籍', `
      <p class="lsec-desc">本项目每一处「定义类」内容，皆可回到以下文献查证；无载者则标注「当代类推」并写明推演链条。</p>
      <div class="book-list">${items}</div>
      <p class="learn-tip">
        本应用为传统文化与音乐艺术赏析而作，不宣称任何预测或疗愈功效；所引古音律之说，皆标出处，供方家查证。
      </p>`, 'books');
  }

  /**
   * 画英雄区的太极图（Canvas）
   * ---------------------------------------------------------------
   * 与小程序端共用 core/taiji.js，两端画出来完全一致。
   */
  function drawTaijiHero() {
    const cv = document.getElementById('lhTaiji');
    if (!cv || typeof ICTaiji === 'undefined') return;
    const dpr = window.devicePixelRatio || 1;
    const cssSize = 54;                    // 与 .lh-sym 的 font-size 对应
    cv.width = cssSize * dpr;
    cv.height = cssSize * dpr;
    cv.style.width = cssSize + 'px';
    cv.style.height = cssSize + 'px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ICTaiji.draw(ctx, cssSize / 2, cssSize / 2, cssSize / 2 - 1, {
      stroke: 'rgba(35,32,27,.28)', lineWidth: 1
    });
  }

  /* ===============================================================
   * 渲染
   * =============================================================== */

  function render() {
    const wrap = $('#learnWrap');
    if (!wrap) return;
    wrap.innerHTML =
      sectionOrigin() +
      sectionTrigrams() +
      sectionHexagrams() +
      sectionTones() +
      sectionYao() +
      sectionEightTone() +
      sectionBooks();
    bindCollapse(wrap);
    bindHex64();
    bindHex64Search();
    bindHex64Finder();
    drawTaijiHero();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }

})();
