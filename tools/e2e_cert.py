# 端對端測試：python tools/e2e_cert.py [輸出資料夾]（需先開 8889；線上版設 TCG_BASE）
import os, sys, io, asyncio
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
from playwright.async_api import async_playwright

BASE = os.environ.get('TCG_BASE', 'http://localhost:8889/')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get('TEMP', '.'), 'tcg_e2e')
os.makedirs(OUT, exist_ok=True)
fails = []
LIC = 'AKfycbw2qz-sTKRVkVHGQZLTj73xlJdDiaHG8eNexjAN9XWMrly5BnxVcP8dC0qE3kADHeIl'
async def fake_license(route):
    # 假的授權伺服器：GOOD 有效、OLD 過期、其他查無；release 回 ok
    import json
    body = json.loads(route.request.post_data or '{}')
    if body.get('release'): r = {'ok': True}
    elif body.get('serial') == 'GOOD': r = {'valid': True, 'reason': 'ok', 'expiresAt': '2099-01-01T00:00:00Z'}
    elif body.get('serial') == 'OLD': r = {'valid': False, 'reason': 'expired'}
    else: r = {'valid': False, 'reason': 'serial_not_found'}
    await route.fulfill(status=200, content_type='application/json', body=json.dumps(r))
async def login(pg, serial='GOOD'):
    await pg.fill('#entryGateSerial', serial)
    await pg.click('#btnEntryGateConfirm')
    await pg.wait_for_timeout(400)
def check(c, msg):
    print(('✓ ' if c else '✗ ') + msg)
    if not c: fails.append(msg)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'visitor-badge' not in m.text and 'script.google' not in m.text else None)
        await pg.route('**/' + LIC + '/exec', fake_license)
        await pg.goto(BASE)
        await pg.wait_for_function('window._tcg')
        check(await pg.is_visible('#entryGate') and not await pg.is_visible('#modal.show'), '沒登入：序號閘門擋住整個工具')
        check(await pg.get_attribute('#entryGateSerial', 'type') == 'password', '序號輸入框預設遮住')
        await login(pg, 'WRONG')
        check(await pg.is_visible('#entryGate') and '查無此序號' in await pg.text_content('#entryGateStatus'), '錯的序號：仍擋住並顯示查無此序號')
        await login(pg, 'OLD')
        check(await pg.is_visible('#entryGate') and '過期' in await pg.text_content('#entryGateStatus'), '過期序號：仍擋住')
        await login(pg, 'GOOD')
        check(not await pg.is_visible('#entryGate') and await pg.evaluate('window._tcg.gateOpen'), '正確序號：解鎖')
        check(await pg.is_visible('#modal.show'), '解鎖後首次跳出使用警語')
        lt = await pg.text_content('#licTop')
        check(await pg.is_visible('#licTop') and '2099/1/1' in lt and '天' in lt, '登入後上方顯示序號到期日 ' + lt.strip())
        check('2099/1/1' in await pg.text_content('#entryGateStatus'), '登入狀態文字含到期日')
        await pg.click('#modal [data-act="close"]')

        # 範例一：5 人、3 人發證、背面科目表 → 6 頁（橫式）
        await pg.evaluate('window._tcg.loadExample("tims")')
        await pg.evaluate('window._tcg.PENDING')
        await pg.wait_for_timeout(500)
        await pg.evaluate('window._tcg.PENDING')
        n = await pg.evaluate('document.querySelectorAll("#sheets .sheet").length')
        check(n == 6, f'範例一 6 頁（3 張證書＋3 張背面），得到 {n}')
        nos = await pg.evaluate('[...document.querySelectorAll(".cno")].map(e=>e.textContent)')
        check(nos == ['（115）示訓字第0001號', '（115）示訓字第0002號', '（115）示訓字第0003號'], f'字號連號 {nos}')
        qr = await pg.evaluate('document.querySelectorAll(".qi img").length')
        check(qr == 3, f'3 個 QR，得到 {qr}')
        codes = await pg.evaluate('[...document.querySelectorAll(".qc")].map(e=>e.textContent)')
        check(all(c.startswith('驗證碼 ') for c in codes), f'驗證碼 {codes}')
        # 文字不溢出：本文不碰到落款
        ov = await pg.evaluate('''[...document.querySelectorAll(".sheet.cert")].map(s=>{const a=s.querySelector(".cin").getBoundingClientRect(), b=s.querySelector(".sign .who").getBoundingClientRect(), q=s.querySelector(".qr").getBoundingClientRect(); return a.bottom<=Math.min(b.top,q.top)+2})''')
        check(all(ov), f'本文不壓到落款與 QR {ov}')
        pdf = os.path.join(OUT, 'certs.pdf')
        await pg.emulate_media(media='print')
        await pg.pdf(path=pdf, prefer_css_page_size=True, print_background=True)
        await pg.emulate_media(media='screen')
        import fitz
        d = fitz.open(pdf)
        sizes = [(round(pp.rect.width / 72 * 25.4), round(pp.rect.height / 72 * 25.4)) for pp in d]
        check(len(d) == 6, f'PDF 6 頁，得到 {len(d)}')
        check(all(s == (297, 210) for s in sizes), f'PDF 每頁橫式 A4 {sizes}')
        for i, pp in enumerate(d):
            if i < 2: pp.get_pixmap(dpi=60).save(os.path.join(OUT, f'page{i + 1}.png'))

        # 只印文字：取消「印邊框與底紋」
        await pg.click('[data-card="look"] > summary') if not await pg.is_visible('[data-b="fmt.frame"]') else None
        await pg.uncheck('[data-b="fmt.frame"]')
        await pg.evaluate('window._tcg.PENDING')
        fr = await pg.evaluate('''[document.querySelectorAll(".sheet.cert .frame, .sheet.cert .wm").length, getComputedStyle(document.querySelector(".sheet.cert")).backgroundColor, document.querySelectorAll(".sheet.cert .nm").length, document.querySelectorAll(".sheet.cert .seal").length]''')
        check(fr[0] == 0 and fr[1] == 'rgb(255, 255, 255)' and fr[2] == 3 and fr[3] > 0, f'只印文字：沒有框與浮水印、白底、文字與印章還在 {fr}')
        await pg.screenshot(path=os.path.join(OUT, 'textonly.png'))
        await pg.check('[data-b="fmt.frame"]')
        await pg.evaluate('window._tcg.PENDING')
        check(await pg.evaluate('document.querySelectorAll(".sheet.cert .frame").length') == 3, '重新勾選：框回來')
        # 清冊：直式
        await pg.click('[data-view="reg"]')
        await pg.evaluate('window._tcg.PENDING')
        await pg.emulate_media(media='print')
        await pg.pdf(path=os.path.join(OUT, 'reg.pdf'), prefer_css_page_size=True, print_background=True)
        await pg.emulate_media(media='screen')
        d = fitz.open(os.path.join(OUT, 'reg.pdf'))
        check(len(d) == 1 and round(d[0].rect.width / 72 * 25.4) == 210, f'清冊 1 頁直式 A4（{len(d)} 頁）')
        txt = d[0].get_text()
        check('張大同' in txt and '未發證' in txt, '清冊列出未發證原因')
        check('A123456789' not in txt and 'A12****789' in txt, '清冊身分證預設遮罩')
        await pg.click('[data-view="certs"]')

        # 直式版型＋三種範例
        for ex, want in (('inhouse', 3), ('seminar', 3)):
            await pg.evaluate(f'window._tcg.loadExample("{ex}")')
            await pg.wait_for_timeout(300)
            await pg.evaluate('window._tcg.PENDING')
            k = await pg.evaluate('document.querySelectorAll("#sheets .sheet.cert").length')
            check(k == want, f'範例 {ex} 證書 {want} 張，得到 {k}')

        # 匯入 Excel 名單（用頁面自己的 xlsxBlob 產生）
        await pg.evaluate('window._tcg.loadExample("tims")')
        data = await pg.evaluate('''async()=>{const b=TCGIO.xlsxBlob([["學號","姓名","身分證字號","出生日期","出席時數","成績"],["S1","測試甲","A123456789","1990/1/2",36,90],["S2","測試乙","",46027,10,90]],"x");const a=new Uint8Array(await b.arrayBuffer());return Array.from(a)}''')
        fp = os.path.join(OUT, 'roster.xlsx')
        open(fp, 'wb').write(bytes(data))
        await pg.set_input_files('#rFile', fp)
        await pg.wait_for_timeout(600)
        r = await pg.evaluate('window._tcg.ROSTER.map(x=>[x.name,x.id,x.birth,x.att])')
        check(r == [['測試甲', 'A123456789', '1990-01-02', '36'], ['測試乙', '', '2026-01-05', '10']], f'Excel 名單 {r}')
        k = await pg.evaluate('document.querySelectorAll("#sheets .sheet.cert").length')
        check(k == 1, f'出席 10/36 的不發證，證書 {k} 張')

        # 確認發證 → 流水號往後
        await pg.click('[data-act="issue"]')
        await pg.click('[data-act="issueYes"]')
        await pg.wait_for_timeout(500)
        st = await pg.evaluate('[window._tcg.S.cert.next, window._tcg.HIST.length, window._tcg.HIST[0].rows[0].code.length]')
        check(st == [2, 1, 9], f'確認發證後下一號 2、紀錄 1 批、存驗證碼 {st}')

        # 查驗：用 QR 網址打開
        url = await pg.evaluate('''async()=>{const f={no:"（115）示訓字第0001號",name:"測試甲",course:window._tcg.S.course.name,date:window._tcg.S.cert.date,hours:window._tcg.S.course.hours};const c=await TCG.verifyCode("DEMO",f);return location.href.split("#")[0]+"#v="+TCG.qrPayload(Object.assign({},f,{code:c,unit:"x",title:"y"}))}''')
        await pg.goto(url)
        await pg.wait_for_selector('#vSecret')
        # 另開一個「沒登入過」的瀏覽器：掃 QR 查驗不需要序號
        ctx2 = await b.new_context()
        q = await ctx2.new_page()
        await q.route('**/' + LIC + '/exec', fake_license)
        await q.goto(pg.url)
        await q.wait_for_selector('#vSecret')
        check(not await q.is_visible('#entryGate') and '王' not in '' and await q.is_visible('#modal.show'), '沒有序號的人掃 QR：直接看到查驗畫面')
        await q.click('#modal [data-act="close"] >> nth=-1')
        await q.wait_for_timeout(200)
        check(await q.is_visible('#entryGate'), '關掉查驗畫面後：工具本身仍被序號擋住')
        await ctx2.close()
        await pg.fill('#vSecret', 'DEMO')
        await pg.click('[data-act="verifyGo"]')
        await pg.wait_for_timeout(300)
        out = await pg.text_content('#vOut')
        check('相符' in out and '不符' not in out, '查驗：正確密語相符')
        check('姓名相符' in (await pg.text_content('#modalBox')), '查驗：比對到發證紀錄')

        # 名單預設不記住
        await pg.goto(BASE)
        await pg.wait_for_function('window._tcg')
        await pg.wait_for_timeout(400)
        check(not await pg.is_visible('#entryGate'), '重新整理：記住序號自動登入')
        check(await pg.evaluate('window._tcg.ROSTER.length') == 0, '重新整理後名單不保留（預設）')
        await pg.evaluate("window._tcg.ACT.logout()")
        await pg.wait_for_timeout(300)
        check(await pg.is_visible('#entryGate') and await pg.evaluate("localStorage.getItem('tcgEntrySerial')") is None, '登出：回到閘門、序號清掉')
        check(not await pg.is_visible('#licTop'), '登出：到期日標示消失')

        # 手機寬度
        m = await b.new_page(viewport={'width': 375, 'height': 800})
        await m.route('**/' + LIC + '/exec', fake_license)
        await m.goto(BASE)
        await m.wait_for_function('window._tcg')
        await m.screenshot(path=os.path.join(OUT, 'gate-mobile.png'))
        await login(m)
        await m.evaluate('window._tcg.loadExample("tims")')
        await m.wait_for_timeout(400)
        w = await m.evaluate('document.documentElement.scrollWidth')
        check(w <= 376, f'375px 無橫向溢出（{w}）')
        await m.screenshot(path=os.path.join(OUT, 'mobile.png'))
        check(not errs, '沒有 console 錯誤 ' + ' | '.join(errs[:3]))
        await b.close()

asyncio.run(main())
print('全部通過' if not fails else f'{len(fails)} 項失敗')
sys.exit(1 if fails else 0)
