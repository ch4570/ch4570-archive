#!/bin/sh

set -eu

output_dir="${1:-_site}"

mkdir -p "$output_dir/assets" "$output_dir/resume" "$output_dir/portfolio"
cp index.html "$output_dir/index.html"
cp -R assets/. "$output_dir/assets/"
cp resume/index.html "$output_dir/resume/index.html"
cp portfolio/index.html "$output_dir/portfolio/index.html"
