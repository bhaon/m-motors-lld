# Installation de l’environnement **production** from scratch — Ubuntu 24.04 LTS

Ce guide décrit comment remonter **de zéro** une plateforme compatible avec les manifests **M-Motors LLD** : une machine **Ubuntu Server 24.04 LTS**, un cluster **Kubernetes** (approche **K3s** recommandée, alignée sur le dépôt), puis la couche **TLS**, **secrets**, **infrastructure** et **application** en namespace `production`.

**Périmètre :**

- Installation OS + pare-feu + **K3s** sur le nœud (scénario VPS mono-nœud courant pour un projet Studi).
- Outils **kubectl**, **Helm**, **Kustomize**, **kubeseal** sur la même machine (ou sur une bastion Linux 24.04).
- Déploiement **cert-manager**, **Traefik** (config K3s du dépôt), **Sealed Secrets**, **`k8s/infra/production`**, puis **`k8s/overlays/production`**.
- Prérequis **DNS**, **GitHub Actions** (kubeconfig, déploiement automatisé).

Il **ne** remplace pas la lecture de **[k8s/README.MD](../../k8s/README.MD)** (ordre Kustomize, Jaeger, dépannage) ni de **[docs/k8s/setup/README.MD](setup/README.MD)** (détail K3s / pare-feu) : on les complète et on les recentre sur **production** et **Ubuntu 24.04**.

---

## Sommaire

1. [Prérequis](#1-prérequis)
2. [Préparation Ubuntu 24.04 LTS](#2-préparation-ubuntu-2404-lts)
3. [Installation de K3s](#3-installation-de-k3s)
4. [Outils d’administration (kubectl, Helm, Kustomize, kubeseal)](#4-outils-dadministration-kubectl-helm-kustomize-kubeseal)
5. [cert-manager et ClusterIssuer Let’s Encrypt](#5-cert-manager-et-clusterissuer-lets-encrypt)
6. [Traefik (K3s) et manifests du dépôt](#6-traefik-k3s-et-manifests-du-dépôt)
7. [Sealed Secrets et régénération des secrets](#7-sealed-secrets-et-régénération-des-secrets)
8. [Infrastructure namespace `production`](#8-infrastructure-namespace-production)
9. [Déploiement de l’application](#9-déploiement-de-lapplication)
10. [DNS, TLS et vérifications](#10-dns-tls-et-vérifications)
11. [CI/CD GitHub Actions](#11-cicd-github-actions)
12. [Dépannage rapide](#12-dépannage-rapide)

---

## 1. Prérequis

### 1.1 Matériel (indicatif)

| Ressource | Minimum | Confortable |
|-----------|---------|-------------|
| vCPU | 4 | 8 |
| RAM | 8 Go | 16 Go |
| Disque (SSD) | 80 Go | 200 Go+ |
| IP publique | 1 fixe | 1 fixe |

### 1.2 DNS (exemple aligné sur les manifests actuels)

À adapter si vous changez de domaine dans `k8s/overlays/production/ingress.yaml` et `configmap.yaml`.

| Enregistrement | Cible |
|-----------------|--------|
| `A` / `AAAA` `netdevops.fr` | IP publique du cluster (Ingress) |
| `A` / `AAAA` `www.netdevops.fr` | idem |
| `A` / `AAAA` `s3.netdevops.fr` | idem (MinIO exposé en HTTPS via Ingress) |
| Option observabilité | `jaeger.netdevops.fr` (voir `k8s/infra/monitoring/jaeger-ingress.yaml`) |

### 1.3 Comptes et accès

- Compte **GitHub** avec droits sur le dépôt et **GHCR** (pull d’images `ghcr.io/<org>/m-motors-lld-frontend` et `…-backend`).
- **Token GitHub** (PAT) avec au moins `read:packages` pour le pull d’images si vous scellez `ghcr-secret` (recommandé).

---

## 2. Préparation Ubuntu 24.04 LTS

Connexion SSH en utilisateur avec droits `sudo`.

### 2.1 Mise à jour et paquets de base

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git ca-certificates apt-transport-https gnupg
```

### 2.2 Swap, modules réseau et sysctl (Kubernetes)

Même logique que dans **[docs/k8s/setup/README.MD](setup/README.MD)** :

```bash
sudo swapoff -a
sudo sed -i '/\sswap\s/s/^/#/' /etc/fstab

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

### 2.3 Pare-feu (UFW) — indicatif

Autoriser **SSH**, **80/tcp**, **443/tcp**. Pour **K3s** en API sur **6443**, restreindre l’accès aux seules IPs de confiance (bastion, GitHub Actions — plages documentées : [GitHub Meta API](https://api.github.com/meta)).

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
# Exemple restreint (à adapter) :
# sudo ufw allow from VOTRE_IP_ADMIN to any port 6443 proto tcp
sudo ufw enable
sudo ufw status verbose
```

---

## 3. Installation de K3s

K3s embarque **Traefik** et un **metrics-server** léger ; les manifests du dépôt supposent la présence de Traefik et des CRD `traefik.io` (IngressRoute, Middleware).

Exemple d’installation (remplacer `VOTRE_IP_PUBLIQUE` et `VOTRE_DOMAINE` — détail supplémentaire dans **setup/README.MD**) :

```bash
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server \
  --tls-san VOTRE_IP_PUBLIQUE \
  --tls-san VOTRE_DOMAINE \
  --kube-apiserver-arg=enable-admission-plugins=NodeRestriction" sh -
```

Vérification :

```bash
sudo kubectl get nodes
sudo kubectl get pods -A
```

### kubeconfig pour utilisateur non-root (recommandé)

```bash
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown "$USER:$USER" ~/.kube/config
chmod 600 ~/.kube/config
```

Éditer `~/.kube/config` : remplacer `127.0.0.1:6443` par l’**IP publique** (ou DNS) du serveur API si vous administrez depuis l’extérieur.

---

## 4. Outils d’administration (kubectl, Helm, Kustomize, kubeseal)

### kubectl

Sur la machine K3s, le binaire est souvent suffisant :

```bash
sudo ln -sf /usr/local/bin/kubectl /usr/bin/kubectl 2>/dev/null || true
# ou installer un client aligné sur la version du serveur
```

### Helm 3

```bash
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
helm version
```

### Kustomize

```bash
curl -s "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh" | bash
sudo mv kustomize /usr/local/bin/
kustomize version
```

### kubeseal + contrôleur Sealed Secrets

Le dépôt fournit un script versionné (Helm + CLI) :

```bash
cd /chemin/vers/m-motors-lld
bash scripts/install-sealed-secrets.sh
```

---

## 5. cert-manager et ClusterIssuer Let’s Encrypt

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
kubectl wait --for=condition=Ready pods --all -n cert-manager --timeout=300s
```

**Avant** d’appliquer les issuers du dépôt, éditer l’e-mail ACME dans **`k8s/infra/cert-manager/cluster-issuer.yaml`** (remplacer `admin@votre-domaine.com`).

```bash
kubectl apply -f k8s/infra/cert-manager/cluster-issuer.yaml
kubectl get clusterissuer
```

---

## 6. Traefik (K3s) et manifests du dépôt

1. Surcharge de la configuration Traefik packagée avec K3s :

   ```bash
   kubectl apply -f k8s/infra/traefik/traefik-config.yaml
   ```

2. Middlewares / IngressRoutes globaux décrits dans le même dossier (selon votre besoin ; la production référence des middlewares `kube-system-*` et `production-*` — voir **[k8s/README.MD](../../k8s/README.MD)** et **`k8s/infra/monitoring/README.md`**).

   ```bash
   kubectl apply -f k8s/infra/traefik/ingressroutes.yaml
   ```

Redémarrage éventuel des pods Traefik dans `kube-system` si la config ne se recharge pas toute seule :

```bash
kubectl rollout restart deployment traefik -n kube-system
```

---

## 7. Sealed Secrets et régénération des secrets

### 7.1 Point critique : nouveau cluster = nouvelles clés

Les fichiers **`k8s/infra/production/sealedsecrets.yaml`** du dépôt sont chiffrés pour **le couple (contrôleur Sealed Secrets + clé privée)** du cluster qui les a générés.

Sur un **nouveau** cluster from scratch :

- soit vous **restaurez** la clé du contrôleur depuis une sauvegarde (hors scope de ce guide) ;
- soit vous **régénérez** tous les `SealedSecret` **après** installation du contrôleur sur ce cluster (cas le plus courant).

### 7.2 Fichier clair local (non versionné)

1. Créer **`k8s/infra/production/secrets.yaml`** (voir **`.gitignore`** : ce fichier ne doit **pas** être commité) contenant des ressources `Secret` Kubernetes en clair pour le namespace `production`, au minimum les objets attendus par les manifests (noms alignés sur **`sealedsecrets.yaml`** actuel du dépôt, à titre de modèle). Si le namespace `production` n’existe pas encore sur le cluster, vous pouvez le créer avant toute commande `kubectl` ciblée : `kubectl apply -f k8s/infra/production/namespace.yaml`.

   - `app-secrets` — clé `SECRET_KEY` (JWT / sessions).
   - `db-credentials` — `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`.
   - `redis-credentials` — `REDIS_PASSWORD`.
   - `resend-credentials` — `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (peuvent être vides en phase de test si le backend les tolère en optionnel).
   - `minio-credentials` — `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`.
   - `ghcr-secret` — type `kubernetes.io/dockerconfigjson` (identifiants GHCR pour `imagePullSecrets`).

   Pour `ghcr-secret`, génération typique :

   ```bash
   kubectl create secret docker-registry ghcr-secret \
     --docker-server=ghcr.io \
     --docker-username=GITHUB_USERNAME \
     --docker-password=GITHUB_PAT \
     --docker-email=EMAIL \
     --namespace=production \
     --dry-run=client -o yaml > /tmp/ghcr-secret.yaml
   ```

   Puis fusionner le document YAML dans `secrets.yaml` (multi-documents séparés par `---`).

2. Sceller et écrire `sealedsecrets.yaml` :

   ```bash
   bash scripts/seal-secrets.sh production
   ```

3. Vérifier puis **commiter** uniquement **`sealedsecrets.yaml`** (pas `secrets.yaml`).

---

## 8. Infrastructure namespace `production`

Depuis la racine du dépôt :

```bash
kustomize build k8s/infra/production | kubectl apply -f -
```

Cela déploie notamment : namespace, quotas, réseau, **SealedSecrets** (déchiffrés en `Secret` par le contrôleur), RBAC, middlewares de rate limiting production, etc.

Contrôles :

```bash
kubectl get sealedsecrets,secrets -n production
kubectl describe sealedsecret -n production  # en cas d’erreur de déchiffrement
```

---

## 9. Déploiement de l’application

### 9.1 Tags d’images GHCR

Les déploiements attendent des images **`ghcr.io/<owner>/m-motors-lld-frontend`** et **`…-backend`**. Sur un premier cluster sans pipeline :

```bash
cd k8s/overlays/production
kustomize edit set image \
  ghcr.io/bhaon/m-motors-lld-frontend=ghcr.io/bhaon/m-motors-lld-frontend:vX.Y.Z \
  ghcr.io/bhaon/m-motors-lld-backend=ghcr.io/bhaon/m-motors-lld-backend:vX.Y.Z
cd ../../..
```

(Remplacez **`bhaon`** / **`vX.Y.Z`** par l’organisation GitHub et un **tag d’image** réellement présent sur GHCR.)

### 9.2 Appliquer l’overlay production

```bash
kustomize build k8s/overlays/production | kubectl apply -f -
kubectl rollout status deployment/frontend -n production --timeout=300s
kubectl rollout status deployment/backend -n production --timeout=300s
kubectl rollout status deployment/minio -n production --timeout=300s
```

Santé applicative :

```bash
kubectl port-forward -n production svc/backend 8000:8000 &
curl -fsS http://127.0.0.1:8000/api/healthz
```

En frontal TLS (une fois les certificats émis) :

```bash
curl -fsS https://VOTRE_DOMAINE/api/healthz
curl -fsS https://VOTRE_DOMAINE/api/readyz
```

---

## 10. DNS, TLS et vérifications

1. Vérifier que les enregistrements DNS pointent vers l’IP exposant **80/443** (Traefik).
2. Surveiller les **Certificate** cert-manager et les **Ingress** :

   ```bash
   kubectl get certificate,certificaterequest -n production
   kubectl describe certificate -n production production-tls-secret
   kubectl get ingress -n production
   ```

3. Aligner les URLs dans **`k8s/overlays/production/configmap.yaml`** (`FRONTEND_BASE_URL`, `ALLOWED_ORIGINS`, `S3_PUBLIC_ENDPOINT_URL`, etc.) avec **vos** noms de domaine si vous ne utilisez pas `netdevops.fr`.

---

## 11. CI/CD GitHub Actions

Le workflow **Deploy → PRODUCTION** (voir **`.github/workflows/deploy-production.yaml`**) :

- attend un secret **`KUBECONFIG_PROD`** : contenu **base64** du fichier kubeconfig (même contenu que `~/.kube/config` adapté pour l’accès réseau au API server) ;
- exécute `kustomize build k8s/overlays/production | kubectl apply -f -` (il ne ré-applique **pas** automatiquement `k8s/infra/production` à chaque release : l’infra est supposée déjà en place ou mise à jour manuellement).

Configurer aussi l’environnement GitHub **`production`** (reviewers obligatoires) et les variables / secrets documentés dans le workflow (URL smoke, Slack, etc.).

---

## 12. Dépannage rapide

| Symptôme | Piste |
|----------|--------|
| `SealedSecret` en erreur | Mauvais cluster / clé : régénérer avec `scripts/seal-secrets.sh` sur **ce** cluster. |
| `ImagePullBackOff` | Secret `ghcr-secret` manquant ou PAT expiré ; vérifier `imagePullSecrets` sur les pods. |
| `Certificate` bloqué HTTP-01 | DNS, ports 80 ouverts, classe `traefik`, pas de redirection globale bloquant `/.well-known/acme-challenge/`. |
| Backend `CrashLoopBackOff` | Logs du `initContainer` `db-migrate` ; secrets DB / `SECRET_KEY` ; reachability PostgreSQL/Redis dans le namespace. |
| 502 sur Ingress | Voir **[k8s/README.MD](../../k8s/README.MD)** et **`k8s/infra/monitoring/README.md`** (middlewares Traefik, endpoints Service). |

---

## Ressources liées

| Document | Rôle |
|----------|------|
| [k8s/README.MD](../../k8s/README.MD) | Ordre d’application, Jaeger, commandes Kustomize |
| [docs/k8s/setup/README.MD](setup/README.MD) | K3s, UFW, cert-manager, esquisse multi-env |
| [docs/k8s/docs-minio-ingress.md](docs-minio-ingress.md) | MinIO derrière Ingress |
| [docs/monitoring/us-08-03-observabilite-v1.md](../monitoring/us-08-03-observabilite-v1.md) | Prometheus / Grafana / Loki (Helm) |

---

*Document généré pour Ubuntu **24.04 LTS** et les manifests du dépôt **m-motors-lld** ; adapter domaines, organisation GitHub et versions d’images selon votre fork.*
