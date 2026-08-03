# Architecture — Llooma

> Plan de référence avant le chantier « modes local / serveur ».
> Objectif : un code propre et léger, deux modes de fonctionnement à partir
> d'une **seule** base de code, sans dupliquer l'interface.

## 1. Deux modes, une seule app

|                      | **Mode `local`** (défaut)   | **Mode `server`**                                  |
| -------------------- | --------------------------- | -------------------------------------------------- |
| Public               | Usage perso, frictionless   | Instance partagée / self-hosted multi-utilisateurs |
| Auth                 | Aucune                      | Auth.js (login obligatoire)                        |
| Données              | `localStorage` (navigateur) | SQLite côté serveur, par utilisateur               |
| Clés API             | Dans le navigateur          | **Côté serveur uniquement, chiffrées**             |
| Sync multi-appareils | Non                         | Oui (les données vivent sur le serveur)            |
| Onboarding           | Wizard actuel               | Login → app                                        |

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
(Fait : `DataManagement.svelte` et `Onboarding.svelte` passent par les stores /
le repository. Seule exception assumée : la migration legacy de `+layout.svelte`,
qui ne concerne que d'anciennes données purement locales.)

### Interface

```ts
// src/lib/data/repository.ts
export interface DataRepository {
	hydrate?(): AppData; // seed synchrone (no-flash, mode local) — absent si async-only
	loadSettings(): Promise<Settings | null>;
	loadServers(): Promise<Server[]>;
	loadSessions(): Promise<Session[]>;
	loadKnowledge(): Promise<Knowledge[]>;
	saveSettings(value: Settings): Promise<void>;
	saveServers(value: Server[]): Promise<void>; // serveurs perso (mode server)
	saveSessions(value: Session[]): Promise<void>;
	saveKnowledge(value: Knowledge[]): Promise<void>;
	exportBackup(): Promise<Backup>;
	importBackup(b: Backup): Promise<void>;
	resetAll(): Promise<void>;
}
```

- `LocalStorageRepository` (fait) : seul point qui touche `localStorage` ; lit
  de façon synchrone (via `hydrate()`) pour seeder les stores sans flash.
  Comportement identique à aujourd'hui.
- `ApiRepository` (étape 4) : appelle des endpoints SvelteKit (`/api/data/*`)
  gardés par la session Auth.js ; pas de `hydrate()` → les stores se remplissent
  via les `load*()` au boot.

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
  password_hash TEXT,                    -- scrypt (NULL pour comptes OIDC)
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

- **Credentials** : **email** + mot de passe haché **`scrypt`** (via
  `node:crypto` — zéro dépendance, pas de module natif, même logique que
  `node:sqlite`). Autonome, aucun service externe.
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
  OIDC_ADMIN_VALUE=llooma-admin          # valeur => role admin
  ```

- **Bootstrap admin** : au premier démarrage en mode serveur, si aucun user
  n'existe, on crée l'admin depuis `ADMIN_EMAIL` / `ADMIN_PASSWORD` (env).
  Premier compte = `role: admin`. (En OIDC pur, `ADMIN_EMAIL` désigne aussi quel
  sujet OIDC devient admin.)
- Les endpoints `/api/data/*` et `/api/llm/*` **vérifient la session**. Pas de
  session → 401. `/api/proxy` n'est **pas** authentifié : il est désactivé en
  mode serveur (404), où plus rien ne l'appelle (§6).

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
  _identifiants de serveur_ et des _noms de modèles_.

## 6. Le proxy : pourquoi il existe, et comment on le durcit

### Pourquoi on le garde (ce n'est pas qu'un contournement de test)

[`/api/proxy/[...path]`](src/routes/api/proxy/[...path]/+server.ts) relaie les
appels du navigateur vers les providers LLM. Deux raisons de fond :

1. **CORS, au runtime.** Un appel navigateur → API tierce est bloqué sauf
   en-têtes CORS adéquats. Or **Ollama** refuse les origines tierces par défaut
   (sinon `OLLAMA_ORIGINS` à configurer à la main), **Anthropic** exige un
   en-tête spécial, et la plupart des serveurs **OpenAI-compatible/Infomaniak**
   n'envoient aucun CORS permissif. Le proxy **uniformise** : ça marche partout
   sans config utilisateur — c'est ce qui rend le mode local _frictionless_.
2. **Clés côté serveur (mode serveur).** Le proxy est le seul endroit où la clé
   peut être injectée sans jamais atteindre le navigateur — pilier du modèle
   admin-centré (§5).

Coût : **nul**. L'app tourne déjà sur un serveur Node (adapter-node, requis
aussi pour l'auth/DB). Le proxy, c'est le même serveur. Il ne deviendrait inutile
que pour un déploiement 100 % statique vers des providers CORS-friendly — ce qui
contredit la direction serveur/multi-user.

### Le risque, et le durcissement

À l'origine le proxy forwardait vers **n'importe quelle** URL avec **n'importe
quelle** clé → _open relay / SSRF_ sur une instance publique.

- **Mode local — durci (fait, étape 2)** : validation d'URL absolue, **schémas
  `http`/`https` uniquement** (ferme `file:`/`gopher:`/`data:`…), et **allowlist
  d'origines optionnelle** `PROXY_ALLOWED_ORIGINS` (vide = comportement actuel,
  pour rester frictionless ; renseignée = seules ces origines passent, avec
  `redirect: manual` pour qu'aucune redirection ne fasse fuiter l'`Authorization`
  hors allowlist). On ne bloque **pas** les IP privées en dur, car `localhost`
  est légitime (Ollama) — contrairement à `fetchPage`, qui lui les bloque.
- **Mode serveur — la route est fermée (404)** : le navigateur passe par
  `/api/llm/[serverId]`, donc `/api/proxy` n'y sert plus à rien. Laissée
  ouverte, elle était un relais **non authentifié** devant une instance
  multi-user (la garde d'auth exempte tout `/api`), avec `redirect: follow` par
  défaut. Le refus est dans le handler lui-même.
- **Mode serveur — fait (étape 6)** : `/api/llm/[serverId]/[...path]` est
  **authentifié**. Le client envoie un `serverId` (pas une URL ni une clé). Le
  serveur :
  1. vérifie la session,
  2. vérifie que ce user a le droit d'utiliser ce serveur (système, ou le sien)
     et qu'il est activé,
  3. récupère `base_url` + déchiffre `api_key_enc` côté serveur,
  4. forwarde avec l'`Authorization` injectée. La clé n'apparaît jamais côté
     client. Les stratégies de chat ([endpoint.ts](src/lib/chat/endpoint.ts))
     ciblent ce proxy en mode serveur.

  > ⚠️ Côté serveur, viser un provider local via **`127.0.0.1`** plutôt que
  > `localhost` : `fetch` (undici) peut résoudre `localhost` en IPv6 `::1` et
  > échouer si le provider n'écoute qu'en IPv4 (cas d'Ollama par défaut).

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

1. **Repository + stores async** en mode local — _comportement identique_.
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
