# YNR Pro Rent

Site vitrine premium + espace d'administration privé pour une activité de location de véhicules.

## Ce qui est inclus

- Frontend automobile premium, responsive desktop/tablette/mobile.
- Hero visuel utilisant les photos de véhicules existantes.
- Présentation éditoriale, flotte, expérience, différenciation, processus, FAQ et réservation.
- Formulaire de demande connecté à l'API existante.
- Footer public sans lien Admin.
- `/admin` protégé par session serveur.
- Dashboard administrateur.
- CRUD véhicules.
- Upload de photos via Vercel Blob existant.
- Gestion des demandes et statuts.
- Gestion des dates indisponibles.
- Réglages publics.
- Login avec affichage/masquage du mot de passe.
- Protection contre les tentatives de connexion répétées.

## Services conservés

Le projet conserve son backend Express et son stockage Vercel Blob déjà présents dans le ZIP d'origine. Aucune seconde base de données ou seconde authentification n'a été ajoutée.

## Configuration production

Les secrets ne sont volontairement pas inclus dans le dépôt.

Variables serveur à configurer dans Vercel :

- `OWNER_EMAIL=ynr.location@gmail.com`
- `OWNER_PASSWORD_HASH=<hash bcrypt du mot de passe administrateur>`
- `SESSION_SECRET=<chaîne aléatoire longue>`
- `BLOB_READ_WRITE_TOKEN=<token Vercel Blob existant>`

Pour générer un hash bcrypt localement :

```bash
node scripts/hash-password.mjs "votre-mot-de-passe"
```

Copiez uniquement le résultat dans `OWNER_PASSWORD_HASH` dans les variables d'environnement de production.

Ne mettez jamais le mot de passe en clair dans le code, GitHub, le frontend ou `localStorage`.

## Développement

```bash
npm install
npm run dev
```

Le serveur API écoute par défaut sur `8787` et Vite sert le frontend.

## Build

```bash
npm run build
```

Le dossier de sortie est `dist`.
