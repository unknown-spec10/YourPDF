from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    cors_origins: str = Field("http://localhost:3000", validation_alias="CORS_ORIGINS")
    api_key: str = Field("", validation_alias="API_KEY")

    # Hosted-service limits. They exist because Cloud Run rejects an HTTP/1.1 request above
    # 32 MiB before the app runs, and because rasterising a long document produces a download
    # far larger than the upload. `0` disables either one.
    max_file_size_mb: int = Field(30, validation_alias="MAX_FILE_SIZE_MB")
    max_total_upload_mb: int = Field(30, validation_alias="MAX_TOTAL_UPLOAD_MB")
    max_render_pages: int = Field(100, validation_alias="MAX_RENDER_PAGES")

    @property
    def cors_origins_list(self) -> list[str]:
        raw = (self.cors_origins or "").strip()
        if not raw:
            return []
        return [o.strip() for o in raw.split(",") if o.strip()]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
