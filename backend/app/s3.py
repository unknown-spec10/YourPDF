import os
import shutil
import logging
import boto3
from botocore.exceptions import ClientError
from typing import Optional
from app.config import settings

logger = logging.getLogger(__name__)

def get_s3_client():
    """
    Creates and returns a boto3 S3 client using settings.
    Uses credentials if provided, otherwise falls back to IAM Role / default chain.
    """
    kwargs = {"region_name": settings.aws_region}
    if settings.aws_access_key_id:
        kwargs["aws_access_key_id"] = settings.aws_access_key_id
    if settings.aws_secret_access_key:
        kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
    return boto3.client("s3", **kwargs)

def upload_file_to_s3(local_path: str, s3_key: str) -> bool:
    """
    Uploads a local file to the configured S3 bucket.
    """
    if not settings.aws_s3_bucket_name:
        logger.error("AWS S3 bucket name is not configured.")
        return False
    
    s3_client = get_s3_client()
    try:
        s3_client.upload_file(local_path, settings.aws_s3_bucket_name, s3_key)
        logger.info(f"Successfully uploaded {local_path} to S3 key {s3_key}")
        return True
    except ClientError as e:
        logger.error(f"Failed to upload file to S3: {e}")
        return False

def generate_presigned_download_url(s3_key: str, expiration: int = 900, original_name: str = None) -> Optional[str]:
    """
    Generates a secure pre-signed download URL for a file in S3.
    """
    if not settings.aws_s3_bucket_name:
        logger.error("AWS S3 bucket name is not configured.")
        return None
    
    s3_client = get_s3_client()
    download_name = original_name if original_name else os.path.basename(s3_key)
    try:
        response = s3_client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": settings.aws_s3_bucket_name,
                "Key": s3_key,
                "ResponseContentDisposition": f"attachment; filename={download_name}"
            },
            ExpiresIn=expiration
        )
        return response
    except ClientError as e:
        logger.error(f"Failed to generate S3 pre-signed URL: {e}")
        return None

def is_s3_configured() -> bool:
    """
    Checks if S3 bucket name is configured in settings.
    Authentication is resolved dynamically by boto3 (credentials or EC2 IAM Role).
    """
    return bool(settings.aws_s3_bucket_name)

def store_processed_file(local_path: str, filename: str, original_name: str = None) -> Optional[str]:
    """
    Stores the processed PDF file.
    If S3 is configured, uploads to S3 and returns a presigned URL.
    Otherwise, copies the file to the local static/outputs directory and returns a local link.
    """
    if is_s3_configured():
        s3_key = f"outputs/{filename}"
        if upload_file_to_s3(local_path, s3_key):
            import urllib.parse
            if original_name:
                return f"/api/download/{filename}?original_name={urllib.parse.quote(original_name)}"
            return f"/api/download/{filename}"
        logger.warning("S3 upload failed, falling back to local storage.")
        
    # Local Storage Fallback Mode
    app_dir = os.path.dirname(os.path.abspath(__file__))
    backend_root = os.path.dirname(app_dir)
    static_outputs_dir = os.path.join(backend_root, "static", "outputs")
    os.makedirs(static_outputs_dir, exist_ok=True)
    
    dest_path = os.path.join(static_outputs_dir, filename)
    try:
        shutil.copy2(local_path, dest_path)
        logger.info(f"Saved file locally for fallback: {dest_path}")
        # Return relative API download endpoint URL with custom filename query
        if original_name:
            import urllib.parse
            return f"/api/download/{filename}?original_name={urllib.parse.quote(original_name)}"
        return f"/api/download/{filename}"
    except Exception as e:
        logger.error(f"Failed to copy file to local fallback storage: {e}")
        return None
