import asyncio
from pathlib import Path
import asyncpg

from app.config import get_settings


async def main() -> None:
    settings = get_settings()
    migration_dir = Path(__file__).resolve().parents[1] / "migrations"
    connection = await asyncpg.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_pass,
        database=settings.db_name,
    )
    try:
        for path in sorted(migration_dir.glob("*.sql")):
            sql = path.read_text(encoding="utf-8")
            await connection.execute(sql)
            print(f"applied {path.name}")
    finally:
        await connection.close()


if __name__ == "__main__":
    asyncio.run(main())
