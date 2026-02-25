import ts from 'typescript';
import fs from 'fs';

export interface ParseResult {
    valueImports: string[];
    typeOnlyImports: string[];
    dynamicCandidates: {
        expression: string;
        line: number;
    }[];
}

export class Parser {
    parse(filePath: string): ParseResult {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const source = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

            const valueImports = new Set<string>();
            const typeOnlyImports = new Set<string>();
            const dynamicCandidates: ParseResult['dynamicCandidates'] = [];

            const recordImport = (moduleName: string, isTypeOnly: boolean) => {
                if (!moduleName) return;
                if (isTypeOnly) {
                    typeOnlyImports.add(moduleName);
                } else {
                    valueImports.add(moduleName);
                }
            };

            const isStringLiteral = (node: ts.Node): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral =>
                ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);

            const visit = (node: ts.Node) => {
                // import ... from 'foo'
                if (ts.isImportDeclaration(node) && isStringLiteral(node.moduleSpecifier)) {
                    const moduleName = node.moduleSpecifier.text;

                    const clause = node.importClause;

                    // If the entire import clause is marked as type-only, treat as type-only
                    if (clause?.isTypeOnly) {
                        recordImport(moduleName, true);
                        return;
                    }

                    // Mixed named imports can mark specific specifiers as type-only
                    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
                        const elements = clause.namedBindings.elements;
                        const allTypeOnly = elements.length > 0 && elements.every((el) => el.isTypeOnly);

                        // Default import or any value import makes the whole import runtime-relevant
                        if (clause.name || !allTypeOnly) {
                            recordImport(moduleName, false);
                        } else {
                            recordImport(moduleName, true);
                        }
                        return;
                    }

                    // Namespace or default import → runtime
                    recordImport(moduleName, false);
                    return;
                }

                // export * from 'foo' / export { x } from 'foo'
                if (ts.isExportDeclaration(node) && node.moduleSpecifier && isStringLiteral(node.moduleSpecifier)) {
                    recordImport(node.moduleSpecifier.text, false);
                    return;
                }

                // Dynamic import('foo')
                if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
                    const arg = node.arguments[0];
                    if (arg && isStringLiteral(arg)) {
                        recordImport(arg.text, false);
                    } else if (arg) {
                        const line = source.getLineAndCharacterOfPosition(arg.getStart(source)).line + 1;
                        dynamicCandidates.push({
                            expression: arg.getText(source),
                            line,
                        });
                    }
                    return;
                }

                // require('foo')
                if (ts.isCallExpression(node)) {
                    if (
                        ts.isIdentifier(node.expression) &&
                        node.expression.text === 'require' &&
                        node.arguments.length === 1
                    ) {
                        const arg = node.arguments[0];
                        if (isStringLiteral(arg)) {
                            recordImport(arg.text, false);
                        } else {
                            const line = source.getLineAndCharacterOfPosition(arg.getStart(source)).line + 1;
                            dynamicCandidates.push({
                                expression: arg.getText(source),
                                line,
                            });
                        }
                    }
                }

                ts.forEachChild(node, visit);
            };

            visit(source);

            return {
                valueImports: [...valueImports],
                typeOnlyImports: [...typeOnlyImports],
                dynamicCandidates,
            };
        } catch (e) {
            console.warn(`Failed to parse ${filePath}:`, e);
            return { valueImports: [], typeOnlyImports: [], dynamicCandidates: [] };
        }
    }
}
