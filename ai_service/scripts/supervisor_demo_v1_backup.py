from __future__ import annotations

import base64
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent

BASE_URL = os.getenv(
    "MEDSENSE_DEMO_BASE_URL",
    "http://127.0.0.1:8000",
).rstrip("/")

HEALTH_PATH = "/api/v1/health"
OPENAPI_PATH = "/openapi.json"

PRESCRIPTION_PATH = (
    "/api/v1/integrations/amna/prescription/analyze"
)

DDI_PATH = (
    "/api/v1/integrations/amna/ddi/cart-check"
)

OCR_PYTHON = (
    ROOT
    / ".venv-ocr"
    / "Scripts"
    / "python.exe"
)

if not OCR_PYTHON.exists():
    OCR_PYTHON = Path(sys.executable)


def banner(text):
    print()
    print("=" * 76)
    print(text.center(76))
    print("=" * 76)


def pretty(value):
    return json.dumps(
        value,
        indent=2,
        ensure_ascii=False,
        default=str,
    )


def http_json(
    method,
    path,
    payload=None,
    timeout=180,
):
    data = None

    headers = {
        "Accept": "application/json"
    }

    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(
        BASE_URL + path,
        data=data,
        headers=headers,
        method=method,
    )

    started = time.perf_counter()

    try:
        with urllib.request.urlopen(
            request,
            timeout=timeout,
        ) as response:

            raw = response.read()

            elapsed = (
                time.perf_counter()
                - started
            )

            if raw:
                body = json.loads(
                    raw.decode(
                        "utf-8",
                        errors="replace",
                    )
                )
            else:
                body = None

            return (
                response.status,
                body,
                elapsed,
            )

    except urllib.error.HTTPError as exc:

        elapsed = (
            time.perf_counter()
            - started
        )

        raw = exc.read()

        if raw:
            text = raw.decode(
                "utf-8",
                errors="replace",
            )

            try:
                body = json.loads(text)
            except Exception:
                body = text
        else:
            body = None

        return (
            exc.code,
            body,
            elapsed,
        )


def check_health():

    try:
        status, body, elapsed = http_json(
            "GET",
            HEALTH_PATH,
            timeout=5,
        )

    except Exception as exc:

        print(
            "[FAIL] AI service is not reachable:"
        )

        print(exc)

        print()
        print(
            "Start FastAPI first on "
            "http://127.0.0.1:8000"
        )

        return False

    print(
        f"Health HTTP {status} "
        f"({elapsed:.2f}s)"
    )

    print(pretty(body))

    return status == 200


def get_openapi():

    try:
        status, body, _ = http_json(
            "GET",
            OPENAPI_PATH,
            timeout=10,
        )

    except Exception:
        return {}

    if status != 200:
        return {}

    if not isinstance(body, dict):
        return {}

    return body


def route_inventory():

    banner(
        "MEDSENSEAI — CURRENT AI ROUTES"
    )

    if not check_health():
        return

    api = get_openapi()

    feature_keywords = {
        "Prescription": [
            "prescription",
            "ocr",
        ],
        "DDI": [
            "ddi",
            "interaction",
        ],
        "Sales Funnel": [
            "funnel",
        ],
        "Lead Scoring": [
            "lead",
        ],
        "Sales Analytics": [
            "analytics",
            "sales",
        ],
        "Forecasting": [
            "forecast",
        ],
    }

    paths = api.get("paths", {})

    for feature, keywords in feature_keywords.items():

        print()
        print(feature)
        print("-" * len(feature))

        found = []

        for path, operations in paths.items():

            lower_path = path.lower()

            if not any(
                word in lower_path
                for word in keywords
            ):
                continue

            for method in operations:

                if method.lower() in {
                    "get",
                    "post",
                    "put",
                    "patch",
                    "delete",
                }:
                    found.append(
                        (
                            method.upper(),
                            path,
                        )
                    )

        if not found:
            print(
                "No public route currently exposed."
            )

        else:
            for method, path in sorted(
                set(found)
            ):
                print(
                    f"{method:7} {path}"
                )


def ensure_prescription_image():

    existing = (
        ROOT
        / "runtime_prescription_smoke.png"
    )

    if existing.exists():
        return existing

    demo_dir = ROOT / "demo"

    demo_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    output = (
        demo_dir
        / "runtime_prescription_smoke.png"
    )

    from PIL import (
        Image,
        ImageDraw,
        ImageFont,
    )

    image = Image.new(
        "RGB",
        (1200, 1600),
        "white",
    )

    draw = ImageDraw.Draw(image)

    arial = Path(
        r"C:\Windows\Fonts\arial.ttf"
    )

    if arial.exists():

        font = ImageFont.truetype(
            str(arial),
            72,
        )

    else:

        font = ImageFont.load_default()

    draw.text(
        (120, 250),
        "PRESCRIPTION",
        fill="black",
        font=font,
    )

    draw.text(
        (120, 450),
        "Amoxicillin 250 mg",
        fill="black",
        font=font,
    )

    image.save(output)

    return output


def prescription_demo():

    banner(
        "LIVE PRESCRIPTION AI DEMO"
    )

    if not check_health():
        return

    image_path = (
        ensure_prescription_image()
    )

    image_bytes = (
        image_path.read_bytes()
    )

    encoded = base64.b64encode(
        image_bytes
    ).decode("ascii")

    payload = {

        "image_base64": encoded,

        "media_type": "image/png",

        "products": [

            {
                "product_id": 10,

                "product_title":
                    "Amoxicillin 250 mg Capsules",

                "product_generic_name":
                    "Amoxicillin",

                "product_salt":
                    "Amoxicillin",

                "product_requires_rx":
                    True,

                "product_status":
                    1,
            }

        ],
    }

    print()
    print(
        "INPUT:"
    )

    print(
        "PRESCRIPTION"
    )

    print(
        "Amoxicillin 250 mg"
    )

    print()

    print(
        "Running real PaddleOCR + "
        "Prescription Analysis + "
        "Product Matching..."
    )

    status, body, elapsed = http_json(
        "POST",
        PRESCRIPTION_PATH,
        payload,
        timeout=180,
    )

    print()

    print(
        f"HTTP STATUS: {status}"
    )

    print(
        f"RUNTIME: {elapsed:.2f} seconds"
    )

    if status != 200:

        print()
        print("[FAIL]")

        print(pretty(body))

        return

    ocr = (
        body.get("ocr_result")
        or {}
    )

    analysis = (
        body.get(
            "prescription_analysis"
        )
        or {}
    )

    matches = body.get(
        "product_matches"
    )

    print()
    print("OCR RESULT")
    print("-" * 30)

    print(
        "Status:",
        ocr.get("status"),
    )

    print(
        "Review required:",
        ocr.get(
            "review_required"
        ),
    )

    print()
    print("Recognized text:")

    print(
        ocr.get("raw_text")
    )

    print()
    print("PRESCRIPTION ANALYSIS")
    print("-" * 30)

    print(
        "Status:",
        analysis.get("status"),
    )

    print()
    print("Candidate(s):")

    print(
        pretty(
            analysis.get(
                "candidates"
            )
        )
    )

    print()
    print("PRODUCT MATCHING")
    print("-" * 30)

    print(
        pretty(matches)
    )

    print()
    print("WHAT TO EXPLAIN")
    print("-" * 30)

    print(
        "OCR medicine ko direct cart "
        "mein add nahi karta."
    )

    print(
        "OCR evidence extract karta hai."
    )

    print(
        "Prescription Analysis medicine "
        "aur strength structure karti hai."
    )

    print(
        "Product matcher authoritative "
        "Product data ke against match karta hai."
    )

    print(
        "Unique candidate milne ke baad bhi "
        "explicit confirmation required hai."
    )


def ddi_demo():

    banner(
        "LIVE DRUG–DRUG INTERACTION DEMO"
    )

    if not check_health():
        return

    api = get_openapi()

    if (
        DDI_PATH
        not in api.get(
            "paths",
            {},
        )
    ):

        print(
            "[WARN] DDI route current "
            "FastAPI OpenAPI mein exposed nahi hai."
        )

        print(
            "Fake result show nahi kiya jayega."
        )

        return

    products = [

        {
            "product_id": 101,

            "product_title":
                "Aminolevulinic acid Demo",

            "product_generic_name":
                "Aminolevulinic acid",

            "product_salt":
                "Aminolevulinic acid",

            "product_requires_rx":
                True,

            "product_status":
                1,
        },

        {
            "product_id": 102,

            "product_title":
                "Digoxin Demo",

            "product_generic_name":
                "Digoxin",

            "product_salt":
                "Digoxin",

            "product_requires_rx":
                True,

            "product_status":
                1,
        },

    ]

    payload = {
        "products": products
    }

    print()
    print(
        "CASE 1 — SUPPORTED PAIR"
    )

    print(
        "Aminolevulinic acid"
    )

    print("+")

    print("Digoxin")

    status, body, elapsed = http_json(
        "POST",
        DDI_PATH,
        payload,
        timeout=120,
    )

    print()

    print(
        f"HTTP STATUS: {status}"
    )

    print(
        f"RUNTIME: {elapsed:.2f}s"
    )

    print()

    print(
        pretty(body)
    )

    print()
    print(
        "CASE 2 — UNKNOWN INGREDIENT"
    )

    unknown_payload = {

        "products": [

            products[1],

            {
                "product_id": 999,

                "product_title":
                    "Unknown Demo Ingredient",

                "product_generic_name":
                    "Completely Unknown Demo Salt",

                "product_salt":
                    "Completely Unknown Demo Salt",

                "product_requires_rx":
                    True,

                "product_status":
                    1,
            }

        ]

    }

    status, body, elapsed = http_json(
        "POST",
        DDI_PATH,
        unknown_payload,
        timeout=120,
    )

    print()

    print(
        f"HTTP STATUS: {status}"
    )

    print(
        f"RUNTIME: {elapsed:.2f}s"
    )

    print()

    print(
        pretty(body)
    )

    print()
    print("WHAT TO EXPLAIN")
    print("-" * 30)

    print(
        "DDI cart safety boundary par "
        "run hoti hai."
    )

    print(
        "n medicines ke liye "
        "n(n-1)/2 unique pairs check hoti hain."
    )

    print(
        "5 medicines = 10 unique pairs."
    )

    print(
        "Unknown ingredient ko system "
        "silently safe assume nahi karta."
    )


def run_test_suite(
    label,
    files,
):

    existing = [

        ROOT / path

        for path in files

        if (
            ROOT / path
        ).exists()

    ]

    print()
    print(label)
    print("-" * len(label))

    if not existing:

        print(
            "No matching test files found."
        )

        return

    temp = (
        ROOT
        / ".pytest-demo-tmp"
    )

    shutil.rmtree(
        temp,
        ignore_errors=True,
    )

    command = [

        str(OCR_PYTHON),

        "-m",
        "pytest",

        "-q",

        *[
            str(
                path.relative_to(
                    ROOT
                )
            )

            for path in existing
        ],

        f"--basetemp={temp}",

    ]

    started = time.perf_counter()

    process = subprocess.run(

        command,

        cwd=ROOT,

        text=True,

        stdout=subprocess.PIPE,

        stderr=subprocess.STDOUT,

        encoding="utf-8",

        errors="replace",

    )

    elapsed = (
        time.perf_counter()
        - started
    )

    print(
        process.stdout.rstrip()
    )

    print()

    print(
        f"Runtime: {elapsed:.2f}s"
    )

    if process.returncode == 0:

        print(
            "[PASS] targeted regression passed"
        )

    else:

        print(
            "[FAIL] targeted regression failed"
        )


def regression_demo():

    banner(
        "ENGINEERING / TEST EVIDENCE"
    )

    run_test_suite(

        "Prescription",

        [
            "tests/test_amna_prescription_api.py",
            "tests/test_prescription_orchestration.py",
        ],

    )

    run_test_suite(

        "DDI",

        [
            "tests/test_amna_medcopy_ddi_integration.py",
        ],

    )

    run_test_suite(

        "Sales Funnel",

        [
            "tests/test_live_funnel.py",
        ],

    )


def sales_status():

    banner(
        "SALES INTELLIGENCE DEMO STATUS"
    )

    if not check_health():
        return

    api = get_openapi()

    feature_keywords = {

        "Sales Funnel":
            "funnel",

        "Lead Scoring":
            "lead",

        "Sales Analytics":
            "analytics",

        "Forecasting":
            "forecast",

    }

    paths = api.get(
        "paths",
        {},
    )

    for feature, keyword in (
        feature_keywords.items()
    ):

        print()
        print(feature)
        print("-" * len(feature))

        found = []

        for path, operations in (
            paths.items()
        ):

            if keyword not in path.lower():
                continue

            for method in operations:

                if method.lower() in {
                    "get",
                    "post",
                }:

                    found.append(
                        (
                            method.upper(),
                            path,
                        )
                    )

        if found:

            for method, path in sorted(
                set(found)
            ):

                print(
                    f"{method:7} {path}"
                )

        else:

            print(
                "No public API route "
                "currently exposed."
            )

    print()
    print("IMPORTANT")
    print("-" * 30)

    print(
        "Standalone sales demo controlled "
        "development data use kar sakta hai."
    )

    print(
        "Production result tab claim hoga "
        "jab final partner Invoice/InvoiceItem "
        "history integrate aur validate hogi."
    )


def full_demo():

    route_inventory()

    input(
        "\nENTER → Prescription Demo"
    )

    prescription_demo()

    input(
        "\nENTER → DDI Demo"
    )

    ddi_demo()

    input(
        "\nENTER → Sales Intelligence"
    )

    sales_status()

    input(
        "\nENTER → Regression Evidence"
    )

    regression_demo()

    banner(
        "SUPERVISOR DEMO COMPLETE"
    )

    print()
    print(
        "Closing statement:"
    )

    print()

    print(
        "AI layer frontend/backend se "
        "decoupled hai."
    )

    print(
        "Prescription pipeline real PaddleOCR "
        "runtime par validated hai."
    )

    print(
        "Safety-critical uncertain input "
        "guess nahi hota."
    )

    print(
        "Final partner build milne ke baad "
        "real PostgreSQL Products, cart, "
        "checkout aur sales history integrate hogi."
    )


def menu():

    while True:

        banner(
            "MEDSENSEAI — SUPERVISOR AI DEMO"
        )

        print(
            f"Repository: {ROOT}"
        )

        print(
            f"AI Service: {BASE_URL}"
        )

        print()

        print(
            "1. Health + Current AI Routes"
        )

        print(
            "2. LIVE Prescription Demo"
        )

        print(
            "3. LIVE DDI Demo"
        )

        print(
            "4. Sales Funnel / Lead / "
            "Analytics / Forecast Status"
        )

        print(
            "5. Engineering Test Evidence"
        )

        print(
            "6. FULL Supervisor Demo"
        )

        print(
            "0. Exit"
        )

        choice = input(
            "\nSelect option: "
        ).strip()

        try:

            if choice == "1":
                route_inventory()

            elif choice == "2":
                prescription_demo()

            elif choice == "3":
                ddi_demo()

            elif choice == "4":
                sales_status()

            elif choice == "5":
                regression_demo()

            elif choice == "6":
                full_demo()

            elif choice == "0":
                break

            else:
                print(
                    "Invalid option."
                )

        except KeyboardInterrupt:

            print(
                "\nCancelled."
            )

        except Exception as exc:

            print()

            print(
                "[DEMO ERROR]"
            )

            print(
                type(exc).__name__,
                exc,
            )

        input(
            "\nPress ENTER to return to menu..."
        )


if __name__ == "__main__":
    menu()
