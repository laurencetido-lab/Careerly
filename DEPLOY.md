# Mettre Careerly en ligne (Render, gratuit)

Ce guide donne un lien public pour tester Careerly, sans rien installer sur votre ordinateur.

1. **Créer un compte Render** sur https://render.com, en vous connectant avec votre compte GitHub.
2. Dans Render : **New → Blueprint**, puis choisissez le dépôt `careerly`.
   Render lit le fichier `render.yaml` et crée automatiquement :
   - le site web `careerly` (offre gratuite) ;
   - la base de données PostgreSQL `careerly-db` (offre gratuite).
3. Render demande les valeurs de `TAVILY_API_KEY`, `ANTHROPIC_API_KEY` et `FIRECRAWL_API_KEY`.
   **Laissez-les vides pour un premier test.** Vous pourrez les ajouter plus tard pour activer la recherche Internet.
4. Cliquez sur **Apply**. Le premier déploiement prend environ 5 à 10 minutes.
5. Ouvrez l'adresse affichée (du type `https://careerly-xxxx.onrender.com`) et connectez-vous :
   - e-mail : `demo@careerly.app`
   - mot de passe : `careerly-demo-2026`

   Vous pouvez aussi créer votre propre compte.

## Bon à savoir sur l'offre gratuite

- Le site se met en veille après 15 minutes sans visite. Le premier chargement suivant prend environ une minute.
- La base gratuite de Render expire au bout de 30 jours. Passez à une offre payante ou à Neon pour garder les données.
- Les fichiers importés (CV, tableurs) sont effacés à chaque redémarrage. Les données en base sont conservées.
- Le compte de démo est réinitialisé à chaque nouveau déploiement.
- Pour activer la recherche en direct : Render → careerly → **Environment** → renseignez `TAVILY_API_KEY` (ou `BRAVE_SEARCH_API_KEY`) et `ANTHROPIC_API_KEY`, puis enregistrez. Le site redémarre tout seul.
