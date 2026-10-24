import uuid
from datetime import datetime, timezone
from typing import Any

from lib.db import db


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def audit(user: dict | None, action: str, entity: str, entity_id: str, summary: str,
                before: Any = None, after: Any = None) -> None:
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()),
        "at": now_iso(),
        "user_id": (user or {}).get("id", "system"),
        "user_name": (user or {}).get("name", "Sistema"),
        "user_role": (user or {}).get("role", "system"),
        "action": action,
        "entity": entity,
        "entity_id": entity_id,
        "summary": summary,
        "before": before,
        "after": after,
    })
