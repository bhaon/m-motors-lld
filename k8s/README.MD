# Documentation Kubernetes - Usage des manifests

Ce dossier contient toute la configuration Kubernetes du projet, organisee avec **Kustomize**.

Objectif: deployer la meme application sur `dev`, `staging` et `production` avec un socle commun et des variations minimales par environnement.

## Structure du dossier

```text
k8s/
├── base/                    # Manifests communs (deployments, services, redis, postgres...)
├── overlays/
│   ├── dev/                 # Surcharge environment dev
│   ├── staging/             # Surcharge environment staging
│   └── production/          # Surcharge environment production
└── infra/
    ├── dev|staging|production/   # Namespace, quotas, rbac, secrets, hpa, pdb...
    ├── traefik/                  # Config Traefik / middlewares / ingressroutes
    ├── cert-manager/             # ClusterIssuer, certificats
    └── monitoring/               # Prometheus/Loki/alerting/backup
```

## Principe de fonctionnement

- `base/` definit les ressources applicatives communes.
- `overlays/<env>/` ajoute et modifie la base pour chaque environnement:
  - `configmap.yaml`
  - `ingress.yaml`
  - `patches/*` (replicas, ressources, securite, stockage)
- `infra/<env>/` definit l'infrastructure Kubernetes de l'environnement (namespace, politiques reseau, RBAC, etc.).

## Ordre recommande d'application

Toujours appliquer dans cet ordre:

1. **Infra environnement** (`k8s/infra/<env>`)
2. **Infra transverse** si necessaire (`k8s/infra/traefik`, `k8s/infra/cert-manager`, `k8s/infra/monitoring`)
3. **Application** (`k8s/overlays/<env>`)

Pourquoi: les manifests applicatifs supposent que namespace, secrets, RBAC et CRDs existent deja.

## Commandes utiles

## Previsualiser le rendu Kustomize

```bash
kustomize build k8s/overlays/dev
kustomize build k8s/overlays/staging
kustomize build k8s/overlays/production
```

## Appliquer un environnement

```bash
# 1) Infra
kustomize build k8s/infra/production | kubectl apply -f -

# 2) Application
kustomize build k8s/overlays/production | kubectl apply -f -
```

## Verifier le statut

```bash
kubectl get pods -n production
kubectl get deploy,svc,ingress -n production
kubectl rollout status deployment/frontend -n production
kubectl rollout status deployment/backend -n production
```

## Changer les images avec Kustomize

Exemple production:

```bash
cd k8s/overlays/production
kustomize edit set image \
  ghcr.io/bhaon/studi-bloc3-mmotors-frontend=ghcr.io/bhaon/studi-bloc3-mmotors-frontend:vX.Y.Z \
  ghcr.io/bhaon/studi-bloc3-mmotors-backend=ghcr.io/bhaon/studi-bloc3-mmotors-backend:vX.Y.Z
```

## Conventions importantes

- Ne pas dupliquer les ressources: preferer `base/` + `patches`.
- Mettre les differences environment dans `overlays/<env>/`.
- Garder les ressources cluster-level dans `infra/`.
- Verifier la version des CRDs Traefik: utiliser `traefik.io/v1alpha1` pour `Middleware` et `IngressRoute`.

## Erreurs frequentes et corrections

## `no matches for kind "Middleware"`

Cause probable:
- CRD Traefik manquante, ou
- mauvaise `apiVersion`.

Checks:

```bash
kubectl get crd | rg traefik.io
kubectl api-resources | rg -i middleware
```

## `ImagePullBackOff`

Verifier:
- secret GHCR (`imagePullSecrets`),
- tag/digest deploye,
- existence de l'image dans GHCR.

## `CrashLoopBackOff` backend apres deploiement

Verifier:
- variables DB (`POSTGRES_*` / `DATABASE_URL`),
- secret `SECRET_KEY`,
- execution des migrations (`initContainer db-migrate`).

## Workflow CI/CD et manifests

Les workflows GitHub Actions:
- buildent et pushent les images vers GHCR,
- mettent a jour les tags d'image dans les overlays,
- appliquent les manifests Kustomize sur le cluster cible.

En production, le deploiement est declenche sur tag `vX.Y.Z` avec validation manuelle.

## Bonnes pratiques de modification

Avant commit:

```bash
kustomize build k8s/infra/dev > /tmp/infra-dev.yaml
kustomize build k8s/overlays/dev > /tmp/app-dev.yaml
```

Puis verifier:
- namespace correct,
- images correctes,
- probes et ressources presentes,
- absence de regressions sur ingress/middlewares.

## Runbook - Deploiement production (10 etapes)

1. Verifier que la branche `main` est a jour et stable.
2. Verifier que la CI passe (tests, lint, build, scans).
3. Creer un tag semver sur le commit valide (`vX.Y.Z`).
4. Pousser le tag pour declencher le workflow de production.
5. Valider les jobs CI de production (build images + scan Trivy).
6. Valider l'approbation manuelle GitHub Environment `production`.
7. Controler le deploiement Kubernetes (`rollout status` frontend/backend).
8. Executer les smoke tests HTTP (`/api/healthz`, `/api/readyz`, `/`).
9. Verifier l'etat des pods et events (`kubectl get pods`, `kubectl describe` en cas d'erreur).
10. Confirmer la release (GitHub Release + notification) et surveiller 15 min.

### Commandes de verification post-deploiement

```bash
kubectl get pods -n production
kubectl rollout status deployment/frontend -n production --timeout=300s
kubectl rollout status deployment/backend -n production --timeout=300s
kubectl get ingress -n production
```

### En cas d'incident (rollback rapide)

```bash
kubectl rollout undo deployment/frontend -n production
kubectl rollout undo deployment/backend -n production
kubectl rollout status deployment/frontend -n production --timeout=180s
kubectl rollout status deployment/backend -n production --timeout=180s
```

