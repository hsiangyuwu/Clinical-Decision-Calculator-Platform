import { afterEach, describe, expect, test } from '@jest/globals';
import { preciseHbr } from '../../calculators/precise-hbr/index.js';
import {
    calculatePreciseHbrScore,
    getPreciseHbrOneYearRisk,
    PRECISE_HBR_MAX_IMPLEMENTED_SCORE
} from '../../calculators/precise-hbr/calculation.js';

describe('PRECISE-HBR UI hemoglobin units', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    test('12 g/dL and 120 g/L produce the same displayed score', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        container.innerHTML = preciseHbr.generateHTML();
        preciseHbr.initialize(null, null, container);
        // Let initialization finish before entering patient values; no FHIR client is used.
        await Promise.resolve();

        const input = (name: string) =>
            container.querySelector<HTMLInputElement>(`#precise-hbr-${name}`)!;
        for (const [name, value] of Object.entries({ age: 30, hb: 12, egfr: 100, wbc: 3 })) {
            input(name).value = String(value);
        }
        const hb = input('hb');
        hb.dispatchEvent(new Event('input', { bubbles: true }));

        const displayedScore = () =>
            container.querySelector('#precise-hbr-result .ui-result-score .ui-result-value')
                ?.textContent;
        const scoreInGramsPerDeciliter = displayedScore();
        expect(scoreInGramsPerDeciliter).toBe('10points');

        const toggle = hb.closest('.unit-converter-wrapper')!.querySelector('button')!;
        toggle.click();
        expect(toggle.textContent).toBe('g/L');
        expect(Number(hb.value)).toBe(120);
        expect(displayedScore()).toBe(scoreInGramsPerDeciliter);

        // Also exercise manually entered g/L and conversion back to g/dL.
        hb.value = '120';
        hb.dispatchEvent(new Event('input', { bubbles: true }));
        expect(displayedScore()).toBe(scoreInGramsPerDeciliter);
        toggle.click();
        expect(toggle.textContent).toBe('g/dL');
        expect(Number(hb.value)).toBe(12);
        expect(displayedScore()).toBe(scoreInGramsPerDeciliter);
    });
});

describe('PRECISE-HBR separately displayed score and individual bleeding risk', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    // Saved EOC observations; these do not validate clinical calibration.
    test.each([
        [2, 0.55],
        [7, 0.89],
        [22, 3.79],
        [23, 4.17],
        [26, 5.54],
        [27, 6.09]
    ] as const)('saved EOC score %s displays the recorded %s percent', (score, expected) => {
        expect(getPreciseHbrOneYearRisk(score)).toEqual({
            percent: expected,
            source: 'saved-eoc'
        });
    });

    test('estimated and unsupported scores are labeled distinctly', () => {
        expect(getPreciseHbrOneYearRisk(30)).toMatchObject({
            percent: 8.07,
            source: 'approximation'
        });
        expect(getPreciseHbrOneYearRisk(36)).toMatchObject({
            percent: 13.99,
            source: 'approximation'
        });
        expect(getPreciseHbrOneYearRisk(37)).toEqual({
            percent: null,
            source: 'unavailable'
        });
        expect(getPreciseHbrOneYearRisk(70)).toEqual({
            percent: null,
            source: 'unavailable'
        });
        expect(getPreciseHbrOneYearRisk(71).percent).toBeNull();
    });

    test('max of current score implementation is 70, not a 15% risk cap', () => {
        expect(PRECISE_HBR_MAX_IMPLEMENTED_SCORE).toBe(70);
        expect(calculatePreciseHbrScore(100, 0, 0, 100, true, true, true).score).toBe(70);
    });

    test.each([
        [12.3, '22', '3.79%', 'Non-HBR (Low Risk)'],
        [11.9, '23', '4.17%', 'HBR (High Risk)'],
        [10.7, '26', '5.54%', 'HBR (High Risk)'],
        [10.3, '27', '6.09%', 'Very HBR (Very High Risk)'],
        [9, '30', '~8.07%', 'Very HBR (Very High Risk)'],
        [8.6, '31', '~8.85%', 'Very HBR (Very High Risk)'],
        [7, '35', '~12.78%', 'Very HBR (Very High Risk)'],
        [6.6, '36', '~13.99%', 'Very HBR (Very High Risk)'],
        [6.2, '37', 'Not established (score > 36)', 'Very HBR (Very High Risk)']
    ] as const)(
        'Hb %s displays score %s and independent risk %s',
        async (hb, score, risk, group) => {
            const container = document.createElement('div');
            document.body.appendChild(container);
            container.innerHTML = preciseHbr.generateHTML();
            await preciseHbr.initialize(null, null, container);
            await Promise.resolve();

            for (const [name, value] of Object.entries({ age: 80, hb, egfr: 100, wbc: 3 })) {
                container.querySelector<HTMLInputElement>(`#precise-hbr-${name}`)!.value =
                    String(value);
            }
            container.querySelector('#precise-hbr-hb')!
                .dispatchEvent(new Event('input', { bubbles: true }));

            const result = container.querySelector('#precise-hbr-result')!;
            const item = (label: string) =>
                Array.from(result.querySelectorAll('.ui-result-score'))
                    .find(el => el.querySelector('.ui-result-label')?.textContent === label)
                    ?.querySelector('.ui-result-value')
                    ?.textContent?.trim();

            expect(item('Score')).toBe(`${score}points`);
            expect(item('Risk Group')).toBe(group);
            expect(item('1-Year Bleeding Risk')).toBe(risk);
            expect(result.classList.contains('show')).toBe(true);

            // Reference distinguishes the research score categories from UI subdivisions.
            const rows = Array.from(container.querySelectorAll('table tbody tr'));
            expect(rows.some(row => row.querySelector('td')?.textContent?.trim() === score)).toBe(
                Number(score) <= 36
            );
            expect(container.textContent).toContain('Maximum implemented score: 70');
        }
    );
});
