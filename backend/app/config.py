from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    redis_url: str = "redis://localhost:6379"
    cache_ttl_seconds: int = 3600
    ensembl_max_variants: int = 500
    log_level: str = "INFO"
    # Centralised gnomAD dataset version; bump here to switch all queries at once
    gnomad_dataset: str = "gnomad_r4"
    allowed_origins: str = "http://localhost:3000,http://localhost:5173"

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
