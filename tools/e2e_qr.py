# QR 實掃測試：python tools/e2e_qr.py [輸出資料夾]（TCG_BASE 預設線上版；TCG_SERIAL 預設 mark0131）
# 1. 登入→範例一→列印成 PDF  2. PDF 第一頁轉 300dpi 圖（模擬紙本）  3. 用 jsQR 從整張頁面找出並解碼 QR
# 4. 用「沒登入過」的瀏覽器打開解出的網址→查驗畫面內容  5. 正確／錯誤密語各查一次
import os, sys, io, asyncio, base64
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
from playwright.async_api import async_playwright
import fitz

BASE = os.environ.get('TCG_BASE', 'https://m255525.github.io/training-certificate-generator/')
SERIAL = os.environ.get('TCG_SERIAL', 'mark0131')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get('TEMP', '.'), 'tcg_qr')
os.makedirs(OUT, exist_ok=True)
fails = []
def check(c, msg):
    print(('✓ ' if c else '✗ ') + msg)
    if not c: fails.append(msg)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        await pg.goto(BASE)
        await pg.wait_for_function('window._tcg')
        await pg.fill('#entryGateSerial', SERIAL)
        await pg.click('#btnEntryGateConfirm')
        await pg.wait_for_function('window._tcg.gateOpen', timeout=30000)
        await pg.evaluate('document.getElementById("modal").classList.remove("show")')
        await pg.evaluate('window._tcg.loadExample("tims")')
        await pg.wait_for_timeout(500)
        await pg.evaluate('window._tcg.PENDING')
        await pg.wait_for_function('document.querySelectorAll(".qi img").length === 3', timeout=30000)
        printed = await pg.evaluate('[...document.querySelectorAll(".qc")].map(e=>e.textContent)')
        check(len(printed) == 3, f'證書上印的驗證碼 {printed}')
        await pg.emulate_media(media='print')
        pdf = os.path.join(OUT, 'certs.pdf')
        await pg.pdf(path=pdf, prefer_css_page_size=True, print_background=True)
        d = fitz.open(pdf)
        png = os.path.join(OUT, 'page1-300dpi.png')
        d[0].get_pixmap(dpi=300).save(png)
        # QR 在 PDF 上的實際大小
        b64 = base64.b64encode(open(png, 'rb').read()).decode()

        dec = await b.new_page()
        await dec.goto('about:blank')
        await dec.add_script_tag(url='https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js')
        res = await dec.evaluate('''async (b64) => {
          const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
          const out = {};
          // 從整張頁面找 QR，解析度一路降：1＝300dpi、.5＝150dpi（手機拍整張 A4 大約這個等級）、.4＝120dpi、.33＝100dpi
          for (const s of [1, .5, .4, .33]) {
            const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
            const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height);
            const r = jsQR(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
            out[s] = r ? {data: r.data, v: r.version} : null;
          }
          return out; }''', b64)
        for s_, dpi in (('1', 300), ('0.5', 150), ('0.4', 120), ('0.33', 100)):
            r = res.get(s_)
            print(f'   整頁 {dpi}dpi：' + (f'掃得到（QR version {r["v"]}）' if r else '掃不到'))
        check(bool(res.get('0.5')), '從列印的 PDF 整頁（降到 150dpi）找得到並解得出 QR')
        url = (res.get('1') or res.get('0.5') or {}).get('data')
        if not url: return
        print('   解出：' + url[:90] + '…（共 ' + str(len(url)) + ' 字）')
        check(url.startswith('https://m255525.github.io/training-certificate-generator/#v='), 'QR 指向線上查驗網址')

        ctx2 = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True)  # 沒登入過的手機
        ph = await ctx2.new_page()
        await ph.goto(url.replace('https://m255525.github.io/training-certificate-generator/', BASE))  # 本機測試時改連本機
        await ph.wait_for_selector('#vSecret', timeout=30000)
        txt = await ph.text_content('#modalBox')
        check(not await ph.is_visible('#entryGate'), '手機（沒序號）打開：不會被序號擋住')
        check(not await ph.is_visible('#panel'), '手機（沒序號）：只看得到查驗畫面，看不到工具本身')
        for want in ['（115）示訓字第0001號', '王小明', '門市服務與顧客關係管理實務班', '36 小時', '臺灣示範職業訓練協會', '(02)2345-6789', '結訓證書']:
            check(want in txt, '查驗畫面有「' + want + '」')
        check('A123456789' not in txt and 'A12' not in txt, '查驗畫面沒有身分證字號')
        code = printed[0].replace('驗證碼 ', '')
        check(code in txt, f'查驗畫面的驗證碼 {code} 和證書上印的一致')
        await ph.screenshot(path=os.path.join(OUT, 'phone-verify.png'), full_page=True)
        await ph.fill('#vSecret', 'DEMO')
        await ph.click('[data-act="verifyGo"]')
        await ph.wait_for_selector('#vOut .alert', timeout=10000)
        check('相符' in await ph.text_content('#vOut') and '不符' not in await ph.text_content('#vOut'), '輸入正確密語 DEMO：驗證碼相符')
        await ph.fill('#vSecret', 'WRONG')
        await ph.click('[data-act="verifyGo"]')
        await ph.wait_for_timeout(500)
        check('不符' in await ph.text_content('#vOut'), '輸入錯誤密語：顯示不符')
        # 竄改：改掉 QR 裡的姓名再查
        forged = await ph.evaluate('''(u) => { const p = u.split('#v=')[1]; return location.href.split('#')[0] + '#v=' + TCG.b64u(TCG.unb64u(p).replace('王小明', '王大明')); }''', url)
        await ph.goto(forged)
        await ph.wait_for_selector('#vSecret')
        await ph.fill('#vSecret', 'DEMO')
        await ph.click('[data-act="verifyGo"]')
        await ph.wait_for_selector('#vOut .alert')
        check('不符' in await ph.text_content('#vOut'), '把 QR 裡的姓名改成別人：驗證碼不符（抓得到竄改）')
        await ctx2.close()
        await b.close()

asyncio.run(main())
print('全部通過' if not fails else f'{len(fails)} 項失敗')
sys.exit(1 if fails else 0)
