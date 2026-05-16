#!/usr/bin/env bash
# Crée ou met à jour le Secret Traefik Basic Auth pour l’UI Jaeger.
# Usage : ./scripts/setup-jaeger-auth-secret.sh 'MotDePasseFort'
set -euo pipefail

NS="${JAEGER_AUTH_NS:-monitoring}"
USER="${JAEGER_AUTH_USER:-admin}"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <mot-de-passe>  (utilisateur : ${USER}, namespace : ${NS})" >&2
  exit 1
fi

HASH=$(openssl passwd -apr1 "$1")
kubectl create secret generic jaeger-auth-secret \
  --from-literal=users="${USER}:${HASH}" \
  -n "$NS" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Secret jaeger-auth-secret appliqué dans ${NS} (utilisateur : ${USER})."
echo "Puis : kubectl apply -k k8s/infra/monitoring  (le Secret n’est plus dans le kustomize)."
