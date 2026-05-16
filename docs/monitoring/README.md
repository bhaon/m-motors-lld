# Documentation observabilité et logs — M-Motors LLD

Guide de référence pour **métriques**, **logs centralisés** et **traces distribuées** du projet **M-Motors LLD** (OpenTelemetry, Prometheus, Grafana, Loki, Jaeger).

**Manifests cluster :** `k8s/infra/monitoring/`  
**Déploiement applicatif (hors monitoring) :** [docs/k8s/README.md](../k8s/README.md)

---

## Sommaire

1. [Vue d’ensemble](#1-vue-densemble)
2. [Les trois piliers](#2-les-trois-piliers)
3. [Fichiers et architecture](#3-fichiers-et-architecture)
4. [Ordre de déploiement Kubernetes](#4-ordre-de-déploiement-kubernetes)
5. [OpenTelemetry (traces et logs applicatifs)](#5-opentelemetry-traces-et-logs-applicatifs)
6. [Jaeger et collecteur OTLP](#6-jaeger-et-collecteur-otlp)
7. [Métriques Prometheus (backend)](#7-métriques-prometheus-backend)
8. [Loki et Promtail (logs centralisés)](#8-loki-et-promtail-logs-centralisés)
9. [Grafana, dashboard US-08-03 et alertes](#9-grafana-dashboard-us-08-03-et-alertes)
10. [Topologie des services (Jaeger vs Kiali)](#10-topologie-des-services-jaeger-vs-kiali)
11. [Guide d’exploitation](#11-guide-dexploitation)
12. [Dépannage](#12-dépannage)
13. [Limites connues](#13-limites-connues)
14. [Documentation complémentaire](#14-documentation-complémentaire)

---

## 1. Vue d’ensemble

| Besoin (US-08-03) | Réalisation |
|-------------------|-------------|
| Temps de réponse, taux d’erreur API | Prometheus scrape `GET /metrics` (FastAPI) + dashboard Grafana |
| Saturation CPU / mémoire | Panneaux Grafana + règles `ContainerHighCPU` / mémoire |
| Logs centralisés, rétention 90 j | **Loki** + **Promtail** (`loki-values.yaml`, rétention `2160h`) |
| Alertes P95 > 2 s, 5xx > 1 % | `PrometheusRule` groupe `us-08-backend-http` |
| Notification email | **Alertmanager** → SMTP **Resend** |
| Traces distribuées | **OpenTelemetry** → **otel-collector** → **Jaeger** |

**OpenTelemetry** fournit les **traces** (et logs OTLP optionnels). Les **métriques RED** au format Prometheus sont indépendantes et exposées sur `/metrics` (scrape cluster uniquement, pas via l’Ingress public `/api`).

---

## 2. Les trois piliers

| Pilier | Outil | Question à laquelle il répond |
|--------|--------|-----------------------------|
| **Métriques** | Prometheus + Grafana | L’API est-elle lente ou en erreur ? Le cluster est-il saturé ? |
| **Logs** | Loki (+ Promtail) | Quel message d’erreur, sur quel pod, à quelle heure ? |
| **Traces** | Jaeger (OTLP) | Quelle requête, quels appels DB / HTTP, où ça bloque ? |

**Corrélations utiles :**

```text
Alerte email (Alertmanager)
    → Grafana US-08 (namespace + heure)
        → Pic 5xx ou P95 ?
            → Loki (message + trace_id)
                → Jaeger (span SQL / httpx)
                    → kubectl (pod / events) si infra
```

---

## 3. Fichiers et architecture

Répertoire **`k8s/infra/monitoring/`** :

| Fichier | Rôle |
|---------|------|
| `namespace-and-netpol.yaml` | Namespace `monitoring` et politiques transverses |
| `jaeger.yaml` | Deployment + Service Jaeger (OTLP 4317/4318, UI 16686) |
| `jaeger-netpol.yaml` | OTLP depuis pods `component: api` / `web` ; UI depuis Traefik |
| `jaeger-auth.yaml` | Middleware Traefik Basic Auth (Secret via script) |
| `jaeger-ingress.yaml` | TLS + Ingress UI production (`jaeger.opsdev.fr`) |
| `otel-collector.yaml` | Relais OTLP → Jaeger |
| `otel-collector-netpol.yaml` | Politiques collecteur |
| `alert-rules.yaml` | `PrometheusRule` + `ServiceMonitor` dev/staging/prod |
| `prometheus-values.yaml` | Helm kube-prometheus-stack |
| `loki-values.yaml` | Helm loki-stack (rétention 90 j, Promtail CRI) |
| `grafana-dashboard-us08-configmap.yaml` | Dashboard « M-Motors — Observabilité V1 » |
| `backup-cronjob.yaml` | Sauvegardes (hors scope exploitation quotidienne) |
| `kiali-*.yaml` | **Optionnel — non recommandé sans Istio** |
| `kustomization.yaml` | Jaeger + collecteur : `kubectl apply -k k8s/infra/monitoring` |

**Code applicatif :**

| Composant | Fichiers clés |
|-----------|---------------|
| Backend | `backend/app/telemetry.py`, `prometheus_metrics.py`, `main.py` |
| Frontend | `frontend/src/instrumentation.ts`, `frontend/src/lib/logger.ts` |
| Compose local | `docker-compose.yml` (service `jaeger`) |

**Scripts de diagnostic :** `scripts/diagnose-jaeger.sh`, `scripts/diagnose-loki.sh`.

---

## 4. Ordre de déploiement Kubernetes

**Prérequis :** namespace `monitoring`, Traefik, cert-manager, applications déployées (voir [docs/k8s/README.md](../k8s/README.md)).

**Important :** Loki, Promtail et Grafana doivent tourner sur le **même cluster** que les pods applicatifs. Si la prod a migré vers un autre VPS sans réinstaller la stack monitoring, les logs afficheront **No data**.

### 4.1 Namespace et politiques

```bash
kubectl apply -f k8s/infra/monitoring/namespace-and-netpol.yaml
```

### 4.2 kube-prometheus-stack (Prometheus + Grafana + Alertmanager)

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace \
  -f k8s/infra/monitoring/prometheus-values.yaml
```

### 4.3 Loki + Promtail

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm upgrade --install loki grafana/loki-stack -n monitoring \
  -f k8s/infra/monitoring/loki-values.yaml
```

- Release Helm nommée **`loki`** (le Service DNS doit être `loki:3100`).
- Ne pas laisser le chart provisionner une datasource Grafana par défaut en conflit — voir `loki-values.yaml` et `additionalDataSources` dans `prometheus-values.yaml`.
- Promtail : pipeline **cri** (K3s/containerd), logs de **tous les namespaces** sauf `kube-system`, `kube-public`, `kube-node-lease`, `monitoring`.

### 4.4 Règles d’alerte et ServiceMonitors

```bash
kubectl apply -f k8s/infra/monitoring/alert-rules.yaml
```

### 4.5 Dashboard Grafana US-08-03

```bash
kubectl apply -f k8s/infra/monitoring/grafana-dashboard-us08-configmap.yaml
```

### 4.6 Jaeger + collecteur OTLP

```bash
kubectl apply -k k8s/infra/monitoring
```

Prérequis DNS : **`jaeger.opsdev.fr`** → IP du cluster ; middlewares Traefik `kube-system` appliqués (`k8s/infra/traefik/traefik-config.yaml`).

**Authentification UI (Basic Auth Traefik) :** créer le Secret **avant** ou **après** `kubectl apply -k` (le Secret n’est plus dans le kustomize pour ne pas être écrasé) :

```bash
./scripts/setup-jaeger-auth-secret.sh 'VotreMotDePasseFort'
kubectl apply -k k8s/infra/monitoring
```

Identifiant par défaut : `admin`. L’UI demande ensuite identifiant / mot de passe au navigateur. L’export OTLP (4317/4318) n’est pas concerné (trafic interne cluster).

**Attention :** ne pas utiliser de guillemets simples autour de `$(openssl passwd …)` — le hash ne serait pas généré. Utiliser le script ci-dessus.

### 4.7 Accès aux interfaces

| Interface | URL / accès | Namespace |
|-----------|-------------|-----------|
| **Grafana** | `https://grafana.<domaine>` (selon config Helm) | `monitoring` |
| **Jaeger UI** | `https://jaeger.opsdev.fr` (prod, **Basic Auth**) | `monitoring` |
| **Prometheus** | Port-forward `9090` | `monitoring` |
| **Alertmanager** | Port-forward `9093` | `monitoring` |
| **Métriques API** | `http://backend.<ns>.svc.cluster.local:8000/metrics` | `dev` / `staging` / `production` |

**Port-forward (sans DNS) :**

```bash
kubectl port-forward -n monitoring svc/kube-prometheus-stack-grafana 3000:80
kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090
kubectl port-forward -n monitoring svc/jaeger 16686:16686
```

---

## 5. OpenTelemetry (traces et logs applicatifs)

### 5.1 Objectifs

- **Traces** : requêtes HTTP (FastAPI, middleware ASGI), **httpx**, **SQLAlchemy** ; côté Next.js, runtime **Node** (fetch serveur).
- **Logs** : sorties structurées avec corrélation `trace_id` / `span_id` lorsque le contexte de trace est actif.
- **Export OTLP** : vers collecteur / Jaeger lorsque les variables sont définies.

### 5.2 Backend (FastAPI)

| Fichier | Rôle |
|---------|------|
| `backend/app/telemetry.py` | TracerProvider, export OTLP ou console en `DEBUG`, instrumentations, logs OTLP si activés |
| `backend/app/main.py` | `configure_opentelemetry()` / `shutdown_opentelemetry()` dans le `lifespan` |
| `backend/app/prometheus_metrics.py` | Métriques Prometheus `/metrics` (complémentaire à OTel) |
| `backend/tests/conftest.py` | `OTEL_SDK_DISABLED=true` par défaut (Pytest) |

**Comportement :**

1. `OTEL_SDK_DISABLED=true` → aucune instrumentation.
2. Sinon : traces OTLP si endpoint défini ; traces **console** si `DEBUG` sans endpoint.
3. Logs OTLP si `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` ou endpoint traces + `OTEL_LOGS_EXPORTER=otlp`.
4. Routes `/api/health`, `/api/healthz`, `/api/readyz` exclues des spans (surcharge : `OTEL_FASTAPI_EXCLUDED_URLS`).

**Usage code :**

```python
import logging
logger = logging.getLogger(__name__)
logger.info("Traitement démarré")
```

### 5.3 Frontend (Next.js)

| Fichier | Rôle |
|---------|------|
| `frontend/src/instrumentation.ts` | `register()` → `registerOTel` (`@vercel/otel`) |
| `frontend/src/lib/logger.ts` | `getLogger(component)` — logs JSON + `trace_id` / `span_id` si span actif |

```typescript
import { getLogger } from "@/lib/logger";
const log = getLogger("app.admin.utilisateurs");
log.info("Liste chargée", { count: 42 });
```

> L’instrumentation `@vercel/otel` cible le **serveur** Next.js. Les composants `"use client"` n’ont pas automatiquement de span actif.

### 5.4 Variables d’environnement

| Variable | Backend | Frontend | Description |
|----------|---------|----------|-------------|
| `OTEL_SDK_DISABLED` | ✓ | ✓ | Désactive toute la chaîne OTel |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | ✓ | ✓ | URL base collecteur OTLP HTTP |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | ✓ | ✓ | URL dédiée traces |
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` | ✓ | — | URL dédiée logs OTLP |
| `OTEL_SERVICE_NAME` | ✓ | ✓ | Nom du service (`mmotors-api`, `mmotors-frontend` en cluster) |
| `OTEL_LOGS_EXPORTER` | ✓ | ✓ | `otlp` ou **`none`** (recommandé avec Jaeger) |
| `OTEL_FASTAPI_EXCLUDED_URLS` | ✓ | — | URLs exclues des spans |
| `LOG_LEVEL` | ✓ | — | Niveau logger racine |

**Cluster (overlays)** : `k8s/overlays/<env>/patches/otel-jaeger.yaml` pointe vers  
`http://otel-collector.monitoring.svc.cluster.local:4318` avec `OTEL_LOGS_EXPORTER=none`.

Les **logs des pods** sont collectés par **Promtail → Loki** indépendamment d’OTLP.

### 5.5 Jaeger en local (Docker Compose)

| Élément | Valeur |
|---------|--------|
| **UI** | http://localhost:16686 |
| **OTLP HTTP** | `http://jaeger:4318` (conteneurs) ; `http://127.0.0.1:4318` (hôte) |
| **Services attendus** | `mmotors-api`, `mmotors-frontend` |

`OTEL_LOGS_EXPORTER=none` dans le compose (Jaeger = traces uniquement).

Pour désactiver OTel : `OTEL_SDK_DISABLED: "true"` sur `backend` et `frontend` dans `docker-compose.override.yml`.

---

## 6. Jaeger et collecteur OTLP

### 6.1 Flux

```text
backend / frontend (OTLP HTTP :4318)
    → otel-collector.monitoring.svc.cluster.local
        → jaeger.monitoring.svc.cluster.local (OTLP gRPC :4317)
            → UI Jaeger (:16686)
```

### 6.2 Services attendus dans l’UI

Si seul **`jaeger-all-in-one`** apparaît, aucune trace applicative n’arrive encore.

**Services attendus après trafic métier :** `mmotors-api`, `mmotors-frontend`.

1. `kubectl exec -n production deploy/backend -- env | grep OTEL`
2. `kubectl apply -k k8s/overlays/production`
3. Générer du trafic **métier** (les sondes `/api/readyz` sont exclues des spans)
4. `./scripts/diagnose-jaeger.sh`

### 6.3 Erreur « Connection refused » vers Jaeger

| Contexte | Endpoint correct |
|----------|------------------|
| Docker Compose | `http://jaeger:4318` |
| Machine hôte + Jaeger local | `http://127.0.0.1:4318` |
| **Cluster** | `http://otel-collector.monitoring.svc.cluster.local:4318` |

Ne pas copier l’URL Kubernetes (`jaeger.monitoring.svc...`) dans un `.env` local ou compose.

**Sur le cluster :**

1. Pod Jaeger Ready : `kubectl get pods,ep -n monitoring -l app=jaeger`
2. NetworkPolicies : egress TCP **4318** vers `monitoring` dans `infra/<env>/network-policy.yaml`
3. `jaeger-netpol.yaml` : ingress OTLP depuis labels `component: api` / `web`

### 6.4 Dépannage 502 sur l’UI Jaeger

1. **Pod / endpoints** : `kubectl get pods,svc,endpoints -n monitoring -l app=jaeger`
2. **Middleware Traefik** : `kubectl get middleware -n kube-system compress` et `kubectl get middleware -n monitoring jaeger-auth` — appliquer `k8s/infra/traefik/traefik-config.yaml` et `kubectl apply -k k8s/infra/monitoring`
3. **NetworkPolicy** : port **16686** depuis `kube-system`
4. **Nouveau cluster** : Jaeger n’est pas dans l’overlay `production` seul — `kubectl apply -k k8s/infra/monitoring`
5. Script : `./scripts/diagnose-jaeger.sh`

### 6.5 Authentification UI (401 / accès refusé)

1. **Secret** : `kubectl get secret jaeger-auth-secret -n monitoring` — clé `users` au format `utilisateur:hash_apr1` (pas de texte littéral `$(openssl` ni `CHANGEME`)
2. **Recréer le mot de passe** : `./scripts/setup-jaeger-auth-secret.sh 'NouveauMotDePasse'`
3. **Écrasement** : un ancien `kubectl apply -k` avec Secret versionné remettait `CHANGEME` — réappliquer le script puis `kubectl apply -k` (sans Secret dans le bundle)
4. **Middleware** : `kubectl describe middleware -n monitoring jaeger-auth`
5. **Ingress** : l’annotation `router.middlewares` doit inclure `monitoring-jaeger-auth@kubernetescrd`
6. **Port-forward local** : pas de Basic Auth (`kubectl port-forward` → accès direct au Service)

---

## 7. Métriques Prometheus (backend)

- Fichier : `backend/app/prometheus_metrics.py` (histogramme `http_request_duration_highr_seconds`, compteur `http_requests_total`).
- Désactivation : `PROMETHEUS_METRICS_ENABLED=false`.
- Scrape : `ServiceMonitor` dans `alert-rules.yaml`, chemin `/metrics`, port `http`.

**Vérification locale :**

```bash
cd backend && pip install -r requirements.txt
export SECRET_KEY=dev-secret-not-for-production-please-change-32chars!
curl -s http://127.0.0.1:8000/metrics | head
```

**Prometheus (cluster) :**

```bash
kubectl get servicemonitor -A | grep backend-metrics
kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090
# Status → Targets : backend-metrics UP
```

Requêtes utiles :

```promql
sum(rate(http_requests_total{namespace="production"}[5m])) by (status)
histogram_quantile(0.95, sum(rate(http_request_duration_highr_seconds_bucket{namespace="production"}[5m])) by (le))
```

---

## 8. Loki et Promtail (logs centralisés)

### 8.1 Principes

| Donnée | Stockage | Datasource Grafana |
|--------|----------|-------------------|
| Métriques HTTP, CPU, latence | **Prometheus** | uid `prometheus` |
| Lignes de logs applicatifs | **Loki** (via **Promtail**) | uid `loki` |

**Prometheus ne contient pas les logs.**

Rétention : **90 jours** (`2160h` dans `loki-values.yaml`) — surveiller la taille du PVC (`loki.persistence.size`, défaut 40 Gi).

### 8.2 Requêtes LogQL

Dashboard et Explore :

```logql
{namespace="production"}
{namespace="production", pod=~"backend-.*", container="backend"}
```

Filtres utiles : `|= "error"`, `|= "Traceback"`, recherche par route ou identifiant métier si loggé.

### 8.3 Niveaux de logs

| Niveau | Signification |
|--------|---------------|
| DEBUG | Verbeux ; normal en dev, rare en prod (`LOG_LEVEL=warning`) |
| INFO | Cycle de vie requêtes / jobs |
| WARNING | Anomalie non bloquante |
| ERROR | Échec opération ; peut se traduire en 5xx |

### 8.4 Lien avec les traces

Les logs backend incluent souvent **`otelTraceID`** / **`otelSpanID`** : copier l’ID dans **Jaeger** pour la requête complète.

### 8.5 Mise à jour Promtail

```bash
helm upgrade loki grafana/loki-stack -n monitoring \
  -f k8s/infra/monitoring/loki-values.yaml
kubectl rollout restart daemonset -n monitoring -l app.kubernetes.io/name=promtail
kubectl apply -f k8s/infra/monitoring/grafana-dashboard-us08-configmap.yaml
```

---

## 9. Grafana, dashboard US-08-03 et alertes

### 9.1 Dashboard « M-Motors — Observabilité V1 »

- ConfigMap : `grafana-dashboard-us08-configmap.yaml` (UID `mmotors-us08`)
- Rafraîchissement **30 s**, fenêtre **6 h**
- Variable **`namespace`** : liste dynamique (tous les namespaces applicatifs) + option **All**

| Panneau | Métrique / source | Alerte associée |
|---------|-------------------|-----------------|
| Requêtes HTTP/s | `rate(http_requests_total[5m])` | — |
| Taux 5xx (%) | ratio `status="5xx"` | **BackendAPIErrorRateHigh** (> 1 %, 5 min) |
| Latence P95 (s) | `http_request_duration_highr_seconds` | **BackendAPILatencyP95High** (> 2 s, 5 min) |
| CPU backend | `container_cpu_usage_seconds_total` | **ContainerHighCPU** |
| Logs backend | Loki `{namespace, pod=~"backend.*"}` | — |

### 9.2 Alertes critiques (DoD)

Fichier `alert-rules.yaml`, groupe **`us-08-backend-http`** :

| Alerte | Condition | Actions |
|--------|-----------|---------|
| **BackendAPILatencyP95High** | P95 API > **2 s** (5 min), staging/prod | Grafana P95 + Jaeger ; charge DB ; CPU |
| **BackendAPIErrorRateHigh** | 5xx > **1 %** (5 min) | Logs Loki ; rollback si régression |

Autres groupes : `PodCrashLooping`, `ContainerHighCPU`, `PVCAlmostFull`, `HighHTTPErrorRate` (Traefik), `CertificateExpiringSoon`, etc.

### 9.3 Notifications email (Resend)

Alertmanager → SMTP `smtp.resend.com:587` (`auth_username: resend`).

```bash
kubectl create secret generic alertmanager-resend \
  --from-literal=api-key="re_xxxx" \
  -n monitoring
```

Configurer le montage du secret et le receiver `email-resend` dans `prometheus-values.yaml` (voir commentaires § Alertmanager dans ce fichier). **Ne pas committer** de clés en clair.

**Acquittement :** traiter les **critical** en priorité ; silences Alertmanager avec raison et durée limitée (maintenance).

---

## 10. Topologie des services (Jaeger vs Kiali)

### Verdict

**Kiali est conçu pour Istio.** Sans service mesh, l’UI affiche des erreurs (*Istio APIs are not present*), un graphe vide ou incomplet.

**Recommandation M-Motors :** utiliser **Jaeger** (et Grafana) ; **ne pas compter sur Kiali**.

### Alternative : Jaeger (déjà en place)

1. Ouvrir **https://jaeger.opsdev.fr** (ou port-forward)
2. Service : `mmotors-api` ou `mmotors-frontend`
3. **Find Traces** après trafic réel
4. Ouvrir une trace → **System Architecture** (dépendances : frontend → API → DB)

Le **otel-collector** reste utile comme point d’entrée OTLP unique même sans Kiali.

### Désinstaller Kiali (si installé)

```bash
helm uninstall kiali -n monitoring
kubectl delete ingress -n monitoring kiali-http-redirect kiali-ui-production --ignore-not-found
kubectl delete certificate -n monitoring kiali-production-tls --ignore-not-found
kubectl delete netpol -n monitoring kiali-ui-from-traefik --ignore-not-found
```

Manifests `kiali-*.yaml` : optionnels, non inclus dans `kustomization.yaml`.

---

## 11. Guide d’exploitation

### 11.1 Contrôle quotidien (5–10 min)

1. **Grafana** → dashboard **« M-Motors — Observabilité V1 (US-08-03) »**
2. Namespace **`production`**
3. Vérifier : **5xx ≈ 0 %**, **P95 < 2 s**, trafic cohérent, CPU sans palier au plafond
4. Panneau **logs** : pas de rafale `ERROR` / `Traceback` récurrente
5. **Alertmanager** / mail : aucune alerte **critical** non acquittée

### 11.2 En cas d’alerte ou plainte utilisateur

1. Noter **heure**, **environnement**, **URL** ou action métier
2. Grafana : fenêtre **Last 15 minutes** ou **1 hour**
3. Si **5xx** ou **latence** : Loki + **Jaeger**
4. Si **pod / cluster** : `kubectl logs`, `describe`, events
5. Après correction : attendre **5–10 min** (`for:` des règles) et vérifier le retour au vert

### 11.3 Interprétation rapide des panneaux

**Taux 5xx :**

| Lecture | Action |
|---------|--------|
| 0 % | RAS |
| 0,1–1 % | Logs + trace Jaeger sur une 500 |
| > 1 % stable | Incident : logs, déploiement récent, `/api/readyz` |
| No data (tous panneaux) | ServiceMonitor absent ou target DOWN |

**P95 :**

| Lecture | Action |
|---------|--------|
| < 0,5 s | RAS |
| 0,5–2 s | Routes lourdes : Jaeger / logs |
| > 2 s stable 5 min | Alerte critical : DB, CPU, replicas |

**Symptômes utilisateur :**

| Symptôme | Premier écran | Piste |
|----------|---------------|-------|
| Site inaccessible | Ingress / certificat / pods frontend | TLS, Traefik |
| Erreur enregistrement dossier | Loki + Jaeger POST API | DB, MinIO |
| Très lent | P95 + Jaeger | SQL, replicas |
| Erreur post-déploiement | Tag image Git + rollback | Régression release |

---

## 12. Dépannage

### 12.1 Logs Loki — « No data »

| Cause | Correction |
|--------|------------|
| Monitoring sur un **autre** serveur que l’app | Réinstaller la stack sur le VPS prod |
| Promtail sans pipeline **cri** (K3s) | `loki-values.yaml` + `helm upgrade loki ...` |
| Release Helm pas nommée `loki` | `helm list -n monitoring` → nom **`loki`** |
| Datasource Grafana absente / mauvaise URL | uid `loki`, URL `http://loki:3100` |
| Conflit *Only one datasource can be marked as default* | `loki.isDefault: false`, sidecar datasources désactivé dans loki-values |
| Panneau dashboard avec mauvaise datasource | Éditer panneau : datasource **Loki**, pas Prometheus |
| Variable `namespace` non sélectionnée | Choisir un namespace (ou **All**) en haut du dashboard |

**Diagnostic automatisé :**

```bash
./scripts/diagnose-loki.sh
```

**Test labels Loki :**

```bash
kubectl run loki-labels-test --rm -i --restart=Never -n monitoring \
  --image=curlimages/curl:8.5.0 -- \
  curl -sS "http://loki.monitoring.svc.cluster.local:3100/loki/api/v1/labels"
```

Réponse `data:[]` → aucun log ingéré.

**Logs visibles dans Explore mais pas sur le dashboard :**

```bash
kubectl apply -f k8s/infra/monitoring/grafana-dashboard-us08-configmap.yaml
kubectl rollout restart deployment -n monitoring kube-prometheus-stack-grafana
```

### 12.2 Jaeger — voir [§ 6.4](#64-dépannage-502-sur-lui-jaeger)

### 12.3 Prometheus — cibles DOWN

```bash
kubectl get servicemonitor -A | grep backend-metrics
kubectl get prometheusrules -n monitoring
```

Vérifier pods `backend` Ready et chemin `/metrics` accessible depuis le cluster.

### 12.4 Tests

- **Backend** : `OTEL_SDK_DISABLED=true` dans `conftest.py`
- **Frontend** : `frontend/tests/lib/logger.test.ts`

---

## 13. Limites connues

- Le **frontend Next.js** n’expose pas `/metrics` : le dashboard US-08 couvre surtout l’API ; Traefik complète partiellement côté Ingress.
- Les métriques backend mesurent le **temps serveur API**, pas le temps perçu navigateur (SSR + assets).
- **dev** : trafic faible → 5xx et P95 instables ; valider une release sur **staging**.
- Dashboard : datasource UID **`prometheus`** — adapter le ConfigMap si renommé.
- **5xx Traefik** (Ingress) peuvent différer des 5xx **application** FastAPI.
- Rétention Loki **90 j** : surveiller disque et alertes PVC.

---

## 14. Documentation complémentaire

| Document | Rôle |
|----------|------|
| [docs/k8s/README.md](../k8s/README.md) | Déploiement cluster, TLS, secrets, MinIO (hors observabilité) |
| `k8s/infra/monitoring/README.md` | Rappel court + renvoi vers ce guide |
| `.github/workflows/deploy-*.yaml` | CI/CD et déploiements |
| [OpenTelemetry — variables SDK](https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/) | Référence `OTEL_*` |
| [Jaeger](https://www.jaegertracing.io/docs/) | UI et OTLP |

---

*Guide aligné sur le dashboard `mmotors-us08`, les règles `alert-rules.yaml` et les manifests `k8s/infra/monitoring/` du dépôt **m-motors-lld**.*
