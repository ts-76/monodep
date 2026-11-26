import { resolveRegistryTarget } from './specifier';

export interface VersionInfo {
    /** Dependency key as declared in package.json. */
    package: string;
    /** Declared specifier, as written. */
    current: string;
    /** Latest version on the registry for the (possibly aliased) package. */
    latest: string;
    /** Semver range that `latest` is compared against. */
    range: string;
}

const REQUEST_TIMEOUT_MS = 10_000;

function registryBaseUrl(): string {
    return (process.env.MONODEP_REGISTRY || 'https://registry.npmjs.org').replace(/\/+$/, '');
}

// Simple in-memory cache for package versions
const versionCache = new Map<string, string>();

// Concurrency limiter for parallel requests
async function limitConcurrency<T>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<void>
): Promise<void> {
    const queue = [...items];
    const running: Promise<void>[] = [];

    while (queue.length > 0 || running.length > 0) {
        while (running.length < concurrency && queue.length > 0) {
            const item = queue.shift()!;
            const promise = fn(item).finally(() => {
                running.splice(running.indexOf(promise), 1);
            });
            running.push(promise);
        }
        if (running.length > 0) {
            await Promise.race(running);
        }
    }
}

export class VersionChecker {
    private cache = versionCache;

    /**
     * Pre-fetch versions for multiple packages at once.
     * This deduplicates packages and fetches them in parallel with concurrency limit.
     */
    async prefetch(packageNames: string[]): Promise<void> {
        // Filter out names that are already cached
        const toFetch = [...new Set(packageNames)].filter((pkg) => !this.cache.has(pkg));

        if (toFetch.length === 0) return;

        await limitConcurrency(toFetch, 10, async (pkg) => {
            try {
                const version = await this.fetchLatestVersion(pkg);
                if (version) {
                    this.cache.set(pkg, version);
                }
            } catch {
                // Ignore errors (private packages, network issues)
            }
        });
    }

    /**
     * Fetch the latest version of a package from npm registry.
     * Uses the registry API directly instead of spawning npm processes.
     */
    private async fetchLatestVersion(pkg: string): Promise<string | null> {
        try {
            // Use abbreviated metadata for faster response
            const response = await fetch(`${registryBaseUrl()}/${encodeURIComponent(pkg)}/latest`, {
                headers: {
                    'Accept': 'application/json',
                },
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });

            if (!response.ok) {
                return null;
            }

            const data = await response.json() as { version?: string };
            return data.version || null;
        } catch {
            return null;
        }
    }

    /**
     * Check versions for a set of dependencies.
     * Uses cache if available, otherwise fetches from registry.
     */
    async checkVersions(dependencies: Record<string, string>): Promise<VersionInfo[]> {
        const results: VersionInfo[] = [];

        for (const [pkg, currentRange] of Object.entries(dependencies)) {
            // Skip anything that is not a registry semver range (workspace:, file:, git, tags, ...)
            const target = resolveRegistryTarget(pkg, currentRange);
            if (!target) continue;

            let latest = this.cache.get(target.name);

            // If not in cache, fetch it (fallback for single package check)
            if (!latest) {
                latest = await this.fetchLatestVersion(target.name) || undefined;
                if (latest) {
                    this.cache.set(target.name, latest);
                }
            }

            if (latest) {
                results.push({
                    package: pkg,
                    current: currentRange,
                    latest: latest,
                    range: target.range,
                });
            }
        }

        return results;
    }

    /**
     * Clear the version cache
     */
    clearCache(): void {
        this.cache.clear();
    }
}
