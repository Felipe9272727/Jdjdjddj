/**
 * @license
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
export default class FirebaseRulesParser extends antlr4.Parser {
    static grammarFileName: string;
    static literalNames: (string | null)[];
    static symbolicNames: (string | null)[];
    static ruleNames: string[];
    constructor(input: any);
    sempred(localctx: any, ruleIndex: any, predIndex: any): boolean;
    expression_sempred(localctx: any, predIndex: any): boolean;
    simpleExpression_sempred(localctx: any, predIndex: any): boolean;
    ruleset(): RulesetContext;
    versionStatement(): VersionStatementContext;
    importStatement(): ImportStatementContext;
    rulesetStatement(): RulesetStatementContext;
    serviceDeclaration(): ServiceDeclarationContext;
    serviceStatement(): ServiceStatementContext;
    functionDeclaration(): FunctionDeclarationContext;
    bindingDeclaration(): BindingDeclarationContext;
    functionSignature(): FunctionSignatureContext;
    paramList(): ParamListContext;
    functionBody(): FunctionBodyContext;
    returnStatement(): ReturnStatementContext;
    matchRuleDeclaration(): MatchRuleDeclarationContext;
    matchStatement(): MatchStatementContext;
    permissionDeclaration(): PermissionDeclarationContext;
    permissionBody(): PermissionBodyContext;
    expression(_p: any): ExpressionContext;
    simpleExpression(_p: any): SimpleExpressionContext;
    pathExpression(): PathExpressionContext;
    pathExpressionSegment(): PathExpressionSegmentContext;
    listIndex(): ListIndexContext;
    mapExpression(): MapExpressionContext;
    mapEntries(): MapEntriesContext;
    mapEntry(): MapEntryContext;
    expressionList(): ExpressionListContext;
    literal(): LiteralContext;
    keywordId(): KeywordIdContext;
    keyword(): KeywordContext;
    pathDecl(): PathDeclContext;
    pathDeclSegment(): PathDeclSegmentContext;
    globCapture(): GlobCaptureContext;
    capture(): CaptureContext;
    id(): IdContext;
    serviceId(): ServiceIdContext;
    isOperatorId(): IsOperatorIdContext;
    operationId(): OperationIdContext;
    packageId(): PackageIdContext;
    memberId(): MemberIdContext;
    as(): AsContext;
    localVariableId(): LocalVariableIdContext;
    localFunctionId(): LocalFunctionIdContext;
}
declare class RulesetContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    EOF(): any;
    versionStatement(): any;
    importStatement: (i: any) => any;
    rulesetStatement: (i: any) => any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class VersionStatementContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    RULES_VERSION(): any;
    ASSIGNMENT(): any;
    STRING(): any;
    SEMI(): any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class ImportStatementContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    IMPORT(): any;
    STRING(): any;
    SEMI(): any;
    as(): any;
    id(): any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class RulesetStatementContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    functionDeclaration(): any;
    serviceDeclaration(): any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class ServiceDeclarationContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    SERVICE(): any;
    serviceId(): any;
    LBRACE(): any;
    RBRACE(): any;
    serviceStatement: (i: any) => any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class ServiceStatementContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    functionDeclaration(): any;
    matchRuleDeclaration(): any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class FunctionDeclarationContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    FUNCTION(): any;
    localFunctionId(): any;
    functionSignature(): any;
    LBRACE(): any;
    functionBody(): any;
    RBRACE(): any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class BindingDeclarationContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    LET(): any;
    localVariableId(): any;
    ASSIGNMENT(): any;
    expression(): any;
    SEMI(): any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class FunctionSignatureContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    LPAREN(): any;
    RPAREN: (i: any) => any;
    paramList(): any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class ParamListContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    localVariableId: (i: any) => any;
    COMMA: (i: any) => any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class FunctionBodyContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    returnStatement(): any;
    bindingDeclaration: (i: any) => any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class ReturnStatementContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    RETURN(): any;
    expression(): any;
    SEMI(): any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class MatchRuleDeclarationContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    MATCH(): any;
    pathDecl(): any;
    LBRACE(): any;
    RBRACE(): any;
    matchStatement: (i: any) => any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class MatchStatementContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    functionDeclaration(): any;
    permissionDeclaration(): any;
    matchRuleDeclaration(): any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class PermissionDeclarationContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    ALLOW(): any;
    operationId(): any;
    permissionBody(): any;
    SEMI(): any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class PermissionBodyContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    COLON(): any;
    IF(): any;
    expression(): any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class ExpressionContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    copyFrom(ctx: any): void;
}
declare class SimpleExpressionContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    copyFrom(ctx: any): void;
}
declare class PathExpressionContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    pathExpressionSegment: (i: any) => any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class PathExpressionSegmentContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    pathDeclSegment(): any;
    SLASH(): any;
    DOLLAR(): any;
    LPAREN(): any;
    expression(): any;
    RPAREN(): any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class ListIndexContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    copyFrom(ctx: any): void;
}
declare class MapExpressionContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    LBRACE(): any;
    RBRACE(): any;
    mapEntries(): any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class MapEntriesContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    mapEntry: (i: any) => any;
    COMMA: (i: any) => any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class MapEntryContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    expression: (i: any) => any;
    COLON(): any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class ExpressionListContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    expression: (i: any) => any;
    COMMA: (i: any) => any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class LiteralContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    NUM_FLOAT(): any;
    NUM_INT(): any;
    STRING(): any;
    BYTES(): any;
    TRUE(): any;
    FALSE(): any;
    NULL(): any;
    UNPAIRED_SINGLE_QUOTE(): any;
    UNPAIRED_DOUBLE_QUOTE(): any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class KeywordIdContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    IDENTIFIER(): any;
    keyword(): any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class KeywordContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    ALLOW(): any;
    FALSE(): any;
    FUNCTION(): any;
    IF(): any;
    IMPORT(): any;
    IS(): any;
    NULL(): any;
    RETURN(): any;
    SERVICE(): any;
    TRUE(): any;
    ARGUMENTS(): any;
    BREAK(): any;
    CASE(): any;
    CONTINUE(): any;
    DEFAULT(): any;
    DENY(): any;
    DO(): any;
    EACH(): any;
    ELSE(): any;
    EXTENDS(): any;
    FOR(): any;
    GOTO(): any;
    IN(): any;
    LET(): any;
    MATCH(): any;
    NOT_TEXT(): any;
    PACKAGE(): any;
    SWITCH(): any;
    THEN(): any;
    VAR(): any;
    WHILE(): any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class PathDeclContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    pathDeclSegment: (i: any) => any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class PathDeclSegmentContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    copyFrom(ctx: any): void;
}
declare class GlobCaptureContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    LBRACE(): any;
    localVariableId(): any;
    ASSIGNMENT(): any;
    GLOB(): any;
    RBRACE: (i: any) => any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class CaptureContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    LBRACE(): any;
    localVariableId(): any;
    RBRACE: (i: any) => any;
    ASSIGNMENT(): any;
    STAR(): any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class IdContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    IDENTIFIER(): any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class ServiceIdContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    BAD_KEYWORD(): any;
    SERVICE_IDENTIFIER(): any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class IsOperatorIdContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    id(): any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class OperationIdContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    id: (i: any) => any;
    COMMA: (i: any) => any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class PackageIdContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    id(): any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class MemberIdContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    id(): any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class AsContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    id(): any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class LocalVariableIdContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    id(): any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
declare class LocalFunctionIdContext extends antlr4.ParserRuleContext {
    constructor(parser: any, parent: any, invokingState: any);
    id(): any;
    enterRule(listener: any): void;
    exitRule(listener: any): void;
}
export {};
