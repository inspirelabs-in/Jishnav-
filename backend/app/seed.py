"""Seed the local SQLite DB with mock data for development/testing.

Run from backend/:  python -m app.seed
Wipes and recreates all tables.
"""
import random
from datetime import date, datetime, time, timedelta

from .database import Base, SessionLocal, engine
from .models import Entry, Merchant, SalesActivity, SalesLead
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
    # Never-filled brand: onboarded but no data yet, so the overdue case can be
    # walked through the escalation stages with the notification time machine.
    (9011, "TestBrandXYZ", 2079, "Fashion", 0, None, 0, None,
     "Monthly", "5%", "Coupon based", "Revenue", "Meena"),
]

# Brands deliberately left with NO entries at all (they exercise the
# "no data yet" branch of the notification flow).
NO_DATA_BRANDS = {"TestBrandXYZ"}

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
    if m.merchant_name in NO_DATA_BRANDS:
        return
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


SALES_LEADS = [
    # (brand, category, source, stage, priority, assigned, poc1_name, poc1_email, poc1_phone, poc1_desig,
    #  poc2_name, poc2_email, poc2_phone, poc2_desig, days_since_created, days_since_contact, followup_in_days)
    ("Myntra", "Fashion", "Cold outreach", "negotiating", "hot", "Sales1",
     "Rahul Verma", "rahul.v@myntra.com", "9876543210", "BD Head",
     "Priya Sen", "priya.s@myntra.com", "9876543211", "Marketing Lead",
     30, 1, 1),
    ("Zomato", "Food delivery", "Referral", "responded", "hot", "Sales1",
     "Ankit Jain", "ankit.j@zomato.com", "9123456780", "Partnerships Manager",
     None, None, None, None,
     25, 2, 3),
    ("PhonePe", "Fintech", "LinkedIn", "no_response", "warm", "Sales1",
     "Deepak Kumar", "deepak.k@phonepe.com", "9988776655", "Growth Lead",
     "Meghana R", "meghana@phonepe.com", "9988776656", "BD Associate",
     20, 5, 5),
    ("Urban Company", "Home services", "Cold outreach", "new_lead", "cold", "Sales1",
     "Sneha Patel", "sneha.p@urbancompany.com", "9112233445", "Marketing Manager",
     None, None, None, None,
     5, None, 7),
    ("Nykaa", "Beauty", "Inbound", "negotiating", "hot", "Sales2",
     "Kavita Sharma", "kavita@nykaa.com", "9001122334", "Affiliate Manager",
     "Ravi Mehra", "ravi.m@nykaa.com", "9001122335", "VP Marketing",
     45, 0, 2),
    ("MakeMyTrip", "Travel", "Event", "responded", "warm", "Sales2",
     "Sanjay Gupta", "sanjay.g@makemytrip.com", "9556677889", "Sr BD Manager",
     None, None, None, None,
     35, 4, 4),
    ("Boat", "Electronics", "Cold outreach", "responded", "warm", "Sales2",
     "Arun Nair", "arun@boat-lifestyle.com", "9667788990", "Marketing Head",
     "Divya K", "divya@boat-lifestyle.com", "9667788991", "Digital Lead",
     15, 7, 3),
    ("Lenskart", "Eyewear", "LinkedIn", "new_lead", "cold", "Sales2",
     "Pooja Reddy", "pooja.r@lenskart.com", "9778899001", "Partnerships",
     None, None, None, None,
     3, None, 7),
    ("Swiggy", "Food delivery", "Referral", "closed_won", "hot", "Sales1",
     "Vikram Singh", "vikram@swiggy.com", "9334455667", "Affiliate Head",
     "Neha Arora", "neha.a@swiggy.com", "9334455668", "BD Manager",
     60, 10, None),
    ("Pepperfry", "Furniture", "Cold outreach", "closed_lost", "cold", "Sales2",
     "Amit Desai", "amit.d@pepperfry.com", "9445566778", "Marketing Director",
     None, None, None, None,
     50, 30, None),
    ("BigBasket", "Grocery", "Inbound", "parked", "cold", "Sales1",
     "Geeta Rao", "geeta@bigbasket.com", "9556677880", "BD Lead",
     None, None, None, None,
     40, 20, None),
    ("ixigo", "Travel", "Event", "responded", "hot", "Sales1",
     "Mohit Tandon", "mohit@ixigo.com", "9667788002", "Partnerships Lead",
     "Shreya Joshi", "shreya@ixigo.com", "9667788003", "Growth Manager",
     22, 1, 2),
    ("Mamaearth", "Beauty", "LinkedIn", "no_response", "cold", "Sales2",
     "Ritika Agarwal", "ritika@mamaearth.in", "9778800112", "Brand Manager",
     None, None, None, None,
     10, 8, 5),
    ("CRED", "Fintech", "Cold outreach", "new_lead", "warm", "Sales1",
     "Varun Mehta", "varun.m@cred.club", "9889911223", "Affiliate Partnerships",
     None, None, None, None,
     2, None, 5),
    ("Flipkart", "E-commerce", "Referral", "negotiating", "hot", "Sales2",
     "Kiran Das", "kiran.d@flipkart.com", "9990022334", "Sr VP Affiliates",
     "Ananya Bhatt", "ananya@flipkart.com", "9990022335", "Program Manager",
     55, 1, 1),
]

SALES_ACTIVITIES_DATA = [
    # (lead_brand, activity_type, days_ago, summary, outcome, next_action, logged_by)
    ("Myntra", "email_sent", 28, "Sent introductory mail about GrabOn affiliate program", "Delivered", "Wait for reply", "Sales1"),
    ("Myntra", "reply_received", 20, "Rahul replied asking for commission details and traffic numbers", "Interested", "Share media kit and rate card", "Sales1"),
    ("Myntra", "call", 15, "Had a 30 min call discussing partnership terms and coupon exclusivity", "Positive", "Send proposal doc", "Sales1"),
    ("Myntra", "email_sent", 12, "Sent detailed proposal with revenue projections", "Delivered", "Follow up in 3 days", "Sales1"),
    ("Myntra", "call", 1, "Follow-up call, they are reviewing internally with finance team", "In review", "Check back Thursday", "Sales1"),

    ("Zomato", "email_sent", 22, "Reached out via Ankit after referral from Swiggy contact", "Delivered", "Wait for response", "Sales1"),
    ("Zomato", "reply_received", 15, "Ankit interested, asked about our user demographics", "Interested", "Share user data deck", "Sales1"),
    ("Zomato", "email_sent", 10, "Shared GrabOn user demographics and monthly traffic report", "Delivered", "Schedule call", "Sales1"),
    ("Zomato", "call", 2, "Discussed potential coupon campaign for monsoon season", "Positive", "Send rate card", "Sales1"),

    ("PhonePe", "email_sent", 18, "Cold outreach via LinkedIn connection to Deepak", "Delivered", "Follow up in a week", "Sales1"),
    ("PhonePe", "call", 5, "Brief call, Deepak asked us to reach out again next month", "Busy now", "Follow up 2nd week Aug", "Sales1"),

    ("Nykaa", "email_sent", 40, "Initial outreach about beauty vertical partnership", "Delivered", None, "Sales2"),
    ("Nykaa", "reply_received", 35, "Kavita responded positively, asked for a meeting", "Very interested", "Schedule meeting", "Sales2"),
    ("Nykaa", "meeting", 28, "In-person meeting at Nykaa HQ, discussed exclusive coupon program", "Aligned on terms", "Draft agreement", "Sales2"),
    ("Nykaa", "email_sent", 20, "Sent draft partnership agreement", "Delivered", "Await legal review", "Sales2"),
    ("Nykaa", "call", 10, "Legal has minor changes, mostly approved", "Almost done", "Revise and resend", "Sales2"),
    ("Nykaa", "email_sent", 5, "Sent revised agreement with legal changes", "Delivered", "Wait for signature", "Sales2"),
    ("Nykaa", "call", 0, "Kavita confirmed, signing this week", "Confirmed", "Collect signed copy", "Sales2"),

    ("MakeMyTrip", "email_sent", 30, "Met Sanjay at travel industry event, followed up via email", "Delivered", None, "Sales2"),
    ("MakeMyTrip", "reply_received", 22, "Sanjay interested in travel deals vertical", "Interested", "Share case study", "Sales2"),
    ("MakeMyTrip", "email_sent", 15, "Shared case study of ixigo partnership success", "Delivered", "Schedule demo", "Sales2"),
    ("MakeMyTrip", "whatsapp", 4, "Quick message to schedule demo call", "Replied", "Demo on Friday", "Sales2"),

    ("Boat", "email_sent", 12, "Sent introductory email about electronics vertical", "Delivered", "Follow up call", "Sales2"),
    ("Boat", "call", 7, "Spoke with Arun, he wants to discuss with Divya first", "Needs internal check", "Call back next week", "Sales2"),

    ("Swiggy", "email_sent", 55, "Initial partnership outreach", "Delivered", None, "Sales1"),
    ("Swiggy", "reply_received", 50, "Vikram replied immediately, very interested", "Very interested", None, "Sales1"),
    ("Swiggy", "meeting", 42, "Met at Swiggy office for detailed discussion", "Aligned", "Send agreement", "Sales1"),
    ("Swiggy", "email_sent", 38, "Sent partnership agreement", "Delivered", None, "Sales1"),
    ("Swiggy", "call", 25, "Agreement signed, onboarding process started", "Deal closed", None, "Sales1"),
    ("Swiggy", "note", 10, "First campaign live, 500+ coupon redemptions in week 1", "Live", None, "Sales1"),

    ("Pepperfry", "email_sent", 45, "Reached out about furniture deals partnership", "Delivered", None, "Sales2"),
    ("Pepperfry", "call", 38, "Call with Amit, not interested at this time due to budget cuts", "Not interested", "Park for Q4", "Sales2"),
    ("Pepperfry", "email_sent", 30, "Follow-up with revised lower-commitment proposal", "No reply", "Move to closed lost", "Sales2"),

    ("ixigo", "email_sent", 20, "Outreach after travel industry meet", "Delivered", None, "Sales1"),
    ("ixigo", "reply_received", 14, "Mohit very enthusiastic about coupon partnerships", "Very interested", "Share proposal", "Sales1"),
    ("ixigo", "email_sent", 8, "Sent detailed proposal with travel vertical performance data", "Delivered", "Follow up call", "Sales1"),
    ("ixigo", "call", 1, "Great call with both Mohit and Shreya, moving to negotiation soon", "Positive", "Send final terms", "Sales1"),

    ("Mamaearth", "email_sent", 10, "Reached out to Ritika via LinkedIn connection about beauty vertical", "Delivered", "Follow up in a week", "Sales2"),
    ("Mamaearth", "whatsapp", 8, "Sent follow-up WhatsApp to Ritika, no reply yet", "No reply", "Try again in 5 days", "Sales2"),

    ("Flipkart", "email_sent", 50, "Approached Kiran through referral network", "Delivered", None, "Sales2"),
    ("Flipkart", "reply_received", 42, "Kiran interested, connected us with Ananya", "Interested", "Set up call with both", "Sales2"),
    ("Flipkart", "meeting", 30, "Video call with Kiran and Ananya about affiliate program expansion", "Very positive", "Send proposal", "Sales2"),
    ("Flipkart", "email_sent", 22, "Detailed proposal with tiered commission structure", "Delivered", "Follow up", "Sales2"),
    ("Flipkart", "call", 10, "They want to pilot with 50 brands first", "Negotiating pilot", "Revise scope for pilot", "Sales2"),
    ("Flipkart", "email_sent", 3, "Sent revised pilot scope proposal", "Delivered", "Await final approval", "Sales2"),
    ("Flipkart", "whatsapp", 1, "Ananya confirmed pilot scope looks good, final sign-off pending", "Almost there", "Call Friday for sign-off", "Sales2"),
]


def seed_sales(db):
    """Seed sales pipeline with demo leads and activities."""
    leads_by_brand = {}
    for row in SALES_LEADS:
        (brand, category, source, stage, priority, assigned,
         p1n, p1e, p1p, p1d, p2n, p2e, p2p, p2d,
         days_created, days_contact, followup_days) = row
        lead = SalesLead(
            brand_name=brand, category=category, source=source,
            stage=stage, priority=priority, assigned_to=assigned,
            poc1_name=p1n, poc1_email=p1e, poc1_phone=p1p, poc1_designation=p1d,
            poc2_name=p2n, poc2_email=p2e, poc2_phone=p2p, poc2_designation=p2d,
            last_contact_date=(
                datetime.combine(TODAY - timedelta(days=days_contact), time(14, 0))
                if days_contact is not None else None
            ),
            next_followup=(
                TODAY + timedelta(days=followup_days)
                if followup_days is not None else None
            ),
            created_at=datetime.combine(TODAY - timedelta(days=days_created), time(10, 0)),
        )
        db.add(lead)
        db.flush()
        leads_by_brand[brand] = lead

    for row in SALES_ACTIVITIES_DATA:
        brand, atype, days_ago, summary, outcome, next_action, logged_by = row
        lead = leads_by_brand.get(brand)
        if not lead:
            continue
        db.add(SalesActivity(
            lead_id=lead.id,
            activity_type=atype,
            activity_date=datetime.combine(
                TODAY - timedelta(days=days_ago),
                time(random.randint(9, 18), random.randint(0, 59)),
            ),
            summary=summary,
            outcome=outcome,
            next_action=next_action,
            logged_by=logged_by,
            created_at=datetime.combine(
                TODAY - timedelta(days=days_ago),
                time(random.randint(9, 18), random.randint(0, 59)),
            ),
        ))


def main():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        for row in MERCHANTS:
            onboarded = TODAY - timedelta(days=200)
            if row[1] in NO_DATA_BRANDS:
                onboarded = datetime.combine(
                    date(TODAY.year, TODAY.month, 1), time(10, 0)
                )
            else:
                onboarded = datetime.combine(onboarded, time(10, 0))
            m = Merchant(
                merchant_id=row[0], merchant_name=row[1],
                breadcrumb1=row[2], breadcrumb1_name=row[3],
                breadcrumb2=row[4], breadcrumb2_name=row[5],
                affiliate_id=row[6], affiliate_name=row[7],
                url=merchant_url(row[1]),
                reporting=row[8], payout=row[9], deal_type=row[10],
                revenue_status=row[11], owner=row[12],
                created_at=onboarded,
            )
            db.add(m)
            gen_entries(db, m)
        seed_sales(db)
        db.commit()
        n_entries = db.query(Entry).count()
        n_leads = db.query(SalesLead).count()
        n_acts = db.query(SalesActivity).count()
        print(f"Seeded {len(MERCHANTS)} merchants, {n_entries} entries, "
              f"{n_leads} sales leads, {n_acts} activities.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
