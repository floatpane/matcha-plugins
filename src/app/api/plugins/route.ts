import { NextResponse } from 'next/server';
import { listPlugins, fetchPluginContent, getPluginMetadata, getPluginsDefaultBranch, isTrustedMaintainer } from '@/lib/github-app';
import { Plugin } from '@/lib/types';
import crypto from 'crypto';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const branch = await getPluginsDefaultBranch();

    if (id) {
      // Get specific plugin
      const content = await fetchPluginContent(id);
      if (!content) {
        return NextResponse.json({ error: 'Plugin not found' }, { status: 404 });
      }

      const manifest = await getPluginMetadata(id);
      const isTrusted = manifest ? isTrustedMaintainer(manifest.author.github_username) : false;

      const plugin: Plugin = buildPlugin(id, content, manifest, branch, isTrusted);
      return NextResponse.json(plugin);
    }

    // List all plugins
    const githubPlugins = await listPlugins();
    const plugins: Plugin[] = [];

    for (const ghPlugin of githubPlugins) {
      try {
        const content = await fetchPluginContent(ghPlugin.name);
        if (!content) continue;

        const manifest = await getPluginMetadata(ghPlugin.name);
        const isTrusted = manifest ? isTrustedMaintainer(manifest.author.github_username) : false;

        plugins.push(buildPlugin(ghPlugin.name, content, manifest, branch, isTrusted));
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

function buildPlugin(
  id: string,
  content: string,
  manifest: Awaited<ReturnType<typeof getPluginMetadata>>,
  branch: string,
  isTrusted: boolean,
): Plugin {
  const authorUsername = manifest?.author.github_username || 'unknown';
  const authorDisplay = manifest?.author.display_name || manifest?.author.github_username || 'Unknown';

  return {
    id,
    name: id,
    title: manifest?.title || formatTitle(id),
    description: manifest?.description || 'No description',
    version: manifest?.version || '1.0.0',
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
    repository_url: manifest?.repository_url || `https://github.com/floatpane/matcha-plugins/tree/${branch}/plugins`,
    file_url: `https://raw.githubusercontent.com/floatpane/matcha-plugins/${branch}/plugins/${id}.lua`,
    sha256: manifest?.sha256 || computeSHA256(content),
    created_at: manifest?.submitted_at || new Date().toISOString(),
    updated_at: manifest?.submitted_at || new Date().toISOString(),
    downloads: 0,
    status: 'approved',
    verification_status: isTrusted ? 'clean' : 'unverified',
    tags: manifest?.tags || [],
  };
}

function formatTitle(name: string): string {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function computeSHA256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}
