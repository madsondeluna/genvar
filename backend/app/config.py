from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    redis_url: str = "redis://localhost:6379"
    cache_ttl_seconds: int = 3600
    ensembl_max_variants: int = 500
    log_level: str = "INFO"
    # Centralised gnomAD dataset version; bump here to switch all queries at once
    gnomad_dataset: str = "gnomad_r4"
    allowed_origins: str = "http://localhost:3000,http://localhost:5173"
    # Limite por IP. Zero desliga, e e assim que a suite de testes roda: os
    # testes compartilham o mesmo IP do TestClient e estourariam o teto juntos,
    # fazendo um teste de doenca reprovar por 429 e apontar para o lugar errado.
    rate_limit_per_minute: int = 60
    rate_limit_per_second: int = 10

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
