# BuildReady PGH — Demo Video Script

**File to record from: this file, `DEMO_SCRIPT.md`.**
**Target length: 4:30. Hard ceiling: 5:00 (hackathon rule).**
**Format: one continuous voiceover over a screen recording of the real, live app. No slides.**

This is written for whoever is recording (Derek) to follow directly — it assumes no prior familiarity with the codebase. Every line in quotes is meant to be read close to word-for-word; the stage directions above each line say exactly what to click first.

---

## 0. Before you hit record

**Use the live site, not a local build** — one less thing that can go wrong on camera:
> **https://buildready-pgh.vercel.app**

- Open it in **Chrome or Edge, one window, 1440×900 or larger** (a laptop screen at normal size is fine — don't maximize to an ultrawide, some layouts assume a laptop width).
- Use an **Incognito/InPrivate window** — no bookmarks bar, no extension icons, no autofill popups on screen.
- Do **one full click-through of every section below before recording**, so the map tiles and data are warm and nothing has a first-load stutter on camera.
- Turn off notifications (Slack, email, OS banners). Nothing kills a take like a Slack popup.
- **Do not open**: `.env.local`, any terminal with environment variables printed, or the Vercel dashboard's Environment Variables page. If any of those are open in another tab, close them before you start — a stray API key on screen is the one thing that can't be edited out after the fact.

**You do not need one unbroken take.** Record each of the 6 sections below as its own separate clip (stop and restart between them), then stitch them together in iMovie / CapCut / Premiere / DaVinci with a hard cut or a quick fade. That removes almost all the performance pressure — if you flub a line, just redo that one clip.

**Voiceover:** you can narrate live while screen-recording, or record the screen silent and lay down voiceover after in your editor while watching the footage back. Either works; the line-by-line script below is written to be read as voiceover regardless of which you pick.

Fill in your own names/team name wherever you see `[ ... ]` — don't guess, just say your real names when you record.

---

## 1. Hook (0:00 – 0:30)

**Screen:** the landing page, `https://buildready-pgh.vercel.app/`

**Do:** Just let the page sit still for the first few seconds while you talk — don't scroll yet.

**Say:**

> "Hi, we're `[your name]` and `[Derek]`, and this is BuildReady PGH, built for the AI for Housing Hackathon, Track 1: Development Feasibility.
>
> Building homes in Pittsburgh gets slowed down by a simple problem: nobody can quickly answer 'can I build here, what's in the way, and who do I even ask?' The answers exist, but they're scattered across zoning PDFs, hazard maps, and property records that don't talk to each other.
>
> BuildReady PGH puts all of it in one place — a Development Ease Score for any parcel in the city, with a link back to the real source for every single number."

**Then:** scroll down slowly past the three example lot cards and the three feature cards ("Opportunity map", "Reform impact", "Compare lots") as you finish that last sentence — just enough motion to show the page is real and has content, not a mockup.

---

## 2. Reform Impact (0:30 – 1:15)

**Screen:** click **"Reform impact"** in the top nav → `/impact`

**Do:** Let the two big headline numbers be fully on screen before you start talking about them.

**Say:**

> "The city just changed its zoning rules, and we can measure exactly what that unlocked.
>
> Since Bill 2025-1579 took effect last May, **21,005 residential lots** across the city no longer need a lot-size variance to build — they used to be too small under the old rules, and now they qualify.
>
> And there's a second bill on the table right now, Bill 2025-1545, still proposed and not law yet. If it passes, up to **118,800 more lots** would gain the right to add an accessory dwelling unit — a small second home on the same lot — without a special hearing."

**Do:** Scroll down to the two neighborhood bar charts.

**Say:**

> "We break both counts down by neighborhood. Squirrel Hill South and Carrick see the biggest gains from the lot-size change; Brookline and Carrick lead on the ADU side. Every one of these numbers comes from applying the same rule engine that scores individual lots — it's not a separate estimate."

---

## 3. Opportunity Map (1:15 – 2:00)

**Screen:** click **"Opportunity map"** in the top nav → `/map`

**Say:**

> "This is the Opportunity Map: **13,211 vacant lots** owned by the City, the Urban Redevelopment Authority, the Housing Authority, or Allegheny County — every one of them scored, colored green for a strong candidate, amber for one with issues to review, red for difficult."

**Do:** In the left panel, check the **"Starter-home ready"** filter (no gates, score 70+). The dot count updates and most of the amber/red dots disappear.

**Say:**

> "Filtering to 'starter-home ready' — no blocking issues, score 70 or higher — narrows this down fast."

**Do:** In the "Top lots in view" list on the left, click the top entry (should be a Homewood South lot around score 94). The map flies to it. Click the marker/dot to open its popup, then click **"Open lot report"** — this takes you to `/parcel/0174N00262000000` (0 Tioga St). If the auto-picked top lot isn't 0 Tioga St, just type `0174N00262000000` into the search box on the homepage instead, or navigate directly to `https://buildready-pgh.vercel.app/parcel/0174N00262000000`.

**Say (as you click through):**

> "Let's open the best one: 0 Tioga Street in Homewood South."

---

## 4. Lot Report — the core product (2:00 – 3:15)

**Screen:** `/parcel/0174N00262000000` (0 Tioga St)

**Do:** Let the map settle on the lot outline first.

**Say:**

> "This is the Lot Report. Zoning R1A-VH, City-owned, sitting inside the major transit buffer — housing is allowed here by right."

**Do:** Point at (hover your cursor over) the valuation strip near the top — the four boxes labeled Land / Building / Total / Land $/sq ft.

**Say:**

> "Every lot gets a real financial snapshot straight from the county's own assessment records — not an estimate, and we say so right on the card."

**Do:** Scroll down to the "Bottom line" card.

**Say:**

> "And instead of making you read ten flag cards to find the catch, we write the plain-English bottom line first: the biggest barriers, what's working in the lot's favor, and exactly who to call next."

**Do:** Click the **"Current code" / "Proposed (Bill 2025-1545)"** toggle to switch to Proposed.

**Say:**

> "Flip this toggle and the score recalculates live under the *proposed* reform — 94 up to 100 — and it's clearly labeled proposed, not law, everywhere it shows up."

**Do:** Switch back to "Current code". Open a new tab (or use the browser back button + search) and go to `/parcel/0013E00051000000` (1817 Saint Patrick St) — or use the Compare page directly: `https://buildready-pgh.vercel.app/compare?ids=0174N00262000000,0013E00051000000`

**Say:**

> "Now compare it against a very different lot — 1817 Saint Patrick Street, on a hillside."

**Do:** On the compare page, point at the two rows side by side.

**Say:**

> "This one scores 34. 100% of the parcel sits on a slope steeper than 25%, 100% is landslide-prone, and nearly all of it — 98.9% — is undermined by old coal mines. All three need a geotechnical review before anyone builds, and its Hillside zoning only allows housing by special exception, not by right — that's why the score is capped."

**Do:** Click into that parcel's own report (`/parcel/0013E00051000000`) and point at the map — the amber numbered pins sitting right on the hazard overlap.

**Say:**

> "Every hazard gets a pin at the exact spot on the map where it overlaps the lot — not just a yes/no flag."

**Do (optional, if time allows — cut this bit first if you're running long):** Go to `/parcel/0009R00156000000` (0 Crawford St). Scroll to the "Combine with an adjacent lot" card.

**Say:**

> "For lots that are too small on their own, we go one step further: we look at the real, actual neighboring parcel shapes and tell you which one to combine with to clear the minimum — not just 'this lot is too small,' but a specific answer."

---

## 5. Ask panel + Site memo (3:15 – 3:45)

**Screen:** back on `/map`, the "Ask" panel on the right side.

**Do:** Click the **first example question** in the Ask panel ("Top 3 city-owned vacant lots in Homewood for a duplex if the ADU bill passes...").

**Say (while it's answering — this one is pre-cached, so it's instant):**

> "This is a real Claude agent with tools into the same engine — not a chatbot bolted on top. It can only state numbers that its own tool calls actually returned, and every answer ends with who to confirm the result with."

**Do:** Point at the map — it should fly to and circle the three matching lots automatically.

**Do:** Navigate to any parcel report and click **"Site memo (PDF)"**.

**Say:**

> "And every lot exports as a one-page memo — score, flags, sources, ready to print or attach to an email. Notice the one flag that's on *every single lot* in this whole tool: water and sewer capacity is always marked unknown, because we never guess — you request a PWSA availability letter to actually find out."

---

## 6. Validation, limitations, close (3:45 – 4:30)

**Screen:** back to `/impact`, scroll to the **"How we know the score means something"** section.

**Say:**

> "Last question: does this score actually mean anything? We tested it against reality. We took parcels that were vacant back in 2019, scored them using *only* 2019 data, and checked which ones actually got a new home built on them since.
>
> Lots that scored 70 or higher were later built on at 1.48%, versus 0.51% for the 40-to-69 group — almost three times the rate. Ranking lots by score alone gets a rank AUC of 0.65 against a coin flip's 0.5 — a real, if modest, signal. And we report the parts that don't line up too: past building reflects market demand as well as feasibility, so we use this to test the score, not to replace it."

**Say (closing):**

> "A few honest limits: City of Pittsburgh only, no setback, height, or building-code checks, and the reform is modeled as proposed, not final law. This is decision support, never legal, financial, or zoning advice.
>
> The path forward is real: City Planning and the URA triaging public land, CDCs screening Land Bank lots, PHFA applicants pre-checking readiness before they apply. Thanks for watching."

---

## Quick-reference: every URL and parcel used

| What | URL / ID |
|---|---|
| Landing page | `https://buildready-pgh.vercel.app/` |
| Reform Impact | `https://buildready-pgh.vercel.app/impact` |
| Opportunity Map | `https://buildready-pgh.vercel.app/map` |
| Strong lot (Homewood South, City-owned, score 94→100) | `https://buildready-pgh.vercel.app/parcel/0174N00262000000` |
| Hillside lot (South Side Slopes, score 34, capped) | `https://buildready-pgh.vercel.app/parcel/0013E00051000000` |
| Compare the two above | `https://buildready-pgh.vercel.app/compare?ids=0174N00262000000,0013E00051000000` |
| Undersized lot with a real combine-with-neighbor suggestion (optional) | `https://buildready-pgh.vercel.app/parcel/0009R00156000000` |

## What's real vs. what's cached (say this honestly if asked, don't need to say it in the video itself)

- **Everything is real**, generated from actual public data: every score, flag, map pin, the Reform Impact counts, the Opportunity Map, the validation numbers, the financial snapshot, the memo export.
- **The Ask panel's example questions are pre-cached** — but the cached answers were themselves generated by the real Claude agent (not a canned script), so what you see is genuine agent output, just saved so the video doesn't depend on live network latency. Typing a brand-new question into the box calls Claude live in real time.
- **Nothing in this app is placeholder or mocked.**

## If you're running long

Cut, in this order, before shortening anything else: the optional Crawford St combine-with-neighbor bit in Section 4, then trim the neighborhood-breakdown sentence in Section 2 to just the two headline numbers.
