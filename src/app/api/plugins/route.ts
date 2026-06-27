import { NextResponse } from 'next/server';
import { listPlugins, getPluginMetadata, isTrustedMaintainer } from '@/lib/github-app';
import { Plugin, PluginManifest } from '@/lib/types';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      const manifest = await getPluginMetadata(id);
      if (!manifest) {
        return NextResponse.json({ error: 'Plugin not found' }, { status: 404 });
      }
      const isTrusted = isTrustedMaintainer(manifest.author.github_username);
      return NextResponse.json(buildPlugin(id, manifest, isTrusted));
    }

    // List all plugins
    const githubPlugins = await listPlugins();
    const plugins: Plugin[] = [];

    for (const ghPlugin of githubPlugins) {
      try {
        const manifest = await getPluginMetadata(ghPlugin.name);
        if (!manifest) continue;
        const isTrusted = isTrustedMaintainer(manifest.author.github_username);
        plugins.push(buildPlugin(ghPlugin.name, manifest, isTrusted));
      } catch (error) {
        console.error(`Failed to process plugin ${ghPlugin.name}:`, error);
      }
    }

    return NextResponse.json(plugins);
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function buildPlugin(id: string, manifest: PluginManifest, isTrusted: boolean): Plugin {
  const authorUsername = manifest.author.github_username || 'unknown';
  const authorDisplay = manifest.author.display_name || manifest.author.github_username || 'Unknown';
  const parsed = manifest.repository_url.match(/github\.com\/([^/]+)\/([^/]+)/);
  const branch = manifest.source_branch || 'main';

  // file_url points to the author's source repo, not the plugins repo
  const fileUrl = parsed
    ? `https://raw.githubusercontent.com/${parsed[1]}/${parsed[2]}/${branch}/${id}.lua`
    : '';

  return {
    id,
    name: id,
    title: manifest.title || formatTitle(id),
    description: manifest.description || 'No description',
    version: manifest.version || '1.0.0',
    author: {
      github_username: authorUsername,
      display_name: authorDisplay,
      is_verified: isTrusted,
    },
    maintainer: {
      github_username: authorUsername,
      display_name: authorDisplay,
      is_verified: isTrusted,
    },
    repository_url: manifest.repository_url,
    file_url: fileUrl,
    sha256: manifest.sha256,
    created_at: manifest.submitted_at || new Date().toISOString(),
    updated_at: manifest.submitted_at || new Date().toISOString(),
    downloads: 0,
    status: 'approved',
    verification_status: isTrusted ? 'clean' : 'unverified',
    tags: manifest.tags || [],
  };
}

function formatTitle(name: string): string {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
