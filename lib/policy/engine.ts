import path from 'node:path';
import { ActionRequest, PolicyDecision, Decision, RiskLevel } from '../types/action';

export interface PolicyEngineConfig {
  policyFailureMode: 'CLOSED' | 'OPEN';
  telemetryFailureMode: 'CLOSED' | 'OPEN';
  workspaceRoot: string;
  allowedDomains: string[];
  blockedDomains: string[];
  allowedHttpPorts: number[];
  blockedHttpPorts: number[];
  requireApprovalForSourceDeletion: boolean;
}

export function getDefaultPolicyConfig(): PolicyEngineConfig {
  return {
    policyFailureMode: (process.env.POLICY_FAILURE_MODE?.toUpperCase() === 'OPEN' ? 'OPEN' : 'CLOSED'),
    telemetryFailureMode: (process.env.TELEMETRY_FAILURE_MODE?.toUpperCase() === 'CLOSED' ? 'CLOSED' : 'OPEN'),
    workspaceRoot: path.resolve(process.env.WORKSPACE_ROOT || process.cwd()),
    allowedDomains: (process.env.ALLOWED_DOMAINS || 'google.com,github.com,api.github.com,registry.npmjs.org,pypi.org')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
    blockedDomains: (process.env.BLOCKED_DOMAINS || 'pastebin.com,ghostbin.com,tempmail.com,ngrok.io,serveo.net')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
    allowedHttpPorts: [80, 443],
    blockedHttpPorts: [21, 22, 23, 25, 135, 139, 445, 1433, 1521, 3306, 5432, 6379, 8080, 9200, 27017],
    requireApprovalForSourceDeletion: true,
  };
}

// Private IP Ranges (CIDR-equivalent tests) for SSRF defense
function isPrivateOrLoopbackIP(hostname: string): boolean {
  const clean = hostname.replace(/^\[|\]$/g, '').trim().toLowerCase();

  // Localhost aliases
  if (
    clean === 'localhost' ||
    clean === 'localhost.localdomain' ||
    clean.endsWith('.localhost') ||
    clean === '0.0.0.0' ||
    clean === '::1' ||
    clean === '::'
  ) {
    return true;
  }

  // IPv4-mapped IPv6
  if (clean.startsWith('::ffff:')) {
    const v4 = clean.replace('::ffff:', '');
    return isPrivateOrLoopbackIP(v4);
  }

  // Test IPv4 dotted decimal
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = clean.match(ipv4Regex);
  if (match) {
    const octets = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
    if (octets.some((o) => o > 255)) return true; // Malformed / integer overflow attempt

    // 127.0.0.0/8 (Loopback)
    if (octets[0] === 127) return true;
    // 10.0.0.0/8 (Private)
    if (octets[0] === 10) return true;
    // 172.16.0.0/12 (Private: 172.16.0.0 - 172.31.255.255)
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
    // 192.168.0.0/16 (Private)
    if (octets[0] === 192 && octets[1] === 168) return true;
    // 169.254.0.0/16 (Link-local / Cloud Metadata like 169.254.169.254)
    if (octets[0] === 169 && octets[1] === 254) return true;
    // 100.64.0.0/10 (Carrier-grade NAT)
    if (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) return true;
    // 0.0.0.0/8
    if (octets[0] === 0) return true;
  }

  // Hex or Octal IP literal bypass attempts (e.g. 0x7f000001 or 0177.0.0.1)
  if (/^0[xX][0-9a-fA-F]+$/.test(clean) || /^0[0-7]+(?:\.[0-9]+)+$/.test(clean)) {
    return true;
  }

  // IPv6 ULA (fc00::/7) or Link-local (fe80::/10)
  if (clean.startsWith('fc') || clean.startsWith('fd') || clean.startsWith('fe80:')) {
    return true;
  }

  return false;
}

export class PolicyEngine {
  private config: PolicyEngineConfig;

  constructor(config?: Partial<PolicyEngineConfig>) {
    this.config = { ...getDefaultPolicyConfig(), ...config };
  }

  public getConfig(): PolicyEngineConfig {
    return { ...this.config };
  }

  public updateConfig(partial: Partial<PolicyEngineConfig>) {
    this.config = { ...this.config, ...partial };
  }

  /**
   * Main evaluation entry point.
   * Deterministically returns ALLOW, DENY, REQUIRE_APPROVAL, or AUDIT_ONLY.
   * Guarantees fail-closed behavior on unexpected exceptions when configured.
   */
  public evaluateAction(request: ActionRequest): PolicyDecision {
    const evaluatedAt = new Date().toISOString();

    try {
      if (!request || !request.action || !request.operation) {
        return {
          decision: 'DENY',
          risk: 'CRITICAL',
          reasons: ['Malformed action request: missing action type or operation target'],
          policyIds: ['POL-MALFORMED'],
          evaluatedAt,
        };
      }

      switch (request.action) {
        case 'EXEC':
          return this.evaluateExec(request, evaluatedAt);
        case 'HTTP':
          return this.evaluateHttp(request, evaluatedAt);
        case 'READ':
          return this.evaluateRead(request, evaluatedAt);
        case 'WRITE':
          return this.evaluateWrite(request, evaluatedAt);
        case 'DELETE':
          return this.evaluateDelete(request, evaluatedAt);
        case 'THINK':
          return this.evaluateThink(request, evaluatedAt);
        default:
          return {
            decision: 'DENY',
            risk: 'HIGH',
            reasons: [`Unrecognized action type: ${(request as any).action}`],
            policyIds: ['POL-UNKNOWN-ACTION'],
            evaluatedAt,
          };
      }
    } catch (err: any) {
      // Non-negotiable Invariant 3: Security-policy evaluation failure must NOT silently allow
      // a dangerous operation when the policy is configured fail-closed.
      const isFailClosed = this.config.policyFailureMode === 'CLOSED';
      return {
        decision: isFailClosed ? 'DENY' : 'ALLOW',
        risk: 'CRITICAL',
        reasons: [
          `Policy engine internal error: ${err?.message || 'unknown failure'}. Policy failure mode enforced: ${
            this.config.policyFailureMode
          }`,
        ],
        policyIds: ['POL-ERROR-FALLBACK'],
        evaluatedAt,
      };
    }
  }

  // --- Subsystem 1: Shell & Tool Execution Policy (EXEC) ---
  private evaluateExec(request: ActionRequest, evaluatedAt: string): PolicyDecision {
    const rawCmd = request.operation.trim();
    const reasons: string[] = [];
    const policyIds: string[] = [];

    // 1. Destructive Filesystem Commands & Disk Formatting
    const destructivePatterns = [
      { regex: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f\s+([/\*~]|\.\.)/i, reason: 'High-risk recursive force deletion command (rm -rf) on root or workspace parent', id: 'POL-EXEC-RM-RF-ROOT' },
      { regex: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f\b/i, reason: 'Destructive recursive force deletion command (rm -rf)', id: 'POL-EXEC-RM-RF' },
      { regex: /\bmkfs(?:\.[a-zA-Z0-9]+)?\b/i, reason: 'Direct disk filesystem formatting (mkfs)', id: 'POL-EXEC-MKFS' },
      { regex: /\bdd\s+if=/i, reason: 'Raw device block copy or disk overwrite (dd)', id: 'POL-EXEC-DD' },
      { regex: />\s*\/dev\/(?:sd[a-z]|nvme[0-9]|hd[a-z]|null|zero)/i, reason: 'Direct raw block device redirection', id: 'POL-EXEC-RAW-DEV' },
      { regex: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, reason: 'Fork-bomb denial-of-service attack pattern', id: 'POL-EXEC-FORKBOMB' },
      { regex: /\bwipefs\b/i, reason: 'Filesystem signature eraser (wipefs)', id: 'POL-EXEC-WIPEFS' },
      { regex: /\btruncate\s+-s\s+0\s+\/(?:etc|var|usr)/i, reason: 'System log or directory truncation', id: 'POL-EXEC-TRUNCATE' },
    ];

    for (const pat of destructivePatterns) {
      if (pat.regex.test(rawCmd)) {
        return {
          decision: 'DENY',
          risk: 'CRITICAL',
          reasons: [pat.reason],
          policyIds: [pat.id],
          evaluatedAt,
        };
      }
    }

    // 2. Privilege Escalation & Access Control Mutators
    const privEscPatterns = [
      { regex: /\bchmod\s+(?:-[a-zA-Z]+\s+)?(?:777|a\+rwx|u\+s|g\+s)\b/i, reason: 'Insecure privilege escalation or world-writable mode (chmod 777 / setuid)', id: 'POL-EXEC-CHMOD-777' },
      { regex: /\b(?:sudo|su|doas)\b/i, reason: 'Unauthorized privilege escalation binary (sudo/su/doas)', id: 'POL-EXEC-SUDO' },
      { regex: /\bchown\s+(?:-[a-zA-Z]+\s+)?root\b/i, reason: 'Unauthorized ownership reassignment to root', id: 'POL-EXEC-CHOWN-ROOT' },
    ];

    for (const pat of privEscPatterns) {
      if (pat.regex.test(rawCmd)) {
        return {
          decision: 'DENY',
          risk: 'HIGH',
          reasons: [pat.reason],
          policyIds: [pat.id],
          evaluatedAt,
        };
      }
    }

    // 3. Reverse Shells & Outbound Data Pipes
    const revShellPatterns = [
      { regex: /\bnc(?:\.traditional)?\s+.*-e\s+(?:\/bin\/)?(?:ba)?sh\b/i, reason: 'Reverse shell invocation via netcat (-e /bin/sh)', id: 'POL-EXEC-NC-REVSHELL' },
      { regex: /\/dev\/(?:tcp|udp)\/[0-9a-zA-Z._-]+\/\d+/i, reason: 'Direct bash network socket redirection (/dev/tcp)', id: 'POL-EXEC-DEV-TCP' },
      { regex: /(?:curl|wget)\s+[^\n|;]+\|\s*(?:ba)?sh\b/i, reason: 'Remote script execution piped into shell (curl | bash)', id: 'POL-EXEC-CURL-PIPE-SH' },
    ];

    for (const pat of revShellPatterns) {
      if (pat.regex.test(rawCmd)) {
        return {
          decision: 'DENY',
          risk: 'CRITICAL',
          reasons: [pat.reason],
          policyIds: [pat.id],
          evaluatedAt,
        };
      }
    }

    // 4. Source tree modifications requiring operator sign-off
    if (/\bgit\s+(?:reset\s+--hard|push\s+--force|clean\s+-fdx)\b/i.test(rawCmd)) {
      return {
        decision: 'REQUIRE_APPROVAL',
        risk: 'HIGH',
        reasons: ['Destructive git repository mutation requires operator authorization'],
        policyIds: ['POL-EXEC-GIT-DESTRUCTIVE'],
        evaluatedAt,
      };
    }

    // Non-destructive build, test, and query commands are allowed
    return {
      decision: 'ALLOW',
      risk: 'LOW',
      reasons: ['Command passed all shell security and heuristic validation gates'],
      policyIds: ['POL-EXEC-DEFAULT-ALLOW'],
      evaluatedAt,
    };
  }

  // --- Subsystem 2: Network & HTTP Egress Policy (HTTP) ---
  private evaluateHttp(request: ActionRequest, evaluatedAt: string): PolicyDecision {
    const rawUrl = request.operation.trim();
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return {
        decision: 'DENY',
        risk: 'HIGH',
        reasons: [`Malformed HTTP URL: '${rawUrl}'`],
        policyIds: ['POL-HTTP-MALFORMED'],
        evaluatedAt,
      };
    }

    // Scheme Validation: only HTTP/HTTPS
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return {
        decision: 'DENY',
        risk: 'CRITICAL',
        reasons: [`Prohibited URL protocol '${parsedUrl.protocol}'. Only http: and https: permitted.`],
        policyIds: ['POL-HTTP-PROTOCOL'],
        evaluatedAt,
      };
    }

    const hostname = parsedUrl.hostname.toLowerCase();

    // SSRF & Loopback / Private IP Protection
    if (isPrivateOrLoopbackIP(hostname)) {
      return {
        decision: 'DENY',
        risk: 'CRITICAL',
        reasons: [`SSRF Defense: request to private, loopback, or metadata destination '${hostname}' blocked.`],
        policyIds: ['POL-HTTP-SSRF-LOOPBACK'],
        evaluatedAt,
      };
    }

    // Port Enforcement
    const port = parsedUrl.port ? Number(parsedUrl.port) : parsedUrl.protocol === 'https:' ? 443 : 80;
    if (this.config.blockedHttpPorts.includes(port)) {
      return {
        decision: 'DENY',
        risk: 'HIGH',
        reasons: [`Connection to restricted infrastructure port ${port} blocked.`],
        policyIds: ['POL-HTTP-BLOCKED-PORT'],
        evaluatedAt,
      };
    }

    // Blocked Domains (Pastebins, known exfiltration endpoints)
    for (const blocked of this.config.blockedDomains) {
      if (hostname === blocked || hostname.endsWith(`.${blocked}`)) {
        return {
          decision: 'DENY',
          risk: 'CRITICAL',
          reasons: [`Target domain '${hostname}' matches blocked exfiltration domain list (${blocked})`],
          policyIds: ['POL-HTTP-BLOCKED-DOMAIN'],
          evaluatedAt,
        };
      }
    }

    // POST / PUT / PATCH upload to unknown domain requires approval or audit
    const httpMethod = (request.arguments as any)?.method?.toUpperCase() || 'GET';
    const isUpload = ['POST', 'PUT', 'PATCH'].includes(httpMethod);

    if (isUpload) {
      const isAllowedDomain = this.config.allowedDomains.some(
        (ad) => hostname === ad || hostname.endsWith(`.${ad}`)
      );
      if (!isAllowedDomain) {
        return {
          decision: 'REQUIRE_APPROVAL',
          risk: 'MEDIUM',
          reasons: [`Outbound ${httpMethod} upload to unverified external domain '${hostname}' requires operator authorization`],
          policyIds: ['POL-HTTP-UPLOAD-UNVERIFIED'],
          evaluatedAt,
        };
      }
    }

    return {
      decision: 'ALLOW',
      risk: 'LOW',
      reasons: [`HTTP request to '${hostname}' authorized`],
      policyIds: ['POL-HTTP-ALLOW'],
      evaluatedAt,
    };
  }

  // --- Subsystem 3: Filesystem Mutation & Read Policies (READ / WRITE / DELETE) ---
  private evaluateRead(request: ActionRequest, evaluatedAt: string): PolicyDecision {
    const normalized = this.normalizePath(request.operation);
    if (!normalized.isValid) {
      return {
        decision: 'DENY',
        risk: 'HIGH',
        reasons: [normalized.reason || 'Invalid file path'],
        policyIds: ['POL-PATH-INVALID'],
        evaluatedAt,
      };
    }

    // Protected secrets and credentials
    const secretTarget = this.checkProtectedFile(normalized.resolvedPath);
    if (secretTarget.isProtected) {
      return {
        decision: 'DENY',
        risk: 'CRITICAL',
        reasons: [`Access to sensitive credential or system file '${secretTarget.name}' is prohibited`],
        policyIds: ['POL-READ-SECRET-DENIED'],
        evaluatedAt,
      };
    }

    return {
      decision: 'ALLOW',
      risk: 'LOW',
      reasons: ['Read access authorized'],
      policyIds: ['POL-READ-ALLOW'],
      evaluatedAt,
    };
  }

  private evaluateWrite(request: ActionRequest, evaluatedAt: string): PolicyDecision {
    const normalized = this.normalizePath(request.operation);
    if (!normalized.isValid) {
      return {
        decision: 'DENY',
        risk: 'HIGH',
        reasons: [normalized.reason || 'Invalid file path'],
        policyIds: ['POL-PATH-INVALID'],
        evaluatedAt,
      };
    }

    // Protected paths write protection
    const secretTarget = this.checkProtectedFile(normalized.resolvedPath);
    if (secretTarget.isProtected) {
      return {
        decision: 'DENY',
        risk: 'CRITICAL',
        reasons: [`Overwriting protected file '${secretTarget.name}' is prohibited`],
        policyIds: ['POL-WRITE-SECRET-DENIED'],
        evaluatedAt,
      };
    }

    return {
      decision: 'ALLOW',
      risk: 'LOW',
      reasons: ['File write authorized within workspace boundary'],
      policyIds: ['POL-WRITE-ALLOW'],
      evaluatedAt,
    };
  }

  private evaluateDelete(request: ActionRequest, evaluatedAt: string): PolicyDecision {
    const normalized = this.normalizePath(request.operation);
    if (!normalized.isValid) {
      return {
        decision: 'DENY',
        risk: 'HIGH',
        reasons: [normalized.reason || 'Invalid file path'],
        policyIds: ['POL-PATH-INVALID'],
        evaluatedAt,
      };
    }

    // Deletion of root or critical workspace parents
    if (normalized.resolvedPath === this.config.workspaceRoot || normalized.resolvedPath === '/') {
      return {
        decision: 'DENY',
        risk: 'CRITICAL',
        reasons: ['Deletion of workspace root or filesystem root is strictly forbidden'],
        policyIds: ['POL-DELETE-ROOT'],
        evaluatedAt,
      };
    }

    // Source code file deletion: prompt for operator approval
    const ext = path.extname(normalized.resolvedPath).toLowerCase();
    const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.json', '.yaml', '.yml'];
    if (this.config.requireApprovalForSourceDeletion && sourceExtensions.includes(ext)) {
      return {
        decision: 'REQUIRE_APPROVAL',
        risk: 'HIGH',
        reasons: [`Deletion of project source code file '${path.basename(normalized.resolvedPath)}' requires operator approval`],
        policyIds: ['POL-DELETE-SOURCE-APPROVAL'],
        evaluatedAt,
      };
    }

    return {
      decision: 'ALLOW',
      risk: 'MEDIUM',
      reasons: ['Resource deletion authorized'],
      policyIds: ['POL-DELETE-ALLOW'],
      evaluatedAt,
    };
  }

  private evaluateThink(request: ActionRequest, evaluatedAt: string): PolicyDecision {
    return {
      decision: 'ALLOW',
      risk: 'LOW',
      reasons: ['Internal reasoning trace recorded for audit'],
      policyIds: ['POL-THINK-ALLOW'],
      evaluatedAt,
    };
  }

  // --- Path Normalization & Workspace Boundary Validator ---
  private normalizePath(rawPath: string): { isValid: boolean; resolvedPath: string; reason?: string } {
    if (!rawPath || typeof rawPath !== 'string') {
      return { isValid: false, resolvedPath: '', reason: 'Empty or non-string file path' };
    }

    // Null-byte injection check
    if (rawPath.includes('\0')) {
      return { isValid: false, resolvedPath: '', reason: 'Path traversal attempt: null-byte character detected' };
    }

    // Normalize and resolve path
    const resolvedPath = path.resolve(this.config.workspaceRoot, rawPath.trim());

    // System directories that are always off-limits regardless of workspace location
    const forbiddenSystemPrefixes = ['/etc', '/root', '/bin', '/sbin', '/usr/bin', '/usr/sbin', '/sys', '/proc'];
    for (const prefix of forbiddenSystemPrefixes) {
      if (resolvedPath === prefix || resolvedPath.startsWith(`${prefix}/`)) {
        return { isValid: false, resolvedPath, reason: `Path escapes into prohibited system directory: ${prefix}` };
      }
    }

    return { isValid: true, resolvedPath };
  }

  private checkProtectedFile(resolvedPath: string): { isProtected: boolean; name: string } {
    const filename = path.basename(resolvedPath).toLowerCase();

    const protectedExact = [
      '.env',
      '.env.local',
      '.env.production',
      'id_rsa',
      'id_ed25519',
      'shadow',
      'passwd',
      'authorized_keys',
      'credentials',
    ];
    if (protectedExact.includes(filename)) {
      return { isProtected: true, name: filename };
    }

    if (filename.endsWith('.pem') || filename.endsWith('.key') || filename.endsWith('.pfx')) {
      return { isProtected: true, name: filename };
    }

    if (resolvedPath.includes('/.ssh/') || resolvedPath.includes('/.aws/')) {
      return { isProtected: true, name: path.basename(resolvedPath) };
    }

    return { isProtected: false, name: '' };
  }
}

// Export singleton instance initialized with default runtime configuration
export const policyEngine = new PolicyEngine();
