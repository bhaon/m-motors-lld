# Monitoring (Kubernetes) — manifests

Manifests et valeurs Helm pour **Jaeger**, **otel-collector**, **Prometheus**, **Grafana**, **Loki**, **alertes US-08-03** et dashboard Grafana.

**Documentation complète (déploiement, OTEL, logs, traces, exploitation, dépannage) :** [docs/monitoring/README.md](../../../docs/monitoring/README.md)

## Déploiement rapide

```bash
kubectl apply -f k8s/infra/monitoring/namespace-and-netpol.yaml
helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace -f k8s/infra/monitoring/prometheus-values.yaml
helm upgrade --install loki grafana/loki-stack -n monitoring \
  -f k8s/infra/monitoring/loki-values.yaml
kubectl apply -f k8s/infra/monitoring/alert-rules.yaml
# Si un ancien ServiceMonitor « backend-metrics » existe encore dans production :
# kubectl delete servicemonitor backend-metrics -n production --ignore-not-found
kubectl apply -f k8s/infra/monitoring/grafana-dashboard-us08-configmap.yaml
kubectl apply -k k8s/infra/monitoring
```

Scripts : `./scripts/diagnose-jaeger.sh`, `./scripts/diagnose-loki.sh`, `./scripts/setup-jaeger-auth-secret.sh` (Basic Auth UI Jaeger)
