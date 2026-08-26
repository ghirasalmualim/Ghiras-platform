# Privacy Policy — Ghiras Al-Muallim

> **Internal draft — v0.3 (2026-08-24) — LEGAL DRAFT READY FOR HUMAN REVIEW — not approved for publication.**
> This policy describes the platform's CURRENT REALITY. Items marked
> [LEGAL REVIEW REQUIRED] must pass legal review before publishing;
> [OWNER INPUT REQUIRED] awaits information from the platform owner;
> [PLANNED — NOT CURRENTLY IMPLEMENTED] describes future design, not
> current fact.

Last updated: [publication date]

---

## 1 · Who we are

"Ghiras Al-Muallim" is a Kuwaiti educational platform at
www.ghiras-edu.com, offering learning tools for teachers and
students, including a Holy Quran section for reading, memorisation,
review, and recitation practice.

Operating entity: [OWNER INPUT REQUIRED: the legal entity name tied
to the commercial licence — must not be published before it is
provided]

[LEGAL REVIEW REQUIRED: statutory phrasing of the entity
identification]

## 2 · Scope of this policy

This policy covers the Ghiras platform as a whole, with particular
detail on the Quran section, as it is the part that may use the
microphone and involves children's data.

[LEGAL REVIEW REQUIRED: whether the "Smart Lesson Studio" — a
service on a separate subdomain — needs separate mention or is
covered by the general scope]

## 3 · Data we collect

### a) The adult account holder (teacher or parent/guardian)
- Mobile number (used as the login identifier).
- Name.
- Email (optional — for receipts and password recovery).
- Subscription status, dates, and content permissions.
- Last-activity date and a basic sign-in log.

**Current account creation:** teachers can create their own
accounts. Student/child accounts are currently created by the
platform's administration; there is currently no self-service
flow for a parent to add their child.

[PLANNED — NOT CURRENTLY IMPLEMENTED: a flow where the parent adds
their child themselves with a documented consent step during
registration — see Section 8]

### b) The child / student
- The name and login number the account was created with.
- We do not ask children for an email, phone number, photo, or
  location.

### c) Quran-section usage data (for the account holder, adult or child)
- Recitation results: an encouragement-based level, the count of
  spots needing review, and their location (surah and verse) —
  **with no audio recording and no transcript of what was said**.
- Memorisation and review state: which passages were memorised and
  when they are due for review.
- The memorisation goal, its plan, and preferences (available days,
  plan intensity).
- "My Garden": symbolic, motivational progress (plants and drops).
- Last reading position and preferred reciter.
- A log of meaningful milestones (e.g. "a memorisation goal was
  completed") shown in "My Quran Journey".
- A daily usage counter for the recitation feature (seconds and
  request counts) to protect the service from overuse — numbers
  only.

### d) Technically necessary data
- One login-session cookie (see Section 11).
- Local storage in your browser for functional items (reading
  position and preferences).

**Visitors without an account** can read and listen freely; their
progress stays in their own browser, and we collect nothing about
them on our servers.

## 4 · Audio and the microphone ("Recite to me")

This is the most important point in our policy, stated plainly:

- The microphone activates only when you choose the recitation
  feature yourself, with your browser's permission, which you
  control.
- **We do not keep the audio recording.** The audio is processed to
  produce the recitation result and is then discarded — it is not
  stored on our servers or in our database.
- We do not store a transcript of what the reciter said.
- What remains after a recitation is the result only (Section 3-c).
- The recitation feature requires signing in; reading and listening
  are open to everyone.

[LEGAL REVIEW REQUIRED: whether children's voice data requires a
separate voice-specific consent in addition to the documented
parental consent in Section 8]

## 5 · Audio processing by an external provider

When the recitation feature is used, the audio clip is sent
temporarily to Microsoft's speech-recognition service (Azure
Speech) to convert it into words that are compared against the
Quranic text.

Exactly what is sent: the audio clip + the reference Quranic text
from our own mushaf + technical settings. **No name and no
identifier of the reciter is sent with the audio.**

The judgement on the recitation is made by Ghiras's own engine,
not by the provider; the provider's service is used for speech
conversion only.

[LEGAL REVIEW REQUIRED: wording of the disclosure regarding
processing outside Kuwait and Microsoft's contractual
data-protection commitments]

## 6 · What we do not collect or store

- No audio recordings.
- No transcripts of what the reciter said.
- No geographic location.
- No tracking, analytics, or advertising tools — **our platform
  contains no third-party trackers**.
- No device fingerprinting.
- **In our application's own database tables: we do not store IP
  addresses.**
  [INFRASTRUCTURE / PROCESSOR REVIEW REQUIRED: infrastructure
  providers (hosting and database) may process IP addresses in
  their own operational and security logs — the precise disclosure
  wording will be set after reviewing their policies; we will not
  publish an absolute promise we cannot prove]

## 7 · Why we process data

Solely to run the features you asked for: resuming your reading,
scheduling reviews, building your memorisation plan, showing your
own progress to you, and protecting the service from overuse.

**We do not sell data, share it for marketing, or show ads.**

[LEGAL REVIEW REQUIRED: naming the lawful basis of processing under
Kuwaiti law]

## 8 · Children and parental consent

We treat children's data with special care, limiting what we ask
for and use to what the service requires. The Quran section
was designed from the start with no chat, no comparisons between
users, and no user-generated content from others.

### CURRENT STATE
Children's accounts are currently created by the platform's
administration in coordination with the parent or the school.
**Account creation alone is not treated as consent** — therefore
the voice recitation feature is not made available on a child's
account before the parent's documented consent is obtained through
the mechanism adopted at launch.
[OWNER INPUT REQUIRED + LEGAL REVIEW REQUIRED: the consent
documentation mechanism for administratively created accounts — in
design before the closed pilot]

### TARGET DESIGN — PLANNED, NOT CURRENTLY IMPLEMENTED
When a parent adds their child themselves, consent will be part of
the registration flow itself: a clear declaration that they are the
parent or legally authorised guardian; consent to processing the
child's data needed to provide the service under this policy; and
an explicit disclosure of the microphone, the temporary sending of
audio for processing, the fact that recordings are not kept, and
the kinds of progress data stored. The consent will be documented
verifiably (acceptance, accepted policy version, timestamp,
consenting account identity). No fresh consent is requested on
every recitation once documented consent exists.

[LEGAL REVIEW REQUIRED: does parent-performed registration plus a
documented declaration satisfy the requirements for a minor's
consent under Kuwaiti law? And does audio processing require an
additional separate consent? — this policy does not claim the
answer before review]

## 9 · Where data is stored and for how long

Data is stored with a secured cloud database provider; periodic
backups are taken as part of the hosting plan; and each user's data
is isolated from every other user's.

- Database server region: [OWNER INPUT REQUIRED: the production
  project region as shown in the provider's console]
- Retention period after subscription ends or deletion is
  requested: [LEGAL REVIEW REQUIRED]

## 10 · Your right to deletion and correction

- A user — or a parent on behalf of their child — may request
  deletion of the account's data.
- Request channel: [OWNER INPUT REQUIRED: official contact channel]
- On deletion, the account and its associated platform data are
  removed, including Quran-section data (results, progress, plans,
  and the garden).
- The execution timeframe and any legally required exceptions:
  [LEGAL REVIEW REQUIRED — no timeframe is stated without basis]
- Correction of inaccurate data is requested via the same channel.

## 11 · Cookies and local storage

We use **one cookie**, whose job is signing you in and keeping your
session — it is necessary for accounts and is not used for
tracking.

We use your browser's local storage for functional items only: your
reading position, your preferences (such as the preferred reciter),
and a signed-out visitor's own progress.

There are no marketing, analytics, or third-party cookies.

[LEGAL REVIEW REQUIRED: confirming that no cookie-consent mechanism
is required under local law for this functional use]

## 12 · Security

- Connections to the platform are encrypted (HTTPS).
- Each user's data is isolated at the database level.
- Sensitive service keys remain on our servers and never reach the
  user's browser.
- Usage limits protect the service from abuse.
- Recitation judgements are made on our servers in a way the
  browser cannot tamper with.

[LEGAL REVIEW REQUIRED: standard warranty-limitation wording and
security-incident notification procedure]

## 13 · Third parties verified so far

- **Supabase** — database and sign-in.
- **Vercel** — platform hosting.
- **Microsoft Azure** — temporary recitation-audio processing
  (Section 5).
- **Islamic Network CDN (alquran.cloud)** — reciters' audio files,
  fetched directly by your browser when listening.
- Interface fonts are self-hosted within our platform and are not
  requested from external servers while browsing.

[Internal note: the list will be completed by a third-party
dependency audit of the rest of Ghiras before publication — it is
not described as exhaustive before that]

## 14 · Changes to this policy

For any material change we will show a notice inside the platform
and update the "Last updated" date at the top of this page.

[LEGAL REVIEW REQUIRED: the adequate notification mechanism where a
change concerns children's data]

## 15 · Contact

For any privacy question, or to request deletion or correction:

[OWNER INPUT REQUIRED: official contact channel — email and/or
number; nothing is invented before it is provided]

## 16 · Sources of the Quranic text and recitations

- The Quranic text is from the Tanzil project (verified Uthmani
  edition) under the CC BY 3.0 licence; it is never modified and
  never machine-generated — full details and the text's digital
  fingerprint are on the "Text Source" page inside the Quran
  section.
- Audio recitations are from alquran.cloud / Islamic Network;
  rights belong to the reciters or their licensors.
- The curriculum distribution plan is from the Ministry of
  Education — State of Kuwait (2025/2026); it stores no Quranic
  text — only surah and verse numbers.

[LEGAL REVIEW REQUIRED: whether reciter attribution must be shown
in the listening interface itself, or whether this section plus the
source page suffices]
