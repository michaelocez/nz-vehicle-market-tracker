"""Discover and download the current NZTA all-vehicle-years ZIP."""

from __future__ import annotations

import argparse
import shutil
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen


DEFAULT_SOURCE_PAGE = "https://www.nzta.govt.nz/resources/new-zealand-motor-vehicle-register-statistics/new-zealand-vehicle-fleet-open-data-sets"
USER_AGENT = "nz-vehicle-market-tracker/0.1 (+portfolio data pipeline)"


class LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        self._href = dict(attrs).get("href")
        self._text = []

    def handle_data(self, data: str) -> None:
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "a" and self._href is not None:
            self.links.append((self._href, " ".join(self._text)))
            self._href = None
            self._text = []


def discover_all_years_zip(page_url: str, html: str) -> str:
    """Select an all-years ZIP link from an NZTA page without fixed filenames."""

    parser = LinkParser()
    parser.feed(html)
    candidates = []
    for href, label in parser.links:
        absolute = urljoin(page_url, href)
        haystack = f"{absolute} {label}".lower()
        if ".zip" in absolute.lower() and "all" in haystack and "vehicle" in haystack:
            candidates.append(absolute)
    if not candidates:
        raise ValueError("Could not discover an all-vehicle-years ZIP link")
    return candidates[0]


def fetch_text(url: str) -> str:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=60) as response:  # noqa: S310 - expected HTTPS source
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def download(url: str, destination_dir: Path) -> Path:
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise ValueError("Only HTTPS download URLs are accepted")
    filename = Path(parsed.path).name
    if not filename.lower().endswith(".zip"):
        raise ValueError("Download URL must identify a ZIP file")

    destination_dir.mkdir(parents=True, exist_ok=True)
    destination = destination_dir / filename
    temporary = destination.with_suffix(destination.suffix + ".part")
    request = Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urlopen(request, timeout=120) as response, temporary.open("wb") as handle:  # noqa: S310
            shutil.copyfileobj(response, handle, length=1024 * 1024)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    return destination


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", help="Explicit current all-years ZIP URL")
    parser.add_argument("--source-page", default=DEFAULT_SOURCE_PAGE)
    parser.add_argument("--destination-dir", type=Path, default=Path("data/cache"))
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        url = args.url or discover_all_years_zip(args.source_page, fetch_text(args.source_page))
        destination = download(url, args.destination_dir)
    except (OSError, ValueError) as exc:
        print(f"Download failed: {exc}", file=sys.stderr)
        return 1
    print(destination)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
