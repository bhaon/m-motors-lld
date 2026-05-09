# MinIO / S3 en cluster (dev, staging, production)

## Problèmes fréquents

### 1. Référence Traefik vers le middleware CORS

Avec le provider **KubernetesCRD**, un `Middleware` nommé `s3-cors` dans le namespace `staging` se référence ainsi sur l’Ingress S3 :

```text
s3-cors-staging@kubernetescrd
```

**Pas** `staging-s3-cors@…` (ordre nom / namespace inversé). Une mauvaise référence fait que **aucun en-tête CORS** n’est appliqué par Traefik sur `PUT` / `GET` vers les URLs pré-signées : le navigateur bloque les appels cross-origin.

### 2. Alignement des URLs

| Variable | Rôle |
|---------|------|
| `S3_PUBLIC_ENDPOINT_URL` (ConfigMap backend) | Endpoint utilisé par boto3 pour **signer** les URLs données au navigateur. |
| Hostname de l’Ingress S3 (ex. `s3-staging.netdevops.fr`) | Doit correspondre au schéma + host des URLs pré-signées. |
| `MINIO_SERVER_URL` (patch Deployment MinIO) | URL publique vue par les clients derrière reverse-proxy ([doc MinIO](https://min.io/docs/minio/linux/operations/networking/reverse-proxy.html)). À garder **identique** au même hostname HTTPS que l’Ingress S3. |

### 3. Network policies

Le pod MinIO accepte l’ingress depuis **kube-system** (Traefik) et depuis le **backend**. Pas de changement nécessaire si l’accès utilisateur passe bien par l’Ingress.

### 4. Bucket et CORS applicatif

Le backend appelle aussi `put_bucket_cors` avec `ALLOWED_ORIGINS`. Les origines du frontend staging doivent y figurer (ex. `https://staging.netdevops.fr`).

## Après modification

```bash
kubectl apply -k k8s/overlays/staging
kubectl rollout restart deployment/minio -n staging
```

Vérifier rapidement une URL pré-signée : même host que `S3_PUBLIC_ENDPOINT_URL`, TLS valide, réponses `OPTIONS` / `PUT` avec en-têtes CORS sur la route S3.
