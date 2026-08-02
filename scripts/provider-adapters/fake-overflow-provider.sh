#!/bin/sh

# Flood stdout until the consumer (the output cap) goes away. Loop on printf's
# own exit status instead of relying on SIGPIPE to terminate us: some
# environments — notably the GitHub Actions runner — start processes with
# SIGPIPE ignored, and that disposition is inherited across fork/exec. There a
# write to the closed cap pipe returns EPIPE instead of killing the process, so
# a `while :;` loop would spin forever emitting write errors until the outer
# deadline fired (exit 124) rather than letting the cap settle (exit 75).
# Exiting as soon as a write fails keeps the pipeline from hanging on any
# SIGPIPE disposition.
while printf '%s\n' 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; do
  :
done
