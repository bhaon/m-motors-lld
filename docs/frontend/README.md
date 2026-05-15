# Documentation développeur — Frontend M-Motors LLD

Guide de référence pour travailler sur l’application **Next.js** du projet **M-Motors LLD** sans connaissance préalable du dépôt.  
Code source : répertoire `frontend/` à la racine du monorepo.  
API consommée : backend FastAPI — voir [`docs/backend/README.md`](../backend/README.md).

---

## Sommaire

1. [Vue d’ensemble](#1-vue-densemble)
2. [Stack technique](#2-stack-technique)
3. [Démarrage rapide](#3-démarrage-rapide)
4. [Arborescence du projet](#4-arborescence-du-projet)
5. [App Router et cartographie des routes](#5-app-router-et-cartographie-des-routes)
6. [Intégration API (backend)](#6-intégration-api-backend)
7. [Authentification et contrôle d’accès (UI)](#7-authentification-et-contrôle-daccès-ui)
8. [Composants et interface](#8-composants-et-interface)
9. [Hooks personnalisés](#9-hooks-personnalisés)
10. [Types TypeScript](#10-types-typescript)
11. [Pages métier (parcours)](#11-pages-métier-parcours)
12. [Observabilité](#12-observabilité)
13. [Tests](#13-tests)
14. [Build et déploiement](#14-build-et-déploiement)
15. [Style de code et qualité](#15-style-de-code-et-qualité)
16. [Guide : ajouter une fonctionnalité](#16-guide--ajouter-une-fonctionnalité)
17. [Dépannage fréquent](#17-dépannage-fréquent)
18. [Documentation complémentaire](#18-documentation-complémentaire)

---

## 1. Vue d’ensemble

Le frontend est une **SPA/MPA hybride** basée sur **Next.js 15 (App Router)** qui couvre :

- le **catalogue public** véhicules (LLD / achat) ;
- l’**espace client** (dossiers, pièces jointes, contrats, profil) ;
- le **back-office** gestionnaire (dossiers, véhicules, options LLD) ;
- les vues **superviseur / admin** (reporting, contrats en cours, utilisateurs).

**Principes structurants :**

| Principe | Détail |
|----------|--------|
| Rendu | **Client Components** (`"use client"`) pour la majorité du métier ; **Server Components** pour le catalogue SSR et quelques redirects |
| Auth | Cookie **HttpOnly** `access_token` (JWT posé par le backend) ; `fetch` avec `credentials: "include"` |
| Sécurité réelle | **Backend** (403/401) — le front masque surtout la navigation selon le rôle |
| Pas de middleware Next | Aucun `middleware.ts` — pas de garde centralisée des URLs |
| API | URLs **relatives** `/api/v1/...` + **rewrite** Next vers le backend, ou `NEXT_PUBLIC_API_URL` en cross-origin |
| UI | Design maison (variables CSS + styles inline) ; Tailwind en complément |
| Tests | **Jest** (couverture 80 %) sous `tests/` ; **Playwright** E2E avec mock backend |

**Hors périmètre frontend :** logique métier lourde, base de données, envoi d’emails — tout est délégué à l’API FastAPI.

---

## 2. Stack technique

| Composant | Version (pin) | Rôle |
|-----------|---------------|------|
| **Next.js** | 15.5.x | Framework, App Router, rewrites, standalone build |
| **React** | 18.3.x | UI |
| **TypeScript** | 5.5.x | Typage strict (`strict: true`) |
| **Tailwind CSS** | 3.4.x | Utilitaires CSS (usage partiel) |
| **react-markdown** + **remark-gfm** | 10.x / 4.x | Affichage contrats / contenus MD |
| **sharp** | 0.33.x | Optimisation images Next |
| **@vercel/otel** | 1.13.x | OpenTelemetry (traces) |
| **Jest** | 30.x | Tests unitaires / composants |
| **@testing-library/react** | 16.x | Rendu et assertions UI |
| **happy-dom** | 20.x | Environnement DOM Jest (remplace jsdom) |
| **Playwright** | 1.60.x | Tests E2E navigateur |
| **ESLint** | 9.x + `eslint-config-next` | Lint |
| **Prettier** | 3.4.x | Format (script local, pas en CI) |

Fichiers clés :

- `frontend/package.json` — scripts et dépendances
- `frontend/tsconfig.json` — alias `@/*` → `src/*`
- `frontend/next.config.js` — standalone, rewrites, images distantes
- `frontend/tailwind.config.ts`, `postcss.config.js`

---

## 3. Démarrage rapide

### 3.1 Avec Docker (recommandé, monorepo)

À la **racine** `bloc3/m-motors-lld/` :

```bash
make up          # db + minio + backend + frontend
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API (via rewrite) | http://localhost:3000/api/v1/... |
| API directe | http://localhost:8000/api/docs |
| Backend seul | http://localhost:8000 |

Le conteneur `frontend` monte `./frontend:/app`, exécute `npm run dev` (HMR).  
Variables typiques : `API_INTERNAL_URL=http://backend:8000`, **`NEXT_PUBLIC_API_URL` non défini** → le navigateur appelle `/api/*` en same-origin.

### 3.2 Hors Docker (frontend seul)

```bash
cd frontend
cp .env.local.example .env.local
# Ajuster NEXT_PUBLIC_API_URL=http://localhost:8000 si appels directs au backend
npm install
npm run dev
```

Le backend FastAPI doit être joignable sur le port configuré.

### 3.3 Scripts npm

| Script | Action |
|--------|--------|
| `npm run dev` | Serveur dev Next (:3000) |
| `npm run build` | Build production |
| `npm run start` | Serveur prod (après build) |
| `npm run lint` | ESLint (Next) |
| `npm run type-check` | `tsc --noEmit` |
| `npm run format:check` | Prettier check |
| `npm run test` | Jest |
| `npm run test:ci` | Jest + couverture lcov (CI) |
| `npm run test:watch` | Jest mode watch |
| `npm run test:e2e` | Playwright |
| `npm run test:e2e:ui` | Playwright UI mode |

### 3.4 Makefile (racine monorepo)

Le Makefile cible surtout le backend ; pour le front, utiliser les scripts npm ci-dessus dans `frontend/`, ou `docker compose` pour la stack complète.

---

## 4. Arborescence du projet

```text
frontend/
├── src/
│   ├── app/                    # App Router (routes = dossiers)
│   │   ├── layout.tsx          # Layout racine (globals.css, lang=fr)
│   │   ├── page.tsx            # Accueil / catalogue (SSR)
│   │   ├── globals.css         # Variables CSS, navbar, modales
│   │   ├── fetchVehicles.ts    # Fetch SSR catalogue
│   │   ├── error.tsx           # Boundary erreur globale
│   │   ├── healthz/            # Routes K8s (route.ts)
│   │   ├── readyz/
│   │   ├── mes-dossiers/       # Espace client
│   │   ├── mes-contrats/
│   │   ├── backoffice/         # Gestionnaire + superviseur
│   │   ├── admin/              # Administration
│   │   └── …                   # auth, confirmations email, etc.
│   ├── components/             # Composants réutilisables
│   ├── hooks/                  # Hooks React métier
│   ├── lib/                    # api, validation, sha256, logger
│   ├── types/                  # Types domaine partagés
│   └── instrumentation.ts      # OpenTelemetry (Node)
├── tests/                      # Jest (miroir fonctionnel, pas co-localisé)
│   ├── app/
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   ├── integration/
│   └── fixtures/
├── e2e/
│   ├── specs/                  # Tests Playwright
│   ├── global-setup.ts         # Mock HTTP backend :8001
│   └── mock-data.ts
├── public/                     # Assets statiques (créé au build Docker si besoin)
├── package.json
├── next.config.js
├── jest.config.js
├── jest.setup.js
├── playwright.config.ts
├── Dockerfile
└── .env.local.example
```

### Rôle de chaque dossier `src/`

| Dossier | Responsabilité | À éviter |
|---------|----------------|----------|
| `app/` | Routes, pages, `loading`/`error`, petites utilitaires SSR | Composants UI génériques volumineux |
| `components/` | UI réutilisable, modales, cartes | Appels API métier non partagés |
| `hooks/` | État et effets réutilisables (session, filtres, upload) | Logique spécifique à une seule page non exportée |
| `lib/` | Fonctions pures, helpers API, validation | JSX |
| `types/` | Interfaces alignées sur l’API | Logique runtime |

**Alias TypeScript / Jest :** `@/components/Navbar` → `src/components/Navbar`.

---

## 5. App Router et cartographie des routes

Next.js 15 utilise le **filesystem routing** : chaque `page.tsx` sous `src/app/` définit une route.

### 5.1 Layout racine

`src/app/layout.tsx` :

- importe `globals.css` ;
- **n’inclut pas** la `Navbar` globalement — **chaque page** importe `<Navbar />` explicitement.

### 5.2 Table des routes principales

| Route | Fichier | Rendu | Audience |
|-------|---------|-------|----------|
| `/` | `app/page.tsx` | **Server** (`force-dynamic`) | Public — catalogue |
| `/a-propos` | `app/a-propos/page.tsx` | Server + metadata | Public |
| `/connexion`, `/inscription` | `app/connexion/`, `inscription/` | Client | Redirigent vers `/?connexion=1` / `?inscription=1` |
| `/espace-client` | `app/espace-client/page.tsx` | Server | Redirect profil si cookie valide |
| `/mes-dossiers` | `app/mes-dossiers/page.tsx` | Client | Client |
| `/mes-dossiers/[id]` | `app/mes-dossiers/[id]/page.tsx` | Client | Client — détail dossier |
| `/mes-contrats` | `app/mes-contrats/page.tsx` | Client | Client — contrats LLD |
| `/mot-de-passe-oublie`, `/reset-password` | … | Client | Auth |
| `/confirm-email` | … | Client | Lien email |
| `/confirm-contract-signature` | … | Client | Signature contrat |
| `/confirm-avenant-signature` | … | Client | Signature avenant |
| `/backoffice/dossiers` | … | Client | Gestionnaire+ |
| `/backoffice/dossiers/[id]` | … | Client | Détail BO |
| `/backoffice/vehicules` | … | Client | Parc véhicules |
| `/backoffice/vehicules/nouveau` | … | Client | Création véhicule |
| `/backoffice/options-lld` | … | Client | Catalogue options |
| `/backoffice/reporting` | … | Client | Superviseur / admin |
| `/backoffice/contrats-en-cours` | … | Client | Superviseur / admin |
| `/admin/utilisateurs` | … | Client | Admin |

### 5.3 Routes techniques Next

| Route | Fichier | Usage |
|-------|---------|-------|
| `/healthz` | `app/healthz/route.ts` | Liveness Kubernetes |
| `/readyz` | `app/readyz/route.ts` | Readiness |

### 5.4 Error boundaries

| Fichier | Périmètre |
|---------|-----------|
| `app/error.tsx` | Global |
| `app/backoffice/error.tsx` | Back-office |
| `app/admin/error.tsx` | Admin |
| `app/mes-dossiers/error.tsx` | Dossiers client |

### 5.5 Schéma des zones applicatives

```text
                    ┌─────────────────┐
                    │  Catalogue /    │
                    │  pages publiques│
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       ┌────────────┐ ┌────────────┐ ┌────────────┐
       │   Client   │ │ Back-office│ │   Admin    │
       │ mes-*      │ │ backoffice/│ │ admin/     │
       │ espace-*   │ │            │ │            │
       └────────────┘ └────────────┘ └────────────┘
              │              │              │
              └──────────────┴──────────────┘
                             │
                    fetch /api/v1/* + cookie
```

---

## 6. Intégration API (backend)

### 6.1 Module central — `src/lib/api.ts`

```typescript
import { apiUrl, apiBase } from "@/lib/api";

// URL complète d’un endpoint
const url = apiUrl("/api/v1/dossiers/me");

// Base sans slash (concaténation manuelle)
const res = await fetch(`${apiBase()}/api/v1/reporting/summary`, { ... });
```

**Résolution de l’origine** (`resolveApiOrigin`) :

| Contexte | Priorité |
|----------|----------|
| **Navigateur** | `NEXT_PUBLIC_API_URL` si défini, sinon `""` (same-origin) |
| **SSR (Node)** | `API_INTERNAL_URL` → `NEXT_PUBLIC_API_URL` → `http://backend` (prod) / `http://127.0.0.1:8000` (dev) |

Chaîne vide = chemins relatifs `/api/v1/...` proxifiés par Next.

### 6.2 Rewrites — `next.config.js`

Toutes les requêtes `/api/:path*` sont redirigées vers le backend :

```javascript
// BACKEND_URL ou API_INTERNAL_URL, sinon prod https://backend:8000 ou dev 127.0.0.1:8000
{ source: "/api/:path*", destination: `${backend}/api/:path*` }
```

**Docker Compose :** le navigateur appelle `http://localhost:3000/api/v1/...` → Next rewrite → `http://backend:8000/api/v1/...`.

**Dev direct :** `NEXT_PUBLIC_API_URL=http://localhost:8000` → le navigateur appelle le backend sans passer par le rewrite.

### 6.3 Pattern `fetch` standard

**Endpoints authentifiés** (quasi toujours) :

```typescript
const res = await fetch(apiUrl("/api/v1/dossiers/me"), {
  method: "GET",
  credentials: "include",  // envoie le cookie access_token
  cache: "no-store",
});
const data = await res.json();
if (res.status === 403) { /* message accès refusé */ }
if (!res.ok) throw new Error(data.detail ?? `Erreur ${res.status}`);
```

**Catalogue SSR** (`fetchVehicles.ts`) : `cache: "no-store"`, **sans** credentials (API publique).

### 6.4 Duplication à connaître

Plusieurs fichiers redéfinissent localement `resolveMeUrl()` ou équivalent (`Navbar.tsx`, `AuthModal.tsx`, `mes-dossiers/page.tsx`) au lieu d’utiliser systématiquement `apiUrl()`.  
**Convention recommandée pour le nouveau code :** toujours `apiUrl()` / `apiBase()` depuis `@/lib/api`.

### 6.5 Alignement avec les schémas backend

Les réponses JSON suivent les schémas Pydantic du backend (`*Out`, listes paginées, champs `detail` en erreur).  
En cas de doute, consulter Swagger : `http://localhost:8000/api/docs` ou la doc [`docs/backend/README.md`](../backend/README.md).

---

## 7. Authentification et contrôle d’accès (UI)

### 7.1 Mécanisme

1. Login : `POST /api/v1/auth/login` → le backend pose le cookie **HttpOnly** `access_token`.
2. Le frontend ne stocke **pas** le JWT en `localStorage`.
3. Chaque appel métier : `credentials: "include"`.

### 7.2 Session courante — `GET /api/v1/auth/me`

Réponse typique :

```json
{
  "email": "client@example.com",
  "first_name": "Jean",
  "last_name": "Dupont",
  "role": "client"
}
```

### 7.3 Navbar — pivot navigation + RBAC UX

Fichier : `src/components/Navbar.tsx` (~800 lignes).

Au montage, appel `/auth/me` puis :

```typescript
const GESTIONNAIRE_ROLES = new Set(["gestionnaire", "superviseur", "admin"]);
const isGestionnaire = role !== null && GESTIONNAIRE_ROLES.has(role);
const isAdmin = role === "admin";
const isSuperviseurReporting = role === "superviseur" || role === "admin";
const showClientPortfolioLinks = role !== "gestionnaire";
```

Liens affichés selon le rôle (ex. « Reporting dossiers », « Contrats en cours » pour superviseur/admin).

**Tests Jest :** si `NODE_ENV === "test"`, la Navbar **ne déclenche pas** le fetch auth (évite les appels réels).

### 7.4 Hook `useClientSession`

Fichier : `src/hooks/useClientSession.ts`.

Expose `sessionReady`, `isAuthenticated`, `refreshSession` — utilisé par `CataloguePage` pour bloquer la création de dossier si non connecté.

### 7.5 Événement post-login

Après connexion depuis le catalogue :

```typescript
window.dispatchEvent(new Event("m-motors-auth-session-changed"));
```

La Navbar réécoute et recharge `/auth/me`.

### 7.6 Modales auth / profil

| Composant | Rôle |
|-----------|------|
| `AuthModal.tsx` | Login / inscription (deeplinks `?connexion=1`, `?inscription=1` sur `/`) |
| `ProfileModal.tsx` | Profil + `ProfileManagementClient` |

Pages `/connexion` et `/inscription` : redirections vers l’accueil avec query params pour ouvrir la modale.

### 7.7 Protection des routes — limites

| Mécanisme | Exemple |
|-----------|---------|
| **Redirect SSR** | `espace-client/page.tsx` vérifie le cookie côté serveur |
| **Masquage menu** | Navbar cache les liens non autorisés |
| **Message 403** | `backoffice/reporting`, `contrats-en-cours` affichent une alerte |
| **Pas de middleware** | URL `/backoffice/*` accessible en tapant l’URL — le backend renvoie 403 |

La **sécurité** repose sur le backend ; le front améliore l’UX.

---

## 8. Composants et interface

### 8.1 Approche styling (hybride)

| Couche | Fichier / usage |
|--------|-----------------|
| **Variables CSS** | `globals.css` — `--navy`, `--cyan`, responsive navbar |
| **Styles inline** | `style={{ ... }}` — **dominant** sur tableaux BO, modales, statuts |
| **Tailwind** | `className="..."` — Navbar mobile, `VehicleCard`, certaines pages erreur |
| **Pas de CSS Modules** | Aucun `*.module.css` |
| **Pas de lib UI** | Pas de shadcn, MUI, Chakra, etc. |

### 8.2 Composants majeurs

| Composant | Rôle |
|-----------|------|
| `Navbar.tsx` | Navigation, auth, menu mobile/desktop |
| `CataloguePage.tsx` | Grille catalogue, filtres, modale véhicule |
| `Hero.tsx`, `SearchBar.tsx`, `FiltersRow.tsx` | Accueil catalogue |
| `VehicleCard.tsx`, `VehicleModal.tsx`, `VehicleForm.tsx` | Véhicules |
| `AuthModal.tsx`, `ProfileModal.tsx` | Authentification |
| `DossierPiecesModal.tsx`, `DossierConfirmModal.tsx`, … | Parcours dossier |
| `LldOptionsSection.tsx` | Options LLD sur dossier |
| `StatusBadge.tsx` | Badge statut dossier |
| `Toast.tsx` + `useToast` | Notifications |
| `MarkdownBody.tsx` | Rendu contrat / contenus MD |

### 8.3 Pattern page type (client)

```tsx
"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { apiBase } from "@/lib/api";

export default function MaPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${apiBase()}/api/v1/mon-endpoint`, { credentials: "include", cache: "no-store" })
      .then(/* ... */)
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Navbar />
      <main>{/* contenu */}</main>
    </>
  );
}
```

### 8.4 Page serveur (catalogue)

`app/page.tsx` appelle `fetchVehicles()` côté serveur puis passe les données à `CataloguePage` (client) en props.

---

## 9. Hooks personnalisés

| Hook | Fichier | Rôle |
|------|---------|------|
| `useClientSession` | `useClientSession.ts` | Session client (`/auth/me`) |
| `useFilters` | `useFilters.ts` | Filtres catalogue (marque, prix, LLD…) |
| `useToast` | `useToast.ts` | File de toasts |
| `useFileUpload` | `useFileUpload.ts` | Upload pièces S3 (init → PUT → complete) |

Les hooks restent dans `src/hooks/` ; tests miroir dans `tests/hooks/`.

---

## 10. Types TypeScript

**Fichier principal :** `src/types/index.ts`

Types exportés (extrait) :

- `Vehicle`, `VehicleOption`, `VehicleSpecs`, `Filters`, `ContratType`
- `DossierStatus`, `DossierType`, `DossierListItem`, `ContratListItem`
- …

**Convention observée :** les pages back-office redéfinissent parfois des interfaces locales (`DossierBoItem` dans `backoffice/dossiers/page.tsx`) au lieu d’importer depuis `@/types`.

**Recommandation :** factoriser les types BO dans `src/types/` quand ils sont réutilisés ou alignés sur un schéma API stable.

**Fixtures tests :** `tests/fixtures/vehicles.ts`.

---

## 11. Pages métier (parcours)

### 11.1 Catalogue (US-01)

- **SSR** : liste véhicules via `fetchVehicles.ts` → `GET /api/v1/vehicules`
- **Client** : filtres, fiche véhicule, création dossier brouillon si session OK

### 11.2 Espace client (US-03 / US-04)

- Liste / détail dossiers, upload pièces, soumission
- Options LLD, visualisation contrat Markdown, demande signature
- `mes-contrats` : historique LLD

### 11.3 Back-office dossiers (US-06)

- Liste paginée filtrée (`backoffice/dossiers/page.tsx` — fichier volumineux)
- Détail : validation, rejet, planification / effectuation livraison
- Badges couleur par statut (inline styles)

### 11.4 Reporting & contrats (US-06-06 / US-06-11)

- `backoffice/reporting` : périodes semaine/mois/trimestre, export CSV
- `backoffice/contrats-en-cours` : tableau LLD actifs, phases vert/orange/rouge

### 11.5 Admin (US-11)

- `admin/utilisateurs` : CRUD utilisateurs staff, changement rôle

Les spécifications fonctionnelles détaillées : `docs/UserStories/US-*.md`.

---

## 12. Observabilité

Fichier : `src/instrumentation.ts` (hook Next.js).

- OpenTelemetry via `@vercel/otel`
- Variables : `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, `OTEL_SDK_DISABLED=true` en tests
- Aligné avec le stack Jaeger du monorepo (voir `docs/monitoring/`)

Le frontend n’expose pas `/metrics` Prometheus (réservé au backend).

---

## 13. Tests

### 13.1 Jest — configuration

| Fichier | Rôle |
|---------|------|
| `jest.config.js` | Wrapper `next/jest`, alias `@/`, seuils couverture |
| `jest.setup.js` | `@testing-library/jest-dom`, mocks `next/image`, `next/link`, `next/navigation` |

- **Emplacement :** `tests/**/*.test.{js,jsx,ts,tsx}` (pas à côté des sources)
- **Environnement :** `@happy-dom/jest-environment`
- **Seuil global :** **80 %** (branches, functions, lines, statements) sur `src/app`, `components`, `hooks`, `lib`, `types`

### 13.2 Mock `fetch` — convention

```typescript
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ role: "superviseur", first_name: "A", last_name: "B", email: "a@b.com" }),
  });
});

afterEach(() => jest.restoreAllMocks());
```

Assertions fréquentes :

```typescript
expect(global.fetch).toHaveBeenCalledWith(
  expect.stringContaining("/api/v1/reporting/contrats-en-cours"),
  expect.objectContaining({ credentials: "include" }),
);
```

Pour la Navbar : forcer `process.env.NODE_ENV = "production"` si le test doit exécuter le fetch auth.

### 13.3 Tests d’intégration front

- `tests/integration/connexion-flow.integration.test.tsx`
- `tests/integration/profile-management.integration.test.tsx`

### 13.4 Playwright E2E

| Élément | Détail |
|---------|--------|
| Specs | `e2e/specs/*.spec.ts` (auth, catalogue, navigation, mes-dossiers) |
| `global-setup` | Serveur mock HTTP port **8001** (simule FastAPI) |
| `webServer` | `next dev` (local) ou standalone (CI) |
| Env E2E | `API_INTERNAL_URL=http://localhost:8001`, `NEXT_PUBLIC_API_URL=""` |
| Surcouche | `page.route("**/api/v1/...")` par spec |

```bash
npm run test:e2e
npm run test:e2e:ui
```

### 13.5 Exécution

```bash
cd frontend
npm test                              # tous les tests Jest
npm test -- --testPathPatterns=Navbar # un fichier
npm run test:ci                       # comme en CI (couverture)
npm run test:e2e                      # Playwright
```

CI (`.github/workflows/ci.yaml`) : `lint`, `type-check`, `test -- --coverage`, job E2E séparé.

---

## 14. Build et déploiement

### 14.1 Build Next

```bash
npm run build
```

`next.config.js` : `output: "standalone"` → artefact dans `.next/standalone/` (image Docker).

### 14.2 Dockerfile

Multi-stage : `npm ci` → `npm run build` → image minimale avec `node server.js`, utilisateur `nextjs`.

### 14.3 Kubernetes

- Sonde : `/healthz`, `/readyz` (routes Next)
- ConfigMap : `API_INTERNAL_URL: "http://backend"` (service cluster)
- Production : `NEXT_PUBLIC_API_URL` souvent `https://opsdev.fr/api` ou same-origin selon ingress

Voir `k8s/overlays/production/` et `docs/k8s/`.

---

## 15. Style de code et qualité

| Outil | Usage |
|-------|--------|
| **ESLint** | `npm run lint` — config Next 15 par défaut |
| **TypeScript** | `strict: true`, `npm run type-check` |
| **Prettier** | `npm run format:check` — pas de `.prettierrc` commité, **pas exécuté en CI** |
| **allowJs** | Quelques tests `.jsx` legacy |

### Conventions

| Sujet | Convention |
|-------|------------|
| Langue UI | **Français** (labels, messages d’erreur) |
| Commentaires | Français en tête de fichier / sections US |
| Composants client | `"use client"` en première ligne si état / effets |
| Imports | Alias `@/` plutôt que chemins relatifs longs |
| Accessibilité | `role="alert"`, `aria-live` sur chargements / erreurs (pages récentes) |
| Nommage tests | `backoffice-reporting-page.test.tsx`, aligné US |

---

## 16. Guide : ajouter une fonctionnalité

Checklist pour une nouvelle page ou user story frontend :

1. **Lire la US** dans `docs/UserStories/`.
2. **Vérifier l’API** backend (route, schéma, rôles) — Swagger ou doc backend.
3. **Créer la route** : `src/app/.../page.tsx` (`"use client"` sauf SSR voulu).
4. **Importer `<Navbar />`** et brancher le lien si nouveau menu (rôle dans `Navbar.tsx`).
5. **Appels API** via `apiUrl()` / `apiBase()` + `credentials: "include"`.
6. **Gérer 403** avec message clair pour les vues superviseur/admin.
7. **Types** : ajouter dans `src/types/index.ts` si partagé.
8. **Tests Jest** : `tests/app/ma-page.test.tsx` — mock `global.fetch`.
9. **E2E** (optionnel) : spec Playwright si parcours critique.

Exemple lien Navbar (superviseur) :

```tsx
{isSuperviseurReporting && (
  <Link href="/backoffice/ma-page">Ma fonctionnalité</Link>
)}
```

---

## 17. Dépannage fréquent

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| 401 / redirection login | Cookie absent ou expiré | Se reconnecter ; vérifier `credentials: "include"` |
| API 404 sur `/api/...` | Backend down ou mauvais rewrite | Vérifier `docker compose ps`, `API_INTERNAL_URL` |
| CORS en local | `NEXT_PUBLIC_API_URL` cross-origin sans CORS backend | Utiliser rewrite (vider `NEXT_PUBLIC_API_URL`) ou configurer `ALLOWED_ORIGINS` backend |
| Données catalogue vides SSR | `fetchVehicles` ne joint pas le backend | Vérifier `API_INTERNAL_URL` côté conteneur front |
| Tests Navbar flaky | `NODE_ENV=test` désactive auth | Forcer `production` dans le test si besoin de fetch |
| Couverture CI < 80 % | Nouveau fichier sous `src/` sans test | Ajouter test dans `tests/` |
| E2E timeout | Port 3000 occupé ou build manquant | `npm run build` avant E2E en CI ; un seul worker CI |
| Images Next refusées | Domaine non autorisé | `remotePatterns` dans `next.config.js` (déjà permissif) |

---

## 18. Documentation complémentaire

| Document | Contenu |
|----------|---------|
| [`docs/backend/README.md`](../backend/README.md) | API, auth, modèles, tests backend |
| `docs/UserStories/` | Spécifications fonctionnelles |
| [`docs/k8s/README.md`](../k8s/README.md) | Déploiement Kubernetes |
| [`docs/monitoring/README.md`](../monitoring/README.md) | Observabilité, traces, logs |
| `frontend/.env.local.example` | Variables dev locales |

---

*Dernière mise à jour : Next.js 15.5, React 18, App Router, structure alignée sur le monorepo M-Motors LLD (back-office, reporting, contrats en cours US-06-11).*
