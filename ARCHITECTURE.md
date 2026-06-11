# Architecture — Hollama Next

> Plan de référence avant le chantier « modes local / serveur ».
> Objectif : un code propre et léger, deux modes de fonctionnement à partir
> d'une **seule** base de code, sans dupliquer l'interface.

## 1. Deux modes, une seule app

| | **Mode `local`** (défaut) | **Mode `server`** |
|---|---|---|
| Public | Usage perso, frictionless | Instance partagée / self-hosted multi-utilisateurs |
| Auth | Aucune | Auth.js (login obligatoire) |
| Données | `localStorage` (navigateur) | SQLite côté serveur, par utilisateur |
| Clés API | Dans le navigateur | **Côté serveur uniquement, chiffrées** |
| Sync multi-appareils | Non | Oui (les données vivent sur le serveur) |
| Onboarding | Wizard actuel | Login → app |

Le mode est choisi **au déploiement** par une variable d'environnement :

```
PUBLIC_MODE=local      # défaut
PUBLIC_MODE=server
```

L'interface est **la même**. Seuls changent : (a) la présence d'un écran de
login, (b) la destination des lectures/écritures de données.

## 2. La clé de voûte : le Repository

Tout le code passe aujourd'hui par 4 `writable` synchronisés à `localStorage`,
**de façon synchrone**. Le serveur impose de l'**asynchrone** (fetch). On
introduit donc une abstraction unique pour absorber cette différence.

```
Composants ──► stores réactifs ──► DataRepository (interface, async)
                                     ├── LocalStorageRepository   (mode local)
                                     └── ApiRepository            (mode server → /api/data → SQLite)
```

Règle d'or : **plus aucun composant ne touche `localStorage` directement.**
(Aujourd'hui `DataManagement.svelte` et `Onboarding.svelte` le font — à corriger.)

### Interface

```ts
// src/lib/data/repository.ts
export interface DataRepository {
  load(): Promise<AppData>;                 // hydrate au démarrage
  saveSessions(s: Session[]): Promise<void>;
  saveKnowledge(k: Knowledge[]): Promise<void>;
  saveServers(s: Server[]): Promise<void>;  // serveurs perso (mode server)
  saveSettings(s: Settings): Promise<void>;
  exportBackup(): Promise<Backup>;
  importBackup(b: Backup): Promise<void>;
  resetAll(): Promise<void>;
}
```

- `LocalStorageRepository` : enveloppe l'accès `localStorage` actuel dans des
  `Promise.resolve()`. Comportement identique à aujourd'hui.
- `ApiRepository` : appelle des endpoints SvelteKit (`/api/data/*`) gardés par
  la session Auth.js.

### Stores async-ready

Les stores deviennent « chargés au démarrage » :

```ts
// au boot (layout)
const data = await repository.load();
sessionsStore.set(data.sessions);
// ... écritures : on met à jour le store ET on persiste via le repo (optimiste)
```

C'est le **gros du refactor**, et il se fait **en mode local d'abord** : à
comportement constant, sans toucher au backend.

## 3. Modèle de données (mode serveur)

**Driver : `node:sqlite` (intégré à Node 22+, donc dispo en Node 26).**
Zéro dépendance, API synchrone côté serveur, ultra-rapide. Pas d'ORM : un
schéma de ~5 tables ne le justifie pas. Migrations gérées par une petite table
`schema_migrations` + des fichiers SQL numérotés.

`sessions` et `knowledge` sont stockés en **colonnes JSON** : mêmes types
TypeScript qu'aujourd'hui, donc le Repository fait juste `JSON.parse/stringify`.
Pas de normalisation prématurée.

```sql
users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,           -- argon2/bcrypt
  role          TEXT NOT NULL,           -- 'admin' | 'user'
  profile       TEXT NOT NULL,           -- JSON: prénom, nom, avatar, couleur
  created_at    TEXT NOT NULL
)

servers (                                -- providers LLM
  id              TEXT PRIMARY KEY,
  owner_user_id   TEXT,                  -- NULL = serveur SYSTÈME (admin, partagé)
  connection_type TEXT NOT NULL,
  base_url        TEXT NOT NULL,
  api_key_enc     TEXT,                  -- chiffré au repos (jamais renvoyé au client)
  label           TEXT,
  is_enabled      INTEGER NOT NULL
)

shared_models (                          -- modèles qu'un serveur système expose aux users
  server_id   TEXT NOT NULL,
  model_name  TEXT NOT NULL,
  PRIMARY KEY (server_id, model_name)
)

sessions  ( id TEXT PRIMARY KEY, user_id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT )
knowledge ( id TEXT PRIMARY KEY, user_id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT )
settings  ( user_id TEXT PRIMARY KEY, data TEXT NOT NULL )   -- préférences par user

schema_migrations ( version INTEGER PRIMARY KEY, applied_at TEXT )
```

## 4. Authentification (mode serveur)

**Auth.js** (SvelteKit), avec **deux providers activables par variables d'env** —
on peut en activer un, l'autre, ou les deux :

- **Credentials** : **email** + mot de passe haché **argon2**. Autonome, aucun
  service externe.
- **OIDC générique** : pour un fournisseur self-hosted type **PocketID**
  (ou Authentik, Keycloak, Zitadel…). Configuré par env :

  ```
  AUTH_CREDENTIALS=true                 # active email/mdp
  OIDC_ISSUER=https://id.exemple.tld    # active OIDC si présent
  OIDC_CLIENT_ID=...
  OIDC_CLIENT_SECRET=...
  OIDC_NAME="PocketID"                  # libellé du bouton
  ```

- **Création de comptes selon le provider :**
  - **Credentials** (email + mdp) : comptes créés par l'**admin uniquement**
    (pas d'auto-inscription).
  - **OIDC** : c'est l'**IdP qui fait office de porte d'entrée**. Provisioning
    **just-in-time activé par défaut** (`OIDC_AUTO_PROVISION=true`) : tout sujet
    autorisé par l'IdP à accéder à l'app se voit créer un user automatiquement
    au 1ᵉʳ login (rapproché par `email`). Mettre la var à `false` pour exiger
    un user pré-créé.
- **Rôle via scope/claim OIDC** : le rôle `admin`/`user` est dérivé d'un claim
  de l'IdP (groupe/scope), mappé par env et **actif par défaut** :

  ```
  OIDC_AUTO_PROVISION=true               # créer le user au 1er login (défaut)
  OIDC_ROLE_CLAIM=groups                 # claim porteur des rôles
  OIDC_ADMIN_VALUE=hollama-admin         # valeur => role admin
  ```
- **Bootstrap admin** : au premier démarrage en mode serveur, si aucun user
  n'existe, on crée l'admin depuis `ADMIN_EMAIL` / `ADMIN_PASSWORD` (env).
  Premier compte = `role: admin`. (En OIDC pur, `ADMIN_EMAIL` désigne aussi quel
  sujet OIDC devient admin.)
- Les endpoints `/api/data/*` et `/api/proxy` **vérifient la session**. Pas de
  session → 401.

## 5. Providers & clés — le modèle admin-centré

C'est la spécificité voulue :

- **Serveurs système** (`owner_user_id = NULL`) : configurés par l'**admin**
  seul. L'admin choisit, par serveur, **quels modèles** sont exposés
  (`shared_models`).
- **Liste de modèles d'un user** = modèles partagés (serveurs système) **∪**
  ses modèles perso si autorisé.
- **Toggle global admin** `allowUserKeys` (dans `settings` admin) : si activé,
  un user peut créer ses propres `servers` (`owner_user_id = user.id`). Sinon,
  l'UI « ajouter un serveur » est masquée côté user.
- **Les clés ne quittent jamais le serveur.** Le navigateur ne reçoit que des
  *identifiants de serveur* et des *noms de modèles*.

## 6. Sécurité du proxy — à corriger dans tous les cas

Aujourd'hui [`/api/proxy/[...path]`](src/routes/api/proxy/[...path]/+server.ts)
forwarde vers **n'importe quelle** URL avec **n'importe quelle** clé fournie par
le client → *open relay / SSRF* sur une instance publique.

- **Mode local** : le proxy ne sert qu'à contourner le CORS. On le restreint au
  minimum (et il reste acceptable car l'instance est perso).
- **Mode serveur** : le proxy devient **authentifié**. Le client envoie un
  `serverId` (pas une URL ni une clé). Le serveur :
  1. vérifie la session,
  2. vérifie que ce user a le droit d'utiliser ce serveur,
  3. récupère `base_url` + déchiffre `api_key_enc` côté serveur,
  4. forwarde. La clé n'apparaît jamais côté client.

## 7. Flag de mode & sélection d'implémentation

```ts
// src/lib/data/index.ts
import { env } from '$env/dynamic/public';
export const repository: DataRepository =
  env.PUBLIC_MODE === 'server' ? new ApiRepository() : new LocalStorageRepository();
```

`ChatStrategy` reçoit, selon le mode, soit un `Server` complet (local), soit un
`serverId` qui pointe vers le proxy authentifié (server).

## 8. Impact fichiers (vue d'ensemble)

**Nouveau**
- `src/lib/data/repository.ts` — interface + types `AppData`/`Backup`
- `src/lib/data/localStorageRepository.ts`
- `src/lib/data/apiRepository.ts`
- `src/lib/data/index.ts` — sélection par mode
- `src/lib/server/db/*` — connexion `node:sqlite`, migrations, requêtes
- `src/lib/server/auth.ts` — config Auth.js
- `src/lib/server/crypto.ts` — chiffrement des clés
- `src/routes/api/data/*` — endpoints CRUD gardés
- `src/routes/(auth)/login/+page.svelte` — écran de login (mode server)
- `src/routes/settings/Admin.svelte` — onglet admin (serveurs système, modèles
  partagés, `allowUserKeys`, gestion users)

**Modifié**
- `src/lib/localStorage.ts` — les stores passent par le Repository
- `src/routes/+layout.svelte` — hydratation async au boot + garde d'auth
- `src/routes/settings/DataManagement.svelte`, `Onboarding.svelte` — via Repository
- `src/lib/chat/openai.ts`, `ollama.ts` — proxy authentifié en mode server
- `src/routes/api/proxy/[...path]/+server.ts` — durci

## 9. Découpage interne (même si livré « d'un bloc »)

Pour pouvoir valider à chaque étape sans tout casser :

1. **Repository + stores async** en mode local — *comportement identique*.
2. **Durcissement du proxy** (indépendant).
3. **Couche serveur** : SQLite + migrations + Auth.js + endpoints `/api/data`.
4. **`ApiRepository`** + bascule par `PUBLIC_MODE`.
5. **Mode admin** : serveurs système, modèles partagés, `allowUserKeys`.
6. **Proxy authentifié** par `serverId` (clés serveur-only).

## 10. Décisions arrêtées

- **Multi-comptes admin-centré** (§5) : serveurs système gérés par l'admin,
  modèles partagés, toggle `allowUserKeys`.
- **SQLite via `node:sqlite`** (intégré Node 26), pas d'ORM, colonnes JSON.
- **Auth.js** avec Credentials (username/mdp) **et/ou** OIDC (PocketID),
  activables par env. **Création de comptes réservée à l'admin.**
- **Bootstrap admin par variables d'env.**
- **Livraison « d'un bloc »**, mais selon le découpage interne du §9.

- Identifiant unique = **email** partout. **Credentials** : email + mdp (créés
  par l'admin). **OIDC** : rapprochement par `email`, **provisioning JIT activé
  par défaut**, **rôle dérivé d'un claim** (`OIDC_ROLE_CLAIM`/`OIDC_ADMIN_VALUE`),
  tout pilotable par env.

### Déploiement — tout dans un dossier montable

Toute la configuration mutable (DB SQLite + secrets dérivés éventuels) vit sous
**un seul répertoire** (ex. `./data/`, surchargé par `DATA_DIR`), pour permettre
un **bind mount unique** de toute la conf en Docker/Nix. Fichier par défaut :
`${DATA_DIR}/hollama.db`.
