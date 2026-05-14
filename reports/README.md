# Team Y — Final system report (deliverable)

- **`Team_Y_Final_System_Report.pdf`** — generated report (submit this).
- **`Team_Y_Final_System_Report.html`** — source; open in a browser or re-print to PDF.

## Regenerate PDF (Windows, Edge installed)

From PowerShell (adjust paths if needed):

```powershell
$html = "C:\path\to\College0\reports\Team_Y_Final_System_Report.html"
$pdf  = "C:\path\to\College0\reports\Team_Y_Final_System_Report.pdf"
$uri  = ([System.Uri]$html).AbsoluteUri
& "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe" `
  --headless=new --disable-gpu --print-to-pdf="$pdf" $uri
```

Or: open the `.html` file → **Print** → **Save as PDF** → enable **Background graphics**.

Target length: **≤ 9 pages** (A4). If the PDF exceeds that, tighten margins in the browser print dialog or edit the HTML `font-size` / remove a subsection.
