// GitHub App integration for automated plugin submissions
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import crypto from "crypto";
import { PluginManifest, PluginSubmissionInput } from "./types";
import { scanPlugin } from "./scan";

const APP_ID = process.env.GITHUB_APP_ID;
const PRIVATE_KEY = normalizePem(process.env.GITHUB_APP_PRIVATE_KEY);
const INSTALLATION_ID = process.env.GITHUB_APP_INSTALLATION_ID;
const REPO_OWNER = "floatpane";
const REPO_NAME = "matcha-plugins";

function normalizePem(key?: string): string | undefined {
  if (!key) return undefined;
  const replaced = key.replace(/\\n/g, "\n");
  const base64Match = replaced
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "")
    .replace(/-----END [A-Z ]*PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  if (!base64Match) return replaced.trim() || undefined;
  const lines = base64Match.match(/.{1,64}/g) || [];
  return `-----BEGIN RSA PRIVATE KEY-----\n${lines.join("\n")}\n-----END RSA PRIVATE KEY-----`;
}

// Trusted maintainers who get auto-merged
const TRUSTED_MAINTAINERS = new Set(["floatpane", "andrinoff"]);

let octokit: Octokit | null = null;

async function getOctokit(): Promise<Octokit> {
  if (octokit) return octokit;

  if (!APP_ID || !PRIVATE_KEY) {
    throw new Error("GitHub App credentials not configured");
  }

  const auth = createAppAuth({
    appId: APP_ID,
    privateKey: PRIVATE_KEY,
  });

  let installationId: number;
  if (INSTALLATION_ID && /^\d+$/.test(INSTALLATION_ID)) {
    installationId = parseInt(INSTALLATION_ID, 10);
  } else {
    const appAuth = await auth({ type: "app" });
    const appOctokit = new Octokit({ auth: appAuth.token });
    const { data: installation } = await appOctokit.rest.apps.getRepoInstallation({
      owner: REPO_OWNER,
      repo: REPO_NAME,
    });
    installationId = installation.id;
  }

  const installationAuthToken = await auth({ type: "installation", installationId });

  octokit = new Octokit({
    auth: installationAuthToken.token,
  });

  return octokit;
}

let defaultBranchCache: string | null = null;

async function getDefaultBranch(github: Octokit): Promise<string> {
  if (defaultBranchCache) return defaultBranchCache;
  const { data: repo } = await github.rest.repos.get({
    owner: REPO_OWNER,
    repo: REPO_NAME,
  });
  defaultBranchCache = repo.default_branch || "main";
  return defaultBranchCache;
}

export async function getPluginsDefaultBranch(): Promise<string> {
  const github = await getOctokit();
  return getDefaultBranch(github);
}

export function isTrustedMaintainer(username: string): boolean {
  return TRUSTED_MAINTAINERS.has(username);
}

async function getFileSha(
  github: Octokit,
  path: string,
  branch: string,
): Promise<string | null> {
  try {
    const { data } = await github.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path,
      ref: branch,
    });
    if (Array.isArray(data)) return null;
    return "sha" in data ? data.sha : null;
  } catch {
    return null;
  }
}

async function commitFile(
  github: Octokit,
  path: string,
  content: string,
  message: string,
  branch: string,
  sha?: string | null,
): Promise<void> {
  await github.repos.createOrUpdateFileContents({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    path,
    message,
    content: Buffer.from(content).toString("base64"),
    branch,
    sha: sha ?? undefined,
  });
}

function buildManifest(input: PluginSubmissionInput): PluginManifest {
  return {
    name: input.plugin_name,
    title: input.title || input.plugin_name,
    description: input.description || "",
    version: input.version || "1.0.0",
    author: {
      github_username: input.author_github_username,
      display_name: input.author_display_name,
    },
    repository_url: input.repository_url,
    source_branch: input.source_branch,
    source_sha: input.source_sha,
    file_sha: input.file_sha,
    sha256: input.sha256,
    submitted_at: new Date().toISOString(),
    tags: input.tags || [],
  };
}

function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

export async function submitPlugin(
  input: PluginSubmissionInput,
): Promise<{ pr_number: number; merged: boolean; message: string; pr_url: string }> {
  const github = await getOctokit();
  const baseBranch = await getDefaultBranch(github);
  const isTrusted = TRUSTED_MAINTAINERS.has(input.author_github_username);

  const manifestFileName = `${input.plugin_name}.json`;
  const branchName = `plugin-submission-${input.plugin_name}-${Date.now()}`;
  const manifest = buildManifest(input);

  // Create a branch off the default branch
  const { data: ref } = await github.git.getRef({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    ref: `heads/${baseBranch}`,
  });

  await github.git.createRef({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    ref: `refs/heads/${branchName}`,
    sha: ref.object.sha,
  });

  // Commit only the manifest JSON — the .lua file stays in the author's repo
  const manifestSha = await getFileSha(github, `plugins/${manifestFileName}`, branchName);
  await commitFile(
    github,
    `plugins/${manifestFileName}`,
    JSON.stringify(manifest, null, 2) + "\n",
    `Add plugin manifest: ${input.plugin_name}.json`,
    branchName,
    manifestSha,
  );

  // Create PR
  const { data: pr } = await github.pulls.create({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    title: `Add plugin: ${manifest.title}`,
    head: branchName,
    base: baseBranch,
    body: [
      `Plugin submission by @${input.author_github_username}`,
      "",
      `**Title:** ${manifest.title}`,
      `**Description:** ${manifest.description || "_(none)_"} `,
      `**Version:** ${manifest.version}`,
      `**Source:** ${input.repository_url}`,
      `**Branch:** ${input.source_branch}`,
      `**Commit SHA:** ${input.source_sha}`,
      `**File blob SHA:** ${input.file_sha}`,
      `**SHA-256:** ${input.sha256}`,
      "",
      "This PR will be reviewed and merged after security verification.",
    ].join("\n"),
  });

  // Add labels
  await github.issues.addLabels({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    issue_number: pr.number,
    labels: ["plugin-submission", "needs-review"],
  });

  // Auto-merge if the maintainer is trusted
  if (isTrusted) {
    try {
      await github.pulls.merge({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        pull_number: pr.number,
        merge_method: "squash",
      });
      return {
        pr_number: pr.number,
        merged: true,
        message: "Plugin submitted and merged automatically (trusted maintainer)",
        pr_url: pr.html_url,
      };
    } catch (err) {
      console.error("Auto-merge failed, PR remains open:", err);
      return {
        pr_number: pr.number,
        merged: false,
        message: `PR #${pr.number} created but auto-merge failed. Manual review required.`,
        pr_url: pr.html_url,
      };
    }
  }

  return {
    pr_number: pr.number,
    merged: false,
    message: `PR #${pr.number} created for review`,
    pr_url: pr.html_url,
  };
}

/**
 * Fetch the current content of a plugin's .lua file from the author's
 * source repository (not from the plugins repo — we don't store the file).
 */
export async function fetchPluginContent(
  pluginName: string,
): Promise<string | null> {
  const manifest = await fetchPluginManifest(pluginName);
  if (!manifest) return null;

  const parsed = parseRepoUrl(manifest.repository_url);
  if (!parsed) return null;

  const fileUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${manifest.source_branch}/${pluginName}.lua`;
  const response = await fetch(fileUrl);

  if (!response.ok) return null;
  return response.text();
}

export async function fetchPluginManifest(
  pluginName: string,
): Promise<PluginManifest | null> {
  try {
    const github = await getOctokit();
    const branch = await getDefaultBranch(github);
    const { data } = await github.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: `plugins/${pluginName}.json`,
      ref: branch,
    });

    if ("content" in data) {
      const json = Buffer.from(data.content, "base64").toString("utf-8");
      return JSON.parse(json) as PluginManifest;
    }
    return null;
  } catch (error) {
    console.error("Failed to fetch manifest:", error);
    return null;
  }
}

export async function listPlugins(): Promise<
  Array<{ name: string; sha: string; size: number }>
> {
  try {
    const github = await getOctokit();
    const branch = await getDefaultBranch(github);
    const { data } = await github.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: "plugins",
      ref: branch,
    });

    if (!Array.isArray(data)) return [];

    return data
      .filter((item) => item.name.endsWith(".json") && item.type === "file")
      .map((item) => ({
        name: item.name.replace(".json", ""),
        sha: item.sha,
        size: item.size,
      }));
  } catch (error) {
    console.error("Failed to list plugins:", error);
    return [];
  }
}

export async function getPluginMetadata(pluginName: string): Promise<PluginManifest | null> {
  return fetchPluginManifest(pluginName);
}

/**
 * SHA-drift checker.
 *
 * For every published plugin, compares the source_sha recorded in the manifest
 * against the current HEAD commit of the author's source repository. If they
 * differ, fetches the current file content and:
 *   - if SHA-256 is unchanged  -> updates only the source_sha (no content change)
 *   - if SHA-256 changed       -> runs security scan:
 *       - clean   -> auto-merge if trusted, otherwise open PR
 *       - suspicious/warning -> always open PR (never auto-merge)
 *
 * Also detects deleted source repos / files.
 */
export interface DriftResult {
  plugin: string;
  status: "up_to_date" | "updated" | "drift_detected" | "source_missing";
  pr_number?: number;
  pr_url?: string;
  message: string;
}

async function getSourceHeadSha(
  github: Octokit,
  owner: string,
  repo: string,
): Promise<string | null> {
  try {
    const { data: repoData } = await github.rest.repos.get({ owner, repo });
    const branchName = repoData.default_branch;
    if (!branchName) return null;
    const { data: branchData } = await github.repos.getBranch({
      owner,
      repo,
      branch: branchName,
    });
    return branchData.commit.sha;
  } catch {
    return null;
  }
}

async function getSourceFileSha(
  owner: string,
  repo: string,
  branch: string,
  fileName: string,
): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${fileName}.lua?ref=${branch}`,
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.sha ?? null;
  } catch {
    return null;
  }
}

export async function checkPluginUpdates(): Promise<DriftResult[]> {
  const github = await getOctokit();
  const baseBranch = await getDefaultBranch(github);
  const plugins = await listPlugins();
  const results: DriftResult[] = [];

  for (const p of plugins) {
    const manifest = await fetchPluginManifest(p.name);
    if (!manifest) {
      results.push({
        plugin: p.name,
        status: "source_missing",
        message: "No manifest found for plugin",
      });
      continue;
    }

    const parsed = parseRepoUrl(manifest.repository_url);
    if (!parsed) {
      results.push({
        plugin: p.name,
        status: "source_missing",
        message: `Invalid repository_url in manifest: ${manifest.repository_url}`,
      });
      continue;
    }
    const { owner, repo } = parsed;
    const branch = manifest.source_branch || "main";

    // Fetch the current HEAD commit SHA of the source repo
    const headSha = await getSourceHeadSha(github, owner, repo);
    if (!headSha) {
      results.push({
        plugin: p.name,
        status: "source_missing",
        message: `Source repository ${owner}/${repo} is unavailable`,
      });
      continue;
    }

    if (headSha === manifest.source_sha) {
      results.push({
        plugin: p.name,
        status: "up_to_date",
        message: "Source SHA matches manifest",
      });
      continue;
    }

    // Commit changed — fetch current file content and recompute SHA-256
    const fileUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${p.name}.lua`;
    const fileResponse = await fetch(fileUrl);

    if (!fileResponse.ok) {
      results.push({
        plugin: p.name,
        status: "source_missing",
        message: `Plugin file not found in source repo (branch: ${branch})`,
      });
      continue;
    }

    const newContent = await fileResponse.text();
    const newSha256 = crypto.createHash("sha256").update(newContent).digest("hex");

    // Content unchanged despite commit drift — just update source_sha
    if (newSha256 === manifest.sha256) {
      const newFileSha = await getSourceFileSha(owner, repo, branch, p.name);
      await updateManifestOnly(github, p.name, manifest, baseBranch, {
        source_sha: headSha,
        file_sha: newFileSha || manifest.file_sha,
      });
      results.push({
        plugin: p.name,
        status: "updated",
        message: "Source SHA updated (content unchanged)",
      });
      continue;
    }

    // Content changed — run security scan before deciding whether to auto-merge
    const scanResult = scanPlugin(newContent);
    const isTrusted = TRUSTED_MAINTAINERS.has(manifest.author.github_username);
    const canAutoMerge = isTrusted && scanResult.isClean;

    const newFileSha = await getSourceFileSha(owner, repo, branch, p.name);
    const branchName = `plugin-update-${p.name}-${Date.now()}`;
    const manifestPath = `plugins/${p.name}.json`;

    const { data: baseRef } = await github.git.getRef({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      ref: `heads/${baseBranch}`,
    });

    await github.git.createRef({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      ref: `refs/heads/${branchName}`,
      sha: baseRef.object.sha,
    });

    const updatedManifest: PluginManifest = {
      ...manifest,
      source_sha: headSha,
      file_sha: newFileSha || manifest.file_sha,
      sha256: newSha256,
      submitted_at: new Date().toISOString(),
    };

    const existingManifestSha = await getFileSha(github, manifestPath, branchName);
    await commitFile(
      github,
      manifestPath,
      JSON.stringify(updatedManifest, null, 2) + "\n",
      `Update manifest: ${p.name}.json`,
      branchName,
      existingManifestSha,
    );

    const scanLabel =
      scanResult.status === "safe"
        ? "scan-clean"
        : scanResult.status === "warning"
          ? "scan-warning"
          : "scan-suspicious";

    const { data: pr } = await github.pulls.create({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      title: `Update plugin: ${manifest.title}`,
      head: branchName,
      base: baseBranch,
      body: [
        `Automated update for **${manifest.title}**`,
        "",
        `**Source:** ${manifest.repository_url}`,
        `**Previous commit:** ${manifest.source_sha.slice(0, 7)}`,
        `**New commit:** ${headSha.slice(0, 7)}`,
        `**New SHA-256:** ${newSha256}`,
        "",
        `### Security scan: ${scanResult.status}`,
        scanResult.issues.length > 0
          ? scanResult.issues.map((i) => `- ${i}`).join("\n")
          : "No issues detected.",
        "",
        canAutoMerge
          ? "✅ Auto-merging (trusted maintainer, clean scan)"
          : "📋 Manual review required.",
      ].join("\n"),
    });

    await github.issues.addLabels({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      issue_number: pr.number,
      labels: ["plugin-update", scanLabel, canAutoMerge ? "auto-merge" : "needs-review"],
    });

    if (canAutoMerge) {
      try {
        await github.pulls.merge({
          owner: REPO_OWNER,
          repo: REPO_NAME,
          pull_number: pr.number,
          merge_method: "squash",
        });
        results.push({
          plugin: p.name,
          status: "updated",
          pr_number: pr.number,
          pr_url: pr.html_url,
          message: "Update auto-merged (trusted, clean scan)",
        });
        continue;
      } catch (err) {
        console.error(`Auto-merge failed for ${p.name}:`, err);
      }
    }

    results.push({
      plugin: p.name,
      status: "drift_detected",
      pr_number: pr.number,
      pr_url: pr.html_url,
      message: `Update PR #${pr.number} opened (scan: ${scanResult.status})`,
    });
  }

  return results;
}

/** Update only the manifest without opening a PR (for content-unchanged drift). */
async function updateManifestOnly(
  github: Octokit,
  pluginName: string,
  manifest: PluginManifest,
  baseBranch: string,
  updates: Partial<Pick<PluginManifest, "source_sha" | "file_sha">>,
): Promise<void> {
  const manifestPath = `plugins/${pluginName}.json`;
  const updated = { ...manifest, ...updates };
  const existingSha = await getFileSha(github, manifestPath, baseBranch);
  await commitFile(
    github,
    manifestPath,
    JSON.stringify(updated, null, 2) + "\n",
    `Update source SHA: ${pluginName}`,
    baseBranch,
    existingSha,
  );
}
