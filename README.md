# m3dz_cs

Vitrine et tableau de bord de location de voitures pour la région parisienne.

## Lancer le projet

```bash
npm install
npm run dev
```

L’interface propriétaire est une démo : tout e-mail et mot de passe permettent d’y accéder. Avant une mise en ligne, remplacez les liens de contact factices dans `src/main.jsx` et connectez l’authentification, les données et l’envoi d’e-mails à un service sécurisé (par exemple Supabase + Resend).

## Déploiement

Le projet est un site Vite statique : importez le dépôt GitHub dans Vercel ou Netlify. La commande de build est `npm run build` et le dossier publié est `dist`.
