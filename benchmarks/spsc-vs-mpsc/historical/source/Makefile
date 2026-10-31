# Builds every benchmark variant into build/v2/. Benchmarks and flamegraphs
# use the same binaries, so they keep frame pointers.
#
#   make            all benchmark binaries
#   make test       sanitizer + stress tests (tests/run_tests.sh)
#   make bench      interleaved throughput runs (analysis/run_bench.py)
#   make charts     charts/*.png and charts/REPORT.md from data/
#   make clean

# GNU make predefines CXX=g++, so ?= would never apply; only override the
# built-in default, not a CXX given on the command line or environment.
ifeq ($(origin CXX),default)
CXX := clang++
endif
CXXFLAGS ?= -std=c++20 -O3 -g -fno-omit-frame-pointer -Wall -Wextra -Werror -pthread
OUT      := build/v2
HEADERS  := concepts.h spsc.h mpsc.h locked_queue.h pinning.h

# name := extra compiler flags
VARIANTS := \
  lockfree_spsc:-DQUEUE_IMPL=0 \
  lockfree_spsc_packed:-DQUEUE_IMPL=0,-DSPSC_CACHE_LINE=8 \
  lockfree_mpsc_b0:-DQUEUE_IMPL=0,-DQUEUE_SHARED=1,-DMPSC_BACKOFF=0 \
  lockfree_mpsc_b1:-DQUEUE_IMPL=0,-DQUEUE_SHARED=1,-DMPSC_BACKOFF=1 \
  lockfree_mpsc_b2:-DQUEUE_IMPL=0,-DQUEUE_SHARED=1,-DMPSC_BACKOFF=2 \
  lockfree_mpsc_b0_packed:-DQUEUE_IMPL=0,-DQUEUE_SHARED=1,-DMPSC_BACKOFF=0,-DMPSC_CACHE_LINE=8 \
  lockfree_mpsc_b1_packed:-DQUEUE_IMPL=0,-DQUEUE_SHARED=1,-DMPSC_BACKOFF=1,-DMPSC_CACHE_LINE=8 \
  lockfree_mpsc_b2_packed:-DQUEUE_IMPL=0,-DQUEUE_SHARED=1,-DMPSC_BACKOFF=2,-DMPSC_CACHE_LINE=8 \
  lockfree_mpsc_b0_stats:-DQUEUE_IMPL=0,-DQUEUE_SHARED=1,-DMPSC_BACKOFF=0,-DMPSC_STATS \
  lockfree_mpsc_b1_stats:-DQUEUE_IMPL=0,-DQUEUE_SHARED=1,-DMPSC_BACKOFF=1,-DMPSC_STATS \
  lockfree_mpsc_b2_stats:-DQUEUE_IMPL=0,-DQUEUE_SHARED=1,-DMPSC_BACKOFF=2,-DMPSC_STATS \
  mutex_spsc:-DQUEUE_IMPL=1 \
  mutex_mpsc:-DQUEUE_IMPL=1,-DQUEUE_SHARED=1 \
  spin_spsc:-DQUEUE_IMPL=2 \
  spin_mpsc:-DQUEUE_IMPL=2,-DQUEUE_SHARED=1 \
  condvar_spsc:-DQUEUE_IMPL=3 \
  condvar_mpsc:-DQUEUE_IMPL=3,-DQUEUE_SHARED=1

name  = $(word 1,$(subst :, ,$(1)))
flags = $(subst $(comma), ,$(word 2,$(subst :, ,$(1))))
comma := ,

BINARIES := $(foreach v,$(VARIANTS),$(OUT)/fanin_$(call name,$(v))) $(OUT)/lock_contention $(OUT)/canary $(OUT)/main

all: $(BINARIES)

define variant_rule
$(OUT)/fanin_$(call name,$(1)): fanin_test.cpp $(HEADERS) | $(OUT)
	$(CXX) $(CXXFLAGS) $(call flags,$(1)) $$< -o $$@
endef
$(foreach v,$(VARIANTS),$(eval $(call variant_rule,$(v))))

$(OUT)/lock_contention: lock_contention.cpp $(HEADERS) | $(OUT)
	$(CXX) $(CXXFLAGS) $< -o $@

$(OUT)/canary: canary.cpp pinning.h | $(OUT)
	$(CXX) $(CXXFLAGS) $< -o $@

$(OUT)/main: main.cpp $(HEADERS) | $(OUT)
	$(CXX) $(CXXFLAGS) $< -o $@

$(OUT):
	mkdir -p $@

test:
	tests/run_tests.sh

bench: all
	.venv/bin/python analysis/run_bench.py

charts:
	.venv/bin/python analysis/make_charts.py

clean:
	rm -rf $(OUT)

.PHONY: all test bench charts clean
