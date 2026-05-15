#!/usr/bin/env bash
# Diagnostic Jaeger (UI https://jaeger.opsdev.fr) sur le cluster production.
set -euo pipefail

HOST="${JAEGER_HOST:-jaeger.opsdev.fr}"
NS_MON="${NS_MON:-monitoring}"
NS_APP="${NS_APP:-production}"

section() { echo ""; echo "=== $* ==="; }

section "1. Pod / Service / Endpoints Jaeger"
kubectl get pods,svc,endpoints -n "$NS_MON" -l app=jaeger 2>/dev/null || echo "ERREUR: Jaeger absent — kubectl apply -k k8s/infra/monitoring"

section "2. Ingress + certificat TLS"
kubectl get ingress,certificate -n "$NS_MON" 2>/dev/null | grep -E 'NAME|jaeger' || true

section "3. Middleware Traefik (compress requis par l’Ingress Jaeger)"
kubectl get middleware -n kube-system compress 2>/dev/null || echo "ERREUR: appliquer k8s/infra/traefik/traefik-config.yaml"
kubectl get middleware -n kube-system redirect-to-https 2>/dev/null || true

section "4. OTLP depuis les pods production (variables OTel)"
for dep in backend frontend; do
  echo "--- $dep ---"
  kubectl get deploy -n "$NS_APP" "$dep" -o jsonpath='{range .spec.template.spec.containers[0].env[*]}{.name}={.value}{"\n"}{end}' 2>/dev/null \
    | grep -E '^OTEL_' || echo "(pas de variables OTEL — appliquer overlay production avec otel-jaeger.yaml)"
done

section "5. Test UI en local (si Ingress/DNS en échec)"
echo "  kubectl port-forward -n $NS_MON svc/jaeger 16686:16686"
echo "  puis http://localhost:16686"

section "6. Services visibles dans Jaeger (API)"
kubectl run jaeger-svc-test --rm -i --restart=Never -n "$NS_MON" \
  --image=curlimages/curl:8.5.0 --command -- \
  curl -sS "http://jaeger:16686/api/services" 2>/dev/null \
  || echo "(échec — port-forward : kubectl port-forward -n $NS_MON svc/jaeger 16686:16686)"
echo ""
echo "Attendu : mmotors-api, mmotors-frontend. Si seul « jaeger-all-in-one » : pas de traces applicatives."
echo "  → kubectl apply -k k8s/overlays/production && générer du trafic (pas seulement /api/readyz)."

section "7. DNS"
echo "  $HOST doit pointer vers l’IP publique de ce cluster (même IP que opsdev.fr / Traefik)."
getent hosts "$HOST" 2>/dev/null || host "$HOST" 2>/dev/null || echo "(résolution DNS non disponible depuis cette machine)"

section "Fin"
echo "Cluster : $(kubectl config current-context 2>/dev/null || echo '?')"
