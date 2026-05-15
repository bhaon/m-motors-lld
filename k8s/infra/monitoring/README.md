# Monitoring (Kubernetes)

Ce répertoire regroupe les manifests **Jaeger**, **Prometheus rules / ServiceMonitors**, **Loki (values)**, **dashboard Grafana (US-08-03)** et la documentation associée dans **`docs/monitoring/`**.

## Fichiers (ordre logique)

| Fichier | Ressources | Rôle |
|---------|--------------|------|
| **`jaeger.yaml`** | `Deployment` `jaeger`, `Service` `jaeger` | Image `jaegertracing/all-in-one`, ports OTLP **4317/4318**, UI **16686**. |
| **`jaeger-netpol.yaml`** | `NetworkPolicy` | Ingress OTLP depuis les pods **backend** / **frontend** (`component: api` / `component: web`) ; UI depuis `kube-system` (Traefik). |
| **`jaeger-ingress.yaml`** | `Certificate` (×3), `Ingress` HTTP redirect, `Ingress` HTTPS (×3) | TLS Let’s Encrypt, hôtes `jaeger-dev`, `jaeger-staging`, `jaeger.netdevops.fr`. |
| **`alert-rules.yaml`** | `PrometheusRule`, `ServiceMonitor` (dev/staging/prod) | Alertes infra + **US-08-03** (P95 API, taux 5xx) ; scrape `/metrics` backend. |
| **`prometheus-values.yaml`** | Référence Helm | kube-prometheus-stack (Prometheus, Grafana, Alertmanager). |
| **`loki-values.yaml`** | Référence Helm | Loki + Promtail ; rétention **90 j** (US-08-03). |
| **`grafana-dashboard-us08-configmap.yaml`** | `ConfigMap` | Dashboard indicateurs clés (Prometheus + Loki). |
| **`kustomization.yaml`** | Kustomize | Point d’entrée Jaeger : `kubectl apply -k k8s/infra/monitoring`. |

Le namespace **`monitoring`** et certaines politiques réseau transverses sont définis dans le même répertoire : **`namespace-and-netpol.yaml`**.

## Déploiement

**Important** : Loki/Promtail/Grafana doivent être sur le **même cluster** que les workloads `production`. Si la prod a migré vers un autre VPS, réinstallez aussi la stack monitoring sur ce cluster.

```bash
# 1) Namespace + politiques de base (si pas déjà appliqué)
kubectl apply -f k8s/infra/monitoring/namespace-and-netpol.yaml

# 2) Jaeger + Ingress + certificats
kubectl apply -k k8s/infra/monitoring
```

**Loki** : ne pas laisser le chart `loki-stack` provisionner une datasource Grafana (`isDefault: true` → conflit avec Prometheus). C’est désactivé dans `loki-values.yaml` (`grafana.sidecar.datasources.enabled: false`) ; Loki est ajouté via `prometheus-values.yaml` → `additionalDataSources`.

Promtail est limité au namespace `production` et utilise le pipeline **cri** (K3s/containerd). Après changement de `loki-values.yaml` :

```bash
helm upgrade loki grafana/loki-stack -n monitoring -f k8s/infra/monitoring/loki-values.yaml
```

Prérequis : DNS vers l’Ingress pour les hôtes déclarés dans `jaeger-ingress.yaml`, middlewares Traefik (`staging-auth`, `rate-limit`, `compress`, etc.) déjà déployés selon `k8s/infra/traefik/traefik-config.yaml` et **`k8s/infra/production/rate-limit.yaml`** (namespace `production`).

Voir aussi **`k8s/README.MD`** (section Jaeger), **`docs/monitoring/observabilite-opentelemetry.md`** et **`docs/monitoring/us-08-03-observabilite-v1.md`** (Prometheus / Grafana / Loki / alertes).

## Dépannage — « Bad Gateway » (502) sur l’UI Jaeger

1. **Backend absent** : l’Ingress pointe vers le Service `jaeger` (port **16686**) dans **`monitoring`**. Vérifier qu’un pod tourne et que le Service a des endpoints.

   ```bash
   kubectl get pods,svc,endpoints -n monitoring -l app=jaeger
   kubectl logs -n monitoring -l app=jaeger --tail=50
   ```

   Si aucun pod : `kubectl apply -k k8s/infra/monitoring` (après `namespace-and-netpol.yaml` si besoin).

2. **Middleware Traefik introuvable** : l’Ingress production Jaeger utilise `production-rate-limit` et `kube-system-compress`. Ils doivent exister (`kubectl get middleware -n production` et `-n kube-system`). Sinon appliquer `k8s/infra/production/rate-limit.yaml` et `k8s/infra/traefik/traefik-config.yaml`.

3. **NetworkPolicy** : le fichier `jaeger-netpol.yaml` doit autoriser le port **16686** depuis le namespace **`kube-system`** (Traefik). Vérifier qu’aucune autre policy ne isole Jaeger de façon contradictoire.

4. **TLS / DNS** : un certificat invalide donne plutôt une erreur navigateur ; un 502 indique en général un problème **Traefik → Service** (points 1–2).
