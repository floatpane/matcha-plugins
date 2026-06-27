"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  MagnifyingGlass,
  DownloadSimple,
  ShieldCheck,
  CheckCircle,
  Warning,
  GithubLogo,
  ArrowSquareOut,
  Tag as TagIcon,
  Star,
} from "@phosphor-icons/react";
import { Plugin } from "@/lib/types";

export default function Marketplace() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/plugins")
      .then((res) => res.json())
      .then((data) => {
        setPlugins(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch plugins:", err);
        setLoading(false);
      });
  }, []);

  const filteredPlugins = plugins.filter((plugin) => {
    const matchesSearch =
      plugin.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      plugin.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTag = !selectedTag || plugin.tags.includes(selectedTag);
    return matchesSearch && matchesTag;
  });

  const allTags = Array.from(new Set(plugins.flatMap((p) => p.tags))).slice(
    0,
    8,
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading marketplace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Navigation */}
      <nav className="border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="Matcha"
                width={32}
                height={32}
                className="rounded-lg"
              />
              <span className="font-semibold text-white text-lg">
                Matcha Marketplace
              </span>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="/submit"
                className="text-sm text-slate-300 hover:text-white transition-colors"
              >
                Submit Plugin
              </a>
              <a
                href="https://github.com/floatpane/matcha"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 hover:text-white transition-colors"
              >
                <GithubLogo className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-emerald-950/40 to-[#0a0a0a] py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
            Extend Matcha with Plugins
          </h1>
          <p className="text-lg text-slate-400 mb-8 max-w-2xl mx-auto leading-relaxed">
            Discover community-built plugins to enhance your email experience.
            From productivity tools to custom workflows.
          </p>

          {/* Search Bar */}
          <div className="max-w-xl mx-auto relative">
            <MagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              type="text"
              placeholder="Search plugins..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all text-white placeholder:text-slate-500"
            />
          </div>

          {/* Tags */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-center mt-6">
              <button
                onClick={() => setSelectedTag(null)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  !selectedTag
                    ? "bg-emerald-600 text-white"
                    : "bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                All
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    selectedTag === tag
                      ? "bg-emerald-600 text-white"
                      : "bg-white/5 text-slate-300 hover:bg-white/10"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Plugins Grid */}
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          {filteredPlugins.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-slate-400">
                No plugins found matching your search.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPlugins.map((plugin) => (
                <PluginCard key={plugin.id} plugin={plugin} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 px-4 mt-16">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Matcha"
              width={24}
              height={24}
              className="rounded"
            />
            <span className="text-sm text-slate-400">© 2026 Floatpane</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-slate-400">
            <a
              href="https://github.com/floatpane/matcha"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              GitHub
            </a>
            <a
              href="/submit"
              className="hover:text-white transition-colors"
            >
              Submit Plugin
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function PluginCard({ plugin }: { plugin: Plugin }) {
  const isVerified = plugin.author.is_verified && plugin.maintainer.is_verified;
  const isTrusted = plugin.verification_status === "clean";

  return (
    <div className="group bg-white/[0.03] border border-white/10 rounded-lg p-6 hover:shadow-lg hover:shadow-emerald-900/20 hover:border-emerald-500/30 transition-all duration-200">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-white text-lg">
              {plugin.title}
            </h3>
            {isVerified && (
              <CheckCircle className="w-4 h-4 text-emerald-500" weight="fill" />
            )}
          </div>
          <p className="text-sm text-slate-400 line-clamp-2 leading-relaxed">
            {plugin.description}
          </p>
        </div>
      </div>

      {/* Metadata */}
      <div className="space-y-2 mb-4">
        {/* Author */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">by</span>
          <a
            href={`https://github.com/${plugin.author.github_username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1"
          >
            <GithubLogo className="w-3.5 h-3.5" />
            {plugin.author.display_name}
          </a>
          {!isVerified && <Warning className="w-3.5 h-3.5 text-amber-500" />}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>v{plugin.version}</span>
          <span className="flex items-center gap-1">
            <DownloadSimple className="w-3.5 h-3.5" />
            {plugin.downloads.toLocaleString()}
          </span>
        </div>

        {/* Verification Badge */}
        <div>
          {isTrusted ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded text-xs font-medium">
              <ShieldCheck className="w-3 h-3" weight="fill" />
              Verified
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-500/10 text-amber-400 rounded text-xs font-medium">
              <Warning className="w-3 h-3" />
              Unverified
            </span>
          )}
        </div>

        {/* Tags */}
        {plugin.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {plugin.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/5 text-slate-400 rounded text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() =>
            (window.location.href = `matcha:install:${plugin.name}`)
          }
          className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-medium transition-colors text-sm flex items-center justify-center gap-2"
        >
          <DownloadSimple className="w-4 h-4" />
          Install
        </button>
        <a
          href={plugin.repository_url}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-2 border border-white/10 hover:border-white/20 text-slate-300 rounded-md transition-colors flex items-center justify-center"
          title="View Repository"
        >
          <ArrowSquareOut className="w-4 h-4" />
        </a>
      </div>

      {/* Warning for untrusted */}
      {!isVerified && (
        <div className="mt-3 pt-3 border-t border-amber-500/20">
          <p className="text-xs text-amber-400/80 flex items-start gap-1.5">
            <Warning className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>
              Unverified author. Confirmation required before install.
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
