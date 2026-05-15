# Kiali — graphe des relations entre services (sans Istio)

## Contexte

**Kiali** est pensé pour Istio, mais peut être utilisé **sans mesh** si :

1. Les traces OTLP passent par le **collecteur OpenTelemetry** (`otel-collector`).
2. Le collecteur génère des métriques **spanmetrics / servicegraph** exposées à **Prometheus**.
3. Kiali lit **Prometheus** (topologie, trafic) et **Jaeger** (traces).

Sans collecteur, Kiali affiche surtout l’inventaire Kubernetes ; le **graphe de trafic** entre `mmotors-api` et `mmotors-frontend` reste vide.

## Architecture

```text
backend / frontend  --OTLP-->  otel-collector  --traces-->  Jaeger
                                    |
                                    +--métriques-->  Prometheus  <--  Kiali
```

## Déploiement (cluster production)

```bash
# 1. Manifests (Jaeger + collecteur + Ingress Kiali)
kubectl apply -f k8s/infra/monitoring/namespace-and-netpol.yaml
kubectl apply -k k8s/infra/monitoring

# 2. Kiali (Helm — release « kiali » → Service DNS « kiali »)
helm repo add kiali https://kiali.org/helm-charts
helm upgrade --install kiali kiali/kiali-server \
  -n monitoring \
  -f k8s/infra/monitoring/kiali-values.yaml

# 3. Redéployer les apps (endpoint OTLP = collecteur)
kubectl apply -k k8s/overlays/production
```

## DNS et URL

| Service | URL |
|---------|-----|
| Kiali | `https://kiali.opsdev.fr` |
| Jaeger | `https://jaeger.opsdev.fr` |
| Grafana | `https://grafana.opsdev.fr` |

Enregistrement DNS **`kiali.opsdev.fr`** → même IP que Traefik.

## Vérifications

```bash
kubectl get pods,svc -n monitoring | grep -E 'otel-collector|kiali|jaeger'
kubectl exec -n production deploy/backend -c backend -- env | grep OTEL_EXPORTER
# → http://otel-collector.monitoring.svc.cluster.local:4318
```

Dans Kiali : menu **Graph**, namespace **production**, générer du trafic sur le site puis rafraîchir.

## Alternative légère (sans Kiali)

- **Jaeger UI** → onglet lié aux dépendances entre services (à partir des traces).
- **Grafana** + métriques Prometheus existantes (sans graphe service dédié).

## Istio (non déployé)

Un graphe « mesh » complet (mTLS, règles Istio, etc.) nécessiterait **Istio + Kiali**. Ce n’est pas le modèle actuel (Traefik + NetworkPolicies).
