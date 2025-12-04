#!/usr/bin/env node
import { Command } from 'commander';
import path from 'path';
import chalk from 'chalk';
import { MonorepoManager } from './monorepo';
import { Analyzer } from './analyzer';
import { VersionChecker } from './version-checker';
import { ConfigLoader } from './config';
import { ConsistencyChecker } from './consistency';

interface Stats {
    packagesScanned: number;
    packagesWithIssues: number;
    unusedCount: number;
    missingCount: number;
    wrongTypeCount: number;
    outdatedCount: number;
    mismatchCount: number;
}

interface CompactIssue {
    package: string;
    type: 'unused' | 'missing' | 'wrongType' | 'outdated' | 'mismatch';
    dependency: string;
    detail?: string;
}

const program = new Command();

program
    .name('mdepcheck')
    .description('A dependency check tool for monorepos')
    .version('1.0.0')
    .argument('[directory]', 'Root directory of the project', '.')
    .option('--compact', 'Output compact log for AI agents')
    .action(async (directory, options) => {
        const rootDir = path.resolve(directory);
        const compact = options.compact;

        if (!compact) {
            console.log(chalk.bold.blue('\n📦 mdepcheck - Monorepo Dependency Checker\n'));
            console.log(chalk.gray(`Analyzing project at ${rootDir}...`));
        }

        const configLoader = new ConfigLoader();
        const config = await configLoader.load(rootDir);

        const monorepo = new MonorepoManager(rootDir);
        const packages = await monorepo.getPackages();

        if (!compact) {
            console.log(chalk.gray(`Found ${packages.length} packages.\n`));
        }

        const analyzer = new Analyzer();
        const versionChecker = new VersionChecker();

        const stats: Stats = {
            packagesScanned: 0,
            packagesWithIssues: 0,
            unusedCount: 0,
            missingCount: 0,
            wrongTypeCount: 0,
            outdatedCount: 0,
            mismatchCount: 0,
        };

        const compactIssues: CompactIssue[] = [];

        // By default, all checks are enabled. Config can disable them.
        const checkOutdated = config.checkOutdated !== false;

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

            let packageHasIssues = false;

            if (result.unused.length > 0) {
                if (!compact) {
                    console.log(chalk.yellow('   ⚠ Unused dependencies:'));
                    result.unused.forEach((dep) => console.log(chalk.yellow(`     - ${dep}`)));
                } else {
                    result.unused.forEach((dep) => compactIssues.push({
                        package: pkg.name,
                        type: 'unused',
                        dependency: dep,
                    }));
                }
                stats.unusedCount += result.unused.length;
                packageHasIssues = true;
            }

            if (result.missing.length > 0) {
                if (!compact) {
                    console.log(chalk.red('   ✗ Missing dependencies:'));
                    result.missing.forEach((dep) => console.log(chalk.red(`     - ${dep}`)));
                } else {
                    result.missing.forEach((dep) => compactIssues.push({
                        package: pkg.name,
                        type: 'missing',
                        dependency: dep,
                    }));
                }
                stats.missingCount += result.missing.length;
                packageHasIssues = true;
            }

            if (result.wrongType.length > 0) {
                if (!compact) {
                    console.log(chalk.magenta('   ⚡ Wrong dependency types:'));
                    result.wrongType.forEach((info) =>
                        console.log(chalk.magenta(`     - ${info.dependency}: Should be in ${chalk.bold(info.expected)} (found in ${info.actual})`))
                    );
                } else {
                    result.wrongType.forEach((info) => compactIssues.push({
                        package: pkg.name,
                        type: 'wrongType',
                        dependency: info.dependency,
                        detail: `${info.actual} -> ${info.expected}`,
                    }));
                }
                stats.wrongTypeCount += result.wrongType.length;
                packageHasIssues = true;
            }

            if (checkOutdated) {
                const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
                if (Object.keys(allDeps).length > 0) {
                    const outdated = await versionChecker.checkVersions(allDeps);
                    if (outdated.length > 0) {
                        const actuallyOutdated = outdated.filter(info => {
                            return !info.current.includes(info.latest);
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
                stats.packagesWithIssues++;
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

        const totalIssues = stats.unusedCount + stats.missingCount + stats.wrongTypeCount + stats.outdatedCount + stats.mismatchCount;

        if (compact) {
            // Compact output for AI agents
            console.log(`[mdepcheck] scanned=${stats.packagesScanned} issues=${totalIssues}`);
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

            if (stats.unusedCount > 0) {
                console.log(chalk.yellow(`   ⚠ Unused:      ${stats.unusedCount}`));
            }
            if (stats.missingCount > 0) {
                console.log(chalk.red(`   ✗ Missing:     ${stats.missingCount}`));
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
