# Documentation Kubernetes — usage des manifests

Ce dossier contient toute la configuration Kubernetes du projet, **organisée avec Kustomize**.

**Objectif :** déployer la même application sur `dev`, `staging` et `production` avec un socle commun (`base/`) et des surcharges minimales par environnement (`overlays/`).

## Structure du dossier

```text
k8s/
├── base/                         # Déploiements et services communs
│   ├── deployment.yaml           # frontend + backend (multi-doc)
│   ├── service.yaml
│   ├── postgresql.yaml           # base de données applicative
│   ├── redis.yaml
│   └── minio.yaml
├── overlays/
│   ├── dev/                      # Namespace dev, ingress, ConfigMap, patches
│   ├── staging/                  # Idem staging (+ OTLP Jaeger)
│   └── production/               # + HPA, PDB, patch sécurité, patch URL MinIO
└── infra/
    ├── dev/                      # Namespace, quotas, RBAC, NetworkPolicy, SealedSecrets
    ├── staging/
    ├── production/               # + rate-limit Traefik, politique réseau sauvegardes
    ├── traefik/                  # IngressRoutes, config Traefik
    ├── cert-manager/             # ClusterIssuer (Let’s Encrypt)
    └── monitoring/               # Jaeger (Kustomize) + règles / Helm values / backup / Grafana
```

Les secrets en clair (`secrets.yaml` par environnement) ne doivent **pas** être versionnés : utiliser **Sealed Secrets** (`k8s/infra/<env>/sealedsecrets.yaml`) et les scripts `scripts/seal-secrets.sh` à la racine du dépôt.

## Principe de fonctionnement

- **`base/`** définit les ressources applicatives communes (workloads, PostgreSQL, Redis, MinIO, Services).
- **`overlays/<env>/`** compose la base et ajoute l’exposition (Ingress), la configuration (ConfigMap) et les **patches** (réplicas, ressources, stockage, OpenTelemetry vers Jaeger en dev/staging, URL publique MinIO, etc.).
- **`infra/<env>/`** décrit l’infrastructure par namespace (quotas, RBAC, politiques réseau, sealed secrets).
- **`infra/traefik`**, **`infra/cert-manager`**, **`infra/monitoring`** : composants transverses cluster (ingress TLS, observabilité).

## Ordre recommandé d’application

Toujours appliquer dans cet ordre :

1. **Infra environnement** — `k8s/infra/<env>` (namespace, quotas, RBAC, `SealedSecrets`, `NetworkPolicy`…).
2. **Infra transverse** si nécessaire — `k8s/infra/traefik`, `k8s/infra/cert-manager`, `k8s/infra/monitoring`.
   - Le namespace **`monitoring`** doit exister avant Jaeger (voir `infra/monitoring/namespace-and-netpol.yaml`).
   - **Jaeger (traces)** : `kubectl apply -k k8s/infra/monitoring` (déploie uniquement les ressources listées dans `infra/monitoring/kustomization.yaml` : Jaeger, politiques réseau, ingress).
   - **Prometheus / Grafana / Loki, règles d’alerte, sauvegardes, dashboard US-08-03** : les fichiers `alert-rules.yaml`, `prometheus-values.yaml`, `loki-values.yaml`, `grafana-dashboard-us08-configmap.yaml`, `backup-cronjob.yaml`, etc. sont documentés dans **`k8s/infra/monitoring/README.md`** et **`docs/monitoring/us-08-03-observabilite-v1.md`** (souvent via `kubectl apply -f …` ou **Helm**, pas via le même `apply -k` que Jaeger).
3. **Application** — `k8s/overlays/<env>`.

**Pourquoi cet ordre :** les manifests applicatifs supposent que les namespaces, secrets, RBAC et CRD (ex. Traefik) existent déjà.

## Jaeger sur le cluster (traces)

Les manifests sous **`k8s/infra/monitoring/`** déploient **Jaeger all-in-one** dans le namespace **`monitoring`** (OTLP HTTP **4318**, UI **16686**).

- **Appliquer** (après création du namespace `monitoring`, par ex. via `namespace-and-netpol.yaml`) :

```bash
kubectl apply -f k8s/infra/monitoring/namespace-and-netpol.yaml   # si pas déjà présent
kubectl apply -k k8s/infra/monitoring
```

Les **Ingress** Traefik (`jaeger-ingress.yaml`) et les **Certificate** cert-manager émettent les certificats Let’s Encrypt pour les hôtes déclarés (prérequis : enregistrements DNS `A` / `CNAME` vers l’Ingress public).

- **UI en HTTPS** (après DNS) :
  - dev : `https://jaeger-dev.netdevops.fr`
  - staging : `https://jaeger-staging.netdevops.fr` (BasicAuth `staging-auth`, comme l’app)
  - production : `https://jaeger.netdevops.fr` (rate limit + compress, comme l’Ingress app ; dépannage 502 : **`k8s/infra/monitoring/README.md`**)

- **UI en local** (port-forward, sans DNS) :

```bash
kubectl port-forward -n monitoring svc/jaeger 16686:16686
# puis ouvrir http://localhost:16686
```

- **Applications** : les overlays **dev** et **staging** injectent `OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger.monitoring.svc.cluster.local:4318` et `OTEL_LOGS_EXPORTER=none` sur les pods `backend` et `frontend`. La **production** n’inclut pas ce patch par défaut (charge / persistance : prévoir un backend managé ou dupliquer le patch si besoin).

- **Politiques réseau** : les fichiers `infra/<env>/network-policy.yaml` autorisent l’**egress** vers Jaeger (OTLP) depuis `frontend` et `backend`. **`jaeger-netpol.yaml`** autorise l’**ingress** OTLP vers Jaeger depuis les pods portant le label **`component: api`** ou **`component: web`** (aligné sur la base).

## Documentation associée

- **Observabilité (OpenTelemetry, métriques, stack complète)** : [docs/monitoring/observabilite-opentelemetry.md](../docs/monitoring/observabilite-opentelemetry.md), [docs/monitoring/us-08-03-observabilite-v1.md](../docs/monitoring/us-08-03-observabilite-v1.md)
- **Détail du répertoire `infra/monitoring/`** : [k8s/infra/monitoring/README.md](infra/monitoring/README.md)
- **MinIO / ingress** : [docs/k8s/docs-minio-ingress.md](../docs/k8s/docs-minio-ingress.md)

## Commandes utiles

### Prévisualiser le rendu Kustomize

```bash
kustomize build k8s/overlays/dev
kustomize build k8s/overlays/staging
kustomize build k8s/overlays/production
```

### Appliquer un environnement

```bash
# 1) Infra
kustomize build k8s/infra/production | kubectl apply -f -

# 2) Application
kustomize build k8s/overlays/production | kubectl apply -f -
```

### Vérifier le statut

```bash
kubectl get pods -n production
kubectl get deploy,svc,ingress -n production
kubectl rollout status deployment/frontend -n production
kubectl rollout status deployment/backend -n production
```

### Changer les images avec Kustomize

Images GHCR utilisées dans les overlays : **`ghcr.io/bhaon/m-motors-lld-frontend`** et **`ghcr.io/bhaon/m-motors-lld-backend`** (les workflows CI/CD mettent à jour les tags, en général sans édition manuelle).

Exemple manuel (production, à adapter avec vos tags) :

```bash
cd k8s/overlays/production
kustomize edit set image \
  ghcr.io/bhaon/m-motors-lld-frontend=ghcr.io/bhaon/m-motors-lld-frontend:vX.Y.Z \
  ghcr.io/bhaon/m-motors-lld-backend=ghcr.io/bhaon/m-motors-lld-backend:vX.Y.Z
```

## Conventions importantes

- Ne pas dupliquer les ressources : préférer **`base/`** + **patches**.
- Mettre les différences d’environnement dans **`overlays/<env>/`**.
- Garder les ressources cluster-level dans **`infra/`**.
- Vérifier la version des CRD Traefik : utiliser `traefik.io/v1alpha1` pour `Middleware` et `IngressRoute`.

## Erreurs fréquentes et corrections

### `no matches for kind "Middleware"`

Cause probable :

- CRD Traefik manquante, ou
- mauvaise `apiVersion`.

Vérifications :

```bash
kubectl get crd | rg traefik.io
kubectl api-resources | rg -i middleware
```

### `ImagePullBackOff`

Vérifier :

- secret GHCR (`imagePullSecrets`),
- tag / digest déployé,
- existence de l’image dans GHCR.

### `CrashLoopBackOff` backend après déploiement

Vérifier :

- variables DB (`POSTGRES_*` / `DATABASE_URL`),
- secret `SECRET_KEY`,
- exécution des migrations (`initContainer db-migrate`),
- connectivité **MinIO** / **S3** (URL interne vs URL publique pour URLs pré-signées — voir patches `minio-server-url.yaml`).

## Workflows CI/CD et manifests

Les workflows GitHub Actions sous **`.github/workflows/`** :

- construisent et poussent les images vers **GHCR** ;
- mettent à jour les tags d’image dans les overlays (selon l’environnement) ;
- appliquent les manifests Kustomize sur le cluster cible.

**Déclencheurs (résumé) :**

| Environnement | Déclencheur principal |
|---------------|------------------------|
| **dev** | Push sur **`develop`** lorsque des fichiers sous **`backend/**`** ou **`frontend/**`** changent (filtres `paths` et exclusions `!…` — détail dans `deploy-dev.yaml`) |
| **staging** | Push sur **`main`** avec la même logique **`backend/**`** / **`frontend/**`** (voir `deploy-staging.yaml`) |
| **production** | Push d’un **tag semver** `v*.*.*` sur les mêmes chemins applicatifs (voir `deploy-production.yaml`) ou **`workflow_dispatch`** avec saisie du tag |

En **production**, une **approbation manuelle** (GitHub Environments) est requise après la CI.

## Bonnes pratiques avant commit

```bash
kustomize build k8s/infra/dev > /tmp/infra-dev.yaml
kustomize build k8s/overlays/dev > /tmp/app-dev.yaml
```

Puis vérifier : namespace, images, probes, ressources, ingress / middlewares, cohérence **MinIO** / TLS.

## Runbook — déploiement production (10 étapes)

1. Vérifier que la branche **`main`** est à jour et stable.
2. Vérifier que la CI passe (tests, lint, build, scans).
3. Créer un tag semver sur le commit validé (`vX.Y.Z`).
4. Pousser le tag pour déclencher le workflow de production (ou lancer `workflow_dispatch` avec le tag).
5. Valider les jobs CI de production (build images + scan Trivy).
6. Valider l’approbation manuelle GitHub Environment **`production`**.
7. Contrôler le déploiement Kubernetes (`rollout status` frontend / backend).
8. Exécuter les smoke tests HTTP (`/api/healthz`, `/api/readyz`, `/`).
9. Vérifier l’état des pods et les events (`kubectl get pods`, `kubectl describe` en cas d’erreur).
10. Confirmer la release (GitHub Release + notification) et surveiller ~15 min.

### Commandes de vérification post-déploiement

```bash
kubectl get pods -n production
kubectl rollout status deployment/frontend -n production --timeout=300s
kubectl rollout status deployment/backend -n production --timeout=300s
kubectl get ingress -n production
```

### En cas d’incident (rollback rapide sur le cluster)

```bash
kubectl rollout undo deployment/frontend -n production
kubectl rollout undo deployment/backend -n production
kubectl rollout status deployment/frontend -n production --timeout=180s
kubectl rollout status deployment/backend -n production --timeout=180s
```

Le dépôt prévoit aussi un workflow **`rollback.yaml`** pour un retour arrière orchestré depuis GitHub Actions si vous l’utilisez.
