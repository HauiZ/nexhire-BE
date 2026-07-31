import re
import unicodedata


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"[^a-z0-9+#.]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def normalize_skill(value: str) -> str:
    text = normalize_text(value)
    aliases = {
        "reactjs": "react",
        "react.js": "react",
        "nodejs": "node",
        "node.js": "node",
        "nestjs": "nest",
        "nest.js": "nest",
        "postgresql": "postgres",
        "postgre sql": "postgres",
        "js": "javascript",
        "ts": "typescript",
    }
    return aliases.get(text, text)
