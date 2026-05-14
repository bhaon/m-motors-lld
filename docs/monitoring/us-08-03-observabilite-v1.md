# US-08-03 — Observabilité V1 (Prometheus, Grafana, Loki, alertes)

**En tant qu’équipe technique**, nous monitorons l’application dès la V1 : métriques applicatives, dashboard Grafana, logs centralisés avec rétention 90 jours, alertes critiques (P95 > 2 s, taux d’erreur > 1 %) avec notification email via **Resend** (SMTP).

Ce document s’appuie sur les manifests existants sous `k8s/infra/monitoring/`, le chart **kube-prometheus-stack**, **Loki** (Helm), **OpenTelemetry** déjà branché sur le backend et le frontend (traces + logs OTLP — voir [observabilite-opentelemetry.md](./observabilite-opentelemetry.md)), et complète par des **métriques HTTP Prometheus** exposées par l’API FastAPI.

---

## 1. Architecture récapitulative

| Besoin (DoD) | Réalisation dans le projet |
|----------------|-----------------------------|
| Temps de réponse, taux d’erreur | Histogramme `http_request_duration_highr_seconds` + compteur `http_requests_total` (`prometheus-fastapi-instrumentator`), scrape via `ServiceMonitor` (`alert-rules.yaml`). |
| Saturation | Panneaux Grafana (CPU conteneur backend) + règles existantes `ContainerHighCPU` / mémoire dans `alert-rules.yaml`. |
| Dashboard Grafana | ConfigMap `grafana-dashboard-us08-configmap.yaml` (import auto si sidecar dashboards actif). |
| Logs centralisés, 90 j | **Loki** + **Promtail** ; rétention `2160h` dans `loki-values.yaml` (adapter la taille du PVC). |
| Alertes P95 > 2 s, erreurs > 1 % | Groupe PrometheusRule `us-08-backend-http` dans `alert-rules.yaml`. |
| Email (Resend) | SMTP Resend + récepteur Alertmanager (snippet + prérequis ci-dessous). |

**OpenTelemetry** continue de fournir **traces** (Jaeger / OTLP) et **logs OTLP** lorsque les variables d’environnement sont définies. Les **métriques RED** au format Prometheus sont exposées sur `GET /metrics` (non routées par l’Ingress public `/api` — scrape cluster uniquement).

---

## 2. Backend — exposition `/metrics`

- Fichier : `backend/app/prometheus_metrics.py` (enregistré depuis `app/main.py`).
- Désactivation : `PROMETHEUS_METRICS_ENABLED=false`.
- Dépendance : `prometheus-fastapi-instrumentator` (voir `backend/requirements.txt`).

En local :

```bash
cd backend && pip install -r requirements.txt
export SECRET_KEY=dev-secret-not-for-production-please-change-32chars!
curl -s http://127.0.0.1:8000/metrics | head
```

---

## 3. Déploiement Kubernetes (ordre indicatif)

### 3.1 Namespace et politiques

```bash
kubectl apply -f k8s/infra/monitoring/namespace-and-netpol.yaml
```

### 3.2 kube-prometheus-stack (Prometheus + Grafana + Alertmanager)

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace \
  -f k8s/infra/monitoring/prometheus-values.yaml
```

### 3.3 Loki + Promtail

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm upgrade --install loki grafana/loki-stack -n monitoring \
  -f k8s/infra/monitoring/loki-values.yaml
```

La **rétention** des logs est portée à **90 jours** (`2160h`). Sur un VPS, surveiller l’usage disque ; augmenter `loki.persistence.size` si besoin.

### 3.4 Règles d’alerte et ServiceMonitors

```bash
kubectl apply -f k8s/infra/monitoring/alert-rules.yaml
```

Inclut les `ServiceMonitor` **dev**, **staging**, **production** pour le port `http` du backend sur le chemin `/metrics`.

### 3.5 Dashboard Grafana (US-08-03)

```bash
kubectl apply -f k8s/infra/monitoring/grafana-dashboard-us08-configmap.yaml
```

Le sidecar Grafana du chart doit conserver le label `grafana_dashboard` (défaut aligné sur `prometheus-values.yaml`).

### 3.6 Jaeger (traces, optionnel)

```bash
kubectl apply -k k8s/infra/monitoring
```

---

## 4. Alertes critiques (DoD) — détail

Fichier `k8s/infra/monitoring/alert-rules.yaml`, groupe **`us-08-backend-http`** :

- **`BackendAPILatencyP95High`** : `histogram_quantile(0.95, …)` sur `http_request_duration_highr_seconds_bucket` (pods `backend.*`, namespaces staging/production), seuil **> 2** secondes pendant 5 minutes, sévérité **critical**.
- **`BackendAPIErrorRateHigh`** : ratio `http_requests_total{status="5xx"}` / total sur les mêmes cibles, seuil **> 1 %** pendant 5 minutes, sévérité **critical**.

Des règles complémentaires **Traefik** (`ingress-health`) restent disponibles pour la latence / erreurs au niveau Ingress.

---

## 5. Notifications email via Resend (Alertmanager)

Resend propose un relais **SMTP** (`smtp.resend.com`, TLS). Alertmanager envoie des alertes en **email** ; il faut :

1. Un domaine / expéditeur vérifié dans Resend.
2. Une **API key** Resend utilisée comme mot de passe SMTP (`auth_username` : `resend` selon la doc Resend).
3. Montage du secret dans le pod Alertmanager (Helm : `alertmanager.alertmanagerSpec.secrets` + `alertmanager.alertmanagerSpec.configSecret` ou surcharge `alertmanager.config`).

Exemple de fragment **Alertmanager** (à adapter, ne pas committer de secrets en clair) :

```yaml
receivers:
  - name: email-resend
    email_configs:
      - to: "equipe-tech@example.com"
        from: "alerts@example.com"
        smarthost: smtp.resend.com:587
        auth_username: resend
        auth_password_file: /etc/alertmanager/secrets/resend/api-key
route:
  routes:
    - matchers:
        - severity="critical"
      receiver: email-resend
      continue: true
```

Créer le secret (une fois) :

```bash
kubectl create secret generic alertmanager-resend \
  --from-literal=api-key="re_xxxx" \
  -n monitoring
```

Puis référencer le fichier monté dans `alertmanagerSpec` (voir la doc Helm **kube-prometheus-stack** pour `extraSecretMounts` / `secrets`).

**Grafana** peut aussi envoyer des alertes email (section `grafana.ini` SMTP dans `prometheus-values.yaml`) ; pour homogénéité **Alertmanager** reste la source unique pour les règles Prometheus.

---

## 6. Variables d’environnement (rappel OTEL)

| Variable | Rôle |
|----------|------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Traces (et logs si configuré) vers collecteur / Jaeger. |
| `OTEL_LOGS_EXPORTER` | `none` si seules les traces vers Jaeger. |
| `OTEL_SDK_DISABLED` | `true` en tests Pytest (désactive l’instrumentation trace/log). |

Les **logs** des pods sont toujours collectés par **Promtail → Loki** (indépendamment d’OTLP).

---

## 7. Vérifications rapides

```bash
kubectl get servicemonitor -A | grep backend-metrics
kubectl get prometheusrules -n monitoring app-alerts
kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090
# UI Prometheus : Status → Targets — endpoints backend /metrics « UP »
```

---

## 8. Limites connues (V1)

- Le **frontend Next.js** n’expose pas `/metrics` Prometheus : la latence côté navigateur / SSR est vue via **Traefik** + métriques **backend** pour les appels API.
- Le dashboard Grafana suppose un UID datasource **`prometheus`** ; si votre instance utilise un autre UID, éditez le JSON du ConfigMap ou rebasculez le datasource par défaut.
- La rétention **90 j** Loki augmente fortement le stockage : surveiller `kubelet_volume_stats_used_bytes` / alertes PVC existantes.

---

## 9. Fichiers modifiés ou ajoutés (référence)

| Fichier | Contenu |
|---------|---------|
| `backend/app/prometheus_metrics.py` | Instrumentation Prometheus FastAPI. |
| `backend/requirements.txt` | `prometheus-fastapi-instrumentator`. |
| `k8s/infra/monitoring/alert-rules.yaml` | Règles US-08 + `ServiceMonitor` dev. |
| `k8s/infra/monitoring/loki-values.yaml` | Rétention 90 j, PVC 40 Gi. |
| `k8s/infra/monitoring/grafana-dashboard-us08-configmap.yaml` | Dashboard indicateurs clés. |
| `docs/monitoring/us-08-03-observabilite-v1.md` | Ce document. |

