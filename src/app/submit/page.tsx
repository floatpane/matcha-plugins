'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { GithubLogo, Warning, CheckCircle, ShieldCheck, ArrowLeft } from '@phosphor-icons/react';

export default function SubmitPlugin() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    repository_url: '',
    plugin_name: '',
    title: '',
    description: '',
    version: '1.0.0',
    tags: '',
    author_display_name: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [repoInfo, setRepoInfo] = useState<{ owner?: { login?: string; avatar_url?: string }; full_name?: string; description?: string; luaFiles?: Array<{ name: string; type: string }> } | null>(null);

  const handleRepoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Extract GitHub username and repo from URL
      const match = formData.repository_url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) {
        throw new Error('Please enter a valid GitHub repository URL');
      }

      const [, owner, repo] = match;
      
      // Fetch repo info (in production, this would be server-side)
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
      if (!response.ok) {
        throw new Error('Repository not found. Please check the URL.');
      }

      const data = await response.json();
      setRepoInfo(data);
      
      // Look for .lua files in the repo
      const filesResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents`);
      if (filesResponse.ok) {
        const files = await filesResponse.json();
        const luaFiles = Array.isArray(files) 
          ? files.filter((f: { name: string; type: string }) => f.name.endsWith('.lua') && f.type === 'file')
          : [];
        
        if (luaFiles.length === 0) {
          setError('No .lua files found in this repository. Make sure your plugin file is in the root directory.');
          setLoading(false);
          return;
        }
        
        if (luaFiles.length === 1) {
          // Auto-select if only one plugin
          setFormData(prev => ({ ...prev, plugin_name: luaFiles[0].name.replace('.lua', '') }));
          setStep(2);
        } else {
          // Show selection UI (simplified - just store the list)
          setRepoInfo({ ...data, luaFiles });
          setStep(2);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch repository');
    } finally {
      setLoading(false);
    }
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plugin_name: formData.plugin_name,
          title: formData.title,
          description: formData.description,
          version: formData.version,
          tags: formData.tags.split(',').map((t: string) => t.trim()).filter(Boolean),
          author_github_username: repoInfo?.owner?.login || 'unknown',
          author_display_name: formData.author_display_name || repoInfo?.owner?.login || 'Unknown',
          repository_url: formData.repository_url,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Submission failed');
      }

      setSuccess('Plugin submitted successfully! It will be reviewed and verified before being published.');
      setTimeout(() => router.push('/'), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Navigation */}
      <nav className="border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="Matcha" width={32} height={32} className="rounded-lg" />
              <span className="font-semibold text-white text-lg">Submit Plugin</span>
            </div>
            <button
              onClick={() => router.push('/')}
              className="text-sm text-slate-300 hover:text-white flex items-center gap-1 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Marketplace
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 py-12">
        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-center gap-4">
            <div className={`flex items-center gap-2 ${step >= 1 ? 'text-emerald-400' : 'text-slate-500'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= 1 ? 'bg-emerald-600 text-white' : 'bg-white/5 text-slate-500'
              }`}>
                1
              </div>
              <span className="text-sm font-medium">Repository</span>
            </div>
            <div className="w-12 h-0.5 bg-white/10" />
            <div className={`flex items-center gap-2 ${step >= 2 ? 'text-emerald-400' : 'text-slate-500'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= 2 ? 'bg-emerald-600 text-white' : 'bg-white/5 text-slate-500'
              }`}>
                2
              </div>
              <span className="text-sm font-medium">Details</span>
            </div>
          </div>
        </div>

        {/* Security Notice */}
        <div className="mb-8 p-4 bg-emerald-950/30 border border-emerald-900/50 rounded-lg">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" weight="fill" />
            <div>
              <h3 className="font-semibold text-emerald-300 mb-1">How it works</h3>
              <ul className="text-sm text-emerald-400/80 space-y-1">
                <li>• Provide your GitHub repository URL</li>
                <li>• We&apos;ll automatically detect your plugin file(s)</li>
                <li>• Automated security scanning and verification</li>
                <li>• Manual review before publishing</li>
              </ul>
            </div>
          </div>
        </div>

        {step === 1 && (
          <form onSubmit={handleRepoSubmit} className="space-y-6">
            <div className="bg-white/[0.03] border border-white/10 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-white mb-4">GitHub Repository</h2>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Repository URL *
                </label>
                <div className="relative">
                  <GithubLogo className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    type="url"
                    required
                    value={formData.repository_url}
                    onChange={(e) => setFormData({ ...formData, repository_url: e.target.value })}
                    placeholder="https://github.com/username/repository"
                    className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all text-white placeholder:text-slate-500"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Your repository should contain the .lua plugin file in the root directory
                </p>
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-950/40 border border-red-900/50 rounded-lg">
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-6 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Fetching repository...
                  </>
                ) : (
                  'Continue'
                )}
              </button>
            </div>
          </form>
        )}

        {step === 2 && repoInfo && (
          <form onSubmit={handleFinalSubmit} className="space-y-6">
            {/* Repo Info */}
            <div className="bg-white/[0.03] border border-white/10 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <Image 
                  src={repoInfo.owner?.avatar_url || ''} 
                  alt="" 
                  width={40} 
                  height={40} 
                  className="rounded-full"
                />
                <div>
                  <h3 className="font-semibold text-white">{repoInfo.full_name}</h3>
                  <p className="text-sm text-slate-400">{repoInfo.description || 'No description'}</p>
                </div>
              </div>

              {/* Plugin Selection (if multiple) */}
              {repoInfo.luaFiles && repoInfo.luaFiles.length > 1 && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Select Plugin File
                  </label>
                  <select
                    value={formData.plugin_name}
                    onChange={(e) => setFormData({ ...formData, plugin_name: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-white"
                  >
                    {repoInfo.luaFiles.map((file) => (
                      <option key={file.name} value={file.name.replace('.lua', '')} className="bg-[#1a1a1a]">
                        {file.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Plugin File Name
                    </label>
                    <input
                      type="text"
                      value={formData.plugin_name}
                      onChange={(e) => setFormData({ ...formData, plugin_name: e.target.value })}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Display Name (optional)
                    </label>
                    <input
                      type="text"
                      value={formData.author_display_name}
                      onChange={(e) => setFormData({ ...formData, author_display_name: e.target.value })}
                      placeholder={repoInfo.owner?.login || 'Your name'}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-white placeholder:text-slate-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Plugin Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="My Awesome Plugin"
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-white placeholder:text-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="A short description of what your plugin does"
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-white placeholder:text-slate-500 resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Version
                    </label>
                    <input
                      type="text"
                      value={formData.version}
                      onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                      placeholder="1.0.0"
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-white placeholder:text-slate-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Tags (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={formData.tags}
                      onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                      placeholder="productivity, theme, utils"
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-white placeholder:text-slate-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Warnings */}
            <div className="bg-amber-950/30 border border-amber-900/50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Warning className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-amber-300 mb-2">Before submitting</h3>
                  <ul className="text-sm text-amber-400/80 space-y-1">
                    <li>• Your plugin will undergo automated security scanning</li>
                    <li>• Manual review may take 1-3 business days</li>
                    <li>• You can update your plugin by submitting a new version</li>
                    <li>• Plugins using os.execute or io.popen require additional review</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Messages */}
            {error && (
              <div className="bg-red-950/40 border border-red-900/50 rounded-lg p-4">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {success && (
              <div className="bg-emerald-950/40 border border-emerald-900/50 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-400" weight="fill" />
                  <p className="text-sm text-emerald-300">{success}</p>
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 px-6 py-3 border border-white/10 hover:bg-white/5 text-slate-300 rounded-lg font-medium transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Plugin'
                )}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
