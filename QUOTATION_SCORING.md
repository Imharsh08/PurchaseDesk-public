# Quotation Scoring & Recommendation Engine

## Overview
The quotation scoring system automatically evaluates vendor quotes to highlight the best option for procurement managers, considering price, delivery performance, location, and quality metrics.

---

## Scoring Formula

### Weighted Score Calculation
```
OVERALL_SCORE = (Price_Score × 0.40) 
              + (Delivery_Score × 0.30) 
              + (Quality_Score × 0.20)
              + (Payment_Terms_Score × 0.10)
```

**Scale:** 0-100 (higher is better)

---

## 1. Price Score (40% weight)

### Formula
```
Price_Score = (MIN_PRICE / Vendor_Price) × 100
```

**Example:**
- Vendor A: $1,000
- Vendor B: $950 ← MIN
- Vendor C: $1,050

```
Price_Score_A = (950 / 1000) × 100 = 95
Price_Score_B = (950 / 950) × 100 = 100
Price_Score_C = (950 / 1050) × 100 = 90.48
```

**Display:** 
- ≥95: ⭐⭐ (Good)
- ≥90: ⭐ (Acceptable)
- <90: (Below average)

---

## 2. Delivery Score (30% weight)

### Factors
- **Quoted Delivery Days** (base)
- **Vendor Location** (distance proxy)
- **Historical On-Time Delivery %**

### Formula
```
Delivery_Days_Score = (MIN_DELIVERY_DAYS / Vendor_Delivery_Days) × 100

Location_Score = Distance_Factor
  - Same City: 100 (no logistics delay)
  - Adjacent State: 85 (1-2 days extra)
  - 2-3 States: 70 (3-5 days extra)
  - >3 States: 60 (5+ days extra)

Historical_Performance_Score = Vendor_OnTime_Delivery_Percentage

Delivery_Score = (Delivery_Days_Score × 0.50 
                + Location_Score × 0.30 
                + Historical_Performance_Score × 0.20)
```

**Example:**
- Vendor A: 5 days, Same City, 95% on-time ← BEST
- Vendor B: 8 days, Adjacent State, 88% on-time
- Vendor C: 4 days, >3 States, 72% on-time

```
Vendor A:
  Days_Score = (4/5) × 100 = 80
  Location_Score = 100
  Performance = 95
  Delivery_Score = (80×0.50 + 100×0.30 + 95×0.20) = 40+30+19 = 89 ⭐⭐

Vendor B:
  Days_Score = (4/8) × 100 = 50
  Location_Score = 85
  Performance = 88
  Delivery_Score = (50×0.50 + 85×0.30 + 88×0.20) = 25+25.5+17.6 = 68.1 ⭐

Vendor C:
  Days_Score = (4/4) × 100 = 100
  Location_Score = 60
  Performance = 72
  Delivery_Score = (100×0.50 + 60×0.30 + 72×0.20) = 50+18+14.4 = 82.4
```

**Display Tiers:**
- ≥85: ⭐⭐⭐ (Excellent)
- 70-84: ⭐⭐ (Good)
- 50-69: ⭐ (Acceptable)
- <50: (At Risk)

---

## 3. Quality Score (20% weight)

### Factors
- **Certifications** (ISO, quality standards)
- **Historical Quality Issues %**
- **Defect Rate** (from past receipts)

### Formula
```
Certification_Score:
  - ISO 9001: 95
  - ISO 45001 or ISO 14001: 85
  - Customer Certifications: 80
  - None: 40

Quality_History = (1 - (Quality_Issues_Count / Total_POs)) × 100
                = (1 - Defect_Rate) × 100

Defect_Rate_Score:
  - 0-2% defect: 95 (Excellent)
  - 2-5% defect: 85 (Good)
  - 5-10% defect: 70 (Acceptable)
  - >10% defect: 40 (Poor)

Quality_Score = (Certification_Score × 0.40 
              + Defect_Rate_Score × 0.60)
```

**Example:**
- Vendor A: ISO 9001, 1.5% defect rate
- Vendor B: No cert, 3% defect rate
- Vendor C: ISO 9001, 8% defect rate

```
Vendor A:
  Cert_Score = 95
  Defect_Score = 95
  Quality_Score = (95×0.40 + 95×0.60) = 38+57 = 95 ⭐⭐⭐

Vendor B:
  Cert_Score = 40
  Defect_Score = 85
  Quality_Score = (40×0.40 + 85×0.60) = 16+51 = 67 ⭐

Vendor C:
  Cert_Score = 95
  Defect_Score = 70
  Quality_Score = (95×0.40 + 70×0.60) = 38+42 = 80 ⭐⭐
```

---

## 4. Payment Terms Score (10% weight)

### Factors
- **Credit Days Offered**
- **Early Payment Discount %**

### Formula
```
Payment_Terms_Score:
  - COD/Advance: 40 (No credit advantage)
  - 15 days: 60
  - 30 days: 80
  - 45+ days: 100
  
Early_Discount_Score:
  - 0%: 50
  - 1-2%: 70
  - 2-5%: 85
  - >5%: 100

Payment_Terms_Score = (Credit_Days_Score × 0.70 
                     + Early_Discount_Score × 0.30)
```

**Example:**
- Vendor A: 30 days, 2% early discount
- Vendor B: 45 days, 0% discount
- Vendor C: 15 days, 3% discount

```
Vendor A:
  Credit_Score = 80
  Discount_Score = 85
  Terms_Score = (80×0.70 + 85×0.30) = 56+25.5 = 81.5 ⭐⭐

Vendor B:
  Credit_Score = 100
  Discount_Score = 50
  Terms_Score = (100×0.70 + 50×0.30) = 70+15 = 85 ⭐⭐

Vendor C:
  Credit_Score = 60
  Discount_Score = 100
  Terms_Score = (60×0.70 + 100×0.30) = 42+30 = 72 ⭐
```

---

## Final Scoring Example

### Scenario: Electronics Component Procurement

| Factor | Vendor A | Vendor B | Vendor C |
|--------|----------|----------|----------|
| **Price Score (40%)** | 95 × 0.40 = 38 | 100 × 0.40 = 40 | 90 × 0.40 = 36 |
| **Delivery Score (30%)** | 89 × 0.30 = 26.7 | 68 × 0.30 = 20.4 | 82 × 0.30 = 24.6 |
| **Quality Score (20%)** | 95 × 0.20 = 19 | 67 × 0.20 = 13.4 | 80 × 0.20 = 16 |
| **Payment Terms (10%)** | 82 × 0.10 = 8.2 | 85 × 0.10 = 8.5 | 72 × 0.10 = 7.2 |
| **TOTAL SCORE** | **91.9** ⭐ | **82.3** | **83.8** |

### Dashboard Display
```
┌──────────────────────────────────────────────────────────────┐
│ QUOTATION COMPARISON - Indent-2024-001                       │
├────────────┬──────────┬──────────┬──────────┬─────────────────┤
│ VENDOR     │ PRICE    │ DELIVERY │ QUALITY  │ FINAL SCORE     │
├────────────┼──────────┼──────────┼──────────┼─────────────────┤
│ Vendor A   │ $1,000   │ 5 days   │ ISO 9001 │ 91.9 ⭐ BEST    │
│            │ ⭐⭐    │ ⭐⭐⭐   │ ⭐⭐⭐  │ RECOMMENDED     │
├────────────┼──────────┼──────────┼──────────┼─────────────────┤
│ Vendor B   │ $950 ⭐  │ 8 days   │ 67 score │ 82.3            │
│            │ CHEAPEST │ ⭐       │ ⭐       │                 │
├────────────┼──────────┼──────────┼──────────┼─────────────────┤
│ Vendor C   │ $1,050   │ 4 days ⭐│ ISO 9001 │ 83.8            │
│            │          │ FASTEST  │ ⭐⭐    │ FASTEST DELIVERY│
└────────────┴──────────┴──────────┴──────────┴─────────────────┘

✓ RECOMMENDED: Vendor A
  • Best overall value (lowest total cost + good delivery)
  • Proven quality with ISO certification
  • 95% on-time delivery history
  • Favorable payment terms (30 days)

⚠️ ALTERNATIVE: Vendor C
  • Fastest delivery (4 days vs 5 days)
  • If speed is critical, consider this option
  • Slightly higher cost (+$50)
  • Trade-off: +0.25 points in quality

❌ NOT RECOMMENDED: Vendor B
  • Lowest price but poor delivery record
  • No quality certifications
  • Longer lead time (8 days)
  • Higher risk for delays
```

---

## Dynamic Weight Adjustment

### Scenario-Based Weighting

#### Emergency Order (Fast Delivery Needed)
```
Weights:
- Price: 20%
- Delivery: 60% ← INCREASED
- Quality: 10%
- Payment Terms: 10%

// Vendor C suddenly becomes recommended
Vendor A: 20+53.4+19+8.2 = 100.6
Vendor B: 20+40.8+13.4+8.5 = 82.7
Vendor C: 20+49.2+16+7.2 = 92.4
```

#### High-Risk Item (Quality Critical)
```
Weights:
- Price: 20%
- Delivery: 20%
- Quality: 50% ← INCREASED
- Payment Terms: 10%

// Vendor A remains best due to quality
Vendor A: 19+26.7+47.5+8.2 = 101.4 ⭐
Vendor B: 20+20.4+33.5+8.5 = 82.4
Vendor C: 18+24.6+40+7.2 = 89.8
```

#### Cash-Constrained Purchase (Payment Terms Critical)
```
Weights:
- Price: 25%
- Delivery: 25%
- Quality: 15%
- Payment Terms: 35% ← INCREASED

// Vendor B's favorable terms help
Vendor A: 23.75+26.7+14.25+28.7 = 93.4
Vendor B: 25+20.4+10.05+29.75 = 85.2
Vendor C: 22.5+24.6+12+25.2 = 84.3
```

---

## Implementation Checklist

- [ ] **Database Setup**
  - Store historical vendor metrics
  - Calculate rolling averages (3, 6, 12-month)
  - Track defect rates per category

- [ ] **Scoring Engine**
  - Implement weighted scoring algorithm
  - Support dynamic weight adjustment
  - Cache scores for performance

- [ ] **Display Layer**
  - Color-code scores (red/yellow/green)
  - Show breakdown by factor
  - Highlight why recommended

- [ ] **Manager Override**
  - Allow manual quotation selection
  - Log reason for deviation
  - Alert on non-recommended choice

- [ ] **Audit Trail**
  - Log all scoring calculations
  - Track score changes over time
  - Enable score recalculation

---

## Continuous Improvement

### Monthly Metrics Refresh
- Recalculate vendor quality scores
- Update on-time delivery percentages
- Refresh historical defect rates
- Adjust performance ratings

### Quarterly Review
- Identify scoring algorithm drift
- Validate recommendations accuracy
- Survey procurement team feedback
- Adjust weights if needed

### Annual Assessment
- Full vendor performance review
- Renegotiate payment terms
- Benchmark against industry
- Plan vendor consolidation

