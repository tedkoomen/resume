# FlameGraph helpers

These two Perl scripts were included in the supplied benchmark archive and are retained for rendering perf samples. Upstream: https://github.com/brendangregg/FlameGraph . Copyright and license notices are in each script. No other contents of the bundled third-party checkout are needed by this project.

```sh
perl tools/FlameGraph/stackcollapse-perf.pl input.stacks > output.folded
perl tools/FlameGraph/flamegraph.pl output.folded > output.svg
```
