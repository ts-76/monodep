import { Command } from 'commander';
import path from 'path';
import chalk from 'chalk';
import semver from 'semver';
import { MonorepoManager } from './monorepo';
import { Analyzer } from './analyzer';
import { VersionChecker } from './version-checker';
import { ConfigLoader } from './config';
import { ConsistencyChecker } from './consistency';
import { InternalChecker } from './internal-checker';
import { PeerChecker } from './peer-checker';
import { OwnershipChecker } from './ownership-checker';

interface Stats {
    packagesScanned: number;
    packagesWithIssues: number;
    unusedCount: number;
    missingCount: number;
    wrongTypeCount: number;
    outdatedCount: number;
    mismatchCount: number;
    internalCount: number;
    peerCount: number;
    dynamicCount: number;
    installedPeerCount: number;
    ownershipCount: number;
}

interface CompactIssue {
    package: string;
    type: 'unused' | 'missing' | 'wrongType' | 'outdated' | 'mismatch' | 'internal' | 'peer' | 'dynamic' | 'installed-peer' | 'ownership';
    dependency: string;
    detail?: string;
}

const program = new Command();

program
    .name('monodep')
    .description('A dependency check tool for monorepos')
    .version('1.0.0')
    .argument('[directory]', 'Root directory of the project', '.')
    .option('--compact', 'Output compact log for AI agents')
    .option('--only-extras', 'Only run checks not covered by Knip (wrongType, mismatch, outdated, internal, peer)')
    .option('--no-outdated', 'Skip outdated dependency checks (faster execution)')
    .option('--check-installed-peers', 'Validate peer requirements from installed dependencies in node_modules')
    .option('--ownership-report', 'Show dependency ownership suggestions across workspaces (informational)')
    .action(async (directory, options) => {
        const rootDir = path.resolve(directory);
        const compact = options.compact;
        const onlyExtras = options.onlyExtras;
        const skipOutdated = options.outdated === false;
        const checkInstalledPeersFlag = options.checkInstalledPeers === true;
        const ownershipReportFlag = options.ownershipReport === true;

        if (!compact) {
            const modeLabel = onlyExtras ? ' (extras only)' : '';
            console.log(chalk.bold.blue(`\n📦 monodep - Monorepo Dependency Checker${modeLabel}\n`));
            console.log(chalk.gray(`Analyzing project at ${rootDir}...`));
            if (onlyExtras) {
                console.log(chalk.gray('Running only monodep-specific checks (wrongType, mismatch, outdated)'));
                console.log(chalk.gray('Use full mode for unused/missing dependency detection, or use Knip.\n'));
            }
        }

        const configLoader = new ConfigLoader();
        const config = await configLoader.load(rootDir);
        const dynamicImportPolicy = config.dynamicImportPolicy === 'warn' || config.dynamicImportPolicy === 'strict'
            ? config.dynamicImportPolicy
            : 'off';
        const checkInstalledPeers = checkInstalledPeersFlag || config.checkInstalledPeers === true;
        const ownershipReport = ownershipReportFlag || config.ownershipReport === true;
        const ownershipPolicy = config.ownershipPolicy === 'workspace-explicit' ? 'workspace-explicit' : 'root-shared';

        const monorepo = new MonorepoManager(rootDir);
        const packages = await monorepo.getPackages();

        if (!compact) {
            console.log(chalk.gray(`Found ${packages.length} packages.\n`));
        }

        const analyzer = new Analyzer();
        const versionChecker = new VersionChecker();
        const usedImports = new Map<string, Set<string>>();
        const prodImportsByPackage = new Map<string, Set<string>>();
        const devImportsByPackage = new Map<string, Set<string>>();
        const packagesWithIssues = new Set<string>();

        const stats: Stats = {
            packagesScanned: 0,
            packagesWithIssues: 0,
            unusedCount: 0,
            missingCount: 0,
            wrongTypeCount: 0,
            outdatedCount: 0,
            mismatchCount: 0,
            internalCount: 0,
            peerCount: 0,
            dynamicCount: 0,
            installedPeerCount: 0,
            ownershipCount: 0,
        };

        const compactIssues: CompactIssue[] = [];

        // By default, all checks are enabled. Config can disable them.
        // --no-outdated flag or config.checkOutdated=false will disable outdated checks
        const checkOutdated = !skipOutdated && config.checkOutdated !== false;

        // Pre-fetch all package versions at once for better performance
        if (checkOutdated) {
            const allDependencies = new Set<string>();
            for (const pkg of packages) {
                if (config.skipPackages && config.skipPackages.includes(pkg.name)) {
                    continue;
                }
                const deps = { ...pkg.dependencies, ...pkg.devDependencies };
                for (const [depName, depVersion] of Object.entries(deps)) {
                    if (!depVersion.startsWith('workspace:') && !depVersion.startsWith('file:')) {
                        allDependencies.add(depName);
                    }
                }
            }
            if (allDependencies.size > 0 && !compact) {
                console.log(chalk.gray(`Checking ${allDependencies.size} unique dependencies for updates...\n`));
            }
            await versionChecker.prefetch([...allDependencies]);
        }

        for (const pkg of packages) {
            if (config.skipPackages && config.skipPackages.includes(pkg.name)) {
                continue;
            }

            stats.packagesScanned++;

            const isRoot = pkg.location === rootDir;

            if (!compact) {
                const label = isRoot ? `${pkg.name} ${chalk.dim('(root)')}` : pkg.name;
                console.log(chalk.bold.cyan(`📁 ${label}`));
                console.log(chalk.gray(`   ${pkg.location}`));
            }

            // Find other packages that are nested within this package
            const nestedPackages = packages.filter(
                (other) => other.location !== pkg.location && other.location.startsWith(pkg.location)
            );
            const nestedPackagePatterns = nestedPackages.map((nested) =>
                path.relative(pkg.location, nested.location) + '/**'
            );

            const ignorePatterns = [
                ...nestedPackagePatterns,
                ...(config.ignorePatterns || [])
            ];

            const result = await analyzer.analyze(pkg, ignorePatterns, config.ignoreDependencies);
            const { unused, missing, wrongType, dynamicCandidates, prodImports, devImports } = result;
            const allImports = new Set<string>([...prodImports, ...devImports]);
            usedImports.set(pkg.name, allImports);
            prodImportsByPackage.set(pkg.name, prodImports);
            devImportsByPackage.set(pkg.name, devImports);

            let packageHasIssues = false;

            // Skip unused/missing checks in --only-extras mode (Knip handles these)
            if (!onlyExtras) {
                if (unused.length > 0) {
                    if (!compact) {
                        console.log(chalk.yellow('   ⚠ Unused dependencies:'));
                        unused.forEach((dep) => console.log(chalk.yellow(`     - ${dep}`)));
                    } else {
                        unused.forEach((dep) => compactIssues.push({
                            package: pkg.name,
                            type: 'unused',
                            dependency: dep,
                        }));
                    }
                    stats.unusedCount += unused.length;
                    packageHasIssues = true;
                }

                if (missing.length > 0) {
                    if (!compact) {
                        console.log(chalk.red('   ✗ Missing dependencies:'));
                        missing.forEach((dep) => console.log(chalk.red(`     - ${dep}`)));
                    } else {
                        missing.forEach((dep) => compactIssues.push({
                            package: pkg.name,
                            type: 'missing',
                            dependency: dep,
                        }));
                    }
                    stats.missingCount += missing.length;
                    packageHasIssues = true;
                }
            }

            if (wrongType.length > 0) {
                if (!compact) {
                    console.log(chalk.magenta('   ⚡ Wrong dependency types:'));
                    wrongType.forEach((info) =>
                        console.log(chalk.magenta(`     - ${info.dependency}: Should be in ${chalk.bold(info.expected)} (found in ${info.actual})`))
                    );
                } else {
                    wrongType.forEach((info) => compactIssues.push({
                        package: pkg.name,
                        type: 'wrongType',
                        dependency: info.dependency,
                        detail: `${info.actual} -> ${info.expected}`,
                    }));
                }
                stats.wrongTypeCount += wrongType.length;
                packageHasIssues = true;
            }

            if (dynamicImportPolicy !== 'off' && dynamicCandidates.length > 0) {
                if (!compact) {
                    const label = dynamicImportPolicy === 'strict'
                        ? '   ⚠ Dynamic import candidates (strict):'
                        : '   ℹ Dynamic import candidates:';
                    console.log(chalk.blue(label));
                    dynamicCandidates.forEach((candidate) => {
                        const relFile = path.relative(pkg.location, candidate.file);
                        console.log(chalk.blue(`     - ${relFile}:${candidate.line} (${candidate.expression})`));
                    });
                } else {
                    dynamicCandidates.forEach((candidate) => {
                        const relFile = path.relative(pkg.location, candidate.file);
                        compactIssues.push({
                            package: pkg.name,
                            type: 'dynamic',
                            dependency: candidate.expression,
                            detail: `${relFile}:${candidate.line}`,
                        });
                    });
                }

                stats.dynamicCount += dynamicCandidates.length;
                if (dynamicImportPolicy === 'strict') {
                    packageHasIssues = true;
                }
            }

            if (checkOutdated) {
                const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
                if (Object.keys(allDeps).length > 0) {
                    const outdated = await versionChecker.checkVersions(allDeps);
                    if (outdated.length > 0) {
                        const actuallyOutdated = outdated.filter(info => {
                            const range = semver.validRange(info.current, { loose: true });
                            if (!range) return true;
                            return !semver.satisfies(info.latest, range, { includePrerelease: true, loose: true });
                        });

                        if (actuallyOutdated.length > 0) {
                            if (!compact) {
                                console.log(chalk.yellow('   ⏰ Outdated dependencies:'));
                                actuallyOutdated.forEach(info => {
                                    console.log(chalk.yellow(`     - ${info.package}: ${chalk.dim(info.current)} → ${chalk.bold(info.latest)}`));
                                });
                            } else {
                                actuallyOutdated.forEach(info => compactIssues.push({
                                    package: pkg.name,
                                    type: 'outdated',
                                    dependency: info.package,
                                    detail: `${info.current} -> ${info.latest}`,
                                }));
                            }
                            stats.outdatedCount += actuallyOutdated.length;
                            packageHasIssues = true;
                        }
                    }
                }
            }

            if (!compact) {
                if (!packageHasIssues) {
                    console.log(chalk.green('   ✓ No issues found.'));
                }
                console.log('');
            }

            if (packageHasIssues) {
                packagesWithIssues.add(pkg.name);
            }
        }

        // Check for version mismatches
        const consistencyChecker = new ConsistencyChecker();
        const mismatches = consistencyChecker.check(packages);

        if (mismatches.length > 0) {
            if (!compact) {
                console.log(chalk.bold.red('🔀 Version Mismatches Found:'));
                for (const mismatch of mismatches) {
                    console.log(chalk.red(`   ${mismatch.dependency}:`));
                    for (const v of mismatch.versions) {
                        console.log(chalk.red(`     - ${chalk.bold(v.version)} in ${v.packages.join(', ')}`));
                    }
                }
                console.log('');
            } else {
                for (const mismatch of mismatches) {
                    const versions = mismatch.versions.map(v => `${v.version}(${v.packages.join(',')})`).join(' vs ');
                    compactIssues.push({
                        package: '*',
                        type: 'mismatch',
                        dependency: mismatch.dependency,
                        detail: versions,
                    });
                }
            }
            stats.mismatchCount = mismatches.length;
        }

        // Check for internal package reference issues
        const internalChecker = new InternalChecker();
        const internalIssues = internalChecker.check(packages, usedImports);

        if (internalIssues.length > 0) {
            if (!compact) {
                console.log(chalk.bold.yellow('📦 Internal Package Issues Found:'));
                for (const issue of internalIssues) {
                    console.log(chalk.yellow(`   ${issue.packageName}: ${issue.dependency}`));
                    console.log(chalk.yellow(`     - ${issue.detail}`));
                }
                console.log('');
            } else {
                for (const issue of internalIssues) {
                    compactIssues.push({
                        package: issue.packageName,
                        type: 'internal',
                        dependency: issue.dependency,
                        detail: issue.detail,
                    });
                }
            }
            stats.internalCount = internalIssues.length;
            for (const issue of internalIssues) {
                packagesWithIssues.add(issue.packageName);
            }
        }

        // Check for peer dependency issues
        const peerChecker = new PeerChecker();
        const rootPkg = packages.find(p => p.location === rootDir);
        const peerIssues = peerChecker.check(packages, rootPkg);

        if (peerIssues.length > 0) {
            if (!compact) {
                console.log(chalk.bold.cyan('🔗 Peer Dependency Issues Found:'));
                for (const issue of peerIssues) {
                    console.log(chalk.cyan(`   ${issue.packageName}: ${issue.peerDep}`));
                    console.log(chalk.cyan(`     - ${issue.detail}`));
                }
                console.log('');
            } else {
                for (const issue of peerIssues) {
                    compactIssues.push({
                        package: issue.packageName,
                        type: 'peer',
                        dependency: issue.peerDep,
                        detail: issue.detail,
                    });
                }
            }
            stats.peerCount = peerIssues.length;
            for (const issue of peerIssues) {
                packagesWithIssues.add(issue.packageName);
            }
        }

        if (checkInstalledPeers) {
            const installedPeerIssues = await peerChecker.checkInstalledPeers(packages, rootPkg);

            if (installedPeerIssues.length > 0) {
                if (!compact) {
                    console.log(chalk.bold.cyan('🧩 Installed Peer Issues Found:'));
                    for (const issue of installedPeerIssues) {
                        console.log(chalk.cyan(`   ${issue.packageName}: ${issue.dependency} -> ${issue.peerDep}`));
                        console.log(chalk.cyan(`     - ${issue.detail}`));
                    }
                    console.log('');
                } else {
                    for (const issue of installedPeerIssues) {
                        compactIssues.push({
                            package: issue.packageName,
                            type: 'installed-peer',
                            dependency: `${issue.dependency} -> ${issue.peerDep}`,
                            detail: issue.detail,
                        });
                    }
                }

                stats.installedPeerCount = installedPeerIssues.length;
                for (const issue of installedPeerIssues) {
                    packagesWithIssues.add(issue.packageName);
                }
            }
        }

        if (ownershipReport) {
            const ownershipChecker = new OwnershipChecker();
            const ownershipIssues = ownershipChecker.check(
                packages,
                rootDir,
                prodImportsByPackage,
                devImportsByPackage,
                ownershipPolicy
            );

            if (ownershipIssues.length > 0) {
                if (!compact) {
                    console.log(chalk.bold.blue(`🧭 Ownership Suggestions (${ownershipPolicy}):`));
                    for (const issue of ownershipIssues) {
                        console.log(chalk.blue(`   ${issue.dependency} [${issue.usage}]`));
                        console.log(chalk.blue(`     - ${issue.detail}`));
                    }
                    console.log('');
                } else {
                    for (const issue of ownershipIssues) {
                        compactIssues.push({
                            package: '*',
                            type: 'ownership',
                            dependency: issue.dependency,
                            detail: `${issue.type} ${issue.usage}: ${issue.packages.join(',')}`,
                        });
                    }
                }

                stats.ownershipCount = ownershipIssues.length;
            }
        }

        for (const mismatch of mismatches) {
            for (const v of mismatch.versions) {
                v.packages.forEach((pkgName) => packagesWithIssues.add(pkgName));
            }
        }

        stats.packagesWithIssues = packagesWithIssues.size;

        const dynamicIssueCount = dynamicImportPolicy === 'strict' ? stats.dynamicCount : 0;
        const totalIssues = stats.unusedCount + stats.missingCount + stats.wrongTypeCount + stats.outdatedCount + stats.mismatchCount + stats.internalCount + stats.peerCount + stats.installedPeerCount + dynamicIssueCount;

        if (compact) {
            // Compact output for AI agents
            console.log(`[monodep] scanned=${stats.packagesScanned} issues=${totalIssues}`);
            for (const issue of compactIssues) {
                const detail = issue.detail ? ` (${issue.detail})` : '';
                console.log(`[${issue.type}] ${issue.package}: ${issue.dependency}${detail}`);
            }
        } else {
            // Print summary
            console.log(chalk.bold('─'.repeat(50)));
            console.log(chalk.bold('\n📊 Summary\n'));

            console.log(`   Packages scanned:     ${chalk.bold(stats.packagesScanned)}`);
            console.log(`   Packages with issues: ${stats.packagesWithIssues > 0 ? chalk.bold.red(stats.packagesWithIssues) : chalk.bold.green(stats.packagesWithIssues)}`);
            console.log('');

            if (!onlyExtras) {
                if (stats.unusedCount > 0) {
                    console.log(chalk.yellow(`   ⚠ Unused:      ${stats.unusedCount}`));
                }
                if (stats.missingCount > 0) {
                    console.log(chalk.red(`   ✗ Missing:     ${stats.missingCount}`));
                }
            }
            if (stats.wrongTypeCount > 0) {
                console.log(chalk.magenta(`   ⚡ Wrong type:  ${stats.wrongTypeCount}`));
            }
            if (stats.outdatedCount > 0) {
                console.log(chalk.yellow(`   ⏰ Outdated:    ${stats.outdatedCount}`));
            }
            if (stats.mismatchCount > 0) {
                console.log(chalk.red(`   🔀 Mismatches:  ${stats.mismatchCount}`));
            }
            if (stats.internalCount > 0) {
                console.log(chalk.yellow(`   📦 Internal:    ${stats.internalCount}`));
            }
            if (stats.peerCount > 0) {
                console.log(chalk.cyan(`   🔗 Peer:        ${stats.peerCount}`));
            }
            if (stats.installedPeerCount > 0) {
                console.log(chalk.cyan(`   🧩 Installed:   ${stats.installedPeerCount}`));
            }
            if (stats.dynamicCount > 0) {
                const dynamicLabel = dynamicImportPolicy === 'strict' ? '   ⚠ Dynamic:     ' : '   ℹ Dynamic:     ';
                const dynamicValue = dynamicImportPolicy === 'strict'
                    ? chalk.yellow(stats.dynamicCount)
                    : chalk.gray(`${stats.dynamicCount} (informational)`);
                console.log(`${dynamicLabel}${dynamicValue}`);
            }
            if (stats.ownershipCount > 0) {
                console.log(chalk.gray(`   🧭 Ownership:   ${stats.ownershipCount} (informational)`));
            }

            if (totalIssues === 0) {
                console.log(chalk.green('   No issues found.'));
            }

            console.log('');
            console.log(chalk.bold('─'.repeat(50)));

            if (totalIssues > 0) {
                console.log(chalk.bold.red(`\n❌ Total issues: ${totalIssues}\n`));
            } else {
                console.log(chalk.bold.green('\n✅ All checks passed!\n'));
            }
        }

        if (totalIssues > 0) {
            process.exit(1);
        }
    });

program.parse();
