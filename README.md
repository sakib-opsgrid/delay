# SMS Delay Analyzer

**Version:** 2.0  
**Author:** Najmaz Sakib  
**Organization:** Infozillion Teletech BD Ltd — Service Assurance  

---

## Overview

A standalone browser-based tool for analyzing SMS response delays from Kibana / Elastic Stack CSV exports. It computes per-operator delay distribution, renders an Excel-style pivot table, and generates a shareable WhatsApp report card image — no installation, no backend, no internet required after first load.

---

## Files

```
sms-delay-tool/
├── index.html   — UI structure
├── style.css    — All visual styles
├── app.js       — All logic (parsing, computation, rendering, export)
└── README.md    — This file
```

All three files must be in the **same folder**. Open `index.html` in any modern browser.

---

## How to Use

### Step 1 — Export from Kibana
Go to your Kibana Discover query, apply your operator shortcode filter, and download as CSV.

### Step 2 — Upload
Open `index.html` → drag and drop the CSV onto the upload zone, or click **Browse File**.

### Step 3 — Review the Report
The tool shows:
- **Time Range** — detected automatically from `@timestamp` or `ansRequestTime`
- **Delay Distribution Table** — Excel-style pivot: rows = delay seconds (0, 1, 2…), columns = operators
- **Operator Summary Cards** — total messages and delayed count per operator

### Step 4 — Generate WhatsApp Card
Fill in the **Report Card** form:

| Field | Description |
|---|---|
| Report Type | e.g. `Delay Report` (default) |
| Reporter Name | Your name, e.g. `Rizvi` |
| Status | `Normal` or `Issue` |
| Issue Description | Shown only when Status = Issue |
| From / To | Auto-filled from CSV; override manually if needed |

Click **Generate Report Card** → **Copy Image** → Paste directly into WhatsApp.

---

## Required CSV Columns

| Column | Notes |
|---|---|
| `ansRequestTime` | When the request was made |
| `ansResponseTime` | When the response arrived |
| `applicableSmsGateway` | Operator name (GrameenPhone, Robi, Banglalink, Teletalk) |
| `@timestamp` | Optional — used for time range detection |

Column matching is **case-insensitive**. Extra columns are ignored.

---

## Delay Calculation

```
Delay (seconds) = floor( ansResponseTime − ansRequestTime )
```

- Values are floored to whole seconds (matching Excel `INT()` behavior)
- Delay **≥ 1 second** is highlighted in orange/red as "delayed"
- Delay = **0** means response came within the same second

---

## Export Options

| Button | Output |
|---|---|
| Export CSV | Downloads pivot table as `.csv` — ready for Excel |
| Copy Table | Copies tab-separated table to clipboard — paste directly into Excel |
| Copy Image | Copies report card as PNG — paste into WhatsApp |
| Download PNG | Saves report card as `delay_report_YYYYMMDD_HHMM.png` |

---

## Browser Compatibility

| Browser | Support |
|---|---|
| Chrome 90+ | ✅ Full (including clipboard image copy) |
| Edge 90+ | ✅ Full |
| Firefox 90+ | ✅ Full (clipboard image may open in new tab instead) |
| Safari 15+ | ⚠ Partial (clipboard image copy may not work; use Download PNG) |

> No internet connection required after fonts and html2canvas are cached on first load.

---

## Troubleshooting

**"Column not found" error**  
The CSV column names must match. Check that your Kibana export includes `ansRequestTime`, `ansResponseTime`, and `applicableSmsGateway`. Column names are matched case-insensitively.

**File uploads twice**  
Fixed in v2.0. If it still happens, use the Browse File button instead of clicking the drop zone.

**Image is cropped**  
The tool pins the card to its full content size before capture. If the image is still cropped, try **Download PNG** instead of Copy Image — download is more reliable across browsers.

**Time range shows manual instead of auto**  
The `@timestamp` column was not found, or could not be parsed. The tool falls back to `ansRequestTime`/`ansResponseTime`. You can override the time range manually in the Report Card form.

---

## Technical Notes

- Pure HTML/CSS/JS — zero dependencies except Google Fonts (cached after first load) and [html2canvas](https://html2canvas.hertzen.com/) (loaded from cdnjs)
- All CSV parsing is done in the browser — no data leaves your machine
- Designed for Kibana "Discover" CSV exports; delimiter is auto-detected (comma or tab)

---

*© 2026 Najmaz Sakib · Infozillion Teletech BD Ltd*
