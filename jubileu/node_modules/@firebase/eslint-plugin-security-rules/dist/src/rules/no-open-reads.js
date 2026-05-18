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
        type: 'problem',
        docs: {
            description: 'disallow \'if true\' for read permissions which renders the database readable to the internet.',
            recommended: true
        },
        messages: {
            openRead: 'Insecure open read rule detected. Warn on open reads in production.'
        },
        schema: []
    },
    create(context) {
        return {
            'Program'(node) {
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
                walk(services.tree, (antlrNode) => {
                    if (antlrNode.constructor &&
                        antlrNode.constructor.name === 'PermissionDeclarationContext') {
                        const text = antlrNode.getText();
                        // Matches allow ...read...: if true;
                        if (text.match(/^allow.*read.*:iftrue;?$/i)) {
                            const startToken = antlrNode.start;
                            const endToken = antlrNode.stop;
                            context.report({
                                node: node,
                                loc: {
                                    start: { line: startToken.line, column: startToken.column },
                                    end: { line: endToken.line, column: endToken.column + 1 }
                                },
                                messageId: 'openRead'
                            });
                        }
                    }
                });
            }
        };
    }
};
