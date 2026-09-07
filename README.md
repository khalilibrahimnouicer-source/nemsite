# YNR Luxury — site neuf

Site vitrine premium + espace propriétaire.

## Déploiement Vercel

1. Importer le contenu de ce dossier dans le dépôt GitHub connecté à Vercel.
2. Dans Vercel, conserver/ajouter :
   - `OWNER_EMAIL`
   - `OWNER_PASSWORD_HASH` (bcrypt)
   - `SESSION_SECRET` (longue valeur aléatoire)
3. Le site fonctionne immédiatement avec les données de démonstration si Supabase n'est pas configuré.
4. Pour rendre la flotte et les demandes persistantes en production, configurer :
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Exécuter `supabase/migrations/002_ynr_schema.sql` dans Supabase avant d'activer ces deux variables.

## Important

Le fonctionnement public (`/api/public`) ne dépend plus de Vercel Blob. Il ne doit donc plus renvoyer le 500 provoqué par le Blob privé.

Les images peuvent être renseignées par URL dans l'espace propriétaire. Le stockage photo n'est pas une dépendance obligatoire au démarrage.

Aucun secret n'est inclus dans le projet.
