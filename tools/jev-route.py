#!/usr/bin/env python3
"""Typed tool recommendations; never executes the selected action or persists the key."""
import json
import os
import sys
import urllib.error
import urllib.request


def main():
    key = os.environ.get('TYPESAFE_API_KEY')
    if not key:
        raise ValueError('Set TYPESAFE_API_KEY in the process environment.')
    raw = sys.stdin.read(16385)
    if len(raw) > 16384:
        raise ValueError('Use a short state summary and only relevant tool descriptions (max 16 KiB).')
    request = json.loads(raw)
    questions = request.get('questions', {})
    if not questions or len(questions) > 8:
        raise ValueError('Supply 1–8 named questions sharing the same state.')
    for question in questions.values():
        if question.get('type') != 'choice' or 'none' not in question.get('criteria', {}):
            raise ValueError('Routing questions must be Choice with a none option.')
    body = {'model': 'jev-latest', 'state': request['state'], 'questions': questions}
    req = urllib.request.Request('https://api.typesafe.ai/v1/systemone',
        data=json.dumps(body).encode(),
        headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=20) as response:
        result = json.load(response)
    for name, question in questions.items():
        answer = result.get('answers', {}).get(name, {})
        if answer.get('type') != 'choice' or answer.get('choice') not in question['criteria']:
            raise ValueError('Provider returned an invalid routing choice.')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except urllib.error.HTTPError as error:
        print(json.dumps({'error': 'http', 'status': error.code}), file=sys.stderr)
        sys.exit(1)
    except (ValueError, KeyError, urllib.error.URLError, TimeoutError) as error:
        print(json.dumps({'error': type(error).__name__}), file=sys.stderr)
        sys.exit(1)
