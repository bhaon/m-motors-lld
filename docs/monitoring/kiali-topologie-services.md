# Topologie des services — Kiali vs alternatives (sans Istio)

## Verdict pour M-Motors LLD

**Oui : Kiali est conçu pour Istio.** Sans service mesh, l’UI affiche souvent :

- erreurs du type *« Istio APIs are not present »* ;
- validations ignorées (KIA1301, etc.) ;
- graphe **vide** ou incomplet (métriques Istio absentes) ;
- onglets mesh / mTLS / VirtualService inutilisables.

Les correctifs (`istio_api_enabled: false`, désactivation des actions Istio) permettent au **pod de démarrer**, mais **ne remplacent pas** un mesh. Pour ce projet (Traefik + NetworkPolicies), **ne pas compter sur Kiali** pour la topologie.

**Recommandation :** utiliser **Jaeger** (et Grafana) ; **désinstaller Kiali** si déjà installé (voir ci-dessous).

---

## Alternative recommandée : Jaeger (déjà en place)

1. Ouvrir **https://jaeger.opsdev.fr**
2. Service : `mmotors-api` ou `mmotors-frontend` (selon les `service.name` OTLP)
3. **Find Traces** → générer du trafic sur le site (hors `/api/readyz`)
4. Ouvrir une trace → onglet **System Architecture** / vue des **dépendances** entre spans (frontend → API → DB, etc.)

C’est la vue la plus proche d’un « graphe de relations » **sans Istio**, avec les traces que vous envoyez déjà via `otel-collector` → Jaeger.

---

## Grafana (complément)

- Dashboard **US-08** : métriques + logs Loki.
- Pas de graphe service mesh natif équivalent à Kiali ; pour les **liens entre services**, privilégier Jaeger.

---

## Collecteur OpenTelemetry (garder)

Le **otel-collector** reste utile même sans Kiali :

- point d’entrée OTLP unique pour backend / frontend ;
- relais vers **Jaeger** ;
- possibilité d’ajouter d’autres exportateurs plus tard.

Il n’est **plus** nécessaire de générer des métriques `spanmetrics` / `servicegraph` pour Kiali (config simplifiée dans le dépôt).

---

## Désinstaller Kiali (VPS)

```bash
helm uninstall kiali -n monitoring

kubectl delete ingress -n monitoring kiali-http-redirect kiali-ui-production --ignore-not-found
kubectl delete certificate -n monitoring kiali-production-tls --ignore-not-found
kubectl delete netpol -n monitoring kiali-ui-from-traefik --ignore-not-found
```

Optionnel : retirer le DNS `kiali.opsdev.fr`.

Les manifests Kiali dans `k8s/infra/monitoring/` restent **optionnels** (non appliqués si vous ne faites pas `kubectl apply` sur `kiali-ingress.yaml` / `kiali-netpol.yaml`).

---

## Si vous vouliez vraiment Kiali « complet »

Il faudrait déployer **Istio** (ou un autre mesh supporté) sur le cluster : injection sidecar, control plane, métriques Istio — **hors périmètre** actuel du projet Studi (coût ops, complexité, interaction avec Traefik).

---

## Fichiers liés

| Fichier | Rôle |
|---------|------|
| `k8s/infra/monitoring/otel-collector.yaml` | OTLP → Jaeger |
| `k8s/overlays/*/patches/otel-jaeger.yaml` | Variables OTEL des apps |
| [observabilite-opentelemetry.md](./observabilite-opentelemetry.md) | Détail OTLP |
| [exploitation-monitoring.md](./exploitation-monitoring.md) | Exploitation quotidienne |
