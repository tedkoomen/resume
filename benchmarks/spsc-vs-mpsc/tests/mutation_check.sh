#!/bin/bash
set -eu
cd "$(dirname "$0")/.."
mkdir -p build/mutation data/v3/tests
cp ./*.h fanin_test.cpp build/mutation/
python3 - <<'PY'
from pathlib import Path
p=Path('build/mutation/spsc.h')
s=p.read_text();old='head_.store(head + 1, std::memory_order_release);'
assert old in s
p.write_text(s.replace(old,'head_.store(head + 1, std::memory_order_relaxed);'))
PY
${CXX:-g++} -std=c++20 -O1 -g -pthread -fsanitize=thread -DPAYLOAD_WORDS=4 build/mutation/fanin_test.cpp -o build/mutation/relaxed
set +e
TSAN_OPTIONS=halt_on_error=1 timeout 30 build/mutation/relaxed 5000 1 0 3 > data/v3/tests/mutation.txt 2>&1
rc=$?
set -e
[ "$rc" = 66 ] && grep -q 'ThreadSanitizer: data race' data/v3/tests/mutation.txt
printf 'Expected publication race detected by TSan\n'
