# PK030 Packaging Yield Coordinator

A small web app that replaces the manual **PK030M [ALL] Final Packaging Yield
Sheet** (QS017B) Excel workbook with a live calculator and a saved-record
list for tracking multiple work orders.

## What it replicates from the original spreadsheet

- **Work order header**: FG Item, WO #, Bulk Item.
- **Bulk reconciliation**: Total Packaged (Bottles), Count (Fill Rate),
  Bulk Rejected/Returned (TH), Issued Bulk (TH).
- **Scrap calculations**: each of the three Packaging Scrap weighings and the
  Manufacturing Scrap weighing are entered as gross scale readings (Kg),
  netted against a container tare weight (defaults to 6 Kg, matching the
  spreadsheet's hardcoded value, but editable), then converted to
  piece-equivalent thousands (TH) using the Bulk Piece Weight (mg).
- **Final Yield %** and the same pass/fail thresholds as the source sheet:
  values below 94.5% or above 102.4999% trigger a **VideoJet Count** flag and
  the matching **Low Yield NCCAPA** / **High Yield NCCAPA** label.
- **VideoJet Count** entry (cell B21 in the workbook), printed on the
  VideoJet line when the yield is out of range.
- **Print report** that reproduces the workbook's print area
  (`PK030!E21:L71`) cell for cell. It uses the same column widths, row
  heights, Arial font sizes, borders, merged cells, logo placement, number
  formats and conditional formatting. It prints on Letter landscape at 88%
  with the workbook's margins and a page break after row 52, so page 1 is
  the yield sheet and page 2 is the List #/Lot #/CC # label. Sign-off lines
  stay blank for handwritten signatures, as on the paper form.

Fields the original "PDF Import Setup" sheet notes as **not automatable**
(Count/Fill Rate, Bulk Piece Wt, and the four scrap weights) remain manual
entry here too, since they come from scale readings rather than any source
PDF.

## Running it

No build step or server-side code is required — it's a static HTML/CSS/JS app.

```bash
# from the repo root
python3 -m http.server 8000
# then open http://localhost:8000/
```

Or just open `index.html` directly in a browser.

## Data storage

Saved yield sheets are stored in the browser's `localStorage` (per browser,
per device) — there is no backend. Use **Export CSV** on the records panel to
back up or share the saved work orders.

## Files

- `index.html` — page structure and form fields.
- `style.css` — screen layout plus the print stylesheet (page setup and
  cell styles).
- `app.js` — calculations, saved-record persistence (localStorage), CSV
  export, and print-report generation.
- `assets/pharmavite-logo.png` — logo taken from the workbook.
