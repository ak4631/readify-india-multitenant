Yes. I understand the product as a **multi-category marketplace/platform** where your internal/admin team onboards and manages physical vendors, while the consumer app later lets users discover, review, book, and purchase services from those vendors.

The important architectural decision is: **do not build 4 completely separate systems.** Build a common vendor foundation and then add category-specific modules.

# Instruction We must only Focus on Building Web application not on app
# Use Nextjs for Frontend 
# Will be Using Supabase for Backend with Prisma - .env is been provided 

---

# 1. Product Structure

Think of the system as:

```text
                    ADMIN PORTAL
                         │
                         ▼
                Vendor Onboarding
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
       Library          Gym        Study Cafe
          │              │              │
          └──────────────┬──────────────┘
                         │
                         ▼
                    Exam Hub
                         │
                         ▼
                    USER APP
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
       Discover        Booking       Reviews
       Vendors         /Plans        /Ratings
```

I would structure the backend around these major domains:

```text
Authentication
Users
Vendors
Vendor Categories
Vendor Profiles
Facilities
Plans
Schedules
Slots
Bookings
Payments
Reviews
Media
Trainers
Teachers
Courses / Lectures
Notifications
Admin / RBAC
Audit Logs
```

---

# 2. Admin Portal Screens

I would **not start with vendor onboarding immediately**.

First build the administrative foundation.

## A. Authentication

### Screen 1 — Admin Login

```text
┌─────────────────────────────────┐
│             LOGO                │
│                                 │
│       Admin Portal Login        │
│                                 │
│ Email                           │
│ [________________________]      │
│                                 │
│ Password                        │
│ [________________________]      │
│                                 │
│ [        Login        ]         │
│                                 │
│ Forgot Password?                │
└─────────────────────────────────┘
```

Later:

* Email OTP
* 2FA
* Google/Microsoft login if required
* Session management

---

# 3. Admin Dashboard

After login:

```text
Dashboard

┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│ Vendors    │ │ Pending    │ │ Users      │ │ Bookings   │
│ 1,248      │ │ 32         │ │ 15,420     │ │ 8,421      │
└────────────┘ └────────────┘ └────────────┘ └────────────┘

Vendor Distribution

Library       █████████████ 420
Gym           █████████     310
Study Cafe    ███████       210
Exam Hub      █████████     308

Recent Vendors
------------------------------------------------
Vendor       Category      Status      Action
ABC Library  Library       Pending     Review
XYZ Gym      Gym            Approved    View
...
```

Dashboard metrics:

* Total Vendors
* Active Vendors
* Pending Vendors
* Rejected Vendors
* Total Users
* Total Bookings
* Revenue
* Reviews
* Popular categories
* Recent registrations

---

# 4. Vendor Management

This should be one of the biggest modules.

### Screen

```text
Vendors

[+ Add Vendor]

Search Vendor __________________

Category       Status       City       Date

----------------------------------------------------
ABC Library    Library       Active     Mumbai
XYZ Gym        Gym           Pending    Navi Mumbai
Study Cafe     Study Cafe    Active     Pune
...
```

Filters:

* Category
* Status
* City
* Created date
* Verification status
* Rating

Actions:

```text
View
Edit
Approve
Reject
Suspend
Delete
```

---

# 5. Vendor Onboarding

This is where I recommend a **wizard** rather than one giant form.

```text
Vendor Onboarding

① Basic Information
② Contact & Location
③ Verification
④ Facilities
⑤ Plans
⑥ Timings
⑦ Photos
⑧ Category Details
⑨ Review
⑩ Publish
```

This makes the system much easier to use.

---

# 6. Step 1 — Basic Vendor Information

Common for every category:

```text
Vendor Category *

○ Library
○ Gym
○ Study Cafe
○ Exam Hub

Vendor Name *
[________________________]

Description
[________________________]

Phone *
[________________________]

Email
[________________________]

Website
[________________________]
```

---

# 7. Step 2 — Address

```text
Address

Address Line 1 *
Address Line 2

City *
State *
Pincode *

Latitude
Longitude

[Pick Location From Map]
```

Store coordinates.

This becomes very important later for the mobile app:

```text
Find vendors near me
```

---

# 8. Step 3 — Verification

Instead of storing arbitrary "proof" fields, create a proper verification system.

Possible documents:

```text
Business Registration
GST Certificate
PAN
Owner ID
Address Proof
Other Documents
```

But don't force every document for every category.

Example:

### Library

```text
Business Registration
Address Proof
Owner Verification
```

### Gym

```text
Business Registration
Address Proof
Owner Verification
Trainer Certifications
```

### Exam Hub

```text
Business Registration
Address Proof
Owner Verification
Educational/Business Documents
```

The admin should see:

```text
Verification Status

○ Pending
○ Under Review
○ Verified
○ Rejected
```

---

# 9. Step 4 — Facilities

This should be **dynamic**, not hardcoded into the vendor table.

Create a facility master:

```text
Facility
----------------
AC
WiFi
Parking
Power Backup
CCTV
Drinking Water
Washroom
Locker
24x7
Food
Beverages
...
```

Then map facilities to vendors.

For example:

```text
ABC Library

Facilities

☑ AC
☑ WiFi
☑ CCTV
☑ Power Backup
☐ Parking
☑ Drinking Water
```

For Study Cafe:

```text
☑ AC
☑ WiFi
☑ Food
☑ Beverages
☑ Charging Points
```

---

# 10. Step 5 — Membership Plans

This should also be generic.

Example Library:

```text
Monthly Plan
₹1,500

Duration: 30 Days
Access: 8 AM - 10 PM
Seat Type: General
```

Gym:

```text
Monthly
₹2,000

Quarterly
₹5,000

Yearly
₹15,000
```

Study Cafe:

```text
Daily
₹150

Monthly
₹2,500

Unlimited
₹4,000
```

So your plan table shouldn't contain:

```text
library_price
gym_price
study_cafe_price
```

Instead:

```text
vendor_id
name
description
price
duration
duration_unit
status
```

---

# 11. Step 6 — Timings

Vendor operating hours:

```text
Monday       06:00 AM - 11:00 PM
Tuesday      06:00 AM - 11:00 PM
Wednesday    06:00 AM - 11:00 PM
...
```

But there is an important distinction:

### Operating Hours ≠ Booking Slots

For example:

```text
Library

Operating Hours:
8 AM - 10 PM

Slot:
8 AM - 10 AM → Capacity 50
10 AM - 12 PM → Capacity 50
12 PM - 2 PM → Capacity 50
...
```

Therefore create separate concepts.

---

# 12. Slot Management

Admin screen:

```text
Schedule

Date: 12 Sept 2026

08:00 - 10:00     Capacity 50
Booked: 32        Available: 18

10:00 - 12:00     Capacity 50
Booked: 41        Available: 9

12:00 - 02:00     Capacity 50
Booked: 50        FULL
```

This becomes the foundation of your booking system.

---

# 13. Photos / Media

Vendor:

```text
Photos

[ + Upload ]

┌──────┐ ┌──────┐ ┌──────┐
│ IMG  │ │ IMG  │ │ IMG  │
└──────┘ └──────┘ └──────┘

Cover Photo
Gallery
```

Database stores metadata; actual files should live in object storage.

For example:

```text
vendor_media
----------------
vendor_id
media_url
type
sort_order
is_primary
```

---

# 14. Reviews

Admin:

```text
Reviews

ABC Library

⭐ 4.5

User       Rating       Review          Status
Rahul      ⭐⭐⭐⭐⭐      Great place      Visible
Amit       ⭐⭐           Bad experience   Hidden
...
```

Admin actions:

```text
View
Hide
Delete
Restore
```

I would strongly recommend **soft deletion/moderation**, rather than physically deleting reviews.

---

# 15. Category-Specific Modules

Now comes the important part.

---

## LIBRARY

Common vendor modules:

```text
Profile
Facilities
Plans
Timings
Slots
Photos
Reviews
```

Library-specific:

```text
Seat Types
Seat Capacity
Study Environment
Amenities
```

Potentially:

```text
General Seat
Premium Seat
Cabin
AC Seat
Non-AC Seat
```

Example:

```text
Seat Configuration

General Seats       40
Premium Seats       10
Cabins              5
```

---

# 16. GYM

Common:

```text
Profile
Facilities
Plans
Timings
Slots
Photos
Reviews
```

Gym-specific:

```text
Trainers
Trainer Plans
Trainer Availability
Trainer Specializations
```

### Trainer Management

```text
Trainers

[+ Add Trainer]

Name
Profile Photo
Bio
Experience
Specialization
Pricing
Availability
Status
```

Trainer:

```text
Personal Training
₹800 / session

Availability

Mon  6AM - 10AM
Mon  5PM - 9PM

Tue  6AM - 10AM
...
```

---

# 17. STUDY CAFE

Study Cafe can reuse almost everything from Library.

```text
Profile
Facilities
Plans
Timings
Slots
Photos
Reviews
```

Additional:

```text
Food Menu
Beverages
Food Pricing
Availability
```

For example:

```text
Food & Beverage

Coffee
₹80

Cold Coffee
₹120

Sandwich
₹150
```

I would **not put food into `facilities`**.

"Food Available" is a facility.

Actual food items should have a separate:

```text
menus
menu_items
```

structure.

---

# 18. EXAM HUB

This is where your architecture needs to become flexible.

Common:

```text
Profile
Facilities
Plans
Timings
Photos
Reviews
```

Exam Hub-specific:

```text
Teachers
Subjects
Courses
Batches
Lectures
Schedules
Online/Offline
```

Example:

```text
Course

JEE Mathematics

Teacher:
Rahul Sharma

Mode:
Offline

Duration:
6 Months

Price:
₹25,000
```

Then:

```text
Batch

JEE Mathematics - Morning Batch

Monday
08:00 - 10:00

Wednesday
08:00 - 10:00

Friday
08:00 - 10:00
```

---

# 19. Online / Offline Lectures

You can support:

```text
Mode

○ Offline
○ Online
○ Hybrid
```

For online:

```text
Meeting URL
Recording URL
Platform
```

Don't expose the actual meeting URL publicly if you want controlled access. Store it securely and return it only to authorized users.

---

# 20. User Registration

Now let's design the consumer side foundation even though we're focusing on admin.

### User Registration

```text
Register

Name
Mobile Number
Email
Password

[Create Account]
```

I would actually make **mobile number + OTP** the primary authentication method for the Indian market.

```text
Mobile Number
+91 XXXXX XXXXX

[Send OTP]

OTP
_ _ _ _ _ _

[Verify]
```

Then profile:

```text
Name
Email
Phone
Profile Photo
City
Date of Birth
```

Avoid asking users for too much information during registration.

---

# 21. User Roles

You have at least:

```text
SUPER_ADMIN
ADMIN
VENDOR_MANAGER
SUPPORT
CONTENT_MODERATOR
```

Potentially later:

```text
VENDOR_OWNER
VENDOR_STAFF
TRAINER
TEACHER
USER
```

But don't create all these roles on day one unless required.

---

# 22. Database Architecture

Now the important part.

I recommend **PostgreSQL**.

Don't create:

```text
libraries
gyms
study_cafes
exam_hubs
```

as four completely independent top-level databases/tables.

Instead:

```text
vendors
   │
   ├── vendor_profiles
   ├── vendor_facilities
   ├── vendor_plans
   ├── vendor_schedules
   ├── vendor_media
   ├── reviews
   │
   ├── library_details
   ├── gym_details
   ├── study_cafe_details
   └── exam_hub_details
```

This gives you a much cleaner architecture.

---

# 23. Core Database Schema

## users

```sql
users
-------------------------
id UUID PK
name
email
phone
password_hash
status
created_at
updated_at
```

---

## roles

```sql
roles
-------------------------
id
name
```

Example:

```text
SUPER_ADMIN
ADMIN
MODERATOR
SUPPORT
USER
```

---

## user_roles

```sql
user_roles
-------------------------
user_id FK
role_id FK
```

---

# 24. vendors

This is the heart of the system.

```sql
vendors
-------------------------
id UUID PK
name
slug
category_id FK
description

phone
email
website

status
verification_status

created_by
approved_by

created_at
updated_at
```

Category:

```sql
vendor_categories
-------------------------
id
name
slug
```

Data:

```text
1 | Library
2 | Gym
3 | Study Cafe
4 | Exam Hub
```

---

# 25. vendor_addresses

Don't put every address field inside vendors.

```sql
vendor_addresses
-------------------------
id
vendor_id FK
address_line_1
address_line_2
city
state
country
pincode
latitude
longitude
```

This also gives you flexibility later if a vendor has multiple locations.

---

# 26. vendor_verifications

```sql
vendor_verifications
-------------------------
id
vendor_id FK
document_type
document_number
document_url
status
verified_by
verified_at
rejection_reason
created_at
```

---

# 27. Facilities

```sql
facilities
-------------------------
id
name
category
icon
status
```

Then:

```sql
vendor_facilities
-------------------------
vendor_id FK
facility_id FK
```

This is a many-to-many relationship.

---

# 28. Plans

```sql
membership_plans
-------------------------
id
vendor_id FK

name
description

price
currency

duration_value
duration_unit

status

created_at
updated_at
```

Example:

```text
Monthly
30
days

Quarterly
3
months
```

---

# 29. Schedules

```sql
vendor_schedules
-------------------------
id
vendor_id FK

day_of_week
open_time
close_time

is_closed
```

---

# 30. Booking Slots

```sql
vendor_slots
-------------------------
id
vendor_id FK
schedule_id FK

start_time
end_time

capacity
status
```

But for actual date-based booking, I would eventually make slots date-aware:

```sql
booking_slots
-------------------------
id
vendor_id
slot_date
start_time
end_time
capacity
available_capacity
status
```

This makes booking concurrency much easier to manage.

---

# 31. Bookings

```sql
bookings
-------------------------
id UUID PK

user_id FK
vendor_id FK
plan_id FK
slot_id FK

booking_date

amount
status

created_at
updated_at
```

Status:

```text
PENDING
CONFIRMED
CANCELLED
COMPLETED
EXPIRED
```

---

# 32. Vendor Media

```sql
vendor_media
-------------------------
id
vendor_id FK

media_url
media_type

is_primary
sort_order

created_at
```

---

# 33. Reviews

```sql
reviews
-------------------------
id UUID PK

vendor_id FK
user_id FK
booking_id FK

rating
review_text

status

created_at
updated_at
```

Status:

```text
PUBLISHED
HIDDEN
DELETED
FLAGGED
```

---

# 34. Gym Tables

```sql
trainers
-------------------------
id
vendor_id
name
bio
experience_years
profile_photo
status
```

Trainer specialization:

```sql
trainer_specializations
-------------------------
id
name
```

Mapping:

```sql
trainer_specialization_map
-------------------------
trainer_id
specialization_id
```

Trainer pricing:

```sql
trainer_pricing
-------------------------
id
trainer_id
price
duration
duration_unit
```

Trainer availability:

```sql
trainer_availability
-------------------------
id
trainer_id
day_of_week
start_time
end_time
```

---

# 35. Study Cafe Tables

```sql
study_cafe_details
-------------------------
id
vendor_id
seating_capacity
```

Food:

```sql
menu_categories
-------------------------
id
vendor_id
name
```

```sql
menu_items
-------------------------
id
category_id
name
description
price
image_url
is_available
```

---

# 36. Exam Hub Tables

```sql
exam_hub_details
-------------------------
id
vendor_id
description
```

Teachers:

```sql
teachers
-------------------------
id
vendor_id
name
bio
experience_years
profile_photo
status
```

Subjects:

```sql
subjects
-------------------------
id
name
```

Courses:

```sql
courses
-------------------------
id
vendor_id
name
description
price
duration
mode
status
```

Course teachers:

```sql
course_teachers
-------------------------
course_id
teacher_id
```

Lectures:

```sql
lectures
-------------------------
id
course_id
teacher_id

title
description

mode
start_time
end_time

meeting_url
recording_url

status
```

---

# 37. Admin Permissions

This is something I'd build early.

Instead of:

```text
if user.role == "admin"
```

everywhere, use permissions.

```text
vendor.create
vendor.read
vendor.update
vendor.delete
vendor.approve

review.read
review.delete

user.read
user.suspend

trainer.create
trainer.update

course.create
course.update
```

Then:

```text
SUPER_ADMIN
    ↓
All permissions

ADMIN
    ↓
Most permissions

CONTENT_MODERATOR
    ↓
Reviews + Media

SUPPORT
    ↓
Users + Bookings
```

This will save you pain later.

---

# 38. Audit Logs

For an admin system, **this is very important**.

Suppose an admin deletes a review.

You need to know:

```text
Who?
What?
When?
From where?
```

Table:

```sql
audit_logs
-------------------------
id
user_id

action
entity_type
entity_id

old_value
new_value

ip_address
created_at
```

Example:

```text
Akash
DELETE_REVIEW
review
#1234
09 Sept 2026 12:31 PM
```

---

# 39. Recommended Admin Sidebar

I would make the initial UI:

```text
┌──────────────────────────┐
│ LOGO                     │
│                          │
│ Dashboard                │
│                          │
│ Vendors                  │
│   ├─ All Vendors         │
│   ├─ Pending Approval    │
│   └─ Add Vendor          │
│                          │
│ Users                    │
│                          │
│ Bookings                 │
│                          │
│ Reviews                  │
│                          │
│ Categories               │
│ Facilities               │
│                          │
│ Trainers                 │
│ Teachers                 │
│ Courses                  │
│                          │
│ Media                    │
│                          │
│ Reports                  │
│                          │
│ Admin Users              │
│ Roles & Permissions      │
│                          │
│ Audit Logs               │
│                          │
│ Settings                 │
└──────────────────────────┘
```

But some items can remain hidden until their category is relevant.

For example:

```text
Trainers
```

only becomes prominent when Gym management is being used.

---

# 40. Vendor Detail Page

This should probably be your most important admin screen.

```text
ABC Fitness

Gym
⭐ 4.6
Active

[Edit] [Suspend] [...]

────────────────────────────────────

Overview | Profile | Facilities | Plans
Schedule | Trainers | Photos | Reviews
Verification | Audit

────────────────────────────────────

Profile

Name:
ABC Fitness

Address:
...

Phone:
...

Verification:
✓ Verified

────────────────────────────────────
```

Use tabs instead of forcing everything onto one page.

---

# 41. Vendor Lifecycle

I would define a proper state machine.

```text
DRAFT
  ↓
SUBMITTED
  ↓
UNDER_REVIEW
  ↓
APPROVED
  ↓
PUBLISHED
  ↓
SUSPENDED
```

Rejection:

```text
UNDER_REVIEW
      ↓
   REJECTED
      ↓
   DRAFT
```

This is much better than simply having:

```text
is_active = true
```

---

# 42. User → Vendor → Booking Flow

Eventually your entire platform becomes:

```text
USER
 │
 ├── Search
 │
 ▼
VENDOR
 │
 ├── View Profile
 ├── Facilities
 ├── Plans
 ├── Timings
 ├── Photos
 ├── Reviews
 │
 ▼
PLAN / SLOT
 │
 ▼
BOOKING
 │
 ▼
PAYMENT
 │
 ▼
CONFIRMATION
 │
 ▼
SERVICE
 │
 ▼
REVIEW
```

And the Admin Portal observes/manages this entire lifecycle.

---

# 43. API Structure

If you're using Node.js/Express/NestJS or Go, keep APIs domain-oriented.

For example:

```text
/api/v1/auth

/api/v1/admin/dashboard

/api/v1/admin/vendors
/api/v1/admin/vendors/:id
/api/v1/admin/vendors/:id/verification
/api/v1/admin/vendors/:id/facilities
/api/v1/admin/vendors/:id/plans
/api/v1/admin/vendors/:id/schedules
/api/v1/admin/vendors/:id/media
/api/v1/admin/vendors/:id/reviews

/api/v1/admin/trainers
/api/v1/admin/teachers
/api/v1/admin/courses

/api/v1/users
/api/v1/bookings
/api/v1/reviews
```

---

# 44. Frontend Architecture

For the Admin Portal I'd go with:

```text
Next.js
TypeScript
Tailwind
shadcn/ui
React Hook Form
Zod
TanStack Query
```

Structure:

```text
app/
├── login/
├── dashboard/
├── vendors/
│   ├── page.tsx
│   ├── new/
│   └── [id]/
│       ├── page.tsx
│       ├── profile/
│       ├── facilities/
│       ├── plans/
│       ├── schedules/
│       ├── media/
│       ├── reviews/
│       ├── trainers/
│       └── verification/
├── users/
├── bookings/
├── reviews/
├── trainers/
├── teachers/
├── courses/
└── settings/
```

---

# 45. MVP — Don't Build Everything at Once

This is where I'd be strict with you.

Don't start by building:

> Library + Gym + Cafe + Exam Hub + Payments + App + Analytics + Trainers + Teachers

That's going to become a huge system before you validate the marketplace.

### Phase 1 — Admin Foundation

Build:

```text
Authentication
RBAC
Dashboard
Users
Vendor Categories
Vendor CRUD
Vendor Verification
```

### Phase 2 — Common Vendor Management

```text
Profile
Address
Facilities
Photos
Timings
Plans
Reviews
```

### Phase 3 — Booking

```text
Slots
Capacity
Bookings
Booking Management
```

### Phase 4 — Category Modules

```text
Library
  └── Seats

Gym
  └── Trainers

Study Cafe
  └── Menu

Exam Hub
  ├── Teachers
  ├── Courses
  └── Lectures
```

### Phase 5 — Consumer App

```text
Registration
Location
Search
Filters
Vendor Profile
Plans
Booking
Payment
Reviews
```

---

# 46. One Important Architectural Principle

Your database should look conceptually like this:

```text
                         VENDOR
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
       ▼                   ▼                   ▼
   COMMON DATA        COMMON SERVICES     CATEGORY DATA
       │                   │                   │
       │                   │                   ├── Library
       │                   │                   │    └── Seats
       │                   │                   │
       │                   │                   ├── Gym
       │                   │                   │    └── Trainers
       │                   │                   │
       │                   │                   ├── Study Cafe
       │                   │                   │    └── Menu
       │                   │                   │
       │                   │                   └── Exam Hub
       │                   │                        ├── Teachers
       │                   │                        ├── Courses
       │                   │                        └── Lectures
       │                   │
       ├── Profile
       ├── Address
       ├── Media
       ├── Verification
       ├── Facilities
       └── Reviews
                           │
                           ├── Plans
                           ├── Schedules
                           ├── Slots
                           └── Bookings
```

That gives you a **single platform architecture** rather than four applications disguised as one.

### My recommended first database ERD

```text
users ────────< bookings >──────── vendors
  │                                  │
  │                                  ├──── vendor_addresses
  │                                  ├──── vendor_verifications
  │                                  ├──── vendor_media
  │                                  ├──── vendor_facilities >──── facilities
  │                                  ├──── membership_plans
  │                                  ├──── vendor_schedules
  │                                  ├──── booking_slots
  │                                  ├──── reviews
  │                                  │
  │                                  ├──── library_details
  │                                  ├──── gym_details
  │                                  │         └──── trainers
  │                                  │
  │                                  ├──── study_cafe_details
  │                                  │         └──── menu_items
  │                                  │
  │                                  └──── exam_hub_details
  │                                            ├──── teachers
  │                                            ├──── courses
  │                                            └──── lectures
  │
  └──── user_roles >──── roles
```

**This is the foundation I'd build before writing the UI.**

The next useful step is to turn this into a **proper production-ready PostgreSQL schema with all columns, PK/FK relationships, indexes, enums, constraints, and ER diagram**, and then map **every Admin screen → API → DB table** so you can start implementing without redesigning the architecture halfway through.
