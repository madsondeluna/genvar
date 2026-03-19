from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    redis_url: str = "redis://localhost:6379"
    cache_ttl_seconds: int = 3600
    ensembl_max_variants: int = 500
    log_level: str = "INFO"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
