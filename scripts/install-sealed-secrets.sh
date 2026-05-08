#!/bin/bash
# ============================================================
# INSTALLATION — Sealed Secrets Controller + kubeseal CLI
#
# Prérequis : kubectl configuré sur le cluster cible, helm installé
# Usage     : bash scripts/install-sealed-secrets.sh
# ============================================================
set -euo pipefail

SEALED_SECRETS_VERSION="2.16.2"
KUBESEAL_VERSION="0.27.3"

echo "=== Installation Sealed Secrets Controller ==="

# Vérifications préalables
command -v kubectl >/dev/null 2>&1 || { echo "❌ kubectl non trouvé"; exit 1; }
command -v helm >/dev/null 2>&1    || { echo "❌ helm non trouvé"; exit 1; }

kubectl cluster-info >/dev/null 2>&1 || { echo "❌ Impossible de joindre le cluster (kubectl)"; exit 1; }

echo "✅ kubectl et cluster accessibles"

# Ajout du repo Helm Bitnami
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets --force-update
helm repo update sealed-secrets

# Installation / upgrade du contrôleur dans kube-system
helm upgrade --install sealed-secrets sealed-secrets/sealed-secrets \
  --namespace kube-system \
  --version "${SEALED_SECRETS_VERSION}" \
  --set "fullnameOverride=sealed-secrets-controller" \
  --wait --timeout 120s

echo "✅ Contrôleur sealed-secrets installé (kube-system)"

# Attente que le contrôleur soit prêt
kubectl rollout status deployment/sealed-secrets-controller \
  -n kube-system --timeout=120s

echo ""
echo "=== Installation kubeseal CLI ==="

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
[ "$ARCH" = "x86_64" ] && ARCH="amd64"
[ "$ARCH" = "aarch64" ] && ARCH="arm64"

KUBESEAL_URL="https://github.com/bitnami-labs/sealed-secrets/releases/download/v${KUBESEAL_VERSION}/kubeseal-${KUBESEAL_VERSION}-${OS}-${ARCH}.tar.gz"

echo "Téléchargement kubeseal ${KUBESEAL_VERSION} (${OS}/${ARCH})..."
curl -sSL "${KUBESEAL_URL}" | tar -xz -C /tmp kubeseal
sudo install -m 755 /tmp/kubeseal /usr/local/bin/kubeseal

echo "✅ kubeseal installé : $(kubeseal --version)"
echo ""
echo "Étape suivante → Renseigner les valeurs réelles dans k8s/infra/*/secrets.yaml"
echo "Puis exécuter  → scripts/seal-secrets.sh [dev|staging|production]"