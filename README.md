# statistikas.lt

Statistikos konsultacijų svetainė lietuvių kalba, sukurta su [Quarto](https://quarto.org).

Gyva svetainė: https://alaburda.github.io/statistikas.lt

## Struktūra

```
statistikas.lt/
├── _quarto.yml         # Svetainės konfigūracija (navigacija, tema, analytics)
├── index.qmd           # Pagrindinis puslapis
├── paslaugos.qmd       # Paslaugos ir kainos
├── straipsniai.qmd     # Straipsnių sąrašas (listing)
├── about.qmd           # Apie mane
├── kontaktai.qmd       # Kontaktų forma (Formspree)
├── posts/              # Straipsniai (po vieną aplanką kiekvienam)
│   └── <slug>/<slug>.qmd
├── theme/              # custom.scss, styles.css, main.js
├── images/             # Logotipai, ikonos, nuotraukos
├── _freeze/            # Užšaldyti R skaičiavimų rezultatai (commitinama)
└── docs/               # Sugeneruota svetainė (GitHub Pages šaltinis)
```

## Darbas su svetaine

Reikalavimai: [Quarto](https://quarto.org/docs/get-started/) ir R (straipsniams su kodu; naudojami paketai: `ggplot2`, `dplyr`, `broom`, `car` ir kt.).

```bash
# Peržiūra su automatiniu perkrovimu
quarto preview

# Pilnas svetainės sugeneravimas į docs/
quarto render
```

`execute: freeze: auto` reiškia, kad R kodas perskaičiuojamas tik pakeitus patį straipsnį — `_freeze/` katalogą reikia commitinti kartu.

## Naujas straipsnis

1. Sukurkite `posts/<slug>/<slug>.qmd` su frontmatter: `title`, `description`, `date`, `author`, `categories`, `image`.
2. `quarto render` — straipsnis automatiškai atsiras straipsnių sąraše ir RSS sraute.

## Publikavimas

Svetainė talpinama per GitHub Pages iš `docs/` katalogo `master` šakoje. Publikavimas = `quarto render` + commit + push.

## Licencija

© Paulius Alaburda. Visos teisės saugomos.
