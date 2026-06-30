# Hård-vundne læringer (knockout, football-data, scoring, drift)

> Skrevet efter en intensiv fejlretnings- og udvidelsesperiode (29.–30. juni 2026).
> Dokumentet er **portabelt**: principperne gælder enhver kopi af denne kodebase
> (fx Tour de France-spillet, der blev forket 26/6). Hvert afsnit siger hvad der
> gik galt, hvorfor, og hvordan det blev løst — så du kan tage rettelsen med dig.

Indhold:
1. [football-data.org v4 — score-semantik (vigtigst)](#1-football-dataorg-v4--score-semantik)
2. [Knockout: tip måles på ORDINÆR tid (90 min + tillægstid)](#2-knockout-ordinær-tid)
3. [Selvhelbredelse uden API-kald (rate-limit-sikker)](#3-selvhelbredelse-uden-api-kald)
4. ["Hvem går videre" + automatisk fra afgørende tip + halvgardering](#4-hvem-går-videre)
5. [Genberegning efter regelændringer (backfill)](#5-genberegning-efter-regelændringer)
6. [Knockout-import: rør aldrig spillede/låste kampe](#6-knockout-import)
7. [Drift: Gen2-IAM, App Check, deploy-409, Firestore merge, rate-limits](#7-drift)
8. [Admin-værktøjer vi byggede](#8-admin-værktøjer)
9. [Tjekliste til at portere til et andet spil](#9-portering-tjekliste)

---

## 1. football-data.org v4 — score-semantik

Den dyreste fejl kom af forkerte antagelser om `score`-objektet. **Bekræft mod din
egen tier** (vores Rådata-værktøj, afsnit 8, viser det live pr. kamp):

| Felt | Betydning (vores tier) |
|---|---|
| `score.winner` | `HOME_TEAM` / `AWAY_TEAM` / `DRAW` — ved straffespark peger den på **den der gik videre** |
| `score.duration` | `REGULAR` / `EXTRA_TIME` / `PENALTY_SHOOTOUT` |
| `score.halfTime` | stilling ved pausen |
| `score.regularTime` | stilling efter 90 min (+ tillægstid) — findes når kampen gik i forlænget tid |
| `score.fullTime` | **OBS:** kan INDEHOLDE straffesparkene! En 1-1-kamp afgjort 2-3 på straffe stod som `fullTime: 3-4`. **Brug ALDRIG `fullTime` som 90-min-resultat for knockout.** |
| `score.extraTime` | mål scoret KUN i forlænget tid (0-0 hvis ingen) |
| `score.penalties` | mål i straffesparkskonkurrencen |

**Mål-tidslinjen** (`/matches/{id}` → `goals[]`) er den pålidelige kilde til 90-min:
- `minute` = spilleminuttet; **tillægstid ligger i `injuryTime`**, så `minute` forbliver
  45/90 (et 90+1-mål har `minute: 90, injuryTime: 1`). Det betyder: filtrér på
  `minute <= 90` for "90 min + tillægstid", og `minute > 90` er forlænget tid.
- Straffesparkskonkurrencens "mål" har typisk `minute: null` → skal ignoreres.
- `side` ('home'/'away') udledes af `team.id` mod `homeTeam.id`/`awayTeam.id`.

➡️ **Lære:** Til knockout-90-min, tæl mål fra tidslinjen (minut 1..90 med kendt side).
Fald ALDRIG tilbage på `fullTime`. Se `functions/footballData.js: regularTimeScore`.

---

## 2. Knockout: ordinær tid

Tip på knockout-kampe måles på **90 min + tillægstid** — forlænget tid og straffespark
tæller ikke i selve resultatet (man gætter i stedet "hvem går videre").

- `regularTimeScore(goals)` — tæller mål i minut 1..90 med kendt side.
- `knockoutNinetyResult(score, goals)` — wrapper: bruger tidslinjen; guard mod at
  skrive et forkert 0-0 når detaljerne endnu ikke er hentet (tom tidslinje + fullTime>0 → `null`).
- UI viser flashscore-stil: 90-min som hovedscore + "efter forl. spilletid" + "str. X–Y".
- Regressionstest med den FAKTISKE football-data-form (fullTime inkl. straffe) i
  `functions/pipeline.integration.test.js` — så fejlen ikke kan snige sig ind igen.

**Hvorfor 1105 tests ikke fangede det:** integrationstesten for straffespark brugte en
fixture hvor `fullTime` var 90-min-resultatet. I virkeligheden inkluderede `fullTime`
straffene. **Lære: integrations-fixtures skal matche den RIGTIGE API-form, ikke en
optimistisk antagelse.**

---

## 3. Selvhelbredelse uden API-kald

football-datas gratis-tier har en stram rate-limit (≈10 kald/min). Da hele
1/16-runden blev spillet samtidig, blev detalje-synken **dræbt midt i en
rate-limit-ventetid** (default-timeout 60s) og nåede aldrig at gemme målene.
Uden gemte mål kunne intet rette resultatet.

Løsninger (alle relevante for ethvert football-data-spil):
- **Ret fra GEMTE data, ikke live:** `healedKnockoutResult(match)` (i `resultsSync.js`)
  udleder 90-min + "videre" fra de allerede gemte `details.goals` + `details.penalties`
  — **uden et eneste API-kald**. Kører i en skemalagt funktion (`healKnockoutResults`,
  hvert 5. min) + forrest i detalje-synken + i den manuelle knap. Idempotent.
- **Lad synken overleve rate-limit:** `syncMatchDetails` fik `timeoutSeconds: 150` og
  kører hvert 3. min, så den kan vente kvoten ud i stedet for at blive dræbt.
- **Prioritér det vigtige:** heal-sweepet henter først de afsluttede knockout-kampe der
  MANGLER gemte mål.
- **Versioneret gate:** `koSyncVersion` på kampen. Bumpes når logikken ændres, så
  afsluttede kampe gennemgås på ny (en boolesk "verified"-flag kan ikke det).

➡️ **Lære:** Beregn af gemte data når du kan; behandl det eksterne API som upålideligt.

---

## 4. "Hvem går videre"

- **Kanonisk advance:** sæt `result.advance` til holdkoden udledt af `score.winner`
  (`winnerToCode`), så den ALTID matcher spillernes valg (gemt som holdkode). Et manuelt
  indtastet/forkert/manglende advance kostede ellers spillerne deres 2 point.
- **Automatisk fra afgørende tip:** tipper man en sejr (ikke uafgjort) uden selv at vælge
  "videre", godskrives vinderen automatisk. Implementeret i scoring (`betAdvance(bet, match)`
  + `scoreKnockout(bet, result, match)`), **bagudkompatibelt** (uden `match` = gammel adfærd).
- **Halvgardering bevares:** tipper man fx 2-1 til Tyskland men vælger Paraguay videre
  (bevidst valg om max 5 point), gælder det eksplicite valg altid over det automatiske.
- **Uafgjort tip uden eget valg** giver intet automatisk → man skal selv pege på hvem der
  vinder på straffe.

➡️ **Lære:** Udled afledte point fra eksisterende tips, men lad et eksplicit valg vinde —
og lås reglen med tests (auto, uafgjort, halvgardering).

---

## 5. Genberegning efter regelændringer

Da scoring-reglerne ændrede sig (auto-advance), var **gemte `bet.points`** på allerede
afsluttede kampe forældede — stillingen ("Kampe"-total) var bagud ift. den live-beregnede
pointhøst.

- `recomputeBetsForMatch(db, matchId, match)` — fælles genberegning (bruges af både
  `recomputeMatch`-triggeren og backfillen; skriver kun ved ændring).
- `recomputeAllPointsNow` (admin-callable) + knap **"♻️ Genberegn alle point"** —
  engangs-backfill der bringer alle gemte point i overensstemmelse med de nye regler.

➡️ **Lære:** Når en scoring-regel ændres, så husk at de DENORMALISEREDE point skal
genberegnes — ellers divergerer "live beregnet" og "gemt total".

---

## 6. Knockout-import

`buildDesiredKnockout` sætter altid `status: 'scheduled'`. `differs()` sammenlignede
`status`, så **enhver afsluttet knockout-kamp blev evigt flagget til "opdater"** — og
"Anvend ændringer" ville sætte spillede kampe tilbage til "scheduled" (og genåbne manuelt
rettede), hvilket bryder stillingen (filtrerer på `status === 'finished'`).

Rettelse: `reconcileKnockout` beskytter nu **spillede/låste** kampe (`result`,
`manualLock`, status `finished`/`live`): de hverken opdateres eller slettes. Importen
rører kun kampe der endnu ikke er spillet.

➡️ **Lære:** En "afstem mod ekstern kilde"-import skal ALDRIG kunne rulle spillede
resultater eller manuelle rettelser tilbage. Beskyt dem eksplicit.

---

## 7. Drift

- **Gen2-callables kræver invoker-IAM:** en `onCall`-funktion er ikke kaldbar fra browseren
  uden `allUsers` + `roles/run.invoker` på dens Cloud Run-service. **Hvert `firebase deploy`
  nulstiller bindingen** (org-policy). `deploy.yml` sætter den derfor selv efter hvert
  functions-deploy for en hardcoded liste af callables (og fjerner den fra alt andet —
  skemalagte/trigger-funktioner skal forblive private). **Når du tilføjer en ny callable,
  så tilføj dens lowercase-navn til `CALLABLES`-listen.**
- **App Check 400 (reCAPTCHA Enterprise)** i konsollen er **harmløs støj** her: ingen af
  vores funktioner håndhæver App Check, så callables går igennem uden token. Symptom:
  `exchangeRecaptchaEnterpriseToken ... 400`. Ikke relateret til CORS/funktionsfejl.
- **Deploy-409 maskerede gammel kode:** Gen2 serialiserer operationer pr. funktion. Under
  samtidige deploys (eller en fastlåst operation) fejler en funktions opdatering med
  `409, unable to queue the operation`, mens `firebase deploy` stadig ender exit 0.
  Vores deploy-script behandlede det som "delvis fejl → fortsæt" og rapporterede **grønt
  flueben mens funktionen kørte gammel kode.** Rettelse (i `deploy.yml`): længere backoff
  (60s/120s, så 409 kan dræne) **og fejl synligt** (`exit 1`) når en funktion stadig ikke
  kunne opdateres efter alle forsøg. Workaround når det sker: vent ~10-15 min til
  operationen er drænet, og kør så ÉT enkelt-funktions-deploy (`onlyFunction`).
- **Firestore `set(data, {merge:true})` deep-merger nested maps** (modsat `update()` med
  dotted path, der erstatter). Skriver du `result: {home, away}` med merge, bevares et
  eksisterende `result.advance`. Godt at vide når man patcher dele af et map.
- **Rate-limits:** klienten i `footballData.js` læser rate-limit-headerne og throttler selv.
  Kombinér ikke flere tunge synk-funktioner uden at tænke på den samlede kvote.

---

## 8. Admin-værktøjer

Byg diagnostik FØR du gætter på produktionsdata:
- **🔎 Rådata** (`inspectMatchRaw`): viser pr. kamp den præcise football-data (score-opdeling
  + mål-tidslinje), hvad VI udleder (90-min + videre), de GEMTE detaljer, og en ét-klik
  **"Ret resultat til X–Y"** (skriver det udledte resultat; `timeoutSeconds: 120` så den kan
  vente rate-limit ud). Uvurderlig til at se "live vs gemt vs udledt" på én skærm.
- **🏆 Puljevindere** (`GroupWinnerDerivedTab` + `awardDerivedGroupWinnersNow`): udleder hver
  spillers gruppevinder fra deres 6 kamp-tips og kan **tilskrive bonus** — men KUN til dem
  der ramte OG ikke selv har svaret (overskriver aldrig et eksisterende svar; afledt svar
  markeres `derived: true`). Forhåndsvis (dry-run) før du skriver.
- **Udfoldelig pointhøst** i stillingen: klik på en spiller for at se alle kampe de fik point
  i, med point-type (Eksakt/Målforskel/Vinder/Videre).

---

## 9. Portering-tjekliste

Når du tager noget af ovenstående med til et andet spil (fx Tour de France-forken):

1. **Verificér først score-semantikken** for din sport/turnering med et Rådata-lignende
   værktøj — antag ALDRIG at "fuldtid" = det du vil score på.
2. **Score af gemte data, ikke live** — byg en `healed…`-funktion + en versioneret gate
   (`…SyncVersion`) så regelændringer kan genafspilles.
3. **Tilføj nye callables til `CALLABLES`-listen i `deploy.yml`** (ellers CORS).
4. **Genberegn denormaliserede point** efter enhver scoring-regelændring.
5. **Beskyt spillede/låste data** mod enhver "afstem mod ekstern kilde"-import.
6. **Stol ikke på et grønt deploy-flueben** alene — sørg for at deploy fejler synligt
   ved fastlåste funktioner (se `deploy.yml: deploy_once`).
7. **Skriv integrationstests med den RIGTIGE eksterne API-form**, ikke en optimistisk fixture.
</content>
