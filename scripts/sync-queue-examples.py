"""Embed the standalone teaching programs into their article compiler panels.
Run from any directory. The Linux research harness remains outside Gatsby.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = ROOT / 'benchmarks/spsc-vs-mpsc/examples'
for article in (ROOT / 'src/pages').glob('2026-10-31-*/index.md'):
    source = article.read_text()
    def embed(match):
        name = match.group(1)
        code = (EXAMPLES / (name + '.cpp')).read_text().rstrip()
        return (f'<!-- EXAMPLE:{name} -->\n\n```cpp\n{code}\n```\n\n'
                f'<div data-cpp-example="{name}">\n'
                '<p>Runnable C++20 example. Download the source or run it with Compiler Explorer.</p>\n'
                f'</div>\n\n<!-- END-EXAMPLE:{name} -->')
    source = re.sub(r'<!-- EXAMPLE:([\w-]+) -->(?:[\s\S]*?<!-- END-EXAMPLE:\1 -->)?', embed, source)
    article.write_text(source)
