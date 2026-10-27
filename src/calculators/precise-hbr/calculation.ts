/**
 * PRECISE-HBR Score Calculation Logic
 *
 * Research approximation; see the scoring-function comment and regression tests.
 */

import type {
    ComplexCalculationResult,
    GetValueFn,
    GetStdValueFn,
    GetRadioValueFn
} from '../../types/calculator-formula.js';

// ==========================================
// PRECISE-HBR Score Calculation
// ==========================================

export interface ScoreResult {
    score: number;
    breakdown: string;
}

/**
 * Calculate PRECISE-HBR Score
 *
 * @param age - Patient age (years)
 * @param hb - Hemoglobin (g/dL)
 * @param egfr - eGFR (mL/min/1.73m²)
 * @param wbc - White blood cell count (10⁹/L)
 * @param priorBleeding - Prior bleeding history
 * @param oralAnticoagulation - On oral anticoagulants
 * @param arcHbrRisk - Any ARC-HBR risk factor present
 * @returns Score and breakdown
 */
export function calculatePreciseHbrScore(
    age: number,
    hb: number,
    egfr: number,
    wbc: number,
    priorBleeding: boolean,
    oralAnticoagulation: boolean,
    arcHbrRisk: boolean
): ScoreResult {
    // Research-derived approximation; not official EOC coefficients.
    // 52 EOC observations / 50 distinct synthetic inputs; all integer scores match.
    // 42 development + 10 pre-frozen hold-out (model/predictions frozen before queries).
    // Not validation of clinical predictive performance or bleeding-probability calibration.
    // Test: src/__tests__/calculators/precise-hbr-eoc-regression.test.ts
    // Data: src/__tests__/fixtures/precise-hbr-eoc-regression.json
    let score = 2.33; // Frozen primary working estimate, not an official coefficient.
    const breakdownParts: string[] = ['Base Score (2.33)'];

    // --- Age ---
    // Range 30-80. If > 30: + (Age - 30) * 0.25
    let ageClamped = age;
    if (age < 30) ageClamped = 30;
    if (age > 80) ageClamped = 80;

    if (age > 30) {
        const agePoints = (ageClamped - 30) * 0.25;
        if (agePoints > 0) {
            score += agePoints;
            breakdownParts.push(`Age ${age} (Clamped: ${ageClamped}) -> +${agePoints.toFixed(2)}`);
        }
    }

    // --- Hb ---
    // Range 5.0 - 15.0 g/dL. If < 15: + (15 - Hb) * 2.5
    let hbClamped = hb;
    if (hb < 5.0) hbClamped = 5.0;
    if (hb > 15.0) hbClamped = 15.0;

    if (hb < 15.0) {
        const hbPoints = (15 - hbClamped) * 2.5;
        if (hbPoints > 0) {
            score += hbPoints;
            breakdownParts.push(`Hb ${hb} (Clamped: ${hbClamped}) -> +${hbPoints.toFixed(2)}`);
        }
    }

    // --- eGFR ---
    // Range 5 - 100. If < 100: + (100 - eGFR) * 0.055
    let egfrClamped = egfr;
    if (egfr < 5) egfrClamped = 5;
    if (egfr > 100) egfrClamped = 100;

    if (egfr < 100) {
        const egfrPoints = (100 - egfrClamped) * 0.055;
        if (egfrPoints > 0) {
            score += egfrPoints;
            breakdownParts.push(
                `eGFR ${egfr} (Clamped: ${egfrClamped}) -> +${egfrPoints.toFixed(2)}`
            );
        }
    }

    // --- WBC ---
    // Upper limit 15.0. If > 3: + (WBC - 3) * 0.8
    let wbcClamped = wbc;
    if (wbc > 15.0) wbcClamped = 15.0;

    if (wbcClamped > 3) {
        const wbcPoints = (wbcClamped - 3) * 0.8;
        score += wbcPoints;
        breakdownParts.push(`WBC ${wbc} (Clamped: ${wbcClamped}) -> +${wbcPoints.toFixed(2)}`);
    }

    // --- Categorical ---
    if (priorBleeding) {
        score += 7;
        breakdownParts.push('Prior Bleeding (+7)');
    }
    if (oralAnticoagulation) {
        score += 5;
        breakdownParts.push('Oral Anticoagulation (+5)');
    }
    if (arcHbrRisk) {
        score += 3;
        breakdownParts.push('ARC-HBR Risk Factor (+3)');
    }

    // Sum every contribution before rounding; do not round individual components.
    const finalScore = Math.round(score);

    if (Math.abs(finalScore - score) > 0.001) {
        breakdownParts.push(`Total Raw: ${score.toFixed(2)} -> Rounded: ${finalScore}`);
    } else {
        breakdownParts.push(`Total: ${finalScore}`);
    }

    return { score: finalScore, breakdown: breakdownParts.join('<br>') };
}

/**
 * PRECISE-HBR Main Calculation Function
 *
 * @param getValue - Get raw value function
 * @param getStdValue - Get standardized value function (Hb must be in g/dL)
 * @param getRadioValue - Get radio value function
 * @returns Calculation result
 */
export function preciseHbrCalculation(
    getValue: GetValueFn,
    getStdValue: GetStdValueFn,
    getRadioValue: GetRadioValueFn
): ComplexCalculationResult | null {
    const age = getValue('precise-hbr-age');
    // Preserve the unit correction from 31cb2bd for both UI and direct callers.
    const hb = getStdValue('precise-hbr-hb', 'g/dL');
    const wbc = getValue('precise-hbr-wbc');
    const egfr = getValue('precise-hbr-egfr');

    const priorBleeding = getRadioValue('prior_bleeding') === '1';
    const oralAnticoagulation = getRadioValue('oral_anticoagulation') === '1';

    // ARC-HBR Risk Factors
    const hbrPlt = getRadioValue('arc_hbr_plt') === '1';
    const hbrDiathesis = getRadioValue('arc_hbr_diathesis') === '1';
    const hbrCirrhosis = getRadioValue('arc_hbr_cirrhosis') === '1';
    const hbrMalignancy = getRadioValue('arc_hbr_malignancy') === '1';
    const hbrSurgery = getRadioValue('arc_hbr_surgery') === '1';
    const hbrNsaids = getRadioValue('arc_hbr_nsaids') === '1';

    const arcHbrRisk =
        hbrPlt || hbrDiathesis || hbrCirrhosis || hbrMalignancy || hbrSurgery || hbrNsaids;

    if (age === null || hb === null || wbc === null || egfr === null) {
        return null;
    }

    const result = calculatePreciseHbrScore(
        age,
        hb,
        egfr,
        wbc,
        priorBleeding,
        oralAnticoagulation,
        arcHbrRisk
    );

    // Existing display contract retained. These ranges are not EOC exact probabilities.
    const s = result.score;
    let riskLevel = '';
    let bleedingRisk = '';
    let severity: 'success' | 'warning' | 'danger' = 'success';

    if (s <= 22) {
        riskLevel = 'Non-HBR (Low Risk)';
        bleedingRisk = '0.5% ~ 3.8%';
        severity = 'success';
    } else if (s <= 26) {
        riskLevel = 'HBR (High Risk)';
        bleedingRisk = '4.2% ~ 5.5%';
        severity = 'warning';
    } else if (s <= 30) {
        riskLevel = 'Very HBR (Very High Risk)';
        bleedingRisk = '6.0% ~ 8.1%';
        severity = 'danger';
    } else {
        // > 30
        if (s <= 35) {
            riskLevel = 'Extreme Risk';
            bleedingRisk = '8.9% ~ 12.8%';
            severity = 'danger';
        } else {
            riskLevel = 'Extreme Risk (Capped)';
            bleedingRisk = 'Upper limit ~15%';
            severity = 'danger';
        }
    }

    return {
        score: s,
        interpretation: riskLevel,
        severity,
        additionalResults: [
            { label: 'Risk Group', value: riskLevel },
            { label: '1-Year Bleeding Risk', value: bleedingRisk }
        ],
        breakdown: result.breakdown
    };
}
