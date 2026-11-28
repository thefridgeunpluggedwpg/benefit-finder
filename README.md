# Benefit Finder

A prototype web app for a Manitoba financial-planner client. It helps one person estimate their **2025 Canadian & Manitoba tax refund (or balance owing)**, see which **federal and Manitoba** benefits may apply, shows an **approximate** dollar total, and builds an application packet after they approve. It is a single-user, installable phone app. It is **not for sale** as a subscription product.

**Live (when published):** https://thefridgeunpluggedwpg.github.io/benefit-finder/

Version **1.4.0**. The product name lives in one place: `js/config.js` (`BF.APP_NAME`).

This is a **prototype — demo build**. The badge is visible in the app. It does **not** submit applications to the CRA, Service Canada, or the Government of Manitoba. There is no public API that would let an app do that on someone’s behalf.

## What it does

1. One intake form (background, optional gender and ethnicity, age, province, profession, detailed 2025 income types, children, disability, student, housing, and similar eligibility questions).
2. A government ID upload during post-close onboarding (after a lead is closed or a packet is approved or signed). Images stay on the device (IndexedDB). They are never transmitted by this build.
3. Matching against a catalog of real programs, using official rules and amounts gathered from canada.ca and gov.mb.ca on 21 November 2026. See `research/SOURCES.md`.
4. After matching, a one-screen checklist asks “Do you already receive [program]?” for every match. Yes hides it from the results and the dollar total, and keeps it in a collapsed Already receiving list so it can be undone. Answers are saved on the device.
5. An upfront approximate total, broken down by program, labelled with the official benefit year. If an amount cannot be verified, the row says **amount varies** and is left out of the total. Loans are labelled as loans and are also left out of the total. Results also include a 2025 tax refund estimate and a profession-tailored checklist of possible write-offs (with optional amounts that update the estimate), and an RRSP helper that compares contribution amounts against your room. The federal digital news subscription credit is omitted because it ended after 2024.
6. The user reviews and approves selected programs. Approval only creates a packet on the device: a prefilled summary, the official program link, and a document checklist.
7. Tax-related programs (claimed on a tax return or through the CRA — for example CCB, the Groceries and Essentials Benefit, CWB, the DTC, and Manitoba tax credits) go to an **accountant queue**. Other programs are marked **submit directly**.
8. A progress tracker. Status moves **Submitted → In review → Approved** (or **Denied**), with dates. The owner advances status by hand.
9. Owner fee: **2–4%** of approved finds, default **3%**, shown before approval. Configurable in the owner desk.
10. Referral credits: each user gets a referral code. When a referred user’s finds are approved, the referrer earns a configurable bonus (default **1%**) on the same percentage base as the owner fee. There is a referral dashboard.
11. An owner desk: the client on this device, matches, statuses, fees owed, referral credits owed, and the accountant queue.

## Fee and Disability Tax Credit rules

The owner percentage applies only to approved amounts that are **not** Disability Tax Credit requests and **not** tax items that depend on the DTC (for example the Child Disability Benefit and the CWB disability supplement).

The [Disability Tax Credit Promoters Restrictions Act](https://laws-lois.justice.gc.ca/eng/acts/D-2.8/section-3.html) and the [Regulations (SOR/2021-55)](https://laws-lois.justice.gc.ca/eng/regulations/SOR-2021-55/FullText.html) set a **$100** maximum fee for a DTC eligibility request and **$100 per taxation year** for related deductions. The [CRA states](https://www.canada.ca/en/revenue-agency/services/tax/individuals/segments/tax-credits-deductions-persons-disabilities/disability-tax-credit/promoters-restrictions-regulation.html) that the regulations are **suspended by a court injunction** until further notice. This app still applies the $100 cap and leaves DTC-related amounts out of the percentage fee. I did not find a similar statutory fee cap for the other programs in this catalog.

## Programs in this catalog (29)

**Federal:** Canada Child Benefit; Child Disability Benefit; Canada Groceries and Essentials Benefit (formerly GST/HST credit); Canada Workers Benefit; CWB disability supplement; Disability Tax Credit; Old Age Security; Guaranteed Income Supplement; Allowance (ages 60–64); Allowance for the Survivor; Canada Disability Benefit; Canadian Dental Care Plan; Canada Learning Bond; Canada Education Savings Grant; Canada Disability Savings Grant; Canada Student Grant; Non-Insured Health Benefits; Women Entrepreneurship Loan Fund (loan, women entrepreneurs, up to $50,000, not in the cash total); Women Entrepreneurship Strategy business support (support service); Employment Insurance maternity benefits (keyed on pregnancy, any gender).

**Manitoba:** Rent Assist (non-EIA); Manitoba Child Benefit; Homeowners Affordability Tax Credit (this replaced the Education Property Tax Credit); Renters Affordability Tax Credit; Seniors’ School Tax Rebate; 55 PLUS; Manitoba Prenatal Benefit; Manitoba women in the trades supports (Office to Advance Women Apprentices and LauncHER into Trades, support service); Manitoba Gender-Based Violence Program supports (shelters, resource centres, and second-stage housing, support service).

The Education Property Tax Credit is **not** listed as a current program because Manitoba replaced it with the Homeowners Affordability Tax Credit.

## Privacy

There is no backend. Answers and ID files stay in `localStorage` and IndexedDB on the device. Gender and ethnicity are optional and include “prefer not to say.” Gender is used only to list programs that target women or men. If you prefer not to say, those targeted programs are left out. This catalog does not currently include a verified government cash benefit that is only for men. Ethnicity is not used for matching except the optional Indigenous identity question, which is used only for Non-Insured Health Benefits (First Nations and Inuit).

## What a production backend would need

- Real sign-in for the client and for the owner.
- Encrypted storage for ID images, income, and other sensitive answers, with a written consent record and a retention limit.
- A private accountant portal, not a toggle on the same phone.
- A real referral ledger across users, not a code typed on one device.
- Audit logs for status changes and fee calculations.
- Regular review of official amounts (many benefits change every July or every quarter).
- Hosting in Canada, access control, and a privacy policy.
- A way to export a packet without putting sensitive files in a public repository.

## Decisions still needed from the owner or client

- The exact owner fee inside the 2–4% range (default is 3%) and the referral percentage (default is 1%).
- The accountant specialist’s identity and how packets should be handed over. This prototype does not store an email or phone number on purpose.
- Whether the $100 DTC cap should remain applied while the regulations are under injunction.
- Which additional provinces, if any, to add after Manitoba.
- Production hosting, legal review, and consent wording.

## Install on a phone

Open the live link in the phone’s browser (Safari on iPhone, Chrome on Android). Use **Install**, or on iPhone: Share → Add to Home Screen. The app is a standalone PWA (manifest, 192/512 icons, apple-touch-icon, service worker).

## Run locally and test

```bash
python3 -m http.server 8940 --bind 127.0.0.1
node tools/test_tax.mjs
/workspace/.venv-pw/bin/python tools/e2e.py
```

## Name

The working name is **Benefit Finder**. To rename it, change `BF.APP_NAME` in `js/config.js` and the same words in `index.html`, `manifest.webmanifest`, and this README.
