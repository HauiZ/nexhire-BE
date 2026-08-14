from functools import lru_cache
import ssl
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    node_env: str = Field(default="development", alias="NODE_ENV")
    port: int = Field(default=3007, alias="MATCHING_SERVICE_PORT")

    db_host: str = Field(default="localhost", alias="DB_HOST")
    db_port: int = Field(default=5432, alias="DB_PORT")
    db_name: str = Field(alias="MATCHING_SERVICE_DB_NAME")
    db_user: str = Field(alias="MATCHING_SERVICE_DB_USER")
    db_pass: str = Field(alias="MATCHING_SERVICE_DB_PASS")
    db_ssl: bool = Field(default=False, alias="DB_SSL")
    db_ssl_reject_unauthorized: bool = Field(default=False, alias="DB_SSL_REJECT_UNAUTHORIZED")

    rabbitmq_url: str = Field(default="amqp://nexhire:nexhire@localhost:5672", alias="RABBITMQ_URL")
    rabbitmq_exchange: str = Field(default="nexhire.events", alias="RABBITMQ_EXCHANGE")

    internal_service_token: str = Field(
        default="dev-internal-service-token",
        alias="INTERNAL_SERVICE_TOKEN",
    )
    job_service_url: str = Field(default="http://localhost:3004", alias="JOB_SERVICE_URL")
    candidate_service_url: str = Field(default="http://localhost:3002", alias="CANDIDATE_SERVICE_URL")

    worker_poll_seconds: float = Field(default=3.0, alias="MATCHING_WORKER_POLL_SECONDS")
    worker_batch_size: int = Field(default=5, alias="MATCHING_WORKER_BATCH_SIZE")
    max_attempts: int = Field(default=3, alias="MATCHING_MAX_ATTEMPTS")
    http_timeout_seconds: float = Field(default=5.0, alias="MATCHING_HTTP_TIMEOUT_SECONDS")
    enable_semantic_scoring: bool = Field(default=True, alias="MATCHING_ENABLE_SEMANTIC_SCORING")
    embedding_model_name: str = Field(
        default="sentence-transformers/all-MiniLM-L6-v2",
        alias="MATCHING_EMBEDDING_MODEL",
    )
    semantic_min_signal: float = Field(default=0.35, alias="MATCHING_SEMANTIC_MIN_SIGNAL")

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.db_user}:{self.db_pass}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    @property
    def database_ssl(self) -> bool | ssl.SSLContext:
        if not self.db_ssl:
            return False

        if self.db_ssl_reject_unauthorized:
            return True

        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        return context

    @property
    def database_connect_args(self) -> dict[str, bool | ssl.SSLContext]:
        return {"ssl": self.database_ssl} if self.db_ssl else {}


@lru_cache
def get_settings() -> Settings:
    return Settings()
