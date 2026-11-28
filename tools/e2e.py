"""Benefit Finder v1.4.0 end-to-end tests (Playwright + local Chrome).
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
          return t.includes("CACHE = 'benefit-finder-v" + BF.VERSION + "'") && t.includes('index.html');
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
        check("version is 1.4.0", page.evaluate("BF.VERSION") == "1.4.0", page.evaluate("BF.VERSION"))

        WOMEN_IDS = ["wes-loan-fund", "wes-business-support", "mb-women-trades", "mb-gbv-supports"]

        def matched_ids(gender, extra=None):
            return page.evaluate(
                """([g, extra]) => {
                  const p = Object.assign({
                    province: 'MB', age: 32, marital: 'single', householdIncome: 28000,
                    working: true, workingIncome: 28000, children: [], gender: g,
                    businessOwner: true, tradesApprentice: true, pregnant: false
                  }, extra || {});
                  return BF.matchAll(p).filter((m) => m.estimate.match).map((m) => m.program.id);
                }""",
                [gender, extra or {}],
            )

        ids_f = matched_ids("woman")
        check("Female surfaces women-targeted programs", all(i in ids_f for i in WOMEN_IDS), ids_f)
        ids_p = matched_ids("prefer-not")
        check("Prefer not to say does not surface women-targeted programs", not any(i in ids_p for i in WOMEN_IDS), ids_p)
        ids_n = matched_ids("not-listed")
        check("I will not provide this does not surface women-targeted programs", not any(i in ids_n for i in WOMEN_IDS), ids_n)
        ids_m = matched_ids("man")
        check("Male does not surface women-targeted programs", not any(i in ids_m for i in WOMEN_IDS), ids_m)
        check("Male surfaces no men-only cash program (none verified)", not any(str(i).startswith("men-") for i in ids_m), ids_m)
        ids_mat_m = matched_ids("man", {"pregnant": True, "working": True, "workingIncome": 28000})
        check("EI maternity is keyed on pregnancy, including for Male", "ei-maternity" in ids_mat_m, ids_mat_m)
        loan_tot = page.evaluate("""() => {
          const p = {province:'MB', age:32, marital:'single', householdIncome:28000, gender:'woman', businessOwner:true, tradesApprentice:true, children:[]};
          const t = BF.totals(BF.matchAll(p));
          return {cash: t.cash, hasLoans: t.hasLoans, ids: t.matched.map(m => m.program.id)};
        }""")
        check("women entrepreneurship loan is listed but excluded from the dollar total", loan_tot["hasLoans"] is True and "wes-loan-fund" in loan_tot["ids"] and loan_tot["cash"] < 50000, loan_tot)

        page.click("#btnStart")
        page.wait_for_selector('input[name="age"]')
        page.fill('input[name="displayName"]', "Test Client")
        page.select_option('select[name="province"]', "MB")
        page.fill('input[name="age"]', "32")
        page.select_option('select[name="marital"]', "single")
        page.check('input[name="livedInCanadaMostOfLife"]')
        page.click("#btnNext")

        page.wait_for_selector('input[name="householdIncome"]')
        check("ID upload is not in the intake flow", page.locator("#idFile").count() == 0 and "Government ID" not in page.inner_text("#view"))
        check("intake is 4 steps and step 2 is household", "Step 2 of 4" in page.inner_text("#view") and "Household and income" in page.inner_text("#view"))
        page.fill('input[name="householdIncome"]', "28000")
        page.check('input[name="working"]')
        page.fill('input[name="workingIncome"]', "28000")
        check("profession and work type fields are on the household step", page.locator('select[name="profession"]').count() == 1 and page.locator('select[name="workType"]').count() == 1)
        check("optional 2025 income details are present", page.locator("#incomeDetails").count() == 1 and page.locator('input[name="incomeEmployment"]').count() == 1 and page.locator('input[name="incomeCapitalGains"]').count() == 1)
        check("RRSP room field is next to the RRSP deduction field", page.locator('input[name="rrspRoom"]').count() == 1 and page.locator('input[name="rrspDeduction"]').count() == 1)
        page.select_option('select[name="profession"]', "office")
        page.select_option('select[name="workType"]', "employee")
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
        check("ethnicity is optional multi-select with Prefer not to say", page.locator('#ethnicityField input[name="ethnicity"][value="prefer-not"]').count() == 1 and page.locator('#ethnicityField input[name="ethnicity"]').count() >= 10)
        check("ethnicity hint says optional and only used to find programs", "optional" in page.locator("#ethnicityField").inner_text().lower() and "only to find" in page.locator("#ethnicityField").inner_text().lower())
        page.click("#btnNext")

        page.wait_for_selector("#referralCodeEntered")
        page.fill("#referralCodeEntered", "DEMO-REF")
        page.click("#btnFind")

        page.wait_for_selector("#alreadyPanel")
        check("already-receiving checklist appears before results", "already receive" in page.inner_text("#alreadyPanel").lower())
        defaults_no = page.evaluate("""() => [...document.querySelectorAll('[data-already][data-val="no"]')].every((b) => b.getAttribute('aria-pressed') === 'true')""")
        check("already-receiving defaults to No", defaults_no is True)
        page.click("#btnToResults")
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
        check("results offer close lead and start onboarding, not ID upload", page.locator("#btnCloseLead").count() == 1 and page.locator("#idFile").count() == 0)

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

        # --- ID upload moves to post-close onboarding ---
        page.click('button[data-view="results"]')
        page.wait_for_selector("#btnCloseLead, #btnStartOnboarding")
        if page.locator("#btnCloseLead").count():
            page.click("#btnCloseLead")
        else:
            page.click("#btnStartOnboarding")
        page.wait_for_selector("#onboardingPanel #idFile")
        check("ID upload is in post-close onboarding", "Onboarding" in page.inner_text("#onboardingPanel") and "Government ID" in page.inner_text("#onboardingPanel"))
        check("onboarding ID step says files stay on the device", "this device" in page.inner_text("#onboardingPanel").lower())
        page.set_input_files("#idFile", ID_PNG)
        page.wait_for_function("() => (JSON.parse(localStorage.getItem('benefit-finder-v1')||'{}').idMeta||[]).length >= 1")
        check("ID file is stored in IndexedDB metadata", page.evaluate("JSON.parse(localStorage.getItem('benefit-finder-v1')).idMeta.length") >= 1)
        page.wait_for_selector("#idPreviews figure")
        check("ID preview is shown", page.locator("#idPreviews figure").count() >= 1)

        # --- Ethnicity matching (only verified identity-targeted programs) ---
        def ids_for(profile):
            return page.evaluate(
                """(profile) => {
                  const p = Object.assign(BF.emptyProfile(), profile);
                  return BF.matchAll(p).filter((m) => m.estimate.match).map((m) => m.program.id);
                }""",
                profile,
            )

        ids_pref = ids_for({"province": "MB", "age": 32, "marital": "single", "householdIncome": 28000,
                            "working": True, "workingIncome": 28000, "businessOwner": True, "student": True,
                            "newcomer": True, "ethnicity": ["prefer-not"], "children": []})
        check("Prefer not to say hides Black loan and PSSSP", "bep-loan-fund" not in ids_pref and "psssp" not in ids_pref, ids_pref)

        ids_black = ids_for({"province": "MB", "age": 32, "marital": "single", "householdIncome": 28000,
                             "working": True, "workingIncome": 28000, "businessOwner": True,
                             "ethnicity": ["black"], "children": []})
        check("Black + business owner surfaces Black Entrepreneurship Loan Fund", "bep-loan-fund" in ids_black, ids_black)
        loan_b = page.evaluate("""() => {
          const p = Object.assign(BF.emptyProfile(), {province:'MB', age:32, marital:'single', householdIncome:28000, businessOwner:true, ethnicity:['black'], children:[]});
          const t = BF.totals(BF.matchAll(p));
          return {cash: t.cash, hasLoans: t.hasLoans, ids: t.matched.map(m => m.program.id)};
        }""")
        check("Black entrepreneurship loan is listed but excluded from the dollar total", loan_b["hasLoans"] is True and "bep-loan-fund" in loan_b["ids"] and loan_b["cash"] < 250000, loan_b)

        ids_fn = ids_for({"province": "MB", "age": 20, "marital": "single", "householdIncome": 15000,
                          "student": True, "ethnicity": ["first-nations"], "children": []})
        check("First Nations + student surfaces NIHB and PSSSP", "nihb" in ids_fn and "psssp" in ids_fn, ids_fn)

        ids_metis = ids_for({"province": "MB", "age": 20, "marital": "single", "householdIncome": 15000,
                             "student": True, "ethnicity": ["metis"], "children": []})
        check("Métis does not surface NIHB or PSSSP (those are First Nations / Inuit)", "nihb" not in ids_metis and "psssp" not in ids_metis, ids_metis)

        ids_new = ids_for({"province": "MB", "age": 32, "marital": "single", "householdIncome": 28000,
                           "newcomer": True, "ethnicity": ["prefer-not"], "children": []})
        check("Newcomer surfaces IRCC settlement services", "ircc-settlement" in ids_new, ids_new)

        # --- Already receiving: Homeowners Affordability Tax Credit ---
        def money_val(text):
            return float(text.replace("$", "").replace(",", "").strip())

        page.evaluate("""() => {
          const st = BF.getState();
          st.profile = Object.assign(BF.emptyProfile(), {
            displayName: 'Pat Owner', province: 'MB', age: 45, marital: 'single',
            householdIncome: 50000, housing: 'own', livedInCanadaMostOfLife: true,
            gender: 'prefer-not', children: []
          });
          st.intakeStarted = true;
          st.alreadyReceiving = {};
          st.alreadyConfirmed = false;
          st.selectedIds = [];
          BF.replaceState(st);
          BF.goto('already');
        }""")
        page.wait_for_selector("#alreadyPanel")
        check("HATC appears on the already-receiving checklist", page.locator('[data-already-row="hatc"]').count() == 1)
        page.click("#btnToResults")
        page.wait_for_selector("#estimateTotal")
        check("No shows Homeowners Affordability Tax Credit in results", page.locator('[data-program-id="hatc"]').count() == 1)
        total_with = money_val(page.inner_text("#estimateTotal"))
        page.click('button[data-go="already"]')
        page.wait_for_selector('[data-already="hatc"][data-val="yes"]')
        page.click('[data-already="hatc"][data-val="yes"]')
        page.click("#btnToResults")
        page.wait_for_selector("#estimateTotal")
        total_without = money_val(page.inner_text("#estimateTotal"))
        check("Yes hides Homeowners Affordability Tax Credit from results", page.locator('[data-program-id="hatc"]').count() == 0)
        check("Yes lowers the dollar total by the HATC amount", abs((total_with - total_without) - 1600) < 0.05, {"with": total_with, "without": total_without})
        check("HATC name does not appear anywhere on the results page", "Homeowners Affordability" not in page.inner_text("#view"))
        page.click('button[data-go="alreadyEdit"]')
        page.wait_for_selector("#alreadyList")
        check("HATC is on the separate undo page", page.locator('#alreadyList [data-already-hidden="hatc"]').count() == 1)
        page.click('#alreadyList button[data-go="results"]')
        page.wait_for_selector("#estimateTotal")

        # --- Already-receiving items are never suggested again on a new search ---
        page.evaluate("""() => { const st = BF.getState(); st.alreadyConfirmed = false; st.selectedIds = []; BF.replaceState(st); BF.goto('results'); }""")
        page.wait_for_selector("#alreadyPanel, #resultsPanel")
        check("New search: HATC not asked again on the checklist", page.locator('[data-already-row="hatc"]').count() == 0)
        if page.locator("#alreadyPanel").count():
            check("New search: checklist notes hidden already-received items", page.locator("#alreadyLockedNote").count() == 1)
            page.click("#btnToResults")
        page.wait_for_selector("#estimateTotal")
        check("New search: HATC not suggested in results", page.locator('[data-program-id="hatc"]').count() == 0)
        check("New search: total still excludes HATC", abs(money_val(page.inner_text("#estimateTotal")) - total_without) < 0.05)
        all_ids = page.evaluate("""() => { const st = BF.getState(); const ids = BF.matchAll(st.profile).filter(m => m.estimate.match).map(m => m.program.id);
            st.alreadyReceiving = {}; ids.forEach(id => st.alreadyReceiving[id] = true); st.alreadyConfirmed = false; st.selectedIds = []; BF.replaceState(st); BF.goto('results'); return ids; }""")
        page.wait_for_selector("#resultsPanel")
        check("Every credit and benefit marked Yes: checklist skipped, nothing suggested", page.locator("#alreadyPanel").count() == 0 and page.locator(".prog-row").count() == 0, len(all_ids))
        page.click('button[data-go="alreadyEdit"]')
        page.wait_for_selector("#alreadyList")
        check("Every item marked Yes is on the separate undo page", page.locator("#alreadyList [data-already-hidden]").count() == len(all_ids))
        page.evaluate("""() => { const st = BF.getState(); st.alreadyReceiving = {}; BF.replaceState(st); }""")

        # --- Gender UI ---
        def show_results_for(profile):
            page.evaluate("""(profile) => {
              const st = BF.getState();
              st.profile = Object.assign(BF.emptyProfile(), profile);
              st.intakeStarted = true;
              st.alreadyReceiving = {};
              st.alreadyConfirmed = false;
              st.selectedIds = [];
              BF.replaceState(st);
              BF.goto('already');
            }""", profile)
            page.wait_for_selector("#alreadyPanel")
            page.click("#btnToResults")
            page.wait_for_selector("#resultsPanel")

        woman_profile = {
            "displayName": "Alex", "province": "MB", "age": 32, "marital": "single",
            "householdIncome": 28000, "housing": "rent", "gender": "woman",
            "businessOwner": True, "tradesApprentice": True, "children": [],
        }
        show_results_for(woman_profile)
        for pid, label in [
            ("wes-loan-fund", "Women Entrepreneurship Loan Fund"),
            ("wes-business-support", "WES business support"),
            ("mb-women-trades", "women in the trades"),
            ("mb-gbv-supports", "Gender-Based Violence"),
        ]:
            check("Female results include " + pid, page.locator('[data-program-id="%s"]' % pid).count() == 1, page.inner_text("#resultsPanel")[:200])
        check("Female loan is labelled a loan and not added as $50,000 cash", "loan" in page.locator('[data-program-id="wes-loan-fund"]').inner_text().lower() and "50,000" in page.inner_text("#resultsPanel") and money_val(page.inner_text("#estimateTotal")) < 50000)

        show_results_for(dict(woman_profile, gender="prefer-not"))
        missing = [pid for pid in WOMEN_IDS if page.locator('[data-program-id="%s"]' % pid).count() != 0]
        check("Prefer not to say hides women-targeted programs in the UI", missing == [], missing)

        show_results_for(dict(woman_profile, gender="man"))
        missing_m = [pid for pid in WOMEN_IDS if page.locator('[data-program-id="%s"]' % pid).count() != 0]
        check("Male hides women-targeted programs in the UI and does not error", missing_m == [] and not errs, missing_m)

        show_results_for({
            "displayName": "Sam", "province": "MB", "age": 32, "marital": "single",
            "householdIncome": 28000, "housing": "rent", "gender": "prefer-not",
            "ethnicity": ["black"], "businessOwner": True, "children": [],
        })
        check("Black results include Black Entrepreneurship Loan Fund", page.locator('[data-program-id="bep-loan-fund"]').count() == 1, page.inner_text("#resultsPanel")[:200])
        check("Black loan is labelled a loan and not added as $250,000 cash", "loan" in page.locator('[data-program-id="bep-loan-fund"]').inner_text().lower() and money_val(page.inner_text("#estimateTotal")) < 250000)

        # --- 2025 Tax Refund Estimator (lean essential checks) ---
        show_results_for({
            "displayName": "Tax Client", "province": "MB", "age": 32, "marital": "single",
            "householdIncome": 55000, "working": True, "workingIncome": 55000,
            "housing": "own", "rrspDeduction": 3000, "taxWithheld": 10500, "children": []
        })
        tax_text = page.inner_text("#taxEstimatePanel")
        check("tax estimator shows 2025 refund ($2,516.24)", "estimated 2025 tax refund" in tax_text.lower() and "2,516.24" in tax_text, page.inner_text("#taxRefundAmount"))
        check("tax estimator shows plain-language disclaimer", "not tax advice" in page.inner_text("#taxDisclaimer").lower())

        # Permanent rule: marking CWB & MB RATC as already received excludes them from tax refund too
        show_results_for({
            "displayName": "Renter Client", "province": "MB", "age": 28, "marital": "single",
            "householdIncome": 24000, "working": True, "workingIncome": 24000,
            "housing": "rent", "monthlyRent": 1100, "taxWithheld": 1500, "children": []
        })
        check("low-income MB renter gets $2,300.41 refund with CWB + RATC", "2,300.41" in page.inner_text("#taxRefundAmount"), page.inner_text("#taxRefundAmount"))
        page.click('button[data-go="already"]')
        page.wait_for_selector('[data-already="cwb"][data-val="yes"]')
        page.click('[data-already="cwb"][data-val="yes"]')
        page.click('[data-already="ratc"][data-val="yes"]')
        page.click("#btnToResults")
        page.wait_for_selector("#taxRefundAmount")
        check("alreadyReceiving excludes CWB and MB RATC from tax refund ($92.41)", "92.41" in page.inner_text("#taxRefundAmount"), page.inner_text("#taxRefundAmount"))

        # Balance owing case + mobile viewport & native-feel CSS check
        show_results_for({
            "displayName": "Owing Client", "province": "MB", "age": 45, "marital": "single",
            "householdIncome": 95000, "working": True, "workingIncome": 95000,
            "housing": "own", "taxWithheld": 15000, "children": []
        })
        check("balance owing shown when tax withheld is short", "estimated 2025 balance owing" in page.inner_text("#taxEstimatePanel").lower())
        mobile_ok = page.evaluate("""() => {
          const overflow = document.documentElement.scrollWidth > window.innerWidth;
          const bodySel = getComputedStyle(document.body).userSelect || getComputedStyle(document.body).webkitUserSelect;
          return { overflow, bodySel };
        }""")
        check("mobile viewport has no horizontal overflow and native user-select", mobile_ok["overflow"] is False and mobile_ok["bodySel"] == "none", mobile_ok)

        # --- v1.3.0 profession, income details, write-offs ---
        show_results_for({
            "displayName": "Carpenter Client", "province": "MB", "age": 32, "marital": "single",
            "householdIncome": 55000, "working": True, "profession": "carpenter", "workType": "employee",
            "incomeEmployment": 55000, "rrspDeduction": 3000, "taxWithheld": 10500,
            "housing": "own", "children": [], "writeoffAmounts": {"tradesTools": 2500}
        })
        wo = page.inner_text("#writeoffsPanel")
        check("carpenter write-offs include trades tools and labour mobility", "Tradesperson" in wo and "Labour mobility" in wo, wo[:400])
        check("carpenter tools amount updates refund to $2,788.74", "2,788.74" in page.inner_text("#taxRefundAmount"), page.inner_text("#taxRefundAmount"))
        check("expired digital news credit is not listed", "digital news" not in wo.lower() and "digital news" not in page.inner_text("body").lower())
        page.fill('[data-writeoff-amount="tradesTools"]', "0")
        page.locator('[data-writeoff-amount="tradesTools"]').dispatch_event("change")
        page.wait_for_function("""() => document.querySelector("#taxRefundAmount") && document.querySelector("#taxRefundAmount").innerText.includes("2,516.24")""")
        check("clearing tools cost restores $2,516.24 refund", "2,516.24" in page.inner_text("#taxRefundAmount"), page.inner_text("#taxRefundAmount"))
        page.fill('[data-writeoff-amount="tradesTools"]', "2500")
        page.locator('[data-writeoff-amount="tradesTools"]').dispatch_event("change")
        page.wait_for_function("""() => document.querySelector("#taxRefundAmount") && document.querySelector("#taxRefundAmount").innerText.includes("2,788.74")""")
        page.evaluate("""() => {
          const el = document.querySelector('[data-writeoff-already="tradesTools"]');
          el.checked = true;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }""")
        page.wait_for_selector("#writeoffAlreadyNote")
        check("already-claim hides trades tools and restores $2,516.24 refund", page.locator('[data-writeoff-id="tradesTools"]').count() == 0 and "2,516.24" in page.inner_text("#taxRefundAmount"), page.inner_text("#taxRefundAmount"))

        show_results_for({
            "displayName": "Teacher Client", "province": "MB", "age": 40, "marital": "single",
            "householdIncome": 55000, "working": True, "profession": "teacher", "workType": "employee",
            "incomeEmployment": 55000, "housing": "own", "taxWithheld": 8000, "children": []
        })
        wo_t = page.inner_text("#writeoffsPanel")
        check("teacher write-offs include educator school supply credit", "Eligible educator" in wo_t or "school supply" in wo_t.lower(), wo_t[:400])
        check("teacher write-offs omit trades tools", "Tradesperson" not in wo_t, wo_t[:400])

        show_results_for({
            "displayName": "Contractor Client", "province": "MB", "age": 40, "marital": "single",
            "householdIncome": 60000, "working": True, "profession": "contractor", "workType": "self-employed",
            "selfEmployed": True, "incomeSelfEmployedGross": 80000, "incomeSelfEmployedNet": 60000,
            "housing": "own", "taxWithheld": 0, "children": []
        })
        wo_c = page.inner_text("#writeoffsPanel")
        check("self-employed write-offs include T2125 expenses", "T2125" in wo_c or "Self-employment" in wo_c or "self-employed" in wo_c.lower(), wo_c[:400])
        check("self-employed write-offs omit trades tools", "Tradesperson" not in wo_c, wo_c[:400])

        show_results_for({
            "displayName": "RRSP Friend", "province": "MB", "age": 35, "marital": "single",
            "householdIncome": 70000, "working": True, "workingIncome": 70000,
            "housing": "own", "children": [], "rrspRoom": 10000
        })
        helper = page.inner_text("#rrspHelperPanel")
        check("RRSP helper panel is on results", page.locator("#rrspHelperPanel").count() == 1 and "RRSP helper" in helper, helper[:200])
        for label in ["$0.00 contribution", "$1,000.00 contribution", "$2,500.00 contribution", "$5,000.00 contribution", "$10,000.00 contribution"]:
            check("RRSP helper includes " + label, label in helper, helper[:300])
        check("RRSP helper shows $3,325 extra at full room and 33.25% rate", "3,325.00" in helper and "33.25%" in helper, helper)
        check("RRSP helper names the $11,960 sweet spot above $10k room", "11,960" in helper and "57,375" in helper and "not enough" in helper.lower(), page.inner_text("#rrspHelperNotes"))
        check("RRSP helper includes 60-day, carryforward, deduct later, and FHSA/TFSA notes", "first 60 days of 2026" in helper and "carries forward" in helper.lower() and "higher-income year" in helper and "FHSA" in helper and "TFSA" in helper, helper[-500:])
        check("existing tax disclaimer remains on the page", "not tax advice" in page.inner_text("#taxDisclaimer").lower())
        overflow = page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth")
        check("RRSP helper does not cause horizontal overflow at 390px", overflow is False, overflow)

        check("no page errors", not errs, errs)

        browser.close()

    failed = [r for r in results if not r[1]]
    print("\n%d passed, %d failed, %d total" % (len(results) - len(failed), len(failed), len(results)), flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
