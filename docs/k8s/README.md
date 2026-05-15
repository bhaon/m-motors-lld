# Documentation Kubernetes — M-Motors LLD

Guide de référence pour déployer et exploiter l’application **M-Motors LLD** sur Kubernetes (K3s recommandé), à partir des manifests du dépôt (`k8s/`).

**Périmètre de ce document :** structure Kustomize, installation du cluster, TLS, secrets, infrastructure par namespace, déploiement applicatif, MinIO / Ingress, CI/CD et dépannage.

**Hors périmètre :** observabilité (Jaeger, Prometheus, Grafana, Loki, alertes) — voir [docs/monitoring/README.md](../monitoring/README.md).

---

## Sommaire

1. [Vue d’ensemble](#1-vue-densemble)
2. [Structure du dépôt `k8s/`](#2-structure-du-dépôt-k8s)
3. [Principe Kustomize et ordre d’application](#3-principe-kustomize-et-ordre-dapplication)
4. [Prérequis](#4-prérequis)
5. [Installation from scratch (Ubuntu 24.04 LTS)](#5-installation-from-scratch-ubuntu-2404-lts)
6. [Outils d’administration](#6-outils-dadministration)
7. [cert-manager et TLS](#7-cert-manager-et-tls)
8. [Traefik](#8-traefik)
9. [Sealed Secrets](#9-sealed-secrets)
10. [Déploiement par environnement](#10-déploiement-par-environnement)
11. [MinIO / S3 et Ingress](#11-minio--s3-et-ingress)
12. [Commandes utiles](#12-commandes-utiles)
13. [CI/CD GitHub Actions](#13-cicd-github-actions)
14. [Runbook — déploiement production](#14-runbook--déploiement-production)
15. [Dépannage fréquent](#15-dépannage-fréquent)
16. [Documentation complémentaire](#16-documentation-complémentaire)

---

## 1. Vue d’ensemble

L’application est déployée sur **trois environnements** (`dev`, `staging`, `production`) avec :

- un socle commun **`k8s/base/`** (frontend, backend, PostgreSQL, Redis, MinIO) ;
- des surcharges par environnement **`k8s/overlays/<env>/`** (Ingress, ConfigMap, patches réplicas / ressources / stockage / sécurité) ;
- une couche **infrastructure par namespace** **`k8s/infra/<env>/`** (quotas, RBAC, NetworkPolicy, Sealed Secrets) ;
- des composants **cluster-level** dans **`k8s/infra/traefik`** et **`k8s/infra/cert-manager`**.

Les secrets en clair (`secrets.yaml`) ne doivent **jamais** être versionnés : utiliser **Sealed Secrets** et le script `scripts/seal-secrets.sh`.

| Environnement | Branche / déclencheur CI (résumé) | Namespace |
|---------------|-----------------------------------|-----------|
| **dev** | Push sur `develop` (chemins `backend/**`, `frontend/**`) | `dev` |
| **staging** | Push sur `main` (mêmes chemins) | `staging` |
| **production** | Tag semver `v*.*.*` ou `workflow_dispatch` + approbation manuelle | `production` |

Images conteneurs : **`ghcr.io/bhaon/m-motors-lld-frontend`** et **`ghcr.io/bhaon/m-motors-lld-backend`** (tags mis à jour par les workflows CI/CD).

---

## 2. Structure du dépôt `k8s/`

```text
k8s/
├── base/                         # Workloads et services communs
│   ├── deployment.yaml           # frontend + backend (multi-doc)
│   ├── service.yaml
│   ├── postgresql.yaml
│   ├── redis.yaml
│   └── minio.yaml
├── overlays/
│   ├── dev/                      # Namespace dev, ingress, ConfigMap, patches
│   ├── staging/                  # Idem staging
│   └── production/               # + HPA, PDB, patch sécurité, patch URL MinIO
└── infra/
    ├── dev/                      # Namespace, quotas, RBAC, NetworkPolicy, SealedSecrets
    ├── staging/
    ├── production/               # + rate-limit Traefik, politique réseau sauvegardes
    ├── traefik/                  # IngressRoutes, configuration Traefik
    ├── cert-manager/             # ClusterIssuer (Let’s Encrypt)
    └── monitoring/               # Stack observabilité (documentée à part)
```

**Conventions :**

- Ne pas dupliquer les ressources : préférer **`base/`** + **patches** dans les overlays.
- Garder les ressources **cluster-level** (Traefik, cert-manager) dans **`infra/`**.
- CRD Traefik : utiliser **`traefik.io/v1alpha1`** pour `Middleware` et `IngressRoute`.
- Référence d’un middleware depuis un Ingress : **`{namespace}-{nom-du-middleware}@kubernetescrd`** (ex. `kube-system-redirect-to-https@kubernetescrd`, `production-rate-limit@kubernetescrd`).

---

## 3. Principe Kustomize et ordre d’application

| Couche | Rôle |
|--------|------|
| **`base/`** | Définitions communes des workloads et services data (PostgreSQL, Redis, MinIO). |
| **`overlays/<env>/`** | Compose la base + exposition (Ingress), configuration (ConfigMap), patches (réplicas, ressources, stockage, URL publique MinIO, etc.). |
| **`infra/<env>/`** | Namespace, quotas, RBAC, politiques réseau, Sealed Secrets pour l’environnement. |
| **`infra/traefik`**, **`infra/cert-manager`** | Ingress controller, middlewares globaux, émission de certificats TLS. |

**Ordre recommandé** (toujours respecter cette séquence) :

1. **Cluster** — K3s, outils (`kubectl`, `kustomize`, `kubeseal`, Helm si besoin).
2. **cert-manager** + **ClusterIssuer** Let’s Encrypt.
3. **Traefik** — config K3s + manifests du dépôt.
4. **Sealed Secrets** — contrôleur installé (`scripts/install-sealed-secrets.sh`).
5. **Infra environnement** — `k8s/infra/<env>`.
6. **Application** — `k8s/overlays/<env>`.

Les manifests applicatifs supposent que les namespaces, secrets, RBAC et CRD Traefik existent déjà.

```bash
# Prévisualiser le rendu
kustomize build k8s/overlays/dev
kustomize build k8s/overlays/staging
kustomize build k8s/overlays/production

# Appliquer (exemple production)
kustomize build k8s/infra/production | kubectl apply -f -
kustomize build k8s/overlays/production | kubectl apply -f -
```

---

## 4. Prérequis

### 4.1 Matériel (indicatif)

| Contexte | vCPU | RAM | Disque (SSD) |
|----------|------|-----|--------------|
| Minimum (dev / petit staging) | 2–4 | 4–8 Go | 80 Go |
| Production confortable | 8 | 16 Go | 200 Go+ |
| IP publique | 1 fixe | — | — |

### 4.2 DNS (exemple multi-environnement)

À adapter selon vos domaines dans `k8s/overlays/<env>/ingress.yaml` et `configmap.yaml`.

| Environnement | Hôtes typiques (exemple dépôt) |
|---------------|--------------------------------|
| **dev** | `app-dev.votre-domaine.com` |
| **staging** | `staging.votre-domaine.com`, `s3-staging.votre-domaine.com` |
| **production** | `opsdev.fr`, `www.opsdev.fr`, `s3.opsdev.fr` (manifests actuels) |

Tous les enregistrements **`A` / `AAAA`** doivent pointer vers l’IP exposant **80** et **443** (Traefik).

### 4.3 GitHub et registre d’images

- Dépôt avec branches **`develop`** (dev) et **`main`** (staging / base des tags prod).
- **GitHub Environments** : `dev`, `staging`, `production` (approbation manuelle en production).
- **GHCR** activé ; PAT avec `read:packages` pour le secret `ghcr-secret`.
- Secrets workflow : notamment **`KUBECONFIG_PROD`** (kubeconfig encodé base64 pour la production).

---

## 5. Installation from scratch (Ubuntu 24.04 LTS)

Scénario courant : **VPS mono-nœud** avec **K3s** (Traefik et metrics-server intégrés).

### 5.1 Préparation système

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git ca-certificates apt-transport-https gnupg ufw

# Désactiver le swap (requis Kubernetes)
sudo swapoff -a
sudo sed -i '/\sswap\s/s/^/#/' /etc/fstab

# Modules et sysctl
cat <<'EOF' | sudo tee /etc/modules-load.d/k8s.conf
br_netfilter
overlay
EOF
sudo modprobe br_netfilter overlay

cat <<'EOF' | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
sudo sysctl --system
```

### 5.2 Pare-feu (UFW)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
# API K3s (6443) : restreindre aux IPs de confiance (admin, CI)
# Plages GitHub Actions : https://api.github.com/meta
# sudo ufw allow from <IP_ADMIN> to any port 6443 proto tcp
sudo ufw enable
sudo ufw status verbose
```

### 5.3 Installation K3s

K3s embarque Traefik ; les manifests supposent les CRD `traefik.io` (`IngressRoute`, `Middleware`).

```bash
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server \
  --tls-san VOTRE_IP_PUBLIQUE \
  --tls-san VOTRE_DOMAINE \
  --kube-apiserver-arg=enable-admission-plugins=NodeRestriction" sh -

sudo kubectl get nodes
sudo kubectl get pods -A
```

**kubeconfig pour un utilisateur non-root :**

```bash
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown "$USER:$USER" ~/.kube/config
chmod 600 ~/.kube/config
```

Remplacer `127.0.0.1:6443` par l’**IP publique** ou le **DNS** du serveur API si administration distante.

### 5.4 Déploiement initial multi-environnements (optionnel)

Sur une même machine, créer les trois namespaces avant les secrets et overlays :

```bash
git clone https://github.com/VOTRE_ORG/m-motors-lld.git
cd m-motors-lld

kubectl apply -f k8s/infra/dev/namespace.yaml
kubectl apply -f k8s/infra/staging/namespace.yaml
kubectl apply -f k8s/infra/production/namespace.yaml
kubectl get namespaces
```

Puis enchaîner les sections [7](#7-cert-manager-et-tls) à [10](#10-déploiement-par-environnement) pour chaque environnement cible.

---

## 6. Outils d’administration

| Outil | Installation (indicatif) |
|-------|---------------------------|
| **kubectl** | Souvent fourni avec K3s : `sudo ln -sf /usr/local/bin/kubectl /usr/bin/kubectl` |
| **Helm 3** | `curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 \| bash` |
| **Kustomize** | Script officiel `install_kustomize.sh` → `/usr/local/bin/kustomize` |
| **kubeseal** + contrôleur | `bash scripts/install-sealed-secrets.sh` depuis la racine du dépôt |

Vérifications :

```bash
kubectl version --client
helm version
kustomize version
kubeseal --version
```

---

## 7. cert-manager et TLS

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
kubectl wait --for=condition=Ready pods --all -n cert-manager --timeout=300s
```

**Avant** d’appliquer les issuers du dépôt, éditer l’e-mail ACME dans `k8s/infra/cert-manager/cluster-issuer.yaml`.

```bash
kubectl apply -f k8s/infra/cert-manager/cluster-issuer.yaml
kubectl get clusterissuer
```

Contrôles après déploiement applicatif :

```bash
kubectl get certificate,certificaterequest -n production
kubectl describe certificate -n production
kubectl get ingress -n production
```

En cas de **Certificate** bloqué en HTTP-01 : DNS correct, ports 80 ouverts, classe `traefik`, pas de redirection globale bloquant `/.well-known/acme-challenge/`.

---

## 8. Traefik

1. Surcharge de la configuration Traefik packagée avec K3s :

   ```bash
   kubectl apply -f k8s/infra/traefik/traefik-config.yaml
   kubectl apply -f k8s/infra/traefik/ingressroutes.yaml
   ```

2. Si la config ne se recharge pas :

   ```bash
   kubectl rollout restart deployment traefik -n kube-system
   ```

Les overlays référencent des middlewares (`kube-system-redirect-to-https`, rate-limit par namespace, CORS S3, etc.). Vérifier que les CRD existent :

```bash
kubectl get crd | grep traefik.io
kubectl api-resources | grep -i middleware
```

Erreur **`no matches for kind "Middleware"`** : CRD Traefik absente ou mauvaise `apiVersion` — utiliser `traefik.io/v1alpha1`.

---

## 9. Sealed Secrets

### 9.1 Principe

- Fichiers versionnés : **`k8s/infra/<env>/sealedsecrets.yaml`**.
- Fichier local **non versionné** : **`k8s/infra/<env>/secrets.yaml`** (voir `.gitignore` et `secrets.example.yaml`).

### 9.2 Nouveau cluster = nouvelles clés

Les `SealedSecret` existants dans Git sont chiffrés pour **le couple contrôleur + clé privée** du cluster qui les a générés.

Sur un cluster **neuf** :

- restaurer la clé du contrôleur depuis une sauvegarde, **ou**
- régénérer tous les `SealedSecret` après installation du contrôleur (cas le plus courant).

### 9.3 Création des secrets (production — modèle)

Créer `k8s/infra/production/secrets.yaml` (ne pas committer) avec au minimum :

| Secret | Clés attendues |
|--------|----------------|
| `app-secrets` | `SECRET_KEY` |
| `db-credentials` | `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` |
| `redis-credentials` | `REDIS_PASSWORD` |
| `resend-credentials` | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| `minio-credentials` | `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` |
| `ghcr-secret` | type `kubernetes.io/dockerconfigjson` |

Exemple `ghcr-secret` :

```bash
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=GITHUB_USERNAME \
  --docker-password=GITHUB_PAT \
  --docker-email=EMAIL \
  --namespace=production \
  --dry-run=client -o yaml >> k8s/infra/production/secrets.yaml
```

Sceller et committer uniquement le résultat :

```bash
bash scripts/seal-secrets.sh production
# ou tous les environnements :
bash scripts/seal-secrets.sh
```

Vérification :

```bash
kubectl get sealedsecrets,secrets -n production
kubectl describe sealedsecret -n production
```

---

## 10. Déploiement par environnement

### 10.1 Infrastructure

```bash
kustomize build k8s/infra/dev | kubectl apply -f -
kustomize build k8s/infra/staging | kubectl apply -f -
kustomize build k8s/infra/production | kubectl apply -f -
```

### 10.2 Application

**Premier déploiement production** — fixer les tags d’images si la CI n’a pas encore tourné :

```bash
cd k8s/overlays/production
kustomize edit set image \
  ghcr.io/bhaon/m-motors-lld-frontend=ghcr.io/bhaon/m-motors-lld-frontend:vX.Y.Z \
  ghcr.io/bhaon/m-motors-lld-backend=ghcr.io/bhaon/m-motors-lld-backend:vX.Y.Z
cd ../../..

kustomize build k8s/overlays/production | kubectl apply -f -
kubectl rollout status deployment/frontend -n production --timeout=300s
kubectl rollout status deployment/backend -n production --timeout=300s
kubectl rollout status deployment/minio -n production --timeout=300s
```

**Changement d’images manuel** (même principe sur `dev` / `staging`) :

```bash
cd k8s/overlays/<env>
kustomize edit set image \
  ghcr.io/bhaon/m-motors-lld-frontend=ghcr.io/bhaon/m-motors-lld-frontend:TAG \
  ghcr.io/bhaon/m-motors-lld-backend=ghcr.io/bhaon/m-motors-lld-backend:TAG
```

### 10.3 Vérifications

```bash
kubectl get pods -n production
kubectl get deploy,svc,ingress -n production
kubectl rollout status deployment/frontend -n production
kubectl rollout status deployment/backend -n production

# Santé API (port-forward)
kubectl port-forward -n production svc/backend 8000:8000 &
curl -fsS http://127.0.0.1:8000/api/healthz

# Frontal TLS (DNS + certificats OK)
curl -fsS https://VOTRE_DOMAINE/api/healthz
curl -fsS https://VOTRE_DOMAINE/api/readyz
```

Aligner **`k8s/overlays/production/configmap.yaml`** (`FRONTEND_BASE_URL`, `ALLOWED_ORIGINS`, `S3_PUBLIC_ENDPOINT_URL`, etc.) avec vos noms de domaine réels.

### 10.4 Bonnes pratiques avant commit

```bash
kustomize build k8s/infra/dev > /tmp/infra-dev.yaml
kustomize build k8s/overlays/dev > /tmp/app-dev.yaml
```

Contrôler : namespace, images, probes, ressources, ingress / middlewares, cohérence MinIO / TLS.

---

## 11. MinIO / S3 et Ingress

MinIO tourne dans le cluster ; l’accès navigateur passe par un **Ingress S3** dédié (HTTPS via Traefik + cert-manager).

### 11.1 Alignement des URLs

| Variable / élément | Rôle |
|--------------------|------|
| `S3_PUBLIC_ENDPOINT_URL` (ConfigMap backend) | Endpoint utilisé par boto3 pour **signer** les URLs pré-signées. |
| Hostname Ingress S3 (ex. `s3-staging.netdevops.fr`) | Doit correspondre au schéma + host des URLs signées. |
| `MINIO_SERVER_URL` (patch Deployment MinIO) | URL publique vue par MinIO derrière reverse-proxy — **identique** au hostname HTTPS de l’Ingress S3. |

### 11.2 Middleware CORS Traefik

Un `Middleware` nommé `s3-cors` dans le namespace `staging` se référence ainsi sur l’Ingress S3 :

```text
staging-s3-cors@kubernetescrd
```

Une référence incorrecte du type `s3-cors-staging@…` ne applique **aucun en-tête CORS** : erreurs CORS navigateur sur `PUT` / `GET` / préflight `OPTIONS`.

### 11.3 Network policies et CORS applicatif

- MinIO accepte l’ingress depuis **kube-system** (Traefik) et depuis le **backend**.
- Le backend appelle aussi `put_bucket_cors` avec `ALLOWED_ORIGINS` : les origines du frontend (ex. `https://staging.netdevops.fr`) doivent y figurer.

### 11.4 Après modification

```bash
kubectl apply -k k8s/overlays/staging
kubectl rollout restart deployment/minio -n staging
```

Vérifier : host des URLs pré-signées = `S3_PUBLIC_ENDPOINT_URL`, TLS valide, réponses `OPTIONS` / `PUT` avec en-têtes CORS sur la route S3.

---

## 12. Commandes utiles

```bash
# Statut global
kubectl get pods -n <env>
kubectl get deploy,svc,ingress -n <env>
kubectl describe pod <pod> -n <env>

# Rollback rapide (production)
kubectl rollout undo deployment/frontend -n production
kubectl rollout undo deployment/backend -n production
kubectl rollout status deployment/frontend -n production --timeout=180s
kubectl rollout status deployment/backend -n production --timeout=180s
```

Le dépôt prévoit aussi un workflow **`rollback.yaml`** pour un retour arrière orchestré depuis GitHub Actions.

---

## 13. CI/CD GitHub Actions

Workflows sous **`.github/workflows/`** :

| Fichier | Rôle |
|---------|------|
| `deploy-dev.yaml` | Build + push GHCR + apply Kustomize sur **dev** |
| `deploy-staging.yaml` | Idem **staging** |
| `deploy-production.yaml` | Build + scan + apply **production** (approbation Environment) |
| `rollback.yaml` | Rollback orchestré (optionnel) |

**Comportement général :**

- construction et push des images vers **GHCR** ;
- mise à jour des tags dans les overlays ;
- `kustomize build k8s/overlays/<env> | kubectl apply -f -`.

**Déclencheurs :**

| Environnement | Déclencheur |
|---------------|-------------|
| **dev** | Push `develop` si `backend/**` ou `frontend/**` changent |
| **staging** | Push `main` (mêmes filtres `paths`) |
| **production** | Tag semver `v*.*.*` ou `workflow_dispatch` + saisie du tag |

**Production — points d’attention :**

- Secret **`KUBECONFIG_PROD`** : kubeconfig encodé base64 (accès réseau au API server).
- Le workflow **ne ré-applique pas** systématiquement `k8s/infra/production` à chaque release : l’infra est supposée déjà en place ou mise à jour manuellement.
- Environnement GitHub **`production`** avec reviewers obligatoires.

---

## 14. Runbook — déploiement production

1. Vérifier que la branche **`main`** est à jour et stable.
2. Vérifier que la CI passe (tests, lint, build, scans).
3. Créer un tag semver sur le commit validé (`vX.Y.Z`).
4. Pousser le tag (ou lancer `workflow_dispatch` avec le tag).
5. Valider les jobs CI (build images + scan Trivy).
6. Valider l’approbation manuelle GitHub Environment **`production`**.
7. Contrôler le déploiement Kubernetes (`rollout status` frontend / backend).
8. Exécuter les smoke tests HTTP (`/api/healthz`, `/api/readyz`, `/`).
9. Vérifier pods et events (`kubectl get pods`, `kubectl describe` si erreur).
10. Confirmer la release (GitHub Release + notification) et surveiller ~15 min.

**Vérification post-déploiement :**

```bash
kubectl get pods -n production
kubectl rollout status deployment/frontend -n production --timeout=300s
kubectl rollout status deployment/backend -n production --timeout=300s
kubectl get ingress -n production
```

---

## 15. Dépannage fréquent

| Symptôme | Piste |
|----------|--------|
| `SealedSecret` en erreur | Mauvais cluster / clé : régénérer avec `scripts/seal-secrets.sh` sur **ce** cluster. |
| `ImagePullBackOff` | Secret `ghcr-secret` manquant, PAT expiré, tag inexistant sur GHCR ; vérifier `imagePullSecrets`. |
| `no matches for kind "Middleware"` | CRD Traefik absente ; vérifier `apiVersion` `traefik.io/v1alpha1`. |
| `Certificate` bloqué | DNS, port 80, classe ingress, challenge ACME non bloqué. |
| Backend `CrashLoopBackOff` | Logs `initContainer` `db-migrate` ; secrets DB / `SECRET_KEY` ; connectivité PostgreSQL / Redis ; MinIO (URL interne vs publique). |
| Erreurs CORS upload S3 | Référence middleware Traefik ; alignement `S3_PUBLIC_ENDPOINT_URL` / Ingress / `MINIO_SERVER_URL` ; `ALLOWED_ORIGINS`. |
| 502 sur Ingress | Endpoints Service, pods prêts, middlewares Traefik, sélecteurs labels. |

**Backend après déploiement — checklist :**

- variables DB (`POSTGRES_*` / `DATABASE_URL`) ;
- secret `SECRET_KEY` ;
- migrations (`initContainer db-migrate`) ;
- connectivité MinIO et cohérence des URLs pré-signées (section [11](#11-minio--s3-et-ingress)).

---

## 16. Documentation complémentaire

| Document | Rôle |
|----------|------|
| [docs/monitoring/README.md](../monitoring/README.md) | Observabilité, logs, traces, alertes, exploitation |
| Manifests observabilité | `k8s/infra/monitoring/` (hors scope de ce guide) |
| [docs/cicd/README.md](../cicd/README.md) | GitHub Actions, secrets, environments, déploiements |
| Exemples secrets | `k8s/infra/<env>/secrets.example.yaml` |

---

*Guide synthétisé pour les manifests **m-motors-lld** (K3s, Kustomize, Traefik, cert-manager, Sealed Secrets). Adapter domaines, organisation GitHub et tags d’images selon votre fork.*
