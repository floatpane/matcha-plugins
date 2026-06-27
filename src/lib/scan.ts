// Shared Lua plugin security scanner
// Used by the API drift checker and the CI scan script

export interface ScanIssue {
  pattern: string;
  message: string;
  severity: "danger" | "warning";
}

export const DANGEROUS_PATTERNS: ScanIssue[] = [
  { pattern: "os\\.execute", message: "Uses os.execute - can run system commands", severity: "danger" },
  { pattern: "io\\.popen", message: "Uses io.popen - can execute shell commands", severity: "danger" },
  { pattern: "debug\\.", message: "Accesses debug library", severity: "danger" },
  { pattern: "loadstring", message: "Uses loadstring - dynamic code execution", severity: "danger" },
  { pattern: "dofile", message: "Uses dofile - executes external files", severity: "danger" },
  { pattern: "assert\\(load", message: "Dynamic code execution via assert(load)", severity: "danger" },
  { pattern: "os\\.remove", message: "Can delete files", severity: "warning" },
  { pattern: "io\\.open", message: "File system access", severity: "warning" },
  { pattern: "require\\s*\\(\\s*[\"']socket[\"']", message: "Network access via socket", severity: "warning" },
];

export interface ScanResult {
  status: "safe" | "warning" | "danger";
  issues: string[];
  isClean: boolean;
  isSuspicious: boolean;
}

export function scanPlugin(content: string): ScanResult {
  const issues: string[] = [];
  let maxSeverity: "safe" | "warning" | "danger" = "safe";

  for (const { pattern, message, severity } of DANGEROUS_PATTERNS) {
    const regex = new RegExp(pattern, "i");
    if (regex.test(content)) {
      issues.push(message);
      if (severity === "danger") {
        maxSeverity = "danger";
      } else if (maxSeverity !== "danger") {
        maxSeverity = "warning";
      }
    }
  }

  return {
    status: maxSeverity,
    issues,
    isClean: maxSeverity === "safe",
    isSuspicious: maxSeverity === "danger",
  };
}
