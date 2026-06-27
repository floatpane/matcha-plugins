// GitHub App integration for automated plugin submissions
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { PluginManifest, PluginSubmissionInput } from "./types";

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
  const title = input.plugin_name
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return {
    name: input.plugin_name,
    title,
    description: "",
    version: "1.0.0",
    author: {
      github_username: input.author_github_username,
      display_name: input.author_display_name,
    },
    repository_url: input.repository_url,
    source_branch: input.source_branch,
    source_sha: input.source_sha,
    sha256: input.sha256,
    submitted_at: new Date().toISOString(),
    tags: [],
  };
}

export async function submitPlugin(
  input: PluginSubmissionInput,
): Promise<{ pr_number: number; merged: boolean; message: string; pr_url: string }> {
  const github = await getOctokit();
  const baseBranch = await getDefaultBranch(github);
  const isTrusted = TRUSTED_MAINTAINERS.has(input.author_github_username);

  const luaFileName = `${input.plugin_name}.lua`;
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

  // Commit the .lua file
  const luaSha = await getFileSha(github, `plugins/${luaFileName}`, branchName);
  await commitFile(
    github,
    `plugins/${luaFileName}`,
    input.file_content,
    `Add plugin: ${input.plugin_name}.lua`,
    branchName,
    luaSha,
  );

  // Commit the manifest .json file
  const manifestSha = await getFileSha(github, `plugins/${manifestFileName}`, branchName);
  await commitFile(
    github,
    `plugins/${manifestFileName}`,
    JSON.stringify(manifest, null, 2) + "\n",
    `Add manifest: ${input.plugin_name}.json`,
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
      `**Source:** ${input.repository_url}`,
      `**Branch:** ${input.source_branch}`,
      `**Commit SHA:** ${input.source_sha}`,
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

export async function fetchPluginContent(
  pluginName: string,
): Promise<string | null> {
  try {
    const github = await getOctokit();
    const branch = await getDefaultBranch(github);
    const { data } = await github.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: `plugins/${pluginName}.lua`,
      ref: branch,
    });

    if ("content" in data) {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    return null;
  } catch (error) {
    console.error("Failed to fetch plugin:", error);
    return null;
  }
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
      .filter((item) => item.name.endsWith(".lua") && item.type === "file")
      .map((item) => ({
        name: item.name.replace(".lua", ""),
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
 * against the current HEAD commit of the user's source repository. If they
 * differ, fetches the current file content, recomputes SHA-256, and:
 *   - if SHA-256 is unchanged  -> no-op (commit moved but content identical)
 *   - if SHA-256 changed       -> opens an update PR (or auto-merges if trusted)
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

    const match = manifest.repository_url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) {
      results.push({
        plugin: p.name,
        status: "source_missing",
        message: `Invalid repository_url in manifest: ${manifest.repository_url}`,
      });
      continue;
    }
    const [, owner, repo] = match;

    // Fetch the current HEAD commit SHA of the source repo
    let headSha: string;
    try {
      const { data: repoData } = await github.rest.repos.get({ owner, repo });
      headSha = repoData.default_branch
        ? (await github.repos.getBranch({ owner, repo, branch: repoData.default_branch })).data.commit.sha
        : repoData.pushed_at;
    } catch {
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

    // SHA changed — fetch current file content and recompute SHA-256
    const branch = manifest.source_branch || "main";
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
    const crypto = await import("crypto");
    const newSha256 = crypto.createHash("sha256").update(newContent).digest("hex");

    if (newSha256 === manifest.sha256) {
      results.push({
        plugin: p.name,
        status: "up_to_date",
        message: "Content unchanged despite commit drift",
      });
      continue;
    }

    // Content changed — open an update PR
    const isTrusted = TRUSTED_MAINTAINERS.has(manifest.author.github_username);
    const branchName = `plugin-update-${p.name}-${Date.now()}`;

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

    const luaPath = `plugins/${p.name}.lua`;
    const manifestPath = `plugins/${p.name}.json`;

    const existingLuaSha = await getFileSha(github, luaPath, branchName);
    await commitFile(
      github,
      luaPath,
      newContent,
      `Update plugin: ${p.name}.lua`,
      branchName,
      existingLuaSha,
    );

    const updatedManifest: PluginManifest = {
      ...manifest,
      source_sha: headSha,
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
        `**Previous SHA:** ${manifest.source_sha.slice(0, 7)}`,
        `**New SHA:** ${headSha.slice(0, 7)}`,
        `**New SHA-256:** ${newSha256}`,
        "",
        "Detected by automated SHA-drift checker.",
      ].join("\n"),
    });

    await github.issues.addLabels({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      issue_number: pr.number,
      labels: ["plugin-update", isTrusted ? "auto-merge" : "needs-review"],
    });

    if (isTrusted) {
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
          message: "Update auto-merged (trusted maintainer)",
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
      message: `Update PR #${pr.number} opened for review`,
    });
  }

  return results;
}
