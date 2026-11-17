// node tools/test_engine.mjs —— 引擎（data.js）與圖形（art.js）測試
import {createRequire} from 'module';
const require = createRequire(import.meta.url);
const P = require('../data.js');
require('../art.js');
const ART = globalThis.TCGART;
let n = 0, bad = 0;
function ok(c, msg){ n++; if(!c){ bad++; console.log('✗ ' + msg); } }
function eq(a, b, msg){ ok(JSON.stringify(a) === JSON.stringify(b), msg + '：得到 ' + JSON.stringify(a) + '，應為 ' + JSON.stringify(b)); }

// 身分證
eq(P.checkId('A123456789'), 'ok', '身分證 A123456789');
eq(P.checkId('a123456789'), 'ok', '小寫也可以');
eq(P.checkId('Ａ１２３４５６７８９'), 'ok', '全形也可以');
eq(P.checkId('A123456788'), 'bad', '檢查碼錯');
eq(P.checkId('A323456789'), 'bad', '第二碼不是 1/2/8/9');
eq(P.checkId('AB12345678'), 'other', '舊式居留證無法檢核');
eq(P.checkId(''), '', '空白');
eq(P.maskId('A123456789', 'mask'), 'A12****789', '遮罩');
eq(P.maskId('A123456789', 'hide'), '', '不顯示');
eq(P.maskId('A123456789', 'full'), 'A123456789', '完整');
eq(P.maskName('王小明'), '王○明', '姓名遮罩');

// 日期
eq(P.parseDate('2026/1/5'), '2026-01-05', '西元斜線');
eq(P.parseDate('115/01/05'), '2026-01-05', '民國');
eq(P.parseDate('79.7.19'), '1990-07-19', '民國點');
eq(P.parseDate('1150105'), '2026-01-05', '民國七碼');
eq(P.parseDate('20260105'), '2026-01-05', '西元八碼');
eq(P.parseDate('46027'), '2026-01-05', 'Excel 序號');
eq(P.parseDate('民國115年1月5日'), '2026-01-05', '中文');
eq(P.parseDate('2026-02-30'), '', '不存在的日期');
eq(P.parseDate('abc'), '', '亂打');
eq(P.fmtDate('2026-11-17', 'rocc'), '中華民國一百一十五年十一月十七日', '國字落款');
eq(P.fmtDate('2016-10-05', 'rocc'), '中華民國一百零五年十月五日', '一百零五年');
eq(P.fmtDate('2021-12-20', 'rocc'), '中華民國一百一十年十二月二十日', '一百一十年');
eq(P.fmtDate('2026-11-17', 'rocn'), '115年11月17日', '民國數字');
eq(P.fmtDate('2026-11-17', 'en'), 'November 17, 2026', '英文');
eq(P.dateParts('2026-10-31', true), ['一百一十五', '十', '三十一'], '落款分欄');

// 字號
eq(P.serialNo('（{年}）示訓字第{號}號', 7, {date:'2026-10-31', digits:4}), '（115）示訓字第0007號', '字號');
eq(P.serialNo('{期}-{號}', 12, {digits:2, term:'第2期'}), '第2期-12', '期別');
eq(P.serialNo('No.{號}', 123456, {digits:3}), 'No.123456', '超過位數不截斷');

// 發證條件
const R23 = {ratio:'2/3', needScore:true, pass:60};
eq(P.eligible({name:'甲', att:'24', score:'60'}, {hours:'36'}, R23).ok, true, '剛好 2/3、剛好 60 分');
eq(P.eligible({name:'甲', att:'23.5', score:'90'}, {hours:'36'}, R23).ok, false, '未達 2/3');
eq(P.eligible({name:'甲', att:'', score:'90'}, {hours:'36'}, R23).ok, true, '出席空白＝全勤');
eq(P.eligible({name:'甲', att:'36', score:''}, {hours:'36'}, R23).reasons, ['沒有成績'], '沒成績');
eq(P.eligible({name:'甲', att:'40'}, {hours:'36'}, {ratio:'80%'}).reasons, ['出席時數超過課程總時數'], '超過總時數');
eq(P.eligible({name:'甲', att:'9'}, {hours:'12'}, {ratio:'80%'}).ok, false, '80% 未達');
eq(P.eligible({name:'甲', att:'0'}, {hours:'12'}, {ratio:''}).ok, true, '不限出席');
eq(P.parseRatio('２/３').txt, '2/3', '全形比例');
eq(P.parseRatio('85').txt, '85%', '沒打 %');

// 名單
const r1 = P.parseRosterText(P.EXAMPLES[0].roster);
eq(r1.length, 5, '範例一 5 人');
eq(r1.map((r) => P.checkId(r.id)), ['ok', 'ok', 'ok', 'ok', 'bad'], '範例一只有黃志明檢查碼錯（刻意示範）');
eq(r1.filter((r) => P.eligible(r, P.EXAMPLES[0].course, P.PLANS.tims).ok).map((r) => r.name), ['王小明', '陳美玲', '黃志明'], '範例一發證 3 人');
eq(r1[3].birth, '1990-07-19', '民國生日');
const r2 = P.rowsToRoster([['王一', 'A123456789', '1990/5/12', '30', '80'], ['李二', 'B223456782', '1991/1/1', '20', '70']]);
eq([r2[0].id, r2[0].birth, r2[0].att, r2[0].score], ['A123456789', '1990-05-12', '30', '80'], '沒有標題列也猜得到欄位');
const r3 = P.rowsToRoster([['學號', '姓名', '成績'], ['S1', '張三', '77'], ['', '', '']]);
eq([r3.length, r3[0].name, r3[0].score], [1, '張三', '77'], '姓名不在第一欄、空列略過');
const evil = P.parseRosterText('姓名\n' + '<script>'.repeat(20) + '\u0007');
ok(Array.from(evil[0].name).length <= 20 && evil[0].name.indexOf('\u0007') < 0, '惡意輸入截斷、去控制字元');
eq(P.parseRosterText(P.rosterToText(r1)).map((r) => [r.name, r.id, r.birth, r.att, r.score]), r1.map((r) => [r.name, r.id, r.birth, r.att, r.score]), '名單文字往返一致');
ok(P.parseRosterText(Array(600).fill('某人').join('\n')).length === 500, '最多 500 人');

// 本文
eq(P.fill('{姓名}上了{課程}{不存在}', {'姓名':'甲', '課程':'乙'}), '甲上了乙{不存在}', '不認得的代號原樣保留');
eq(P.parseSubjects('# 註解\nA｜6｜陳\nB\t3\n\n').map((x) => [x.s, x.h, x.tch]), [['A', '6', '陳'], ['B', '3', '']], '科目表');
eq(P.subjectHours(P.parseSubjects(P.EXAMPLES[0].course.subjects)), 36, '範例一科目時數合計＝總時數');
eq(P.subjectHours(P.parseSubjects(P.EXAMPLES[1].course.subjects)), 12, '範例二科目時數合計＝總時數');

// 驗證碼與 QR
const f = {no:'（115）示訓字第0001號', name:'王小明', course:'門市服務', date:'2026-10-31', hours:'36'};
const c1 = await P.verifyCode('DEMO', f), c2 = await P.verifyCode('DEMO', f);
ok(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/.test(c1), '驗證碼格式 ' + c1);
eq(c1, c2, '同資料同密語＝同驗證碼');
ok(c1 !== await P.verifyCode('DEMO', Object.assign({}, f, {name:'王小名'})), '改姓名驗證碼就變');
ok(c1 !== await P.verifyCode('DEMO2', f), '換密語驗證碼就變');
eq(await P.verifyCode('', f), '', '沒密語不產生');
const pl = P.qrPayload(Object.assign({}, f, {code:c1, unit:'示範協會', title:'結訓證書', start:'2026-09-05', end:'2026-10-24'}));
ok(/^[A-Za-z0-9_-]+$/.test(pl), 'QR 內容只有網址安全字元');
const back = P.readPayload(pl);
eq([back.no, back.name, back.course, back.code, back.date, back.hours, back.unit, back.title], [f.no, f.name, f.course, c1, f.date, f.hours, '示範協會', '結訓證書'], 'QR 往返（v2）');
const v1 = P.b64u(JSON.stringify({v:1, u:'舊協會', t:'結訓證書', no:'第1號', n:'甲', c:'課', s:'2026-01-02', e:'2026-01-03', h:'6', d:'2026-01-04', k:'ABCD-EFGH'}));
eq([P.readPayload(v1).unit, P.readPayload(v1).start, P.readPayload(v1).code], ['舊協會', '2026-01-02', 'ABCD-EFGH'], '舊版 v1 QR 仍讀得懂');
ok(pl.length < 200, 'v2 QR 內容夠短（' + pl.length + ' 字）');
eq(P.readPayload(P.b64u('2x')), null, 'v2 欄位不足');
ok(pl.indexOf('A123') < 0 && JSON.stringify(back).indexOf('id') < 0, 'QR 不含身分證');
eq(P.readPayload('壞掉'), null, '壞的 QR');
eq(P.readPayload(P.b64u('{"v":2}')), null, '版本不對');

// 圖形
P.STYLE_ORDER.forEach((s) => { const h = ART.frame(s, 297, 210, '#123456', '#654321'); ok(h.indexOf('<svg') === 0 && h.indexOf('NaN') < 0, '框 ' + s); });
const sl = ART.seal('臺灣示範職業訓練協會', 'unit');
ok(sl.indexOf('<text') > 0 && (sl.match(/<text/g) || []).length === 10 && sl.indexOf('NaN') < 0, '大印 10 字');
ok(ART.seal('<b>&"', 'head').indexOf('<b>') < 0, '印章文字有跳脫');
eq(ART.seal('   ', 'unit'), '', '空白不產生印章');
ok((ART.seal('一二三四五六七八九十甲乙丙丁戊己庚辛', 'unit').match(/<text/g) || []).length === 16, '印章最多 16 字');

console.log((bad ? '✗ ' + bad + ' 項失敗／' : '✓ 全部通過／') + n + ' 項');
process.exit(bad ? 1 : 0);
