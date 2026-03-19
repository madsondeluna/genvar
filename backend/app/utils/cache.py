import json
from typing import Any, Optional
from app.config import settings

_redis_client = None


def get_redis():
    global _redis_client
    if _redis_client is None:
        try:
            import redis
            _redis_client = redis.from_url(settings.redis_url, decode_responses=True)
            _redis_client.ping()
        except Exception:
            _redis_client = None
    return _redis_client


def cache_get(key: str) -> Optional[Any]:
    client = get_redis()
    if not client:
        return None
    try:
        value = client.get(key)
        if value:
            return json.loads(value)
    except Exception:
        pass
    return None


def cache_set(key: str, value: Any, ttl: int = None) -> None:
    client = get_redis()
    if not client:
        return
    try:
        ttl = ttl or settings.cache_ttl_seconds
        client.setex(key, ttl, json.dumps(value))
    except Exception:
        pass
