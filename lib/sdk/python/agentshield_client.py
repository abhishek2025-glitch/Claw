"""
AgentShield Production Python SDK & Runtime Interceptor.
Enforces pre-execution policy verification, structured tool inspection,
cryptographic action hashing, and fail-closed security gating.
"""

import functools
import hashlib
import json
import os
import time
import urllib.request
import urllib.error
from typing import Any, Callable, Dict, Optional, Tuple

class PolicyDeniedException(Exception):
    """Raised when an action is rejected by the AgentShield server policy."""
    def __init__(self, action_id: str, reasons: list, decision: str = "DENY"):
        super().__init__(f"AgentShield Policy [{decision}]: {'; '.join(reasons)}")
        self.action_id = action_id
        self.reasons = reasons
        self.decision = decision

class ApprovalRequiredException(Exception):
    """Raised when an action is suspended awaiting human operator authorization."""
    def __init__(self, action_id: str, reasons: list):
        super().__init__(f"AgentShield Action Suspended. Requires Operator Approval: {'; '.join(reasons)}")
        self.action_id = action_id
        self.reasons = reasons

class AgentShieldClient:
    def __init__(
        self,
        endpoint_url: Optional[str] = None,
        agent_id: Optional[str] = None,
        agent_name: Optional[str] = None,
        api_secret: Optional[str] = None,
        policy_failure_mode: str = "CLOSED",     # "CLOSED" or "OPEN"
        telemetry_failure_mode: str = "OPEN"     # "OPEN" or "CLOSED"
    ):
        self.endpoint_url = endpoint_url or os.getenv("AGENTSHIELD_ENDPOINT", "http://localhost:3000")
        self.agent_id = agent_id or os.getenv("AGENT_ID", "agent-python-client")
        self.agent_name = agent_name or os.getenv("AGENT_NAME", "Python Autonomous Agent")
        self.api_secret = api_secret or os.getenv("WEBHOOK_SECRET") or os.getenv("AGENTSHIELD_SECRET", "")
        self.policy_failure_mode = policy_failure_mode.upper()
        self.telemetry_failure_mode = telemetry_failure_mode.upper()

    def compute_action_hash(self, action: str, operation: str, arguments: Any) -> str:
        canonical = {
            "action": action,
            "agentId": self.agent_id,
            "arguments": arguments,
            "operation": operation.strip()
        }
        json_bytes = json.dumps(canonical, sort_keys=True).encode("utf-8")
        return hashlib.sha256(json_bytes).hexdigest()

    def propose_action(
        self,
        action: str,
        operation: str,
        arguments: Optional[Dict[str, Any]] = None,
        correlation_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Submits a structured action request to the enforcement plane before execution.
        Returns the policy evaluation decision (ALLOW, DENY, REQUIRE_APPROVAL, AUDIT_ONLY).
        """
        cid = correlation_id or f"corr-{int(time.time()*1000)}-{os.urandom(3).hex()}"
        aid = f"act-{int(time.time()*1000)}-{os.urandom(3).hex()}"
        action_hash = self.compute_action_hash(action, operation, arguments)

        payload = {
            "id": aid,
            "correlationId": cid,
            "agentId": self.agent_id,
            "agentName": self.agent_name,
            "action": action,
            "operation": operation,
            "arguments": arguments or {},
            "requestedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "actionHash": action_hash
        }

        url = f"{self.endpoint_url.rstrip('/')}/api/actions/propose"
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "AgentShield-Python-SDK/2.0"
        }
        if self.api_secret:
            headers["Authorization"] = f"Bearer {self.api_secret}"

        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers=headers,
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=3.5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data
        except Exception as e:
            # Policy failure handling according to configured mode
            if self.policy_failure_mode == "CLOSED":
                raise PolicyDeniedException(
                    aid,
                    [f"Policy enforcement gateway unreachable ({str(e)}). Enforced FAIL-CLOSED policy mode."],
                    decision="DENY"
                )
            else:
                # Administrator configured FAIL-OPEN
                return {
                    "decision": "ALLOW",
                    "risk": "HIGH",
                    "reasons": ["Gateway unreachable, fallback to FAIL-OPEN mode"],
                    "actionId": aid,
                    "correlationId": cid
                }

    def emit_telemetry(
        self,
        action: str,
        level: str,
        message: str,
        tokens: int = 0,
        correlation_id: Optional[str] = None
    ) -> None:
        """Asynchronous non-blocking telemetry emitter."""
        cid = correlation_id or f"corr-{int(time.time()*1000)}"
        payload = {
            "agentId": self.agent_id,
            "agentName": self.agent_name,
            "action": action,
            "level": level,
            "message": message,
            "tokens": tokens,
            "correlationId": cid,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }

        url = f"{self.endpoint_url.rstrip('/')}/api/webhook"
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "AgentShield-Python-SDK/2.0"
        }
        if self.api_secret:
            headers["Authorization"] = f"Bearer {self.api_secret}"

        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers=headers,
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=1.5):
                pass
        except Exception as e:
            if self.telemetry_failure_mode == "CLOSED":
                raise RuntimeError(f"AgentShield telemetry failure: {str(e)}")
            # Default FAIL-OPEN: telemetry failures do not crash the agent

    def shield_tool(self, action_type: str = "EXEC"):
        """Decorator wrapping tool execution with pre-execution policy gating."""
        def decorator(func: Callable):
            @functools.wraps(func)
            def wrapper(*args, **kwargs):
                op_target = f"{func.__name__}"
                args_dict = {"args": args, "kwargs": kwargs}

                # 1. Enforcement Phase
                res = self.propose_action(
                    action=action_type,
                    operation=op_target,
                    arguments=args_dict
                )

                decision = res.get("decision", "DENY")
                reasons = res.get("reasons", [])
                action_id = res.get("actionId", "unknown")

                if decision == "DENY":
                    raise PolicyDeniedException(action_id, reasons, decision="DENY")
                if decision == "REQUIRE_APPROVAL":
                    raise ApprovalRequiredException(action_id, reasons)

                # 2. Execution Phase
                start_t = time.time()
                try:
                    out = func(*args, **kwargs)
                    dur_ms = int((time.time() - start_t) * 1000)
                    self.emit_telemetry(
                        action=action_type,
                        level="INFO",
                        message=f"Tool '{func.__name__}' executed safely in {dur_ms}ms"
                    )
                    return out
                except Exception as exc:
                    self.emit_telemetry(
                        action=action_type,
                        level="ERROR",
                        message=f"Tool '{func.__name__}' execution failed: {str(exc)}"
                    )
                    raise
            return wrapper
        return decorator
