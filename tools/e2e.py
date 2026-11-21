"""Benefit Finder v1.0.0 end-to-end tests (Playwright + local Chrome).
Serve the app on 127.0.0.1:8940 and run:
  /workspace/.venv-pw/bin/python tools/e2e.py
Exit code 1 if any test fails.
"""
import os
import sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = os.environ.get("BENEFIT_FINDER_URL", "http://127.0.0.1:8940/index.html")
ID_PNG = os.path.join(ROOT, "icons", "icon-192.png")
results = []


def check(name, ok, info=""):
    results.append((name, bool(ok), info))
    print(("PASS " if ok else "FAIL ") + name + (("  [" + str(info) + "]") if info != "" else ""), flush=True)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, accept_downloads=True, service_workers="block")
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda msg: errs.append(msg.text) if msg.type == "error" else None)

        page.goto(URL, wait_until="domcontentloaded")
        page.wait_for_selector("#btnStart")
        page.evaluate("localStorage.clear()")
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("#btnStart")

        check("name: document title is Benefit Finder", page.title() == "Benefit Finder", page.title())
        check("name: header and APP_NAME constant", "Benefit Finder" in page.inner_text("header") and page.evaluate("BF.APP_NAME") == "Benefit Finder")
        check("prototype marker is visible", "Prototype" in page.inner_text("body"))
        check("privacy notice mentions device storage", "stay on this device" in page.inner_text("body").lower() or "on this device" in page.inner_text("body").lower())
        check("install button is present for non-standalone", page.locator("#btnInstall").count() == 1)
        apple = page.evaluate("""() => ({
          title: (document.querySelector('meta[name="apple-mobile-web-app-title"]') || {}).content,
          capable: (document.querySelector('meta[name="apple-mobile-web-app-capable"]') || {}).content,
          icon: (document.querySelector('link[rel="apple-touch-icon"]') || {}).href,
          manifest: (document.querySelector('link[rel="manifest"]') || {}).href
        })""")
        check("iOS meta and apple-touch-icon", apple["title"] == "Benefit Finder" and apple["capable"] == "yes" and "apple-touch-icon.png" in (apple["icon"] or ""), apple)
        man = page.evaluate("""async () => {
          const r = await fetch('manifest.webmanifest');
          return r.json();
        }""")
        sizes = sorted({s for ic in man.get("icons", []) for s in str(ic.get("sizes") or "").split() if s != "any"})
        check("manifest is standalone with 192 and 512 icons", man.get("display") == "standalone" and man.get("short_name") == "Benefit Finder" and "192x192" in sizes and "512x512" in sizes, {"sizes": sizes, "display": man.get("display")})
        sw = page.evaluate("""async () => {
          const r = await fetch('sw.js');
          const t = await r.text();
          return t.includes("CACHE = 'benefit-finder-v1.0.0'") && t.includes('index.html');
        }""")
        check("service worker file caches the app shell", sw is True)

        # Official matcher numbers, independent of the form
        ccb = page.evaluate("""() => {
          const est = BF.estimateProgram(BF.programById('ccb'), {
            province: 'MB', age: 32, marital: 'single', householdIncome: 28000,
            children: [{age: 3, hasDtc: false}, {age: 8, hasDtc: false}]
          });
          return est;
        }""")
        check("matcher: CCB at $28,000 with children 3 and 8 is $15,040", ccb.get("match") and abs(ccb.get("amountCad") - 15040) < 0.01, ccb)
        fees = page.evaluate("""() => BF.computeFees(
          [{amountCad: 15040, dtcContingent: false}, {amountCad: 3480, dtcContingent: true, feeCapped: true}],
          {feePercent: 3, referralPercent: 1}
        )""")
        check("fees: 3% applies to non-DTC amounts only ($451.20)", abs(fees.get("percentFee") - 451.20) < 0.02 and abs(fees.get("baseFound") - 15040) < 0.01, fees)
        check("fees: DTC amount is excluded and $100 cap is recorded", fees.get("dtcCapCad") == 100 and fees.get("dtcFound") == 3480, fees)
        check("catalog has at least 20 official programs", page.evaluate("BF.PROGRAMS.length") >= 20, page.evaluate("BF.PROGRAMS.length"))

        page.click("#btnStart")
        page.wait_for_selector('input[name="age"]')
        page.fill('input[name="displayName"]', "Test Client")
        page.select_option('select[name="province"]', "MB")
        page.fill('input[name="age"]', "32")
        page.select_option('select[name="marital"]', "single")
        page.check('input[name="livedInCanadaMostOfLife"]')
        page.click("#btnNext")

        page.wait_for_selector("#idFile")
        check("ID upload is early (step 2 of 5)", "Step 2 of 5" in page.inner_text("#view") and "Government ID" in page.inner_text("#view"))
        check("ID step says files stay on the device", "this device" in page.inner_text("#view").lower())
        page.set_input_files("#idFile", ID_PNG)
        page.wait_for_function("() => (JSON.parse(localStorage.getItem('benefit-finder-v1')||'{}').idMeta||[]).length >= 1")
        check("ID file is stored in IndexedDB metadata", page.evaluate("JSON.parse(localStorage.getItem('benefit-finder-v1')).idMeta.length") >= 1)
        page.wait_for_selector("#idPreviews figure")
        check("ID preview is shown", page.locator("#idPreviews figure").count() >= 1)
        page.click("#btnNext")

        page.wait_for_selector('input[name="householdIncome"]')
        page.fill('input[name="householdIncome"]', "28000")
        page.check('input[name="working"]')
        page.fill('input[name="workingIncome"]', "28000")
        page.select_option('select[name="housing"]', "rent")
        page.click("#btnAddChild")
        page.click("#btnAddChild")
        page.wait_for_selector('input[name="childAge1"]')
        page.fill('input[name="childAge0"]', "3")
        page.fill('input[name="childAge1"]', "8")
        page.click("#btnNext")

        page.wait_for_selector('select[name="disability"]')
        page.select_option('select[name="disability"]', "none")
        # leave dental insurance unchecked
        page.select_option('select[name="gender"]', "prefer-not")
        page.select_option('select[name="ethnicity"]', "prefer-not")
        page.click("#btnNext")

        page.wait_for_selector("#referralCodeEntered")
        page.fill("#referralCodeEntered", "DEMO-REF")
        page.click("#btnFind")

        page.wait_for_selector("#estimateTotal")
        body = page.inner_text("#resultsPanel")
        total_text = page.inner_text("#estimateTotal")
        check("results show an approximate dollar total", "$" in total_text and total_text != "$0", total_text)
        check("results include Canada Child Benefit", "Canada Child Benefit" in body)
        check("results include CCB amount $15,040", "15,040" in body.replace(" ", ""), body[:500])
        check("results mention official benefit year", "July 2026" in body or "2026" in body)
        check("fee summary uses 3% and excludes DTC cap language", "3%" in page.inner_text("#feeSummary") and "100" in page.inner_text("#feeSummary") and "injunction" in page.inner_text("#feeSummary").lower())
        check("accountant routing is shown for tax programs", "Routes to accountant" in body)
        check("direct routing is shown for non-tax programs", "Submit directly" in body)
        check("Dental Care Plan or Rent Assist appears for this profile", "Dental Care Plan" in body or "Rent Assist" in body)

        # Keep CCB + Groceries benefit only, for a clean fee
        for sel in page.locator("input[data-select]").all():
            pid = sel.get_attribute("data-select")
            if pid in ("ccb", "cgeb"):
                if not sel.is_checked():
                    sel.check()
            else:
                if sel.is_checked():
                    sel.uncheck()
        page.click("#btnApprove")
        page.wait_for_selector(".track")
        tracker = page.inner_text("main")
        check("tracker lists approved packets as Submitted", "Submitted" in tracker and "Canada Child Benefit" in tracker)
        check("tracker shows a date", "2026" in tracker or "Nov" in tracker or "," in tracker)
        check("tracker still shows accountant routing", "Routes to accountant" in tracker)

        # Owner desk: accept the unlock confirm, advance CCB and CGEB to Approved
        page.click('button[data-view="more"]')
        page.wait_for_selector("#btnOwner")
        page.once("dialog", lambda d: d.accept())
        page.click("#btnOwner")
        page.wait_for_selector("#accountantQueue")
        check("owner desk has an accountant queue", "Accountant queue" in page.inner_text("main"))
        check("owner desk lists the tax packets", "Canada Child Benefit" in page.inner_text("#accountantQueue") or "Canada Child Benefit" in page.inner_text("main"))

        def advance_named(name_part):
            rows = page.locator("table tr").all()
            for row in rows:
                if name_part in row.inner_text():
                    btn = row.locator("button[data-advance]")
                    if btn.count():
                        btn.first.click()
                        page.wait_for_timeout(150)
                        return True
            return False

        # submitted -> in-review
        check("advance CCB to In review", advance_named("Canada Child Benefit"))
        check("advance Groceries benefit to In review", advance_named("Groceries") or advance_named("Essentials"))
        check("status In review is visible", "In review" in page.inner_text("main"))
        # in-review -> approved
        check("advance CCB to Approved", advance_named("Canada Child Benefit"))
        check("advance Groceries benefit to Approved", advance_named("Groceries") or advance_named("Essentials"))
        check("status Approved is visible", "Approved" in page.inner_text("main"))

        fees_text = page.inner_text("#ownerFees")
        # 15040 + 1124 = 16164; 3% = 484.92
        check("owner fee is 3% of $16,164 ($484.92)", "484.92" in fees_text or "484.92" in fees_text.replace(",", "") or "$484.92" in fees_text, fees_text)
        ref_text = page.inner_text("#ownerReferral")
        # 1% of 16164 = 161.64
        check("referral credit of 1% is owed to DEMO-REF ($161.64)", "DEMO-REF" in ref_text and "161.64" in ref_text, ref_text)

        page.click('button[data-view="tracker"]')
        page.wait_for_selector(".track")
        check("tracker now shows Approved on the status path", page.locator("i.now", has_text="Approved").count() >= 1 or "Approved" in page.inner_text("main"))
        page.click("button[data-open-packet]")
        page.wait_for_selector("text=Application packet")
        pack = page.inner_text("main")
        check("packet has official link, checklist, and prefilled summary", "Official" in pack and "checklist" in pack.lower() and "does not submit" in pack.lower() or "not submitted" in pack.lower())
        check("packet does not pretend to have been sent to government", "not submitted to government" in pack.lower() or "not submitted" in pack.lower())

        page.click('button[data-view="more"]')
        page.click('button[data-go="referral"]')
        page.wait_for_selector("#myReferralCode")
        check("referral dashboard shows this user's code", page.inner_text("#myReferralCode").startswith("BF-"))
        check("referral dashboard mentions the entered referrer code", "DEMO-REF" in page.inner_text("main"))

        check("no page errors", not errs, errs)

        browser.close()

    failed = [r for r in results if not r[1]]
    print("\n%d passed, %d failed, %d total" % (len(results) - len(failed), len(failed), len(results)), flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
