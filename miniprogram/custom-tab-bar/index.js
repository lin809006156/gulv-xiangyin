/**
 * 自定义底部标签栏
 * ---------------------------------------------------------------
 * 用原生 tabBar 画不出「玻璃胶囊」，故走自定义（app.json 里 custom: true）。
 * 图标以矢量块拼出，不依赖图片资源，包体零增长。
 */
Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/index/index', text: '起卦' },
      { pagePath: '/pages/music/music', text: '音乐' },
      { pagePath: '/pages/learn/learn', text: '学易' }
    ]
  },
  methods: {
    onTap(e) {
      const { index, path } = e.currentTarget.dataset;
      this.setData({ selected: index });
      wx.switchTab({ url: path });
    },
    /** 由各页面在 onShow 时调用，保证图标与当前页一致 */
    setSelected(index) {
      if (this.data.selected !== index) this.setData({ selected: index });
    }
  }
});
