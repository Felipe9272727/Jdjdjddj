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
export default class FirebaseRulesParserListener extends antlr4.tree.ParseTreeListener {
    enterRuleset(ctx: any): void;
    exitRuleset(ctx: any): void;
    enterVersionStatement(ctx: any): void;
    exitVersionStatement(ctx: any): void;
    enterImportStatement(ctx: any): void;
    exitImportStatement(ctx: any): void;
    enterRulesetStatement(ctx: any): void;
    exitRulesetStatement(ctx: any): void;
    enterServiceDeclaration(ctx: any): void;
    exitServiceDeclaration(ctx: any): void;
    enterServiceStatement(ctx: any): void;
    exitServiceStatement(ctx: any): void;
    enterFunctionDeclaration(ctx: any): void;
    exitFunctionDeclaration(ctx: any): void;
    enterBindingDeclaration(ctx: any): void;
    exitBindingDeclaration(ctx: any): void;
    enterFunctionSignature(ctx: any): void;
    exitFunctionSignature(ctx: any): void;
    enterParamList(ctx: any): void;
    exitParamList(ctx: any): void;
    enterFunctionBody(ctx: any): void;
    exitFunctionBody(ctx: any): void;
    enterReturnStatement(ctx: any): void;
    exitReturnStatement(ctx: any): void;
    enterMatchRuleDeclaration(ctx: any): void;
    exitMatchRuleDeclaration(ctx: any): void;
    enterMatchStatement(ctx: any): void;
    exitMatchStatement(ctx: any): void;
    enterPermissionDeclaration(ctx: any): void;
    exitPermissionDeclaration(ctx: any): void;
    enterPermissionBody(ctx: any): void;
    exitPermissionBody(ctx: any): void;
    enterAdditiveExpression(ctx: any): void;
    exitAdditiveExpression(ctx: any): void;
    enterRelationalExpression(ctx: any): void;
    exitRelationalExpression(ctx: any): void;
    enterTernaryExpression(ctx: any): void;
    exitTernaryExpression(ctx: any): void;
    enterLogicalAndExpression(ctx: any): void;
    exitLogicalAndExpression(ctx: any): void;
    enterPrimaryExpression(ctx: any): void;
    exitPrimaryExpression(ctx: any): void;
    enterLogicalOrExpression(ctx: any): void;
    exitLogicalOrExpression(ctx: any): void;
    enterExprIsTypeIdExpression(ctx: any): void;
    exitExprIsTypeIdExpression(ctx: any): void;
    enterNotExpression(ctx: any): void;
    exitNotExpression(ctx: any): void;
    enterUnaryAdditiveExpression(ctx: any): void;
    exitUnaryAdditiveExpression(ctx: any): void;
    enterUnsupportedAdditivePostfix(ctx: any): void;
    exitUnsupportedAdditivePostfix(ctx: any): void;
    enterExprInExpression(ctx: any): void;
    exitExprInExpression(ctx: any): void;
    enterUnsupportedAdditivePrefix(ctx: any): void;
    exitUnsupportedAdditivePrefix(ctx: any): void;
    enterEqualityExpression(ctx: any): void;
    exitEqualityExpression(ctx: any): void;
    enterMultiplicativeExpression(ctx: any): void;
    exitMultiplicativeExpression(ctx: any): void;
    enterMemberLookupSimpleExpression(ctx: any): void;
    exitMemberLookupSimpleExpression(ctx: any): void;
    enterIdMemberFunctionCallSimpleExpression(ctx: any): void;
    exitIdMemberFunctionCallSimpleExpression(ctx: any): void;
    enterLiteralExpression(ctx: any): void;
    exitLiteralExpression(ctx: any): void;
    enterListLookupSimpleExpression(ctx: any): void;
    exitListLookupSimpleExpression(ctx: any): void;
    enterMapSimpleExpression(ctx: any): void;
    exitMapSimpleExpression(ctx: any): void;
    enterFunctionCallSimpleExpression(ctx: any): void;
    exitFunctionCallSimpleExpression(ctx: any): void;
    enterMemberFunctionCallSimpleExpression(ctx: any): void;
    exitMemberFunctionCallSimpleExpression(ctx: any): void;
    enterListSimpleExpression(ctx: any): void;
    exitListSimpleExpression(ctx: any): void;
    enterParenSimpleExpression(ctx: any): void;
    exitParenSimpleExpression(ctx: any): void;
    enterPathSimpleExpression(ctx: any): void;
    exitPathSimpleExpression(ctx: any): void;
    enterVariableSimpleExpression(ctx: any): void;
    exitVariableSimpleExpression(ctx: any): void;
    enterPathExpression(ctx: any): void;
    exitPathExpression(ctx: any): void;
    enterPathExpressionSegment(ctx: any): void;
    exitPathExpressionSegment(ctx: any): void;
    enterRangeLookup(ctx: any): void;
    exitRangeLookup(ctx: any): void;
    enterIndexLookup(ctx: any): void;
    exitIndexLookup(ctx: any): void;
    enterMapExpression(ctx: any): void;
    exitMapExpression(ctx: any): void;
    enterMapEntries(ctx: any): void;
    exitMapEntries(ctx: any): void;
    enterMapEntry(ctx: any): void;
    exitMapEntry(ctx: any): void;
    enterExpressionList(ctx: any): void;
    exitExpressionList(ctx: any): void;
    enterLiteral(ctx: any): void;
    exitLiteral(ctx: any): void;
    enterKeywordId(ctx: any): void;
    exitKeywordId(ctx: any): void;
    enterKeyword(ctx: any): void;
    exitKeyword(ctx: any): void;
    enterPathDecl(ctx: any): void;
    exitPathDecl(ctx: any): void;
    enterSimpleSegmemnt(ctx: any): void;
    exitSimpleSegmemnt(ctx: any): void;
    enterCaptureSegment(ctx: any): void;
    exitCaptureSegment(ctx: any): void;
    enterGlobSegment(ctx: any): void;
    exitGlobSegment(ctx: any): void;
    enterEmptySegment(ctx: any): void;
    exitEmptySegment(ctx: any): void;
    enterGlobCapture(ctx: any): void;
    exitGlobCapture(ctx: any): void;
    enterCapture(ctx: any): void;
    exitCapture(ctx: any): void;
    enterId(ctx: any): void;
    exitId(ctx: any): void;
    enterServiceId(ctx: any): void;
    exitServiceId(ctx: any): void;
    enterIsOperatorId(ctx: any): void;
    exitIsOperatorId(ctx: any): void;
    enterOperationId(ctx: any): void;
    exitOperationId(ctx: any): void;
    enterPackageId(ctx: any): void;
    exitPackageId(ctx: any): void;
    enterMemberId(ctx: any): void;
    exitMemberId(ctx: any): void;
    enterAs(ctx: any): void;
    exitAs(ctx: any): void;
    enterLocalVariableId(ctx: any): void;
    exitLocalVariableId(ctx: any): void;
    enterLocalFunctionId(ctx: any): void;
    exitLocalFunctionId(ctx: any): void;
}
