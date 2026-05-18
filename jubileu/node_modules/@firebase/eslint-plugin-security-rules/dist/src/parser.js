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
import antlr4 from 'antlr4';
// @ts-ignore
import FirebaseRulesLexer from '../grammar/FirebaseRulesLexer.js';
// @ts-ignore
import FirebaseRulesParser from '../grammar/FirebaseRulesParser.js';
const errorNamespace = antlr4;
const BaseErrorListener = errorNamespace.error.ErrorListener;
class ErrorListener extends BaseErrorListener {
    errors;
    constructor() {
        super();
        this.errors = [];
    }
    syntaxError(recognizer, offendingSymbol, line, column, msg, e) {
        const err = new SyntaxError(msg);
        err.lineNumber = line;
        err.column = column + 1;
        err.index = offendingSymbol ? offendingSymbol.start : 0;
        this.errors.push(err);
    }
}
export function parseForESLint(code, options) {
    const chars = new antlr4.InputStream(code);
    const lexer = new FirebaseRulesLexer(chars);
    const tokens = new antlr4.CommonTokenStream(lexer);
    const parser = new FirebaseRulesParser(tokens);
    parser.buildParseTrees = true;
    const errorListener = new ErrorListener();
    lexer.removeErrorListeners();
    lexer.addErrorListener(errorListener);
    parser.removeErrorListeners();
    parser.addErrorListener(errorListener);
    // Parse the entire file ruleset.
    const tree = parser.ruleset();
    if (errorListener.errors.length > 0) {
        throw errorListener.errors[0];
    }
    // Validate rules_version
    const versionStmt = tree.versionStatement();
    if (versionStmt) {
        const stringToken = versionStmt.STRING();
        if (stringToken) {
            const versionText = stringToken.getText();
            const version = versionText.replace(/['"]/g, '');
            if (version !== '1' && version !== '2') {
                const token = stringToken.symbol;
                const err = new SyntaxError(`Only rules_version '1' and '2' are allowed, but got '${version}'`);
                err.lineNumber = token.line;
                err.column = token.column + 1;
                err.index = token.start;
                throw err;
            }
        }
    }
    // Build a dummy AST with range for ESLint compatibility.
    const ast = {
        type: 'Program',
        body: [],
        tokens: [],
        comments: [],
        loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        range: [0, code.length]
    };
    return {
        ast: ast,
        services: { tree: tree, code: code, parser: parser },
        visitorKeys: { Program: [] }
    };
}
