#!/usr/bin/env python3
"""Record observable cycle output without claiming automatic product approval."""
import argparse
import hashlib
import json
import time
from pathlib import Path


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def game_hashes(root, version=2):
    files = list((root / 'game').rglob('*'))
    if version == 1:
        files += [root / 'scripts' / name for name in
                  ('prototype-server.mjs', 'account-store.mjs', 'simulation-clock.mjs')]
    else:
        files += [p for p in (root / 'scripts').glob('*.mjs')
                  if not p.name.startswith('browser-') and '.test.' not in p.name]
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in files if p.is_file() and '.test.' not in p.name
            and 'vendor' not in p.relative_to(root).parts}


def evidence(root, name, started, screenshot=False):
    if not isinstance(name, str):
        return False
    path = (root / name).resolve()
    if not path.is_relative_to((root / 'logs').resolve()):
        return False
    try:
        info = path.stat()
        if not path.is_file() or info.st_size == 0 or info.st_mtime < started:
            return False
        if screenshot:
            with path.open('rb') as handle:
                return handle.read(8) == b'\x89PNG\r\n\x1a\n'
        return True
    except OSError:
        return False


def begin(root, cycle):
    previous = {}
    try:
        previous = json.loads((root / 'logs/latest-cycle.json').read_text())
    except (OSError, ValueError):
        pass
    value = {'cycle_id': cycle, 'started': time.time(), 'status': 'running', 'hash_version': 2, 'hashes': game_hashes(root),
             'previous_outcome': {k: previous.get(k) for k in
                                  ('status', 'feature', 'remaining', 'cycles_without_reported_delivery',
                                   'completed_cycles_without_reported_delivery', 'termination_reason', 'reasons')}}
    write_json(root / 'logs' / f'{cycle}.baseline.json', value)
    write_json(root / 'logs' / 'latest-cycle.json', {k: v for k, v in value.items() if k != 'hashes'})


def finish(root, cycle, exit_code):
    logs = root / 'logs'
    baseline = json.loads((logs / f'{cycle}.baseline.json').read_text())
    current = game_hashes(root, baseline.get('hash_version', 1))
    changed = sorted(k for k in current.keys() | baseline['hashes'].keys()
                     if current.get(k) != baseline['hashes'].get(k))
    reasons = []
    try:
        report = json.loads((logs / f'{cycle}.result.json').read_text())
        if not isinstance(report, dict) or report.get('cycle_id') != cycle:
            raise ValueError('cycle_id inválido')
    except (OSError, ValueError) as error:
        report = {}
        reasons.append(f'Relatório ausente ou inválido: {error}')
    status = 'no_delivery'
    claimed = report.get('status')
    if exit_code != 0:
        status = 'interrupted' if exit_code in (124, 137, 143) else 'failed'
        reasons.append(f'Execução encerrada com código {exit_code}')
    elif claimed == 'blocked' and report.get('reason') and report.get('attempt'):
        status = 'blocked'
    elif claimed in ('partial', 'delivered'):
        checks = report.get('checks')
        shots = report.get('screenshots')
        check_ok = isinstance(checks, list) and bool(checks) and all(
            isinstance(c, dict) and c.get('passed') is True and c.get('name')
            and evidence(root, c.get('evidence'), baseline['started']) for c in checks)
        shots_ok = isinstance(shots, list) and len(set(s for s in shots if isinstance(s,str))) >= 2 and all(
            evidence(root, s, baseline['started'], screenshot=True) for s in shots)
        described = all(isinstance(report.get(k), str) and report[k].strip()
                        for k in ('milestone', 'feature', 'how_to_try'))
        if not changed:
            reasons.append('Nenhum arquivo do jogo/servidor mudou neste ciclo')
        if not described:
            reasons.append('Falta descrever marco, ação jogável e passos de uso')
        if claimed == 'delivered' and not (check_ok and shots_ok):
            reasons.append('Faltam checagens aprovadas e duas screenshots atuais nos logs')
        if changed and described:
            status = 'reported_delivery' if claimed == 'delivered' and check_ok and shots_ok else 'partial'
    value = {'cycle_id': cycle, 'started': baseline['started'], 'ended': time.time(),
             'exit_code': exit_code, 'status': status,
             'termination_reason': 'timeout' if exit_code == 124 else
                 'external_signal' if exit_code in (137, 143) else
                 'error' if exit_code else 'completed',
             'changed_game_files': changed,
             'feature': report.get('feature', ''), 'milestone': report.get('milestone', ''),
             'how_to_try': report.get('how_to_try', ''), 'remaining': report.get('remaining', ''),
             'reasons': reasons, 'report': f'logs/{cycle}.result.json',
             'product_review': 'A entrega relatada ainda requer avaliação do resultado jogável.'}
    previous = []
    for path in sorted(logs.glob('*.outcome.json'), reverse=True):
        try:
            previous.append(json.loads(path.read_text()))
        except (OSError, ValueError):
            continue
    streak = 0
    for item in [value] + previous:
        if item['status'] == 'reported_delivery':
            break
        streak += 1
    value['cycles_without_reported_delivery'] = streak
    completed_streak = 0
    for item in [value] + previous:
        if item['status'] == 'reported_delivery':
            break
        if item.get('exit_code') in (137, 143):
            continue
        completed_streak += 1
    value['completed_cycles_without_reported_delivery'] = completed_streak
    write_json(logs / f'{cycle}.outcome.json', value)
    write_json(logs / 'latest-cycle.json', value)
    print(json.dumps(value, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=('begin', 'finish'))
    parser.add_argument('root', type=Path)
    parser.add_argument('cycle')
    parser.add_argument('exit_code', nargs='?', type=int, default=0)
    args = parser.parse_args()
    if not args.cycle or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-' for c in args.cycle):
        parser.error('invalid cycle id')
    root = args.root.resolve()
    (root / 'logs').mkdir(exist_ok=True)
    if args.action == 'begin':
        begin(root, args.cycle)
    else:
        finish(root, args.cycle, args.exit_code)


if __name__ == '__main__':
    main()
