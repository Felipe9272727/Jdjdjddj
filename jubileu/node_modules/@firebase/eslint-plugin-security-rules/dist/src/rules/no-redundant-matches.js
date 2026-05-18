/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
export default {
    meta: {
        type: 'suggestion',
        docs: {
            description: 'disallow identical match statements in the same scope',
            recommended: true
        },
        messages: {
            redundantMatch: 'Redundant match path \'{{pathText}}\' overlaps with previously declared match.'
        },
        schema: []
    },
    create(context) {
        return {
            'Program'(node) {
                if (!context.filename.endsWith('firestore.rules')) {
                    return;
                }
                const sourceCode = context.sourceCode;
                const services = (sourceCode.parserServices || {});
                if (!services.tree) {
                    return;
                }
                function walk(antlrNode, callback) {
                    if (!antlrNode)
                        return;
                    callback(antlrNode);
                    if (antlrNode.children) {
                        for (const child of antlrNode.children) {
                            walk(child, callback);
                        }
                    }
                }
                const scopeMap = new Map();
                walk(services.tree, (antlrNode) => {
                    if (antlrNode.constructor &&
                        antlrNode.constructor.name === 'MatchRuleDeclarationContext') {
                        const pathDecl = antlrNode.pathDecl ? antlrNode.pathDecl() : null;
                        if (!pathDecl)
                            return;
                        const pathText = pathDecl.getText();
                        // Normalize wildcard names like {database} to just {*} to catch
                        // redundant wildcard paths.
                        const normalizedPath = pathText.replace(/\{[^}=]+(\=\*\*)?\}/g, '{*}');
                        let scope = antlrNode.parentCtx;
                        while (scope && scope.constructor &&
                            !['MatchRuleDeclarationContext', 'ServiceDeclarationContext']
                                .includes(scope.constructor.name)) {
                            scope = scope.parentCtx;
                        }
                        if (!scope)
                            return;
                        let seenMatches = scopeMap.get(scope);
                        if (!seenMatches) {
                            seenMatches = new Set();
                            scopeMap.set(scope, seenMatches);
                        }
                        if (seenMatches.has(normalizedPath)) {
                            const startToken = pathDecl.start;
                            const endToken = pathDecl.stop;
                            context.report({
                                node: node,
                                loc: {
                                    start: { line: startToken.line, column: startToken.column },
                                    end: {
                                        line: endToken.line,
                                        column: endToken.column + pathDecl.getText().length
                                    }
                                },
                                messageId: 'redundantMatch',
                                data: {
                                    pathText
                                }
                            });
                        }
                        else {
                            seenMatches.add(normalizedPath);
                        }
                    }
                });
            }
        };
    }
};
