# statistikas.lt

Profesionali statistikos konsultacijų svetainė lietuvių kalba.

## Apie projektą

Tai yra moderni, responsivinė svetainė, skirta statistikos konsultavimo paslaugoms reklamuoti. Svetainė sukurta naudojant gryną HTML, CSS ir JavaScript be jokių framework'ų.

## Struktūra

```
statistikas.lt/
├── index.html          # Pagrindinis puslapis
├── css/
│   └── styles.css      # Stiliai
├── js/
│   └── main.js         # JavaScript funkcionalumas
├── images/
│   ├── favicon.svg     # Favicon
│   └── paulius.jpg     # Profilio nuotrauka (reikia pridėti)
└── README.md
```

## Funkcionalumas

- ✅ Responsiyvus dizainas (mobiliesiems, planšetėms, kompiuteriams)
- ✅ Moderni, profesionali išvaizda
- ✅ Sklandus slinkimas (smooth scrolling)
- ✅ Animuoti elementai
- ✅ Kontaktų forma
- ✅ SEO optimizuotas
- ✅ Greitas ir lengvas (be framework'ų)

## Paleidimas

Tiesiog atidarykite `index.html` naršyklėje arba naudokite lokalų serverį:

```bash
# Su Python
python -m http.server 8000

# Su Node.js (npx)
npx serve
```

## Konfigūracija

### Kontaktų forma

Kontaktų forma sukonfigūruota veikti su [Formspree](https://formspree.io/). Norėdami įjungti:

1. Užsiregistruokite Formspree
2. Sukurkite naują formą
3. Pakeiskite `your-form-id` į savo formos ID faile `index.html`:

```html
<form class="contact__form" action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
```

### Nuotraukos

Pridėkite savo profilio nuotrauką į `images/paulius.jpg`. Rekomenduojamas dydis: 800x1000 px.

### Google Analytics

Norėdami pridėti Google Analytics, įdėkite tracking kodą į `<head>` sekciją `index.html` faile.

## Deployment

Svetainę galima patalpinti bet kurioje statinių svetainių talpinimo paslaugoje:

- **GitHub Pages** (nemokama)
- **Netlify** (nemokama)
- **Vercel** (nemokama)
- **Cloudflare Pages** (nemokama)

### GitHub Pages

1. Push'inkite kodą į GitHub repozitoriją
2. Eikite į Settings > Pages
3. Source pasirinkite "Deploy from a branch"
4. Pasirinkite `main` branch ir `/root` folder
5. Svetainė bus pasiekiama per `https://username.github.io/repo-name`

### Custom Domain

Pridėkite `CNAME` failą su savo domenu:

```
statistikas.lt
```

## Licencija

© 2024 Paulius Alaburda. Visos teisės saugomos.
