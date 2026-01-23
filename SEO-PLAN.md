# Renegade Solar - SEO Strategy Plan

## Current Situation

**Strengths:**
- Strong Checkatrade presence (9.6/10, 80+ reviews)
- MCS certified, multiple accreditations (NAPIT, TrustMark, HIES, Octopus Partner)
- Good local service area coverage (16+ location pages)
- Solid technical foundation (fast static site, good image optimization)
- Existing content structure with services + locations

**Weaknesses:**
- Only ~10 Google reviews in past year (vs 80+ on Checkatrade)
- Content written from inference - needs owner input for authenticity
- No Google Business Profile optimization evident
- No structured data (Schema.org markup)
- Site may still have `noindex` tags (blocking Google)
- No social proof integration (Facebook/Checkatrade embeds)

**Key Constraint:** Ash is very busy. His wife is organised and can help.

---

## Month 1: Foundation & Quick Wins

### Week 1-2: Critical Technical Fixes

**Who: Developer/Stef**

1. **Remove noindex tags** - CRITICAL
   - Check all pages for `noindex: true` in frontmatter
   - Site is likely invisible to Google right now
   - This alone could be blocking all organic traffic

2. **Submit sitemap to Google Search Console**
   - Verify site ownership
   - Submit `https://www.renegade-solar.co.uk/sitemap.xml`
   - Check for crawl errors

3. **Add structured data (Schema.org)**
   - LocalBusiness schema with NAP (Name, Address, Phone)
   - AggregateRating schema using Checkatrade data
   - Service schema for each service type

### Week 1-2: Google Business Profile

**Who: Wife (with 15 mins from Ash)**

1. **Claim/verify Google Business Profile** if not done
   - Business name: Renegade Solar
   - Category: Solar Energy Equipment Supplier, Solar Panel Installation Service
   - Service area: North Manchester and surrounding areas

2. **Optimize the profile:**
   - Add all services with descriptions
   - Upload 10-15 best installation photos
   - Add business hours
   - Link to website
   - Add all accreditation logos

3. **Posts:** Create 1 Google Business post per week
   - Recent installation completed
   - Seasonal tip (e.g., "Winter solar production")
   - Accreditation highlight

### Week 3-4: Google Review Campaign

**Who: Wife manages, Ash provides customer contacts**

The gap between 80+ Checkatrade reviews and ~10 Google reviews is a huge missed opportunity.

**Simple system for wife to manage:**

1. **Create a review request template:**
   ```
   Hi [Name],

   Thanks for choosing Renegade Solar for your [solar/EV charger] installation.

   If you were happy with the work, would you mind leaving a quick Google review?
   It really helps other homeowners find us.

   [DIRECT GOOGLE REVIEW LINK]

   Thanks,
   Ashley
   ```

2. **Process:**
   - After each completed job, wife sends text/WhatsApp within 48 hours
   - Follow up once if no response after 1 week
   - Target: 2-4 new reviews per month

3. **Respond to all reviews** (wife can do this)
   - Thank positive reviewers by name
   - Address any concerns professionally

### Week 3-4: Content Authenticity Audit

**Who: 30-minute voice recording session with Ash**

The content was inferred - it needs Ash's voice. Have wife record a casual conversation covering:

1. **His story:**
   - Why did you start Renegade Solar?
   - What's different about how you work vs big companies?
   - What's a job you're particularly proud of?

2. **Customer questions he gets asked:**
   - Most common questions from enquiries
   - Misconceptions people have about solar
   - What should people know before getting quotes?

3. **Local knowledge:**
   - Any specific challenges with Manchester properties?
   - Areas where he's done lots of work?
   - Any commercial clients happy to be mentioned?

**Use this recording to rewrite the About page and add authenticity to service pages.**

---

## Month 2: Content & Local SEO

### Week 5-6: Content Improvements

**Who: Developer/Stef (using Ash's recording)**

1. **Rewrite About page**
   - More personality, less generic
   - Specific story of why he started
   - Photos of him and the van/team

2. **Add FAQ content** (from Ash's common questions)
   - "How much do solar panels cost in Manchester?"
   - "How long does installation take?"
   - "Will solar panels work on my north-facing roof?"
   - "What's the difference between MCS and non-MCS installers?"

3. **Improve service pages with real examples:**
   - Mention specific job types/sizes done
   - Approximate savings customers have seen
   - Real warranty details

### Week 5-6: Local Page Optimization

**Who: Developer**

1. **Review location pages** for quality
   - Each should have unique content, not just template text
   - Mention local landmarks or specifics where possible
   - Link to relevant gallery photos from that area

2. **Add "Areas Covered" content**
   - The `areas_covered.json` is currently empty
   - Populate with proper descriptions

### Week 7-8: Social Proof Integration

**Who: Developer**

1. **Embed Checkatrade widget** on reviews page and homepage
2. **Add Facebook reviews** if available
3. **Create a "Recent Projects" section** showing 3-4 latest jobs with photos

### Week 7-8: Backlink Foundations

**Who: Wife**

1. **Directory listings** (free, high-value for local SEO):
   - Ensure consistent NAP across:
     - Google Business Profile
     - Checkatrade (done)
     - TrustMark directory
     - NAPIT find-an-installer
     - MCS installer database
     - Yell.com
     - Thomson Local
     - Yelp

2. **Accreditation backlinks:**
   - Check each accreditation body's directory
   - Ensure profile is complete with link back to site

---

## Success Metrics

### End of Month 1:
- [ ] Site indexed in Google (check with `site:renegade-solar.co.uk`)
- [ ] Google Business Profile fully optimized
- [ ] 3-5 new Google reviews
- [ ] Ash voice recording completed

### End of Month 2:
- [ ] 6-10 total new Google reviews
- [ ] Updated About page with real content
- [ ] FAQ page live
- [ ] All directory listings consistent

---

## Task Assignment Summary

| Task | Who | Time Needed |
|------|-----|-------------|
| Remove noindex, add schema | Developer | 2-3 hours |
| Google Search Console setup | Developer | 30 mins |
| Google Business Profile setup | Wife | 1-2 hours |
| Weekly GBP posts | Wife | 15 mins/week |
| Review request system | Wife | 30 mins setup, then 10 mins/job |
| Voice recording with Ash | Wife + Ash | 30 mins |
| Content rewrites | Developer | 3-4 hours |
| Directory listings | Wife | 2 hours |

**Total Ash time required: ~30 minutes** (one voice recording session)

---

## Priority Order (If Time Is Limited)

1. **Remove noindex tags** - without this, nothing else matters
2. **Google Business Profile** - biggest impact for local searches
3. **Google review system** - builds trust, improves rankings
4. **Ash recording** - everything else depends on authentic content
5. **Schema markup** - technical boost for search appearance
6. **Content updates** - longer-term value

---

## Notes for Developer

Things to check/implement:
- [ ] Verify no pages have `noindex: true` that shouldn't
- [ ] Add Open Graph tags for social sharing
- [ ] Add LocalBusiness JSON-LD to base template
- [ ] Add AggregateRating schema using reviews data
- [ ] Consider adding BreadcrumbList schema
- [ ] Embed Checkatrade widget
