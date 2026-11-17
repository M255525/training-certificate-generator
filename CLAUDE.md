# training-certificate-generator — 訓練證書產生器

給辦訓單位（協會、學校推廣部、職訓機構、企業訓練單位）用：填單位與課程 → 貼上／開啟學員名單（.xlsx／.csv）→ 依出席率與成績判斷發證資格 → 自動編證書字號 → 一人一頁 A4 證書（6 版型、橫／直式、中英對照、背面科目表）列印或存 PDF → 核發清冊（列印／.xlsx／CSV）→「確認發證」記錄字號、下一批接著編。QR code＋單位密語 HMAC 驗證碼，`#v=` 查驗畫面。

2026-11-17 建立。使用者只說「要可以生成辦訓單位的課程訓練證書」，規格由 Claude 自行決定。**尚未部署**（實驗性新工具，上線前先問使用者；repo 要使用者自己 `gh repo create`）。

- 純靜態：`index.html`（CSS，深藍辦公桌＋紅色方印編號風；證書用 mm 排版）＋`data.js`（純函式引擎，node 可 require）＋`io.js`（xlsx／csv 讀寫，**複製自 `課程平台/teacher-classroom-helper/io.js`**，去掉 docx 與名單／題庫解析）＋`art.js`（程式自繪 SVG：繩紋框、團花、回紋、印章、版型縮圖）＋`app.js`（畫面）＋`manual.html`＋PWA。
- 本機預覽 port **8889**（`.claude/launch.json` 的 `training-certificate-generator`；程式牆 `LOCAL_APPS` 已加）。visitor-badge `m255525.trainingcertificategenerator`。預定線上網址 `ONLINE`＝<https://m255525.github.io/training-certificate-generator/>（QR 會指到這裡的 `#v=`，**沒上線前掃 QR 打不開**）。

## 引擎（data.js）
- `PLANS`：計畫別預設門檻（產投 2/3＋及格 60、內訓 80%、研習 100%、自辦 2/3＋成績、自訂）。**只是建議值，介面與警語都寫「依計畫最新規定」**，不要寫成法規條文。
- `eligible(row, course, rule)`：出席空白＝全勤；用 `att*den >= hours*num` 整數比較避免浮點；超過總時數也算不合格。
- `checkId`：身分證／新式居留證（第二碼 1289）檢查碼，`other`＝舊式居留證／護照不檢核。
- `parseDate` 吃西元、民國、七／八碼、Excel 序號、中文；`fmtDate` 的 `rocc` 是落款國字（一百零五年用「零」）。
- `serialNo` 樣板 `{年}{號}{期}`。只有要發證的人分配字號，依名單順序。
- `verifyCode(secret, f)`：HMAC-SHA256(密語, 字號|姓名|課程|發證日|時數) → Crockford base32 8 碼 `XXXX-XXXX`（async，crypto.subtle）。`qrPayload` base64url JSON，**不放身分證字號**。
- 範例 3 組全虛構；範例一的黃志明身分證**刻意**檢查碼錯，示範提醒；張大同出席不足、李曉華成績不足。
- **改 data.js／art.js 後跑 `node tools/test_engine.mjs`**（71 項）。

## 畫面（app.js）
- 狀態 `tcg.` 前綴：`state`（單位、課程、證書、規則、版面，含 Logo／印章／簽名 dataURL，圖片縮到 500～600px）、`roster`（**只有勾「記住名單」才存，預設不存**）、`hist`（發證紀錄，只存字號、姓名、遮罩身分證、驗證碼，200 批）、`tpls`（我的範本 20 個，不含名單）、`zoom`、`fs`、`fold`、`warnSeen`、`marquee`。
- 輸入用 `data-b="unit.name"` 路徑綁定；select／checkbox 有 `data-rp` 才重畫面板。選計畫別會覆蓋規則與證書名稱。
- 證書 `certHtml()` 絕對定位 mm；橫式 297×210、直式 210×297，列印用 named page（`@page land/port`，`.sheet.land{page:land}`），證書橫式＋清冊直式可混印。清冊每頁 18 人。
- QR 用 cdnjs `qrcodejs/1.0.0`（動態載入，canvas 轉 dataURL），驗證碼與 QR 非同步補上（`fillAsync`、`PENDING`），列印前等 `PENDING`。
- 印章：程式產生（示意）／上傳圖檔／留用印處／不印；負責人小章 3 字加「印」、2 字加「之印」，inline 放在姓名後。
- 測試掛鉤 `window._tcg`（S、ROSTER、HIST、ACT、items、loadExample、setRoster、PENDING）。

## 驗證
- `python tools/e2e_cert.py [輸出資料夾]`（先開 8889）：首訪警語、範例一 6 頁（3 證書＋3 背面）、字號連號、QR／驗證碼、本文不壓落款、`page.pdf()` 6 頁橫式 A4、清冊直式＋遮罩＋未發證原因、三範例張數、Excel 名單匯入（含 Excel 日期序號）、確認發證後流水號、`#v=` 查驗相符＋比對紀錄、名單不保留、375px 無溢出、無 console 錯誤。2026-11-17 全過；PDF 轉圖目視過。
- **實體印表機、證書紙、雙面背面對齊未實測**；楷書在非 Windows 用 LXGW WenKai TC（Google Fonts）。

## 標準配備
跑馬燈（工作區公告 GAS，滑鼠移入暫停）、⚙ 常用設定（顯示、範本、發證紀錄、清除名單、清除全部、關於）、首訪警語＋頁面入口、`manual.html#creator`（改 `tools/manual_body.html` 後跑 `python tools/build_manual.py`）、PWA（`tools/make_icons.py`；上線改版升 `service-worker.js` 的 `CACHE_NAME`）、訪客計數器。無序號、無 AI、無浮水印（證書是給學員的正式文件）。
