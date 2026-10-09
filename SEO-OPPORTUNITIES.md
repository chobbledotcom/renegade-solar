# Search Content Opportunities

This backlog records search intents that are weak or absent in the current site. It is based on the repository content audit and wider Manchester search results checked in July 2026, refreshed in October 2026 after the site-wide accuracy sweep. Search Console data should decide the final order when available.

## Completed October 2026

Accuracy sweep across every service, location and guide page (commits a94df64..adb2042 on the jscpd branch):

- Regulatory claims now carry their authoritative source where they are made: gov.uk electrical-safety-standards guidance cited on all 15 EICR pages that state the landlord rules (five-year rule, £30,000 penalties, 28-day deadlines), Warm Homes Plan cited for the EPC C 2030 rental deadline, HMRC Notice 708/6 linked from the 0% VAT page, gov.uk announcement linked for the 2030 pure-petrol/diesel phase-out, and bolton.gov.uk linked for the £2.3M/400-chargepoint programme.
- EV chargepoint grant corrected site-wide: 75% up to £500 and only for renters and flat owners (was "up to £350" with no eligibility, and Radcliffe had eligibility backwards). Verified against the gov.uk page, updated 2026.
- Unsupported figures removed rather than cited: Bolton average prices (£168k/£282k), Chadderton £215k, Lees £240k, Royton "40% growth" twice, "adds 4% to property value" four times, "£350-570 a year" savings ranges three times, Saddleworth "£3,000-5,000 rewires", the untraceable "70% of electrical fires pre-1950" and "one in five new builds" statistics, and Bolton's "fewer than 80 public charge points". Replaced with modelled-on-your-actual-bills wording; word counts held.
- Deduplication: 48 jscpd clones (33 markdown) rewritten so sibling pages no longer share paragraphs; keyword counts and word counts verified at or above the originals against the branch parent on every changed page. jscpd now gates at min-tokens 38 with a ratchet and a hardening rule that the scan must actually complete.
- Fire-statistics and housing-percentage claims (Bolton "70% terraced/semi", "over 200 cotton mills") softened to qualitative wording because no primary source was findable.
- Property-price figures in Saddleworth's and Royton's EICR page headings/intros removed (the August sweep had caught the location hubs; this pass caught the service pages).

## Completed August 2026

On-page fixes from the August 2026 audit:

- All titles over ~61 characters rewritten (the EICR location template, brand pages, commercial verticals and location hubs). "Electrical safety inspections" remains in each EICR page's h1 and description; the price and place stay in the title.
- Missing meta descriptions added: EICR root service page, electrical testing, Prestwich and Bolton hubs, plus accreditations, contact, reviews and services.
- All 21 location hubs expanded from 75-176 words to 305-370 words with place-keyword headings, property detail and internal links. Unsourced property-price figures (Chadderton, Saddleworth, Oldham tenure stats, Hale conservation-area specificity, Royton price commentary) removed as part of the rewrite.
- Thin service x location pages (commercial solar Lees and Shaw, EV chargers Lees and Shaw) expanded past 250 words.
- Stale tariff figures removed site-wide: "9.5p/kWh Octopus Go" and derived £-figure comparisons replaced with rate-agnostic wording on 22 pages. Sourced public-charging figures (50-80p/kWh with zapmap/RAC links) and the Oldham commuting table with stated assumptions remain.
- New guides published: `/are-solar-panels-worth-it-manchester/`, `/0-vat-solar-panels-batteries-manchester/`, `/g98-g99-dno-applications-solar-manchester/` (G98/G99 facts verified against Electricity North West).
- 0% VAT sections added to the solar and battery money pages, with the correct 5% EV chargepoint rate noted on the EV page. Facts verified against gov.uk Notice 708/6: zero rate to 31 March 2027, standalone batteries included since 1 February 2024, 5% thereafter.
- Battery-without-solar cluster cross-linked between home battery, Octopus Go and the worth-it guide.
- Generation-data sections (kWh/kWp, sunshine hours) deliberately not added, and no cost page published - both still gated on Ashley's real figures.

## Highest Priority

### Electrical Services In North Manchester

Target terms:

- electrician North Manchester
- electrician Prestwich
- electrician Middleton
- domestic electrician Manchester
- electrical installation Manchester
- NAPIT electrician Manchester

Recommended page: a core electrical services page covering installation, fault finding, sockets, lighting, rewires, outside power, renovation work and certification. This does not cannibalise EICR because it serves broader installation intent. The Bowlee whole-house project and current verified reviews provide strong first-hand evidence.

### Consumer Unit And Fuse-Board Upgrades

Target terms:

- consumer unit replacement Manchester
- fuse board upgrade Manchester
- fuse box replacement Middleton
- consumer unit upgrade Prestwich

Recommended page: a dedicated service page explaining assessment, protection, testing, certification, solar readiness and EV charger readiness. Keep diagnostic EICR intent on the existing EICR pages.

### New-Build Electrical Installation

Target terms:

- new build electrician Manchester
- new build electrical installation Manchester
- whole house electrical installation
- electrician for self build Manchester
- smart home electrician Manchester
- electrical design and installation Manchester

Recommended page: build the new Bowlee case study into a commercial service page only when more details are available. The case study already owns project evidence; a future service page should own procurement intent.

### Commercial EICR And Fixed-Wire Testing

Target terms:

- commercial EICR Manchester
- commercial electrical testing Manchester
- fixed wire testing Manchester
- EICR for offices Manchester
- industrial electrical inspection Manchester

Recommended page: a dedicated commercial testing page. Do not reuse the domestic fixed price because commercial scope depends on circuits, access, records and operating conditions.

### Rochdale And Heywood

Status: implemented in August 2026 as `/rochdale/` - one comprehensive hub covering solar panels, battery storage, EV chargers, electrical safety and the Bowlee new-build case study (correctly framed as electrical work with solar planned for a later phase). Service x location pages for Rochdale can follow if Search Console shows demand.

Target terms:

- solar panels Rochdale
- solar panel installer Rochdale
- battery storage Rochdale
- EV charger installer Rochdale
- electrician Heywood
- new build electrician Heywood

Recommended page: start with one comprehensive Rochdale and Heywood hub. The Bowlee case study supports electrical and smart-home experience in Heywood, but it must not be described as a completed solar installation.

## Strengthen Existing URLs

### Main Manchester Solar Page

Target terms:

- solar panel installer Manchester
- solar panel installation Manchester
- MCS solar installer Manchester
- solar and battery installer Manchester

Use `src/services/solar-and-battery-installations.md` as the canonical URL. Do not create another Manchester solar landing page.

### Workplace EV Charging

Status: implemented in July 2026 by expanding the existing URL around standalone workplace charging, commercial EV charger installation, office charging, fleet use, load management, solar integration and solar carports.

Target terms:

- workplace EV charger installation Manchester
- commercial EV charger installer Manchester
- office EV charging Manchester
- staff EV charging points Manchester

Expand `/solar-carports-workplace-ev-charging-manchester/` so standalone workplace charging is clear and a solar carport is presented as one option, not a requirement.

### EV Charger Repairs And Ohme Relocation

Status: implemented in July 2026 on the existing main EV service and relocation URLs, using the Hypervolt fault-diagnosis job, GivEnergy replacement review and verified Ohme Pro relocation reviews.

Target terms:

- EV charger repair Manchester
- home EV charger not working
- Ohme charger installer Manchester
- move Ohme charger to new house

Use the existing EV service and relocation URLs. Current reviews support charger diagnosis, replacement and Ohme relocation; avoid adding overlapping pages until query data shows separate demand.

### Complex Roof Solar

Target terms:

- solar panels on awkward roof
- solar panels around roof windows
- solar panels with chimneys
- solar installer for difficult roof Manchester

Recommended page: a case-study-led guide using the rooflight, flat-roof and difficult-bungalow evidence. Keep flat-roof-only intent on `/properties/flat-roofs/`.

## Medium Priority

- solar panels Salford and battery storage Salford: begin with a factual Salford hub once local evidence is available.
- solar panels Moston and electrician Moston: one hub before service variants.
- solar panels Didsbury and solar panel installer Chorlton: create only genuinely local pages, not generic South Manchester copies.
- battery storage Manchester city centre and home battery for apartments: use a feasibility guide covering leasehold, freeholder, roof rights, parking and management-company constraints.
- solar panels for new builds Manchester and in-roof solar panels Manchester: evidence-gated until a completed in-roof installation is documented.
- PAT testing Manchester and landlord PAT testing: confirm current process and service boundaries before publishing.
- solar panel cost Manchester and home battery cost Manchester: needs current quote data and explicit assumptions, not old social-media package prices.
- G98, G99 and DNO application guidance: useful informational intent that can support the main solar and commercial pages.
- where can a home battery be installed: a safety-led guide should cite current manufacturer and industry guidance.

## Accuracy Watchlist

Date-sensitive claims that will need refreshing, and evidence gaps found during the October sweep:

- **0% VAT ends 31 March 2027.** The VAT page already explains the return to 5%; when the date approaches, check the are-solar-panels-worth-it page, the index money section, the solar-and-battery costs section and every solar location page's 0% VAT section, which repeat the date.
- **ECO4 / Oldham LA Flex ends December 2026.** `/lees/` states the £31,000 LA Flex threshold and the December 2026 end date; verified against current sources in October 2026, but the page will be stale from January 2027.
- **EV chargepoint grant amount and eligibility.** Corrected to "75% up to £500, renters and flat owners" in October 2026 after the April 2026 rise; the amount has changed before, so re-check the gov.uk page when writing new EV copy.
- **EPC C for privately rented homes, 1 October 2030.** Confirmed in the January 2026 Warm Homes Plan response; four EICR pages cite it. Watch for implementing regulations.
- **"OZEV-approved" installer status** is claimed on several EV pages but is not in the credentials list or verifiable from the repository. Confirm with Ashley that the OZEV installer authorisation is current before it is cited anywhere new; otherwise reword to the chargepoint models' approval.
- **Pre-existing "we've installed" claims** on the Blackley, Middleton and Bury solar pages (and Bury commercial) assert completed local jobs without repository evidence. They predate the October sweep and were left alone; apply the same suitability-knowledge treatment as the Bolton and Stockport fixes when the pages are next edited.
- **"Same day certificates"** appears on every EICR page and is a service commitment, not a verified fact. Confirm the turnaround is still true before it is used in paid copy.

## Do Not Target Without Evidence

- commercial battery storage Manchester
- solar panels for schools, care homes, churches or community buildings
- third-party solar repairs and inverter replacement
- solar panel bird proofing
- whole-house battery backup as a universal promise
- heat-pump installation

These may have search demand, but the repository does not currently establish that Renegade offers or has completed the work. Confirm the service and gather first-hand evidence before creating pages.
