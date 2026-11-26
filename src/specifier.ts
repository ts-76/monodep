import semver from 'semver';

export interface RegistryTarget {
    /** Package name to look up on the registry (differs from the dependency key for npm: aliases). */
    name: string;
    /** Semver range declared for that package. */
    range: string;
}

/**
 * Resolve a declared dependency to the registry package and semver range it points at.
 * Returns null for specifiers that do not resolve through the registry by version range
 * (workspace:, file:, link:, git/GitHub/URL specifiers, dist-tags such as "latest",
 * unresolved catalog: references, ...), which cannot be judged "outdated".
 */
export function resolveRegistryTarget(dependency: string, specifier: string): RegistryTarget | null {
    const spec = specifier.trim();
    let name = dependency;
    let range = spec;

    if (spec.startsWith('npm:')) {
        const target = spec.slice('npm:'.length);
        const at = target.lastIndexOf('@');
        if (at <= 0) return null; // "npm:pkg" without a range
        name = target.slice(0, at);
        range = target.slice(at + 1);
    }

    if (!name || !semver.validRange(range, { loose: true })) return null;
    return { name, range };
}
