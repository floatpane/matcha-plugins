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
