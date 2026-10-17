# PurchaseDesk Database Schema

## Overview
PostgreSQL schema designed for manufacturing purchase management with complete audit trail, vendor management, and workflow tracking.

> **Implementation note:** this document is the target design. The implemented schema lives in
> [`prisma/schema.prisma`](prisma/schema.prisma) and currently covers users, company settings, vendors,
> items, purchase orders (with GST fields and FY-wise PO counters), documents and the audit log.
> Indents, quotations, goods receipts, issues and invoices will be added as those modules are built.

---

## Core Tables

### 1. Users (Authentication & RBAC)
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(50), -- 'purchaser', 'manager', 'warehouse', 'admin'
    department VARCHAR(100),
    status VARCHAR(20), -- 'active', 'inactive'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id)
);
```

### 2. Vendors
```sql
CREATE TABLE vendors (
    id SERIAL PRIMARY KEY,
    vendor_code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(20),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(20),
    payment_terms VARCHAR(100),
    delivery_lead_days INTEGER,
    quality_rating DECIMAL(3,2), -- 0.00 to 5.00
    on_time_delivery_pct DECIMAL(5,2), -- 0 to 100%
    status VARCHAR(20), -- 'active', 'inactive', 'blacklisted'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    INDEX idx_vendor_code (vendor_code),
    INDEX idx_status (status)
);
```

### 3. Items/Catalog
```sql
CREATE TABLE items (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    uom VARCHAR(20), -- Unit of Measure (pcs, kg, ltr, etc.)
    specifications TEXT, -- JSON or text
    hsn_code VARCHAR(20), -- GST HSN code
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    INDEX idx_sku (sku),
    INDEX idx_category (category)
);
```

### 4. Indents
```sql
CREATE TABLE indents (
    id SERIAL PRIMARY KEY,
    indent_number VARCHAR(50) UNIQUE NOT NULL,
    department VARCHAR(100),
    requested_by INTEGER REFERENCES users(id),
    requested_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50), -- 'draft', 'submitted', 'approved', 'closed', 'cancelled'
    required_delivery_date DATE,
    notes TEXT,
    approved_by INTEGER REFERENCES users(id),
    approved_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_requested_date (requested_date),
    INDEX idx_required_delivery_date (required_delivery_date)
);

CREATE TABLE indent_items (
    id SERIAL PRIMARY KEY,
    indent_id INTEGER NOT NULL REFERENCES indents(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES items(id),
    quantity INTEGER NOT NULL,
    uom VARCHAR(20),
    specifications TEXT, -- Override default if specific to this indent
    notes TEXT,
    line_status VARCHAR(50), -- 'pending', 'po_created', 'received', 'partial', 'closed'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_indent_item (indent_id, item_id),
    INDEX idx_indent_id (indent_id),
    INDEX idx_line_status (line_status)
);
```

### 5. Quotations
```sql
CREATE TABLE quotations (
    id SERIAL PRIMARY KEY,
    quotation_number VARCHAR(50) UNIQUE NOT NULL,
    indent_id INTEGER NOT NULL REFERENCES indents(id),
    vendor_id INTEGER NOT NULL REFERENCES vendors(id),
    requested_date TIMESTAMP,
    submitted_date TIMESTAMP,
    status VARCHAR(50), -- 'requested', 'submitted', 'approved', 'rejected', 'expired'
    total_amount DECIMAL(15,2),
    delivery_days INTEGER,
    quality_certification VARCHAR(255), -- ISO cert, etc.
    payment_terms VARCHAR(100),
    validity_days INTEGER,
    validity_end_date DATE,
    notes TEXT,
    score DECIMAL(5,2), -- Calculated score (0-100)
    is_recommended BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    INDEX idx_indent_id (indent_id),
    INDEX idx_vendor_id (vendor_id),
    INDEX idx_status (status),
    INDEX idx_is_recommended (is_recommended)
);

CREATE TABLE quotation_items (
    id SERIAL PRIMARY KEY,
    quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    indent_item_id INTEGER NOT NULL REFERENCES indent_items(id),
    quantity INTEGER,
    unit_price DECIMAL(15,2),
    total_price DECIMAL(15,2),
    delivery_days INTEGER,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_quotation_id (quotation_id)
);
```

### 6. Purchase Orders (PO)
```sql
CREATE TABLE purchase_orders (
    id SERIAL PRIMARY KEY,
    po_number VARCHAR(50) UNIQUE NOT NULL,
    indent_id INTEGER NOT NULL REFERENCES indents(id),
    quotation_id INTEGER NOT NULL REFERENCES quotations(id),
    vendor_id INTEGER NOT NULL REFERENCES vendors(id),
    po_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50), -- 'draft', 'approved', 'sent', 'acknowledged', 'partial_received', 'completed'
    total_amount DECIMAL(15,2),
    expected_delivery_date DATE,
    approved_by INTEGER REFERENCES users(id),
    approval_date TIMESTAMP,
    sent_to_vendor_date TIMESTAMP,
    sent_by INTEGER REFERENCES users(id),
    payment_terms VARCHAR(100),
    notes TEXT,
    po_validity_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    INDEX idx_status (status),
    INDEX idx_vendor_id (vendor_id),
    INDEX idx_po_number (po_number),
    INDEX idx_expected_delivery_date (expected_delivery_date)
);

CREATE TABLE po_items (
    id SERIAL PRIMARY KEY,
    po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    quotation_item_id INTEGER REFERENCES quotation_items(id),
    item_id INTEGER NOT NULL REFERENCES items(id),
    quantity_ordered INTEGER NOT NULL,
    quantity_received INTEGER DEFAULT 0,
    unit_price DECIMAL(15,2),
    total_price DECIMAL(15,2),
    uom VARCHAR(20),
    delivery_status VARCHAR(50), -- 'pending', 'partial', 'completed'
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_po_id (po_id),
    INDEX idx_delivery_status (delivery_status)
);
```

### 7. Goods Receipt
```sql
CREATE TABLE goods_receipts (
    id SERIAL PRIMARY KEY,
    receipt_number VARCHAR(50) UNIQUE NOT NULL,
    po_id INTEGER NOT NULL REFERENCES purchase_orders(id),
    vendor_id INTEGER NOT NULL REFERENCES vendors(id),
    receipt_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    received_by INTEGER NOT NULL REFERENCES users(id),
    bilty_number VARCHAR(100), -- Delivery Challan
    bilty_date DATE,
    delivery_location VARCHAR(255),
    notes TEXT,
    status VARCHAR(50), -- 'in_progress', 'completed', 'partial'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_po_id (po_id),
    INDEX idx_receipt_date (receipt_date),
    INDEX idx_status (status)
);

CREATE TABLE receipt_items (
    id SERIAL PRIMARY KEY,
    receipt_id INTEGER NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
    po_item_id INTEGER NOT NULL REFERENCES po_items(id),
    item_id INTEGER NOT NULL REFERENCES items(id),
    quantity_received INTEGER NOT NULL,
    quantity_accepted INTEGER,
    quantity_rejected INTEGER,
    uom VARCHAR(20),
    batch_number VARCHAR(100), -- For traceability
    expiry_date DATE,
    quality_status VARCHAR(50), -- 'accepted', 'rejected', 'needs_inspection'
    remarks TEXT,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_receipt_id (receipt_id),
    INDEX idx_quality_status (quality_status)
);
```

### 8. Issues/Discrepancies
```sql
CREATE TABLE issues (
    id SERIAL PRIMARY KEY,
    issue_number VARCHAR(50) UNIQUE NOT NULL,
    po_id INTEGER NOT NULL REFERENCES purchase_orders(id),
    receipt_id INTEGER REFERENCES goods_receipts(id),
    vendor_id INTEGER NOT NULL REFERENCES vendors(id),
    issue_type VARCHAR(50), -- 'quantity_mismatch', 'quality_defect', 'specification_mismatch', 'damage'
    severity VARCHAR(20), -- 'critical', 'major', 'minor'
    description TEXT,
    impact_qty INTEGER,
    reported_by INTEGER NOT NULL REFERENCES users(id),
    reported_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50), -- 'open', 'in_progress', 'resolved', 'closed'
    resolution_type VARCHAR(50), -- 'rejection', 'credit_note', 'replacement', 'partial_acceptance'
    resolution_notes TEXT,
    vendor_response TEXT,
    vendor_response_date TIMESTAMP,
    resolved_by INTEGER REFERENCES users(id),
    resolved_date TIMESTAMP,
    attachment_paths TEXT, -- JSON array of file paths
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_po_id (po_id),
    INDEX idx_status (status),
    INDEX idx_vendor_id (vendor_id),
    INDEX idx_reported_date (reported_date)
);
```

### 9. Documents
```sql
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    doc_type VARCHAR(50), -- 'quotation', 'po', 'bilty', 'invoice', 'quality_cert', 'issue_report'
    reference_id INTEGER, -- PO ID or Issue ID (polymorphic)
    reference_type VARCHAR(50), -- 'po', 'issue', 'receipt'
    file_name VARCHAR(255),
    file_path VARCHAR(512),
    file_size INTEGER,
    mime_type VARCHAR(50),
    uploaded_by INTEGER REFERENCES users(id),
    uploaded_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    status VARCHAR(50), -- 'active', 'archived', 'superseded'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_reference (reference_type, reference_id),
    INDEX idx_doc_type (doc_type)
);
```

### 10. Invoices
```sql
CREATE TABLE invoices (
    id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(100) UNIQUE NOT NULL,
    po_id INTEGER NOT NULL REFERENCES purchase_orders(id),
    vendor_id INTEGER NOT NULL REFERENCES vendors(id),
    invoice_date DATE,
    invoice_amount DECIMAL(15,2),
    gst_amount DECIMAL(15,2),
    total_amount DECIMAL(15,2),
    payment_due_date DATE,
    received_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    received_by INTEGER REFERENCES users(id),
    gst_number VARCHAR(20),
    invoice_status VARCHAR(50), -- 'received', 'verified', 'matched', 'payment_pending', 'paid'
    payment_status VARCHAR(50), -- 'pending', 'partial', 'completed'
    payment_date TIMESTAMP,
    reference_to_po VARCHAR(100), -- PO number reference
    notes TEXT,
    document_path VARCHAR(512),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_po_id (po_id),
    INDEX idx_invoice_date (invoice_date),
    INDEX idx_invoice_status (invoice_status)
);
```

### 11. Audit Trail
```sql
CREATE TABLE audit_trail (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(100), -- 'create', 'update', 'approve', 'reject', etc.
    entity_type VARCHAR(50), -- 'indent', 'quotation', 'po', 'receipt', 'issue'
    entity_id INTEGER,
    old_values JSON, -- Before values
    new_values JSON, -- After values
    change_description TEXT,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at)
);
```

### 12. Vendor Performance Metrics (Computed)
```sql
CREATE TABLE vendor_performance (
    id SERIAL PRIMARY KEY,
    vendor_id INTEGER NOT NULL REFERENCES vendors(id),
    metric_month DATE, -- First day of month
    total_pos INTEGER,
    on_time_deliveries INTEGER,
    on_time_pct DECIMAL(5,2),
    quality_issues INTEGER,
    quality_score DECIMAL(3,2),
    avg_price_variance DECIMAL(5,2),
    payment_terms_compliance_pct DECIMAL(5,2),
    overall_rating DECIMAL(3,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_vendor_id (vendor_id),
    INDEX idx_metric_month (metric_month)
);
```

---

## Views for Quick Queries

### FMS Dashboard View
```sql
CREATE VIEW fms_dashboard AS
SELECT 
    po.id,
    po.po_number,
    v.name as vendor_name,
    i.indent_number,
    CASE 
        WHEN po.status = 'draft' THEN 'PO Generate'
        WHEN po.status = 'approved' THEN 'PO Approve'
        WHEN po.status = 'sent' THEN 'PO Sent to Vendor'
        WHEN po.status = 'acknowledged' THEN 'Awaiting Delivery'
        WHEN po.status = 'partial_received' THEN 'Partial Receipt'
        WHEN po.status = 'completed' THEN 'Goods Received'
    END as current_stage,
    DATEDIFF(DAY, po.updated_at, NOW()) as days_in_stage,
    po.expected_delivery_date,
    DATEDIFF(DAY, NOW(), po.expected_delivery_date) as days_to_delivery,
    po.po_date,
    po.total_amount,
    COALESCE(SUM(ri.quantity_received), 0) as quantity_received,
    SUM(pi.quantity_ordered) as quantity_ordered,
    ROUND(100 * COALESCE(SUM(ri.quantity_received), 0) / NULLIF(SUM(pi.quantity_ordered), 0), 2) as receipt_completion_pct
FROM purchase_orders po
JOIN indents i ON po.indent_id = i.id
JOIN vendors v ON po.vendor_id = v.id
LEFT JOIN po_items pi ON po.id = pi.po_id
LEFT JOIN receipt_items ri ON pi.id = ri.po_item_id
WHERE po.status != 'cancelled'
GROUP BY po.id, po.po_number, v.name, i.indent_number, po.status, po.updated_at, po.expected_delivery_date, po.po_date, po.total_amount;
```

### Quotation Comparison View
```sql
CREATE VIEW quotation_comparison AS
SELECT 
    q.quotation_number,
    q.indent_id,
    v.name as vendor_name,
    v.city,
    q.total_amount,
    q.delivery_days,
    v.quality_rating,
    ROUND((q.total_amount / MAX(q.total_amount) OVER (PARTITION BY q.indent_id)) * 100, 2) as price_rank_pct,
    ROUND((MAX(q.delivery_days) OVER (PARTITION BY q.indent_id) / q.delivery_days) * 100, 2) as delivery_rank_pct,
    v.quality_rating as quality_score,
    q.score as weighted_score,
    q.is_recommended
FROM quotations q
JOIN vendors v ON q.vendor_id = v.id
WHERE q.status IN ('submitted', 'approved');
```

---

## Indexes Summary

Key indexes for performance:
- `users`: username, email
- `vendors`: vendor_code, status
- `items`: sku, category
- `indents`: status, requested_date, required_delivery_date
- `indent_items`: indent_id, line_status
- `quotations`: indent_id, vendor_id, status, is_recommended
- `purchase_orders`: status, vendor_id, po_number, expected_delivery_date
- `goods_receipts`: po_id, receipt_date, status
- `issues`: po_id, status, vendor_id, reported_date
- `audit_trail`: entity_type, entity_id, user_id, created_at
- `vendor_performance`: vendor_id, metric_month

---

## Data Relationships Diagram

```
users
  ├── indents (created_by, requested_by, approved_by)
  ├── quotations (created_by)
  ├── purchase_orders (created_by, approved_by, sent_by)
  ├── goods_receipts (received_by)
  ├── issues (reported_by, resolved_by)
  ├── vendors (created_by)
  └── documents (uploaded_by)

vendors
  ├── quotations (many)
  ├── purchase_orders (many)
  ├── goods_receipts (many)
  └── vendor_performance (metric history)

indents
  ├── indent_items (line items)
  ├── quotations (multiple)
  ├── purchase_orders (one or more)
  └── issues (if discrepancies)

quotations
  └── quotation_items (line-level pricing)
      └── po_items (copied to PO)

purchase_orders
  ├── po_items (line items with pricing)
  ├── goods_receipts (delivery tracking)
  ├── invoices (billing)
  └── issues (quality/qty discrepancies)

goods_receipts
  └── receipt_items (line-level received qty)
      └── issues (if discrepancies flagged)

documents (polymorphic reference to PO, Issue, etc.)
```

---

## Migration Strategy

1. **Phase 1**: Core tables (users, vendors, items)
2. **Phase 2**: Workflow tables (indents, quotations, POs)
3. **Phase 3**: Receipt & Issues (goods_receipts, issues)
4. **Phase 4**: Invoicing & Analytics (invoices, vendor_performance, views)
5. **Phase 5**: Audit & Security (audit_trail enhancements)

