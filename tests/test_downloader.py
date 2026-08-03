from urllib.request import Request

import pytest

from nz_vehicle_market_tracker.downloader import (
    HttpsOnlyRedirectHandler,
    discover_all_years_zip,
)


def test_discovers_all_vehicle_years_zip() -> None:
    html = """
    <a href="/downloads/VehicleYear_2026.zip">Single year</a>
    <a href="/downloads/Fleet-data-all-vehicle-years.zip">All vehicle years ZIP</a>
    """
    assert discover_all_years_zip("https://example.test/data", html) == (
        "https://example.test/downloads/Fleet-data-all-vehicle-years.zip"
    )


def test_discovery_fails_closed_when_page_changes() -> None:
    with pytest.raises(ValueError, match="Could not discover"):
        discover_all_years_zip("https://example.test/data", "<p>No download</p>")


@pytest.mark.parametrize(
    "redirect_url",
    (
        "http://downloads.example.test/Fleet-data-all-vehicle-years.zip",
        "ftp://downloads.example.test/Fleet-data-all-vehicle-years.zip",
    ),
)
def test_redirect_handler_rejects_non_https_target(redirect_url: str) -> None:
    request = Request("https://example.test/Fleet-data-all-vehicle-years.zip")

    with pytest.raises(ValueError, match="Only HTTPS redirects are accepted"):
        HttpsOnlyRedirectHandler().redirect_request(
            request,
            None,
            302,
            "Found",
            {},
            redirect_url,
        )


def test_redirect_handler_allows_https_target() -> None:
    request = Request("https://example.test/Fleet-data-all-vehicle-years.zip")

    redirected = HttpsOnlyRedirectHandler().redirect_request(
        request,
        None,
        302,
        "Found",
        {},
        "https://downloads.example.test/Fleet-data-all-vehicle-years.zip",
    )

    assert redirected is not None
    assert redirected.full_url == (
        "https://downloads.example.test/Fleet-data-all-vehicle-years.zip"
    )
