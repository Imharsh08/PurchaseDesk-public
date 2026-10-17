# PurchaseDesk MVP - Purchase Management System

## Executive Summary
PurchaseDesk is a cloud-based purchase management platform for manufacturing industries, designed to streamline procurement workflows from indenting through goods receipt, with real-time visibility across all purchase lifecycle stages.

**Target Users:** Procurement Officers, Managers, Vendors, Warehouse Staff  
**Core Value:** Centralized purchase tracking, vendor comparison, compliance enforcement, and performance metrics

---

## Phase 1: Core Foundation (Weeks 1-4)

### 1.1 Core Data Models
```
├── Indent Management
│   └── Indent (ID, Department, ItemList, CreatedDate, Status, Requestor)
│
├── Item & Catalog
│   └── Item (ID, SKU, Description, UOM, Category, Specs)
│
├── Vendor Management
│   └── Vendor (ID, Name, Location, ContactPerson, Phone, Email, 
│              PaymentTerms, DeliveryPerformanceRating)
│
├── Quotation
│   └── Quotation (ID, IndentID, VendorID, Price, DeliveryDays, 
│                 Quality Rating, CreatedDate, Status)
│
└── Purchase Order (PO)
    └── PO (ID, IndentID, SelectedQuotationID, VendorID, TotalValue, 
          ApprovalDate, SendDate, Status, DeliverySchedule)
```

### 1.2 User Roles & Permissions
- **Purchaser/Doer:** Create indents, initiate quotation requests, compare quotes
- **Manager:** Approve quotations and POs based on business rules
- **Warehouse/Goods Receiving:** Log goods receipt, document quality/qty issues
- **Admin:** System configuration, vendor setup, reporting

### 1.3 Database Schema
- PostgreSQL with 12+ core tables
- Authentication: JWT + role-based access control (RBAC)
- Audit trail: Timestamps and user tracking on all transactions

### 1.4 Tech Stack Decision
**Recommended for MVP:**
- **Backend:** Python (Django/FastAPI) or Node.js (Express/NestJS)
- **Frontend:** React or Vue.js
- **Database:** PostgreSQL
- **Deployment:** Docker + AWS/GCP/Azure

**Rationale:** Rapid development, strong ORM support, excellent for business logic

---

## Phase 2: MVP Workflow Implementation (Weeks 5-8)

### 2.1 Indent Creation & Management
**Features:**
- Create indent with line items (item, quantity, specifications)
- Store in draft/submitted status
- Link to department/cost center
- View indent history and modifications

**Key Fields:**
```
Indent {
  id, indent_number, department, created_by, created_date,
  status (draft/submitted/approved/closed),
  items: [{item_id, qty, specs, requested_delivery_date}],
  notes, attachments
}
```

### 2.2 Quotation Management & Comparison
**Features:**
- **Quotation Request:** Auto-create for submitted indent → send to 3+ vendors
- **Vendor Response:** Vendors submit quotation with:
  - Per-item price and delivery days
  - Quality certification level
  - Payment terms
  - Total lead time

**Comparison Sheet (Critical Feature):**
```
┌─────────────────────────────────────────────────────────────┐
│ QUOTATION COMPARISON                                          │
├──────────┬──────────────┬──────────────┬──────────────┐
│ VENDOR   │ PRICE        │ DELIVERY     │ QUALITY      │
├──────────┼──────────────┼──────────────┼──────────────┤
│ Vendor A │ $1,000 ⭐⭐  │ 5 days ⭐    │ Certified ✓  │ ← RECOMMENDED
│ Vendor B │ $950         │ 8 days       │ Certified ✓  │
│ Vendor C │ $1,050       │ 4 days ⭐⭐⭐ │ Not listed   │
└──────────┴──────────────┴──────────────┴──────────────┘
```

**Scoring Algorithm:**
- Price: 40%
- Delivery Days (distance factor): 30%
- Quality Rating (historical): 20%
- Payment Terms: 10%

**Auto-highlight:** Best overall vendor based on weighted score

### 2.3 PO Generation & Manager Approval
**Features:**
- Create PO from approved quotation (auto-populate from quotation)
- Manager approval flow with conditions:
  - Price verification
  - Delivery schedule confirmation
  - Budget allocation
- Send approved PO to vendor (email with PDF)
- Track PO status: Draft → Approved → Sent → Acknowledged

---

## Phase 3: Goods Receipt & Tracking (Weeks 9-11)

### 3.1 Goods Receiving Window
**Features:**
- Weekly goods receiving schedule view
- Log incoming deliveries against POs
- Capture:
  - Actual delivery date
  - Quantity received vs ordered
  - Delivery challan (BILTY) number
  - Invoice number and amount

**Status Tracking:**
```
PO Status Flow:
Indent → Quotation → Quotation Approval → PO Generate 
→ PO Approve and Send → Follow-up (Lead Time) → Take BILTY 
→ Quality/Qty Check → Goods Received → Invoice → Payment
```

### 3.2 Quality & Quantity Checks
**Features:**
- Flag partial deliveries
- Create issue tickets for:
  - Quantity mismatch (short/over items)
  - Quality issues (damaged, defective)
  - Specification mismatches
- Track resolution: Rejection, credit note, replacement, acceptance with credit

**Issue Form:**
```
Issue {
  id, po_id, issue_type (qty/quality/spec),
  description, photos (attachments),
  severity (critical/major/minor),
  vendor_response, resolution, closed_date
}
```

### 3.3 Partial Delivery Management
**Features:**
- Mark deliveries as partial/complete
- Maintain outstanding qty balance per PO
- Allow multiple receipts against same PO
- Closure workflow for partial delivery (short item acceptance)

---

## Phase 4: Document Management & FMS Dashboard (Weeks 12-13)

### 4.1 Document Management
**Stored per PO:**
- Quotation PDF
- Purchase Order PDF
- BILTY (Delivery Challan)
- Invoice
- Quality Certificate
- Issue Reports (if any)

**Features:**
- Upload and version control
- Link documents to workflow stages
- Download/print capability
- Audit trail (who viewed, when)

### 4.2 FMS (Flow Management Sheet) Dashboard
**Sheet-Based Status Tracking:**
```
┌─────────────────────────────────────────────────────────────────┐
│ FMS DASHBOARD - ALL ORDERS AT A GLANCE                          │
├────────┬──────────┬─────────────┬──────────┬─────────────┬──────┤
│ PO#    │ Vendor   │ Current     │ Days In  │ Next Action │ Qty% │
│        │          │ Stage       │ Stage    │             │      │
├────────┼──────────┼─────────────┼──────────┼─────────────┼──────┤
│ PO-001 │ Vendor A │ Goods Recv. │ 2 days   │ Inv Match   │ 100% │
│ PO-002 │ Vendor B │ Follow-up   │ 5 days   │ Check Bilty │ 85%  │
│ PO-003 │ Vendor C │ PO Sent     │ 1 day    │ Acknowledge │ -    │
│ PO-004 │ Vendor A │ Quotation   │ 3 days   │ Manager App.│ -    │
└────────┴──────────┴─────────────┴──────────┴─────────────┴──────┘

Filters: Status, Vendor, Department, Date Range, Overdue Orders
```

**Key Metrics:**
- Orders by stage (counts)
- Overdue deliveries
- Pending manager approvals
- Vendor performance summary
- Average lead time by vendor

### 4.3 Reports & Analytics
**Built-in Reports:**
1. **Vendor Performance Report**
   - Delivery on-time %
   - Quality score
   - Price competitiveness
   - Historical data (3/6/12 months)

2. **Spend Analysis**
   - Category-wise spend
   - Vendor concentration
   - Budget vs actual
   - Quarterly trends

3. **Audit Trail**
   - All modifications logged
   - User actions tracked
   - Status change history

---

## Phase 5: Integration & Deployment (Week 14)

### 5.1 Email Notifications
- Quotation request to vendors
- Manager approval notifications
- PO sent to vendor confirmations
- Goods receipt alerts
- Issue notifications
- Invoice matching alerts

### 5.2 Export Capabilities
- PO to PDF (printable format)
- FMS to Excel (for offline analysis)
- Reports to PDF/Excel
- Quotation summary export

### 5.3 API Endpoints (RESTful)

```
# Indent Management
POST   /api/indents                    # Create
GET    /api/indents/:id                # Get
PUT    /api/indents/:id                # Update
GET    /api/indents                    # List with filters

# Quotation Management
POST   /api/quotations                 # Create from indent
GET    /api/quotations/:id             # Get
PUT    /api/quotations/:id             # Update status
GET    /api/indents/:id/quotations     # List for indent

# PO Management
POST   /api/pos                        # Create from quotation
GET    /api/pos/:id                    # Get
PUT    /api/pos/:id                    # Approve/Send
GET    /api/pos                        # List with status

# Goods Receipt
POST   /api/goods-receipt              # Log receipt
PUT    /api/goods-receipt/:id          # Update with docs
GET    /api/pos/:id/receipts           # Get receipts for PO

# Issues
POST   /api/issues                     # Create issue
PUT    /api/issues/:id                 # Update resolution
GET    /api/pos/:id/issues             # Get issues for PO

# FMS Dashboard
GET    /api/fms/dashboard              # Summary metrics
GET    /api/fms/orders                 # Orders by stage
GET    /api/fms/timeline               # Timeline view

# Reports
GET    /api/reports/vendor-performance
GET    /api/reports/spend-analysis
GET    /api/reports/audit-trail
```

---

## MVP Scope Summary

### ✅ Included in MVP
1. **Indent Creation** - Submit purchase requests
2. **Quotation Management** - Request, receive, compare from 3+ vendors
3. **Smart Comparison Sheet** - Highlight best recommendation (price, delivery, quality)
4. **PO Generation & Approval** - Manager approval with email sending
5. **Goods Receipt Tracking** - Log deliveries with BILTY/Invoice
6. **Quality & Qty Checks** - Flag issues and manage resolutions
7. **Partial Delivery Management** - Track multiple receipts per PO
8. **Document Management** - Store Quotation, PO, BILTY, Invoice per PO
9. **FMS Dashboard** - Sheet view of all orders and current stage
10. **User Roles & Permissions** - Purchaser, Manager, Warehouse staff, Admin
11. **Email Notifications** - Key workflow notifications
12. **Audit Trail** - Complete transaction history
13. **Basic Reports** - Vendor performance, spend analysis

### ❌ Out of Scope (Phase 2)
- Inventory module (separate system)
- Financial integration (GL posting)
- Advanced analytics and BI
- Mobile app (web-responsive only)
- Vendor self-service portal
- Automated payment processing
- Multi-organization setup

---

## Development Milestones

| Milestone | Duration | Deliverables |
|-----------|----------|--------------|
| **M1: Setup & Models** | Week 1-2 | Database schema, API skeleton, auth system |
| **M2: Indent + Quotation** | Week 3-5 | Create indent, manage quotations, comparison logic |
| **M3: PO & Approval** | Week 6-7 | PO generation, manager workflow, PDF export |
| **M4: Goods Receipt** | Week 8-9 | Log receipts, partial delivery, quality checks |
| **M5: Dashboard + Reports** | Week 10-11 | FMS dashboard, basic reports |
| **M6: Polish & Deploy** | Week 12-14 | Testing, documentation, production deployment |

---

## File Structure (Recommended)

```
PurchaseDesk/
├── backend/
│   ├── api/
│   │   ├── indents/
│   │   ├── quotations/
│   │   ├── pos/
│   │   ├── goods_receipt/
│   │   ├── issues/
│   │   └── reports/
│   ├── models/
│   ├── services/
│   ├── utils/
│   ├── migrations/
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Indent/
│   │   │   ├── Quotation/
│   │   │   ├── PO/
│   │   │   ├── GoodsReceipt/
│   │   │   ├── FMSDashboard/
│   │   │   └── Reports/
│   │   ├── components/
│   │   ├── services/
│   │   └── utils/
│   └── public/
├── docs/
│   ├── API.md
│   ├── DATABASE.md
│   ├── DEPLOYMENT.md
│   └── USER_GUIDE.md
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Success Criteria for MVP

- [ ] All purchase orders tracked from indent to payment
- [ ] 3+ vendor quotations compared automatically
- [ ] Manager can approve/reject quotations in <5 minutes
- [ ] Goods receipt logged with 100% document capture
- [ ] FMS dashboard shows real-time status of all orders
- [ ] <2s response time for dashboard load
- [ ] 0 data loss (audit trail complete)
- [ ] User adoption: >80% of procurement team active within 2 weeks

---

## Next Steps

1. **Infrastructure Setup** - Choose cloud platform, setup CI/CD
2. **Team Assignment** - Backend, Frontend, QA, DevOps leads
3. **Database Design Sprint** - Finalize ERD and relationships
4. **Prototype Dashboard** - Quick UI mockup for validation
5. **Start Week 1 Development** - Begin with models and API skeleton
