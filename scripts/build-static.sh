#!/bin/sh

set -eu

output_dir="${1:-_site}"

mkdir -p "$output_dir/assets" "$output_dir/resume" "$output_dir/career" "$output_dir/portfolio"
cp index.html "$output_dir/index.html"
cp -R assets/. "$output_dir/assets/"
cp resume/index.html "$output_dir/resume/index.html"
cp career/index.html "$output_dir/career/index.html"
cp portfolio/index.html "$output_dir/portfolio/index.html"

if [ "${INCLUDE_ADMIN:-true}" != "false" ] && [ -d admin ]; then
  mkdir -p "$output_dir/admin"
  cp -R admin/. "$output_dir/admin/"
fi

if [ -d output/pdf ]; then
  mkdir -p "$output_dir/pdf"
  cp -R output/pdf/. "$output_dir/pdf/"
fi
