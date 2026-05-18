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
export default class FirebaseRulesLexer extends antlr4.Lexer {
    static grammarFileName: string;
    static channelNames: string[];
    static modeNames: string[];
    static literalNames: (string | null)[];
    static symbolicNames: (string | null)[];
    static ruleNames: string[];
    detectUnknownTokens: boolean;
    constructor(input: antlr4.CharStream);
    sempred(localctx: any, ruleIndex: any, predIndex: any): boolean;
    UNKNOWN_sempred(localctx: any, predIndex: any): boolean;
    static readonly EOF: number;
    static readonly AND = 1;
    static readonly ASSIGNMENT = 2;
    static readonly AT = 3;
    static readonly COLON = 4;
    static readonly COMMA = 5;
    static readonly DECREMENT = 6;
    static readonly DOLLAR = 7;
    static readonly DOT = 8;
    static readonly EQ = 9;
    static readonly GT = 10;
    static readonly GTE = 11;
    static readonly INCREMENT = 12;
    static readonly LBRACE = 13;
    static readonly LBRACKET = 14;
    static readonly LPAREN = 15;
    static readonly LT = 16;
    static readonly LTE = 17;
    static readonly MINUS = 18;
    static readonly MOD = 19;
    static readonly NEQ = 20;
    static readonly NOT = 21;
    static readonly OR = 22;
    static readonly PLUS = 23;
    static readonly RBRACE = 24;
    static readonly RBRACKET = 25;
    static readonly RPAREN = 26;
    static readonly SEMI = 27;
    static readonly SLASH = 28;
    static readonly STAR = 29;
    static readonly GLOB = 30;
    static readonly QUESTION = 31;
    static readonly ALLOW = 32;
    static readonly FALSE = 33;
    static readonly FUNCTION = 34;
    static readonly IF = 35;
    static readonly IMPORT = 36;
    static readonly IN = 37;
    static readonly IS = 38;
    static readonly LET = 39;
    static readonly NULL = 40;
    static readonly RETURN = 41;
    static readonly SERVICE = 42;
    static readonly MATCH = 43;
    static readonly RULES_VERSION = 44;
    static readonly TRUE = 45;
    static readonly ARGUMENTS = 46;
    static readonly BREAK = 47;
    static readonly CASE = 48;
    static readonly CONTINUE = 49;
    static readonly DEFAULT = 50;
    static readonly DENY = 51;
    static readonly DO = 52;
    static readonly EACH = 53;
    static readonly ELSE = 54;
    static readonly EXTENDS = 55;
    static readonly FOR = 56;
    static readonly GOTO = 57;
    static readonly NOT_TEXT = 58;
    static readonly PACKAGE = 59;
    static readonly SWITCH = 60;
    static readonly THEN = 61;
    static readonly VAR = 62;
    static readonly WHILE = 63;
    static readonly PATH_SEGMENT = 64;
    static readonly IDENTIFIER = 65;
    static readonly NUM_INT = 66;
    static readonly NUM_FLOAT = 67;
    static readonly UNPAIRED_DOUBLE_QUOTE = 68;
    static readonly UNPAIRED_SINGLE_QUOTE = 69;
    static readonly STRING = 70;
    static readonly BYTES = 71;
    static readonly LINE_COMMENT = 72;
    static readonly BLOCK_COMMENT = 73;
    static readonly WHITE_SPACE = 74;
    static readonly UNKNOWN = 75;
    static readonly BAD_KEYWORD = 76;
    static readonly SERVICE_IDENTIFIER = 77;
    static readonly HIDE_SPACE = 78;
    static readonly DNS_NAME = 1;
}
