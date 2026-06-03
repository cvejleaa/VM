# Firebase-opsætning & deploy

Trin-for-trin guide til at oprette Firebase-projektet fra bunden og koble det
til frontenden på `vm.vejleaa.dk`. Du behøver ikke kunne kode for at følge den.

---

## 0. Forudsætninger
- En Google-konto (`cvejleaa@gmail.com`).
- Node.js 20+ installeret lokalt (kun hvis du selv vil deploye fra din maskine).
- Firebase CLI:
  ```bash
  npm install -g firebase-tools
  firebase login
  ```

---

## 1. Opret Firebase-projekt
1. Gå til <https://console.firebase.google.com> → **Tilføj projekt**.
2. Navngiv det fx `vm2026-tip`. Slå Google Analytics fra (ikke nødvendigt).
3. Når projektet er oprettet, notér **projekt-ID'et** (fx `vm2026-tip`).

---

## 2. Slå Authentication til (email/adgangskode)
1. I venstremenuen: **Build → Authentication → Kom i gang**.
2. Fanen **Sign-in method** → aktivér **Email/adgangskode**. (Lad
   "email link" være slået fra.)
3. Under **Settings → Authorized domains**: tilføj `vm.vejleaa.dk`
   (og behold `localhost`).

---

## 3. Opret Firestore-database
1. **Build → Firestore Database → Opret database**.
2. Vælg **Production mode** (vi har egne security rules).
3. Vælg lokation **eur3 (europe-west)** — tæt på Danmark.

---

## 4. Registrér web-appen og hent konfigurationen
1. **Projektindstillinger (tandhjul) → Generelt → Dine apps → Web (</>)**.
2. Kald den `vm2026-web`. (Du behøver IKKE slå Firebase Hosting til her endnu.)
3. Kopiér værdierne fra `firebaseConfig` ind i en `.env`-fil i projektroden
   (kopiér fra `.env.example`):
   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=vm2026-tip.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=vm2026-tip
   VITE_FIREBASE_STORAGE_BUCKET=vm2026-tip.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   VITE_OWNER_EMAIL=cvejleaa@gmail.com
   ```
   > Disse værdier er offentlige (de ligger i den byggede frontend) — det er
   > security rules der beskytter data, ikke nøglerne. Læg dem ALDRIG som
   > hemmeligheder, men commit heller ikke din `.env`.

---

## 5. Knyt projektet til koden
```bash
cp .firebaserc.example .firebaserc       # og indsæt dit projekt-ID
```
eller kør `firebase use --add` og vælg projektet.

---

## 6. Deploy security rules, indexes og functions
```bash
npm install
firebase deploy --only firestore:rules,firestore:indexes
cd functions && npm install && cd ..
firebase deploy --only functions
```
> Cloud Functions kræver **Blaze (pay-as-you-go)**-abonnement. For et
> tippespil med få hundrede brugere er forbruget reelt gratis (godt under
> gratis-grænserne), men kortet skal være registreret. Sæt evt. et
> budget-alarm på 1 kr. for en sikkerheds skyld.

---

## 6b. (Anbefalet) Automatisk deploy via GitHub Actions
I stedet for at deploye fra din egen maskine kan du lade GitHub gøre det. Så
slipper du for at installere noget lokalt.

1. **Lav en service-account-nøgle:** Firebase Console → **Projektindstillinger →
   Tjenestekonti → Generér ny privat nøgle**. Du får en JSON-fil.
2. **Giv nøglen de rette rettigheder** (vigtigt — ellers fejler deploy med
   `403 Permission denied`). Standard-nøglen må kun læse/skrive data, ikke
   deploye. Gå til **Google Cloud Console → IAM & Admin → IAM**
   (<https://console.cloud.google.com/iam-admin/iam?project=vm2026-tip>), find
   service-kontoen (`firebase-adminsdk-…@vm2026-tip.iam.gserviceaccount.com`),
   klik **rediger (blyant)** og tilføj disse roller:
   - **Firebase Admin** (`roles/firebase.admin`) — hosting, rules, indexes
   - **Service Usage Consumer** (`roles/serviceusage.serviceUsageConsumer`) — så CLI'en må tjekke API'er
   - *(kun til functions, kræver Blaze)* **Cloud Functions Admin**,
     **Service Account User** og **Artifact Registry Administrator**

   > Hurtig genvej (mindre restriktiv): giv i stedet rollen **Editor** +
   > **Firebase Admin**. Det virker til alt, men er bredere adgang.
3. **Læg nøglen som repo-secret:** GitHub → repoet → **Settings → Secrets and
   variables → Actions → New repository secret**. Navn:
   `FIREBASE_SERVICE_ACCOUNT`. Værdi: indsæt **hele indholdet** af JSON-filen.
   > Denne nøgle er hemmelig — læg den ALDRIG i koden, kun som GitHub-secret.
4. **Kør deploy:** GitHub → fanen **Actions → "Deploy til Firebase" → Run
   workflow**. Vælg:
   - `hosting-rules` — frontend + security rules + indexes (virker på gratis
     Spark-plan). **Start med denne.**
   - `functions` eller `all` — kræver **Blaze-plan** (se trin 6).
   - Sæt **seed = true** første gang for samtidig at indlæse alle kampe.

Workflowen deployer kun når du selv trykker — intet sker automatisk ved push.

## 7. Indlæs kampene (seed)
Kør seed-scriptet for at lægge alle gruppespilskampe + bonus-spørgsmål ind.

**Mod produktion** (kræver en service-account nøgle):
1. **Projektindstillinger → Tjenestekonti → Generér ny privat nøgle** →
   gem som `serviceAccount.json` i projektroden (den er git-ignoreret).
2. ```bash
   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json npm run seed
   ```

**Mod den lokale emulator** (til test):
```bash
npm run emulators           # i én terminal
# i en anden terminal:
FIRESTORE_EMULATOR_HOST=localhost:8080 npm run seed
```

---

## 8. Gør dig selv til ejer (owner)
1. Opret en bruger på sitet med `cvejleaa@gmail.com`.
2. Cloud Function `onUserCreate` genkender owner-emailen og sætter automatisk
   din rolle til **owner** + status **approved**.
   - Hvis du seedede før du oprettede kontoen, kan du i stedet manuelt sætte
     `role: "owner"` og `status: "approved"` på dit `users/{uid}`-dokument i
     Firestore-konsollen.
3. Herefter kan du i **Admin → Brugere** godkende andre og udnævne kamp-admins.

---

## 9. Byg og hostér frontenden på vm.vejleaa.dk
Du har to muligheder:

### A) Firebase Hosting (nemmest, gratis SSL, custom domæne)
```bash
npm run build
firebase deploy --only hosting
```
Tilføj derefter dit domæne i **Hosting → Tilføj brugerdefineret domæne →**
`vm.vejleaa.dk`, og opret de DNS-records (A/TXT) Firebase viser hos din
udbyder af `vejleaa.dk`. SSL klares automatisk.

### B) Din egen webserver
Kør `npm run build` og upload indholdet af `dist/` til den mappe `vm.vejleaa.dk`
peger på. Vigtigt: konfigurér serveren til at sende alle ukendte stier til
`index.html` (SPA-fallback), ellers virker direkte links/refresh ikke.

---

## 10. Løbende drift
- **Indtast resultater** i Admin efter hver kamp → point beregnes automatisk af
  Cloud Functions.
- Når gruppespillet er slut: tryk **"Byg slutspil"** i Admin → knockout-kampene
  får de rigtige hold, og spillerne kan tippe på dem.
- **Sæt bonus-facit** (topscorer/gruppevindere) når de er afgjort.

Se [admin-guide.md](admin-guide.md) for den daglige brug.
