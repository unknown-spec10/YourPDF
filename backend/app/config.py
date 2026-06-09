from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from typing import Optional

class Settings(BaseSettings):
    aws_access_key_id: Optional[str] = Field(None, validation_alias="AWS_ACCESS_KEY_ID")
    aws_secret_access_key: Optional[str] = Field(None, validation_alias="AWS_SECRET_ACCESS_KEY")
    aws_s3_bucket_name: Optional[str] = Field(None, validation_alias="AWS_S3_BUCKET_NAME")
    aws_region: str = Field("us-east-1", validation_alias="AWS_REGION")
    redis_url: str = Field("redis://localhost:6379/0", validation_alias="REDIS_URL")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
