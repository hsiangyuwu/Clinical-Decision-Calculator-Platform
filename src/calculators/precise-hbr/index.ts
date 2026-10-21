/**
 * PRECISE-DAPT Score Calculator
 *
 * PRECISE-DAPT (PREdicting bleeding Complications In patients undergoing Stent implantation and subsEquent Dual Anti Platelet Therapy)
 * 雖然 User 請求寫 PRECISE-HBR，但根據截圖內容（"PRECISE-HBR 分數"、"ARC-HBR 危險因子"），
 * 實際上這是關於 PRECISE-DAPT 改良或者是與 ARC-HBR 結合的一個計算器。
 * 根據截圖標題 "1. 計分邏輯 (Scoring Logic)" 和 "2. 風險分層 (Risk Stratification)"，
 * 我們將實現這個特定的 "PRECISE-HBR" 計算器。
 */

import { createUnifiedFormulaCalculator } from '../shared/unified-formula-calculator.js';
import { LOINC_CODES, SNOMED_CODES, RXNORM_CODES } from '../../fhir-codes.js';
import { uiBuilder } from '../../ui-builder.js';
import { fhirDataService } from '../../fhir-data-service.js';

// ==========================================
// PRECISE-HBR 評分函數
// ==========================================

const calculateScore = (
    age: number,
    hb: number,
    egfr: number,
    wbc: number,
    priorBleeding: boolean,
    oralAnticoagulation: boolean,
    arcHbrRisk: boolean
): { score: number; breakdown: string } => {
    let score = 2; // Base Score
    const breakdownParts: string[] = ['Base Score (2)'];

    // --- Age ---
    // Range 30-80. If > 30: + (Age - 30) * 0.25
    let ageClamped = age;
    if (age < 30) ageClamped = 30;
    if (age > 80) ageClamped = 80;

    if (age > 30) {
        const agePoints = (ageClamped - 30) * 0.26;
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
    // Range 5 - 100. If < 100: + (100 - eGFR) * 0.05
    let egfrClamped = egfr;
    if (egfr < 5) egfrClamped = 5;
    if (egfr > 100) egfrClamped = 100;

    if (egfr < 100) {
        const egfrPoints = (100 - egfrClamped) * 0.05;
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

    // Round to integer (image says "最後四捨五入取整數")
    const finalScore = Math.round(score);

    if (Math.abs(finalScore - score) > 0.001) {
        breakdownParts.push(`Total Raw: ${score.toFixed(2)} -> Rounded: ${finalScore}`);
    } else {
        breakdownParts.push(`Total: ${finalScore}`);
    }

    return { score: finalScore, breakdown: breakdownParts.join('<br>') };
};

export const preciseHbr = createUnifiedFormulaCalculator({
    id: 'precise-hbr',
    title: 'PRECISE-HBR Score',
    description: 'Predicts bleeding risk in patients undergoing stent implantation.',
    infoAlert:
        'Calculates bleeding risk using the PRECISE-HBR criteria. Score is rounded to the nearest integer.',

    autoPopulateAge: 'precise-hbr-age',

    sections: [
        {
            title: 'Patient Demographics & Vitals',
            fields: [
                {
                    id: 'precise-hbr-age',
                    label: 'Age',
                    unit: 'years',
                    placeholder: '30 - 80',
                    min: 18,
                    max: 120,
                    validationType: 'age'
                },
                {
                    id: 'precise-hbr-hb',
                    label: 'Hemoglobin (Hb)',
                    placeholder: '5.0 - 15.0',
                    step: 0.1,
                    min: 1,
                    max: 25,
                    unitToggle: {
                        type: 'hemoglobin',
                        units: ['g/dL', 'g/L'],
                        default: 'g/dL'
                    },
                    validationType: 'hemoglobin',
                    loincCode: LOINC_CODES.HEMOGLOBIN
                },
                {
                    id: 'precise-hbr-wbc',
                    label: 'White Blood Cell (WBC)',
                    placeholder: '< 15',
                    step: 0.1,
                    min: 0,
                    max: 100,
                    unit: '10⁹/L',
                    validationType: 'wbc',
                    loincCode: LOINC_CODES.WBC
                },
                {
                    id: 'precise-hbr-egfr',
                    label: 'eGFR',
                    unit: 'mL/min/1.73m²',
                    placeholder: '5 - 100',
                    min: 0,
                    max: 200,
                    validationType: 'egfr',
                    loincCode: LOINC_CODES.EGFR
                }
            ]
        },
        {
            title: 'Medical History & Risk Factors',
            fields: [
                {
                    name: 'prior_bleeding',
                    label: 'Prior Bleeding History',
                    options: [
                        { value: '1', label: 'Yes (+7)' },
                        { value: '0', label: 'No', checked: true }
                    ]
                },
                {
                    name: 'oral_anticoagulation',
                    label: 'Oral Anticoagulation',
                    helpText: 'Patient is on Oral Anticoagulants (OAC)',
                    options: [
                        { value: '1', label: 'Yes (+5)' },
                        { value: '0', label: 'No', checked: true }
                    ]
                },
                // ARC-HBR Risk Factors
                {
                    name: 'arc_hbr_plt',
                    label: 'Platelet count < 100 × 10⁹/L',
                    description:
                        '<strong>ARC-HBR Risk Factors</strong> (Presence of ANY below adds +3 points)',
                    options: [
                        { value: '1', label: 'Yes' },
                        { value: '0', label: 'No', checked: true }
                    ]
                },
                {
                    name: 'arc_hbr_diathesis',
                    label: 'Chronic bleeding diathesis',
                    options: [
                        { value: '1', label: 'Yes' },
                        { value: '0', label: 'No', checked: true }
                    ]
                },
                {
                    name: 'arc_hbr_cirrhosis',
                    label: 'Liver cirrhosis with portal hypertension',
                    options: [
                        { value: '1', label: 'Yes' },
                        { value: '0', label: 'No', checked: true }
                    ]
                },
                {
                    name: 'arc_hbr_malignancy',
                    label: 'Active malignancy',
                    options: [
                        { value: '1', label: 'Yes' },
                        { value: '0', label: 'No', checked: true }
                    ]
                },
                {
                    name: 'arc_hbr_surgery',
                    label: 'Recent major surgery or trauma',
                    options: [
                        { value: '1', label: 'Yes' },
                        { value: '0', label: 'No', checked: true }
                    ]
                },
                {
                    name: 'arc_hbr_nsaids',
                    label: 'Chronic use of NSAIDs or corticosteroids',
                    options: [
                        { value: '1', label: 'Yes' },
                        { value: '0', label: 'No', checked: true }
                    ]
                }
            ]
        }
    ],

    resultTitle: 'PRECISE-HBR Score',

    complexCalculate: (getValue, getStdValue, getRadioValue, getCheckboxValue) => {
        const age = getValue('precise-hbr-age');
        // The score formula expects g/dL, regardless of the displayed Hb unit.
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

        const result = calculateScore(
            age,
            hb,
            egfr,
            wbc,
            priorBleeding,
            oralAnticoagulation,
            arcHbrRisk
        );

        // Interpretation
        const s = result.score;
        let riskLevel = '';
        let bleedingRisk = '';
        let severity: 'success' | 'warning' | 'danger' = 'success';

        if (s <= 22) {
            riskLevel = 'Non-HBR (Low Risk)';
            bleedingRisk = '0.5% ~ 3.5%';
            severity = 'success';
        } else if (s <= 26) {
            riskLevel = 'HBR (High Risk)';
            bleedingRisk = '3.5% ~ 5.5%';
            severity = 'warning';
        } else if (s <= 30) {
            riskLevel = 'Very HBR (Very High Risk)';
            bleedingRisk = '5.5% ~ 8.0%';
            severity = 'danger';
        } else {
            // > 30
            // Image says 31-35 is Extreme (8.0-12.0)
            // > 35 is Cap (15%)
            if (s <= 35) {
                riskLevel = 'Extreme Risk';
                bleedingRisk = '8.0% ~ 12.0%';
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
    },

    fhirAutoPopulate: [
        {
            fieldId: 'precise-hbr-hb',
            loincCode: LOINC_CODES.HEMOGLOBIN,
            targetUnit: 'g/dL',
            unitType: 'hemoglobin',
            formatter: v => v.toFixed(1)
        },
        {
            fieldId: 'precise-hbr-wbc',
            loincCode: LOINC_CODES.WBC,
            formatter: v => v.toFixed(1)
        },
        {
            fieldId: 'precise-hbr-egfr',
            loincCode: LOINC_CODES.EGFR,
            formatter: v => v.toFixed(0)
        }
    ],

    reference: `
        ${uiBuilder.createSection({
            title: 'Risk Stratification',
            icon: '📊',
            content: uiBuilder.createTable({
                headers: ['Score', 'Risk Category', '1-Yr Bleeding Risk'],
                rows: [
                    ['≤ 22', 'Non-HBR', '0.5% ~ 3.5%'],
                    ['23 - 26', 'HBR', '3.5% ~ 5.5%'],
                    ['27 - 30', 'Very HBR', '5.5% ~ 8.0%'],
                    ['31 - 35', 'Extreme', '8.0% ~ 12.0%'],
                    ['> 35', 'Capped', '~15%']
                ]
            })
        })}
    `,

    customInitialize: async (client, patient, container) => {
        // Initialize FHIR service (already done by factory, but harmless to repeat or ensure)
        // Actually factory calls fhirDataService.initialize if client is present

        if (!fhirDataService.isReady()) return;

        const setRadioResult = (name: string, isTrue: boolean) => {
            if (isTrue) {
                const radio = container.querySelector(
                    `input[name="${name}"][value="1"]`
                ) as HTMLInputElement;
                if (radio) {
                    radio.checked = true;
                    radio.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        };

        try {
            // 1. Prior Bleeding
            const hasPriorBleeding = await fhirDataService.hasCondition([
                SNOMED_CODES.PREVIOUS_BLEEDING
            ]);
            setRadioResult('prior_bleeding', hasPriorBleeding);

            // 2. Oral Anticoagulation (OAC)
            const oacCodes = [
                RXNORM_CODES.WARFARIN,
                RXNORM_CODES.APIXABAN,
                RXNORM_CODES.RIVAROXABAN,
                RXNORM_CODES.DABIGATRAN,
                RXNORM_CODES.EDOXABAN
            ];
            const onOAC = await fhirDataService.isOnMedication(oacCodes);
            setRadioResult('oral_anticoagulation', onOAC);

            // 3. Platelet count < 100
            // Note: Platelet unit varies (10*3/uL vs 10*9/L). Usually 100 x 10^9/L = 100,000 / uL.
            // LOINC usually returns 10*3/uL (e.g. 150-450).
            // Input asks for < 100 x 10^9/L.
            // If value < 100 (assuming unit is 10^9/L or 10^3/uL which are numerically same for this range usually)
            const pltResult = await fhirDataService.getObservation(LOINC_CODES.PLATELETS);
            if (pltResult.value !== null) {
                // Assuming standard units where < 100 is the threshold
                if (pltResult.value < 100) {
                    setRadioResult('arc_hbr_plt', true);
                }
            }

            // 4. Chronic bleeding diathesis
            const hasDiathesis = await fhirDataService.hasCondition([
                SNOMED_CODES.BLEEDING_DISORDER,
                SNOMED_CODES.THROMBOCYTOPENIA,
                SNOMED_CODES.ANEMIA // Maybe too broad? Keeping it relevant to bleeding risk
            ]);
            setRadioResult('arc_hbr_diathesis', hasDiathesis);

            // 5. Active Malignancy
            const hasMalignancy = await fhirDataService.hasCondition([
                SNOMED_CODES.MALIGNANCY,
                SNOMED_CODES.METASTATIC_CANCER,
                SNOMED_CODES.LEUKEMIA,
                SNOMED_CODES.LYMPHOMA
            ]);
            setRadioResult('arc_hbr_malignancy', hasMalignancy);

            // 6. Liver Cirrhosis
            const hasCirrhosis = await fhirDataService.hasCondition([
                SNOMED_CODES.CIRRHOSIS,
                SNOMED_CODES.LIVER_FAILURE
            ]);
            setRadioResult('arc_hbr_cirrhosis', hasCirrhosis);

            // 7. Chronic NSAIDs or Steroids
            const antiInflammatoryCodes = [
                // NSAIDs
                RXNORM_CODES.IBUPROFEN,
                RXNORM_CODES.NAPROXEN,
                RXNORM_CODES.DICLOFENAC,
                RXNORM_CODES.KETOROLAC,
                RXNORM_CODES.INDOMETHACIN,
                RXNORM_CODES.MELOXICAM,
                RXNORM_CODES.CELECOXIB,
                // Steroids
                RXNORM_CODES.PREDNISONE,
                RXNORM_CODES.PREDNISOLONE,
                RXNORM_CODES.METHYLPREDNISOLONE,
                RXNORM_CODES.DEXAMETHASONE,
                RXNORM_CODES.HYDROCORTISONE,
                RXNORM_CODES.TRIAMCINOLONE
            ];
            const onAntiInflammatory = await fhirDataService.isOnMedication(antiInflammatoryCodes);
            setRadioResult('arc_hbr_nsaids', onAntiInflammatory);
        } catch (error) {
            console.warn('Error in PRECISE-HBR auto-population:', error);
        }
    }
});
