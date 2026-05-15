# Observabilité — OpenTelemetry (logs et traces)

Ce document décrit la mise en place d’**OpenTelemetry** sur le monorepo M-Motors (frontend Next.js et backend FastAPI) : objectifs, fichiers concernés, variables d’environnement et usage pour les développeurs. Pour **Prometheus / Grafana / Loki / alertes (US-08-03)**, voir **[us-08-03-observabilite-v1.md](./us-08-03-observabilite-v1.md)**.

## Objectifs

- **Traces** : suivre les requêtes HTTP (FastAPI, middleware ASGI), les appels **httpx**, et les requêtes **SQLAlchemy** ; côté Next.js, instrumenter le runtime **Node** (notamment le fetch serveur).
- **Logs** : sorties structurées avec **corrélation** `trace_id` / `span_id` lorsque le contexte de trace est actif.
- **Export OTLP** (optionnel) : envoi des traces et des logs vers un collecteur compatible (Grafana Alloy, OpenTelemetry Collector, Jaeger, etc.) lorsque l’endpoint est configuré.

## Backend (FastAPI)

### Fichiers principaux

| Fichier | Rôle |
|---------|------|
| `backend/app/telemetry.py` | Initialisation OTel : `TracerProvider`, export OTLP ou console en `DEBUG`, instrumentation FastAPI / SQLAlchemy / httpx, corrélation des logs, `LoggerProvider` + handler OTLP pour les logs si la configuration l’autorise (`OTEL_LOGS_EXPORTER`, endpoints). |
| `backend/app/main.py` | Appel à `configure_opentelemetry(...)` et `configure_prometheus_metrics(...)` ; `shutdown_opentelemetry()` / `shutdown_metrics()` en fin de cycle de vie (`lifespan`). |
| `backend/app/prometheus_metrics.py` | Métriques HTTP **Prometheus** (`/metrics`) pour Grafana / alertes — complète OTel (traces/logs). |
| `backend/requirements.txt` | Dépendances `opentelemetry-api`, `opentelemetry-sdk`, `opentelemetry-exporter-otlp-proto-http`, `prometheus-fastapi-instrumentator`, instrumentations FastAPI / SQLAlchemy / logging / httpx (versions alignées, ex. API/SDK **1.28.2** et instrumentations **0.49b2**). |
| `backend/tests/conftest.py` | `OTEL_SDK_DISABLED=true` par défaut pour éviter d’instrumenter l’app pendant les tests Pytest. |

### Comportement

1. Si **`OTEL_SDK_DISABLED`** vaut `true`, `1` ou `yes`, aucune instrumentation OTel n’est chargée (comportement minimal, adapté aux tests).
2. Sinon :
   - **Traces OTLP** si `OTEL_EXPORTER_OTLP_ENDPOINT` ou `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` est défini.
   - **Traces console** si aucun endpoint OTLP n’est configuré mais que **`DEBUG`** est activé sur l’application (utile en local sans collecteur).
   - **Logs OTLP** : un `LoggingHandler` envoie les enregistrements Python vers OTLP si un endpoint **`OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`** est défini, ou si un endpoint traces OTLP est défini **et** **`OTEL_LOGS_EXPORTER`** vaut `otlp` (comportement par défaut). Utiliser **`OTEL_LOGS_EXPORTER=none`** pour ne garder que les traces (ex. **Jaeger**).
3. **`LoggingInstrumentor`** impose un format de log incluant `trace_id` et `span_id` (champs `otelTraceID` / `otelSpanID`) sur les loggers standards.
4. Les routes de santé **`/api/health`**, **`/api/healthz`**, **`/api/readyz`** sont exclues des spans FastAPI par défaut (surcharge possible avec **`OTEL_FASTAPI_EXCLUDED_URLS`**, liste séparée par des virgules, motifs interprétés par l’instrumentation).

### Usage côté code Python

Utiliser le module **`logging`** habituel :

```python
import logging

logger = logging.getLogger(__name__)

def ma_fonction():
    logger.info("Traitement démarré")
```

Les messages passeront dans le format configuré par OpenTelemetry (avec corrélation trace lorsqu’un span est actif). Pour l’export OTLP des logs, le handler ajouté sur le logger racine complète cette chaîne lorsque la configuration l’active.

### Variables d’environnement (backend)

| Variable | Description |
|----------|-------------|
| `OTEL_SDK_DISABLED` | Désactive toute la chaîne OTel (`true` / `1` / `yes`). |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | URL de base du collecteur OTLP HTTP (traces ; les logs utilisent souvent le même hôte avec le chemin `/v1/logs`). |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | URL dédiée aux traces si besoin. |
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` | URL dédiée aux logs OTLP. |
| `OTEL_SERVICE_NAME` | Nom du service (défaut possible : nom issu de `APP_NAME` dans le code). |
| `OTEL_SERVICE_VERSION` | Version du service (optionnel). |
| `OTEL_FASTAPI_EXCLUDED_URLS` | URLs exclues des spans (défaut : health/healthz/readyz). |
| `OTEL_LOGS_EXPORTER` | `otlp` (défaut) : envoie les logs OTLP si un endpoint traces OTLP est défini ; `none` : désactive l’export OTLP des logs (recommandé avec **Jaeger**, orienté traces). |
| `LOG_LEVEL` | Niveau du logger racine (`INFO`, `DEBUG`, etc.). |

Des exemples commentés sont présents dans **`docker-compose.yml`** (service `backend`). En **docker compose** local, Jaeger est démarré avec `OTEL_LOGS_EXPORTER=none` pour n’exporter que les traces vers l’UI.

## Frontend (Next.js)

### Fichiers principaux

| Fichier | Rôle |
|---------|------|
| `frontend/src/instrumentation.ts` | Convention Next.js : fonction **`register()`** qui appelle **`registerOTel`** (`@vercel/otel`) pour le runtime **Node** (traces, fetch instrumenté, propagators, OTLP via variables OTel). |
| `frontend/src/lib/logger.ts` | **`getLogger(component)`** : émet des lignes **JSON** sur la console avec `severityText`, `logger.name`, `body`, et `trace_id` / `span_id` si un span actif existe (`@opentelemetry/api`). |
| `frontend/package.json` | Dépendances `@vercel/otel` et `@opentelemetry/api`. |

### Comportement

- L’instrumentation **`instrumentation.ts`** ne s’exécute que dans le contexte Next.js approprié (chargement au démarrage du serveur Node).
- Si **`OTEL_SDK_DISABLED`** est `true` / `1` / `yes`, **`registerOTel`** n’est pas appelé (tests ou désactivation explicite).
- Les variables **`OTEL_*`** standard (endpoint, nom de service, sampler, etc.) sont prises en charge par le SDK sous-jacent de `@vercel/otel` ; se référer à la [documentation OpenTelemetry sur les variables d’environnement](https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/).

### Usage côté code TypeScript / React

```typescript
import { getLogger } from "@/lib/logger";

const log = getLogger("app.admin.utilisateurs");

log.info("Liste chargée", { count: 42 });
log.error("Échec API", { status: 500 }, err);
```

Les **error boundaries** des segments `admin`, `backoffice` et `mes-dossiers` utilisent déjà `getLogger` pour journaliser les erreurs de façon structurée.

### Variables d’environnement (frontend)

Les mêmes principes que pour tout process Node instrumenté : notamment **`OTEL_EXPORTER_OTLP_ENDPOINT`**, **`OTEL_SERVICE_NAME`**, **`OTEL_SDK_DISABLED`**, **`OTEL_LOGS_EXPORTER`**. La stack **docker compose** active l’export vers **Jaeger** (voir section ci-dessous).

> **Note** : l’instrumentation `@vercel/otel` cible le **serveur** Next.js. Les composants **client** (`"use client"`) n’ont pas automatiquement de span actif ; `getLogger` reste utile pour des logs JSON homogènes, la corrélation trace étant présente surtout dans les chemins serveur (RSC, route handlers, actions, etc.).

## Jaeger (visualisation des traces en local)

Le fichier **`docker-compose.yml`** inclut un service **`jaeger`** basé sur l’image officielle **`jaegertracing/all-in-one`** (version épinglée), avec le récepteur **OTLP** activé (`COLLECTOR_OTLP_ENABLED`).

| Élément | Valeur |
|---------|--------|
| **UI** | [http://localhost:16686](http://localhost:16686) — menu *Search*, filtrer par service `mmotors-api` ou `mmotors-frontend`. |
| **OTLP HTTP** | `http://jaeger:4318` depuis les conteneurs ; `http://127.0.0.1:4318` depuis la machine hôte si l’API tourne hors Docker. |
| **Services** | Le `backend` et le `frontend` du compose pointent vers cet endpoint et exposent les noms de service ci-dessus. |

Les **logs OTLP** vers Jaeger sont désactivés via **`OTEL_LOGS_EXPORTER=none`** (Jaeger est pensé pour les **traces** ; pour les logs OTLP, prévoir Grafana Loki, un collector, etc.).

Pour **désactiver** tout export OTel dans le compose (sans retirer Jaeger), vous pouvez surcharger dans `docker-compose.override.yml` : `OTEL_SDK_DISABLED: "true"` sur `backend` et `frontend`.

## Jaeger sur Kubernetes

### Manifests (déploiement des composants)

Tous les manifests Jaeger pour le cluster se trouvent sous **`k8s/infra/monitoring/`** (résumé : **`k8s/infra/monitoring/README.md`**).

| Chemin | Contenu |
|--------|---------|
| `k8s/infra/monitoring/jaeger.yaml` | `Deployment` + `Service` Jaeger (OTLP + UI). |
| `k8s/infra/monitoring/jaeger-netpol.yaml` | `NetworkPolicy` (OTLP depuis les pods `component=api` / `component=web` ; UI depuis Traefik / kube-system). |
| `k8s/infra/monitoring/jaeger-ingress.yaml` | `Certificate` cert-manager + `Ingress` Traefik (HTTP→HTTPS + TLS par environnement). |
| `k8s/infra/monitoring/kustomization.yaml` | Agrège les ressources ci-dessus : `kubectl apply -k k8s/infra/monitoring`. |
| `k8s/infra/monitoring/namespace-and-netpol.yaml` | Namespace `monitoring` et politiques transverses (à appliquer avant si besoin). |

Les overlays **dev**, **staging** et **production** envoient l’OTLP vers le **collecteur** `http://otel-collector.monitoring.svc.cluster.local:4318`, qui relaie vers **Jaeger** et alimente **Prometheus** (métriques pour **Kiali**). Voir **`kiali-topologie-services.md`**.

### UI HTTPS (Traefik)

L’**UI** production est exposée sur **`https://jaeger.opsdev.fr`** (`k8s/infra/monitoring/jaeger-ingress.yaml`).

### UI Jaeger : seul le service « jaeger-all-in-one »

Ce nom correspond aux **traces internes du collecteur Jaeger**, pas à l’API ni au frontend. Tant qu’aucune trace applicative n’arrive, la liste des services ne contient que cette entrée.

**Services attendus** après trafic réel : `mmotors-api`, `mmotors-frontend`.

1. Vérifier les variables sur les pods : `kubectl exec -n production deploy/backend -- env | grep OTEL`
2. Redéployer après le patch : `kubectl apply -k k8s/overlays/production`
3. Générer des requêtes **métier** (catalogue, API documentée) — les sondes `/api/readyz` sont **exclues** des spans.
4. Lister les services : `./scripts/diagnose-jaeger.sh` ou `curl http://jaeger:16686/api/services` (depuis le cluster).

Pour l’ordre d’application et le port-forward, voir **`k8s/README.MD`** (section Jaeger).

### Erreur « Connection refused » vers `jaeger.monitoring.svc.cluster.local:4318`

Ce nom DNS n’existe **que dans le cluster Kubernetes**. En **Docker Compose**, utilisez **`http://jaeger:4318`**. En **local** (uvicorn sur l’hôte, Jaeger avec port `4318` exposé), utilisez **`http://127.0.0.1:4318`**. Vérifiez qu’aucun **`backend/.env`** ou **`docker-compose.override.yml`** ne surcharge l’endpoint avec la valeur Kubernetes.

**Si l’erreur vient bien du cluster** (`kubectl logs` sur un pod `backend`) :

1. **Jaeger déployé et prêt** : `kubectl get pods,ep -n monitoring -l app=jaeger` — le `Service` `jaeger` n’a pas d’endpoint tant que le pod n’est pas *Ready* (sonde sur le port UI 16686).
2. **Réappliquer les NetworkPolicies** : depuis la mise à jour des manifests, l’OTLP est autorisé depuis tout pod portant le label **`component: api`** (backend) ou **`component: web`** (frontend), dans n’importe quel namespace — plus seulement `dev` / `staging` / `production` nommés ainsi.
3. **Egress côté app** : les `NetworkPolicy` des namespaces applicatifs doivent autoriser le TCP **4318** vers le namespace `monitoring` (déjà prévu dans `infra/<env>/network-policy.yaml` pour dev, staging et production).

## Tests

- **Backend** : `OTEL_SDK_DISABLED=true` est défini par défaut dans `backend/tests/conftest.py` avant l’import de l’application, afin d’éviter les effets de bord et le bruit des exporteurs pendant Pytest.
- **Frontend** : des tests unitaires sur `getLogger` se trouvent dans `frontend/tests/lib/logger.test.ts`.

## Vérification rapide en local

1. **Docker compose** : `docker compose up -d`, ouvrir [http://localhost:16686](http://localhost:16686), générer du trafic sur l’API (`http://localhost:8000/api/docs`) ou le frontend (`http://localhost:3000`), puis rechercher les services **mmotors-api** / **mmotors-frontend**.
2. **Backend sans collecteur** : lancer l’API avec `DEBUG=true` et sans `OTEL_EXPORTER_OTLP_ENDPOINT` — les traces peuvent apparaître sur la **console** ; les logs incluent les champs de corrélation.
3. **Avec un autre collecteur** : définir `OTEL_EXPORTER_OTLP_ENDPOINT` (ex. OpenTelemetry Collector) ; pour réactiver les **logs** OTLP en plus des traces, retirer ou mettre à jour `OTEL_LOGS_EXPORTER` (valeur par défaut côté code : `otlp` lorsque l’endpoint traces est défini et qu’aucun `none` n’est imposé).

## Références

- [Next.js — Instrumentation](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation)
- [OpenTelemetry Python](https://opentelemetry-python.readthedocs.io/)
- Paquet [`@vercel/otel`](https://www.npmjs.com/package/@vercel/otel)
- [Jaeger — Documentation](https://www.jaegertracing.io/docs/)
