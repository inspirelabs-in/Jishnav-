import re


def merchant_url(name: str) -> str:
    """Mock storefront URL derived from the merchant name.

    "MakeMyTrip" -> https://www.makemytrip.com/ ; "2X Nutrition" -> .../2xnutrition
    """
    slug = re.sub(r"[^a-z0-9]+", "", name.lower())
    return f"https://www.{slug or 'merchant'}.com/"
