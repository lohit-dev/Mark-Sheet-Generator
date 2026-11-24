# CNR Marks Sheet Generator

A small, browser-based marks sheet creator with a floral CNR notebook-style preview.

## Run it
1. Extract the ZIP file.
2. Open `index.html` in a modern browser (Chrome, Edge, Firefox).
3. Enter exam details and student marks, or import a CSV/Excel file.
4. Choose **Download PNG** or **Print / Save PDF**.

No server or build step is required.

## Marks input
- **Internal + External:** each student's total is calculated as external + internal.
- **Total marks only:** enter one mark value per student.
- Enter `Ab` in a marks field to mark a student absent. In split mode, Ab in either field marks the student absent.
- Absent students are excluded from the grand total and average.
- Average is calculated as `grand total ÷ (present students × maximum marks) × 100`.

## Import format
CSV is supported directly. Excel `.xlsx` and `.xls` import uses the SheetJS browser library from a CDN, so internet access is needed for Excel files. You can always save Excel data as CSV and import it offline.

Split-mode CSV example:
```csv
Name,Maths_External,Maths_Internal
A. Student,78,20
B. Student,65,20
```

Total-only CSV example:
```csv
Name,Marks
A. Student,86
B. Student,73
```

## Notes
- PNG export uses html2canvas from a CDN. If it is unavailable, use the browser print dialog and choose Save as PDF.
- Fonts are loaded from Google Fonts when online; system fallbacks are provided.
- All data stays in your browser tab. This starter version does not save records to a database.
