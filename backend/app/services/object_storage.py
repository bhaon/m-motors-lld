from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any

import boto3
from botocore.config import Config
from botocore.client import BaseClient
from botocore.exceptions import ClientError

from app.core.config import settings


def get_s3_client() -> BaseClient:
    """Construit un client S3 compatible MinIO à partir de la configuration applicative."""
    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        region_name=settings.S3_REGION,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
        ),
    )


def get_s3_presign_client() -> BaseClient:
    """Construit un client S3 dédié à la pré-signature (endpoint public si défini)."""
    endpoint = settings.s3_public_endpoint_url or settings.S3_ENDPOINT_URL
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name=settings.S3_REGION,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
        ),
    )


def ensure_bucket_exists(client: BaseClient) -> None:
    """Crée le bucket cible s'il n'existe pas déjà."""
    try:
        client.head_bucket(Bucket=settings.S3_BUCKET)
    except ClientError:
        client.create_bucket(Bucket=settings.S3_BUCKET)


def ensure_bucket_cors(client: BaseClient) -> None:
    """Applique une politique CORS compatible upload navigateur sur le bucket S3."""
    if not hasattr(client, "get_bucket_cors") or not hasattr(client, "put_bucket_cors"):
        return

    desired_rules: list[dict[str, Any]] = [
        {
            "AllowedHeaders": ["*"],
            "AllowedMethods": ["PUT", "GET", "HEAD"],
            "AllowedOrigins": settings.allowed_origins,
            "ExposeHeaders": ["ETag", "x-amz-request-id", "x-amz-id-2", "x-amz-checksum-sha256"],
            "MaxAgeSeconds": 3600,
        }
    ]
    desired_cors = {"CORSRules": desired_rules}
    try:
        current = client.get_bucket_cors(Bucket=settings.S3_BUCKET)
        current_rules = current.get("CORSRules", [])
        if current_rules == desired_rules:
            return
    except ClientError:
        # Absence de CORS ou accès initial: on applique la configuration cible.
        pass
    except AttributeError:
        return
    try:
        client.put_bucket_cors(Bucket=settings.S3_BUCKET, CORSConfiguration=desired_cors)
    except ClientError as exc:
        error_code = (exc.response.get("Error") or {}).get("Code", "")
        if error_code == "NotImplemented":
            # Certains endpoints S3 compatibles n'exposent pas PutBucketCors.
            return
        raise
    except AttributeError:
        # Certains clients de test/fakes ne supportent pas ces APIs.
        return


def build_piece_object_key(*, dossier_id: int, piece_type: str, filename: str) -> str:
    """Construit une clé objet stable pour ranger une pièce dans MinIO."""
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    safe_filename = filename.replace("/", "_").replace("\\", "_")
    return f"dossiers/{dossier_id}/{piece_type}/{timestamp}-{safe_filename}"


def generate_upload_url(
    client: BaseClient,
    *,
    object_key: str,
    content_type: str,
    checksum_sha256: str,
) -> str:
    """Génère une URL pré-signée PUT qui embarque le checksum SHA-256 attendu."""
    presign_client = (
        get_s3_presign_client() if settings.s3_public_endpoint_url else client
    )
    return presign_client.generate_presigned_url(
        ClientMethod="put_object",
        Params={
            "Bucket": settings.S3_BUCKET,
            "Key": object_key,
            "ContentType": content_type,
            "ChecksumSHA256": checksum_sha256,
        },
        ExpiresIn=settings.S3_PRESIGN_EXPIRES_SECONDS,
    )


def generate_download_url(client: BaseClient, *, object_key: str, filename: str) -> str:
    """Génère une URL pré-signée GET pour télécharger une pièce justificative."""
    presign_client = (
        get_s3_presign_client() if settings.s3_public_endpoint_url else client
    )
    safe_name = filename.replace('"', "")
    return presign_client.generate_presigned_url(
        ClientMethod="get_object",
        Params={
            "Bucket": settings.S3_BUCKET,
            "Key": object_key,
            "ResponseContentDisposition": f'attachment; filename="{safe_name}"',
        },
        ExpiresIn=settings.S3_PRESIGN_EXPIRES_SECONDS,
    )


def verify_object_checksum(client: BaseClient, *, object_key: str, expected_checksum_hex: str) -> bool:
    """Télécharge l'objet et compare son SHA-256 (hex) au checksum attendu."""
    response = client.get_object(Bucket=settings.S3_BUCKET, Key=object_key)
    sha256 = hashlib.sha256()
    stream = response["Body"]
    while True:
        chunk = stream.read(1024 * 1024)
        if not chunk:
            break
        sha256.update(chunk)
    stream.close()
    return sha256.hexdigest() == expected_checksum_hex.lower()
