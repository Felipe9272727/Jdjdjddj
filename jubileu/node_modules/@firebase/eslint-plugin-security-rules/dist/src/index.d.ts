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
import * as parser from './parser.js';
export declare const rules: {
    'no-open-reads': import("@typescript-eslint/utils/ts-eslint").RuleModule<"openRead", [], unknown, import("@typescript-eslint/utils/ts-eslint").RuleListener>;
    'no-open-writes': import("@typescript-eslint/utils/ts-eslint").RuleModule<"openWrite", [], unknown, import("@typescript-eslint/utils/ts-eslint").RuleListener>;
    'no-redundant-matches': import("@typescript-eslint/utils/ts-eslint").RuleModule<"redundantMatch", [], unknown, import("@typescript-eslint/utils/ts-eslint").RuleListener>;
};
export declare const flatRecommended: {
    files: string[];
    plugins: {
        'firebase-rules': {
            meta: {
                name: string;
                version: string;
            };
            rules: {
                'no-open-reads': import("@typescript-eslint/utils/ts-eslint").RuleModule<"openRead", [], unknown, import("@typescript-eslint/utils/ts-eslint").RuleListener>;
                'no-open-writes': import("@typescript-eslint/utils/ts-eslint").RuleModule<"openWrite", [], unknown, import("@typescript-eslint/utils/ts-eslint").RuleListener>;
                'no-redundant-matches': import("@typescript-eslint/utils/ts-eslint").RuleModule<"redundantMatch", [], unknown, import("@typescript-eslint/utils/ts-eslint").RuleListener>;
            };
        };
    };
    languageOptions: {
        parser: typeof parser;
    };
    rules: {
        'firebase-rules/no-open-reads': string;
        'firebase-rules/no-open-writes': string;
        'firebase-rules/no-redundant-matches': string;
    };
};
declare const _default: {
    meta: {
        name: string;
        version: string;
    };
    rules: {
        'no-open-reads': import("@typescript-eslint/utils/ts-eslint").RuleModule<"openRead", [], unknown, import("@typescript-eslint/utils/ts-eslint").RuleListener>;
        'no-open-writes': import("@typescript-eslint/utils/ts-eslint").RuleModule<"openWrite", [], unknown, import("@typescript-eslint/utils/ts-eslint").RuleListener>;
        'no-redundant-matches': import("@typescript-eslint/utils/ts-eslint").RuleModule<"redundantMatch", [], unknown, import("@typescript-eslint/utils/ts-eslint").RuleListener>;
    };
    configs: {
        'flat/recommended': {
            files: string[];
            plugins: {
                'firebase-rules': {
                    meta: {
                        name: string;
                        version: string;
                    };
                    rules: {
                        'no-open-reads': import("@typescript-eslint/utils/ts-eslint").RuleModule<"openRead", [], unknown, import("@typescript-eslint/utils/ts-eslint").RuleListener>;
                        'no-open-writes': import("@typescript-eslint/utils/ts-eslint").RuleModule<"openWrite", [], unknown, import("@typescript-eslint/utils/ts-eslint").RuleListener>;
                        'no-redundant-matches': import("@typescript-eslint/utils/ts-eslint").RuleModule<"redundantMatch", [], unknown, import("@typescript-eslint/utils/ts-eslint").RuleListener>;
                    };
                };
            };
            languageOptions: {
                parser: typeof parser;
            };
            rules: {
                'firebase-rules/no-open-reads': string;
                'firebase-rules/no-open-writes': string;
                'firebase-rules/no-redundant-matches': string;
            };
        };
        recommended: {
            plugins: string[];
            rules: {
                'firebase-rules/no-open-reads': string;
                'firebase-rules/no-open-writes': string;
                'firebase-rules/no-redundant-matches': string;
            };
        };
    };
};
export default _default;
