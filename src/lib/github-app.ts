// GitHub App integration for automated plugin submissions
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";

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

export async function submitPlugin(
  fileName: string,
  content: string,
  authorUsername: string,
  commitMessage: string,
): Promise<{ pr_number?: number; merged: boolean; message: string }> {
  try {
    const github = await getOctokit();
    const isTrusted = TRUSTED_MAINTAINERS.has(authorUsername);
    const branch = await getDefaultBranch(github);

    // Check if file already exists
    let existingFile: any = null;
    try {
      const { data } = await github.repos.getContent({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path: `plugins/${fileName}`,
        ref: branch,
      });
      existingFile = data;
    } catch (e) {
      // File doesn't exist yet
    }

    if (isTrusted) {
      // Trusted maintainer - direct commit to default branch
      await github.repos.createOrUpdateFileContents({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path: `plugins/${fileName}`,
        message: commitMessage,
        content: Buffer.from(content).toString("base64"),
        branch,
        sha: existingFile?.sha,
      });

      return {
        merged: true,
        message: "Plugin merged directly (trusted maintainer)",
      };
    } else {
      // Untrusted - create a PR
      const branchName = `plugin-submission-${fileName}-${Date.now()}`;

      // Create new branch off the default branch
      const { data: ref } = await github.git.getRef({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        ref: `heads/${branch}`,
      });

      await github.git.createRef({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        ref: `refs/heads/${branchName}`,
        sha: ref.object.sha,
      });

      // Commit file to new branch
      await github.repos.createOrUpdateFileContents({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path: `plugins/${fileName}`,
        message: commitMessage,
        content: Buffer.from(content).toString("base64"),
        branch: branchName,
      });

      // Create PR
      const { data: pr } = await github.pulls.create({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        title: `Add plugin: ${fileName.replace(".lua", "")}`,
        head: branchName,
        base: branch,
        body: `Plugin submission by @${authorUsername}\n\nThis PR will be reviewed and merged after security verification.`,
      });

      // Add labels
      await github.issues.addLabels({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        issue_number: pr.number,
        labels: ["plugin-submission", "needs-review"],
      });

      return {
        pr_number: pr.number,
        merged: false,
        message: `PR #${pr.number} created for review`,
      };
    }
  } catch (error) {
    console.error("GitHub submission failed:", error);
    throw error;
  }
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
      .filter((item: any) => item.name.endsWith(".lua") && item.type === "file")
      .map((item: any) => ({
        name: item.name.replace(".lua", ""),
        sha: item.sha,
        size: item.size,
      }));
  } catch (error) {
    console.error("Failed to list plugins:", error);
    return [];
  }
}

export async function getPluginMetadata(pluginName: string): Promise<any> {
  const content = await fetchPluginContent(pluginName);
  if (!content) return null;

  // Extract metadata from comments
  const metadata: any = {};
  const lines = content.split("\n").slice(0, 30);

  for (const line of lines) {
    const titleMatch = line.match(/--\s*@title\s+(.+)/i);
    if (titleMatch) metadata.title = titleMatch[1].trim();

    const descMatch = line.match(/--\s*@description\s+(.+)/i);
    if (descMatch) metadata.description = descMatch[1].trim();

    const versionMatch = line.match(/--\s*@version\s+(.+)/i);
    if (versionMatch) metadata.version = versionMatch[1].trim();

    const authorMatch = line.match(/--\s*@author\s+(.+)/i);
    if (authorMatch) metadata.author = authorMatch[1].trim();

    const tagsMatch = line.match(/--\s*@tags\s+(.+)/i);
    if (tagsMatch) {
      metadata.tags = tagsMatch[1]
        .split(",")
        .map((t: string) => t.trim())
        .filter(Boolean);
    }
  }

  return metadata;
}
