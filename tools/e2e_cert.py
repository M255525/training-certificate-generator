# 端對端測試：python tools/e2e_cert.py [輸出資料夾]（需先開 8889；線上版設 TCG_BASE）
import os, sys, io, asyncio
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
from playwright.async_api import async_playwright

BASE = os.environ.get('TCG_BASE', 'http://localhost:8889/')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get('TEMP', '.'), 'tcg_e2e')
os.makedirs(OUT, exist_ok=True)
fails = []
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
        await pg.goto(BASE)
        await pg.wait_for_function('window._tcg')
        check(await pg.is_visible('#modal.show'), '首次開啟跳出使用警語')
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
        url = await pg.evaluate('''async()=>{const f={no:"（115）示訓字第0001號",name:"測試甲",course:window._tcg.S.course.name,date:window._tcg.S.cert.date,hours:window._tcg.S.course.hours};const c=await TCG.verifyCode("DEMO",f);return location.pathname+"#v="+TCG.qrPayload(Object.assign({},f,{code:c,unit:"x",title:"y"}))}''')
        await pg.goto(BASE.rstrip('/') + url.replace('/index.html', '/') if url.startswith('/') else BASE + url)
        await pg.wait_for_selector('#vSecret')
        await pg.fill('#vSecret', 'DEMO')
        await pg.click('[data-act="verifyGo"]')
        await pg.wait_for_timeout(300)
        out = await pg.text_content('#vOut')
        check('相符' in out and '不符' not in out, '查驗：正確密語相符')
        check('姓名相符' in (await pg.text_content('#modalBox')), '查驗：比對到發證紀錄')

        # 名單預設不記住
        await pg.goto(BASE)
        await pg.wait_for_function('window._tcg')
        check(await pg.evaluate('window._tcg.ROSTER.length') == 0, '重新整理後名單不保留（預設）')

        # 手機寬度
        m = await b.new_page(viewport={'width': 375, 'height': 800})
        await m.goto(BASE)
        await m.wait_for_function('window._tcg')
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
