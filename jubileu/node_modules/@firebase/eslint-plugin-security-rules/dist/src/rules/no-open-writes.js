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
            description: 'disallow \'if true\' for write permissions which renders the database writable to the internet.',
            recommended: true
        },
        messages: {
            openWrite: 'Insecure open write rule detected. Error on open writes in production.'
        },
        schema: []
    },
    create(context) {
        return {
            'Program'(node) {
                if (!context.filename.endsWith('firestore.rules')) {
                    return;
                }
                const sourceCode = context.sourceCode || context.getSourceCode();
                const services = (context.parserServices || sourceCode.parserServices || {});
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
                        // Matches allow ...write...: if true;
                        if (text.match(/^allow.*write.*:iftrue;?$/i)) {
                            const startToken = antlrNode.start;
                            const endToken = antlrNode.stop;
                            context.report({
                                node: node,
                                loc: {
                                    start: { line: startToken.line, column: startToken.column },
                                    end: { line: endToken.line, column: endToken.column + 1 }
                                },
                                messageId: 'openWrite'
                            });
                        }
                    }
                });
            }
        };
    }
};
