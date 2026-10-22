/**
 * 识象页 —— 拍照识别物象并起卦
 *
 * 设计目标：让用户永远能选到东西，任何分支都不出现死路。
 *   1. 拍照 → 云函数识别 → 候选卡（可改选）
 *   2. 未开通云服务 → 直接进手动模式，展示全部 203 个物象
 *   3. 识别失败 → 提示重拍，同时给搜索框
 *   4. 永远有「手动选」入口，不设关闭
 */

const app = getApp();
const R = require('../../core/recognize.js');
const V = require('../../core/vision.js');
const H = require('../../core/hexagram.js');
const D = require('../../core/data.js');

const MAX_PHOTOS = 3;

Page({
  data: {
    /* 阶段：idle 拍照 / recognizing 识别中 / done 出结果 */
    stage: 'idle',
    photos: [],
    /* 云服务可用性 */
    cloudReady: false,
    /* 识别结果 */
    candidates: [],
    selectedIndex: -1,
    hint: '',
    allFallback: false,
    empty: false,
    /* 手动模式 */
    manualMode: false,
    searchKw: '',
    searchResults: [],
    library: [],
    categories: [],
    activeCategory: '居家',
    categoryItems: [],
    /* 卦象 */
    result: null,
    errorMsg: ''
  },

  onLoad() {
    const cloudReady = !!(wx.cloud && app.globalData.cloudInited);
    const library = R.flattenLibrary();
    const first = library.find((g) => g.category === '居家') || library[0];
    this.setData({
      cloudReady,
      library,
      categories: library.map((g) => g.category),
      activeCategory: first ? first.category : '',
      categoryItems: first ? first.items : []
    });
    if (!cloudReady) {
      // 未配置云环境：直接给手动模式，不让用户面对空白页
      this.enterManual('尚未开通云开发，已为你打开手动选物象。拍照识别需要在开发者工具里配置云环境后启用。');
    }
  },

  /* =============================================================
   * 拍照
   * ============================================================= */

  takePhoto() {
    const self = this;
    wx.chooseMedia({
      count: MAX_PHOTOS - this.data.photos.length,
      mediaType: ['image'],
      sourceType: this.data.photos.length ? ['album', 'camera'] : ['camera', 'album'],
      sizeType: ['compressed'],
      success(res) {
        const picked = res.tempFiles.map((f) => ({
          path: f.tempFilePath,
          size: f.size
        }));
        self.setData({
          photos: self.data.photos.concat(picked),
          stage: 'idle',
          result: null
        });
      },
      fail() { /* 用户取消，不提示 */ }
    });
  },

  fromAlbum() {
    const self = this;
    wx.chooseMedia({
      count: MAX_PHOTOS - this.data.photos.length,
      mediaType: ['image'],
      sourceType: ['album'],
      sizeType: ['compressed'],
      success(res) {
        const picked = res.tempFiles.map((f) => ({
          path: f.tempFilePath,
          size: f.size
        }));
        self.setData({
          photos: self.data.photos.concat(picked),
          stage: 'idle',
          result: null
        });
      },
      fail() {}
    });
  },

  removePhoto(e) {
    const idx = e.currentTarget.dataset.idx;
    const photos = this.data.photos.slice();
    photos.splice(idx, 1);
    this.setData({ photos });
  },

  previewPhoto(e) {
    const idx = e.currentTarget.dataset.idx;
    wx.previewImage({
      current: this.data.photos[idx].path,
      urls: this.data.photos.map((p) => p.path)
    });
  },

  /* =============================================================
   * 识别
   * ============================================================= */

  async recognize() {
    if (!this.data.photos.length) {
      wx.showToast({ title: '先拍一张照片', icon: 'none' });
      return;
    }
    if (!this.data.cloudReady) {
      this.enterManual('云服务未配置，已切换到手动选物象。');
      return;
    }

    this.setData({ stage: 'recognizing', errorMsg: '', candidates: [], result: null });

    try {
      // 只用第一张作为起卦依据：梅花易数取"所见一物"，
      // 多张会让卦象含义混乱，故允许多拍但取主体图。
      const fileID = await this.upload(this.data.photos[0].path);
      const ui = await V.recognizeByCloud('vision', fileID);

      if (ui.empty || !ui.candidates.length) {
        this.setData({
          stage: 'done',
          empty: true,
          hint: ui.hint
        });
        return;
      }
      this.setData({
        stage: 'done',
        candidates: ui.candidates,
        selectedIndex: ui.defaultIndex >= 0 ? ui.defaultIndex : 0,
        hint: ui.hint,
        allFallback: !!ui.allFallback,
        empty: false
      });
    } catch (e) {
      const msg = (e && e.message) || '识别失败';
      this.setData({
        stage: 'done',
        errorMsg: msg,
        hint: '没能识别这张照片（' + msg + '）。你可以重拍，或直接在下方搜索名字手动选择——两种方式取卦完全一样。'
      });
    }
  },

  /** 上传到云存储取 fileID */
  upload(localPath) {
    return new Promise((resolve, reject) => {
      wx.cloud.uploadFile({
        cloudPath: 'vision/' + Date.now() + '-' + Math.floor(Math.random() * 1e6) + '.jpg',
        filePath: localPath,
        success: (res) => resolve(res.fileID),
        fail: (err) => reject(new Error((err && err.errMsg) || '上传失败'))
      });
    });
  },

  /* =============================================================
   * 选卦
   * ============================================================= */

  /** 点候选卡改选 */
  selectCandidate(e) {
    const idx = e.currentTarget.dataset.idx;
    if (idx === this.data.selectedIndex) return;
    this.setData({ selectedIndex: idx });
  },

  /** 点物象库某项 */
  selectFromLibrary(e) {
    const gua = e.currentTarget.dataset.gua;
    const name = e.currentTarget.dataset.name;
    this.castByGua(name, gua);
  },

  /** 点搜索结果 */
  selectSearch(e) {
    const gua = e.currentTarget.dataset.gua;
    const name = e.currentTarget.dataset.name;
    this.setData({ searchKw: '', searchResults: [] });
    this.castByGua(name, gua);
  },

  /** 统一起卦入口 */
  castByGua(imageName, gua) {
    try {
      const now = new Date();
      const r = H.imageHexagram(imageName, gua, now);
      this.setData({
        result: {
          imageName,
          gua,
          guaName: D.TRIGRAMS[gua].name,
          guaSymbol: D.TRIGRAMS[gua].symbol,
          guaNature: D.TRIGRAMS[gua].attribute || '',
          hexName: r.hex.name,
          hexSymbol: r.hex.symbol,
          xiang: r.hex.xiang,
          hint: r.hex.hint,
          movingLine: r.movingLine,
          music: {
            modeName: r.music.modeName,
            lvName: r.music.lvName,
            voiceText: r.music.voiceText,
            tempo: r.music.tempo
          }
        }
      });
      setTimeout(() => wx.pageScrollTo({ scrollTop: 9999, duration: 400 }), 80);
    } catch (e) {
      console.error('起卦失败', e);
      wx.showToast({ title: '起卦失败', icon: 'none' });
    }
  },

  /** 用当前选中的候选起卦 */
  castSelected() {
    const c = this.data.candidates[this.data.selectedIndex];
    if (!c) return;
    this.castByGua(c.image || c.label, c.gua);
  },

  /* =============================================================
   * 手动模式
   * ============================================================= */

  enterManual(reason) {
    this.setData({
      manualMode: true,
      stage: 'idle',
      hint: reason || '手动选物象：搜索或直接浏览，取卦效果与拍照一致。',
      candidates: []
    });
  },

  onSearchInput(e) {
    const kw = e.detail.value;
    this.setData({
      searchKw: kw,
      searchResults: kw ? R.searchImages(kw, 20) : []
    });
  },

  clearSearch() {
    this.setData({ searchKw: '', searchResults: [] });
  },

  onCategoryTap(e) {
    const cat = e.currentTarget.dataset.cat;
    // WXML 不能调 JS 方法，故在此处预计算该分类的物象
    const g = this.data.library.find((x) => x.category === cat);
    this.setData({
      activeCategory: cat,
      categoryItems: g ? g.items : []
    });
  },

  goDetail() {
    if (!this.data.result) return;
    const r = this.data.result;
    wx.navigateTo({
      url: '/pages/detail/detail?source=image&gua=' + r.gua +
        '&image=' + encodeURIComponent(r.imageName)
    });
  }
});