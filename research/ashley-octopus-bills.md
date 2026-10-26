# Ashley's Own Octopus Bills (2026)

Two real Octopus Energy statements for Ashley's own house, scanned into
`src/assets/photos/bills/`. These are the bills Ashley refers to on camera in
the house walkthrough video: "I've got some bills that I'm going to put on the
post that we're doing and you can see how much we've saved"
(`research/ashley-house-walkthrough-video.md`, transcript line 34).

## Sources

- `research/bills/image (1).jpg` - Octopus bill ref 449618367,
  dated 7 Sept 2026, account period 7 Aug - 6 Sept 2026.
- `research/bills/image.jpg` - Octopus adjustment statement ref
  468879557, dated 13 Oct 2026, account period 7 - 9 Oct 2026. Carries a
  handwritten "PAID TO ME" note in pink.

Both were transcribed with a vision model and are arithmetically
self-consistent (Sept: £120.29 - £72.86 = £47.43; Oct: £1.94 + £92.21 =
£94.15 with the balance unchanged), so the figures below are reliable.

The raw scans live in `research/bills/`, not in `src/assets/` - the
latter is passthrough-copied to the live site, which would have published
the unredacted documents.

## Derived images (AI-rendered, 2026-10-26)

Two edited renders sit alongside the scans, generated with an image model
from the originals:

- `src/assets/photos/bills/bill-sept-2026-grass.jpg` - from
  `research/bills/image (1).jpg` (September bill).
- `src/assets/photos/bills/bill-oct-2026-grass.jpg` - from
  `research/bills/image.jpg` (October statement; second render, first had
  a "cirucmstances" typo in the small print and was discarded).

Both were asked to keep every printed figure and line identical, remove the
customer name/address block and account number, and show the paper lying on
trimmed grass in summer sunlight. The pink "PAID TO ME" annotation is kept.
Verification pass confirmed every load-bearing figure matches the scans
(sept: £52.23, £4.22, £16.41, £120.29 -> £47.43, £897.79/£562.60, ref
449618367; oct: £94.15, £1.94, £92.21, £56.76 -> £56.76, £573.59/£603.72,
ref 468879557) with no name, address or account number visible.

Limits on these renders:

- They are model renders of the documents, not photographs of the paper
  with pixels removed. The figures are real and verified; the presentation
  is synthetic. Ashley should sign off on publishing them as "his bills".
- Per instruction only the account number and home address were removed.
  The meter point numbers (MPAN/MPRN) are still visible; blank them too if
  wanted before publication.
- Small print outside the verified figures was only spot-checked; a
  human eye should pass over both renders before site use.

Both renders are used on `/solar-questions-answered-manchester/` in the
"How much will you save?" section, linked to the full-size files, since
2026-10-26.

## Privacy - read before publishing

Both images carry Ashley's full name and home address, his Octopus account
number, and his MPAN and MPRN. Never publish either image unredacted. The
address would also reveal the house's town, which AGENTS.md says not to name.
Any published use needs a crop or redaction and Ashley's sign-off. The
handwritten "PAID TO ME" is his annotation; his call whether it stays.

## Facts from the September bill (7 Aug - 6 Sept 2026)

- Electricity import charged for the month (6 Aug - 5 Sept): **£52.23**,
  standing charge included.
- Gas charged for the same window: £4.22 + £16.41 = **£20.63**.
- Total charges £72.86; balance moved £120.29 -> £47.43. No Direct Debit
  credit appears on the statement, consistent with Octopus suggesting he
  could save £37.71 a year on gas by paying by Direct Debit.
- Octopus's estimated annual cost at that date: **£897.79 electricity,
  £562.60 gas** (£1,460.39 total, about £122 a month).
- Electricity: "You're on our cheapest electricity tariff of its kind. You
  could save £29.22 a year by switching to Octopus Go."
- Printed government note: "Your energy bill has been discounted from the
  1st of April following action taken by the UK government in the 2025
  Budget" (gov.uk/your-energy-bill).

## Facts from the October statement (dated 13 Oct 2026)

- Export credit: **+£94.15** for electricity exported between 11 July and
  6 Oct 2026, estimated from meter readings, no VAT on export. Over the 88
  days that works out at about **£1.07 a day, roughly £32 a month** of
  export income through late summer (derived arithmetic, not a bill line).
- Import charges for the same window - £92.21 (11 Jul - 29 Sep) and £1.94
  (30 Sep - 5 Oct), £94.15 in total - were reversed on 8 Oct, and the
  balance held at £56.76. This reads as a re-issue of the July-October
  period; the re-billed charges would land on a later statement.
- Octopus's estimated annual cost: **£573.59 electricity (£897.79
  previously, down £324.20), £603.72 gas** (£1,177.31 total, about £98 a
  month). 0% VAT accounts for only about £43 of the electricity drop
  (£897.79 / 1.05 = £855.04); the remaining ~£281 is a lower projected
  usage once real readings including export replaced the estimate
  [INFERENCE on the cause; the drop itself is printed].
- Printed: "From 1 October, the VAT rate on domestic electricity in Great
  Britain has been temporarily reduced from 5% to 0% following a UK
  Government decision."
- Electricity: "you're already on our cheapest tariff" - no Octopus Go
  suggestion this time. Gas: save £39.23 a year with Direct Debit.

## Cross-check against the video's "about £40 a month"

- August-September electricity import: £52.23 for the month.
- Export income at the July-October run rate: about £32 a month (derived).
- Net electricity: roughly £20 a month.
- Gas for the same month: £20.63.
- Summer total, gas included: **about £41 a month** - which corroborates
  Ashley's on-camera "My bill now is around £40 a month" for the summer
  months, with the caveat that his figure may have meant electricity only
  (he mentions the standing charge immediately after).

## Limits

- The "about £40 a month" is a summer figure. Gas alone is estimated at
  £603.72 a year (about £50 a month annualised), export income falls in
  winter, and the September statement's own all-in estimate was about £122
  a month at the time. Never present £40 as an all-year total.
- Estimated annual costs are Octopus model outputs, not his actual spend;
  attribute them to Octopus if quoted.
- The export credit is "estimated" and covers a period extending beyond the
  billing month it is compared against; the monthly conversion is
  arithmetic, not a printed line.
- The exact export rate (p/kWh) and tariff name are not visible on either
  image. Do not infer them.
- The 0% VAT change is printed on the bill, but the 0% VAT page
  (`src/pages/0-vat-solar-panels-batteries-manchester.md`) should be
  re-checked against gov.uk before restating the position on-page.
- Ashley's sign-off is needed before any bill image or figure is published;
  these are his personal documents.
