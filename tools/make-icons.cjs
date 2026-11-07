// アプリのアイコン（icon-192.png・icon-512.png）を作る。生成りの地に、白い薬の袋と朱の帯。
// 使い方: node tools/make-icons.cjs（qa/ の playwright を使う）
const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "qa", "node_modules", "playwright"));
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  for (const s of [192, 512]) {
    const p = await b.newPage({ viewport: { width: s, height: s } });
    await p.setContent(`<body style="margin:0"><svg width="${s}" height="${s}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" fill="#f5efe2"/>
      <path d="M24 18 L76 18 L80 84 Q80 88 76 88 L24 88 Q20 88 20 84 Z" fill="#fff" stroke="#1f2a44" stroke-width="3"/>
      <rect x="20" y="30" width="60" height="9" fill="#b8402a"/>
      <text x="50" y="62" font-size="17" text-anchor="middle" fill="#1f2a44" font-family="'Noto Sans CJK JP',sans-serif" font-weight="900">食後</text>
      <text x="50" y="80" font-size="11" text-anchor="middle" fill="#4f566a" font-family="'Noto Sans CJK JP',sans-serif" font-weight="900">1日3回</text></svg></body>`);
    await p.screenshot({ path: path.join(__dirname, "..", `icon-${s}.png`), clip: { x: 0, y: 0, width: s, height: s } });
  }
  await b.close();
})();
