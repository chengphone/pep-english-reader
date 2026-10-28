#!/usr/bin/env python3
"""Create a reusable local MP3 package using Edge online neural TTS (no server).
Install: python3 -m pip install edge-tts
Run: python3 build_word_audio.py request.json
Only the English text is sent to Microsoft's online voice service.
"""
import argparse
import asyncio
import hashlib
import json
from pathlib import Path
import sys
import zipfile


async def build(request_path, output):
    try:
        import edge_tts
    except ImportError:
        raise SystemExit('请先安装：python3 -m pip install edge-tts')
    request = json.loads(request_path.read_text(encoding='utf-8-sig'))
    if request.get('schemaVersion') != 1 or not isinstance(request.get('items'), list):
        raise SystemExit('词表格式错误，请重新从应用导出。')
    voice = request.get('voice', 'en-US-AriaNeural')
    if not isinstance(voice, str) or not voice.startswith(('en-US-', 'en-GB-')):
        raise SystemExit('请选择英式或美式英文音色。')
    texts = list(dict.fromkeys(item['text'].strip() for item in request['items']
                              if isinstance(item, dict) and isinstance(item.get('text'), str) and item['text'].strip()))
    if not texts or len(texts) > 5000 or any(len(text) > 500 for text in texts):
        raise SystemExit('词表为空或过大。每次最多 5000 条，每条不超过 500 字符。')
    output.parent.mkdir(parents=True, exist_ok=True)
    cache = output.parent / '.word-audio-cache'
    cache.mkdir(parents=True, exist_ok=True)
    items, failed = [], []
    for index, text in enumerate(texts, 1):
        digest = hashlib.sha256((voice + '\0' + text).encode()).hexdigest()
        path = cache / (digest + '.mp3')
        if not path.exists() or path.stat().st_size < 100:
            temporary = path.with_suffix('.part')
            for attempt in range(3):
                try:
                    await edge_tts.Communicate(text, voice, rate='-10%').save(str(temporary))
                    if temporary.stat().st_size < 100:
                        raise ValueError('音频为空')
                    temporary.replace(path)
                    break
                except Exception as exc:
                    temporary.unlink(missing_ok=True)
                    if attempt == 2:
                        failed.append(text)
                        print(f'失败 {text}: {exc}', file=sys.stderr)
                    else:
                        await asyncio.sleep(attempt + 1)
        if path.exists() and path.stat().st_size >= 100:
            items.append({'text': text, 'file': 'audio/' + path.name})
        print(f'{index}/{len(texts)} {text}', flush=True)
    if failed:
        raise SystemExit(f'{len(failed)} 条生成失败，未导出不完整包；请联网后重跑。已完成音频会保留。')
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary_zip = output.with_suffix('.tmp')
    with zipfile.ZipFile(temporary_zip, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('manifest.json', json.dumps({'schemaVersion': 1, 'voice': voice, 'items': items}, ensure_ascii=False))
        for item in items:
            archive.write(cache / Path(item['file']).name, item['file'])
    temporary_zip.replace(output)
    print(f'已生成 {output}（{len(items)} 条，{voice}），请导入应用并试听校对。')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('request', type=Path)
    parser.add_argument('--output', type=Path, default=Path('word-audio.zip'))
    args = parser.parse_args()
    try:
        asyncio.run(build(args.request, args.output))
    except KeyboardInterrupt:
        raise SystemExit('已停止；重新运行可继续。')
