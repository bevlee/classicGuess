#!/usr/bin/env python3
"""Prepare the app's namespace-local DB Secret without printing credentials.
Checks by default; creates/updates resources only with --apply.
"""
import argparse
import base64
import json
import secrets
import subprocess
from urllib.parse import quote

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-namespace', default='db')
parser.add_argument('--source-secret', default='pg-auth')
parser.add_argument('--password-key', default='POSTGRES_PASSWORD')
parser.add_argument('--namespace', default='classicguess')
parser.add_argument('--secret', default='classicguess-app')
parser.add_argument('--host', default='postgres-client.db.svc.cluster.local')
parser.add_argument('--port', type=int, default=5432)
parser.add_argument('--user', default='app')
parser.add_argument('--database', default='app')
parser.add_argument('--apply', action='store_true', help='Create the namespace and write the app Secret.')
args = parser.parse_args()


def kubectl(*arguments, document=None):
    result = subprocess.run(['kubectl', *arguments],
        input=json.dumps(document) if document is not None else None,
        capture_output=True, text=True, timeout=30)
    if result.returncode:
        # Do not echo Secret input/output or exception payloads.
        raise SystemExit('kubectl failed; check your context, resource names and permissions.')
    return result.stdout


context = kubectl('config', 'current-context').strip()
source = json.loads(kubectl('get', 'secret', args.source_secret, '-n', args.source_namespace, '-o', 'json'))
encoded = source.get('data', {}).get(args.password_key)
if not encoded:
    raise SystemExit('The source Secret is missing the configured password key.')
password = base64.b64decode(encoded, validate=True).decode('utf-8')
if not password:
    raise SystemExit('The source password is empty.')
print(f'Context: {context}')
print(f'Source: {args.source_namespace}/{args.source_secret}, key {args.password_key}')
print(f'Database: {args.user}@{args.host}:{args.port}/{args.database}')
print(f'Target: {args.namespace}/{args.secret}')
if not args.apply:
    print('Checks complete. Add --apply to create/update the app Secret. No credentials were displayed.')
    raise SystemExit(0)

kubectl('apply', '-f', '-', document={'apiVersion': 'v1', 'kind': 'Namespace', 'metadata': {'name': args.namespace}})
existing_text = kubectl('get', 'secret', args.secret, '-n', args.namespace, '-o', 'json', '--ignore-not-found')
existing = json.loads(existing_text) if existing_text.strip() else {}
data = existing.get('data', {})
signing = data.get('DAILY_TOKEN_SECRET')
# Preserve the signing secret so completed browser runs remain valid.
if signing:
    signing_value = base64.b64decode(signing, validate=True).decode('utf-8')
    if len(signing_value) < 32:
        raise SystemExit('Existing DAILY_TOKEN_SECRET is too short; fix it before continuing.')
else:
    signing_value = secrets.token_hex(32)
connection = f'postgresql://{quote(args.user, safe="")}:{quote(password, safe="")}@{args.host}:{args.port}/{quote(args.database, safe="")}'
data['DATABASE_URL'] = base64.b64encode(connection.encode()).decode()
data['DAILY_TOKEN_SECRET'] = base64.b64encode(signing_value.encode()).decode()
# Merge patch updates only the needed data without storing credentials in a
# kubectl last-applied annotation. --patch-file - keeps values off process argv.
if existing:
    kubectl('patch', 'secret', args.secret, '-n', args.namespace, '--type=merge', '--patch-file', '-', document={'data': data})
else:
    kubectl('create', '-f', '-', document={'apiVersion': 'v1', 'kind': 'Secret', 'type': 'Opaque',
        'metadata': {'name': args.secret, 'namespace': args.namespace}, 'data': data})
print('App Secret configured. Credentials stayed in memory and were sent through stdin.')
print('If the app is already running, restart its Deployment to load the updated environment.')
