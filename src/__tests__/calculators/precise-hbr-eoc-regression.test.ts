import { afterEach, describe, expect, jest, test } from '@jest/globals';
import dataset from '../fixtures/precise-hbr-eoc-regression.json';
import {
    calculatePreciseHbrScore,
    preciseHbrCalculation
} from '../../calculators/precise-hbr/calculation.js';
import { preciseHbr } from '../../calculators/precise-hbr/index.js';

type Observation = (typeof dataset.cases)[number];
const numbers = (i: Observation['input']): Record<string, number> => ({
    'precise-hbr-age': i.age,
    'precise-hbr-hb': i.hemoglobin,
    'precise-hbr-egfr': i.egfr,
    'precise-hbr-wbc': i.whiteBloodCellCount
});
const radios = (i: Observation['input']): Record<string, boolean> => ({
    prior_bleeding: i.previousBleeding,
    oral_anticoagulation: i.longTermOralAnticoagulation,
    arc_hbr_plt: i.plateletCount,
    arc_hbr_diathesis: i.chronicBleedingDiathesis,
    arc_hbr_cirrhosis: i.liverCirrhosisWithPortalHypertension,
    arc_hbr_malignancy: i.activeMalignancy,
    arc_hbr_surgery: i.recentMajorSurgeryOrTrauma,
    arc_hbr_nsaids: i.chronicUseOfNsaidsOrCorticosteroids
});
const labels: Record<string, string> = {
    NON_HIGH: 'Non-HBR (Low Risk)',
    HIGH: 'HBR (High Risk)',
    VERY_HIGH: 'Very HBR (Very High Risk)'
};
const anyArc = (i: Observation['input']) =>
    Object.entries(radios(i)).some(([k, v]) => k.startsWith('arc_hbr_') && v);

describe('PRECISE-HBR saved EOC Original regression (not a new clinical validation)', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });
    test('preserves 42 training and 10 original holdout observations', () => {
        expect(dataset.algorithm).toBe('original');
        expect(dataset.cases).toHaveLength(52);
        expect(dataset.cases.filter(c => c.split === 'training')).toHaveLength(42);
        expect(dataset.cases.filter(c => c.split === 'holdout')).toHaveLength(10);
        expect(new Set(dataset.cases.map(c => c.caseId)).size).toBe(52);
    });
    describe.each(['training', 'holdout'])('%s source', split => {
        const cases = dataset.cases.filter(c => c.split === split);
        test.each(cases)('$caseId pure score equals saved EOC answer', c => {
            const i = c.input;
            expect(
                calculatePreciseHbrScore(
                    i.age,
                    i.hemoglobin,
                    i.egfr,
                    i.whiteBloodCellCount,
                    i.previousBleeding,
                    i.longTermOralAnticoagulation,
                    anyArc(i)
                ).score
            ).toBe(c.expectedEOC.score);
        });
        test.each(cases)('$caseId wrapper score/category equal saved EOC answer', c => {
            const values = numbers(c.input),
                flags = radios(c.input);
            const result = preciseHbrCalculation(
                id => values[id] ?? null,
                id => values[id] ?? null,
                name => (flags[name] ? '1' : '0')
            );
            expect(result).toMatchObject({
                score: c.expectedEOC.score,
                interpretation: labels[c.expectedEOC.riskCategory]
            });
        });
        test.each(cases)(
            '$caseId real unified UI score/category equal saved EOC answer',
            async c => {
                // Setup belongs to this assertion only. Pure/wrapper never depend on UI hooks.
                const container = document.createElement('div');
                document.body.appendChild(container);
                container.innerHTML = preciseHbr.generateHTML();
                await preciseHbr.initialize(null, null, container);
                await Promise.resolve();
                for (const [id, value] of Object.entries(numbers(c.input))) {
                    container.querySelector<HTMLInputElement>('#' + id)!.value = String(value);
                }
                for (const [name, value] of Object.entries(radios(c.input))) {
                    container.querySelector<HTMLInputElement>(
                        `input[name="${name}"][value="${value ? '1' : '0'}"]`
                    )!.checked = true;
                }
                container
                    .querySelector('#precise-hbr-egfr')!
                    .dispatchEvent(new Event('input', { bubbles: true }));
                const result = container.querySelector('#precise-hbr-result')!;
                const item = (label: string) =>
                    Array.from(result.querySelectorAll('.ui-result-score'))
                        .find(el => el.querySelector('.ui-result-label')?.textContent === label)
                        ?.querySelector('.ui-result-value')
                        ?.textContent?.trim();
                expect(item('Score')).toBe(`${c.expectedEOC.score}points`);
                expect(item('Risk Group')).toBe(labels[c.expectedEOC.riskCategory]);
                expect(result.querySelector('.ui-result-interpretation')?.textContent).toBe(
                    labels[c.expectedEOC.riskCategory]
                );
                expect(result.classList.contains('show')).toBe(true);
                // Existing ranges are presentation only: never compare them with exact EOC probability.
                expect(item('1-Year Bleeding Risk')).toMatch(/%/);
            }
        );
    });
    test('wrapper uses normalized Hb and never treats raw g/L as g/dL', () => {
        const getValue = (id: string) =>
            ({
                'precise-hbr-age': 30,
                'precise-hbr-hb': 120,
                'precise-hbr-egfr': 100,
                'precise-hbr-wbc': 3
            })[id] ?? null;
        const standard = jest.fn((id: string, unit: string) =>
            id === 'precise-hbr-hb' && unit === 'g/dL' ? 12 : null
        );
        expect(preciseHbrCalculation(getValue, standard, () => '0')?.score).toBe(10);
        expect(standard).toHaveBeenCalledWith('precise-hbr-hb', 'g/dL');
        expect(
            preciseHbrCalculation(
                getValue,
                () => null,
                () => '0'
            )
        ).toBeNull();
    });
});
