# Builds every benchmark variant into build/v3/. Benchmarks and flamegraphs
# use the same binaries, so they keep frame pointers.
#
#   make            all benchmark binaries
#   make test       sanitizer + stress tests (tests/run_tests.sh)
#   make bench      interleaved equal-capacity throughput runs (analysis/run_vm.py)
#   make charts     new charts/v3/*.png from data/v3/
#   make clean

# GNU make predefines CXX=g++, so ?= would never apply; only override the
# built-in default, not a CXX given on the command line or environment.
# This VM has GCC 13; historical v2 used clang. Do not compare absolute rates across hosts.
ifeq ($(origin CXX),default)
CXX := g++
endif
CXXFLAGS ?= -std=c++20 -O3 -g -fno-omit-frame-pointer -Wall -Wextra -Werror -pthread
OUT      ?= build/v3
EXTRA_FLAGS ?=
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
	$(CXX) $(CXXFLAGS) $(EXTRA_FLAGS) $(call flags,$(1)) $$< -o $$@
endef
$(foreach v,$(VARIANTS),$(eval $(call variant_rule,$(v))))

$(OUT)/lock_contention: lock_contention.cpp $(HEADERS) | $(OUT)
	$(CXX) $(CXXFLAGS) $(EXTRA_FLAGS) $< -o $@

$(OUT)/canary: canary.cpp pinning.h | $(OUT)
	$(CXX) $(CXXFLAGS) $(EXTRA_FLAGS) $< -o $@

$(OUT)/main: main.cpp $(HEADERS) | $(OUT)
	$(CXX) $(CXXFLAGS) $(EXTRA_FLAGS) $< -o $@

$(OUT):
	mkdir -p $@

test:
	bash tests/run_tests.sh

fair-build: all
	$(MAKE) OUT=build/fair4 EXTRA_FLAGS=-DSHARED_CAPACITY=32 all

bench: fair-build
	python3 analysis/run_vm.py fair 30

legacy-bench: all
	python3 analysis/run_vm.py legacy 30

charts:
	python3 analysis/make_vm_charts.py
	python3 analysis/render_report.py

clean:
	rm -rf $(OUT)

.PHONY: all test fair-build bench legacy-bench charts clean
