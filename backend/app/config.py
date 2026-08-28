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
    # Proxies entre o cliente e a aplicacao. O Render poe um. Rodando local, sem
    # proxy, o valor e zero e o X-Forwarded-For passa a ser ignorado: sem proxy
    # nenhum, todo XFF que chega foi o proprio cliente quem escreveu.
    trusted_proxy_hops: int = 1
    # Identificacao exigida pelo NCBI em toda chamada ao E-utilities. Sem ela
    # eles bloqueiam a origem sem aviso, porque nao tem a quem escrever antes.
    # A chave e opcional e sobe o teto de 3 para 10 requisicoes por segundo.
    ncbi_email: str = "madsondeluna@gmail.com"
    ncbi_api_key: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
