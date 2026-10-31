from functools import lru_cache
import ssl
from typing import Literal
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", ".env.local"), extra="ignore")

    node_env: str = Field(default="development", alias="NODE_ENV")
    port: int = Field(default=3007, alias="MATCHING_SERVICE_PORT")

    db_host: str = Field(default="localhost", alias="DB_HOST")
    db_port: int = Field(default=5432, alias="DB_PORT")
    db_name: str = Field(alias="MATCHING_SERVICE_DB_NAME")
    db_user: str = Field(alias="MATCHING_SERVICE_DB_USER")
    db_pass: str = Field(alias="MATCHING_SERVICE_DB_PASS")
    db_ssl: bool = Field(default=False, alias="DB_SSL")
    db_ssl_reject_unauthorized: bool = Field(default=False, alias="DB_SSL_REJECT_UNAUTHORIZED")
    db_pool_max: int = Field(default=3, alias="DB_POOL_MAX")
    db_pool_connection_timeout_ms: int = Field(default=5000, alias="DB_POOL_CONNECTION_TIMEOUT_MS")

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
    ranking_artifact_path: str | None = Field(default=None, alias="MATCHING_RANKING_ARTIFACT_PATH")
    ai1_backend: Literal['disabled', 'local_m1'] = Field(default='disabled', alias='MATCHING_AI1_BACKEND')
    ai1_manifest_path: str | None = Field(default=None, alias='MATCHING_AI1_MANIFEST_PATH')
    ai1_manifest_sha256: str | None = Field(default=None, alias='MATCHING_AI1_MANIFEST_SHA256')
    enable_local_hr_test: bool = Field(default=False, alias="MATCHING_ENABLE_LOCAL_HR_TEST")
    local_hr_test_url: str | None = Field(default=None, alias="MATCHING_LOCAL_HR_TEST_URL")
    local_hr_test_token: str | None = Field(default=None, alias="MATCHING_LOCAL_HR_TEST_TOKEN")
    local_hr_test_weights_sha256: str | None = Field(default=None, alias="MATCHING_LOCAL_HR_TEST_WEIGHTS_SHA256")
    local_hr_test_job_ids: str = Field(default='', alias="MATCHING_LOCAL_HR_TEST_JOB_IDS")
    local_hr_test_candidate_ids: str = Field(default='', alias="MATCHING_LOCAL_HR_TEST_CANDIDATE_IDS")

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

    @property
    def db_pool_connection_timeout_seconds(self) -> float:
        return self.db_pool_connection_timeout_ms / 1000


@lru_cache
def get_settings() -> Settings:
    return Settings()
