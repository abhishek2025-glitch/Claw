#!/usr/bin/env python3
"""
AgentShield Python CLI Interceptor & Process Wrapper.
Zero-dependency wrapper using standard library (urllib, subprocess, json, time).

Usage:
    python -m agentshield.cli wrap --endpoint https://your-shield.vercel.app -- python agent.py
    ./bin/agentshield-py wrap -- npm run agent
"""

import os
import sys
import json
import time
import urllib.request
import urllib.error
import subprocess
import re
import socket
from typing import List, Dict, Any, Optional

VERSION = "2.1.0"

DANGEROUS_PATTERNS = [
    (re.compile(r"\brm\s+-[a-zA-Z]*r[a-zA-Z]*f\s+([/*~]|\.\.)", re.IGNORECASE), "Destructive recursive force deletion"),
    (re.compile(r">\s*(/dev/sd[a-z]|/dev/nvme|/dev/null)", re.IGNORECASE), "Direct block device write attempt"),
    (re.compile(r"\b(sudo\s+|chmod\s+777|chown\s+root)\b", re.IGNORECASE), "Privilege escalation attempt"),
    (re.compile(r"169\.254\.169\.254|metadata\.google\.internal", re.IGNORECASE), "Cloud IMDS SSRF exfiltration attempt"),
    (re.compile(r"\b(cat|grep|curl|wget)\b.*(/etc/shadow|\.env|id_rsa|\.aws/credentials)", re.IGNORECASE), "Credential file access"),
]

def send_telemetry(endpoint: str, secret: str, event: Dict[str, Any], verbose: bool = False):
    url = f"{endpoint.rstrip('/')}/api/webhook"
    headers = {
        "Content-Type": "application/json",
        "User-Agent": f"AgentShield-Python-CLI/{VERSION}"
    }
    if secret:
        headers["Authorization"] = f"Bearer {secret}"

    try:
        req = urllib.request.Request(url, data=json.dumps(event).encode("utf-8"), headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            if verbose:
                print(f"[telemetry: {resp.status}] -> {event.get('action')} | {event.get('message', '')[:60]}", file=sys.stderr)
    except Exception as e:
        if verbose:
            print(f"[AgentShield Warning] Telemetry dispatch failed: {e}", file=sys.stderr)

def main():
    args = sys.argv[1:]
    endpoint = os.getenv("AGENTSHIELD_ENDPOINT", "http://localhost:3000")
    secret = os.getenv("AGENTSHIELD_SECRET") or os.getenv("WEBHOOK_SECRET", "")
    agent_name = os.getenv("AGENT_NAME", "Python Agent")
    agent_id = os.getenv("AGENT_ID", f"agent-{socket.gethostname()}-{os.getpid()}")
    mode = os.getenv("AGENTSHIELD_MODE", "monitor").lower()
    verbose = False
    cmd: List[str] = []

    if "--" in args:
        sep_idx = args.index("--")
        flags = args[:sep_idx]
        cmd = args[sep_idx + 1:]
    else:
        flags = args

    i = 0
    while i < len(flags):
        arg = flags[i]
        if arg in ("-e", "--endpoint") and i + 1 < len(flags):
            endpoint = flags[i+1]
            i += 2
        elif arg in ("-s", "--secret") and i + 1 < len(flags):
            secret = flags[i+1]
            i += 2
        elif arg in ("-a", "--agent") and i + 1 < len(flags):
            agent_name = flags[i+1]
            i += 2
        elif arg in ("-m", "--mode") and i + 1 < len(flags):
            mode = flags[i+1].lower()
            i += 2
        elif arg in ("-v", "--verbose"):
            verbose = True
            i += 1
        elif arg in ("-h", "--help", "help"):
            print(f"AgentShield Python CLI v{VERSION}")
            print("Usage: python -m agentshield.cli wrap --endpoint <URL> --secret <SEC> -- <command...>")
            sys.exit(0)
        else:
            if not cmd and not arg.startswith("-"):
                cmd = flags[i:]
                break
            i += 1

    if not cmd:
        print("Error: No command specified to wrap. Example: python -m agentshield.cli wrap -- python agent.py", file=sys.stderr)
        sys.exit(1)

    print(f"\033[38;5;48m[AgentShield]\033[0m Intercepting: {' '.join(cmd)}")
    print(f"  Endpoint: {endpoint} | Mode: {mode.upper()} | Agent: {agent_name}")

    send_telemetry(endpoint, secret, {
        "agentId": agent_id,
        "agentName": agent_name,
        "action": "THINK",
        "level": "INFO",
        "message": f"Autonomous agent process launched: {' '.join(cmd)}",
        "tokens": 0,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }, verbose)

    start_time = time.time()
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )

    import threading

    def stream_reader(pipe, is_stderr):
        for line in iter(pipe.readline, ''):
            if is_stderr:
                sys.stderr.write(line)
                sys.stderr.flush()
            else:
                sys.stdout.write(line)
                sys.stdout.flush()

            clean = re.sub(r'\x1b\[[0-9;]*m', '', line).strip()
            if not clean:
                continue

            for pattern, reason in DANGEROUS_PATTERNS:
                if pattern.search(clean):
                    send_telemetry(endpoint, secret, {
                        "agentId": agent_id,
                        "agentName": agent_name,
                        "action": "EXEC",
                        "level": "CRITICAL",
                        "message": f"[SECURITY ALERT] {reason}: '{clean[:100]}'",
                        "tokens": len(clean) // 4,
                        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        "flagReason": reason,
                    }, verbose)
                    if mode == "strict":
                        proc.terminate()
                        return

            # Default action emission
            action = "EXEC" if is_stderr else "THINK"
            level = "WARN" if is_stderr else "INFO"
            send_telemetry(endpoint, secret, {
                "agentId": agent_id,
                "agentName": agent_name,
                "action": action,
                "level": level,
                "message": clean[:250],
                "tokens": max(1, len(clean) // 4),
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }, verbose)

    t1 = threading.Thread(target=stream_reader, args=(proc.stdout, False), daemon=True)
    t2 = threading.Thread(target=stream_reader, args=(proc.stderr, True), daemon=True)
    t1.start()
    t2.start()

    ret = proc.wait()
    t1.join(timeout=1.0)
    t2.join(timeout=1.0)

    elapsed = round(time.time() - start_time, 2)
    send_telemetry(endpoint, secret, {
        "agentId": agent_id,
        "agentName": agent_name,
        "action": "EXEC",
        "level": "INFO" if ret == 0 else "ERROR",
        "message": f"Agent process ended with exit code {ret} in {elapsed}s",
        "tokens": 0,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }, verbose)

    sys.exit(ret)

if __name__ == "__main__":
    main()
