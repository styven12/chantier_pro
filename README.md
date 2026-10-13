# Chantier Pro

Progiciel local de suivi de chantier en Next.js, TypeScript et MySQL. L’interface et les routes métier sont dans le même projet Next.js; MySQL stocke les utilisateurs, chantiers, ratios, stocks, mouvements, réalisations et instantanés de prévision.

## Prérequis locaux

- WampServer démarré avec son service MySQL ou MariaDB.
- Node.js **20.9 ou plus récent** et npm. Next.js 16 utilise Node 20.9 minimum : [prérequis Next.js](https://nextjs.org/docs/app/getting-started/installation).
- Le port MySQL configuré dans WampServer (souvent 3306) disponible.

Apache n’héberge pas l’application Next.js : Next fonctionne comme un serveur Node local sur le port 3000, et se connecte au service MySQL de WampServer.

## Installation WampServer

1. Démarrer WampServer et son service MySQL/MariaDB.
2. Ouvrir phpMyAdmin depuis WampServer, choisir **Importer**, sélectionner `database/schema.sql`, puis exécuter l’import. Le script crée la base `chantier_pro` et ses tables InnoDB. Si la base existe déjà, importer à la place `database/update-project-characteristics.sql` pour ajouter les caractéristiques des chantiers sans réinitialiser les données.
3. Copier `.env.example` sous le nom `.env.local`, puis ajuster `DB_HOST`, `DB_PORT`, `DB_USER` et `DB_PASSWORD` selon votre configuration WampServer. Remplacer aussi `APP_SESSION_SECRET` par une chaîne aléatoire d’au moins 32 caractères.
4. Depuis le dossier du projet, ouvrir un terminal et exécuter :

   ```powershell
   npm install
   npm run seed
   npm run dev
   ```

5. Ouvrir [http://localhost:3000](http://localhost:3000).

`npm run seed` crée ou actualise quatre comptes de démonstration, **10 chantiers**, **19 matériaux** et **200 tâches planifiées**. Le catalogue couvre la préparation du terrain, le gros œuvre, la maçonnerie, les enduits, les sols, la peinture, la couverture et des réseaux simples. Chaque chantier comprend une référence, un type d’ouvrage, une localisation, une surface, un nombre de niveaux, un budget indicatif et une description. Les tâches et ratios sont adaptés à la surface déclarée. Le script peut être relancé : il actualise les caractéristiques et ratios sans créer de doublons. Les codes ci-dessous sont réservés aux essais locaux; changez-les avant tout usage partagé.

Les projets couvrent logements, école, centre de santé, entrepôt, commerce, atelier et marché dans plusieurs villes du Sénégal. Les quantités et ratios ajoutés au-delà des lignes lisibles du classeur sont des hypothèses de démonstration, destinées à alimenter l’interface; validez-les avec vos études réelles avant de les utiliser pour des décisions de chantier.

| Nom / identifiant | Rôle | Code local |
|---|---|---:|
| Awa Ndiaye / `ingenieur` | Ingénieur | `123456` |
| Moussa Diop / `ressources` | Responsable des ressources | `234567` |
| Ibrahima Sarr / `chantier` | Responsable de chantier | `345678` |
| Fatou Ba / `analyste` | Administrateur analytique | `456789` |

## Profils et droits

- **Ingénieur** : créer, modifier et archiver des chantiers et des tâches; configurer les quantités d’étude, échéances et ratios de matériaux par unité d’ouvrage.
- **Responsable des ressources** : ajouter, modifier et archiver les matériaux; enregistrer le stock et le seuil minimum. Chaque correction de stock crée un mouvement historisé.
- **Responsable de chantier** : choisir une tâche publiée, enregistrer la quantité réalisée, son avancement et les consommations réellement constatées. La validation verrouille et débite les stocks dans la même transaction MySQL; une insuffisance annule toute la saisie.
- **Administrateur analytique** : accès réservé au tableau analytique; aucun accès aux écrans opérationnels ni à leurs API.

Les droits sont contrôlés par les routes côté serveur, en plus de l’affichage adapté au profil. Les codes d’accès sont hachés en base et la session est conservée dans un cookie HTTP-only signé.

## Prévisions et limites

Les ratios initiaux reprennent les lignes interprétables du classeur fourni : béton de propreté, béton armé des semelles à 350 kg/m³ et maçonnerie en agglos 20 × 20 × 40. Pour la maçonnerie, la marge de 5 % du classeur est incluse dans le ratio de blocs. Les ratios d’enduit et de dallage servent à compléter les exemples et doivent être validés par l’ingénieur. Les tâches et ratios sont modifiables par l’ingénieur. Les niveaux de stock initiaux sont des valeurs de démonstration tirées du tableau de suivi, et les seuils de réapprovisionnement sont des exemples à régler par le responsable des ressources avant un usage réel.

Le tableau analytique présente trois approches indicatives :

- **Logistique** : score sigmoïde basé sur le retard lorsque les dates sont renseignées et sur l’écart moyen des consommations réelles par rapport aux ratios.
- **Normale** : probabilité d’achever le restant avant l’échéance (ou dans les sept prochains jours sans échéance), estimée à partir de la moyenne et de la variabilité des productions journalières observées.
- **Uniforme** : approximation à partir de la cadence minimale et maximale observée par jour. Elle n’est affichée qu’avec au moins deux journées de production.

Les points de prévision sont enregistrés à chaque rapport. Après sept jours, l’analytique compare le pourcentage prévu à sept jours au pourcentage courant et affiche l’écart. Les données source ne suffisent pas à calibrer un modèle statistique entraîné : les probabilités sont exploratoires, les jours de relevés trop peu nombreux sont signalés et elles ne doivent pas remplacer l’avis du conducteur de travaux.

## Structure

- `src/app` : pages et routes HTTP Next.js.
- `src/lib` : connexion MySQL, session, validation et fonctions prédictives.
- `database/schema.sql` : schéma relationnel pour MySQL/MariaDB.
- `database/seed.ts` : comptes et données de démonstration.
- `.env.example` : paramètres de connexion locale à recopier dans `.env.local`.
