# India (`in`)

Verified on 2026-09-21. This preset is a starting point: check it with your accountant before you issue documents.

<!-- Generated from src/presets by `npm run presets:docs`. Do not edit by hand. -->

## Settings

| Setting | Value |
|---|---|
| Country | IN |
| Language | EN |
| Locale | en-IN |
| Currency | INR |
| Tax rounding | PER_RATE_ON_TOTAL |
| Total in words | no |
| Invoice title | Tax Invoice |
| Credit note title | Credit Note |
| Quote numbers | `Q-{YYYY}-{SEQ:5}` |
| Invoice numbers | `INV-{YYYY}-{SEQ:5}` |
| Credit note numbers | `CN-{YYYY}-{SEQ:5}` |
| Numbering restarts | NEVER |
| Payment term | 30 days |
| Quote validity | 30 days |

## Identifiers

| Key | Label | Applies to | Required for the seller | Required for a domestic business buyer | Format |
|---|---|---|---|---|---|
| `in.gstin` | GSTIN | BOTH | yes | no | `^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$` |
| `in.pan` | PAN | SELLER | no | no | `^[A-Z]{5}\d{4}[A-Z]$` |

## Tax codes

| Code | Name | Category | Components | Printed note |
|---|---|---|---|---|
| `in.gst.5.intra` | GST 5% (intra-state) | REDUCED | CGST 2.5 % + SGST 2.5 % |  |
| `in.gst.5.inter` | GST 5% (inter-state) | REDUCED | IGST 5 % |  |
| `in.gst.18.intra` | GST 18% (intra-state) | STANDARD | CGST 9 % + SGST 9 % |  |
| `in.gst.18.inter` | GST 18% (inter-state) | STANDARD | IGST 18 % |  |
| `in.gst.40.intra` | GST 40% (intra-state) | STANDARD | CGST 20 % + SGST 20 % |  |
| `in.gst.40.inter` | GST 40% (inter-state) | STANDARD | IGST 40 % |  |
| `in.nil` | Nil-rated | ZERO | GST 0 % |  |
| `in.exempt` | Exempt | EXEMPT | GST 0 % | Exempt supply under GST. |
| `in.export-lut` | Export under LUT | ZERO | IGST 0 % | Supply meant for export under LUT without payment of IGST. |

## What this PDF does not cover

Businesses above the e-invoicing turnover threshold must obtain an IRN from the Invoice Registration Portal; this PDF does not. A tax invoice must show the place of supply (state and code), which is not supported yet. Invoice numbers must be unique within a financial year and at most 16 characters. Rates follow the GST rate rationalisation in force from 22 September 2025; union territories use UTGST in place of SGST.

## Sources

- [Tax Invoice, Credit and Debit Notes (CBIC)](https://cbic-gst.gov.in/gst-invoice-rules.html)
- [Section 31 (Tax Invoice), CGST Act, 2017 (CBIC)](https://taxinformation.cbic.gov.in/content/html/tax_repository/gst/acts/2017_CGST_act/active/chapter7/section31_v1.00.html)
- [Recommendations of the 56th GST Council Meeting (Ministry of Finance / PIB)](https://gstcouncil.gov.in/sites/default/files/2025-09/press_release_press_information_bureau_0.pdf)
- [e-Invoice System (GSTN)](https://einvoice1.gst.gov.in)
