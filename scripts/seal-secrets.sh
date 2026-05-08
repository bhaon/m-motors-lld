#!/bin/bash
# ============================================================
# SCELLEMENT DES SECRETS — Sealed Secrets
#
# Prérequis :
#   - kubeseal installé (scripts/install-sealed-secrets.sh)
#   - kubectl configuré sur le cluster cible
#   - k8s/infra/<env>/secrets.yaml renseigné avec les vraies valeurs
#
# Usage :
#   scripts/seal-secrets.sh [dev|staging|production]   # un environnement
#   scripts/seal-secrets.sh                            # tous les environnements
#
# Résultat :
#   k8s/infra/<env>/sealedsecrets.yaml → commitable dans GitHub ✅
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/../k8s" && pwd)"
CERT_FILE="/tmp/sealed-secrets-cert.pem"

# ── Vérifications ──────────────────────────────────────────
command -v kubeseal >/dev/null 2>&1 || {
  echo "❌ kubeseal non trouvé. Lancer : scripts/install-sealed-secrets.sh"
  exit 1
}

command -v python3 >/dev/null 2>&1 || {
  echo "❌ python3 requis pour le découpage multi-documents YAML"
  exit 1
}

# ── Récupération du certificat public du cluster ───────────
echo "Récupération du certificat public du cluster..."
kubeseal --fetch-cert \
  --controller-name=sealed-secrets-controller \
  --controller-namespace=kube-system \
  > "$CERT_FILE" 2>/dev/null || {
  echo "❌ Impossible de récupérer le certificat. Le contrôleur est-il installé ?"
  echo "   → scripts/install-sealed-secrets.sh"
  exit 1
}
echo "✅ Certificat récupéré"

# ── Fonction de scellement d'un environnement ─────────────
seal_env() {
  local ENV="$1"
  local NAMESPACE="$ENV"
  local SECRETS_FILE="$K8S_DIR/infra/$ENV/secrets.yaml"
  local SEALED_FILE="$K8S_DIR/infra/$ENV/sealedsecrets.yaml"

  if [ ! -f "$SECRETS_FILE" ]; then
    echo "⚠️  $SECRETS_FILE introuvable — ignoré (créer le fichier depuis secrets.yaml.example)"
    return
  fi

  echo ""
  echo "── Scellement $ENV (namespace: $NAMESPACE) ────────────"

  # Découper le fichier multi-documents et sceller chaque Secret individuellement
  python3 - "$SECRETS_FILE" "$NAMESPACE" "$CERT_FILE" "$SEALED_FILE" << 'PYEOF'
import sys
import subprocess
import os

secrets_file = sys.argv[1]
namespace    = sys.argv[2]
cert_file    = sys.argv[3]
output_file  = sys.argv[4]

with open(secrets_file) as f:
    content = f.read()

# Découper sur les séparateurs ---
docs = []
current = []
for line in content.splitlines():
    if line.strip() == '---':
        if current:
            docs.append('\n'.join(current))
        current = []
    else:
        current.append(line)
if current:
    docs.append('\n'.join(current))

# Filtrer les documents qui contiennent "kind: Secret"
sealed_docs = []
for doc in docs:
    if 'kind: Secret' not in doc:
        continue

    # Injecter le namespace dans les métadonnées (requis par kubeseal)
    lines = doc.splitlines()
    in_metadata = False
    has_namespace = False
    result = []
    for line in lines:
        if line.startswith('metadata:'):
            in_metadata = True
        if in_metadata and line.strip().startswith('namespace:'):
            has_namespace = True
        result.append(line)
        if in_metadata and not has_namespace and line.startswith('  name:'):
            result.append(f'  namespace: {namespace}')
            has_namespace = True

    patched = '\n'.join(result)

    # Appel kubeseal
    proc = subprocess.run(
        ['kubeseal', '--cert', cert_file, '--format', 'yaml'],
        input=patched.encode(),
        capture_output=True
    )
    if proc.returncode != 0:
        print(f'❌ Erreur kubeseal : {proc.stderr.decode()}')
        sys.exit(1)

    sealed_docs.append(proc.stdout.decode().strip())

with open(output_file, 'w') as f:
    header = (
        "---\n"
        "# ============================================================\n"
        f"# SEALED SECRETS — {namespace.upper()}\n"
        "# Généré automatiquement par scripts/seal-secrets.sh\n"
        "# Ce fichier peut être commité dans GitHub en toute sécurité.\n"
        "# ============================================================\n"
    )
    f.write(header)
    f.write('\n---\n'.join(sealed_docs))
    f.write('\n')

print(f'✅ {len(sealed_docs)} secret(s) scellé(s) → {output_file}')
PYEOF
}

# ── Environnements à traiter ───────────────────────────────
if [ $# -eq 0 ]; then
  ENVS=("dev" "staging" "production")
else
  ENVS=("$@")
fi

for env in "${ENVS[@]}"; do
  case "$env" in
    dev|staging|production) seal_env "$env" ;;
    *) echo "❌ Environnement inconnu : $env (dev|staging|production)"; exit 1 ;;
  esac
done

rm -f "$CERT_FILE"

echo ""
echo "✅ Scellement terminé."
echo "   Vous pouvez maintenant commiter les fichiers sealedsecrets.yaml :"
echo "   git add k8s/infra/*/sealedsecrets.yaml && git commit -m 'chore: seal secrets'"
echo ""
echo "⚠️  NE PAS commiter k8s/infra/*/secrets.yaml (ajouté au .gitignore)"