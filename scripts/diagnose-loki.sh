#!/usr/bin/env bash
# Diagnostic Loki / Promtail / Grafana — à lancer sur le VPS où tourne la prod.
set -euo pipefail

NS_MON="${NS_MON:-monitoring}"
NS_APP="${NS_APP:-production}"
LOKI_SVC="${LOKI_SVC:-loki}"

section() { echo ""; echo "=== $* ==="; }

# Exécute une commande dans le conteneur Grafana Running (évite le pod en CrashLoop).
grafana_exec() {
  local pod
  pod=$(kubectl get pods -n "$NS_MON" -l app.kubernetes.io/name=grafana \
    --field-selector=status.phase=Running \
    -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
  if [[ -z "$pod" ]]; then
    echo "(aucun pod Grafana Running)"
    return 1
  fi
  kubectl exec -n "$NS_MON" "$pod" -c grafana -- "$@"
}

section "1. Pods monitoring (Loki, Promtail, Grafana)"
kubectl get pods -n "$NS_MON" -o wide 2>/dev/null | grep -E 'NAME|loki|promtail|grafana' || kubectl get pods -n "$NS_MON"
GRAFANA_BAD=$(kubectl get pods -n "$NS_MON" -l app.kubernetes.io/name=grafana --no-headers 2>/dev/null | grep -cv Running || true)
if [[ "${GRAFANA_BAD:-0}" -gt 0 ]]; then
  echo ""
  echo "ATTENTION: pod(s) Grafana non Running — supprimer le pod en erreur puis helm upgrade :"
  echo "  kubectl delete pod -n $NS_MON -l app.kubernetes.io/name=grafana --field-selector=status.phase!=Running"
fi

section "2. Service Loki + endpoints"
kubectl get svc -n "$NS_MON" "$LOKI_SVC" -o wide 2>/dev/null || echo "Service $LOKI_SVC absent"
kubectl get endpoints -n "$NS_MON" "$LOKI_SVC" -o wide 2>/dev/null || true

section "3. Pods application ($NS_APP)"
kubectl get pods -n "$NS_APP" -l app=backend 2>/dev/null || kubectl get pods -n "$NS_APP"

section "4. API Loki — labels (depuis Grafana, nom court DNS)"
if grafana_exec wget -qO- -T 5 "http://${LOKI_SVC}:3100/loki/api/v1/labels" 2>/dev/null; then
  echo ""
else
  echo "ERREUR: impossible de joindre http://${LOKI_SVC}:3100/loki/api/v1/labels depuis Grafana"
fi

section "4b. Test FQDN (souvent en échec sous K3s — datasource Grafana doit utiliser http://loki:3100)"
if grafana_exec wget -qO- -T 5 "http://${LOKI_SVC}.${NS_MON}.svc.cluster.local:3100/ready" 2>/dev/null; then
  echo " → FQDN OK"
else
  echo "FQDN en échec (normal sur certains K3s) — utiliser http://loki:3100 dans la datasource Grafana"
fi

section "5. Config Promtail (URL push Loki)"
PROMTAIL_POD=$(kubectl get pods -n "$NS_MON" -l app.kubernetes.io/name=promtail \
  -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
if [[ -n "$PROMTAIL_POD" ]]; then
  kubectl get secret -n "$NS_MON" loki-promtail -o jsonpath='{.data.promtail\.yaml}' 2>/dev/null \
    | base64 -d 2>/dev/null | grep -A2 'clients:' || true
  echo ""
  echo "Fichiers logs production sur le nœud (via Promtail) :"
  kubectl exec -n "$NS_MON" "$PROMTAIL_POD" -- sh -c \
    "ls -d /var/log/pods/${NS_APP}_* 2>/dev/null | head -5 || echo '(aucun répertoire ${NS_APP}_* sous /var/log/pods)'"
else
  echo "ERREUR: pod Promtail introuvable"
fi

section "6. Logs Promtail (push / erreurs)"
PROMTAIL_DS=$(kubectl get ds -n "$NS_MON" -l app.kubernetes.io/name=promtail \
  -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
if [[ -n "$PROMTAIL_DS" ]]; then
  kubectl logs -n "$NS_MON" "daemonset/${PROMTAIL_DS}" --tail=80 2>/dev/null \
    | grep -iE 'error|warn|refused|client|batch|status|production|backend' \
    || echo "(aucune ligne error/warn/production dans les 80 dernières lignes)"
fi

section "7. Loki (ingestion / erreurs)"
kubectl logs -n "$NS_MON" "statefulset/loki" --tail=30 2>/dev/null \
  | grep -iE 'error|warn|ingest|push' || echo "(rien d'anormal dans les 30 dernières lignes Loki)"

section "8. LogQL à tester dans Explore (datasource Loki, plage « Last 1 hour »)"
cat <<EOF

  {namespace="$NS_APP"}
  {namespace="$NS_APP", pod=~"backend-.*"}

EOF

section "Fin"
echo "Cluster : $(kubectl config current-context 2>/dev/null || echo '?')"
