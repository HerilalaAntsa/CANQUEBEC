# 🏆 Ligue des Nations de Québec 2026

Application web officielle de la **Ligue des Nations de Québec (LNQ) 2026** — ligue de football amateur multiculturelle basée à Vanier et Neufchâtel, Québec.

## ✨ Fonctionnalités

- 📅 **Calendrier** — tous les matchs, filtres par journée / équipe / terrain / statut
- 🏆 **Classement** — Groupe A & Groupe B avec zones qualifiées (vert) et non qualifiées (rouge)
- 👕 **Équipes** — fiche par équipe avec roster de joueurs
- 📊 **Stats** — statistiques individuelles (à venir dès le début de saison)
- 🔍 **Recherche** — live search équipes, joueurs et matchs

## 🛠 Stack technique

| Outil | Rôle |
|---|---|
| React 18 + Vite | Framework UI + build |
| SheetJS (xlsx) | Parsing Excel côté client |
| react-router-dom | Navigation SPA |
| CSS Modules | Styles isolés par composant |
| Vercel | Déploiement |

## 📂 Données

Les données sont chargées depuis 3 fichiers Excel placés dans `/public/data/` :
- `HORAIRE_2026.xlsx` — matchs, classements
- `LISTE_GROUPE_A.xlsx` — joueurs Groupe A
- `LISTE_GROUPE_B.xlsx` — joueurs Groupe B

**Aucun backend requis** — tout est parsé en mémoire dans le navigateur.

## 🚀 Développement

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # build production
```

## 📦 Déploiement

Connecter ce repo à [vercel.com](https://vercel.com) — le fichier `vercel.json` gère les rewrites pour React Router.
