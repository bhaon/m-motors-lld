# Monitoring — Jaeger (Kubernetes)

Ce répertoire contient les **manifests Kubernetes** pour déployer **Jaeger all-in-one** (collecte OTLP + UI) dans le namespace **`monitoring`**, ainsi que l’exposition Traefik / cert-manager.

## Fichiers (ordre logique)

| Fichier | Ressources | Rôle |
|---------|--------------|------|
| **`jaeger.yaml`** | `Deployment` `jaeger`, `Service` `jaeger` | Image `jaegertracing/all-in-one`, ports OTLP **4317/4318**, UI **16686**. |
| **`jaeger-netpol.yaml`** | `NetworkPolicy` | Ingress OTLP depuis les pods **backend** / **frontend** (`component: api` / `component: web`) ; UI depuis `kube-system` (Traefik). |
| **`jaeger-ingress.yaml`** | `Certificate` (×3), `Ingress` HTTP redirect, `Ingress` HTTPS (×3) | TLS Let’s Encrypt, hôtes `jaeger-dev`, `jaeger-staging`, `jaeger.netdevops.fr`. |
| **`kustomization.yaml`** | Kustomize | Point d’entrée : `kubectl apply -k k8s/infra/monitoring`. |

Le namespace **`monitoring`** et certaines politiques réseau transverses sont définis dans le même répertoire : **`namespace-and-netpol.yaml`**.

## Déploiement

```bash
# 1) Namespace + politiques de base (si pas déjà appliqué)
kubectl apply -f k8s/infra/monitoring/namespace-and-netpol.yaml

# 2) Jaeger + Ingress + certificats
kubectl apply -k k8s/infra/monitoring
```

Prérequis : DNS vers l’Ingress pour les hôtes déclarés dans `jaeger-ingress.yaml`, middlewares Traefik (`staging-auth`, `rate-limit`, etc.) déjà déployés selon `k8s/infra/traefik/traefik-config.yaml`.

Voir aussi **`k8s/README.MD`** (section Jaeger) et **`docs/monitoring/observabilite-opentelemetry.md`**.
