import { afterEach, describe, expect, test } from '@jest/globals';
import { preciseHbr } from '../../calculators/precise-hbr/index.js';

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

describe('PRECISE-HBR approximate bleeding-risk display contract', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    // Software display expectations, not new EOC observations or a probability model.
    test.each([
        [12.3, 22, 'Non-HBR (Low Risk)', '0.5% ~ 3.8%', '≤ 22'],
        [11.9, 23, 'HBR (High Risk)', '4.2% ~ 5.5%', '23 - 26'],
        [10.7, 26, 'HBR (High Risk)', '4.2% ~ 5.5%', '23 - 26'],
        [10.3, 27, 'Very HBR (Very High Risk)', '6.0% ~ 8.1%', '27 - 30'],
        [9, 30, 'Very HBR (Very High Risk)', '6.0% ~ 8.1%', '27 - 30'],
        [8.6, 31, 'Extreme Risk', '8.9% ~ 12.8%', '31 - 35'],
        [7, 35, 'Extreme Risk', '8.9% ~ 12.8%', '31 - 35'],
        [6.6, 36, 'Extreme Risk (Capped)', 'Upper limit ~15%', '> 35']
    ] as const)(
        'Hb %s -> unchanged score %s, category and specified range in the real UI',
        async (hb, score, group, risk, tableScore) => {
            const container = document.createElement('div');
            document.body.appendChild(container);
            container.innerHTML = preciseHbr.generateHTML();
            await preciseHbr.initialize(null, null, container);
            await Promise.resolve();

            for (const [name, value] of Object.entries({ age: 80, hb, egfr: 100, wbc: 3 })) {
                container.querySelector<HTMLInputElement>(`#precise-hbr-${name}`)!.value =
                    String(value);
            }
            container
                .querySelector('#precise-hbr-hb')!
                .dispatchEvent(new Event('input', { bubbles: true }));

            const result = container.querySelector('#precise-hbr-result')!;
            const item = (label: string) =>
                Array.from(result.querySelectorAll('.ui-result-score'))
                    .find(el => el.querySelector('.ui-result-label')?.textContent === label)
                    ?.querySelector('.ui-result-value')
                    ?.textContent?.trim();
            expect(item('Score')).toBe(`${score}points`);
            expect(item('Risk Group')).toBe(group);
            expect(result.querySelector('.ui-result-interpretation')?.textContent).toBe(group);
            expect(item('1-Year Bleeding Risk')).toBe(risk);
            expect(result.classList.contains('show')).toBe(true);

            const referenceRow = Array.from(container.querySelectorAll('table tbody tr')).find(
                row => row.querySelector('td')?.textContent?.trim() === tableScore
            );
            // Preserve the existing reference-table abbreviation for the capped row.
            expect(referenceRow?.querySelectorAll('td')[2]?.textContent?.trim()).toBe(
                risk.replace('Upper limit ', '')
            );
        }
    );
});
