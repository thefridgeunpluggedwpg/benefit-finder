(function () {
  "use strict";

  var state = BF.loadState();
  var deferredPrompt = null;
  var installDismissed = false;
  var openPacketId = null;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmtMoney(n) {
    if (n == null || !isFinite(n)) return "Amount varies";
    var opts = { style: "currency", currency: "CAD" };
    if (Math.round(n * 100) % 100 === 0) opts.maximumFractionDigits = 0;
    return new Intl.NumberFormat("en-CA", opts).format(n);
  }

  function todayISO() {
    var d = new Date();
    var z = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - z).toISOString().slice(0, 10);
  }

  function formatDate(iso) {
    if (!iso) return "";
    var p = String(iso).split("-");
    if (p.length !== 3) return iso;
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return months[Number(p[1]) - 1] + " " + Number(p[2]) + ", " + p[0];
  }

  function save() { BF.saveState(state); }

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function profileForMatch() {
    var p = JSON.parse(JSON.stringify(state.profile));
    p.age = num(p.age);
    p.householdIncome = num(p.householdIncome);
    if (p.workingIncome !== "" && p.workingIncome != null) p.workingIncome = num(p.workingIncome);
    p.yearsInCanadaAfter18 = num(p.yearsInCanadaAfter18);
    p.children = (p.children || []).map(function (c) {
      return { age: num(c.age), hasDtc: !!c.hasDtc };
    });
    return p;
  }

  function matches() { return BF.matchAll(profileForMatch()); }

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function isIOS() {
    var ua = window.navigator.userAgent || "";
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  // Ids the person had already said Yes to when the checklist opened. Those are never asked about
  // or suggested again on later searches (all credits, deductions and benefits, not one program).
  var lockedYes = [];

  function skipAlreadyIds() {
    var rec = state.alreadyReceiving || {};
    return Object.keys(rec).filter(function (id) { return !!rec[id]; });
  }

  function setView(name) {
    if (name === "results" && !state.alreadyConfirmed) {
      var skip0 = skipAlreadyIds();
      var has = matches().some(function (m) { return m.estimate.match && skip0.indexOf(m.program.id) < 0; });
      if (has) name = "already";
    }
    if (name === "already") lockedYes = skipAlreadyIds();
    state.viewed = name;
    if (name === "intake") state.intakeStarted = true;
    save();
    render();
    $("#view").focus();
    window.scrollTo(0, 0);
  }

  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(function (reg) {
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") reg.update().catch(function () {});
      });
    }).catch(function () {});
  }

  function setupInstall() {
    var btn = $("#btnInstall");
    var banner = $("#installBanner");
    if (isStandalone()) {
      btn.hidden = true;
      banner.hidden = true;
      banner.classList.remove("show");
      return;
    }
    btn.hidden = false;
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferredPrompt = e;
      btn.hidden = false;
      if (!installDismissed) showInstallBanner("android");
    });
    window.addEventListener("appinstalled", function () {
      deferredPrompt = null;
      btn.hidden = true;
      hideInstallBanner();
    });
  }

  function showInstallBanner(kind) {
    var banner = $("#installBanner");
    var copy = $("#installCopy");
    var now = $("#btnInstallNow");
    var steps = $("#iosSteps");
    banner.hidden = false;
    banner.classList.add("show");
    if (kind === "ios") {
      copy.textContent = "Install Benefit Finder on your iPhone or iPad from Safari.";
      now.hidden = true;
      steps.hidden = false;
    } else {
      copy.textContent = "Install Benefit Finder on this phone for a full-screen app, with your data kept on the device.";
      now.hidden = false;
      steps.hidden = true;
    }
  }

  function hideInstallBanner() {
    var banner = $("#installBanner");
    banner.hidden = true;
    banner.classList.remove("show");
  }

  async function promptInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (e) {}
      deferredPrompt = null;
      return;
    }
    if (isIOS()) showInstallBanner("ios");
    else showInstallBanner("android");
  }

  function statusLabel(s) {
    return { submitted: "Submitted", "in-review": "In review", approved: "Approved", denied: "Denied" }[s] || s;
  }

  function routeLabel(r) {
    return r === "accountant" ? "Routes to accountant" : "Submit directly";
  }

  function renderTabs() {
    var hasMatches = !!(state.lastMatchCount > 0 || (state.selectedIds && state.selectedIds.length) || state.viewed === "already" || state.alreadyConfirmed);
    var hasApps = state.applications.length > 0;
    $("#tabResults").disabled = !hasMatches && state.viewed !== "results" && state.viewed !== "already";
    $("#tabTracker").disabled = !hasApps && state.viewed !== "tracker";
    $$(".tabbar button").forEach(function (b) {
      var target = b.getAttribute("data-view");
      var current = state.viewed;
      if (current === "owner" || current === "referral" || current === "packet") {
        if (target === "more") b.setAttribute("aria-current", "page");
        else b.removeAttribute("aria-current");
      } else if (target === current) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
  }

  function render() {
    var root = $("#view");
    var v = state.viewed || "home";
    if (v === "home") root.innerHTML = viewHome();
    else if (v === "intake") root.innerHTML = viewIntake();
    else if (v === "already") root.innerHTML = viewAlready();
    else if (v === "alreadyEdit") root.innerHTML = viewAlreadyEdit();
    else if (v === "results") root.innerHTML = viewResults();
    else if (v === "onboarding") root.innerHTML = viewOnboarding();
    else if (v === "tracker") root.innerHTML = viewTracker();
    else if (v === "referral") root.innerHTML = viewReferral();
    else if (v === "owner") root.innerHTML = viewOwner();
    else if (v === "packet") root.innerHTML = viewPacket();
    else if (v === "more") root.innerHTML = viewMore();
    else root.innerHTML = viewHome();
    bindView();
    renderTabs();
  }

  function viewHome() {
    return (
      '<section class="panel">' +
        '<p class="fine">Prototype — demo build. This app does not send applications to the government.</p>' +
        '<h1>Estimate your 2025 tax refund and see which benefits may apply.</h1>' +
        '<p class="lede">Benefit Finder looks at your situation and matches it to official federal and Manitoba programs. You get an approximate dollar total first. Nothing leaves this phone unless you copy it out yourself.</p>' +
        '<div class="notice">' +
          '<p>ID images, income, ethnicity, and other answers stay on this device (in your browser storage). They are not uploaded or transmitted by this prototype.</p>' +
        '</div>' +
        '<div class="actions">' +
          '<button class="btn" type="button" id="btnStart">' + (state.intakeStarted ? "Continue the form" : "Start the form") + '</button>' +
          (state.applications.length ? '<button class="btn secondary" type="button" data-go="tracker">Open the tracker</button>' : "") +
        '</div>' +
      '</section>' +
      '<section class="panel">' +
        '<h2>How it works</h2>' +
        '<p>You fill one form. A government ID upload is available later, during onboarding after a lead is closed or marked signed, because most programs ask for ID then.</p>' +
        '<p>Matching uses published rules only. If an official amount cannot be verified, the program shows “amount varies” instead of a number.</p>' +
        '<p>When you approve a program, this app builds a packet: a prefilled summary, the official application link, and a document checklist. Tax-related programs go to the owner’s accountant specialist queue. Other programs are marked “submit directly.” The owner updates status by hand: Submitted, In review, Approved, or Denied.</p>' +
        '<p class="fine">Gender and background or ethnicity are optional and include “prefer not to say.” You can choose more than one background. They are used only to list official programs that target those groups. If you prefer not to say, those targeted programs are left out.</p>' +
      '</section>'
    );
  }

  function viewMore() {
    return (
      '<section class="panel">' +
        '<h1>More</h1>' +
        '<div class="actions">' +
          '<button class="btn full" type="button" data-go="referral">Referral dashboard</button>' +
          '<button class="btn secondary full" type="button" id="btnOwner">Owner desk</button>' +
        '</div>' +
        '<p class="muted" style="margin-top:1rem">The owner desk is not locked in this prototype. Anyone with the phone can open it. A production build needs real sign-in.</p>' +
        '<p class="fine">Version ' + esc(BF.VERSION) + '</p>' +
      '</section>'
    );
  }

  function stepTitle(n) {
    return ["", "About you", "Household and income", "Your situation", "Review"][n] || "";
  }

  function viewIntake() {
    var s = state.intakeStep || 1;
    if (s < 1) s = 1;
    if (s > 4) s = 4;
    var dots = [1, 2, 3, 4].map(function (i) { return '<span class="' + (i <= s ? "on" : "") + '"></span>'; }).join("");
    var body = [null, stepAbout, stepHousehold, stepSituation, stepReview][s]();
    return (
      '<section class="panel">' +
        '<div class="stepper" aria-hidden="true">' + dots + '</div>' +
        '<p class="step-label">Step ' + s + ' of 4 · ' + esc(stepTitle(s)) + '</p>' +
        '<form id="intakeForm" autocomplete="off">' + body +
          '<div class="actions">' +
            (s > 1 ? '<button class="btn secondary" type="button" id="btnBack">Back</button>' : "") +
            (s < 4 ? '<button class="btn" type="submit" id="btnNext">Continue</button>' : '<button class="btn" type="submit" id="btnFind">Find my benefits</button>') +
          '</div>' +
        '</form>' +
      '</section>'
    );
  }

  function val(k) { return state.profile[k] == null ? "" : state.profile[k]; }

  function stepAbout() {
    return (
      '<h1>About you</h1>' +
      '<label class="field"><span>What should we call you? (optional)</span>' +
        '<input type="text" name="displayName" value="' + esc(val("displayName")) + '" maxlength="80">' +
      '</label>' +
      '<div class="grid-2">' +
        '<label class="field"><span>Province or territory</span>' +
          '<select name="province">' + provinceOptions(val("province") || "MB") + '</select>' +
          '<span class="hint">Provincial programs in this build cover Manitoba only. Federal programs still match in other provinces.</span>' +
        '</label>' +
        '<label class="field"><span>Age</span>' +
          '<input type="number" name="age" min="0" max="120" inputmode="numeric" required value="' + esc(val("age")) + '">' +
        '</label>' +
      '</div>' +
      '<label class="field"><span>Marital status</span>' +
        '<select name="marital">' + opts({
          single: "Single", married: "Married", "common-law": "Common-law",
          separated: "Separated", divorced: "Divorced", widowed: "Widowed"
        }, val("marital") || "single") + '</select>' +
      '</label>' +
      '<label class="field"><span>Years lived in Canada after age 18</span>' +
        '<input type="number" name="yearsInCanadaAfter18" min="0" max="100" inputmode="numeric" value="' + esc(val("yearsInCanadaAfter18")) + '">' +
      '</label>' +
      '<label class="choice"><input type="checkbox" name="livedInCanadaMostOfLife"' + (val("livedInCanadaMostOfLife") ? " checked" : "") + '>' +
        '<span>I have lived in Canada since age 18 (counts as 40 years for OAS rules)</span></label>' +
      '<label class="field"><span>Legal status in Canada (optional)</span>' +
        '<select name="residency">' + opts({
          unsure: "Prefer not to say or not sure",
          citizen: "Canadian citizen",
          pr: "Permanent resident",
          "indian-act": "Registered or entitled to be registered under the Indian Act",
          protected: "Protected person",
          temporary: "Temporary resident"
        }, val("residency") || "unsure") + '</select>' +
      '</label>'
    );
  }

  function stepId() {
    var files = (state.idMeta || []).map(function (f) {
      return '<figure data-id="' + esc(f.id) + '"><img alt="" data-thumb="' + esc(f.id) + '"><figcaption>' + esc(f.name) + '</figcaption></figure>';
    }).join("");
    return (
      '<h1>Government ID</h1>' +
      '<p>Most benefit applications ask for government ID. Upload it now so each packet can include it on the checklist as already on file on this device.</p>' +
      '<div class="notice warning">' +
        '<p>ID images stay on this device only. This prototype never transmits them. In a production app they would need encrypted, consented storage.</p>' +
      '</div>' +
      '<label class="field"><span>Upload a photo or scan of a government ID</span>' +
        '<input type="file" id="idFile" accept="image/*,application/pdf" multiple>' +
      '</label>' +
      '<div class="preview-list" id="idPreviews">' + files + '</div>' +
      (state.idMeta.length ? '<p class="fine" id="idStatus">' + state.idMeta.length + ' file' + (state.idMeta.length === 1 ? "" : "s") + ' stored on this device.</p>' :
        '<p class="fine" id="idStatus">No ID uploaded yet. You can continue and add it later; packets will list ID as still needed.</p>')
    );
  }

  function professionOptions(cur) {
    return (BF.PROFESSIONS || []).map(function (x) {
      return '<option value="' + esc(x.id) + '"' + (x.id === cur ? " selected" : "") + '>' + esc(x.label) + '</option>';
    }).join("");
  }

  function professionLabel(id) {
    var found = (BF.PROFESSIONS || []).filter(function (x) { return x.id === id; })[0];
    return found ? found.label : id;
  }

  function workTypeLabel(id) {
    return ({ employee: "Employee (T4)", "self-employed": "Self-employed / contractor", both: "Both employment and self-employment" })[id] || id;
  }

  function incomeDetailsFields() {

    function moneyField(name, label, hint) {
      return '<label class="field"><span>' + label + '</span>' +
        '<input type="number" name="' + name + '" min="0" step="1" inputmode="decimal" value="' + esc(val(name)) + '">' +
        (hint ? '<span class="hint">' + hint + '</span>' : "") +
        '</label>';
    }
    return (
      '<details class="income-details" id="incomeDetails">' +
        '<summary>Optional 2025 income details (T-slips)</summary>' +
        '<p class="fine">All fields are optional. If you fill any, the tax estimate uses these amounts instead of the household or working totals above (family benefits still use household income). Capital gains use the 50% inclusion rate. Dividends use the official gross-up and dividend tax credit.</p>' +
        moneyField("incomeEmployment", "Employment income (T4)", "T4 box 14.") +
        '<div class="grid-2">' +
          moneyField("incomeSelfEmployedGross", "Self-employment gross", "Before expenses (Form T2125).") +
          moneyField("incomeSelfEmployedNet", "Self-employment net", "After expenses. If you enter net, expense write-offs are not subtracted again.") +
        '</div>' +
        moneyField("incomeEiBenefits", "EI or CERB-type benefits", "T4E or similar taxable benefits.") +
        moneyField("incomePension", "CPP, OAS, or pension income", "T4A(P), T4A(OAS), or T4A. The $2,000 pension income amount is not applied automatically because this field can include CPP and OAS.") +
        moneyField("incomeInterest", "Interest and other investment income", "T5 interest and similar amounts, not dividends.") +
        '<div class="grid-2">' +
          moneyField("incomeDividendsEligible", "Eligible dividends (actual amount)", "Enter the actual dividends, not the taxable amount. The 138% gross-up is applied.") +
          moneyField("incomeDividendsOther", "Other-than-eligible dividends (actual)", "Enter the actual dividends. The 115% gross-up is applied.") +
        '</div>' +
        moneyField("incomeRentalNet", "Net rental income", "Form T776 net amount.") +
        moneyField("incomeCapitalGains", "Capital gains (actual gain)", "Enter the actual gain. Only 50% is taxable for 2025.") +
        moneyField("incomeOther", "Tips and other income", "Tips, honoraria, or other taxable amounts not listed above.") +
      '</details>'
    );
  }

  function stepHousehold() {

    var kids = (state.profile.children || []).map(function (c, i) {
      return '<div class="swipe-row" data-swipe-row="' + i + '">' +
        '<button class="swipe-delete" type="button" data-delete-child="' + i + '" aria-label="Delete child ' + (i + 1) + '">Delete</button>' +
        '<div class="swipe-content grid-2" data-child="' + i + '">' +
          '<label class="field"><span>Child ' + (i + 1) + ' age</span>' +
            '<input type="number" min="0" max="25" inputmode="numeric" name="childAge' + i + '" value="' + esc(c.age) + '"></label>' +
          '<label class="field"><span>&nbsp;</span><label class="choice"><input type="checkbox" name="childDtc' + i + '"' + (c.hasDtc ? " checked" : "") + '><span>Eligible for the Disability Tax Credit</span></label></label>' +
        '</div>' +
      '</div>';
    }).join("");
    return (
      '<h1>Household and income</h1>' +
      '<label class="field"><span>Adjusted family net income (about what you would report on line 23600, plus a spouse’s if you have one)</span>' +
        '<input type="number" name="householdIncome" min="0" step="1" inputmode="decimal" required value="' + esc(val("householdIncome")) + '">' +
        '<span class="hint">Use last year’s income when you can. Estimates are labelled with the official benefit year they belong to.</span>' +
      '</label>' +
      '<label class="choice"><input type="checkbox" name="working"' + (val("working") ? " checked" : "") + '><span>I had employment, self-employment, or taxable scholarship income</span></label>' +
      '<label class="field"><span>Working income (if different from household income)</span>' +
        '<input type="number" name="workingIncome" min="0" step="1" inputmode="decimal" value="' + esc(val("workingIncome")) + '">' +
      '</label>' +
      '<label class="choice"><input type="checkbox" name="selfEmployed"' + (val("selfEmployed") ? " checked" : "") + '><span>My working income is self-employed (not on a T4)</span></label>' +
      '<div class="grid-2">' +
        '<label class="field"><span>Profession (optional)</span>' +
          '<select name="profession" id="professionSelect">' + professionOptions(val("profession")) + '</select>' +
        '</label>' +
        '<label class="field"><span>Employee or self-employed (optional)</span>' +
          '<select name="workType" id="workTypeSelect">' + opts({
            "": "Prefer not to say",
            employee: "Employee (T4)",
            "self-employed": "Self-employed / contractor",
            both: "Both employment and self-employment"
          }, val("workType") || (val("selfEmployed") ? "self-employed" : "")) + '</select>' +
        '</label>' +
      '</div>' +
      incomeDetailsFields() +
      '<label class="field"><span>Tax already deducted on T4s (Box 22, optional)</span>' +
        '<input type="number" name="taxWithheld" min="0" step="1" inputmode="decimal" value="' + esc(val("taxWithheld")) + '">' +
        '<span class="hint">Used to estimate your 2025 tax refund or balance owing.</span>' +
      '</label>' +
      '<div class="grid-2">' +
        '<label class="field"><span>2025 RRSP contributions deducted (optional)</span>' +
          '<input type="number" name="rrspDeduction" min="0" step="1" inputmode="decimal" value="' + esc(val("rrspDeduction")) + '">' +
        '</label>' +
        '<label class="field"><span>RRSP contribution room (optional)</span>' +
          '<input type="number" name="rrspRoom" min="0" step="1" inputmode="decimal" value="' + esc(val("rrspRoom")) + '">' +
          '<span class="hint">From your CRA Notice of Assessment. The RRSP helper caps amounts at this room.</span>' +
        '</label>' +
      '</div>' +
      '<label class="field"><span>Spouse or partner’s 2025 net income (optional)</span>' +
        '<input type="number" name="spouseIncome" min="0" step="1" inputmode="decimal" value="' + esc(val("spouseIncome")) + '">' +
        '<span class="hint">Optional — helps estimate individual tax and spousal credit when married or common-law.</span>' +
      '</label>' +
      '<div class="grid-2">' +
        '<label class="field"><span>Housing</span>' +
          '<select name="housing">' + opts({ rent: "I rent my home", own: "I own my principal residence", other: "Other or neither" }, val("housing") || "rent") + '</select>' +
        '</label>' +
        '<label class="field"><span>Monthly rent (optional)</span>' +
          '<input type="number" name="monthlyRent" min="0" step="1" inputmode="decimal" value="' + esc(val("monthlyRent")) + '">' +
        '</label>' +
      '</div>' +
      '<p>Children in your care</p>' +
      (kids ? '<p class="fine swipe-hint">Swipe left on a child row to reveal Delete.</p>' : '') +
      '<div id="kids">' + (kids || '<p class="muted">No children added.</p>') + '</div>' +
      '<div class="actions"><button class="btn ghost" type="button" id="btnAddChild">Add a child</button></div>' +
      '<label class="choice"><input type="checkbox" name="pregnant"' + (val("pregnant") ? " checked" : "") + '><span>I am pregnant</span></label>' +
      '<label class="choice"><input type="checkbox" name="hasResp"' + (val("hasResp") ? " checked" : "") + '><span>I already have an RESP for a child</span></label>' +
      '<label class="choice"><input type="checkbox" name="receivesOas"' + (val("receivesOas") ? " checked" : "") + '><span>I already receive Old Age Security</span></label>' +
      '<label class="choice"><input type="checkbox" name="spouseReceivesGis"' + (val("spouseReceivesGis") ? " checked" : "") + '><span>My spouse or common-law partner receives the Guaranteed Income Supplement</span></label>' +
      '<label class="choice"><input type="checkbox" name="receivesEia"' + (val("receivesEia") ? " checked" : "") + '><span>I receive Manitoba Employment and Income Assistance</span></label>'
    );
  }


  function genderFollowups(gender) {
    var html = "";
    if (gender === "prefer-not" || gender === "not-listed" || gender === "nonbinary" || gender === "other") {
      html += '<p class="notice" id="genderProgramNote">Some official programs are meant for women, and a smaller number are meant for men. They appear only if you choose Female or Male. Choosing not to say just leaves those programs out of your results.</p>';
    }
    if (gender === "man") {
      html += '<p class="fine" id="genderProgramNote">This catalog does not currently list a government cash benefit or grant that is only for men. Choosing Male will not add a men-only program, and it will not list women-targeted programs.</p>';
    }
    if (gender === "woman") {
      html += '<div id="genderFollowupFields">' +
        '<label class="choice"><input type="checkbox" name="businessOwner"' + (val("businessOwner") ? " checked" : "") + '><span>I own a business or I am starting one</span></label>' +
        '<label class="choice"><input type="checkbox" name="tradesApprentice"' + (val("tradesApprentice") ? " checked" : "") + '><span>I am a trades apprentice, or I am looking at a skilled trade</span></label>' +
      '</div>';
    }
    return html;
  }

  function identityFollowups() {
    var html = genderFollowups(val("gender") || "prefer-not");
    var eth = selectedEthnicity();
    if (eth.indexOf("black") >= 0 && val("gender") !== "woman") {
      html += '<label class="choice"><input type="checkbox" name="businessOwner"' + (val("businessOwner") ? " checked" : "") + '><span>I own a business or I am starting one</span></label>';
    }
    return html;
  }

  function stepSituation() {
    return (
      '<h1>Your situation</h1>' +
      '<label class="field"><span>Disability Tax Credit</span>' +
        '<select name="disability">' + opts({
          none: "No disability to consider for this form",
          "yes-no-dtc": "I have a disability and do not have an approved Disability Tax Credit yet",
          "has-dtc": "I already have an approved Disability Tax Credit"
        }, val("disability") || "none") + '</select>' +
      '</label>' +
      '<label class="choice"><input type="checkbox" name="dentalInsurance"' + (val("dentalInsurance") ? " checked" : "") + '><span>I have access to private dental insurance or coverage</span></label>' +
      '<label class="choice"><input type="checkbox" name="student"' + (val("student") ? " checked" : "") + '><span>I am a post-secondary student (or about to be)</span></label>' +
      '<label class="choice"><input type="checkbox" name="newcomer"' + (val("newcomer") ? " checked" : "") + '><span>I am a newcomer (in Canada less than five years)</span></label>' +
      ethnicityFields() +
      '<label class="field"><span>Gender (optional)</span>' +
        '<select name="gender" id="genderSelect">' + opts({
          "prefer-not": "Prefer not to say",
          "not-listed": "I will not provide this",
          man: "Male",
          woman: "Female",
          nonbinary: "Non-binary",
          other: "Another gender"
        }, val("gender") || "prefer-not") + '</select>' +
        '<span class="hint">Used only to list programs that target women or men. If you choose Prefer not to say or I will not provide this, those targeted programs are left out — you can still see a short note about them. Other programs are not affected.</span>' +
      '</label>' +
      identityFollowups()
    );
  }

  function ethnicityChoices() {
    return [
      ["prefer-not", "Prefer not to say"],
      ["white", "White / Caucasian"],
      ["black", "Black"],
      ["latin-american", "Hispanic / Latin American"],
      ["south-asian", "South Asian"],
      ["east-asian", "East Asian"],
      ["southeast-asian", "Southeast Asian (including Filipino)"],
      ["arab-west-asian", "Arab / West Asian"],
      ["first-nations", "First Nations"],
      ["metis", "Métis"],
      ["inuit", "Inuit"],
      ["other", "Other"]
    ];
  }

  function selectedEthnicity() {
    var list = state.profile.ethnicity;
    if (!Array.isArray(list) || !list.length) return ["prefer-not"];
    return list;
  }

  function ethnicityFields() {
    var cur = selectedEthnicity();
    var boxes = ethnicityChoices().map(function (pair) {
      var checked = cur.indexOf(pair[0]) >= 0 ? " checked" : "";
      return '<label class="choice"><input type="checkbox" name="ethnicity" value="' + pair[0] + '"' + checked + '><span>' + esc(pair[1]) + '</span></label>';
    }).join("");
    return (
      '<fieldset class="field" id="ethnicityField">' +
        '<legend>Background or ethnicity (optional)</legend>' +
        '<p class="hint">Optional. Used only to find official programs you may qualify for. You can pick more than one, or Prefer not to say.</p>' +
        boxes +
      '</fieldset>'
    );
  }

  function stepReview() {
    var p = state.profile;
    var kids = (p.children || []).length;
    return (
      '<h1>Review and referral</h1>' +
      '<p>' + esc(p.displayName || "No name given") + ' · age ' + esc(p.age || "—") + ' · ' + esc(p.province || "—") + '</p>' +
      '<p class="muted">Household income ' + (p.householdIncome === "" ? "not entered" : fmtMoney(num(p.householdIncome))) +
        '. ' + kids + ' child' + (kids === 1 ? "" : "ren") + '. Housing: ' + esc(p.housing) +
        (p.profession ? '. Profession: ' + esc(professionLabel(p.profession)) : "") +
        (p.workType ? '. Work: ' + esc(workTypeLabel(p.workType)) : "") + '.</p>' +
      '<p class="muted">ID on this device: ' + (state.idMeta.length ? state.idMeta.length + " file(s)" : "none yet") + '.</p>' +
      '<label class="field"><span>If someone referred you, enter their referral code (optional)</span>' +
        '<input type="text" name="referralCodeEntered" id="referralCodeEntered" value="' + esc(state.referralCodeEntered || "") + '" maxlength="20" autocapitalize="characters">' +
      '</label>' +
      '<div class="notice stamp">' +
        '<p>The totals you will see are approximate and labelled with the official benefit year. This app does not submit anything to the CRA, Service Canada, or Manitoba.</p>' +
      '</div>'
    );
  }

  function provinceOptions(cur) {
    var list = [
      ["MB", "Manitoba"], ["AB", "Alberta"], ["BC", "British Columbia"], ["SK", "Saskatchewan"],
      ["ON", "Ontario"], ["QC", "Quebec"], ["NB", "New Brunswick"], ["NS", "Nova Scotia"],
      ["PE", "Prince Edward Island"], ["NL", "Newfoundland and Labrador"],
      ["YT", "Yukon"], ["NT", "Northwest Territories"], ["NU", "Nunavut"]
    ];
    return list.map(function (x) {
      return '<option value="' + x[0] + '"' + (x[0] === cur ? " selected" : "") + '>' + x[1] + '</option>';
    }).join("");
  }

  function opts(map, cur) {
    return Object.keys(map).map(function (k) {
      return '<option value="' + k + '"' + (k === cur ? " selected" : "") + '>' + esc(map[k]) + '</option>';
    }).join("");
  }

  function amountText(program, est) {
    var typ = BF.programType(program);
    if (typ === "loan" && est.amountCad != null) return "Up to " + fmtMoney(est.amountCad) + " (loan)";
    if (est.amountCad == null || est.kind === "varies") return "Amount varies";
    if (est.kind === "maximum") return "Up to " + fmtMoney(est.amountCad);
    return fmtMoney(est.amountCad);
  }

  // Separate page (not in results) for undoing a mistaken Yes. Already-received items never show in results.
  function viewAlreadyEdit() {
    var t = BF.totals(matches(), { skipIds: skipAlreadyIds() });
    var rows = (t.alreadyReceiving || []).map(function (m) {
      return '<div class="already-hidden-row" data-already-hidden="' + esc(m.program.id) + '">' +
        '<span>' + esc(m.program.name) + '</span>' +
        '<button class="btn ghost" type="button" data-undo-already="' + esc(m.program.id) + '">I do not receive this</button>' +
      '</div>';
    }).join("") || '<p class="fine">Nothing is marked as already received.</p>';
    return '<section class="panel" id="alreadyList">' +
      '<h1>Programs you already receive</h1>' +
      '<p>These are never suggested or counted. Undo one only if you chose Yes by mistake.</p>' + rows +
      '<div class="actions"><button class="btn" type="button" data-go="results">Back to results</button></div>' +
    '</section>';
  }

  function viewAlready() {
    var everything = matches().filter(function (m) { return m.estimate.match; });
    state.lastMatchCount = everything.length;
    var all = everything.filter(function (m) { return lockedYes.indexOf(m.program.id) < 0; });
    var hiddenCount = everything.length - all.length;
    if (!all.length) {
      state.alreadyConfirmed = true;
      return viewResults();
    }
    var rows = all.map(function (m) {
      var yes = !!(state.alreadyReceiving && state.alreadyReceiving[m.program.id]);
      var typ = BF.typeLabel(BF.programType(m.program));
      return '<div class="already-row" data-already-row="' + esc(m.program.id) + '">' +
        '<div>' +
          '<div class="name">Do you already receive ' + esc(m.program.name) + '?</div>' +
          '<div><span class="tag">' + esc(typ) + '</span>' +
          '<span class="tag">' + esc(m.program.jurisdiction === "manitoba" ? "Manitoba" : "Federal") + '</span></div>' +
        '</div>' +
        '<div class="yn" role="group" aria-label="Already receive ' + esc(m.program.name) + '">' +
          '<button type="button" data-already="' + esc(m.program.id) + '" data-val="yes" aria-pressed="' + (yes ? "true" : "false") + '">Yes</button>' +
          '<button type="button" data-already="' + esc(m.program.id) + '" data-val="no" aria-pressed="' + (yes ? "false" : "true") + '">No</button>' +
        '</div>' +
      '</div>';
    }).join("");
    return (
      '<section class="panel" id="alreadyPanel">' +
        '<h1>Do you already receive any of these?</h1>' +
        '<p>For each program that may apply, say whether you already receive it. Yes hides it from your results and from the dollar total, and it will not be suggested again. You can undo that later.</p>' +
        (hiddenCount ? '<p class="fine" id="alreadyLockedNote">' + hiddenCount + ' program' + (hiddenCount === 1 ? '' : 's') + ' you already said you receive ' + (hiddenCount === 1 ? 'is' : 'are') + ' not shown again.</p>' : '') +
        rows +
        '<div class="actions">' +
          '<button class="btn" type="button" id="btnToResults">See my results</button>' +
          '<button class="btn secondary" type="button" data-go="intake">Edit answers</button>' +
        '</div>' +
      '</section>'
    );
  }

  function fmtMoneyCents(n) {
    if (n == null || !isFinite(n)) return "—";
    return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);
  }

  function writeoffAmountValue(item) {
    var wo = state.profile.writeoffAmounts || {};
    var key = item.amountKey;
    if (hasVal(wo[key])) return wo[key];
    if (key === "rrspDeduction" && hasVal(state.profile.rrspDeduction)) return state.profile.rrspDeduction;
    return "";
  }

  function hasVal(v) {
    return v !== "" && v != null && isFinite(Number(v));
  }

  function writeoffAmountHint(item) {
    if (item.id === "tradesTools") return "Enter the cost of eligible new tools. The estimate applies the official $1,000 limit and $1,471 threshold.";
    if (item.id === "labourMobility") return "Enter eligible temporary relocation costs. The estimate caps this at $4,000 and 50% of construction employment income.";
    if (item.id === "educatorSupplies") return "Enter eligible supplies you paid (up to $1,000). The refundable credit is 25%.";
    if (item.id === "volunteerFirefighter") return "Enter 6000 if you completed at least 200 eligible hours. You cannot also claim the search and rescue amount.";
    if (item.id === "ctcLimit") return "Enter the Canada training credit limit from your notice of assessment. The credit is the lesser of that limit and 50% of eligible tuition.";
    if (item.id === "mbLabourSponsored") return "Enter the credit from your T2C (MAN.) slip, or the investment amount and the estimate will apply 15% up to $1,800.";
    if (item.id === "mbCaregiver") return "Enter 1400 if you qualify as the primary caregiver.";
    if (item.capNote) return item.capNote;
    return "Optional. Enter an amount only if you have receipts or slips.";
  }

  function renderWriteoffsSection() {
    if (typeof BF.writeoffsFor !== "function") return "";
    var items = BF.writeoffsFor(state.profile, state.alreadyReceiving || {});
    var hidden = (BF.WRITEOFFS || []).filter(function (w) { return !!(state.alreadyReceiving && state.alreadyReceiving[w.id]); });
    var rows = items.map(function (w) {
      var amt = writeoffAmountValue(w);
      return '<article class="writeoff-row" data-writeoff-id="' + esc(w.id) + '">' +
        '<div class="name">' + esc(w.title) + '</div>' +
        '<p class="fine">' + esc(w.explanation) + '</p>' +
        '<p class="fine writeoff-meta">' + esc(w.line) + (w.form ? " · " + esc(w.form) : "") + ' · ' + esc(w.kind === "refundable" ? "Refundable credit" : (w.kind === "credit" ? "Non-refundable credit" : "Deduction")) + '</p>' +
        '<p class="fine">Who may claim: ' + esc(w.eligibility) + '</p>' +
        '<p class="fine"><a href="' + esc(w.sourceUrl) + '" target="_blank" rel="noopener">Official source</a></p>' +
        (w.amountKey ? (
          '<label class="field"><span>Amount (optional)</span>' +
            '<input type="number" min="0" step="1" inputmode="decimal" data-writeoff-amount="' + esc(w.amountKey) + '" data-writeoff-id="' + esc(w.id) + '" value="' + esc(amt) + '">' +
            '<span class="hint">' + esc(writeoffAmountHint(w)) + '</span>' +
          '</label>'
        ) : "") +
        '<label class="choice"><input type="checkbox" data-writeoff-already="' + esc(w.id) + '"><span>I already claim this</span></label>' +
      '</article>';
    }).join("");
    var undo = "";
    if (hidden.length) {
      undo = '<p class="fine" id="writeoffAlreadyNote">' + hidden.length + ' write-off' + (hidden.length === 1 ? "" : "s") + ' you already claim ' + (hidden.length === 1 ? "is" : "are") + ' left out of this list and the tax estimate. ' +
        '<button class="btn ghost" type="button" id="btnUndoWriteoffs">Undo a write-off I marked by mistake</button></p>';
    }
    return (
      '<section class="panel" id="writeoffsPanel">' +
        '<h2>Possible 2025 write-offs</h2>' +
        '<p class="fine">A checklist tailored to your answers. These are estimates for education, not personalized advice. Enter an amount only if you have receipts or slips — the refund estimate updates. Items you mark as already claimed are left out of the list and the estimate.</p>' +
        undo +
        (rows || '<p class="muted">No tailored write-offs to show for these answers.</p>') +
      '</section>'
    );
  }

  function renderRrspHelperSection() {
    if (typeof BF.rrspHelper !== "function") return "";
    var helper = BF.rrspHelper(state.profile, { alreadyReceiving: state.alreadyReceiving || {} });
    var steps = (helper.steps || []).map(function (step) {
      var tags = "";
      if (step.isSweetSpot) tags += '<span class="tag">Sweet spot</span>';
      if (step.isRoom) tags += '<span class="tag">Full room</span>';
      if (step.isEntered) tags += '<span class="tag">You entered</span>';
      var position = step.netBalance >= 0
        ? "Estimated refund: " + fmtMoneyCents(step.amountAbs)
        : "Estimated balance owing: " + fmtMoneyCents(step.amountAbs);
      var extra;
      if (step.contribution === 0) extra = "This is the comparison point with no RRSP deduction.";
      else if (step.extraRefund >= 0) extra = "Extra vs $0: " + fmtMoneyCents(step.extraRefund) + " more back";
      else extra = "Extra vs $0: " + fmtMoneyCents(Math.abs(step.extraRefund)) + " less back";
      var rate = step.contribution === 0 ? "" : '<p class="fine">Savings on the extra dollars: ' + esc(String(step.marginalRatePercent)) + '%</p>';
      return '<article class="rrsp-step' + (step.isSweetSpot ? " rrsp-step-sweet" : "") + '" data-rrsp-contrib="' + esc(String(step.contribution)) + '">' +
        '<div class="name">' + esc(fmtMoneyCents(step.contribution)) + ' contribution' + (tags ? " " + tags : "") + '</div>' +
        '<p class="fine">' + esc(position) + '</p>' +
        '<p class="fine">' + esc(extra) + '</p>' +
        rate +
      '</article>';
    }).join("");
    var notes = (helper.notes || []).map(function (n) {
      return '<p class="fine">' + esc(n) + '</p>';
    }).join("");
    var capLine = helper.hasRoom
      ? "Amounts are capped at the RRSP room you entered from your Notice of Assessment (" + fmtMoneyCents(helper.room) + ")."
      : "No room was entered, so amounts are capped at the 2025 RRSP dollar limit (" + fmtMoneyCents(helper.cap) + ").";
    return (
      '<section class="panel" id="rrspHelperPanel">' +
        '<h2>RRSP helper</h2>' +
        '<p class="fine">Using the same 2025 tax estimate as above, here is how different RRSP amounts change your refund or balance owing. ' + esc(capLine) + ' These are estimates for education, not personalized advice. See the disclaimer above.</p>' +
        steps +
        '<div id="rrspHelperNotes">' + notes + '</div>' +
      '</section>'
    );
  }

  function renderTaxSection() {


    if (typeof BF.estimateTaxRefund !== "function") return "";
    var tax = BF.estimateTaxRefund(state.profile, { alreadyReceiving: state.alreadyReceiving || {} });
    var heroClass = "tax-payable";
    var scope = tax.federalOnly ? " federal" : "";
    var heroLabel = "Estimated 2025" + scope + " tax payable";
    var heroAmount = fmtMoneyCents(tax.totalTaxPayable);
    var heroCaption = "Estimated 2025" + (tax.federalOnly ? " federal" : "") + " income tax before T4 deductions. Enter tax already deducted (T4 Box 22) in Step 3 to see your refund or balance owing.";

    if (tax.hasTaxWithheld || tax.totalRefundableCredits > 0 || tax.totalTaxPayable === 0) {
      if (tax.status === "refund") {
        heroClass = "tax-refund";
        heroLabel = "Estimated 2025" + scope + " tax refund";
        heroAmount = fmtMoneyCents(tax.amountAbs);
        heroCaption = tax.hasTaxWithheld
          ? "Based on 2025 CRA" + (tax.isManitoba ? " & Manitoba" : " federal") + " rates, your T4 tax deducted, and eligible refundable tax credits."
          : "Based on eligible 2025 refundable tax credits (no T4 Box 22 tax deducted was entered).";
      } else {
        heroClass = "tax-owing";
        heroLabel = "Estimated 2025" + scope + " balance owing";
        heroAmount = fmtMoneyCents(tax.amountAbs);
        heroCaption = "Estimated" + (tax.federalOnly ? " federal" : "") + " tax payable minus T4 tax already deducted and eligible refundable credits.";
      }
    }

    var creditRows = (tax.refundableCredits || []).map(function (c) {
      return '<tr><td>' + esc(c.label) + '</td><td>+' + esc(fmtMoneyCents(c.amount)) + '</td></tr>';
    }).join("");

    var netLabel = (tax.hasTaxWithheld || tax.totalRefundableCredits > 0 || tax.totalTaxPayable === 0)
      ? (tax.status === "refund" ? "Estimated refund" : "Estimated balance owing")
      : "Estimated tax payable (before Box 22)";
    var netVal = (tax.hasTaxWithheld || tax.totalRefundableCredits > 0 || tax.totalTaxPayable === 0)
      ? fmtMoneyCents(tax.amountAbs)
      : fmtMoneyCents(tax.totalTaxPayable);

    var notesHtml = (tax.assumptions || []).map(function (a) {
      return '<p class="fine">' + esc(a) + '</p>';
    }).join("");

    return (
      '<section class="panel" id="taxEstimatePanel">' +
        '<p class="fine">2025 Tax Year Estimate · ' + (tax.isManitoba ? 'Federal + Manitoba' : (tax.federalOnly ? 'Federal only' : 'Federal + ' + esc(tax.provinceName || ""))) + '</p>' +
        (tax.federalOnly ? '<p class="notice" id="federalOnlyNotice">Provincial tax not yet included for ' + esc(tax.provinceName || "this province") + '; federal estimate shown.</p>' : '') +
        '<div class="tax-hero ' + heroClass + '">' +
          '<div class="tax-label">' + esc(heroLabel) + '</div>' +
          '<div class="amount" id="taxRefundAmount">' + esc(heroAmount) + '</div>' +
          '<p class="caption">' + esc(heroCaption) + '</p>' +
        '</div>' +
        '<div class="tax-rates">' +
          '<span class="tag">Marginal rate: ' + esc(String(tax.marginalRatePercent)) + '%</span>' +
          '<span class="tag">Effective tax rate: ' + esc(String(tax.effectiveRatePercent)) + '%</span>' +
        '</div>' +
        '<div class="table-wrap"><table class="tax-table"><tbody>' +
          '<tr><td>Individual gross income</td><td>' + esc(fmtMoneyCents(tax.grossIncome)) + '</td></tr>' +
          (tax.rrspDeduction > 0 ? '<tr><td>RRSP deduction</td><td>−' + esc(fmtMoneyCents(tax.rrspDeduction)) + '</td></tr>' : '') +
          (tax.deductions && tax.deductions.fhsa > 0 ? '<tr><td>FHSA deduction</td><td>−' + esc(fmtMoneyCents(tax.deductions.fhsa)) + '</td></tr>' : '') +
          (tax.cppDeduction > 0 ? '<tr><td>CPP enhanced / self-employed deduction</td><td>−' + esc(fmtMoneyCents(tax.cppDeduction)) + '</td></tr>' : '') +
          (tax.deductions && tax.deductions.tradesTools > 0 ? '<tr><td>Tradesperson’s tools deduction</td><td>−' + esc(fmtMoneyCents(tax.deductions.tradesTools)) + '</td></tr>' : '') +
          (tax.deductions && tax.deductions.labourMobility > 0 ? '<tr><td>Labour mobility deduction</td><td>−' + esc(fmtMoneyCents(tax.deductions.labourMobility)) + '</td></tr>' : '') +
          (tax.deductions && tax.deductions.other > 0 ? '<tr><td>Other deductions entered</td><td>−' + esc(fmtMoneyCents(tax.deductions.other)) + '</td></tr>' : '') +
          '<tr><td>Estimated taxable income</td><td>' + esc(fmtMoneyCents(tax.taxableIncome)) + '</td></tr>' +
          '<tr><td>Federal tax (2025 brackets minus 14.5% credits)</td><td>' + esc(fmtMoneyCents(tax.federalTax)) + '</td></tr>' +
          (tax.isManitoba ? '<tr><td>Manitoba tax (2025 brackets minus 10.8% credits)</td><td>' + esc(fmtMoneyCents(tax.manitobaTax)) + '</td></tr>' : '') +
          (tax.fedDivCredit > 0 ? '<tr><td>Federal dividend tax credit</td><td>−' + esc(fmtMoneyCents(tax.fedDivCredit)) + '</td></tr>' : '') +
          (tax.mbDivCredit > 0 ? '<tr><td>Manitoba dividend tax credit</td><td>−' + esc(fmtMoneyCents(tax.mbDivCredit)) + '</td></tr>' : '') +
          (tax.selfEmployedCppPayable > 0 ? '<tr><td>Self-employed CPP contributions on return</td><td>' + esc(fmtMoneyCents(tax.selfEmployedCppPayable)) + '</td></tr>' : '') +
          (creditRows ? creditRows : '') +
          (tax.hasTaxWithheld ? '<tr><td>Income tax already deducted (T4 Box 22)</td><td>−' + esc(fmtMoneyCents(tax.taxWithheld)) + '</td></tr>' : '') +
          '<tr class="tax-net-row"><td>' + esc(netLabel) + '</td><td>' + esc(netVal) + '</td></tr>' +
        '</tbody></table></div>' +
        notesHtml +
        '<div class="notice stamp" id="taxDisclaimer" style="margin-top:0.75rem">' +
          '<p><strong>Estimate only — not tax advice.</strong> Actual tax refunds or balances owing depend on all your T-slips, deductions, and CRA assessment. File through CRA NETFILE-certified software, a certified tax preparer, or the accountant queue below.</p>' +
        '</div>' +
      '</section>'
    );
  }

  function renderSeeAccountantCard() {
    return (
      '<section class="panel" id="seeAccountantPanel">' +
        '<h2>See an accountant</h2>' +
        '<p>This estimate is a starting point. See a certified accountant or tax preparer if you are filing a return, dealing with CRA letters, reporting self-employment or capital gains, applying for the Disability Tax Credit, or if this estimate looks off.</p>' +
      '</section>'
    );
  }

  function renderShareAccountantPanel() {
    var share = !!state.shareWithAccountant;
    var shareEth = share && !!state.shareEthnicityWithAccountant;
    return (
      '<section class="panel" id="shareAccountantPanel">' +
        '<h2>Share with a partner accountant</h2>' +
        '<p class="fine">This choice is separate from approving packets. The app works the same if you decline. Your choice is only saved on this device — this app does not send your answers anywhere.</p>' +
        '<label class="choice"><input type="checkbox" id="shareAccountantConsent"' + (share ? " checked" : "") + '><span>Yes, share my answers with a partner accountant so they can contact me</span></label>' +
        '<p class="fine">If you opt in, the answers that would be shared are your income, profession, and results, with a partner accountant. Background or ethnicity is shared only if you also tick the box below.</p>' +
        '<label class="choice"><input type="checkbox" id="shareEthnicityConsent"' + (shareEth ? " checked" : "") + (share ? "" : " disabled") + '><span>Also share my background or ethnicity</span></label>' +
        '<p class="fine" id="privacyNote"><strong>Privacy.</strong> Answers stay on this device. No SIN is ever requested.</p>' +
      '</section>'
    );
  }

  function viewResults() {

    var all = matches();
    var t = BF.totals(all, { skipIds: skipAlreadyIds() });
    state.lastMatchCount = t.matched.length + (t.alreadyReceiving ? t.alreadyReceiving.length : 0);
    var feeItems = t.matched.map(function (m) {
      return {
        amountCad: BF.feeBaseAmount(m.estimate.amountCad, m.program),
        dtcContingent: !!m.program.dtcContingent,
        feeCapped: !!m.program.feeCapped
      };
    });
    var fees = BF.computeFees(feeItems, state.settings);
    var visibleIds = t.matched.map(function (m) { return m.program.id; });
    if (!state.selectedIds || !state.selectedIds.length) {
      state.selectedIds = visibleIds.slice();
    } else {
      state.selectedIds = state.selectedIds.filter(function (id) { return visibleIds.indexOf(id) >= 0; });
    }
    var rows = t.matched.map(function (m) {
      var est = m.estimate;
      var typ = BF.programType(m.program);
      var kind = typ === "loan" ? "Loan — not included in the total" : (est.kind === "maximum" ? "Approximate maximum" : (est.kind === "varies" ? "Amount varies" : "Approximate estimate"));
      var checked = state.selectedIds.indexOf(m.program.id) >= 0 ? " checked" : "";
      return '<article class="prog-row" data-program-id="' + esc(m.program.id) + '">' +
        '<input type="checkbox" data-select="' + esc(m.program.id) + '"' + checked + ' aria-label="Include ' + esc(m.program.name) + '">' +
        '<div><div class="name">' + esc(m.program.name) + '</div>' +
          '<div><span class="tag ' + esc(m.program.route) + '">' + esc(routeLabel(m.program.route)) + '</span>' +
          '<span class="tag">' + esc(BF.typeLabel(typ)) + '</span>' +
          '<span class="tag">' + esc(m.program.jurisdiction === "manitoba" ? "Manitoba" : "Federal") + '</span></div>' +
          '<p class="fine">' + esc(kind) + ' · ' + esc(m.program.benefitYear) + '</p>' +
          (est.note ? '<p class="fine">' + esc(est.note) + '</p>' : "") +
          '<p class="fine"><a href="' + esc(m.program.officialUrl) + '" target="_blank" rel="noopener">Official program page</a></p>' +
        '</div>' +
        '<div class="amt">' + esc(amountText(m.program, est)) + '</div>' +
      '</article>';
    }).join("");
    if (!t.matched.length && !(t.alreadyReceiving && t.alreadyReceiving.length)) {
      rows = '<p>No programs in this catalog matched the answers you entered. You can go back and change the form.</p>';
    } else if (!t.matched.length) {
      rows = '<p id="noVisibleMatches">No other programs are listed. The ones you already receive are under the list below.</p>';
    }
    var alreadyBlock = "";
    if (t.alreadyReceiving && t.alreadyReceiving.length) {
      var n = t.alreadyReceiving.length;
      alreadyBlock = '<p class="fine" id="alreadyHiddenNote">' + n + ' program' + (n === 1 ? '' : 's') + ' you already receive ' + (n === 1 ? 'is' : 'are') + ' left out and will not be suggested again. ' +
        '<button class="btn ghost" type="button" data-go="alreadyEdit">Undo a Yes I chose by mistake</button></p>';
    }
    return (
      '<p class="legal-line" id="resultsLegalLine">' + esc(BF.LEGAL_LINE) + '</p>' +
      renderTaxSection() +
      renderRrspHelperSection() +
      renderWriteoffsSection() +
      renderSeeAccountantCard() +
      '<section class="panel" id="resultsPanel">' +
        '<p class="fine">Prototype — demo build. Estimates are approximate.</p>' +
        '<div class="total-block">' +
          '<h1 id="resultsHeadline">Estimated refund/benefits based on your answers: <span class="amount" id="estimateTotal">' + fmtMoney(t.cash) + '</span></h1>' +
          '<p class="caption" id="estimateCaption">Approximate estimated total of programs with a calculated or official-maximum amount, for the benefit years shown on each program.' +
            (t.hasVaries ? ' Some matches have no dollar figure and are listed as “amount varies.” They are not included in this total.' : "") +
            (t.hasLoans ? ' Loans are listed separately and are not included in this total.' : "") +
            (t.alreadyReceiving && t.alreadyReceiving.length ? ' Programs you already receive are also left out of this total.' : "") +
          '</p>' +
        '</div>' +
        '<div class="notice">' +
          '<p id="feeSummary">If these calculated amounts were approved, the owner fee would be ' +
            esc(String(fees.feePercent)) + '% of ' + fmtMoney(fees.baseFound) +
            ' (programs not covered by the Disability Tax Credit promoter cap), which is <strong>' + fmtMoney(fees.percentFee) + '</strong>. ' +
            'Disability Tax Credit requests, and tax items that depend on the DTC, are left out of that percentage. Any fee for helping with a DTC request is capped at ' +
            fmtMoney(fees.dtcCapCad) + ' under the Disability Tax Credit Promoters Restrictions Regulations. Those regulations are currently suspended by a court injunction, but this app still applies the cap. I did not find a similar statutory fee cap for the other programs in this catalog.</p>' +
        '</div>' +
        alreadyBlock +
        (t.matched.length ? '<h2>Programs that may apply</h2><p class="muted">Uncheck any program you do not want in a packet, then approve. Approval builds a packet on this device — it does not file with government.</p>' + rows : rows) +
        '<div class="actions">' +
          '<button class="btn" type="button" id="btnApprove"' + (t.matched.length ? "" : " disabled") + '>Approve selected packets</button>' +
          '<button class="btn secondary" type="button" data-go="already">Change what I already receive</button>' +
          '<button class="btn secondary" type="button" data-go="intake">Edit answers</button>' +
        '</div>' +
        onboardingCta() +
      '</section>' +
      renderShareAccountantPanel()
    );
  }

  function trackMarkup(st) {
    var order = ["submitted", "in-review", "approved"];
    if (st === "denied") {
      return '<div class="track" aria-label="Status"><i class="done">Submitted</i><i>In review</i><i class="fail">Denied</i></div>';
    }
    return '<div class="track" aria-label="Status">' + order.map(function (x) {
      var cls = x === st ? "now" : (order.indexOf(x) < order.indexOf(st) ? "done" : "");
      return '<i class="' + cls + '">' + statusLabel(x) + '</i>';
    }).join("") + '</div>';
  }

  function viewTracker() {
    if (!state.applications.length) {
      return '<section class="panel"><h1>Progress tracker</h1><p>No packets yet. Approve matches first.</p></section>';
    }
    var cards = state.applications.map(function (a) {
      var dates = (a.history || []).map(function (h) {
        return esc(statusLabel(h.status)) + " · " + esc(formatDate(h.date));
      }).join(" · ");
      return '<article class="panel" data-app="' + esc(a.id) + '">' +
        '<h2>' + esc(a.name) + '</h2>' +
        '<p><span class="tag status-' + esc(a.status) + '" data-status="' + esc(a.status) + '">' + esc(statusLabel(a.status)) + '</span>' +
        '<span class="tag ' + esc(a.route) + '">' + esc(routeLabel(a.route)) + '</span></p>' +
        trackMarkup(a.status) +
        '<p class="fine">' + dates + '</p>' +
        (a.amountLabel ? '<p class="fine">Listed amount: ' + esc(a.amountLabel) + '</p>' : "") +
        '<div class="actions"><button class="btn secondary" type="button" data-open-packet="' + esc(a.id) + '">Open packet</button></div>' +
      '</article>';
    }).join("");
    return '<h1>Progress tracker</h1>' + cards + onboardingCta();
  }

  function hasClosedLead() {
    if (state.leadClosed) return true;
    return (state.applications || []).some(function (a) {
      return a.status === "approved" || a.status === "signed" || a.signed === true;
    });
  }

  function onboardingCta() {
    if (hasClosedLead() || state.onboardingStarted) {
      var label = state.idMeta && state.idMeta.length ? "Continue onboarding (ID)" : "Start onboarding";
      return '<div class="actions"><button class="btn" type="button" id="btnStartOnboarding" data-go="onboarding">' + label + '</button></div>';
    }
    return '<div class="actions"><button class="btn secondary" type="button" id="btnCloseLead">Close lead and start onboarding</button></div>';
  }

  function viewOnboarding() {
    if (!hasClosedLead() && !state.onboardingStarted) {
      return '<section class="panel" id="onboardingGate">' +
        '<h1>Onboarding</h1>' +
        '<p>Government ID is collected during onboarding, after a lead is closed or marked signed.</p>' +
        '<div class="actions"><button class="btn secondary" type="button" data-go="results">Back to results</button></div>' +
      '</section>';
    }
    state.onboardingStarted = true;
    return '<section class="panel" id="onboardingPanel">' +
      '<p class="fine">Onboarding — after the lead is closed or signed.</p>' +
      stepId() +
      '<div class="actions">' +
        '<button class="btn" type="button" data-go="tracker">Done</button>' +
        '<button class="btn secondary" type="button" data-go="results">Back to results</button>' +
      '</div>' +
    '</section>';
  }

  function viewPacket() {
    var a = state.applications.find(function (x) { return x.id === openPacketId; });
    if (!a) return '<section class="panel"><p>Packet not found.</p><button class="btn" data-go="tracker">Back to tracker</button></section>';
    var prog = BF.programById(a.programId) || {};
    var checks = (a.checklist || []).map(function (c) { return '<li>' + esc(c) + '</li>'; }).join("");
    var fields = (a.summary || []).map(function (row) {
      return '<p><strong>' + esc(row.label) + ':</strong> ' + esc(row.value) + '</p>';
    }).join("");
    return (
      '<section class="panel">' +
        '<p class="fine">Application packet — not submitted to government.</p>' +
        '<h1>' + esc(a.name) + '</h1>' +
        '<p><span class="tag status-' + esc(a.status) + '">' + esc(statusLabel(a.status)) + '</span>' +
        '<span class="tag ' + esc(a.route) + '">' + esc(routeLabel(a.route)) + '</span></p>' +
        '<p>' + esc(prog.summary || "") + '</p>' +
        '<p>Benefit year: ' + esc(prog.benefitYear || "") + '</p>' +
        '<p>Listed amount: ' + esc(a.amountLabel) + '</p>' +
        '<h2>Prefilled summary</h2>' + fields +
        '<h2>Documents checklist</h2><ul>' + checks +
          (state.idMeta.length ? '<li>Government ID already stored on this device (' + state.idMeta.length + ' file(s) — not attached or transmitted)</li>' : '<li>Government ID still needed</li>') +
        '</ul>' +
        '<p><a href="' + esc(prog.officialUrl) + '" target="_blank" rel="noopener">Official application or program page</a></p>' +
        '<div class="actions"><button class="btn secondary" type="button" data-go="tracker">Back to tracker</button></div>' +
      '</section>'
    );
  }

  function viewReferral() {
    var mine = state.referralLedger.filter(function (r) { return r.code === state.referralCode; });
    var earned = mine.reduce(function (s, r) { return s + (r.credit || 0); }, 0);
    var rows = mine.length ? mine.map(function (r) {
      return '<tr><td>' + esc(formatDate(r.date)) + '</td><td>' + esc(r.fromName || "Referred client") + '</td><td>' + fmtMoney(r.found) + '</td><td>' + fmtMoney(r.credit) + '</td></tr>';
    }).join("") : '<tr><td colspan="4">No referral credits yet.</td></tr>';
    return (
      '<section class="panel">' +
        '<h1>Referral dashboard</h1>' +
        '<p>Your referral code is <strong id="myReferralCode">' + esc(state.referralCode) + '</strong>. When a person you refer has a find approved, you earn a bonus finder’s fee on their approved amount (default 1%, set by the owner). Disability Tax Credit items are left out of that percentage, the same way as the owner fee.</p>' +
        '<p>Credits earned: <strong id="referralEarned">' + fmtMoney(earned) + '</strong></p>' +
        '<div class="table-wrap"><table><thead><tr><th>Date</th><th>From</th><th>Approved finds</th><th>Credit</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        (state.referralCodeEntered ? '<p class="fine">You entered referrer code ' + esc(state.referralCodeEntered) + '. If your finds are approved, that code receives the credit.</p>' : "") +
        '<div class="actions"><button class="btn secondary" type="button" data-go="more">Back</button></div>' +
      '</section>'
    );
  }

  function approvedFeeItems() {
    return state.applications.filter(function (a) { return a.status === "approved"; }).map(function (a) {
      return { amountCad: a.feeBase, dtcContingent: a.dtcContingent, feeCapped: a.feeCapped };
    });
  }

  function viewOwner() {
    var fees = BF.computeFees(approvedFeeItems(), state.settings);
    var refOwed = state.referralLedger.reduce(function (s, r) { return s + (r.credit || 0); }, 0);
    var acc = state.applications.filter(function (a) { return a.route === "accountant"; });
    var direct = state.applications.filter(function (a) { return a.route === "direct"; });
    function appRows(list) {
      if (!list.length) return '<tr><td colspan="5">None</td></tr>';
      return list.map(function (a) {
        return '<tr>' +
          '<td>' + esc(a.name) + '</td>' +
          '<td><span class="tag status-' + esc(a.status) + '">' + esc(statusLabel(a.status)) + '</span></td>' +
          '<td>' + esc(a.amountLabel) + '</td>' +
          '<td>' + esc(formatDate((a.history[a.history.length - 1] || {}).date)) + '</td>' +
          '<td>' +
            '<button class="btn ghost" type="button" data-advance="' + esc(a.id) + '">Advance status</button>' +
          '</td></tr>';
      }).join("");
    }
    var clientName = state.profile.displayName || "Current client on this device";
    return (
      '<section class="panel">' +
        '<h1>Owner desk</h1>' +
        '<p class="muted">Prototype only. Settings and queues stay on this device. Do not put anyone’s email or phone number here if this device is shared.</p>' +
        '<div class="grid-2">' +
          '<label class="field"><span>Owner fee on approved finds (2% to 4%)</span>' +
            '<input type="number" id="feePercent" min="2" max="4" step="0.1" value="' + esc(state.settings.feePercent) + '">' +
          '</label>' +
          '<label class="field"><span>Referral bonus (percent of approved finds)</span>' +
            '<input type="number" id="referralPercent" min="0" max="10" step="0.1" value="' + esc(state.settings.referralPercent) + '">' +
          '</label>' +
        '</div>' +
        '<label class="field"><span>Accountant specialist name (optional)</span>' +
          '<input type="text" id="accountantName" maxlength="80" value="' + esc(state.settings.accountantName || "") + '" placeholder="Name only">' +
        '</label>' +
        '<div class="actions"><button class="btn" type="button" id="btnSaveSettings">Save settings</button></div>' +
      '</section>' +
      '<section class="panel">' +
        '<h2>Fees and credits owed</h2>' +
        '<p id="ownerFees">Approved finds in the percentage base: ' + fmtMoney(fees.baseFound) +
          '. Owner fee at ' + esc(String(fees.feePercent)) + '%: <strong>' + fmtMoney(fees.percentFee) + '</strong>.</p>' +
        '<p id="ownerReferral">Referral credits owed: <strong>' + fmtMoney(refOwed) + '</strong>' +
          (state.referralLedger.length ? ' (' + state.referralLedger.map(function (r) {
            return esc(r.code) + ' ' + fmtMoney(r.credit);
          }).join(', ') + ')' : '') + '.</p>' +
        '<p class="fine">DTC-related items are excluded from the percentage fee. Any DTC assistance fee is capped at $100.</p>' +
      '</section>' +
      '<section class="panel">' +
        '<h2>Clients</h2>' +
        '<p>' + esc(clientName) + ' · ' + state.applications.length + ' packet(s) · income ' +
          (state.profile.householdIncome === "" ? "—" : fmtMoney(num(state.profile.householdIncome))) + '</p>' +
      '</section>' +
      '<section class="panel">' +
        '<h2 id="accountantQueue">Accountant queue</h2>' +
        '<p class="fine">Tax-related programs (filed through a tax return or the CRA), including GST/HST successor benefits, CCB, CWB, the DTC, and Manitoba tax credits.</p>' +
        '<div class="table-wrap"><table><thead><tr><th>Program</th><th>Status</th><th>Amount</th><th>Updated</th><th></th></tr></thead><tbody>' +
          appRows(acc) + '</tbody></table></div>' +
      '</section>' +
      '<section class="panel">' +
        '<h2>Submit directly</h2>' +
        '<div class="table-wrap"><table><thead><tr><th>Program</th><th>Status</th><th>Amount</th><th>Updated</th><th></th></tr></thead><tbody>' +
          appRows(direct) + '</tbody></table></div>' +
      '</section>'
    );
  }

  function readForm(form) {
    var p = state.profile;
    var eth = [];
    $$("input, select, textarea", form).forEach(function (el) {
      var n = el.name;
      if (!n) return;
      if (n === "ethnicity") {
        if (el.checked) eth.push(el.value);
        return;
      }
      if (el.type === "checkbox") {
        if (n.indexOf("childDtc") === 0) return;
        p[n] = el.checked;
      } else if (n.indexOf("childAge") === 0 || n.indexOf("childDtc") === 0) {
        return;
      } else if (n === "referralCodeEntered") {
        state.referralCodeEntered = el.value.trim().toUpperCase();
      } else {
        p[n] = el.value;
      }
    });
    if (form.querySelector("#ethnicityField")) {
      if (!eth.length || eth.indexOf("prefer-not") >= 0) p.ethnicity = ["prefer-not"];
      else p.ethnicity = eth;
      if (p.ethnicity.indexOf("first-nations") >= 0) p.indigenous = "first-nations";
      else if (p.ethnicity.indexOf("inuit") >= 0) p.indigenous = "inuit";
      else if (p.ethnicity.indexOf("metis") >= 0) p.indigenous = "metis";
      else if (p.ethnicity.indexOf("prefer-not") >= 0) p.indigenous = "prefer-not";
      else p.indigenous = "no";
    }
    var kids = [];
    $$("[data-child]", form).forEach(function (row) {
      var i = row.getAttribute("data-child");
      var ageEl = form.querySelector('[name="childAge' + i + '"]');
      var dtcEl = form.querySelector('[name="childDtc' + i + '"]');
      kids.push({ age: ageEl ? ageEl.value : "", hasDtc: !!(dtcEl && dtcEl.checked) });
    });
    if (form.querySelector("#kids")) p.children = kids;
    if (form.querySelector('[name="workType"]')) {
      if (p.workType === "self-employed" || p.workType === "both") p.selfEmployed = true;
      else if (p.workType === "employee") p.selfEmployed = false;
    }
  }

  function bindView() {
    $$("[data-go]").forEach(function (b) {
      b.addEventListener("click", function () { setView(b.getAttribute("data-go")); });
    });
    var start = $("#btnStart");
    if (start) start.addEventListener("click", function () { state.intakeStep = state.intakeStep || 1; setView("intake"); });
    var owner = $("#btnOwner");
    if (owner) owner.addEventListener("click", function () {
      if (window.confirm("Open the owner desk? In this prototype it is not locked, and it stays on this device.")) setView("owner");
    });
    var form = $("#intakeForm");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        readForm(form);
        if (state.viewed === "intake" && state.intakeStep === 4) {
          save();
          state.selectedIds = [];
          state.alreadyConfirmed = false;
          var skipNow = skipAlreadyIds();
          var any = matches().some(function (m) { return m.estimate.match && skipNow.indexOf(m.program.id) < 0; });
          if (!any) {
            state.alreadyConfirmed = true;
            setView("results");
          } else {
            setView("already");
          }
          return;
        }
        state.intakeStep = Math.min(4, (state.intakeStep || 1) + 1);
        save();
        render();
      });
    }
    var back = $("#btnBack");
    if (back) back.addEventListener("click", function () {
      if (form) readForm(form);
      state.intakeStep = Math.max(1, (state.intakeStep || 1) - 1);
      save();
      render();
    });
    var add = $("#btnAddChild");
    if (add) add.addEventListener("click", function () {
      if (form) readForm(form);
      state.profile.children = state.profile.children || [];
      state.profile.children.push({ age: "", hasDtc: false });
      save();
      render();
    });
    var idFile = $("#idFile");
    if (idFile) idFile.addEventListener("change", onIdFiles);
    loadThumbs();
    $$("[data-select]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var id = cb.getAttribute("data-select");
        if (cb.checked) {
          if (state.selectedIds.indexOf(id) < 0) state.selectedIds.push(id);
        } else {
          state.selectedIds = state.selectedIds.filter(function (x) { return x !== id; });
        }
        save();
      });
    });
    $$("[data-writeoff-amount]").forEach(function (el) {
      el.addEventListener("change", function () {
        var key = el.getAttribute("data-writeoff-amount");
        state.profile.writeoffAmounts = state.profile.writeoffAmounts || {};
        state.profile.writeoffAmounts[key] = el.value;
        if (key === "rrspDeduction") state.profile.rrspDeduction = el.value;
        save();
        var y = window.scrollY;
        render();
        window.scrollTo(0, y);
      });
    });
    $$("[data-writeoff-already]").forEach(function (el) {
      el.addEventListener("change", function () {
        if (!el.checked) return;
        var id = el.getAttribute("data-writeoff-already");
        state.alreadyReceiving = state.alreadyReceiving || {};
        state.alreadyReceiving[id] = true;
        save();
        var y = window.scrollY;
        render();
        window.scrollTo(0, y);
      });
    });
    var undoWo = $("#btnUndoWriteoffs");
    if (undoWo) undoWo.addEventListener("click", function () {
      var ids = (BF.WRITEOFFS || []).map(function (w) { return w.id; });
      ids.forEach(function (id) {
        if (state.alreadyReceiving && state.alreadyReceiving[id]) delete state.alreadyReceiving[id];
      });
      save();
      render();
    });
    var shareAcc = $("#shareAccountantConsent");
    if (shareAcc) shareAcc.addEventListener("change", function () {
      state.shareWithAccountant = !!shareAcc.checked;
      if (!state.shareWithAccountant) state.shareEthnicityWithAccountant = false;
      save();
      var y = window.scrollY;
      render();
      window.scrollTo(0, y);
    });
    var shareEth = $("#shareEthnicityConsent");
    if (shareEth) shareEth.addEventListener("change", function () {
      state.shareEthnicityWithAccountant = !!(shareAcc && shareAcc.checked && shareEth.checked);
      save();
    });
    var approve = $("#btnApprove");
    if (approve) approve.addEventListener("click", approveSelected);
    $$("[data-open-packet]").forEach(function (b) {
      b.addEventListener("click", function () {
        openPacketId = b.getAttribute("data-open-packet");
        setView("packet");
      });
    });
    var saveSet = $("#btnSaveSettings");
    if (saveSet) saveSet.addEventListener("click", function () {
      state.settings.feePercent = BF.clampFeePercent($("#feePercent").value);
      state.settings.referralPercent = Math.max(0, Number($("#referralPercent").value) || 0);
      state.settings.accountantName = ($("#accountantName").value || "").trim();
      save();
      render();
    });
    $$("[data-advance]").forEach(function (b) {
      b.addEventListener("click", function () { advanceStatus(b.getAttribute("data-advance")); });
    });
    var genderSel = $("#genderSelect");
    if (genderSel) genderSel.addEventListener("change", function () {
      if (form) readForm(form);
      save();
      render();
    });
    $$('#ethnicityField input[name="ethnicity"]').forEach(function (cb) {
      cb.addEventListener("change", function () {
        var boxes = $$('#ethnicityField input[name="ethnicity"]');
        if (cb.value === "prefer-not" && cb.checked) {
          boxes.forEach(function (b) { if (b !== cb) b.checked = false; });
        } else if (cb.checked) {
          boxes.forEach(function (b) { if (b.value === "prefer-not") b.checked = false; });
        }
        if (form) readForm(form);
        save();
        render();
      });
    });
    var closeLead = $("#btnCloseLead");
    if (closeLead) closeLead.addEventListener("click", function () {
      state.leadClosed = true;
      state.onboardingStarted = true;
      save();
      setView("onboarding");
    });
    $$("[data-already]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-already");
        var yes = b.getAttribute("data-val") === "yes";
        state.alreadyReceiving = state.alreadyReceiving || {};
        state.alreadyReceiving[id] = yes;
        save();
        render();
      });
    });
    var toResults = $("#btnToResults");
    if (toResults) toResults.addEventListener("click", function () {
      state.alreadyConfirmed = true;
      setView("results");
    });
    $$("[data-undo-already]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-undo-already");
        state.alreadyReceiving = state.alreadyReceiving || {};
        state.alreadyReceiving[id] = false;
        if (state.selectedIds.indexOf(id) < 0) state.selectedIds.push(id);
        save();
        render();
      });
    });
    $$("[data-swipe-row]").forEach(function (row) {
      var startX = 0;
      var tracking = false;
      row.addEventListener("touchstart", function (ev) {
        if (!ev.touches || !ev.touches.length) return;
        startX = ev.touches[0].clientX;
        tracking = true;
      }, { passive: true });
      row.addEventListener("touchmove", function (ev) {
        if (!tracking || !ev.touches || !ev.touches.length) return;
        var dx = ev.touches[0].clientX - startX;
        if (dx < -40) {
          row.classList.add("swiped");
          tracking = false;
        } else if (dx > 30) {
          row.classList.remove("swiped");
          tracking = false;
        }
      }, { passive: true });
      row.addEventListener("touchend", function () { tracking = false; }, { passive: true });
    });
    $$("[data-delete-child]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = Number(btn.getAttribute("data-delete-child"));
        if (form) readForm(form);
        state.profile.children = (state.profile.children || []).filter(function (_, i) { return i !== idx; });
        save();
        render();
      });
    });
  }

  function onIdFiles(ev) {
    var files = ev.target.files || [];
    var jobs = [];
    for (var i = 0; i < files.length; i++) {
      jobs.push(storeIdFile(files[i]));
    }
    Promise.all(jobs).then(function () {
      save();
      render();
    });
  }

  function storeIdFile(file) {
    var id = "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    return BF.idb.put(id, file).then(function () {
      state.idMeta.push({ id: id, name: file.name || "ID document", type: file.type || "", size: file.size || 0, addedAt: new Date().toISOString() });
    });
  }

  function loadThumbs() {
    $$("img[data-thumb]").forEach(function (img) {
      var id = img.getAttribute("data-thumb");
      BF.idb.get(id).then(function (blob) {
        if (!blob) return;
        if (blob.type && blob.type.indexOf("image/") !== 0) return;
        img.src = URL.createObjectURL(blob);
      });
    });
  }

  function amountLabel(est) {
    if (!est || est.kind === "varies" || est.amountCad == null) return "Amount varies";
    var prefix = est.kind === "maximum" ? "Up to " : "About ";
    return prefix + fmtMoney(est.amountCad);
  }

  function approveSelected() {
    var all = matches();
    var skip = skipAlreadyIds();
    var chosen = all.filter(function (m) {
      return m.estimate.match && state.selectedIds.indexOf(m.program.id) >= 0 && skip.indexOf(m.program.id) < 0;
    });
    if (!chosen.length) {
      window.alert("Select at least one program to approve.");
      return;
    }
    var p = state.profile;
    var existing = {};
    state.applications.forEach(function (a) { existing[a.programId] = true; });
    chosen.forEach(function (m) {
      if (existing[m.program.id]) return;
      var est = m.estimate;
      var feeBase = BF.feeBaseAmount(est.amountCad, m.program);
      var app = {
        id: "app-" + Date.now() + "-" + m.program.id,
        programId: m.program.id,
        name: m.program.name,
        route: m.program.route,
        status: "submitted",
        history: [{ status: "submitted", date: todayISO() }],
        amountCad: est.amountCad,
        amountLabel: amountLabel(est) + " · " + m.program.benefitYear,
        feeBase: feeBase,
        dtcContingent: !!m.program.dtcContingent,
        feeCapped: !!m.program.feeCapped,
        checklist: (m.program.checklist || []).slice(),
        officialUrl: m.program.officialUrl,
        summary: [
          { label: "Name on this form", value: p.displayName || "Not provided" },
          { label: "Age", value: String(p.age || "—") },
          { label: "Province", value: p.province || "—" },
          { label: "Marital status", value: p.marital || "—" },
          { label: "Household income entered", value: p.householdIncome === "" ? "Not provided" : fmtMoney(num(p.householdIncome)) },
          { label: "Housing", value: p.housing || "—" },
          { label: "Children in care", value: String((p.children || []).length) },
          { label: "Tax already deducted (T4 Box 22)", value: p.taxWithheld === "" ? "Not provided" : fmtMoney(num(p.taxWithheld)) }
        ]
      };
      state.applications.push(app);
    });
    save();
    setView("tracker");
  }

  function advanceStatus(id) {
    var a = state.applications.find(function (x) { return x.id === id; });
    if (!a) return;
    var next = { submitted: "in-review", "in-review": "approved", approved: "approved", denied: "denied" }[a.status];
    if (a.status === "approved" || a.status === "denied") {
      var deny = window.confirm("This packet is already " + statusLabel(a.status) + ". Press OK to mark it Denied, or Cancel to leave it.");
      if (!deny) return;
      next = "denied";
      if (a.status === "approved") retractReferral(a);
    }
    var prev = a.status;
    a.status = next;
    a.history.push({ status: next, date: todayISO() });
    if (next === "approved" && prev !== "approved") addReferralCredit(a);
    save();
    render();
  }

  function addReferralCredit(app) {
    var code = (state.referralCodeEntered || "").trim().toUpperCase();
    if (!code) return;
    if (app.feeBase <= 0) return;
    var rate = Math.max(0, Number(state.settings.referralPercent) || 0) / 100;
    var credit = Math.round(app.feeBase * rate * 100) / 100;
    if (credit <= 0) return;
    state.referralLedger.push({
      code: code,
      fromName: state.profile.displayName || "Current client on this device",
      found: app.feeBase,
      credit: credit,
      date: todayISO(),
      applicationId: app.id
    });
  }

  function retractReferral(app) {
    state.referralLedger = state.referralLedger.filter(function (r) { return r.applicationId !== app.id; });
  }

  function bindChrome() {
    $("#btnHome").addEventListener("click", function () { setView("home"); });
    $("#btnInstall").addEventListener("click", function () { promptInstall(); });
    $("#btnInstallNow").addEventListener("click", function () { promptInstall(); });
    $("#btnInstallDismiss").addEventListener("click", function () {
      installDismissed = true;
      hideInstallBanner();
    });
    $$(".tabbar button").forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.disabled) return;
        setView(b.getAttribute("data-view"));
      });
    });
    document.getElementById("appName").textContent = BF.APP_NAME;
    document.title = BF.APP_NAME;
  }

  BF.goto = setView;
  BF.getState = function () { return state; };
  BF.replaceState = function (next) { state = next; save(); render(); };

  bindChrome();
  setupInstall();
  registerSW();
  render();
})();
