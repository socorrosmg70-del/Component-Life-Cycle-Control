"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logger = logging.getLogger(__name__)

# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "users": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("email", ASCENDING)], name="email", unique=True)],
    "manufacturers": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "families": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "equipment": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("tag", ASCENDING)], name="tag", unique=True)],
    "components": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("tag", ASCENDING)], name="tag", unique=True),
                   IndexModel([("sap_code", ASCENDING)], name="sap_code")],
    "movements": [IndexModel([("id", ASCENDING)], name="id", unique=True),
                  IndexModel([("component_id", ASCENDING), ("install_date", ASCENDING)], name="comp_date"),
                  IndexModel([("equipment_id", ASCENDING), ("status", ASCENDING)], name="eq_status")],
    "lives": [IndexModel([("component_id", ASCENDING), ("life_number", ASCENDING)], name="comp_life", unique=True)],
    "reforms": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("component_id", ASCENDING)], name="comp")],
    "cost_entries": [IndexModel([("component_id", ASCENDING)], name="comp")],
    "sap_batches": [IndexModel([("started_at", DESCENDING)], name="started_desc")],
    "sap_keys": [IndexModel([("key", ASCENDING)], name="key", unique=True)],
    "audit_log": [IndexModel([("at", DESCENDING)], name="at_desc")],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:  # never block boot on an index; the log line names what to fix
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)
