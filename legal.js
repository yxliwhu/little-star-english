'use strict';
(() => {
  const content = {
    'zh-CN': {
      title:'版权与使用说明', short:'个人及家庭学习 · 非营利 · 教材版权归原权利人所有',
      sections:[
        ['使用目的','本站仅作为个人及家庭英语学习的辅助页面，按非营利用途提供，不用于销售教材或商业分发。'],
        ['版权与归属','Kid’s Box 教材、课本图片、原版音视频及相关商标的权利归各自权利人所有。本站不主张对这些教材素材拥有版权，也不代表教材出版方或学校。'],
        ['授权与使用范围','本用途说明及网站访问码不构成教材素材的版权许可、转授权或权利豁免。转载、再分发或商业使用前，请向相关权利人确认许可。'],
        ['AI 配音与隐私','部分互动提示和英语示范为 AI 生成，与教材原声音轨分别标注。学习进度保存在当前浏览器；口语录音只在当前页面回放，离开说话页面或切换单元即清除，不上传服务器。'],
        ['权利联系','如权利人对本站展示内容有异议，请通过项目页面联系维护者，我们会核实并及时处理，包括更正或移除相关内容。']
      ],contact:'联系维护者',permissions:'版权与许可信息'
    },
    'zh-HK': {
      title:'版權與使用說明',short:'個人及家庭學習 · 非牟利用途 · 教材版權歸原權利人所有',
      sections:[
        ['使用目的','本站僅作個人及家庭英語學習的輔助頁面，以非牟利用途提供，不用作銷售教材或商業分發。'],
        ['版權與歸屬','Kid’s Box 教材、課本圖片、原版影音及相關商標的權利歸各自權利人所有。本站不主張擁有這些教材素材的版權，亦不代表教材出版方或學校。'],
        ['授權與使用範圍','本用途說明及網站存取碼不構成教材素材的版權許可、轉授權或權利豁免。轉載、再分發或商業使用前，請先向相關權利人確認許可。'],
        ['AI 配音與私隱','部分互動提示及英語示範由 AI 生成，與教材原聲音軌分別標示。學習進度儲存在目前瀏覽器；口語錄音只在目前頁面播放，離開講話頁面或切換單元即清除，不會上傳伺服器。'],
        ['權利聯絡','如權利人對本站展示內容有異議，請透過項目頁面聯絡維護者。我們會核實並及時處理，包括更正或移除相關內容。']
      ],contact:'聯絡維護者',permissions:'版權與許可資訊'
    },
    'en-GB': {
      title:'Copyright & use',short:'Personal and family learning · Non-profit · Course material belongs to its rights holders',
      sections:[
        ['Purpose','This independent website supports personal and family English learning on a non-profit basis. It is not intended for selling course materials or commercial distribution.'],
        ['Rights and ownership','Rights in the Kid’s Box course, coursebook images, original audio and video, and associated trademarks belong to their respective rights holders. This site claims no ownership of those materials and does not represent the publisher or a school.'],
        ['Permission and reuse','This statement and the site access code do not grant a copyright licence, permission to redistribute materials, or an exemption from applicable rights. Confirm permission with the relevant rights holder before republication, redistribution or commercial use.'],
        ['AI voices and privacy','Some guidance and English examples are AI-generated and are labelled separately from original course recordings. Progress stays in this browser. Speaking recordings play only on the current page, are cleared when leaving the speaking page or switching units, and are not uploaded.'],
        ['Rights enquiries','Rights holders can contact the maintainer through the project page. We will review concerns and respond promptly, including correcting or removing material where appropriate.']
      ],contact:'Contact the maintainer',permissions:'Rights & permissions information'
    }
  };
  const escape = text => String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const get = locale => content[locale] || content['zh-CN'];
  window.LEARNING_LEGAL = {
    title:locale=>get(locale).title,
    short:locale=>get(locale).short,
    html(locale){const t=get(locale);return `<div class="legal-copy">${t.sections.map(([title,text])=>`<h3>${escape(title)}</h3><p>${escape(text)}</p>`).join('')}<p class="legal-links"><a href="https://github.com/yxliwhu/little-star-english" target="_blank" rel="noopener noreferrer">${escape(t.contact)}</a><a href="https://www.cambridge.org/rights-and-permissions/permissions-faqs" target="_blank" rel="noopener noreferrer">${escape(t.permissions)}</a></p></div>`;}
  };
})();
