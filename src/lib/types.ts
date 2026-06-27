export interface Plugin {
  id: string;
  name: string;
  title: string;
  description: string;
  version: string;
  author: {
    github_username: string;
    display_name: string;
    is_verified: boolean;
  };
  maintainer: {
    github_username: string;
    display_name: string;
    is_verified: boolean;
  };
  repository_url: string;
  file_url: string;
  sha256: string;
  created_at: string;
  updated_at: string;
  downloads: number;
  status: 'pending' | 'approved' | 'rejected';
  verification_status: 'unverified' | 'scanning' | 'clean' | 'suspicious';
  tags: string[];
}

/**
 * JSON manifest — the ONLY file stored in the matcha-plugins repo.
 * Lives at plugins/{plugin_name}.json
 *
 * The .lua source file is never copied into the plugins repo. Instead
 * we keep enough metadata to fetch it from the author's repository and
 * verify it hasn't been tampered with:
 *   - source_sha:   the git commit SHA of the source repo at submission time
 *   - file_sha:     the git blob SHA of the .lua file at submission time
 *   - sha256:       SHA-256 of the file content at submission time
 */
export interface PluginManifest {
  name: string;
  title: string;
  description: string;
  version: string;
  author: {
    github_username: string;
    display_name: string;
  };
  repository_url: string;
  source_branch: string;
  source_sha: string;
  file_sha: string;
  sha256: string;
  submitted_at: string;
  tags: string[];
}

export interface PluginSubmissionInput {
  plugin_name: string;
  title: string;
  description: string;
  version: string;
  repository_url: string;
  author_github_username: string;
  author_display_name: string;
  file_content: string;
  file_sha: string;
  source_branch: string;
  source_sha: string;
  sha256: string;
  tags: string[];
}

export interface PluginSubmission {
  repository_url: string;
  plugin_name: string;
  author_github_username?: string;
  author_display_name?: string;
}

export interface GitHubPRResponse {
  pr_number: number;
  pr_url: string;
  status: 'merged' | 'pr_created';
  message: string;
}
