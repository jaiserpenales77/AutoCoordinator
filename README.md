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
- **Printable sheet** replicating the two-page QS017B layout, including the
  sign-off lines (Yield Sheet Created By, Packaging Review By, Quality
  Review By, Quality Release By, VideoJet Count By, Partial Pallet
  Configuration) and the List #/Lot #/CC # footer page.

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
- `style.css` — screen layout plus a print stylesheet for the two-page
  printable sheet.
- `app.js` — calculations, saved-record persistence (localStorage), CSV
  export, and print-sheet generation.
