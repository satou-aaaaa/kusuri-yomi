// 薬の袋よみの問題を作る（ブラウザと node の両方で使う）。
// 1問＝薬の袋（bag：書いてある言葉）・場面（scene）・問い（q）・答え（ans）・選び肢4つ（opts）・答えの説明（why）・出どころ（src）。
// facts は QA が別の数え方で答えを確かめるための値（画面には出さない）。
// 中身は公的な資料（自治体・薬剤師会）に書いてあることだけ。資料で幅がある所（食前の30分〜1時間など）は、どの読み方でも答えが同じになる問題にする。
// 乱数 R は呼ぶ回数が毎回同じになるように使う（sort の比較の中では引かない）。同じ種なら、どの端末でも同じ問題になる。
(function (root) {
  "use strict";
  const LV = ["やさしい", "ふつう", "むずかしい"];
  // 出どころ（SRC のキーを各問題の src に書く）
  const SRC = {
    sendai: ["仙台市「くすりを正しく使いましょう」", "https://www.city.sendai.jp/imuyakumu/kurashi/kenkotofukushi/kenkoiryo/yakujiese/kusuri/tadashiku.html"],
    sakai: ["堺市「お薬について」", "https://www.city.sakai.lg.jp/benri/yokuaru/kenkoshitsumon/okusuri.html"],
    nagano: ["長野市「飲む時間」", "https://www.city.nagano.nagano.jp/n107000/contents/p002150.html"],
    toyaku: ["東京都薬剤師会「くすりの正しい使い方」", "https://toyaku.or.jp/health/usemedicine/pdf/kusuri_syoucyugakuseiyou.pdf"],
    yamagata: ["山形県「お薬の飲み方」", "https://www.pref.yamagata.jp/documents/17944/kusuri.pdf"],
  };
  const MEALS = [["朝", 390, 480], ["昼", 690, 780], ["夕", 1080, 1170]]; // 食べ始める時刻の幅（分）
  const PILLS = ["白い錠剤", "黄色い錠剤", "カプセル", "小さな錠剤", "丸い錠剤"];

  const ri = (R, a, b) => a + Math.floor(R() * (b - a + 1));
  const pick = (R, arr) => arr[Math.floor(R() * arr.length)];
  const pickN = (R, arr, n) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };
  const shuffle = (R, arr) => pickN(R, arr, arr.length);
  const fmt = (m) => { m = ((m % 1440) + 1440) % 1440; const h = Math.floor(m / 60), n = m % 60; return `${h}時${n ? n + "分" : ""}`; };
  const step = (R, a, b, s) => a + s * ri(R, 0, Math.floor((b - a) / s));

  // まちがいの選び肢：答えと重ならず、同じものが2つ無いよう、候補の順に3つ取る（足りなければ予備から）
  function opts(R, ans, cands, spare = []) {
    const out = [];
    for (const c of [...cands, ...spare]) { if (c && c !== ans && !out.includes(c)) out.push(c); if (out.length === 3) break; }
    return shuffle(R, [ans, ...out]);
  }
  const numOpts = (R, ans, cands) => opts(R, ans + "錠", cands.filter((v) => v > 0 && Number.isInteger(v)).map((v) => v + "錠"), [ans + 1, ans + 2, ans + 3, ans - 1, ans * 2, ans + 10].filter((v) => v > 0).map((v) => v + "錠"));
  const dayOpts = (R, ans, cands) => opts(R, ans + "日分", cands.filter((v) => v > 0 && Number.isInteger(v)).map((v) => v + "日分"), [ans + 1, ans + 2, ans - 1, ans + 3, ans * 2].filter((v) => v > 0).map((v) => v + "日分"));
  const meal = (R) => { const [n, a, b] = pick(R, MEALS), s = step(R, a, b, 15), e = s + pick(R, [20, 30]); return { n, s, e }; };
  const ateLine = (m) => `${m.n}ごはんを ${fmt(m.s)}から ${fmt(m.e)}まで 食べます。`;
  const TIMES = ["1日1回", "1日2回", "1日3回"];
  const WHEN = { 1: "朝食後", 2: "朝・夕食後", 3: "毎食後" };

  // 種類：id・難しさ・帳に出す名前・見るところ（ヒント1）・作り方
  const KINDS = [
    // ---- やさしい ----
    { id: "shokugo", lv: 0, name: "食後", look: "「食後」は、食べ終わってから どのくらいのうちか 思い出しましょう。", make(R) {
      const m = meal(R), d = pick(R, [10, 15, 20]), ans = fmt(m.e + d);
      return { bag: ["1日3回 毎食後", `1回1錠（${pick(R, PILLS)}）`], scene: ateLine(m), q: `${m.n}ごはんのあとの薬は、いつ飲む？`, ans,
        opts: opts(R, ans, [fmt(m.s - 30), fmt(m.e + 120), fmt(m.e + 240)]), why: "「食後」は、食事のあと およそ30分以内に飲みます。", src: ["sendai", "sakai"],
        facts: { t: "after", s: m.s, e: m.e } }; } },
    { id: "shokuzen", lv: 0, name: "食前", look: "「食前」の「前」は、食べる前のことです。", make(R) {
      const m = meal(R), ans = fmt(m.s - 30);
      return { bag: ["1日3回 毎食前", `1回1錠（${pick(R, PILLS)}）`], scene: ateLine(m), q: `${m.n}ごはんの前の薬は、いつ飲む？`, ans,
        opts: opts(R, ans, [fmt(m.e + 15), fmt(m.e + 120), fmt(m.s - 180)]), why: "「食前」は、食事のおよそ30分前に飲みます（30分〜1時間前と書く資料もあります）。", src: ["toyaku", "nagano", "sakai"],
        facts: { t: "before", s: m.s, e: m.e } }; } },
    { id: "nerumae", lv: 0, name: "寝る前", look: "「寝る前」は、ふとんに入る少し前のことです。", make(R) {
      const sl = step(R, 1290, 1410, 15), ds = step(R, 1050, sl - 210, 15), de = ds + 30, wake = step(R, 360, 420, 15), ans = fmt(sl - 30);
      return { bag: ["1日1回 寝る前", `1回1錠（${pick(R, PILLS)}）`], scene: `夕ごはんは ${fmt(ds)}から。夜は ${fmt(sl)}に 寝ます。`, q: "この薬は、いつ飲む？", ans,
        opts: opts(R, ans, [fmt(ds - 30), fmt(wake), fmt(de + 15)]), why: "「寝る前」は、寝るおよそ30分前に飲みます。", src: ["sendai", "toyaku", "nagano"],
        facts: { t: "sleep", sl, ds, de, wake } }; } },
    { id: "mizu", lv: 0, name: "何で飲む", look: "のどや食道に薬が残らないようにするには？", make(R) {
      const ans = "コップ1杯ほどの 水か ぬるま湯";
      return { bag: [pick(R, TIMES) + " 食後", `1回1錠（${pick(R, PILLS)}）`], scene: "薬を飲むときの 飲みもの。", q: "何で飲む？", ans,
        opts: opts(R, ans, pickN(R, ["ひと口の 水だけ", "牛乳", "ジュース", "お酒"], 3)), why: "コップ1杯ほどの水かぬるま湯で飲みます。水が少ないと、薬がのどや食道に残ることがあります。牛乳やジュース、お酒で効き目が変わることもあります。", src: ["sakai", "toyaku"],
        facts: { t: "fixed" } }; } },
    { id: "ichinichi", lv: 0, name: "1日に何錠", look: "1日の回数と、1回の数を かけましょう。", make(R) {
      const n = ri(R, 2, 3), m = ri(R, 1, 3), ans = n * m;
      return { bag: [`1日${n}回 ${WHEN[n]}`, `1回${m}錠（${pick(R, PILLS)}）`], scene: "袋に こう書いてあります。", q: "1日に 何錠 飲む？", ans: ans + "錠",
        opts: numOpts(R, ans, [n + m, m, n * m + m]), why: `1日${n}回 × 1回${m}錠 ＝ ${ans}錠です。`, src: ["sendai"],
        facts: { t: "mul", v: [n, m] } }; } },
    // ---- ふつう ----
    { id: "shokkan", lv: 1, name: "食間", look: "「食間」は食事の「間」。食べている途中ではありません。", make(R) {
      const m = meal(R), ans = fmt(m.e + 120);
      return { bag: ["1日3回 食間", `1回1包（粉ぐすり）`], scene: ateLine(m), q: `${m.n}ごはんのあと、「食間」に飲むのは いつ？`, ans,
        opts: opts(R, ans, [fmt(m.s + 10), fmt(m.e + 10), fmt(m.s - 30)]), why: "「食間」は、食事のおよそ2時間後です。食事の途中ではありません。", src: ["sakai", "yamagata", "nagano"],
        facts: { t: "between", s: m.s, e: m.e } }; } },
    { id: "kisho", lv: 1, name: "起床時", look: "「起床」は、朝 起きることです。", make(R) {
      const w = step(R, 330, 420, 15), bs = w + pick(R, [45, 60]), ans = fmt(w) + "（起きてすぐ）";
      return { bag: ["1日1回 起床時", `1回1錠（${pick(R, PILLS)}）`], scene: `朝 ${fmt(w)}に 起きて、${fmt(bs)}から 朝ごはん。`, q: "この薬は、いつ飲む？", ans,
        opts: opts(R, ans, [fmt(bs + 40) + "（朝ごはんのあと）", "夜（寝る前）", "昼ごはんの前"]), why: "「起床時」は、朝起きてすぐ（朝ごはんの前）に飲みます。", src: ["nagano"],
        facts: { t: "fixed" } }; } },
    { id: "zenbu", lv: 1, name: "全部で何錠", look: "1日の数を出してから、日数を かけましょう。", make(R) {
      const n = ri(R, 1, 3), m = ri(R, 1, 2), d = pick(R, [3, 5, 7, 10, 14]), ans = n * m * d;
      return { bag: [`1日${n}回 ${WHEN[n]}`, `1回${m}錠`, `${d}日分`], scene: "袋に こう書いてあります。", q: "袋の中は、全部で 何錠？", ans: ans + "錠",
        opts: numOpts(R, ans, [n * m, n * d, ans + n * m, (n + m) * d]), why: `1日${n}回 × ${m}錠 ＝ ${n * m}錠。${d}日分なので ${n * m}錠 × ${d} ＝ ${ans}錠です。`, src: ["sendai"],
        facts: { t: "mul", v: [n, m, d] } }; } },
    { id: "tonpuku", lv: 1, name: "頓服", look: "「頓服」は、時間を決めて毎日飲む薬ではありません。", make(R) {
      const sym = pick(R, ["痛いとき", "熱が高いとき", "せきが ひどいとき"]), ans = `${sym}だけ（必要なとき）`;
      return { bag: [`頓服 ${sym}`, `1回1錠（${pick(R, PILLS)}）`], scene: "「頓服」と書いた 袋があります。", q: "この薬は、いつ飲む？", ans,
        opts: opts(R, ans, ["毎食後 かならず", "毎朝 起きてすぐ", "寝る前に 毎日"]), why: "「頓服」は、症状が出たときなど、必要なときに飲む薬です。", src: ["sendai", "nagano"],
        facts: { t: "tonpuku", sym } }; } },
    { id: "hokan", lv: 1, name: "しまう所", look: "薬は、光・熱・しめり気で 変わることがあります。", make(R) {
      const ans = "日の当たらない、しめり気の少ない所（子どもの手の届かない所）";
      return { bag: [pick(R, TIMES) + " 食後", `1回1錠（${pick(R, PILLS)}）`], scene: "薬を 家に持って帰りました。", q: "どこに しまう？", ans,
        opts: opts(R, ans, pickN(R, ["日の当たる 窓辺", "ストーブの そば", "お風呂場の たな", "子どもの手の届く 低いたな", "別の空きびんに 入れかえて 台所"], 3)),
        why: "直射日光・高い温度・しめり気をさけ、子どもの手の届かない所にしまいます。別の入れものに移しかえません。", src: ["sendai", "toyaku"], facts: { t: "fixed" } }; } },
    { id: "yameru", lv: 1, name: "よくなったら", look: "薬をやめるかどうかは、だれが決める？", make(R) {
      const d = pick(R, [5, 7, 10]), k = ri(R, 2, d - 2), ans = "自分で決めずに、医師や薬剤師に 相談する";
      return { bag: ["1日3回 毎食後", "1回1錠", `${d}日分`], scene: `${k}日飲んだら、具合が よくなりました。`, q: "のこりの薬は？", ans,
        opts: opts(R, ans, ["自分で決めて 飲むのを やめる", "次の回に 2回分 飲んで 早く終える", "同じような具合の 家族に あげる"]),
        why: "よくなったように見えても、自分の判断でやめません。医師や薬剤師に相談します。", src: ["sendai", "sakai", "toyaku"], facts: { t: "fixed" } }; } },
    { id: "ageru", lv: 1, name: "人にあげない", look: "出してもらった薬は、だれのための薬？", make(R) {
      const who = pick(R, ["家族", "友だち", "となりの人"]), ans = "あげない（自分のための薬）";
      return { bag: ["1日2回 朝・夕食後", "1回1錠", "7日分"], scene: `${who}が「同じ具合だから 少しちょうだい」と 言います。`, q: "どうする？", ans,
        opts: opts(R, ans, ["半分 あげる", "1回分だけ あげる", "袋ごと あげる"]), why: "出してもらった薬は、その人のための薬です。ほかの人にあげません。", src: ["sakai", "toyaku"], facts: { t: "fixed" } }; } },
    { id: "kigen", lv: 1, name: "使用期限", look: "期限が過ぎた薬は、開けていなくても…？", make(R) {
      const ans = "使わない";
      return { bag: ["かぜ薬（市販）", `使用期限 ${2020 + ri(R, 0, 4)}年${ri(R, 1, 12)}月`], scene: "棚の奥から、まだ開けていない 古い薬が 出てきました。期限は 過ぎています。", q: "どうする？", ans,
        opts: opts(R, ans, ["開けていないので 使う", "半分の量なら 使う", "冷蔵庫で 冷やしてから 使う"]), why: "使用期限が過ぎた薬は、開けていなくても使いません。", src: ["sakai"], facts: { t: "fixed" } }; } },
    { id: "megusuri", lv: 1, name: "目薬の量", look: "目に入る量は 思ったより 少ないです。", make(R) {
      const ans = "1滴";
      return { bag: [`目薬 1日${ri(R, 2, 4)}回`, pick(R, ["両目に さす", "右目に さす", "左目に さす"])], scene: pick(R, ["目薬を さします。", "朝の目薬を さします。", "寝る前の目薬を さします。"]), q: "1回に 何滴で 十分？", ans,
        opts: opts(R, ans, ["3滴", "5滴", "目から あふれるまで"]), why: "目薬は、1回1滴で十分です。", src: ["sakai"], facts: { t: "fixed" } }; } },
    { id: "megusuri2", lv: 1, name: "目薬を2本", look: "続けてさすと、先の目薬が 流れてしまいます。", make(R) {
      const ans = "5分ほど あけて、もう1本を さす";
      const n = ri(R, 2, 4), t = pick(R, ["朝", "昼", "夜"]);
      return { bag: [`目薬A 1日${n}回`, `目薬B 1日${n}回`], scene: `${t}、2本の目薬を 同じ時間に さします。`, q: "どうさす？", ans,
        opts: opts(R, ans, ["すぐ続けて さす", "2本を まぜてから さす", "1日おきに かわりばんこに さす"]), why: "2種類の目薬は、ほかに指示がなければ、およそ5分あけてさします。", src: ["sakai"], facts: { t: "fixed" } }; } },
    { id: "shippu", lv: 1, name: "湿布とお風呂", look: "はがしてから お風呂まで、少し時間を とります。", make(R) {
      const b = step(R, 1110, 1290, 15), ans = fmt(b - 30) + "（お風呂の30分前）";
      return { bag: ["湿布 1日1回 はる"], scene: `夜 ${fmt(b)}に お風呂に入ります。`, q: "湿布は いつ はがす？", ans,
        opts: opts(R, ans, [fmt(b) + "（入る直前）", "お風呂の中で", "はがさずに 入る"]), why: "湿布は、お風呂に入るおよそ30分前にはがします。お風呂のあとは、体のほてりがおさまってから はります。", src: ["sakai"],
        facts: { t: "fixed" } }; } },
    // ---- むずかしい ----
    { id: "wasure1", lv: 2, name: "飲み忘れ（すぐ気づく）", look: "次に飲む時間まで、まだ たっぷりあります。", make(R) {
      const e = step(R, 420, 480, 15), now = e + pick(R, [30, 45, 60]), lunch = step(R, 720, 780, 15), ans = "気づいた今、1回分を 飲む";
      return { bag: ["1日3回 毎食後", "1回1錠"], scene: `朝ごはんは ${fmt(e)}に 食べ終わりました。${fmt(now)}、朝の分を 飲み忘れていたと 気づきました。昼ごはんは ${fmt(lunch)}から。`, q: "どうする？", ans,
        opts: opts(R, ans, ["昼ごはんのあとに 2回分 まとめて飲む", "今 2回分 飲む", "今日の分は 全部 やめる"]),
        why: "気づいたときに あまり時間がたっていなければ、すぐ1回分を飲みます。2回分をまとめて飲みません（薬によってちがうので、前もって医師・薬剤師に聞いておくと安心です）。", src: ["sakai", "sendai"],
        facts: { t: "missEarly", now, next: lunch } }; } },
    { id: "wasure2", lv: 2, name: "飲み忘れ（次が近い）", look: "次に飲む時間が、もうすぐ来ます。", make(R) {
      const lunch = step(R, 720, 780, 15), now = lunch - pick(R, [15, 20, 30]), ans = "忘れた分は飲まず、昼ごはんのあとの分から いつもどおり";
      return { bag: ["1日3回 毎食後", "1回1錠"], scene: `${fmt(now)}、朝の分を 飲み忘れていたと 気づきました。昼ごはんは ${fmt(lunch)}から。`, q: "どうする？", ans,
        opts: opts(R, ans, ["昼ごはんのあとに 2回分 まとめて飲む", "今 1回分飲み、昼ごはんのあとにも 飲む", "今 2回分 飲む"]),
        why: "次に飲む時間が近いときは、忘れた分は飲まず、次から指示どおりに飲みます。2回分をまとめて飲みません（薬によってちがうので、前もって医師・薬剤師に聞いておくと安心です）。", src: ["sakai", "sendai"],
        facts: { t: "missLate", now, next: lunch } }; } },
    { id: "nokori", lv: 2, name: "のこりは何錠", look: "飲んだ日数のぶんを、全部の数から ひきましょう。", make(R) {
      const n = ri(R, 2, 3), m = ri(R, 1, 2), d = pick(R, [7, 10, 14]), k = ri(R, 2, d - 2), ans = n * m * (d - k);
      return { bag: [`1日${n}回 ${WHEN[n]}`, `1回${m}錠`, `${d}日分`], scene: `${k}日目の分まで、指示どおり 全部 飲みました。`, q: "のこりは 何錠？", ans: ans + "錠",
        opts: numOpts(R, ans, [n * m * k, d - k, n * m * (d - k - 1), n * m * d]), why: `1日 ${n * m}錠 × のこり ${d - k}日 ＝ ${ans}錠です。`, src: ["sendai"],
        facts: { t: "left", v: [n, m, d, k] } }; } },
    { id: "atonan", lv: 2, name: "あと何日分", look: "1日に飲む数で、のこりを わりましょう。", make(R) {
      const n = ri(R, 2, 3), m = ri(R, 1, 2), j = ri(R, 2, 9), x = n * m * j;
      return { bag: [`1日${n}回 ${WHEN[n]}`, `1回${m}錠`], scene: `袋に のこっているのは ${x}錠です。`, q: "あと 何日分？", ans: j + "日分",
        opts: dayOpts(R, j, [x / n, x / m, j + 1, x]), why: `1日に ${n}回 × ${m}錠 ＝ ${n * m}錠。${x}錠 ÷ ${n * m}錠 ＝ ${j}日分です。`, src: ["sendai"],
        facts: { t: "div", x, per: n * m } }; } },
    { id: "kumi", lv: 2, name: "2つの袋", look: "袋ごとに 1日の回数を数えて、足しましょう。", make(R) {
      const a = pick(R, [["1日3回 毎食後", 3], ["1日2回 朝・夕食後", 2]]), b = pick(R, [["1日1回 寝る前", 1], ["1日3回 食間", 3], ["1日1回 起床時", 1]]), ans = a[1] + b[1];
      return { bag: ["袋A：" + a[0], "袋B：" + b[0]], scene: "薬の袋が 2つ あります。", q: "1日に 薬を飲むのは 何回？", ans: ans + "回",
        opts: opts(R, ans + "回", [a[1] + "回", b[1] + "回", ans + 1 + "回", ans - 1 + "回"], [ans + 2 + "回"]), why: `袋Aが1日${a[1]}回、袋Bが1日${b[1]}回。あわせて ${ans}回です。`, src: ["nagano"],
        facts: { t: "add", v: [a[1], b[1]] } }; } },
    { id: "grape", lv: 2, name: "飲み合わせ", look: "食べものや飲みものでも、薬の効き方が変わることがあります。", make(R) {
      const ans = "飲む前に、薬剤師に 相談する";
      const w = pick(R, [["朝", "朝食後"], ["夕", "夕食後"]]), dose = pick(R, ["1回1錠", "1回2錠"]);
      return { bag: [`血圧の薬 1日1回 ${w[1]}`, dose], scene: `${w[0]}ごはんに、グレープフルーツジュースを 飲みたい。`, q: "どうする？", ans,
        opts: opts(R, ans, ["気にせず いっしょに飲む", "ジュースに 薬を とかして飲む", "ジュースの日は 薬を 2回分飲む"]), why: "グレープフルーツジュースは、血圧を下げる薬などに影響することがあります。薬剤師に相談しましょう。", src: ["toyaku"],
        facts: { t: "fixed" } }; } },
    { id: "goin", lv: 2, name: "まちがえて飲んだ", look: "あとで聞かれることを、先に まとめておきます。", make(R) {
      const ans = "何を・いつ・どれだけ飲んだかを、すぐ医師か薬剤師に知らせる";
      return { bag: [pick(R, TIMES) + " 食後", `1回1錠（${pick(R, PILLS)}）`], scene: "家の人の薬を、まちがえて 飲んでしまいました。", q: "どうする？", ans,
        opts: opts(R, ans, ["明日まで ようすを見る", "だれにも 言わない", "のこりの薬を かくす"]), why: "まちがえて飲んだときは、どんな薬を・いつ・どのくらい飲んだかを、すぐ医師や薬剤師に知らせます。", src: ["toyaku"],
        facts: { t: "fixed" } }; } },
  ];
  const BY = Object.fromEntries(KINDS.map((k) => [k.id, k]));
  const kindsOf = (lv) => KINDS.filter((k) => k.lv === lv).map((k) => k.id);

  function seedOf(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // 1問を作る。tag は「種類|種」（例 "shokugo|2026-11-07:d0"）。同じ tag ならいつも同じ問題
  function make(tag) {
    const [kind] = String(tag).split("|"), k = BY[kind];
    if (!k) return null;
    const p = k.make(rng(seedOf(tag)));
    return { tag, kind, lv: k.lv, name: k.name, look: k.look, ...p };
  }

  // 今日の5問（やさしい2・ふつう2・むずかしい1）。種類は重ねない
  function dailyTags(date) {
    const R = rng(seedOf("day:" + date)), e = pickN(R, kindsOf(0), 2), n = pickN(R, kindsOf(1), 2), h = pickN(R, kindsOf(2), 1);
    return [...e, ...n, ...h].map((id, i) => `${id}|${date}:d${i}`);
  }
  // 上級の3問（むずかしいだけ・今日の5問のむずかしいとは別の種類）
  function hardTags(date) {
    const dh = dailyTags(date)[4].split("|")[0], R = rng(seedOf("hard:" + date)), h = pickN(R, kindsOf(2).filter((x) => x !== dh), 3);
    return h.map((id, i) => `${id}|${date}:h${i}`);
  }

  const KUSURI = { KINDS, BY, LV, SRC, kindsOf, seedOf, rng, make, dailyTags, hardTags, pickN, fmt };
  if (typeof module !== "undefined" && module.exports) module.exports = KUSURI; else root.KUSURI = KUSURI;
})(typeof self !== "undefined" ? self : this);
