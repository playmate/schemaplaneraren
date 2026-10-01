# Schemaplaneraren

Responsiv schemaplanerare byggd med React, TypeScript och Vite. Fungerar på mobil, iPad och dator och kan installeras som PWA.

## Funktioner i MVP

- Dag-, vecka- och månadsvy
- Drag-and-drop av anställda till datum
- Sysselsättningsgrad per person
- Valbara arbetsdagar
- Standardtider och dagsunika avvikelser
- Svensk regeltext, till exempel:
  - `Anna jobbar inte fredagar`
  - `Anna slutar klockan 15 på onsdagar`
  - `Anna jobbar 80%`
- Automatisk ifyllning av synlig period
- Lokal lagring i webbläsaren
- PWA-stöd / installering på hemskärmen
- Automatisk deployment till GitHub Pages från `main`

## Krav

- Node.js 22 eller senare rekommenderas
- npm
- Git

Kontrollera:

```bash
node -v
npm -v
git --version
```

## Kör lokalt

```bash
npm install
npm run dev
```

Öppna adressen som Vite visar, normalt `http://localhost:5173`.

För att testa på mobil eller iPad på samma Wi-Fi:

```bash
npm run dev -- --host
```

Öppna sedan den nätverksadress som Vite visar, exempelvis `http://192.168.1.50:5173`.

## Bygg produktion

```bash
npm run build
npm run preview
```

Produktionsfiler hamnar i `dist/`.

## Lägg projektet på GitHub

Skapa först ett tomt GitHub-repo, exempelvis `schemaplaneraren`, utan README eller .gitignore. Kör sedan i projektmappen:

```bash
git init
git add .
git commit -m "Initial Schemaplaneraren MVP"
git branch -M main
git remote add origin https://github.com/DITT-GITHUB-NAMN/schemaplaneraren.git
git push -u origin main
```

## Publicera gratis med GitHub Pages

Projektet innehåller `.github/workflows/deploy-pages.yml`.

I GitHub:

1. Öppna repot.
2. Gå till **Settings → Pages**.
3. Under **Build and deployment**, välj **GitHub Actions** som Source.
4. Gå till **Actions** och kontrollera att `Deploy to GitHub Pages` blir grön.
5. GitHub visar därefter webbplatsens adress i Pages-inställningarna.

Varje framtida `git push` till `main` bygger och publicerar den nya versionen automatiskt.

## Alternativ: Cloudflare Pages

Samma repo kan anslutas direkt till Cloudflare Pages:

- Framework preset: **Vite**
- Build command: `npm run build`
- Build output directory: `dist`

Ingen kodändring behövs.

## Nästa utvecklingssteg

1. Arbetstidsberäkning och avtalade timmar
2. Redigering av ett enskilt arbetspass
3. Raster och flera pass per dag
4. Frånvaro / semester / sjukdom
5. Bemanningskrav per tid och dag
6. Supabase för konto, databas och synkning mellan enheter
7. Roller: admin, planerare och anställd
8. Smartare regelspråk / lokal AI via Ollama eller molnmodell
