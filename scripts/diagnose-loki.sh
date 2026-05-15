#!/usr/bin/env bash
# Diagnostic Loki / Promtail / Grafana — à lancer sur le VPS où tourne la prod.
set -euo pipefail

NS_MON="${NS_MON:-monitoring}"
NS_APP="${NS_APP:-production}"
LOKI_SVC="${LOKI_SVC:-loki}"

section() { echo ""; echo "=== $* ==="; }

section "1. Pods monitoring (Loki, Promtail, Grafana)"
kubectl get pods -n "$NS_MON" -o wide 2>/dev/null | grep -E 'NAME|loki|promtail|grafana' || kubectl get pods -n "$NS_MON"

section "2. Service Loki"
if ! kubectl get svc -n "$NS_MON" "$LOKI_SVC" &>/dev/null; then
  echo "ERREUR: Service « $LOKI_SVC » absent. Le release Helm doit s'appeler « loki » :"
  echo "  helm upgrade --install loki grafana/loki-stack -n $NS_MON -f k8s/infra/monitoring/loki-values.yaml"
  echo "Services disponibles :"
  kubectl get svc -n "$NS_MON" | grep -i loki || true
fi
kubectl get svc -n "$NS_MON" "$LOKI_SVC" -o wide 2>/dev/null || true

section "3. Pods application (production)"
kubectl get pods -n "$NS_APP" -l app=backend 2>/dev/null || kubectl get pods -n "$NS_APP"

section "4. Labels Loki (vide = aucun log ingéré)"
kubectl run loki-labels-test --rm -i --restart=Never -n "$NS_MON" \
  --image=curlimages/curl:8.5.0 --command -- \
  curl -sS -m 10 "http://${LOKI_SVC}.${NS_MON}.svc.cluster.local:3100/loki/api/v1/labels" 2>/dev/null \
  || echo "(échec curl — Loki injoignable ou pod test refusé)"

section "5. Dernières lignes logs Promtail (erreurs push / parsing)"
PROMTAIL_DS=$(kubectl get ds -n "$NS_MON" -l app.kubernetes.io/name=promtail -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
if [[ -n "$PROMTAIL_DS" ]]; then
  kubectl logs -n "$NS_MON" "daemonset/${PROMTAIL_DS}" --tail=40 2>/dev/null \
    | grep -iE 'error|warn|refused|401|404|500' || echo "(aucune erreur évidente dans les 40 dernières lignes)"
else
  echo "ERREUR: DaemonSet Promtail introuvable dans $NS_MON"
fi

section "6. Datasource Grafana (depuis le pod Grafana)"
GRAFANA_POD=$(kubectl get pods -n "$NS_MON" -l app.kubernetes.io/name=grafana -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
if [[ -n "$GRAFANA_POD" ]]; then
  kubectl exec -n "$NS_MON" "$GRAFANA_POD" -c grafana -- \
    wget -qO- "http://${LOKI_SVC}:3100/ready" 2>/dev/null && echo " → Loki /ready OK depuis Grafana" \
    || echo "ERREUR: Grafana ne joint pas Loki sur http://${LOKI_SVC}:3100"
else
  echo "(pod Grafana non trouvé — kube-prometheus-stack installé ?)"
fi

section "7. Requêtes LogQL à tester dans Explore"
cat <<EOF

  1) Tous les flux production (sans filtre pod) :
     {namespace="$NS_APP"}

  2) Backend :
     {namespace="$NS_APP", pod=~"backend-.*"}

  3) Si (1) est vide : Loki ne reçoit rien → revoir Promtail / même cluster que la prod.

EOF

section "Fin"
echo "Cluster courant : $(kubectl config current-context 2>/dev/null || echo '?')"
