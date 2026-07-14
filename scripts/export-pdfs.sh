#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
output_dir=${1:-"$project_root/output/pdf"}
tmp_root="$project_root/tmp/pdfs"

find_browser() {
  if [ -n "${BROWSER_BIN:-}" ]; then
    if [ ! -x "$BROWSER_BIN" ]; then
      printf 'BROWSER_BIN is not executable: %s\n' "$BROWSER_BIN" >&2
      exit 1
    fi
    printf '%s\n' "$BROWSER_BIN"
    return
  fi

  if [ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
    printf '%s\n' "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    return
  fi

  for command_name in google-chrome-stable google-chrome chromium chromium-browser; do
    if command -v "$command_name" >/dev/null 2>&1; then
      command -v "$command_name"
      return
    fi
  done

  printf '%s\n' \
    'Chrome or Chromium was not found. Set BROWSER_BIN to the browser executable.' >&2
  exit 1
}

browser_bin=$(find_browser)
mkdir -p "$output_dir" "$tmp_root"
output_dir=$(CDPATH= cd -- "$output_dir" && pwd)

chrome_log="$tmp_root/chrome.log"
active_profile=''
active_pid=''

cleanup_active_browser() {
  if [ -n "$active_pid" ]; then
    if kill -0 "$active_pid" 2>/dev/null; then
      kill -TERM "$active_pid" 2>/dev/null || true
      stop_attempts=0
      while kill -0 "$active_pid" 2>/dev/null && [ "$stop_attempts" -lt 5 ]; do
        stop_attempts=$((stop_attempts + 1))
        sleep 1
      done
      if kill -0 "$active_pid" 2>/dev/null; then
        kill -KILL "$active_pid" 2>/dev/null || true
      fi
    fi
    wait "$active_pid" 2>/dev/null || true
    active_pid=''
  fi

  case "$active_profile" in
    "$tmp_root"/chrome-profile.*)
      if [ -d "$active_profile" ]; then
        rm -r "$active_profile"
      fi
      ;;
  esac
  active_profile=''
}

cleanup() {
  cleanup_active_browser
  rm -f "$chrome_log" "$tmp_root"/*.txt
  rmdir "$tmp_root" "$project_root/tmp" 2>/dev/null || true
}

trap cleanup EXIT HUP INT TERM

verify_pdf() {
  pdf_path=$1
  document_name=$2
  shift 2

  if [ ! -s "$pdf_path" ]; then
    printf 'PDF export failed: %s is empty or missing.\n' "$pdf_path" >&2
    exit 1
  fi

  if LC_ALL=C grep -aFq 'file:///' "$pdf_path"; then
    printf 'PDF validation failed: %s contains a local file link.\n' \
      "$document_name" >&2
    exit 1
  fi

  if command -v pdfinfo >/dev/null 2>&1; then
    pdf_summary=$(pdfinfo "$pdf_path")
    pages=$(printf '%s\n' "$pdf_summary" | awk '/^Pages:/ { print $2 }')
    if [ -z "$pages" ] || [ "$pages" -lt 1 ]; then
      printf 'PDF validation failed: %s has no pages.\n' "$document_name" >&2
      exit 1
    fi
    if ! printf '%s\n' "$pdf_summary" | grep -Fq '(A4)'; then
      printf 'PDF validation failed: %s is not A4.\n' "$document_name" >&2
      exit 1
    fi

    case "$document_name" in
      resume) expected_pages=2 ;;
      career-description) expected_pages=3 ;;
      portfolio) expected_pages=9 ;;
      *) expected_pages='' ;;
    esac
    if [ -n "$expected_pages" ] && [ "$pages" -ne "$expected_pages" ]; then
      printf 'PDF validation failed: %s has %s pages; expected %s.\n' \
        "$document_name" "$pages" "$expected_pages" >&2
      exit 1
    fi
  else
    pages='unknown'
  fi

  if command -v pdftotext >/dev/null 2>&1; then
    text_path="$tmp_root/$document_name.txt"
    pdftotext "$pdf_path" "$text_path"
    for expected_text in "$@"; do
      if ! grep -Fq "$expected_text" "$text_path"; then
        printf 'PDF validation failed: "%s" is missing from %s.\n' \
          "$expected_text" "$document_name" >&2
        exit 1
      fi
    done

    case "$pages" in
      *[!0-9]*|'')
        ;;
      *)
        page_number=1
        while [ "$page_number" -le "$pages" ]; do
          page_text="$tmp_root/$document_name-page-$page_number.txt"
          pdftotext -f "$page_number" -l "$page_number" "$pdf_path" "$page_text"
          if [ -z "$(tr -d '[:space:]' < "$page_text")" ]; then
            printf 'PDF validation failed: %s page %s is blank.\n' \
              "$document_name" "$page_number" >&2
            exit 1
          fi
          page_number=$((page_number + 1))
        done
        ;;
    esac
  fi

  file_size=$(wc -c < "$pdf_path" | tr -d ' ')
  printf 'Created %s (%s pages, %s bytes)\n' "$pdf_path" "$pages" "$file_size"
}

export_pdf() {
  source_path=$1
  target_path=$2
  document_name=$3
  shift 3

  active_profile=$(mktemp -d "$tmp_root/chrome-profile.XXXXXX")
  rm -f "$target_path"
  : > "$chrome_log"
  "$browser_bin" \
    --headless=new \
    --allow-file-access-from-files \
    --disable-background-networking \
    --disable-default-apps \
    --disable-extensions \
    --disable-gpu \
    --disable-sync \
    --hide-scrollbars \
    --no-first-run \
    --no-pdf-header-footer \
    --run-all-compositor-stages-before-draw \
    --virtual-time-budget=2500 \
    --window-size=1440,1800 \
    --user-data-dir="$active_profile" \
    --print-to-pdf="$target_path" \
    "file://$source_path" >> "$chrome_log" 2>&1 &
  active_pid=$!

  write_complete=0
  attempts=0
  while [ "$attempts" -lt 45 ]; do
    if grep -Fq 'bytes written to file' "$chrome_log"; then
      write_complete=1
      break
    fi

    if ! kill -0 "$active_pid" 2>/dev/null; then
      if [ -s "$target_path" ]; then
        write_complete=1
      fi
      break
    fi

    attempts=$((attempts + 1))
    sleep 1
  done

  if [ ! -s "$target_path" ] || [ "$write_complete" -ne 1 ]; then
    printf 'PDF export timed out for %s. Chrome output:\n' "$document_name" >&2
    sed -n '1,80p' "$chrome_log" >&2
    exit 1
  fi

  cleanup_active_browser

  verify_pdf "$target_path" "$document_name" "$@"
}

export_pdf \
  "$project_root/resume/index.html" \
  "$output_dir/seo-minjae-resume.pdf" \
  'resume' \
  '웍스피어' \
  'AGENT LAB'

export_pdf \
  "$project_root/career/index.html" \
  "$output_dir/seo-minjae-career-description.pdf" \
  'career-description' \
  '경력 요약' \
  '웍스피어' \
  'Agent Lab' \
  '약 200만 건'

export_pdf \
  "$project_root/portfolio/index.html" \
  "$output_dir/seo-minjae-backend-portfolio.pdf" \
  'portfolio' \
  'POINT PLATFORM' \
  'PointExpireJob' \
  'FeedRequestContext' \
  'AbstractMockTest' \
  'manifest.txt'
