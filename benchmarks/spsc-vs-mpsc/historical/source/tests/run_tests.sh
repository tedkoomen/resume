#!/bin/bash
# Correctness tests for every queue implementation x topology:
#   - ThreadSanitizer and AddressSanitizer+UBSan builds
#   - the minimum capacity (1; 2 for the lock-free MPSC queue, which cannot
#     work with one slot) so every message wraps, and the default capacity
#   - 1-word and 4-word payloads (4 words catches unpublished/torn messages)
#   - 1, 3 and 8 producers (8 oversubscribes this 4-CPU node on purpose)
#   - lock-free MPSC in every backoff mode
# Any harness error, sanitizer report or non-zero exit fails the suite.
set -u
cd "$(dirname "$0")/.."
OUT=build/tests
mkdir -p "$OUT"
CXX=${CXX:-clang++}
BASE="-std=c++20 -g -Wall -Wextra -Werror -pthread"
declare -A SAN=([tsan]="-O1 -fsanitize=thread" [asan]="-O1 -fsanitize=address,undefined -fno-sanitize-recover=all")

# name|defines
CONFIGS=()
for impl in 0 1 2 3; do for shared in 0 1; do
  backoffs="0"; [ $impl = 0 ] && [ $shared = 1 ] && backoffs="0 1 2"
  for b in $backoffs; do
    for cap in 1 default; do for payload in 1 4; do
      [ $cap = 1 ] && [ $payload = 1 ] && continue
      d="-DQUEUE_IMPL=$impl -DQUEUE_SHARED=$shared -DMPSC_BACKOFF=$b -DPAYLOAD_WORDS=$payload"
      mincap=1; [ $impl = 0 ] && [ $shared = 1 ] && mincap=2
      [ $cap = 1 ] && d="$d -DQUEUE_CAPACITY=$mincap"
      CONFIGS+=("i${impl}_s${shared}_b${b}_c${cap}_p${payload}|$d")
    done; done
  done
done; done

echo "building $(( ${#CONFIGS[@]} * 2 )) sanitizer binaries..."
fails=0
pids=()
for san in tsan asan; do
  for cfg in "${CONFIGS[@]}"; do
    name=${cfg%%|*}; defs=${cfg#*|}
    $CXX $BASE ${SAN[$san]} $defs fanin_test.cpp -o "$OUT/${san}_${name}" \
      2> "$OUT/${san}_${name}.build.log" &
    pids+=($!)
    # At most nproc compiles at once.
    while [ "$(jobs -rp | wc -l)" -ge "$(nproc)" ]; do wait -n; done
  done
done
for pid in "${pids[@]}"; do wait "$pid" || fails=$((fails + 1)); done
if [ $fails != 0 ]; then
  echo "FAILED: $fails builds failed"; grep -l . "$OUT"/*.build.log | head; exit 1
fi

total=0
for san in tsan asan; do
  for cfg in "${CONFIGS[@]}"; do
    name=${cfg%%|*}
    for producers in 1 3 8; do
      msgs=20000; [ $san = tsan ] && msgs=5000
      # The spinlock under oversubscription is pathologically slow (lock-holder
      # preemption), so it gets fewer messages.
      [[ $name == i2_* ]] && [ $producers = 8 ] && msgs=200
      log="$OUT/${san}_${name}_p${producers}.log"
      total=$((total + 1))
      if ! TSAN_OPTIONS="halt_on_error=1" timeout 120 "$OUT/${san}_${name}" $msgs 1 0 $producers > "$log" 2>&1 \
         || grep -qE 'WARNING: ThreadSanitizer|ERROR: AddressSanitizer|runtime error:' "$log" \
         || ! grep -q '^PASSED' "$log"; then
        echo "FAIL: ${san}_${name} producers=$producers (see $log)"
        fails=$((fails + 1))
      fi
    done
  done
done
echo "$((total - fails))/$total test runs passed"
[ $fails = 0 ]
