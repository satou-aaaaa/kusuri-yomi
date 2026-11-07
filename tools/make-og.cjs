// SNS で貼られたときの絵（og.png 1200×630）を作る。今日の問題（答え）は入れず、遊び方の例（食間はいつ？）だけ。
// 使い方: node tools/make-og.cjs（qa/ の playwright を使う）
const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "qa", "node_modules", "playwright"));
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.setContent(`<body style="margin:0;font-family:'Noto Sans CJK JP','IPAPGothic',sans-serif">
  <div style="width:1200px;height:630px;box-sizing:border-box;padding:64px 80px;background:#f5efe2;background-image:linear-gradient(#dbe4ef 2px,transparent 2px),linear-gradient(90deg,#dbe4ef 2px,transparent 2px);background-size:40px 40px;color:#1f2a44;display:flex;gap:60px;align-items:center">
    <div style="flex:1">
      <div style="font-size:34px;color:#86291a;letter-spacing:.1em">大きな文字・押すだけ・時間制限なし</div>
      <div style="font-size:104px;font-weight:900;margin-top:10px;letter-spacing:.08em;color:#142a52">薬の袋<span style="color:#b8402a">よみ</span></div>
      <div style="font-size:40px;margin-top:6px">「食間」って、いつ飲む？</div>
    </div>
    <div style="width:330px;background:#fff;border:6px solid #1f2a44;border-radius:16px 16px 28px 28px;padding:24px 30px;box-shadow:0 10px 0 #1f2a4422">
      <div style="border-bottom:6px solid #b8402a;font-size:34px;font-weight:900;color:#86291a;padding-bottom:8px">おくすり</div>
      <div style="font-size:54px;font-weight:900;margin-top:18px">1日3回</div>
      <div style="font-size:54px;font-weight:900">食間</div>
      <div style="font-size:40px;font-weight:900;color:#4f566a">1回1包</div>
    </div>
  </div></body>`);
  await p.screenshot({ path: path.join(__dirname, "..", "og.png") });
  await b.close();
})();
