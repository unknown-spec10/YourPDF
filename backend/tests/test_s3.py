from unittest.mock import patch, MagicMock
from app.s3 import (
    upload_file_to_s3,
    generate_presigned_download_url,
    is_s3_configured,
    store_processed_file
)

@patch("app.s3.get_s3_client")
@patch("app.s3.settings")
def test_upload_file_to_s3_success(mock_settings, mock_get_client):
    """
    Verify upload_file_to_s3 successfully triggers the S3 client upload call.
    """
    mock_settings.aws_s3_bucket_name = "test-bucket"
    
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client
    
    result = upload_file_to_s3("local_path.pdf", "s3_key.pdf")
    
    assert result is True
    mock_client.upload_file.assert_called_once_with("local_path.pdf", "test-bucket", "s3_key.pdf")

@patch("app.s3.get_s3_client")
@patch("app.s3.settings")
def test_upload_file_to_s3_no_bucket(mock_settings, mock_get_client):
    """
    Verify upload_file_to_s3 aborts and returns False if bucket name is unconfigured.
    """
    mock_settings.aws_s3_bucket_name = None
    
    result = upload_file_to_s3("local_path.pdf", "s3_key.pdf")
    assert result is False
    mock_get_client.assert_not_called()

@patch("app.s3.get_s3_client")
@patch("app.s3.settings")
def test_generate_presigned_download_url_success(mock_settings, mock_get_client):
    """
    Verify generate_presigned_download_url requests URL creation with the correct parameters and expiration.
    """
    mock_settings.aws_s3_bucket_name = "test-bucket"
    
    mock_client = MagicMock()
    mock_client.generate_presigned_url.return_value = "https://presigned-url.com/doc.pdf"
    mock_get_client.return_value = mock_client
    
    url = generate_presigned_download_url("s3_key.pdf", expiration=600)
    
    assert url == "https://presigned-url.com/doc.pdf"
    mock_client.generate_presigned_url.assert_called_once_with(
        "get_object",
        Params={"Bucket": "test-bucket", "Key": "s3_key.pdf", "ResponseContentDisposition": "attachment; filename=s3_key.pdf"},
        ExpiresIn=600
    )

@patch("app.s3.get_s3_client")
@patch("app.s3.settings")
def test_generate_presigned_download_url_no_bucket(mock_settings, mock_get_client):
    """
    Verify generate_presigned_download_url aborts and returns None if bucket name is unconfigured.
    """
    mock_settings.aws_s3_bucket_name = None
    
    url = generate_presigned_download_url("s3_key.pdf")
    assert url is None
    mock_get_client.assert_not_called()

@patch("app.s3.settings")
def test_is_s3_configured_true(mock_settings):
    """
    Verify is_s3_configured returns True if all AWS credentials are set.
    """
    mock_settings.aws_access_key_id = "AKIAEXAMPLE"
    mock_settings.aws_secret_access_key = "AWSSECRET"
    mock_settings.aws_s3_bucket_name = "my-bucket"
    assert is_s3_configured() is True

@patch("app.s3.settings")
def test_is_s3_configured_false(mock_settings):
    """
    Verify is_s3_configured returns False if any AWS credentials are missing.
    """
    mock_settings.aws_access_key_id = None
    mock_settings.aws_secret_access_key = "AWSSECRET"
    mock_settings.aws_s3_bucket_name = "my-bucket"
    assert is_s3_configured() is False

@patch("app.s3.generate_presigned_download_url")
@patch("app.s3.upload_file_to_s3")
@patch("app.s3.is_s3_configured")
def test_store_processed_file_s3_mode(mock_is_s3, mock_upload, mock_presign):
    """
    Verify store_processed_file uploads to S3 and returns S3 presigned URL when S3 is configured.
    """
    mock_is_s3.return_value = True
    mock_upload.return_value = True
    mock_presign.return_value = "https://s3-link.com"
    
    url = store_processed_file("dummy.pdf", "output.pdf")
    assert url == "https://s3-link.com"
    mock_upload.assert_called_once_with("dummy.pdf", "outputs/output.pdf")
    mock_presign.assert_called_once_with("outputs/output.pdf", original_name=None)

@patch("app.s3.shutil.copy2")
@patch("app.s3.os.makedirs")
@patch("app.s3.is_s3_configured")
def test_store_processed_file_local_mode(mock_is_s3, mock_makedirs, mock_copy2):
    """
    Verify store_processed_file falls back to local storage and returns local static file link when S3 is unconfigured.
    """
    mock_is_s3.return_value = False
    
    url = store_processed_file("dummy.pdf", "output.pdf")
    assert url == "/api/download/output.pdf"
    mock_copy2.assert_called_once()
