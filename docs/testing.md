# Testplan & testrapport

Al kode og UI testes på flere niveauer. Tests køres automatisk i CI på hvert
push/PR (se `.github/workflows/ci.yml`).

## Testpyramide

| Niveau | Værktøj | Hvad dækkes | Antal | Kræver |
|---|---|---|---:|---|
| Unit (delt logik) | Vitest | Pointberegning (`src/lib/scoring.js`) | 11 | — |
| Unit (functions) | Vitest | Autoritativ scoring + grupperangering/tiebreak | 37 | — |
| Komponent/UI | Vitest + Testing Library | Sider, formularer, hooks (Firebase mocket) | 156 | — |
| Security Rules | Vitest + `@firebase/rules-unit-testing` | Firestore-regler | 14 | Firestore-emulator |
| E2E | Playwright | UI-flows i rigtig browser | 4+ | Browser (CI) |

**Frontend unit+komponent i alt: 167 grønne. Functions: 37 grønne.**

## Sådan køres testene

```bash
# Frontend unit + komponent (167 tests)
npm test
npm run test:coverage          # med dækningsrapport (coverage/)

# Cloud Functions: scoring + standings (37 tests, ingen emulator)
cd functions && npm test

# Security Rules (14 tests) — kræver Firestore-emulator
firebase emulators:exec --only firestore "npm run test:rules"

# E2E (Playwright) — bygger appen og kører i Chromium
npx playwright install chromium     # første gang
npm run test:e2e
```

## Dækningsområder

### Pointlogik (kerne)
- Eksakt score (5), målforskel (3), udfald (2), forkert (0)
- Uafgjort-tilfælde, manglende/ugyldige data
- Knockout: advance-bonus (+2) for korrekt videregående hold
- Bonus: 10 point for korrekt svar
- Functions-spejlet (`functions/scoring.js`) testes identisk, så frontend og
  backend altid er enige.

### Grupperangering (`functions/standings.js`)
- Point (3/1/0), målforskel, scorede mål som tiebreak
- Udvælgelse af de 8 bedste 3'ere til 1/16-finalen

### Auth & Admin
- Oversættelse af Firebase-fejlkoder til danske beskeder
- Login-validering og redirect-logik
- `PendingPage` viser korrekt besked pr. status (afventer/afvist/godkendt)
- **Rolle-adgang:** Brugere-fanen er kun synlig for ejer, ikke for kamp-admin

### Tippe-UI
- `ScoreInput` validerer ikke-negative heltal
- "Er kampen låst"-logik (før/efter kickoff)
- Gruppering af kampe efter dag
- `MatchCard` viser låst-tilstand + resultat/point når afgjort
- Bonus kan ikke besvares efter deadline

### Ligaer & rangering
- `StandingsTable` sorterer korrekt og fremhæver egen række
- Generering af unik join-kode
- Filtrering af stilling til ligamedlemmer
- Beregning af dagens point

### Security Rules (emulator)
- Spiller kan **ikke** skrive `points`, `role` eller `status`
- Spiller kan **ikke** ændre egen rolle/status
- Tip kan skrives **før** kickoff, men **ikke** efter
- Kun ejer kan godkende brugere

### E2E (Playwright)
- Uautentificeret bruger sendes til login
- Login-siden viser begge faner
- Validering viser danske fejlbeskeder
- 404-side for ukendt rute
- *(Fulde authentificerede flows — signup → godkend → tip → resultat → point —
  køres mod Firebase-emulatorer; udvides i `e2e/`.)*

## CI-pipeline
`.github/workflows/ci.yml` kører fire parallelle jobs på hvert push/PR:
1. **frontend** – lint + unit/komponent-tests (med dækning) + build
2. **functions** – scoring + standings-tests
3. **rules** – Security Rules mod Firestore-emulator
4. **e2e** – Playwright i Chromium (rapport uploades som artefakt)

## Kendte begrænsninger
- Browser-baseret E2E kan ikke køres i det aktuelle udviklingsmiljø (netværks-
  begrænsning på browser-download); det køres i CI hvor netværk er tilgængeligt.
- Dybe authentificerede E2E-flows kræver kørende emulatorer + seedet data.
