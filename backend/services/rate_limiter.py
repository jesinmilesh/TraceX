import time
from collections import defaultdict
from typing import Dict, List, Tuple

class LoginRateLimiter:
    """Sliding-window in-memory brute-force protection rate limiter.
    
    Protects login endpoints against automated credential stuffing and dictionary attacks.
    Tracks failed attempts per (IP, identifier) key with automatic expiration.
    """
    def __init__(self, max_attempts: int = 5, window_seconds: int = 60, cooldown_seconds: int = 60):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.cooldown_seconds = cooldown_seconds
        # key -> list of failed attempt timestamps
        self._failures: Dict[str, List[float]] = defaultdict(list)
        # key -> blocked until timestamp
        self._blocked_until: Dict[str, float] = {}

    def _clean_old_attempts(self, key: str, now: float):
        cutoff = now - self.window_seconds
        self._failures[key] = [ts for ts in self._failures[key] if ts > cutoff]
        if not self._failures[key]:
            self._failures.pop(key, None)

    def is_rate_limited(self, ip_address: str, identifier: str) -> Tuple[bool, int]:
        now = time.time()
        key = f"{ip_address}:{identifier.lower().strip()}"
        
        # Check active cooldown
        if key in self._blocked_until:
            if now < self._blocked_until[key]:
                remaining = int(self._blocked_until[key] - now) + 1
                return True, remaining
            else:
                self._blocked_until.pop(key, None)

        self._clean_old_attempts(key, now)
        if len(self._failures[key]) >= self.max_attempts:
            self._blocked_until[key] = now + self.cooldown_seconds
            return True, self.cooldown_seconds

        return False, 0

    def record_failure(self, ip_address: str, identifier: str):
        now = time.time()
        key = f"{ip_address}:{identifier.lower().strip()}"
        self._clean_old_attempts(key, now)
        self._failures[key].append(now)
        if len(self._failures[key]) >= self.max_attempts:
            self._blocked_until[key] = now + self.cooldown_seconds

    def record_success(self, ip_address: str, identifier: str):
        key = f"{ip_address}:{identifier.lower().strip()}"
        self._failures.pop(key, None)
        self._blocked_until.pop(key, None)

# Singleton rate limiter instance for auth endpoints
login_rate_limiter = LoginRateLimiter(max_attempts=5, window_seconds=60, cooldown_seconds=60)
