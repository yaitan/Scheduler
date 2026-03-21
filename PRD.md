# Tutoring Scheduler — Product Requirements Document

## 1. Overview
A personal web app for managing my tutoring business. Replaces a 
Google Sheets workflow with a purpose-built tool for tracking sessions, 
clients, and payments. Designed primarily for my own use, with plans 
to extend access to my wife in a future version so we can both view 
and edit the schedule.

## 2. Goals
- View and manage tutoring sessions in various calendar formats: Monthly and Weekly.
- Allows simple input of sessions, clients, and payments.
- Data is saved and synced so it's accessible from any device at any time
- Accessible from any browser, no installation or downloading required

## 3. Non-Goals
- No student-facing portal (students can't log in or book sessions themselves)
- No automated invoicing or payment processing (tracking payments only, not collecting them)
- No mobile app (web only, at least for now)
- No multi-user access in v1 (your wife's access is a future feature)

## 4. Target User
The primary user is myself — a tutor managing a personal client base. 
I need quick access to my schedule, client info, and payment tracking 
from any browser. In a future version, my wife will also have full 
access to view and edit the schedule, requiring a simple multi-user 
login system.

## 5. Features & Requirements

### 5.1 Must Have (v1)
A calendar with a toggle between weekly and monthly views, that includes Israeli Jewish national holidays
An input form for scheduling session that includes: date, time, client, duration, status (Scheduled, Completed, Cancelled)
An input form for payments that includes: date, client, amount, method, receipt/invoice number (optional)
A client view that shows: name, total sessions, scheduled session, pending payment, rate, paid ahead
Hosted on a web server
Monthly summary: total earned, scheduled, owed
Payments allow for paying ahead for future session

### 5.2 Nice to Have
a way to track cancelled sessions and reasons
- Recurring session support: ability to mark a client as 
  weekly recurring at a set time, auto-generating future 
  sessions on the calendar
Tutoring related events: important test days, year start / end

### 5.3 Future / Out of Scope
Login for me and my wife
Create reciepts, payment requests
Per-session rate override history (tracking when and why a client's rate changed over time)
Monthly report: total cancellations, relative income, analysis

## 6. User Interface & Experience

### General
- Default color scheme is dark mode
- Sidebar navigation (hidden by default, opened via hamburger 
  menu button) with links to: Clients, Payments

### Calendar — Month View (Default Screen)
- Gregorian calendar, Sunday as first day of the week
- Jewish holidays displayed on the calendar
- Sessions appear as labeled rectangles showing client name only 
  (no time shown), sorted top to bottom by time within each day
- Monthly summary always visible: total monthly revenue, total 
  owed, total hours scheduled
- Previous/Next buttons to navigate between months
- Each week row is clickable → opens Week View
- Each day cell is clickable → opens Day View
- Dedicated button to open the Add Session form (present on all screens)

### Calendar — Week View
- Displays a single week, days are larger
- Events show client name and time
- Divided into hour blocks to visualize the day layout
- Previous/Next buttons to navigate between weeks
- Exiting Week View returns to the Month View of that same week
- Back button → returns to Month View
- Each day is clickable → opens Day View

### Calendar — Day View
- Displays as an enlarged overlay/modal over the current view
- Previous/Next buttons to navigate between days
- Exiting Day View returns to the Week or Month View that 
  contains that day
- Events are clickable → opens Edit Session form
- Clicking a blank time slot → opens Add Session form
- X button to close and return to previous view

### Clients Page
- Lists all existing clients
- Button to add a new client
- Clicking a client → opens client profile showing: name, 
  per-session rate, total sessions, upcoming sessions, 
  pending payments

### Payments Page
- Lists each client with their outstanding balance
- Shows payment history
- Clicking a client → opens payment input window for logging 
  a payment (no payment processing)

### Input Forms

#### Add/Edit Session Form
- Fields: Client (dropdown from Clients table), Date, Time, 
  Duration
- If opened from Day View: Date defaults to the clicked date
- If opened from Month or Week View via dedicated button: 
  Month defaults to current view, no date pre-filled
- For weeks spanning two months: defaults to the earlier month
- Editing sessions allows editing status, otherwise set to Scheduled
- Status is color coded:
  - Scheduled: Blue
  - Completed: Green
  - Cancelled: TBD (see Open Questions)
- Sessions with status "Scheduled" automatically change to 
  "Completed" once the session end time has passed

#### Add Payment Form
- Fields: Client (dropdown from Clients table), Date, Amount, 
  Method (PayBox | Bit | Transfer | Cash | Other), 
  Receipt/Invoice number (optional)
- Date defaults to current date, editable

### Data Validation
- **Scheduling overlap** (sessions only): Error — blocks 
  submission until resolved
- **Past date entered**: Warning — allows submission after 
  acknowledgement
- **Unreasonable time** (between 11pm and 7am): Warning — 
  allows submission after acknowledgement

## 7. Technical Requirements
- **Platform:** Web app, locally hosted for beta/development
- **Frontend:** React (JavaScript, HTML, CSS)
- **Backend:** Node.js with Express
- **Database:** SQLite — sufficient for personal-scale use, 
  hosting compatibility to be confirmed before production 
  deployment
- **Hosting:** Local for v1 beta, cloud hosting deferred to 
  future scope
- **Browser Support:** Any modern browser (Chrome, Firefox, Edge)

## 8. Data Model

### Clients
- **Primary Key:** Client Name
- Rate (per session)
- Phone number
- Parent phone number
- *Derived:* Total owed, total hours, upcoming sessions — 
  calculated from Sessions and Payments tables at query time

### Sessions
- **Primary Key:** Client name + Date + Time
- Duration
- Status: Scheduled | Completed | Cancelled

### Payments
- **Primary Key:** Client name + Date
- Amount
- Method: PayBox | Bit | Transfer | Cash | Other
- Receipt/Invoice number (optional)

## 9. Open Questions

1. **Hosting platform** — which service to use when moving 
   from local beta to live. To be decided before v2.

2. **Authentication** — how login will work when wife's access 
   is added in v2.

3. **Jewish holidays data source** — API, static list, or 
   library? Needs to be decided before building the calendar.

4. **Recurring sessions** — exact behavior when a recurring 
   session is cancelled or changed. Does it affect all future 
   sessions or just that one instance?

5. **Payment total calculation** — confirmed: total owed is 
   derived from Sessions and Payments tables at query time, 
   not stored in Clients table.

6. **Client primary key** — using Client Name as the primary 
   key rather than a generated ID. Acceptable at current scale 
   where no two clients share a name. Revisit if this 
   assumption ever breaks.

7. **Cancelled session display** — debating between grey, red, 
   crossed out, or moved to bottom of day view. May eventually 
   need two distinct cancelled statuses: one where the slot is 
   available for rescheduling, and one where it isn't.

8. **Automatic session status update timing** — status updates 
   from Scheduled to Completed will be handled lazily: 
   triggered on page load, refresh, or any DB query/update. 
   No background timer needed.