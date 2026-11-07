// 薬の袋よみの検査。問題の作り方（23種類×2000問を、ゲームとは別に書いた数え方で解き直す・答えが1つ）・今日の5問と上級の組み方（3年分）・
// 通しで遊ぶ・まちがい・ヒント・続きから・上級・練習（ボタンを全部押す）・とことん・ことば帳・実績・カレンダー・あとから・文字の大きさ・
// 言い方の決まり（医療の相談の代わりにしない）・出どころ・スマホ幅・PWA・引き継ぎコード・見やすさを確かめる。
// 使い方: node qa/run.mjs   失敗があれば終了コード 1。結果は qa-report/report.md。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { checkTransfer } from "./transfer-check.mjs";
import { checkSwStall } from "./sw-check.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail: String(detail).slice(0, 400) });
const G = createRequire(import.meta.url)(path.join(root, "gen.js"));

// ---- 1. 問題の作り方（ブラウザを使わない）----
// 時刻の答えは、資料の幅（食前は30分〜1時間前など）の中に答えがあり、まちがいの選び肢はどれもその外にあること。数の答えは別に数え直す
const toMin = (t) => { const m = String(t).match(/^(\d{1,2})時(?:(\d{1,2})分)?/); return m ? +m[1] * 60 + (+m[2] || 0) : NaN; };
const WIN = {
  after: (f) => [f.e, f.e + 30],          // 食後：食べ終わってから30分以内（仙台・堺・山形）
  before: (f) => [f.s - 60, f.s - 30],    // 食前：食べ始める30分〜1時間前（仙台・堺・東京）
  between: (f) => [f.e + 90, f.e + 150],  // 食間：食べ終わって およそ2時間後
  sleep: (f) => [f.sl - 45, f.sl - 15],   // 寝る前：寝るおよそ30分前
};
const near = (t, f, u) => { const [lo, hi] = WIN[t](f); return u >= lo - 15 && u <= hi + 15; }; // まちがいの選び肢は、答えの幅から15分より離す
{
  const bad = {}, seen = {}, fixedAns = {}, N = 2000;
  for (const k of G.KINDS) {
    for (let s = 0; s < N; s++) {
      const P = G.make(`${k.id}|qa${s}`), why = [], f = P.facts || {};
      if (P.opts.length !== 4 || new Set(P.opts).size !== 4 || P.opts.filter((o) => o === P.ans).length !== 1) why.push("選び肢が4つちがう・答えを1つ含む");
      if ([...P.bag, P.scene, P.q, P.why, ...P.opts].some((x) => typeof x !== "string" || !x || /undefined|NaN|null|Infinity/.test(x))) why.push("中身が空");
      if (!Array.isArray(P.src) || !P.src.length || P.src.some((x) => !G.SRC[x])) why.push("出どころが無い");
      if (WIN[f.t]) {
        const [lo, hi] = WIN[f.t](f), t = toMin(P.ans);
        if (!(t >= lo && t <= hi)) why.push(`答えの時刻が幅の外 ${P.ans}`);
        for (const o of P.opts) if (o !== P.ans) { const u = toMin(o); if (Number.isFinite(u) && near(f.t, f, u)) why.push(`まちがいの選び肢が答えに近い ${o}`); }
        if (f.t === "sleep" && !(f.sl - f.de >= 120)) why.push("夕ごはんと寝る時刻が近い");
      } else if (f.t === "mul") { if (P.ans !== f.v.reduce((a, b) => a * b, 1) + "錠") why.push("かけ算が合わない"); }
      else if (f.t === "left") { const [n, m, d, kk] = f.v; if (P.ans !== n * m * d - n * m * kk + "錠") why.push("のこりが合わない"); }
      else if (f.t === "div") { if (P.ans !== f.x / f.per + "日分") why.push("日数が合わない"); }
      else if (f.t === "add") { if (P.ans !== f.v[0] + f.v[1] + "回") why.push("回数が合わない"); }
      else if (f.t === "missEarly") { if (!(f.next - f.now >= 180 && /1回分/.test(P.ans))) why.push("飲み忘れ（早い）"); }
      else if (f.t === "missLate") { if (!(f.next - f.now <= 30 && /飲まず/.test(P.ans))) why.push("飲み忘れ（次が近い）"); }
      else if (f.t === "tonpuku") { if (P.ans !== f.sym + "だけ（必要なとき）" || !P.bag[0].includes(f.sym)) why.push("頓服の答えが袋と合わない"); }
      else if (f.t === "fixed") { (fixedAns[k.id] = fixedAns[k.id] || new Set()).add(P.ans.replace(/^\d+時\d*分?/, "")); }
      else why.push("確かめ方が無い種類");
      if (P.opts.some((o) => /2回分/.test(o) && o === P.ans)) why.push("2回分を飲むのが答えになっている");
      if (JSON.stringify(G.make(`${k.id}|qa${s}`)) !== JSON.stringify(P)) why.push("同じ種で同じ問題にならない");
      seen[k.id] = seen[k.id] || new Set(); seen[k.id].add(P.bag.join("/") + P.scene + ">" + P.ans);
      if (why.length && !(bad[k.id] || []).length) bad[k.id] = [why.join("・") + "：" + P.scene + " → " + P.ans + " / " + P.opts.join(" ")];
    }
  }
  check(`問題：${G.KINDS.length}種類×${N}問で、選び肢4つ・答えは1つ・別の数え方で解き直しても同じ・まちがいの選び肢は資料の幅に入らない`, Object.keys(bad).length === 0, JSON.stringify(bad));
  check("問題：決まった答えの種類は、いつも同じ答え（場面で答えが変わらない）", Object.values(fixedAns).every((x) => x.size === 1), JSON.stringify(Object.fromEntries(Object.entries(fixedAns).map(([k, v]) => [k, [...v]]))));
  const few = G.KINDS.filter((k) => seen[k.id].size < 3).map((k) => `${k.id}:${seen[k.id].size}`);
  check("問題：どの種類も3通り以上の袋・場面が出る（同じ問題ばかりにならない）", few.length === 0, few.join(","));
  check("問題：種類は23（やさしい5・ふつう11・むずかしい7）", G.KINDS.length === 23 && [0, 1, 2].map((l) => G.kindsOf(l).length).join() === "5,11,7");
  const long = [];
  for (const k of G.KINDS) for (let i = 0; i < 50; i++) { const P = G.make(`${k.id}|len${i}`);
    if ([...P.why].length > 120) long.push(k.id + ":説明"); if ([...k.look].length > 45) long.push(k.id + ":ヒント"); if (P.bag.some((l) => [...l].length > 18)) long.push(k.id + ":袋"); if (P.opts.some((o) => [...o].length > 32)) long.push(k.id + ":選び肢"); if ([...P.scene].length > 80) long.push(k.id + ":場面"); }
  check("文は短く：説明120字・ヒント45字・袋の1行18字・選び肢32字・場面80字以内", !long.length, [...new Set(long)].join(","));
}
{
  // 今日の5問・上級の組み方（3年分）
  const bad = [], cover = new Set(); let sameAsPrev = 0, prev = "";
  const d0 = Date.parse("2026-11-07");
  for (let i = 0; i < 365 * 3; i++) {
    const d = new Date(d0 + i * 864e5).toISOString().slice(0, 10), dl = G.dailyTags(d), hl = G.hardTags(d);
    const dk = dl.map((t) => t.split("|")[0]), hk = hl.map((t) => t.split("|")[0]);
    if (dl.length !== 5 || new Set(dk).size !== 5 || dk.map((k) => G.BY[k].lv).join() !== "0,0,1,1,2") bad.push(d + " 今日");
    if (hl.length !== 3 || new Set(hk).size !== 3 || hk.some((k) => G.BY[k].lv !== 2) || hk.includes(dk[4])) bad.push(d + " 上級");
    if (JSON.stringify(dl) !== JSON.stringify(G.dailyTags(d))) bad.push(d + " 同じにならない");
    if (dk.join() === prev) sameAsPrev++; prev = dk.join();
    if (i < 60) [...dk, ...hk].forEach((k) => cover.add(k));
  }
  check("今日の5問（やさしい2・ふつう2・むずかしい1、種類は重ねない）と上級（むずかしい3・今日のむずかしいと別）を3年分作れる", bad.length === 0, bad.slice(0, 5).join(","));
  check("2か月のうちに23種類が全部出る・前の日と同じ組の日が少ない", cover.size === 23 && sameAsPrev < 20, `${cover.size}種類・前の日と同じ ${sameAsPrev}日`);
}

// ---- 2. ファイルの中身 ----
const html = readFileSync(path.join(root, "index.html"), "utf8"), gen = readFileSync(path.join(root, "gen.js"), "utf8");
const ext = [...html.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map((m) => m[1]).filter((u) => !/^https:\/\/fonts\.googleapis\.com(\/|$)|^https:\/\/ko-fi\.com\/satouaaaaa$|^https:\/\/(www\.city\.(sendai|sakai|nagano\.nagano)|toyaku\.or|www\.pref\.yamagata)\./.test(u));
check("外から読むのは文字（Google Fonts）だけ。スクリプト・広告・解析を入れない（出典のリンクは押したときに開くだけ）", ext.length === 0 && ![...html.matchAll(/<script[^>]+src="([^"]+)"/g)].some((m) => /^https?:/.test(m[1])), ext.join(","));
check("CSP で通信先を自分だけにしている", /connect-src 'self'/.test(html) && !/connect-src[^;"]*https/.test(html));
check("Math.random は練習・とことんの種だけ（今日の5問・上級は日付の乱数。gen.js には無い）", (html.match(/Math\.random/g) || []).length === 2 && !/Math\.random/.test(gen));
check("乱数は sort の比較の中で引かない（ブラウザで引く回数が変わる）", !/\.sort\(\s*\([^)]*\)\s*=>[^\n;]*\b(R|rng|rand|Math\.random)\s*\(/.test(html + gen));
check("一行の式の途中にコメント // を足さない（行の残りが消える。rosen-hitofude 2026-11-04）", !/;\s*\/\/[^\n]*;\s*\w/.test(gen.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")));
check("言い方：薬の効き目・治ることをうたわない（薬の名前・病気の名前で答えを決めない）", !/よく効く薬|治りま|治せ|効果があります|予防でき|飲めば安心/.test(html + gen.replace(/たくさん飲むほど よく効く/g, "") + readFileSync(path.join(root, "README.md"), "utf8")));
check("言い方：「このゲームについて」と遊び方に、本当の薬は医師・薬剤師の指示と説明書に従うこと・医療の相談の代わりではないこと", /医師・薬剤師の指示と、薬の説明書に従って/.test(html) && /医療の相談の代わりではありません/.test(html) && (html.match(/医師・薬剤師の指示/g) || []).length >= 2);
check("出どころは公的な資料（自治体・都道府県・薬剤師会）だけ", Object.values(G.SRC).every(([, u]) => /^https:\/\/(www\.city\.[a-z.]+\.jp|www\.pref\.[a-z]+\.jp|toyaku\.or\.jp)\//.test(u)) && G.KINDS.every((k) => G.make(k.id + "|src").src.length >= 1));
check("画面にお笑いの言葉を入れない（本物っぽく）", !/お笑い|ギャグ|ツッコミ|なんでやねん|（うそ）/.test(html));
check("引き継ぎ：transfer.js をゲームの script より前に、このゲームの記録のキーだけで読む", /<script src="transfer\.js" data-game="kusuri-yomi" data-keys="kusuri-v1,kusuri-fs"><\/script>\s*<\/head>/.test(html) && html.indexOf('src="transfer.js"') < html.indexOf('src="gen.js"') && /data-hk/.test(html) && existsSync(path.join(root, "transfer.js")));
{ const og = (k) => (html.match(new RegExp(`<meta (?:property|name)="${k}" content="([^"]+)"`)) || [])[1] || "";
  const png = readFileSync(path.join(root, "og.png"));
  check("SNS で貼ると絵と題が出る（OGP・1200×630・絶対URL）", og("og:title") && og("og:description") && og("og:image") === "https://satou-aaaaa.github.io/kusuri-yomi/og.png" && og("twitter:card") === "summary_large_image" && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630); }
{ const fy = readFileSync(path.join(root, ".github/ISSUE_TEMPLATE/feedback.yml"), "utf8");
  check("感想フォームの name が3字以上（2字だとフォームが出ない。shared-workflows incidents/2026-11-05-feedback-form-not-shown.md）", [...((fy.match(/^name:\s*(.+)$/m) || [])[1] || "").trim()].length >= 3);
  check("感想フォームは名前・メールを聞かない", /id: fun/.test(fy) && !/id: (name|email|mail)/.test(fy) && /labels: \["感想"\]/.test(fy)); }
check("README の URL のすぐ後ろに全角の字を続けない（Link check が URL の一部と読む）", !/https?:\/\/[\x21-\x7e]*[^\x00-\x7f]/.test(readFileSync(path.join(root, "README.md"), "utf8").replace(/\]\(https?:\/\/[^)\s]+\)/g, "").replace(/<https?:\/\/[^>\s]+>/g, "")));
{ const sw = readFileSync(path.join(root, "sw.js"), "utf8"), mf = JSON.parse(readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
  const shell = JSON.parse(sw.match(/SHELL = (\[[^\]]+\])/)[1]);
  check("PWA：sw.js は画面のファイルを全部保存し（引き継ぎの transfer.js も）、外へ何も送らない", ["./index.html", "./gen.js", "./transfer.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"].every((f) => shell.includes(f)) && !/https?:\/\//.test(sw.replace(/^\/\/.*$/gm, "")));
  check("PWA：install は取り直して保存する（cache: reload）", /new Request\(u, \{ cache: "reload" \}\)/.test(sw));
  { const st = await checkSwStall(sw); check("PWA：本文の途中で通信が止まっても4秒で保存したものを返す・ふつうはネットの返事", st.ok, JSON.stringify(st)); }
  check("PWA：manifest にアイコン2つと名前がある", mf.name === "薬の袋よみ" && mf.icons.length >= 2 && mf.start_url === "./"); }

// ---- 3. ブラウザで遊ぶ ----
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname), f = path.join(root, p === "/" ? "index.html" : p);
  if ((f !== root && !f.startsWith(root + path.sep)) || !existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); res.end(readFileSync(f));
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
const TODAY = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const dayBefore = (n) => new Date(Date.parse(TODAY) - n * 864e5).toISOString().slice(0, 10);
async function newPage(w = 390, ctx) {
  let c = ctx;
  // 日付で決まる問題を見るので、ブラウザの時計を TODAY の昼（日本時間）に止める（QA の途中で0時をまたいでも落ちない）
  if (!c) { c = await browser.newContext({ viewport: { width: w, height: 800 } }); await c.clock.setFixedTime(new Date(TODAY + "T03:00:00Z")); }
  await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED|net::/.test(m.text())) errors.push(m.text()); });
  await p.goto(url); await p.waitForTimeout(200);
  return p;
}
const closeHow = async (p) => { if (await p.locator("#howto[open]").count()) await p.click("#howto-ok"); };
const ansIdx = (p) => p.evaluate(() => { const c = __ky.cur(); return c.P.opts.indexOf(c.P.ans); });
const wrongIdx = (p) => p.evaluate(() => { const c = __ky.cur(); return c.P.opts.findIndex((o) => o !== c.P.ans && !c.wrong.includes(o)); });
const mem = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("kusuri-v1") || "{}"));
async function solve(p, { wrong = 0 } = {}) {
  for (let i = 0; i < wrong; i++) await p.click(`.ch[data-j="${await wrongIdx(p)}"]`);
  await p.click(`.ch[data-j="${await ansIdx(p)}"]`);
  await p.waitForSelector(".verdict");
}

try {
  // はじめて：遊び方が出る・文字の大きさ
  const p = await newPage();
  check("はじめて開くと遊び方が出る", await p.locator("#howto[open]").count() === 1);
  check("遊び方にも「医療の相談の代わりではありません」", /医療の相談の代わりではありません/.test(await p.textContent("#howto")));
  check("遊ぶ前の画面に Ko-fi を出さない（結果の画面だけ）", await p.locator('a[href*="ko-fi"]').count() === 0);
  check("上級ははじめての日から押せる（今日の5問の前でも）", await p.locator("#go-h").count() === 1);
  await p.click("#howto-ok");
  check("文字の大きさ：はじめは「大きい」（21px）", await p.evaluate(() => getComputedStyle(document.documentElement).fontSize) === "21px");
  await p.click('.fsrow button[data-fs="3"]');
  await p.reload(); await p.waitForTimeout(150);
  await p.evaluate(() => localStorage.setItem("kusuri-fs", "2.5")); await p.reload(); await p.waitForTimeout(150);
  check("文字の大きさ：1・2・3 以外（2.5 など）は「大きい」にもどす", await p.evaluate(() => getComputedStyle(document.documentElement).fontSize) === "21px");
  await p.click('.fsrow button[data-fs="3"]'); await p.reload(); await p.waitForTimeout(150);
  check("文字の大きさ：「とても大きい」にすると開き直しても残る", await p.evaluate(() => getComputedStyle(document.documentElement).fontSize) === "25px" && await p.locator('.fsrow button[data-fs="3"][aria-pressed="true"]').count() === 1);
  await p.click('.fsrow button[data-fs="2"]');
  check("ホームに今日のひとこと（出どころつき）が出る", (await p.textContent("#tip")).includes("今日のひとこと") && /（(仙台市|堺市|東京都薬剤師会)）/.test(await p.textContent("#tip")));

  // 今日の5問：1問目はまちがえる、2問目はヒント2回、ほかはそのまま
  await p.click("#go-d");
  const tags = await p.evaluate(() => __ky.load().runs.d.list);
  check("今日の5問は日付から決まる（gen.js の dailyTags と同じ）", JSON.stringify(tags) === JSON.stringify(G.dailyTags(TODAY)));
  check("問題の画面：薬の袋・場面・問いと、大きな選び肢4つ（高さ72px以上）", await p.locator(".bag .bl").count() >= 1 && (await p.textContent("#scene")).length > 3 && (await p.textContent("#q")).length > 3 && (await p.$$eval(".ch", (b) => b.map((x) => x.getBoundingClientRect().height))).every((h) => h >= 72) && await p.locator(".ch").count() === 4);
  check("薬の袋には読み上げ用の名前がある・問いは袋と場面ごと読める", (await p.getAttribute(".bag", "aria-label")).startsWith("薬の袋：") && (await p.getAttribute("#q", "aria-label")).includes("薬の袋："));
  await p.click(`.ch[data-j="${await wrongIdx(p)}"]`);
  check("まちがえると ✕ の印と「ちがう」の文字（色だけで分けない）・知らせは role=status", await p.locator(".ch.ng").count() === 1 && (await p.evaluate(() => getComputedStyle(document.querySelector(".ch.ng"), "::after").content)).includes("ちがう") && (await p.textContent("#msg")).includes("ちがいます") && await p.getAttribute("#msg", "role") === "status");
  // 開き直しても、まちがえた選び肢は残る
  await p.reload(); await p.waitForTimeout(150); await p.click("#go-d");
  check("途中で閉じても続きから（同じ問題・まちがえた印のまま）", await p.locator(".ch.ng").count() === 1 && await p.evaluate(() => __ky.cur().i) === 0);
  await solve(p);
  check("正解すると ✓ の印・答えの説明・出どころのリンク・★2（まちがい1回）", await p.locator(".ch.ok").count() === 1 && (await p.textContent(".verdict .why")).length > 6 && await p.locator(".verdict .src a").count() >= 1 && (await p.getAttribute(".verdict .stars", "aria-label")) === "星2つ");
  await p.click("#next");
  await p.click("#hint");
  check("ヒント1は見るところを言う（答えは言わない）", (await p.textContent("#hintbox")).includes("💡") && await p.locator(".ch.ng").count() === 0);
  await p.click("#hint");
  check("ヒント2はまちがいの選び肢を消し、2つにしぼる・ヒントは2回まで", await p.locator(".ch.ng").count() === 2 && await p.locator("#hint:disabled").count() === 1);
  await solve(p);
  check("ヒント2回は★1", (await p.getAttribute(".verdict .stars", "aria-label")) === "星1つ");
  await p.click("#next");
  for (let i = 2; i < 5; i++) { await solve(p); await p.click("#next"); }
  await p.waitForTimeout(150);
  const s1 = await mem(p);
  check("5問で結果：今日の記録に1問ごとのまちがい（1・2・0・0・0）", JSON.stringify(s1.days[TODAY]?.m) === "[1,2,0,0,0]");
  const share = await p.textContent(".share");
  check("シェアの文に答え・問題を出さない（印だけ）", /第\d+回/.test(share) && /🟢/.test(share) && !/錠|時|食後|食前|食間|頓服|目薬|湿布/.test(share.replace(/第\d+回|\d+\/\d+|まちがいなし|薬の袋よみ/g, "")), share);
  check("まちがいのある日は Ko-fi の一言を出さない", await p.locator(".kofi").count() === 0);
  check("結果に「あと少しの実績」と、続けて遊ぶ・上級のボタン", await p.locator("#achnext").count() === 1 && await p.locator("#go-e").count() === 1 && await p.locator("#go-h").count() === 1);
  check("ことば帳に解いた種類が載る", Object.keys(s1.dex).length === 5);
  await p.click("#back");
  check("今日を終えたら、ホームは「今日の結果を見る」と上級", (await p.textContent("#go-d")).includes("結果") && await p.locator("#go-h").count() === 1);
  // 上級：ヒントなし・3問
  await p.click("#go-h");
  check("上級はヒントのボタンが無い・3問", await p.locator("#hint").count() === 0 && (await p.evaluate(() => __ky.load().runs.h.list.length)) === 3);
  for (let i = 0; i < 3; i++) { await solve(p); await p.click("#next"); }
  await p.waitForTimeout(150);
  check("上級の記録は hdays に入る", (await mem(p)).hdays[TODAY]?.m.length === 3);
  // 練習：記録を増やさない
  await p.click("#back"); await p.click("#go-p"); await p.click('.lv button[data-t="2"]');
  const before = await mem(p);
  for (let i = 0; i < 5; i++) { await solve(p); await p.click("#next"); }
  await p.waitForTimeout(150);
  const after = await mem(p);
  check("練習は今日の記録を増やさない（ことば帳の数はふえる）", JSON.stringify(after.days) === JSON.stringify(before.days) && Object.values(after.dex).reduce((a, b) => a + b) === Object.values(before.dex).reduce((a, b) => a + b) + 5);
  // 練習のボタンは全部、押すと問題が出る（2026-11-07 手当てじゅんばんで「ぜんぶまぜる」がホームに戻っていた）
  for (const t of ["0", "1", "2"]) {
    await p.click("#back"); await p.click("#go-p"); await p.click(`.lv button[data-t="${t}"]`);
    const pl = await p.evaluate(() => (__ky.load().runs.p || {}).list || []);
    check(`練習「${t}」を押すと、その難しさの問題が5問並ぶ`, pl.length === 5 && pl.every((x) => G.BY[x.split("|")[0]]?.lv === +t) && await p.locator(".ch").count() === 4);
  }
  // ことば帳からその言葉だけで練習
  await p.click("#back"); await p.click("#go-dex");
  const firstKind = await p.getAttribute(".book button", "data-k");
  await p.click(".book button");
  check("ことば帳の言葉を押すと、その言葉だけで練習", (await p.evaluate(() => __ky.load().runs.p.list)).every((t) => t.startsWith(firstKind + "|")));
  // とことん：🌸3つ、4回目のまちがいで終わる
  await p.click("#back"); await p.click("#go-e");
  check("とことんは🌸3つから", await p.evaluate(() => __ky.load().runs.e.life) === 3 && (await p.evaluate(() => __ky.load().runs.e.list.length)) === 100);
  await solve(p); await p.click("#next"); await solve(p); await p.click("#next");
  await solve(p, { wrong: 2 }); await p.click("#next");
  await p.click(`.ch[data-j="${await wrongIdx(p)}"]`);
  check("まちがいのたびに🌸がへる", await p.evaluate(() => __ky.load().runs.e.life) === 0);
  check("🌸が無いとヒントは押せない", await p.locator("#hint:disabled").count() === 1);
  await p.click(`.ch[data-j="${await wrongIdx(p)}"]`);
  await p.waitForSelector(".verdict.lose", { timeout: 3000 }).catch(() => {});
  check("🌸が無いときにまちがえると「ここまで」（答えと説明を見せる）", await p.locator(".verdict.lose").count() === 1 && (await p.textContent(".verdict.lose")).includes("答え："));
  // 「ここまで」のあとに開き直しても、続きからにならず結果へ進む（🌸0のまま続けて自己ベストを水増しさせない。2026-11-05 CodeRabbit）
  await p.reload(); await p.waitForTimeout(250);
  check("とことんの「ここまで」は開き直しても続きからにならない", await p.locator("#eres").count() === 1 && await p.locator(".ch").count() === 0);
  check("とことんの自己ベストが残る（3問）", (await mem(p)).ebest === 3 && (await p.textContent("#eres")).includes("3問"));
  {
    // 引き継ぎコードなどで数の所に文字が入っても、画面に HTML として出さない（2026-11-05 CodeRabbit）
    const q = await newPage(); await closeHow(q);
    await q.evaluate(() => { const s = JSON.parse(localStorage.getItem("kusuri-v1")) || { v: 1 }; s.ebest = '<img id="xss" src=x>'; s.dex = { shokugo: '"><b id="xss2">' }; s.runs = { e: { mode: "e", id: "x", date: "2026-11-05", list: ["shokugo|1"], res: [], life: '"><i id="xss3">' }, h: { list: "bad", res: [] }, p: { mode: "p", id: "y", date: "2026-11-05", list: ["constructor|1"], res: [] }, d: { mode: "d", id: "z", date: "x", list: ["shokugo|1"], res: [] }, a1: { mode: "a", id: "a1", date: "2026-11-04", list: ["shokugo|1"], res: [null] }, a2: { mode: "a", id: "a2", date: "2026-11-03", list: "bad", res: [] }, a3: { mode: "a", id: "a3", date: "2026-11-02", list: ["shokugo|1", "shokugo|2"], res: [{ m: 0 }], cur: { i: 1, tag: "shokugo|2", wrong: "x", hints: 0 } } }; s.days = { "2026-11-05": { m: "x" }, bad: { m: [0] }, "2026-02-30": { m: [0] } }; localStorage.setItem("kusuri-v1", JSON.stringify(s)); });
    await q.reload(); await q.waitForTimeout(250);
    const st = await q.evaluate(() => __ky.load());
    check("記録の形を直す：数の所の文字は0に・形のちがう途中経過と日ごとの記録は捨てる", st.ebest === 0 && st.dex.shokugo === 0 && st.runs.e.life === 0 && !("h" in st.runs) && !("p" in st.runs) && !("d" in st.runs) && !("a1" in st.runs) && !("a2" in st.runs) && st.runs.a3 && st.runs.a3.cur === null && Object.keys(st.days).length === 0);
    await q.click("#go-e").catch(() => {}); await q.waitForTimeout(150);
    check("記録の文字を HTML として出さない", await q.locator("#xss, #xss2, #xss3").count() === 0);
    await q.context().close();
  }
  // 実績・このゲームについて
  await p.click("#back"); await p.click("#go-ach");
  check("実績は13個で、腕前・集める・続けるの3つの組", await p.locator(".ach").count() === 13 && await p.locator(".agrp").count() === 3 && await p.locator(".ach.got").count() >= 3);
  check("達成した実績は ✓ の文字も付く（色だけで分けない）", (await p.textContent(".ach.got b")).startsWith("✓"));
  await p.click("#back"); await p.click("#f-about");
  check("このゲームについて：本当の薬は医師・薬剤師に・出どころ5つ", (await p.textContent("#about")).includes("医療の相談の代わりではありません") && await p.locator("#about a").count() >= 5);
  await p.context().close();

  // まちがいなしの日は Ko-fi を1回だけ
  {
    const q = await newPage(); await closeHow(q); await q.click("#go-d");
    for (let i = 0; i < 5; i++) { await solve(q); await q.click("#next"); }
    await q.waitForTimeout(150);
    check("全部まちがいなしで初めて終えたときだけ Ko-fi の一言", await q.locator(".kofi").count() === 1 && (await q.textContent(".big")).includes("まちがいなし"));
    await q.click("#back"); await q.click("#go-d");
    check("結果をもう一度見ても Ko-fi は出さない", await q.locator(".kofi").count() === 0);
    await q.context().close();
  }

  // カレンダー・あとから：過去の日の記録を置いて見る
  {
    // 公開から日が浅いうちは「あとから」遊べる日が無いので、時計を第11回の日に進めて見る（今日がそれより後なら今日のまま）
    const CAL = TODAY >= "2026-11-17" ? TODAY : "2026-11-17", dayBefore = (n) => new Date(Date.parse(CAL) - n * 864e5).toISOString().slice(0, 10);
    const cctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    await cctx.clock.setFixedTime(new Date(CAL + "T03:00:00Z"));
    const q = await newPage(390, cctx);
    await q.evaluate(([d2, d3]) => { localStorage.setItem("kusuri-v1", JSON.stringify({ v: 1, tut: true, days: { [d2]: { m: [0, 0, 0, 0, 0], k: [] }, [d3]: { m: [1, 0, 0, 2, 0], k: [] } }, hdays: {}, adays: {}, dex: {}, runs: {}, kofi: {}, ach: {}, ebest: 0 })); }, [dayBefore(2), dayBefore(3)]);
    await q.reload(); await q.waitForTimeout(150);
    check("ホームの「続けて」は、きのうを休んだら — （休んだ日を責めない）", (await q.textContent(".stats")).includes("—"));
    await q.click("#go-cal");
    const lateList = await q.evaluate(() => __ky.lateDays(__ky.load()));
    const exp = [1, 4, 5, 6, 7].map(dayBefore).filter((d) => d >= "2026-11-07");
    check("カレンダー：取りこぼした過去7日（第1回より後）を押せる", JSON.stringify(lateList) === JSON.stringify(exp), lateList.join(","));
    check("カレンダー：遊んだ日は★の数の文字も付く", (await q.locator(".cal .c.p3").count()) + (await q.locator(".cal .c.p2").count()) + (await q.locator(".cal .c.p1").count()) >= (dayBefore(3).slice(0, 7) === CAL.slice(0, 7) ? 2 : 0));
    if (lateList.length) {
      const d = lateList[0];
      await q.evaluate((d) => { const b = document.querySelector(`.cal .miss[data-k="${d}"]`); if (b) b.click(); else { const m = document.querySelector(".calnav #prev"); m && m.click(); } }, d);
      if (!(await q.locator(".ch").count())) await q.click(`.cal .miss[data-k="${d}"]`);
      check("あとから：その日の今日の5問と同じ問題", JSON.stringify(await q.evaluate((d) => __ky.load().runs["a:" + d].list, d)) === JSON.stringify(G.dailyTags(d)));
      for (let i = 0; i < 5; i++) { await solve(q); await q.click("#next"); }
      await q.waitForTimeout(150);
      const s = await mem(q);
      check("あとからは adays に入り、今日の記録・続けた日には数えない", s.adays[d] && !s.days[d] && (await q.locator(".share").count()) === 0 && (await q.locator(".kofi").count()) === 0);
    } else check("あとから：遊べる日がある", false, "第1回の日から日がたっていない");
    await q.context().close();
  }

  // 古いタブ：同じ問題を2つのタブで開き、片方で答えたら、もう片方は二重に入れない
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const a = await newPage(390, ctx); await closeHow(a); await a.click("#go-d");
    const b = await ctx.newPage(); b.on("pageerror", (e) => errors.push(e.message)); await b.goto(url); await b.waitForTimeout(150); await b.click("#go-d");
    await solve(a);
    await b.click(`.ch[data-j="${await ansIdx(b)}"]`);
    await b.waitForTimeout(200);
    const s = await mem(a);
    check("古いタブで同じ問題に答えても二重に数えない", s.runs.d.res.length === 1 && Object.values(s.dex).reduce((x, y) => x + y) === 1);
    // ヒントの数は、別のタブで使った分も減らさない
    await a.click("#next"); await b.goto(url); await b.waitForTimeout(150); await b.click("#go-d");
    await a.click("#hint"); await a.click("#hint");
    await b.click("#hint");
    check("別のタブで使ったヒントの数を減らさない", (await mem(a)).runs.d.cur.hints === 2);
    // 片方でまちがえ、もう片方で正解しても、まちがいを数える（減点を0にしない）
    const wj = await a.evaluate(() => { const c = __ky.cur(); return [...document.querySelectorAll(".ch")].findIndex((el, j) => !el.disabled && c.P.opts[j] !== c.P.ans && !c.wrong.includes(c.P.opts[j])); });
    await a.click(`.ch[data-j="${wj}"]`); await a.waitForTimeout(100);
    await b.click(`.ch[data-j="${await ansIdx(b)}"]`); await b.waitForTimeout(200);
    check("別のタブのまちがい・ヒントも合わせて正解を記録する", (await mem(a)).runs.d.res[1]?.m === 3, JSON.stringify((await mem(a)).runs.d.res));
    await ctx.close();
  }

  // スマホ幅・とても大きい文字でもはみ出さない・押す所は44px以上
  {
    const bad = [], small = [];
    for (const [w, fs] of [[320, 3], [390, 2], [320, 1]]) {
      const q = await newPage(w); await closeHow(q);
      await q.evaluate((fs) => localStorage.setItem("kusuri-fs", String(fs)), fs); await q.reload(); await q.waitForTimeout(150);
      for (const go of [null, "#go-d", "solve", "#go-cal", "#go-dex", "#go-ach", "#go-e"]) {
        if (go === "solve") { await solve(q); }
        else if (go) { await q.goto(url); await q.waitForTimeout(100); await q.click(go); }
        await q.waitForTimeout(100);
        await q.evaluate(() => Promise.race([Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 1000))]));
        const ov = await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (ov > 0) bad.push(`${w}px 文字${fs} ${go || "ホーム"} ${ov}px`);
        small.push(...(await q.$$eval("button:not([disabled]), a[href]", (bs) => bs.filter((b) => b.checkVisibility() && !b.closest(".cal")).filter((b) => b.getBoundingClientRect().height < 44).map((b) => (b.id || b.className || b.textContent).slice(0, 20)))).map((x) => `${w}/${fs}/${go}:${x}`));
      }
      await q.context().close();
    }
    check("幅320px・とても大きい文字でも横にはみ出さない", bad.length === 0, bad.join(" / "));
    check("押せる所は高さ44px以上", small.length === 0, [...new Set(small)].slice(0, 8).join(","));
  }

  // 見やすさの設定を全部入れても、ページの一番下まで動ける（読み上げの class が html に当たって固まった。2026-11-05）
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 700 } });
    await ctx.addInitScript(() => localStorage.setItem("a11y-v1", JSON.stringify({ read: true, cvd: true, calm: true, say: true, ruby: true })));
    const q = await newPage(390, ctx); await closeHow(q);
    const r = await q.evaluate(() => { window.scrollTo(0, 1e5); const f = document.querySelector("footer").getBoundingClientRect(); return [scrollY, Math.round(f.bottom), innerHeight, getComputedStyle(document.documentElement).position]; });
    check("見やすさの設定を全部入れても、いちばん下まで動ける（html が固定されない）", r[0] > 0 && r[1] <= r[2] && r[3] === "static", r.join(","));
    await ctx.close();
  }
  // キーボードだけで遊べる（Tab と Enter）
  {
    const q = await newPage(); await closeHow(q);
    await q.focus("#go-d"); await q.keyboard.press("Enter"); await q.waitForTimeout(100);
    const j = await ansIdx(q);
    await q.focus(`.ch[data-j="${j}"]`); await q.keyboard.press("Enter"); await q.waitForTimeout(100);
    check("キーボードだけで選んで答えられる", await q.locator(".verdict").count() === 1);
    await q.context().close();
  }
} catch (e) { check("ブラウザでの検査が最後まで動く", false, e.stack.split("\n").slice(0, 3).join(" ")); }

// 引き継ぎコード（shared-workflows template/qa/transfer-check.mjs）
try {
  const sample = { "kusuri-v1": JSON.stringify({ v: 1, tut: true, days: { "2026-11-07": { m: [0, 1, 0, 0, 2], k: ["shokugo", "mizu", "shokkan", "hokan", "nokori"] } }, hdays: {}, adays: {}, dex: { shokugo: 1, mizu: 1, shokkan: 1, hokan: 1, nokori: 1 }, runs: {}, kofi: {}, ach: {}, ebest: 7, t: 1 }), "kusuri-fs": "3" };
  await checkTransfer({ browser, url, game: "kusuri-yomi", sample, check, open: async (pg) => { if (await pg.locator("#howto[open]").count()) await pg.click("#howto-ok"); } });
} catch (e) { check("引き継ぎの検査が最後まで動く", false, e.message.split("\n")[0]); }
await browser.close();
server.close();
check("画面のエラーが無い", errors.length === 0, errors.slice(0, 3).join(" | "));

{ // 見やすさ・読みやすさ・偏り（shared-workflows template/qa/a11y.mjs の写し）
  const { spawnSync } = await import("node:child_process");
  const a = spawnSync(process.execPath, [path.join(root, "qa", "a11y.mjs")], { encoding: "utf8", env: process.env });
  check("見やすさ・読みやすさの検査（qa/a11y.mjs。中身は qa-report/a11y.md）", a.status === 0, (a.stdout.match(/^- ❌.*$/gm) || []).join(" / ") || (a.status ? a.stderr.slice(-300) : ""));
}

const ng = results.filter((r) => !r.ok);
const md = `# 薬の袋よみ QA\n\n${results.map((r) => `- ${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? `（${r.detail}）` : ""}`).join("\n")}\n\n${ng.length ? `❌ ${ng.length}件` : `✅ ${results.length}項目すべて通過`}\n`;
mkdirSync(path.join(root, "qa-report"), { recursive: true });
writeFileSync(path.join(root, "qa-report/report.md"), md);
console.log(md);
process.exit(ng.length ? 1 : 0);
