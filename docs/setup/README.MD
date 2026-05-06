# INITIAL SETUP

## Pré requis et préparation

### Prérequis VM ou VPS

Ressource | Minimum | Recommandé
vCPU | 2 cores | 4 cores
RAM | 4 Go | 8 Go
Stockage | 80 Go SSD | 200 Go SSD NVMe
OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS
IP Publique | 1 IP Statique | 1 IP Statique

### Pré requis DNS
- app-dev.votre-domaine.com -> IP_VM (environnement développeur)
- staging.votre-domaine.com -> IP_VM (environnement staging)
- votre-domainee.com -> IP_VPS (production)
- www.votre-domaine.com -> IP_VPS (production, alias)

### Pré requis Github
- Repository GitHub avec les branches : main et develop
- GitHub Environments configurés : dev, staging et production
- GitHub Packages (GHCR) activé pour le repository
- Secrets GitHub à configurer (voir plus bas)

## Installation K3S

### Préparation du système
```bash
# Mise à jour système
sudo apt update && sudo apt upgrade -y

# Installation des dépendances
sudo apt install -y curl wget git ufw fail2ban

# Désactivation du swap (requis par Kubernetes)
sudo swapoff -a
sudo sed -i '/swap/d' /etc/fstab

# Activation des modules kernel nécessaires
cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf
br_netfilter
overlay
EOF
sudo modprobe br_netfilter overlay

# Paramètres réseau kernel
cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
sudo sysctl --system
```

### Configuration du Firewall
```bash
# Politique par défaut : tout bloquer
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Autoriser SSH (adapter le port si non-standard)
sudo ufw allow 22/tcp comment 'SSH'

# Ports HTTP/HTTPS (Traefik)
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'

# API Server K3S (restreindre aux IPs GitHub Actions)
# Voir https://api.github.com/meta pour la liste des IPs GitHub
sudo ufw allow from 140.82.112.0/20 to any port 6443 comment 'GitHub Actions API K3S'
sudo ufw allow from 143.55.64.0/20 to any port 6443 comment 'GitHub Actions API K3S'

# Activer UFW
sudo ufw enable
sudo ufw status verbose
```

### installation de K3S
# Installation K3S avec Traefik activé et metrics-server
```bash
# Installation K3S avec Traefik activé et metrics-server
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server \
  --tls-san $(curl -s ifconfig.me) \
  --tls-san votre-domaine.com \
  --kube-apiserver-arg=enable-admission-plugins=NodeRestriction \
  --kube-controller-manager-arg=node-monitor-grace-period=40s" sh -

# Vérification
sudo kubectl get nodes
sudo kubectl get pods -A

# Récupérer le kubeconfig
sudo cat /etc/rancher/k3s/k3s.yaml
```
Remplacer 127.0.0.1 par l'IP Publique de la VM puis copier le Kubeconfig dans un fichier /tmp/kubeconfig_ip_publique

### Installation de cert-manager
```bash
# Installation cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml

# Attendre que les pods soient prêts
kubectl wait --for=condition=Ready pods --all -n cert-manager --timeout=120s

# Appliquer les ClusterIssuers Let's Encrypt
kubectl apply -f k8s/infra/cert-manager/cluster-issuer.yaml
```

### Installation de Sealed Secrets
```bash
# Sealed Secrets — Chiffrement des secrets pour Git
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets
helm install sealed-secrets sealed-secrets/sealed-secrets \
  -n kube-system \
  --set fullnameOverride=sealed-secrets-controller

# Installer kubeseal (outil local)
KUBESEAL_VERSION=$(curl -s https://api.github.com/repos/bitnami-labs/sealed-secrets/releases/latest | grep tag_name | cut -d '"' -f 4 | cut -c 2-)
curl -OL "https://github.com/bitnami-labs/sealed-secrets/releases/download/v${KUBESEAL_VERSION}/kubeseal-${KUBESEAL_VERSION}-linux-amd64.tar.gz"
tar -xvzf kubeseal-${KUBESEAL_VERSION}-linux-amd64.tar.gz kubeseal
sudo install -m 755 kubeseal /usr/local/bin/kubeseal
```

## Déploiement initial des namespaces

### Création des namespaces et infrastructure de base
```bash
# Cloner le repository
git clone https://github.com/YOUR_ORG/YOUR_REPO.git
cd YOUR_REPO

# Créer les 3 namespaces avec leurs configurations
kubectl apply -f k8s/infra/dev/namespace.yaml
kubectl apply -f k8s/infra/staging/namespace.yaml
kubectl apply -f k8s/infra/production/namespace.yaml

# Vérification des namespaces
kubectl get namespaces
```

### Création des secrets applicatifs
à voir comment sécuriser pour garder dans le git

### Création du secret GHCR pour le pull d'images
```bash
# Sur la VM, pour que K3S puisse puller depuis GHCR
GITHUB_USERNAME= your_user_name
GITHUB_TOKEN= your_token
EMAIL= your_email

kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username= ${GITHUB_USERNAME} \
  --docker-password= ${GITHUB_TOKEN} \
  --docker-email= ${EMAIL} \
  -n dev

kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username= ${GITHUB_USERNAME} \
  --docker-password= ${GITHUB_TOKEN} \
  --docker-email= ${EMAIL} \
  -n staging

kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username= ${GITHUB_USERNAME} \
  --docker-password= ${GITHUB_TOKEN} \
  --docker-email= ${EMAIL} \
  -n production


