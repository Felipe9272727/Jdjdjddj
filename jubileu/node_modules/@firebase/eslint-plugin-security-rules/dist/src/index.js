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
import noOpenReads from './rules/no-open-reads.js';
import noOpenWrites from './rules/no-open-writes.js';
import noRedundantMatches from './rules/no-redundant-matches.js';
export const rules = {
    'no-open-reads': noOpenReads,
    'no-open-writes': noOpenWrites,
    'no-redundant-matches': noRedundantMatches
};
const plugin = {
    meta: {
        name: 'eslint-plugin-firebase-rules',
        version: '1.0.0',
    },
    rules,
};
export const flatRecommended = {
    files: ['**/*.rules'],
    plugins: { 'firebase-rules': plugin },
    languageOptions: {
        parser
    },
    rules: {
        'firebase-rules/no-open-reads': 'warn',
        'firebase-rules/no-open-writes': 'error',
        'firebase-rules/no-redundant-matches': 'error'
    }
};
const legacyRecommended = {
    plugins: ['firebase-rules'], // Old string array style
    rules: {
        'firebase-rules/no-open-reads': 'warn',
        'firebase-rules/no-open-writes': 'error',
        'firebase-rules/no-redundant-matches': 'error'
    }
};
const configs = {
    'flat/recommended': flatRecommended,
    'recommended': legacyRecommended
};
export default {
    configs,
    ...plugin
};
