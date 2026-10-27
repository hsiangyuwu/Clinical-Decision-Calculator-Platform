/**
 * PRECISE-HBR Original calculator UI.
 * Scoring and interpretation are shared with calculation.ts.
 */

import { preciseHbrCalculation } from './calculation.js';
import { createUnifiedFormulaCalculator } from '../shared/unified-formula-calculator.js';
import { LOINC_CODES, SNOMED_CODES, RXNORM_CODES } from '../../fhir-codes.js';
import { uiBuilder } from '../../ui-builder.js';
import { fhirDataService } from '../../fhir-data-service.js';

// ==========================================
// PRECISE-HBR 評分函數
// ==========================================

export const preciseHbr = createUnifiedFormulaCalculator({
    id: 'precise-hbr',
    title: 'PRECISE-HBR Score',
    description: 'Predicts bleeding risk in patients undergoing stent implantation.',
    infoAlert:
        'Uses the working score formula checked against 52 saved EOC Original observations. Score is rounded after summing all contributions. Displayed risk ranges are approximate, not EOC exact probabilities.',

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

    complexCalculate: preciseHbrCalculation,

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
                    ['≤ 22', 'Non-HBR', '0.5% ~ 3.8%'],
                    ['23 - 26', 'HBR', '4.2% ~ 5.5%'],
                    ['27 - 30', 'Very HBR', '6.0% ~ 8.1%'],
                    ['31 - 35', 'Extreme', '8.9% ~ 12.8%'],
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
