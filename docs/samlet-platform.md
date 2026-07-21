# Samlet tippeplatform på tip.vejleaa.dk

VM-tippen og Tour-tippen samles i én platform på `tip.vejleaa.dk`, hvor en
spiller opretter sig **én gang** og derefter vælger, hvilke spil de vil se
eller deltage i. Fremtidige spil oprettes som data — ikke som nye apps.

**Besluttet:** Migreringen venter til begge sommerens spil er afsluttet
(VM slutter 19/7, Tour slutter 26/7 2026); forberedelsen sker nu.

Den fulde plan — målarkitektur, datamodel (`games/{gameId}`), ejer-tjekliste og
migreringsplan — vedligeholdes i tour-repoet:

**`cvejleaa/tour` → `docs/samlet-platform.md`**

## Hvad det betyder for dette repo

- Den fælles platform bygger på tour-motoren (nyeste udgave af den fælles
  motor). Fodbold-domænet herfra (kampe, runder, knockout-progression,
  VM-scoring, `FOOTBALL_DATA_TOKEN`-synk) portes til platformen som et
  spil-modul af typen `football`.
- Efter migreringen lever dette spils data videre som `games/vm2026/…` i det
  nye Firebase-projekt, og `vm.vejleaa.dk` redirecter til
  `tip.vejleaa.dk/spil/vm2026`.
- Indtil VM 2026 er afsluttet, ændres der **intet** i dette repo eller i det
  kørende `vm2026-tip`-projekt.
