# BuildReady PGH — Demo Video Script

**File to record from: this file, `DEMO_SCRIPT.md`.**
**Target length: 4:30. Hard ceiling: 5:00 (hackathon rule).**
**Format: one continuous voiceover over a screen recording of the real, live app. No slides.**

This is written for whoever is recording (Derek) to follow directly — it assumes no prior familiarity with the codebase. Every line in quotes is meant to be read close to word-for-word; the stage directions above each line say exactly what to click first.

**Timing:** the narration is ~515 words (~545 with the one optional bit included). At a careful, unhurried pace (110–130 words/minute — a realistic pace for someone reading unfamiliar parcel IDs and jargon aloud for the first time) that's **about 4:00–4:30**, with real slack left over for clicks, page loads, and pauses. That's a calculation, not a guarantee: **do one full read-aloud rehearsal with a stopwatch before your real take.** If it still runs long, see "If you're running long" at the bottom.

---

## 0. Before you hit record

**Use the live site, not a local build** — one less thing that can go wrong on camera:
> **https://buildready-pgh.vercel.app**

- Open it in **Chrome or Edge, one window, 1440×900 or larger** (a laptop screen at normal size is fine — don't maximize to an ultrawide, some layouts assume a laptop width).
- Use an **Incognito/InPrivate window** — no bookmarks bar, no extension icons, no autofill popups on screen.
- Do **one full click-through of every section below before recording**, so the map tiles and data are warm and nothing has a first-load stutter on camera.
- Turn off notifications (Slack, email, OS banners).
- **Do not open**: `.env.local`, any terminal with environment variables printed, or the Vercel dashboard's Environment Variables page. If any of those are open in another tab, close them before you start — a stray API key on screen is the one thing that can't be edited out after the fact.

**You do not need one unbroken take.** Record each of the 6 sections below as its own separate clip (stop and restart between them), then stitch them together in iMovie / CapCut / Premiere / DaVinci with a hard cut or a quick fade. If you flub a line, just redo that one clip.

Fill in your own names/team name wherever you see `[ ... ]` — don't guess, say your real names when you record.

---

## 1. Hook (target ~0:25)

**Screen:** the landing page, `https://buildready-pgh.vercel.app/`

**Do:** Let the page sit still for a few seconds, then scroll slowly past the example cards as you talk.

**Say (69 words):**

> "Hi, we're `[your name]` and `[Derek]` — this is BuildReady PGH, for the AI for Housing Hackathon, Track 1.
>
> Building in Pittsburgh gets slowed by one question: can I build here, what's blocking it, who do I ask? Those answers are scattered across zoning PDFs, hazard maps, and property records.
>
> BuildReady PGH puts them in one place — a Development Ease Score for any city parcel, sourced down to every number."

---

## 2. Reform Impact (target ~0:35)

**Screen:** click **"Reform impact"** in the top nav → `/impact`

**Say (77 words):**

> "The city just changed its zoning rules, and we can measure what that unlocked.
>
> Since Bill 2025-1579 took effect last May, **21,005 residential lots** no longer need a lot-size variance.
>
> A second bill, Bill 2025-1545, is still proposed, not law — if it passes, up to **118,800 more lots** gain the right to add a small second home, an ADU, without a special hearing.
>
> We break both down by neighborhood, from the same engine that scores every lot."

**Do (while you say that last line):** Scroll down to the two neighborhood bar charts.

---

## 3. Opportunity Map (target ~0:20)

**Screen:** click **"Opportunity map"** in the top nav → `/map`

**Say (34 words):**

> "This is the Opportunity Map — 13,211 vacant lots owned by the City, URA, Housing Authority, or County, scored green, amber, or red.
>
> Let's open one of the strongest: 0 Tioga Street, in Homewood South."

**Do:** Check the **"Starter-home ready"** box in the left panel as you say the first sentence. Then — **don't rely on whatever's on top of the list** (several lots tie at the same score, so the top entry isn't always the same one) — just type the address into the homepage search box, or open this URL directly in the same tab:
`https://buildready-pgh.vercel.app/parcel/0174N00262000000`

---

## 4. Lot Report — the core product (target ~1:10)

**Screen:** `/parcel/0174N00262000000` (0 Tioga St)

**Say (34 words):**

> "Zoning R1A-VH, City-owned, inside the transit buffer — housing's allowed here by right, and right at the top is a real financial snapshot from the county's own records, labeled as exactly that, not an estimate."

**Do:** Point at the valuation strip, then scroll to the "Bottom line" card.

**Say (22 words):**

> "Instead of ten flag cards, we write the bottom line first — the biggest barriers, and who to call next."

**Do:** Click the **"Current code" / "Proposed (Bill 2025-1545)"** toggle.

**Say (24 words):**

> "Flip this toggle to the proposed reform: the score updates live, 94 up to 100 — always labeled proposed, never as if it were law."

**Do:** Switch back to "Current code." Open this URL in the same tab: `https://buildready-pgh.vercel.app/parcel/0013E00051000000`

**Say (38 words):**

> "Now a very different lot: 1817 Saint Patrick Street, on a hillside. It scores 34 — 100% steep slope, 100% landslide-prone, 98.9% undermined by old mines, all needing a geotechnical review, and its zoning only allows housing by exception."

**Do:** Point at the amber numbered pins on the map, sitting right on the hazard overlap.

**Say (11 words):**

> "Every hazard gets a pin right where it overlaps the lot."

**Do (optional — cut this first if you're running long):** Open `https://buildready-pgh.vercel.app/parcel/0009R00156000000` (0 Crawford St) and scroll to "Combine with an adjacent lot."

**Say (optional, 27 words):**

> "For lots too small on their own, we look at the real neighboring parcel shapes and tell you exactly which one to combine with to clear the minimum."

---

## 5. Ask panel + Site memo (target ~0:25)

**Screen:** go to `/map`. The "Ask" panel is on the right.

**Do:** Click the **first example question** — its exact text is: *"Top 3 city-owned vacant lots in Homewood for a duplex if the ADU bill passes, and what is blocking them."*

**Say (34 words, while it answers — this one is pre-cached, so it's instant):**

> "This is a real Claude agent with tools into the engine, not a chatbot on top — it can only state numbers its tool calls returned, and every answer ends with who to confirm with."

**Do:** Point at the map — it flies to and circles the three matching lots automatically. Then open any parcel and click **"Site memo (PDF)"**.

**Say (32 words):**

> "Every lot also exports as a one-page memo. And notice this flag on every lot: water and sewer is always unknown — we never guess, you request a PWSA letter to find out."

---

## 6. Validation, limitations, close (target ~0:35)

**Screen:** back to `/impact`, scroll to **"How we know the score means something."**

**Say (83 words):**

> "Last question: does this score mean anything? We tested it against reality — scored parcels vacant in 2019 using only 2019 data, and checked which ones later got built on.
>
> Lots scoring 70 or higher were built on at 1.48%, versus 0.51% for the 40-to-69 group — almost three times the rate, with a rank AUC of 0.65 against a coin flip's 0.5. We report what doesn't line up too: past building reflects demand as well as feasibility, so this tests the score, it doesn't replace it."

**Say (closing, 56 words):**

> "A few honest limits: City of Pittsburgh only, no setback or building-code checks, and the reform is modeled as proposed, not final law. This is decision support, never legal, financial, or zoning advice.
>
> The path forward: City Planning and the URA triaging public land, CDCs screening Land Bank lots, PHFA applicants checking readiness. Thanks for watching."

---

## Quick-reference: every URL and parcel used

| What | URL / ID |
|---|---|
| Landing page | `https://buildready-pgh.vercel.app/` |
| Reform Impact | `https://buildready-pgh.vercel.app/impact` |
| Opportunity Map | `https://buildready-pgh.vercel.app/map` |
| Strong lot (Homewood South, City-owned, score 94→100) | `https://buildready-pgh.vercel.app/parcel/0174N00262000000` |
| Hillside lot (South Side Slopes, score 34, capped) | `https://buildready-pgh.vercel.app/parcel/0013E00051000000` |
| Undersized lot with a real combine-with-neighbor suggestion (optional) | `https://buildready-pgh.vercel.app/parcel/0009R00156000000` |

**Go straight from one lot's URL to the other's** in Section 4 (as written above) rather than using the Compare page — it's faster on camera and one less click that can miss.

## What's real vs. what's cached (say if asked — not required on camera)

- **Everything is real**: every score, flag, map pin, the Reform Impact counts, the Opportunity Map, the validation numbers, the financial snapshot, the memo export.
- **The Ask panel's example questions are pre-cached** — but those cached answers were generated by the real Claude agent, not hand-written, so what's shown is genuine agent output saved so the video doesn't depend on live network latency. Typing any other question calls Claude live.
- Nothing in this app is placeholder or mocked.

## If you're running long

Cut, in this order: (1) the optional Crawford St bit in Section 4 (saves ~15s), (2) the closing pilot-path sentence in Section 6 down to "City Planning, the URA, and CDCs" (saves ~10s), (3) the neighborhood-breakdown line in Section 2 (saves ~8s).
