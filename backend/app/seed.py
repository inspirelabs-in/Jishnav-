"""Seed the local SQLite DB with mock data for development/testing.

Run from backend/:  python -m app.seed
Wipes and recreates all tables.
"""
import random
from datetime import date, datetime, time, timedelta

from .database import Base, SessionLocal, engine
from .models import Entry, Merchant
from .utils import merchant_url

random.seed(42)

TODAY = date.today()

# (id, name, bc1, bc1_name, bc2, bc2_name, aff_id, aff_name,
#  reporting, payout, deal_type, revenue_status, owner)
MERCHANTS = [
    (2614, "1 gram jewellery", 2068, "Jewelry", 0, None, 0, None,
     "Monthly", "5%", "Coupon based", "Revenue", "Swati"),
    (1301, "10Kya", 2074, "Sporting Goods", 0, None, 0, None,
     "Monthly", "4%", "Link based", "Revenue", "Yamini"),
    (5810, "10Web", 2221, "Software and Antivirus", 0, None, 0, None,
     "60 days", "12%", "Link based", "Revenue", "Meena"),
    (4015, "11 Wickets", 2080, "Entertainment", 2081, "Games", 0, None,
     "Monthly", "Rs.150/signup", "Coupon based", "Revenue", "Swati"),
    (7105, "12Go", 2075, "Travel", 2087, "Flight", 83, "Travelpayouts",
     "Weekly", "3%", "Coupon and Link based", "Revenue", "Yamini"),
    (2847, "16 Stitches", 2079, "Fashion", 0, None, 0, None,
     "Monthly", "6%", "Coupon based", "Revenue", "Meena"),
    (3397, "1800GiftPortal", 2065, "Gifts and Flowers", 0, None, 0, None,
     "90 days", "7%", "Coupon based", "Revenue", "Swati"),
    (1165, "1mg", 2355, "Health", 2387, "Medicines", 0, None,
     "Weekly", "2.5%", "Coupon and Link based", "Revenue", "Yamini"),
    (1511, "1mglabs", 2355, "Health", 4532, "Lab Tests", 0, None,
     "Monthly", "8%", "Coupon based", "Revenue", "Meena"),
    (6180, "1Min AI", 5392, "AI Software", 0, None, 82, "Impact",
     "Monthly", "20%", "Link based", "Revenue", "Swati"),
    (7269, "1Password", 2221, "Software and Antivirus", 0, None, 0, None,
     "60 days", "25%", "Link based", "Revenue", "Yamini"),
    (462, "20Dresses", 2079, "Fashion", 2061, "Clothing", 0, None,
     "Monthly", "10%", "Coupon based", "Revenue", "Meena"),
    (7032, "20i", 2248, "Hosting", 0, None, 0, None,
     "90 days", "15%", "Link based", "Non-revenue", "Swati"),
    (5982, "2Game", 2081, "Games", 0, None, 0, None,
     "Monthly", "5%", "Coupon based", "Revenue", "Yamini"),
    (7448, "2X Nutrition", 2355, "Health", 2066, "Healthcare & Sports", 56, "Admitad",
     "2/week", "9%", "Coupon and Link based", "Revenue", "Meena"),
    (5861, "360 Total Security", 2221, "Software and Antivirus", 0, None, 0, None,
     "Monthly", "18%", "Link based", "Revenue", "Swati"),
    # Brands used in the analytics reference mocks
    (8001, "Nike", 2079, "Fashion", 2094, "Footwear", 61, "CJ",
     "Live daily", "6%", "Coupon and Link based", "Revenue", "Swati"),
    (8002, "Puma", 2079, "Fashion", 2094, "Footwear", 61, "CJ",
     "Live daily", "7%", "Coupon and Link based", "Revenue", "Yamini"),
    (8003, "Crocs", 2079, "Fashion", 2094, "Footwear", 56, "Admitad",
     "Weekly", "5%", "Coupon based", "Revenue", "Meena"),
    (8004, "Zouk", 2079, "Fashion", 2062, "Bags", 0, None,
     "Weekly", "8%", "Coupon based", "Revenue", "Swati"),
    (8005, "Myntra", 2079, "Fashion", 2061, "Clothing", 82, "Impact",
     "2/week", "4%", "Coupon and Link based", "Revenue", "Yamini"),
    (8006, "MakeMyTrip", 2075, "Travel", 2087, "Flight", 83, "Travelpayouts",
     "Weekly", "2%", "Coupon and Link based", "Revenue", "Meena"),
    # Indian brands
    (9001, "Ajio", 2079, "Fashion", 2061, "Clothing", 82, "Impact",
     "Live daily", "5%", "Coupon and Link based", "Revenue", "Swati"),
    (9002, "Flipkart", 2060, "E-Commerce", 0, None, 61, "CJ",
     "Live daily", "3%", "Coupon and Link based", "Revenue", "Yamini"),
    (9003, "Nykaa", 2070, "Beauty and Personal Care", 0, None, 56, "Admitad",
     "2/week", "7%", "Coupon based", "Revenue", "Meena"),
    (9004, "boAt", 2072, "Electronics", 2064, "Audio", 82, "Impact",
     "Weekly", "6%", "Coupon and Link based", "Revenue", "Swati"),
    (9005, "Lenskart", 2079, "Fashion", 2095, "Eyewear", 0, None,
     "Weekly", "8%", "Coupon based", "Revenue", "Yamini"),
    (9006, "Mamaearth", 2070, "Beauty and Personal Care", 0, None, 56, "Admitad",
     "2/week", "9%", "Coupon based", "Revenue", "Meena"),
    (9007, "FirstCry", 2077, "Baby and Kids", 0, None, 61, "CJ",
     "Weekly", "5%", "Coupon and Link based", "Revenue", "Swati"),
    (9008, "Tata CLiQ", 2060, "E-Commerce", 0, None, 82, "Impact",
     "3/week", "4%", "Coupon based", "Revenue", "Yamini"),
    (9009, "BigBasket", 2073, "Grocery", 0, None, 0, None,
     "Weekly", "2%", "Coupon based", "Revenue", "Meena"),
    (9010, "Croma", 2072, "Electronics", 0, None, 61, "CJ",
     "Monthly", "3.5%", "Link based", "Revenue", "Swati"),
]

# Entry cadence in days per reporting frequency
CADENCE_DAYS = {
    "Live daily": 1,
    "2/week": 3,
    "3/week": 2,
    "Weekly": 7,
    "Monthly": 30,
    "60 days": 60,
    "90 days": 90,
}

# Rough daily traffic scale per merchant (clicks/day) to make numbers look real
SCALE = {
    "Nike": 20000, "Puma": 14000, "Crocs": 9000, "Myntra": 25000, "Zouk": 4000,
    "MakeMyTrip": 15000, "1mg": 12000, "12Go": 3000, "2X Nutrition": 2500,
    "Ajio": 28000, "Flipkart": 52000, "Nykaa": 16000, "boAt": 11000,
    "Lenskart": 7000, "Mamaearth": 6500, "FirstCry": 6000, "Tata CLiQ": 14000,
    "BigBasket": 9000, "Croma": 8000,
}

# Merchants deliberately left overdue so the notification flow has data
OVERDUE_STOP_DAYS = {"Nike": 12, "1mglabs": 75, "12Go": 25}


def gen_entries(db, m: Merchant):
    cadence = CADENCE_DAYS[m.reporting]
    start = TODAY - timedelta(days=180)
    stop = TODAY - timedelta(days=OVERDUE_STOP_DAYS.get(m.merchant_name, 0))
    if m.revenue_status == "Non-revenue":
        stop = TODAY - timedelta(days=90)  # stopped collaborating ~3 months ago

    daily_clicks = SCALE.get(m.merchant_name, random.randint(800, 6000))
    cr_base = random.uniform(4, 12)          # conversion rate %
    aov = random.uniform(800, 4000)          # avg order value for GMV
    rev_rate = random.uniform(0.04, 0.12)    # revenue as share of GMV

    d = start
    while d <= stop:
        drift = 1 + random.uniform(-0.25, 0.35)
        clicks = int(daily_clicks * cadence * drift)
        sales = int(clicks * (cr_base / 100) * (1 + random.uniform(-0.2, 0.2)))
        gmv = round(sales * aov * (1 + random.uniform(-0.15, 0.15)), 2)
        revenue = round(gmv * rev_rate, 2)
        cr = round(sales / clicks * 100, 2) if clicks else None
        db.add(Entry(
            merchant_id=m.merchant_id,
            entry_date=d,
            entry_month=d.month,
            entry_year=d.year,
            clicks=clicks, sales=sales, cr=cr, gmv=gmv, revenue=revenue,
            remarks=None,
            revenue_status="Revenue",
            entered_by=m.owner,
            created_at=datetime.combine(
                d, time(random.randint(9, 18), random.randint(0, 59))
            ),
        ))
        d += timedelta(days=cadence)


def main():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        for row in MERCHANTS:
            m = Merchant(
                merchant_id=row[0], merchant_name=row[1],
                breadcrumb1=row[2], breadcrumb1_name=row[3],
                breadcrumb2=row[4], breadcrumb2_name=row[5],
                affiliate_id=row[6], affiliate_name=row[7],
                url=merchant_url(row[1]),
                reporting=row[8], payout=row[9], deal_type=row[10],
                revenue_status=row[11], owner=row[12],
            )
            db.add(m)
            gen_entries(db, m)
        db.commit()
        n_entries = db.query(Entry).count()
        print(f"Seeded {len(MERCHANTS)} merchants, {n_entries} entries.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
