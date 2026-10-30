"""Compile every article example; run only the six with defined behavior.

Usage: python3 scripts/test-thread-examples.py (requires g++ with C++20 support).
"""
from pathlib import Path
import re
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
article = (root / "src/pages/2026-10-30-threads-mutexes-atomics/index.md").read_text()
examples = re.findall(r'```cpp\n(.*?)```\s*<div data-cpp-example="([^"]+)"', article, re.S)
expected = {
    "mutex-counter": ["Final count: 10"],
    "atomic-counter": ["Final counter value: 10"],
    "publication": ["Consumer observed payload: 42"],
    "cas-counter": ["CAS counter: 4000 (expected 4000)"],
    "versioned-state": ["Stale CAS accepted: false", "Current value: 10, version: 3"],
    "padded-counters": ["Worker A: 1000", "Worker B: 1000", "Counter alignment: 64 bytes"],
}
assert len(examples) == 8
with tempfile.TemporaryDirectory() as temp:
    for code, name in examples:
        source, binary = Path(temp) / f"{name}.cpp", Path(temp) / name
        source.write_text(code)
        subprocess.run(["g++", "-std=c++20", "-O2", "-Wall", "-Wextra", "-Wpedantic", "-pthread", str(source), "-latomic", "-o", str(binary)], check=True)
        if name in expected:
            for _ in range(10):
                result = subprocess.run([str(binary)], text=True, capture_output=True, check=True, timeout=5)
                for line in expected[name]:
                    assert line in result.stdout, (name, result.stdout)
            print(f"{name}: compiled; expected output in 10 runs")
        else:
            print(f"{name}: compiled only (deliberate undefined behavior)")
