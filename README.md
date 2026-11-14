# BillEase

A GST invoicing and billing demo for Indian small businesses, by Neovia AI. Create a correct GST invoice in under a minute, send it on WhatsApp with a UPI QR, track who has paid, and hand your CA a clean monthly GST summary.

All data is fictional demo data and lives in your browser (`localStorage`). There is no database and no sign-in. BillEase applies the rules your business sets. Tax treatment, rates and HSN/SAC codes are confirmed by your CA.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest
npm run build && npm start
```

Node 20+ is required. Deploy to Vercel by importing the repository; no environment variables are needed (see "Email" for the optional one).

## The 3-minute demo script

Press **Shift + D** to open the Presenter Panel (only you see it). Enter the prospect's name and WhatsApp number first.

1. **Open the builder** with the demo invoice: Patel Interiors (Mumbai), taxable 36,991.00, CGST 2,438.69 + SGST 2,438.69, round off -0.38, **total 41,868.00**.
2. **Switch the customer to Surat Lighting House.** The tax card flips from CGST+SGST to IGST 4,877.38. The total stays 41,868.00 ("Total unchanged").
3. **Issue and send on WhatsApp.** An ISSUED stamp lands, the padlock closes, the number rolls in, then the WhatsApp dialog opens. Press Send: the invoice flies into the phone mockup.
4. **Open Reports** for this month and click **Download CA pack (.xlsx)**.

Optional finish: in the panel, **Simulate Razorpay payment** shows the Paid moment (glow, confetti, PAID stamp).

The **Script spotlight** dims the screen and rings the next thing to click; turn it off in the panel if you prefer. Reset with **Reset demo data** (panel or Settings); the prospect survives a reset.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `N` | New invoice |
| `Shift + D` | Presenter Panel |
| `Ctrl/Cmd + K` | Search invoices, customers, items, screens |
| `Esc` | Close a dialog, the panel or the spotlight |
| `Tab` / `Enter` | Move between line cells / add a new line from the last row |

## Set your UPI ID

Settings, then **Bank and UPI**, then **UPI ID (VPA)** (for example `shop@yourbank`), then **Save settings**. The ID drives the QR on the PDF, the **Pay with UPI** button on the public invoice page and the `upi://pay` link. The amount in the QR is always the balance due.

- Use a business/merchant UPI ID in production. Some UPI apps may warn about or block prefilled amounts for personal UPI IDs.
- **Demo watermark under QR** prints "DEMO" under the QR; switch it off for real invoices.

## Add a new business

Three ways in, all open the same form: on the landing page click **Enter as Business Owner** then **Add a new business**; in the top bar open the business switcher and pick **＋ Add new business…**; or in the CA view click **Add business**. Enter the GSTIN (checked live: format, checksum, state, PAN), address, series prefix, bank and UPI details. Tick "Start with a few fictional items and customers" to create your first invoice straight away.

A new business is its own set of books (customers, items, invoices, numbering). It is linked to the CA list automatically, so it appears in the CA view and in "Download all client packs" without any extra step. Note: **Reset demo data** restores the original demo businesses, so businesses you added are removed by a reset.

## The invoice format

The default **Standard** template follows the usual Indian trade invoice: supplier block (GSTIN, PAN, CIN, state and code), consignee (ship to) and buyer (bill to) blocks, a reference grid (delivery challan, buyer's order, dispatch, vehicle, LR, e-way bill, transporter, broker, payment terms), an item grid with part no., batch, grade, size, HSN/SAC, quantity, UOM, rate, discount and per-line GST, charges (loading, freight, transport) in the totals block, an HSN-wise tax summary, amount and tax in words, terms and conditions, declaration, bank details with UPI QR, signatures and a receiver's stamp box. Fill the extra details in the builder under **Transport and references**, the line's **More details** arrow, and the **Charges** card. Company-level text (CIN, bank branch, terms, declaration, e-invoice block) lives in Settings, **Invoice format details**. Classic, Modern and Minimal remain available.

The optional e-invoice block prints an IRN, Ack No. and QR as **demo values only**; nothing is registered on the e-invoice portal.

## Switch to the CA view

Use the **Owner | CA** toggle in the top bar (or "Enter as CA" on the landing page). The whole app is re-branded as *Kalyan Tax Associates* (fictional). The Clients screen lists four linked businesses; **Open books** switches the whole app to that business, and **Download all client packs (.zip)** gives one workbook per client. Businesses are stored as separate workspaces, so data never mixes.

## What is real, and what is simulated

| Feature | Status |
| --- | --- |
| GST maths (CGST/SGST/IGST, per-line half-up rounding, round off), GSTIN checksum, amount in words, numbering, Rule 46 checks, credit notes, reports, reconciliation | **Real**, unit-tested, integer paise (no floats) |
| PDF invoices and credit notes (vector, ₹ glyph via bundled Noto Sans) | **Real** |
| UPI QR and `upi://pay` links | **Real** (scan it in any UPI app) |
| WhatsApp | **Real, no server:** on phones the Web Share API shares the actual PDF; otherwise a `wa.me` link opens with the message and public link. WhatsApp Cloud API sending needs a backend |
| Email | **Real when `RESEND_API_KEY` is set** (server route `/api/send-email`, PDF attached); otherwise a `mailto:` draft opens and the PDF downloads |
| CA pack `.xlsx`, CSV, client `.zip` | **Real** (exceljs / jszip, generated in your browser) |
| Public invoice page `/i#...` | **Real, backend-free:** the invoice is encoded in the URL hash. Production should use signed short links |
| Data storage | Browser only (`localStorage`, versioned with migrations) |
| Razorpay payment | **Simulated**, from the Presenter Panel only |
| GSTN registration lookup | **Not available**: only format, checksum and state are validated |
| Seeded GST rates and HSN/SAC codes | **Demo values**, flagged "CA to confirm" on each item |

## Email

Optional. Set `RESEND_API_KEY` (and optionally `RESEND_FROM`, default `BillEase <onboarding@resend.dev>`) to send email from the server with the PDF attached. Without it the app uses `mailto:`.

## Project layout

```
lib/domain     pure TypeScript, no React or browser APIs: money, tax, gstin, numbering, rules,
               reports, report tables, exports (xlsx/csv), share links, credit notes, CA workspaces
lib/store      Zustand stores (persisted, versioned, migrated) + presenter/UI stores
lib/seed       deterministic seed generator (seeded PRNG, dates relative to today)
components/    builder, delivery, credit, dashboard, three (R3F hero), demo (presenter), pdf
app/           routes: landing, dashboard, invoices, customers, items, reports, settings, ca, /i, /api
tests/         vitest acceptance and unit tests
public/fonts   Noto Sans (SIL OFL) for the rupee symbol in PDFs
```

WebGL (three.js) loads only on the landing page and falls back to a static CSS composition when WebGL is unavailable, reduced motion is on, or 3D is switched off in the Presenter Panel.
